# 世界表面与渲染基建 v2 设计

状态：**原始实施清单第 1–6 步已完成；第 7 步“编辑、持久化和消费系统”待实施**。对应阶段 A、B、C 前置、C1–C3、D、E、F，以及独立动态雾池、共享三档 LOD 地面晶格、连续水面、编译植被、统一 `LightingState` 和内部 `SurfacePresentationLayer` 垂直切片均已落地。本文描述下一代世界表面与渲染基建的目标结构；当前生产渲染仍以 [世界风格生成 v1](./world-style-generation-v1.md) 和 [渲染与流式加载](./render-streaming.md) 为准，v2 切换只在阶段 H 一次完成，不增加第二套生产开关。

实施 v2 时直接替换旧的数据和渲染热路径，不保留旧格式兼容、旧地形渲染 fallback 或两套生产实现。迁移完成并通过验收后，v1 文档转为历史记录，本文转为当前实现文档。

## 1. 最终结论

项目采用“权威语义数据 → 生效世界视图 → 可重建表面场 → 渲染层”的单向数据架构：

~~~text
WorldDescriptor v2
        │
        ├── BaseSemanticChunk 32×32 ── SparseSemanticDelta ─────────────┐
        │
        └── MacroDrainageGraph
                  └── HydrologyRegion 128×128 ── HydrologyFeatureDelta ─┤
                                                                       ▼
                                  EffectiveWorldView
                                唯一的运行时语义查询入口
                                           │
                                           ▼
                                SurfaceCompilationService
                                  Worker 中确定性编译
                                           │
                                           ▼
                              CompiledSurfaceChunk 16×16
                             CPU 量化表面场 + GPU 纹理层槽位
                                ┌──────────┼───────────┐
                                ▼          ▼           ▼
                             Ground      Water     Vegetation

DynamicFogStore ── 独立高频状态场 ── FogLayer
~~~

数值基底分为“世界格式”和“可重建编译配置”，两者不能混为一体：

| 层级 | v2 默认尺寸 | 契约归属 | 主要职责 |
|---|---:|---|---|
| 权威语义/source chunk | 32×32 格 | `WORLD_CHUNK_FORMAT_VERSION` | Worker 生成、SoA 数据、稀疏地形增量、导航摘要 |
| 水文区域 | 128×128 格 | `HYDROLOGY_REGION_FORMAT_VERSION` | 河网切片、湖盆、河口、跨区边界门和水体身份 |
| 表面编译/渲染块 | 16×16 格 | `SURFACE_COMPILE_PROFILE_VERSION` | 剔除、LOD、局部重编译、GPU 表面场层 |
| 近景表面场核心 | 64×64 texel | `SURFACE_COMPILE_PROFILE_VERSION` | 每个逻辑坐标间隔四个 texel，高度、材质、岸线、水深和流向 |
| 标准模拟块 | 64×64 格 | 应用模拟格式 | 默认实体驻留和后台模拟分区；不进入世界表面格式 |

当前已冻结的配置为 `SurfaceCompileProfile v1 = { renderChunkSize: 16, samplesPerTileInterval: 4, gutterTexels: 1, influenceRadiusTiles: 2, textureLayerSize: 66, pageLayers: 128 }`。64×64 核心每边增加一个采样 texel 的 gutter，得到 66×66 输出层；GPU 以 128 个同规格 layer 组成一页。编译器输入使用两格语义 halo；岸线距离和所有邻域核在两格处饱和，因而不会形成无限脏区。输入 halo 是临时快照，不进入权威 chunk，也不改变 chunk 归属。

32 与 128 是存档和生成格式；16、4 与 66 是可丢弃表面编译器的版本化常量。它们都不作为普通运行参数暴露，但后者可以在不改变 world identity 或存档的情况下随新的 compile profile 升级。特别是：

- 128×128 只负责低频宏观水文，不直接成为渲染或编辑重建单元。
- 单格编辑最多使相交的 16×16 渲染块及两格影响半径相交的邻块变脏。
- 32×32 source chunk 不再沿用当前基于正方形 `loadRadius` 的整圈加载；需求集合按区块 AABB、预测走廊和字节预算精确计算。
- 导航直接复用 32×32 语义边界；模拟默认 64×64，但尺寸与驻留策略由应用模拟层拥有，与镜头及表面编译器无关。

## 2. 为什么替换当前结构

当前 v1 已解决确定性生成、基础地表高度、12×12 渲染块 LOD、资源预算和稀疏编辑，但继续扩展会遇到以下结构性限制：

1. 16 位 packed tile 适合保存离散地形类别，却无法自然承载连续材质、水深、流向和水体身份。
2. 主线程挂载时仍会通过 `WorldSurfaceView` 重复解析 relief、biome 和邻域贡献。
3. `TerrainMesh` 同时承担几何、材质、岸线、海面、湖泊、编辑刷新和多组 attribute，职责与 shader 分支持续增长。
4. 湖泊仍接近“格子被挖成水”，地面、水面和岸线没有独立连续表示。
5. 河流若继续作为格子 modifier，会在宽度、曲率、汇流、入海和跨区连续性上不断增加特殊规则。
6. 当前编辑刷新只有粗粒度类别，无法准确表达高度、水体、植被、导航或雾分别变脏。
7. 逐 hex 细分几何共享了 base geometry，但 GPU 仍需为每个实例执行全部细分顶点。
8. 内置 terrain、water、grass 和 forest 虽已注册为渲染层，真实资源所有权和调度仍部分集中在 `HexMap`。

v2 继承 v1 的确定性和风格目标，但不承诺相同种子继续生成相同格子；它同时重写结果的权威格式、编译与渲染方式，并补上连续水体和统一光照所需的语义基础。

## 3. 目标与非目标

### 3.1 目标

1. 世界生成、编辑、导航、贴地查询和渲染读取同一份权威语义。
2. 河流、湖泊和海洋拥有稳定水体身份、连续几何、深浅、流向与岸线距离。
3. 地面使用合并区块网格，显著减少逐 hex 顶点调用和 attribute 数量。
4. 主线程只挂载、上传和调度，不重复运行生成器或大范围表面解析。
5. 单格或局部编辑只重编译固定小范围，并通过版本令牌拒绝过时 Worker 结果。
6. CPU 与 GPU 对宏观高度、水位、岸线和格子归属使用同一量化与插值契约。
7. 当前 16/32/128 各层完全对齐，负坐标、环绕世界、浮动原点和 LOD 边界无缝；模拟分块不参与这一渲染不变量。
8. 静态世界、无限程序世界和环绕程序世界通过相同 `WorldSource` 语义接口进入编译器。
9. 所有缓存都有字节预算，所有派生数据都可丢弃并确定性重建。
10. WebGL2 继续作为唯一生产后端，编译结果不直接依赖 Three.js 对象。

### 3.2 非目标

- 不模拟完整降雨、侵蚀、地下水和真实流体力学。
- 不让渲染微波浪、法线噪声或反射结果成为玩法权威。
- 不建设可容纳道路、电网、国界等一切内容的万能 Feature 系统。
- 不把 128×128 水文区域整块上传为地形纹理或整块重建。
- 不在 v2 同时迁移 WebGPU。
- 不保留 v1 packed chunk、12×12 terrain path 或自由字符串 modifier 的运行时兼容层。
- 不让调用方任意拼装 chunkSize、采样密度或纹理页参数；新的编译配置必须作为整体 profile 经过验证和版本化。

## 4. 坐标、拓扑与分块契约

### 4.1 坐标

所有权威数据使用逻辑六边格坐标。分块坐标统一使用数学向下取整：

~~~ts
chunkX = floor(tileX / chunkSize);
chunkY = floor(tileY / chunkSize);
localX = tileX - chunkX * chunkSize;
localY = tileY - chunkY * chunkSize;
~~~

不得用 JavaScript `%`、位运算或截断除法替代上述规则，因为它们对负坐标或超过 32 位的坐标不等价。分块键使用两个安全整数，不在热路径拼接字符串。

逻辑坐标决定生成、编辑、随机相位和缓存身份；浮动原点只影响场景对象的局部变换，不进入任何语义或编译结果。

### 4.2 拓扑

- 无限世界允许任意安全整数坐标。
- 程序化环绕世界的宽和高必须是 32 的正整数倍，最小为 32；这保证 semantic/render chunk 完整对齐，并自然满足六边格横向偶数周期。宽高不必是 128 的倍数，末端水文 region 使用显式 valid bounds；穿过 topology seam 的排水边生成可连接到同区或另一末端区的 canonical port。环绕水文闭合由完整 `MacroDrainageGraph` 保证，而不是靠 region 尺寸偶然对齐。
- 静态有限世界可以不是 128 的倍数，最外层语义块和水文区使用显式有效 bounds，不读取 bounds 外数据。
- 环绕世界在分块、随机采样和 feature ID 生成前先规范化坐标；相对距离使用最短环绕距离。

### 4.3 对齐关系

所有分块从逻辑原点 `(0, 0)` 对齐。一个上层区域必须完整包含整数个下层块，不允许按调用方起点重新对齐。

~~~text
HydrologyRegion 128
└── 4×4 SemanticChunk 32
    └── 2×2 RenderChunk 16
        └── 64×64 core surface texels
~~~

一个渲染块跨越水文边界时，编译器按空间索引读取相交 feature；由于 128 是 16 的整数倍，正常块不会跨水文边界，只有 halo 可能读取相邻区域。

## 5. 权威语义数据

### 5.1 BaseSemanticChunk

权威语义块使用 Structure of Arrays，核心区域固定 32×32，不保存 halo：

~~~ts
interface BaseSemanticChunk {
    readonly key: SemanticChunkKey;
    readonly revision: number;
    readonly validBounds: LocalTileBounds;

    readonly substrateClass: Uint8Array;
    readonly macroHeight: Uint16Array;
    readonly biomeWeights: Uint8Array;
    readonly climate: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationProfile: Uint8Array;
}
~~~

数组布局固定为 X-major 或 Y-major 中的一种，由 chunk format 锁定；所有模块只能通过共享索引函数访问，不各自重写下标公式。

字段语义：

| 字段 | 布局 | 语义 |
|---|---|---|
| substrateClass | 1× `Uint8`/格 | 基础地质/地表基底枚举；不编码水体、坡度或通行性 |
| macroHeight | 1× `Uint16`/格 | 归一化、量化的权威宏观地表高度 |
| biomeWeights | 4× `Uint8`/格 | 四个材质/生态权重，解码后归一化 |
| climate | 2× `Uint8`/格 | 温度与湿度，供植被和后续玩法查询 |
| vegetationDensity | 1× `Uint8`/格 | 区域植被密度，不是实例列表 |
| vegetationProfile | 1× `Uint8`/格 | descriptor 冻结的生态组合索引，可按权重产生多个物种 |

权威字段只保存不能从其他权威字段唯一推出的基础事实。坡度、湿岸、材质输出、水深、`ocean/lake/river` 分类和默认通行性均为派生结果，不回写 semantic chunk。若应用需要人为禁止通行，使用独立、显式的 navigation override section；它不能伪装成 `substrateClass`，也不能改变渲染水体身份。

海洋不通过一个独立 mesh modifier 表示。低于冻结海平面的有效宏观地表形成基础海域；湖盆与河流来自水文区域。按格派生出的水体结果属于查询缓存，不与水文 feature 形成第二份权威。

所有数组长度、枚举范围、权重和量化值在发布到 Store 前一次性校验。对象式 `getTile()` 仅作为按需只读视图存在，不在生成、编译、导航或渲染热路径保存大量对象。

### 5.2 生成与量化

`WorldSurfaceResolver` 保留纯生成规则职责，但输出一次量化写入 `BaseSemanticChunk`。主线程不再为了渲染重新调用 resolver。`substrateClass`、biome profile 和 vegetation profile 的索引表由 descriptor/schema version 冻结；调整索引含义必须升级生成器或 chunk format，不能仅替换资源文件后继续解释旧索引。

量化规则由生成器版本和 chunk format 共同冻结：

- 相同 descriptor 与坐标得到逐字节相同的 semantic chunk。
- 结果与请求顺序、Worker 数量、source chunk 是否命中缓存无关。
- 邻块共享边界使用相同全局采样点和舍入规则。
- 量化发生在权威数据入口，不允许每个消费者自行将浮点结果转成不同精度。

`macroHeight` 表示玩法和渲染共享的宏观表面。Shader 可以添加受限的纯视觉微位移，但城市、单位、树木、路线、拾取和导航不需要复现水波或微法线。

### 5.3 静态世界

`StaticWorldSource` 在加载边界把 `MapInfo` 编译为相同的 32×32 SoA chunk，并把静态河流、湖泊和河口编译成相同的基础 hydrology feature/region。静态来源可以没有程序种子，但必须提供确定的基础高度、水体和植被解释；它不能把静态湖泊重新塞进 `substrateClass`。进入 `EffectiveWorldView` 后，渲染层不区分静态与程序世界。

## 6. 水文区域与水体权威

### 6.1 唯一权威层级

水体权威固定为：

~~~text
海平面 + 有效宏观高度         MacroDrainageGraph
        │                    全局有向排水骨架
        │                           │
        │                  HydrologyRegion 基础切片
        │                           │
        │                  HydrologyFeatureDelta
        └──────────────┬────────────┘
                       ▼
             EffectiveHydrologyWindow
                       ▼
              DerivedHydrologyRaster
       coverage / kind / level / flow / body index
                       ▼
               CompiledSurfaceField
~~~

`MacroDrainageGraph` 决定生成世界中的下游关系、汇流、终点和稳定 ID；`HydrologyRegion` 只是它按 128×128 空间范围裁出的基础格式。用户编辑的完整河流或湖泊由 `HydrologyFeatureDelta` 覆盖。禁止同时持久化可编辑 spline 和逐格河流占用、下游方向、流量两份权威；逐格结果只能是可丢弃查询缓存或编译产物。

基础排水图只读取 descriptor 与不可变 `BaseSemanticChunk.macroHeight` 量化域，不因运行时高度 delta 自动重生成。程序化 Worker 允许在生成 base chunk 之前融合执行同一个 `quantizeMacroHeight` 原语，避免仅为低分辨率排水点物化其他 SoA 通道；融合采样值必须与对应 `BaseSemanticChunk.macroHeight` 逐值相同，不能成为第二套高度算法。静态来源必须显式提供不可变的宏观高度源。有效高度只参与当前海岸 coverage、水深和地形/显式水文冲突校验；需要改道时必须走第 13 节定义的 coupled edit 或显式 rebake。

### 6.2 MacroDrainageGraph

边界端口不能自行决定全局河网。生成器先在低分辨率宏观水文格上建立确定性的有向排水图，再把图转换为湖盆、河流和河口 feature。每个排水节点至少具有稳定 node ID、量化位置、下游 node、终点 water-body ID、`drainageRank` 和 `dischargeClass`。

冻结不变量如下：

- 每条下游边都使非负整数 `drainageRank` 严格下降，因此有向图不可能成环，任一路径都在有限步内到达终点。
- 终点只能是基础海域或显式湖盆；局部最低点若不通海，必须生成稳定湖盆，不能留下无类型死点。
- 汇流出口的 `dischargeClass` 不小于任一入口；宽度剖面由该等级和稳定局部参数派生。
- 图的节点、边、终点和流量与区域请求顺序、当前已加载邻区和 Worker 数量无关。
- boundary port 由排水边与 region 边界的交点产生；端口是图的序列化切口，不是通过边键随机创造河流的来源。

有限和环绕世界在低分辨率上生成完整排水图后再分区，成本与渲染分辨率无关。当前格式使用 16 格宏观间隔，完整有限图最多采样 16384 个节点；超过该上限确定性失败，不能静默降低采样密度。无限世界按从逻辑原点对齐的 2048×2048 有限流域分解，每个流域固定采样 128×128、最多 16384 个宏观位置。一个 128×128 region 只依赖其所属的一个流域。

每个陆地连通分量只选择一个按量化高度和规范节点序确定的海岸出口参与 priority-flood；其他海面样本仍由冻结海平面形成基础海域，但既不传播局部排水，也不进入公开排水图。没有海岸出口的分量使用稳定最低点建立显式湖盆；足够大且到出口有足够图距离的分量还会在远端局部低点建立显式内陆湖盆。海岸出口只通过一个规范陆地入口传播，因而一个分量不会在同一出口产生多条末端河口边。所有其他陆地节点只连接到已经确定的下游父节点；父子 `drainageRank` 相差至少一，故路径最多经过 16383 条边并必然到达选定海洋出口或显式湖盆。被动海面样本不会占用序列化节点、边和终点预算；流域之间没有隐式递归依赖，也不会读取已加载邻区。

### 6.3 HydrologyRegion

每个 128×128 区域保存有界的矢量水体特征：

~~~ts
interface HydrologyRegion {
    readonly key: HydrologyRegionKey;
    readonly revision: number;
    readonly validBounds: HydrologyRegionLocalBounds;
    readonly boundaryPorts: readonly HydrologyPort[];
    readonly rivers: readonly RiverFeatureSegment[];
    readonly lakes: readonly LakeFeature[];
    readonly mouths: readonly RiverMouthFeature[];
    readonly bodies: readonly HydrologyBodyRef[];
}

interface RiverFeatureSegment {
    readonly riverId: HydrologyFeatureId;
    readonly segmentId: HydrologySegmentId;
    readonly edgeId: HydrologyEdgeId;
    readonly controlPoints: Int16Array;
    readonly widthProfile: Uint8Array;
    readonly levelProfile: Uint16Array;
    readonly dischargeClass: number;
    readonly entry: RiverEndpoint;
    readonly exit: RiverEndpoint;
}

interface HydrologyBodyRef {
    readonly bodyId: HydrologyBodyId;
    readonly kind: "ocean" | "lake" | "river";
    readonly profileIndex: number;
}
~~~

控制点相对区域原点量化。同一条河跨区时共享稳定 `riverId`，各段使用独立 `segmentId` 并通过 boundary port 连接；不把一条长河复制到所有经过区域。基础 region 只能由 `MacroDrainageGraph` 裁剪产生，不能根据当前邻区内容二次猜测连接。

### 6.4 水体身份

- **海洋**：所有由冻结海平面形成的基础海域使用保留的 `OCEAN_BODY_ID`。v2 不对无限世界执行依赖加载范围的海洋连通块编号；若以后玩法必须区分多个海盆，需要升级水文格式。
- **湖泊**：每个湖盆拥有稳定 body ID、水位和 profile；跨 region 的湖泊在各切片中引用同一 ID。
- **河流**：稳定 `riverId` 同时是河流水体 ID；同一河流的各 segment 不产生新的 body ID。
- **河口**：显式记录河流 body 与目标海洋/湖泊 body，覆盖混合区根据确定规则从河流身份切换到目标身份。

`DerivedHydrologyRaster` 使用紧凑的局部 body index，配套只读 body palette 映射到稳定 ID、水位和 profile。CPU 查询返回稳定 ID；GPU 只读取 kind/profile 等着色索引，不上传或比较完整 feature ID。

### 6.5 跨区域确定性

相邻区域对公共边使用同一个规范化边键定位由排水图产生的 crossing。边键的唯一拥有者序列化 boundary port；两侧必须得到完全相同的端点、方向、宽度等级、流量等级、连接 ID 和 body ID。

区域内部河段从固定宏观排水边和端口约束重建，不读取“当前已经加载的邻区”。汇流只允许流量增加，河口必须连接海域、湖泊或下一段有效端口。发现 rank 不下降、孤立出口、重复 feature ID 或边界不匹配时生成失败，不用局部伪河或断头贴图降级。

### 6.6 海洋、湖泊和河流

- **海洋**：由冻结海平面与连续宏观高度场形成，可跨任意数量区域；海岸不是逐格 polygon。
- **湖泊**：由水文区域的盆地 feature 给出连续边界、水位和稳定 water-body ID；地面仍在湖面下连续存在。
- **河流**：由中心样条、宽度剖面、流量等级和流向形成带状水体；渲染宽度提高不会修改权威格子数据。
- **河口**：显式连接河流与海洋或湖泊，负责宽度过渡、流向衰减和材质混合。

这不是完整水文模拟，但必须保证长河、汇流、入海和跨区连续。

### 6.7 空间索引与预算

每个区域在加载后构建可丢弃的紧凑只读空间索引；索引不进入权威格式。查询 16×16 渲染块时只返回与块 bounds 加固定 halo 相交的 feature，不扫描区域全部河流。

生成器必须限制单区域 feature 数、控制点数和序列化字节。超出冻结上限是生成错误，需要修正规则或升级版本，不能静默截断造成跨区断流。

## 7. 生效世界视图与稀疏增量

### 7.1 合并顺序

运行时唯一语义结果为：

~~~text
BaseSemanticChunk
  + SparseSemanticDelta
  + HydrologyRegion
  + HydrologyFeatureDelta
  = EffectiveWorldView
~~~

`EffectiveWorldView` 不复制整个世界。无修改 chunk 直接引用基础 SoA；存在修改时通过紧凑覆盖表、feature 空间索引和版本化快照生成编译输入。每个快照具有唯一 `effectiveRevision`，所有查询缓存和编译结果都必须声明它们对应的依赖令牌。

渲染、导航、贴地、植被放置和公开查询都从该视图读取，不允许直接绕过它读取生成器或 delta store。

### 7.2 增量职责

语义增量按 32×32 chunk 保存：

- 高度与 substrate 类别；
- 材质/biome 权重；
- 植被密度与 profile；
- 与应用有关、但不属于 surface compiler 的可选格子 section。

水文编辑按稳定 feature ID 保存完整记录，而不是把一条河的多个区域切片当成多份权威：

- 新增、修改和删除湖盆；
- 新增、修改和删除河流 feature；
- 水位、宽度剖面、河口和连通关系修改。

修改生成河流时，delta 以稳定 river ID 覆盖或 tombstone 全部基础 segments。完整河流记录必须包含 source、outlet body/river、控制点、宽度、level profile、流向和 discharge class；事务在 Effective Hydrology Graph 上验证无环、level 不逆升和 outlet 合法。feature 与 region 的相交表、裁剪 segment 和逐格 coverage 都是可重建索引，不写回 semantic delta，也不成为第二份权威。

调用方提交世界坐标中的完整河流或湖泊，不手工维护区域分段。`WorldDeltaStore` 原子提交一个包含 semantic 与 hydrology mutations 的 revisioned transaction record；Store 可以使用原生事务，也可以原子追加单个 commit record 后异步物化 chunk/region 索引。读取方只观察已提交 revision，不能看到半条新河和半条旧河。单个 feature 修改使用 expected feature revision CAS；跨多个 feature 的事务以整个 commit 的 expected revision set 校验，任一冲突则整体失败。

commit record 是原子可见性边界，不要求永久保留完整操作历史。Store 在 save barrier 下把已提交 semantic mutations 折叠进 chunk delta、把 hydrology mutations 折叠进 feature record/tombstone；只有新快照和索引持久化成功后才能回收旧 commit。统计和预算必须包含待压缩 commit 字节，避免长期编辑使日志无界增长。

当前已实现的读模型把持久化事务与运行时发布边界分开：

- `SparseSemanticDelta` 使用严格递增的 X-major `Uint16` tile index、逐项 field mask 和紧凑 SoA 列。未被 mask 使用的槽位必须为零；biome 权重仍严格合计 255。它只覆盖 substrate、macro height、biome 权重和 vegetation density/profile，冻结 climate 继续直接读取 base chunk。
- `HydrologyFeatureDelta` 是完整 river/lake record 或 feature tombstone。河流保存世界坐标控制点、source、outlet、宽度/水位剖面和 discharge；湖泊保存完整边界、水位和 profile。完整 record 只在快照中保存一次，`HydrologyRegionFeatureIndex` 只保存相交 feature ID，是可重建索引而非第二份 feature 权威。
- `EffectiveDeltaSnapshot` 是某个 world identity 下一个完整、不可变的已提交增量层。创建边界复制 delta typed arrays、规范排序 chunk/feature/region index，并要求局部 revision 不超过 `effectiveRevision`；revision 0 只允许空层。
- `EffectiveWorldView.publishDeltaSnapshot(next, expectedRevision)` 先做 world identity 与 CAS 校验，再要求 revision 恰好加一，最后用一次指针替换同时发布 snapshot 和预构建查找表。捕获方只读取一次该指针，因此不会观察到新旧 semantic/hydrology 各一半；旧 `EffectiveWorldSnapshot` 继续稳定引用旧增量对象。
- `capture()` 只组合调用方提供的 base chunk/region，不扫描或复制整个基础世界；无修改 chunk 直接引用原 `BaseSemanticChunk` SoA。partial chunk 外的 override、非 canonical 环绕 key、重复依赖和未被任何 region index 引用的 hydrology feature 都确定性失败。

本阶段不实现 `WorldDeltaStore` v3、编辑事务、feature 拓扑 CAS 或持久化压缩；这些仍属于阶段 G。现有 v1 `WorldDeltaStore`/`WorldSurfaceView` 使用旧 chunk 和 tile override 契约，不能作为 v2 生效视图的兼容层或 fallback。

### 7.3 只读查询

公共便利 API 可以返回结构化对象：

~~~ts
interface EffectiveTileView {
    readonly substrate: SubstrateKind;
    readonly height: number;
    readonly biomeWeights: readonly [number, number, number, number];
    readonly vegetation: VegetationView;
    readonly navigation: NavigationSemantics;
    readonly water?: WaterQueryResult;
}

interface WaterQueryResult {
    readonly bodyId: HydrologyBodyId;
    readonly kind: "ocean" | "lake" | "river";
    readonly level: number;
    readonly depth: number;
    readonly flow: ReadonlyVec2;
}
~~~

这些对象按需创建，不能在 resident map 中逐格常驻。批量系统使用 typed-array window 或迭代器。

## 8. 表面场编译器

### 8.1 输入与输出

`SurfaceCompilationService` 为每个 16×16 渲染块建立不可变编译请求：

~~~ts
interface SurfaceCompileRequest {
    readonly key: RenderChunkKey;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly requestToken: SurfaceRequestToken;
    readonly effectiveWindow: TransferableEffectiveWindow;
}

interface SurfaceCompileResult {
    readonly requestToken: SurfaceRequestToken;
    readonly chunk: CompiledSurfaceChunk;
}

interface CompiledSurfaceChunk {
    readonly key: RenderChunkKey;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly bounds: CompiledSurfaceBounds;
    readonly field: CompiledSurfaceField;
    readonly waterBodies: CompiledWaterBodyPalette;
    readonly waterGeometry: CompiledWaterGeometry;
    readonly vegetationSeeds: CompiledVegetationSeeds;
}

interface ResidentSurfaceLease {
    readonly requestToken: SurfaceRequestToken;
    readonly effectiveRevision: number;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly chunk: CompiledSurfaceChunk;
    readonly released: boolean;
    isCurrent(): boolean;
    release(): boolean;
}
~~~

`SurfaceDependencyKey` 是可跨任务和同 world session 缓存复用的内容身份，精确包含 world identity、render key、compile profile/compiler revision，以及按规范顺序排列的 semantic chunk、hydrology region 和 hydrology feature key/revision。内容 hash 只能加速查找，不能代替完整结构化依赖作正确性判断。

`SurfaceRequestToken` 是 service 为一次挂载需求签发的 `{ sessionEpoch, renderChunkGeneration }` 不透明令牌，只用于拒绝迟到 Worker、上传和挂载结果，不进入内容缓存键。Worker 结果必须同时满足“request token 仍是该 render chunk 当前令牌”和“compiled dependency key 等于当前依赖”；任一不匹配都丢弃。

当前已实现 `SurfaceDependencyKey`、`SurfaceDependencyBinding`、`SurfaceRequestTracker`、`TransferableEffectiveWindow` 和纯 CPU `compileSurfaceChunk`。依赖键保存完整规范 world identity、canonical 16×16 render key、compiler/profile 版本、排序后的 semantic base/delta revision，以及 hydrology base 和实际参与该窗口的 feature revision；同 region 内不相交 feature 不进入依赖键。序列化字符串只用于缓存查找，命中后仍执行结构化逐项比较。`effectiveRevision` 保存在 binding/编译结果/lease 而不进入内容键：无关区域提交可以提升全局 revision，同时继续复用局部输入逐项相同的编译内容；相关依赖变化一定改变内容键。

tracker 在一个 `sessionEpoch` 内使用全局严格递增的 `renderChunkGeneration`，只为当前活动 render key 保留 token。release 后重新挂载不会把 generation 重置为 1，因而不存在同 session ABA；新世界 session 必须使用新 epoch。结果接收同时校验 canonical render key、world identity、当前 token 和结构化 dependency key。缓存命中或旧 revision 的任务若局部依赖仍相同，可以用当前 token/effective revision 创建新 lease；不能把旧 token 本身带入 lease。

当前 `SurfaceCompilationService.request(snapshot, renderKey)` 同步返回含 key、request token、结果 Promise 和 cancel 的请求句柄。结果是显式的 `ready + lease` 或 `stale` discriminated union；Worker/预算/协议错误才 reject。compiled CPU cache 命中时不修改缓存对象，而是先比较完整 dependency key，再用当前 request token 和 effective revision 创建新的 `ResidentSurfaceLease`。查询和 Layer 持有 lease，不直接把无会话 token 的缓存对象视为当前结果。cache 只按精确 typed-array 字节预算淘汰无 lease 的 LRU 项；预算被活动 lease 占满时直接拒绝新结果，不暗中驱逐仍在使用的字段。

请求快照包含 16×16 核心区、两格语义 halo 和按 feature 宽度再加两格影响半径筛选的相交水文 feature。当前 `createTransferableEffectiveWindow` 严格要求调用方提供精确的 semantic chunk/hydrology region 集合，生成 20×20 X-major semantic SoA，并复制所有 typed arrays；转移它不能 detach `BaseSemanticChunk`、delta 或任何 resident 权威数组。河流和湖泊在窗口内按最短环绕位移展开，base/delta/tombstone 先合成为最终记录。`SurfaceCompilationService` 可从有显式 retained-byte 预算的 exact-size buffer pool 构建这些副本；Worker 无论成功还是可恢复失败都会把输入 ArrayBuffer 转回主线程。`requestBatch` 接受一次捕获的共享并集快照，并在提交前为每个 render chunk 派生精确依赖子快照；相同 dependency 的并发请求共享一个 Worker job，但不同 render chunk 始终拥有独立 token、缓存键和失效范围。

当前 CPU 结果固定包含 canonical key、结构化 dependency key、effective revision、有效/高程/水位 bounds、十个量化字段、chunk-local body palette、`CompiledWaterGeometry`、`CompiledVegetationSeeds`、精确 typed-array 字节数与确定性 checksum。地面 topology 不属于逐块编译结果；近、中、远三张平面三角晶格由所有 GroundLayer chunk 共享。`CompiledWaterGeometry` 使用 `none | full | coverage | sweep` discriminated union：全水块复用共享 patch，coverage 与 sweep 才携带逐块顶点/索引。植被以 `(render key, tileIndex, candidateIndex)` 作为稳定身份并使用 SoA 列保存坐标、高度、物种、缩放和旋转。所有这些派生 buffer 都在 Worker 内一次生成并进入同一 checksum、缓存记账和 transferable 列表。

### 8.2 SurfaceLatticeSpec

表面场不把每个 hex 单独切成私有小纹理，而是在当前偶列偏移六边格上定义连续、全局定相的逻辑表面坐标。CPU 编译固定在 `h = 1` 的 canonical 平面度量中运行，渲染器之后统一应用水平显示尺度；调用方不能改变编译结果的距离单位。令 `h = hexSize`，逻辑 tile 中心为整数 `(x, y)`：

~~~ts
columnStagger(column) = positiveModulo(column, 2) === 0 ? 0.5 : 0.0

k = floor(u)
t = u - k
stagger(u) = lerp(columnStagger(k), columnStagger(k + 1), t)

surfaceToWorld(u, v) = {
    x: 1.5 * h * u,
    z: sqrt(3) * h * (v + stagger(u))
}

worldToSurface(x, z) = {
    u: x / (1.5 * h),
    v: z / (sqrt(3) * h) - stagger(x / (1.5 * h))
}
~~~

因此 `surfaceToWorld(tileX, tileY)` 与当前 `getHexCenter(tileX, tileY, h)` 完全一致，同时 `(u,v)` 在列之间连续。所有 `floor` 和 parity 都使用数学负坐标语义，不使用截断除法。

对 render chunk `(cx, cy)`，令 `x0 = 16 * cx`、`y0 = 16 * cy`、`S = 4`。核心 texel `(i,j)`，其中 `0 <= i,j < 64`，采样于：

~~~ts
u = x0 - 0.5 + (i + 0.5) / S
v = y0 - 0.5 + (j + 0.5) / S
~~~

gutter 使用完全相同公式，只令 `i,j` 扩展到 `[-1, 64]`，因而物理层为 66×66。相邻块在公共边两侧拥有相同的两个 texel 中心，手动插值公共边时得到逐位相同的输入；不需要额外保存第 65 个“边界顶点”。render chunk 的几何核心域是半开区间 `[x0 - 0.5, x0 + 15.5) × [y0 - 0.5, y0 + 15.5)`，最外侧绘制边界由唯一 owner 规则闭合。

高度、水位、材质、SDF 和 flow 都先在 `(u,v)` 中定位相邻 texel，再用共享函数手动插值。网格、CPU 查询、轮廓提取和 shader 不得各自重写 `surfaceToWorld`、texel phase、边界 owner 或三角对角线规则。当前 `SurfaceLattice` 已冻结正坐标、负坐标、chunk owner 与相邻块公共边测试向量；相邻块重复保存的两列/两行 gutter 在独立编译后逐字节一致。环绕接缝先在 effective window 展开为最短 canonical 邻域，再走同一 lattice 公式。

### 8.3 逻辑字段

逻辑字段布局：

| 字段 | CPU 量化表示 | GPU 表示 | 用途 |
|---|---|---|---|
| groundHeight | binary16 bits in `Uint16` | `R16F` | 地面顶点高度和 CPU 贴地 |
| materialWeights | 4× `Uint8` | `RGBA8` | 连续地表材质混合 |
| waterLevel | binary16 bits in `Uint16` | `R16F` | 独立水面高度 |
| waterDepth | binary16 bits in `Uint16` | `R16F` | 深浅色、透明度和玩法查询 |
| shorelineDistance | binary16 bits in `Uint16` | `R16F` | 陆水过渡、泡沫、湿岸 |
| flow | 2× `Int8` | `RG8_SNORM` | 河流与局部波纹方向 |
| waterCoverage/kind/profile | 3× `Uint8` | 物理打包 | 水面覆盖率、分类与着色 profile |
| waterBodyIndex | 1× `Uint8` | 不直接上传 | 映射到 chunk-local body palette，0 表示无水 |

浮点字段的 CPU 数组保存 IEEE 754 binary16 原始位，CPU 通过共享解码器读取，GPU 原样上传为 half-float texel。Shader 对参与宏观几何和查询一致性的字段使用 `texelFetch` 后手动插值，不依赖厂商纹理过滤舍入或可选的浮点线性过滤扩展。

`shorelineDistance` 的数值是经 `surfaceToWorld` 度量的带符号世界平面欧氏距离，不是 texel 数、hex 步数或 `(u,v)` 曼哈顿距离；陆侧为正、水侧为负。`flow` 解码为世界 XZ 平面的单位方向，水深与水位使用世界高度单位。这样改变 hexSize 或局部 lattice 斜率不会改变泡沫宽度和河流方向语义。

每个 compiled chunk 的 body palette 最多包含 255 个在 66×66 输出层实际出现的水体；超过上限是 feature 预算或编译错误，不能合并 ID。palette 只保存稳定 `bodyId + kind`，`waterProfile` 必须逐 texel 保存，因为同一 river body 的 discharge/profile 可以沿汇流向下游变化。物理纹理在不改变逻辑字段的前提下按第 9 节固定合并通道，合并方案由 `SURFACE_COMPILER_REVISION + SURFACE_COMPILE_PROFILE_VERSION` 锁定。十个 X-major field arrays 对 4,356 texel 固定占用 78,408 字节；完整 compiled chunk 再按实际 coverage/sweep geometry 和 vegetation seed SoA 字节精确记账，因此总 `byteLength` 是确定但可变的。binary16 使用共享、ties-to-even 的 IEEE 754 编解码器。单个 GPU layer 固定占用 74,052 字节。

动态战争迷雾不进入该静态表面层。当前 `SurfaceFogTexturePool` 使用独立的 16×16 `R8` array texture，每格一个 texel；一层 256 字节，一页 128 层、32,768 字节，并拥有独立预算、CPU backing store、标脏、代际校验和 context restore 状态。fog layer 复用 `SurfaceTextureSlotHandle` 的 pool/page/layer/generation 作为显式关联，但不占用静态 surface 的 66×66 layer；`GroundLayer` 总是先释放 fog companion 再释放 surface slot。直接操作两个池的低层调用方必须遵守相同顺序，也可用 `pruneReleasedSurfaceSlots()` 清理已释放的 surface 代际。权威 fog state 仍由 fog store 保存，GPU layer 只可重建。

### 8.4 连续岸线与地形

编译顺序固定为：

1. 从量化宏观高度重建连续地面基底。
2. 应用有效高度编辑，并在编辑边缘使用确定性 falloff。
3. 栅格化海平面、湖盆和河流 feature，得到 coverage、kind、profile 与局部 body index。
4. 计算带符号岸线距离、独立水位和水深。
5. 根据坡度、气候、湿岸距离和 biome 得到材质权重。
6. 量化 CPU 字段并计算保守 bounds。
7. 根据核心 coverage 判定 `none/full`，对湖泊和宽河编译固定对角线 coverage mesh，对量化宽度不超过 24 的纯窄河窗口编译显式 sweep mesh。
8. 从 world identity、全局 tile 坐标和固定 candidate index 生成植被 seeds，并用水体、坡度、连续岸线 SDF、密度和 profile 做确定性筛选。
9. 对 field、body palette、水面 geometry 和植被 SoA 共同计算精确字节数与确定性 checksum。

水面 geometry 和植被种子是可重建的编译产物，不是权威世界数据；它们从 compiler revision 2 起参与 compiled cache identity 和 Worker transferable 输出。16/4/66 纹理 profile 仍为 v1，没有因派生 presentation buffer 改变。

湖泊不再把整格地面删除。水下地面保持连续，岸边由水体 coverage 与地面高度相交形成；湿岸、沙滩、浅水色和泡沫都读取同一 shoreline distance，因此不会出现四套不同边界。

`shorelineDistance` 在 canonical 平面距离 `SURFACE_INFLUENCE_RADIUS_TILES = 2` 处饱和。为了让 66×66 输出层边缘也能看到层外岸线，编译器先在每边额外 8 texel 的 82×82 临时 work raster 上栅格化水体并计算欧氏 SDF，再裁出 66×66；该 work raster 不进入结果或缓存。坡度核、湿岸、植被岸边衰减和水面 coverage 轮廓只能读取该半径内输入；需要查询宽河时，空间索引按 feature 自身宽度再加两格扩张 bounds。任何新增编译核若需要更大半径，必须升级 compile profile 并同步扩大 halo 和脏区传播，不能隐式越界读取。

### 8.5 CPU/GPU 一致性与查询有效性

CPU 查询和 GPU 顶点位移共享：

- 相同量化值与解码常量；
- 相同逻辑采样坐标；
- 相同 texel-center 双线性采样；
- 相同 canonical near-grid 三角划分和重心插值约定；
- 相同岸线 coverage 阈值。

当前 `sampleCompiledSurfaceChunk` 已实现 texel-center 双线性 CPU 查询，对 ground、material、water、shore、flow、profile 和 body palette 使用同一坐标核，并拒绝查询当前 chunk 有效域以外的位置。canonical near-grid 顶点的冻结对角线/重心插值和 shader reference evaluator 随阶段 D 接入；中、远 LOD 可以近似区块内部形状，但边界仍读取 canonical 边界点，玩法查询不随当前视觉 LOD 改变。

阶段 C4 的查询 service 只能使用 request token 与该 render chunk 当前令牌相等、且 dependency key 与当前 Effective Snapshot 一致的 compiled field。编辑提交后，旧 GPU mesh 可以在新结果挂载前短暂显示，但其 request token 立即失效，CPU 查询必须从最新 effective window 运行同一个 `compileSurfaceChunk`/`sampleCompiledSurfaceChunk` 核；不能因为旧 field 仍 resident 就返回旧高度或旧水体。CPU 不复现纯视觉海浪、法线细节、闪光和环境反射。玩法高度是 groundHeight 或静态 waterLevel；视觉水面位移只能在冻结的小范围内变化。

## 9. GPU 表面场池

### 9.1 分页 DataArrayTexture

每个 resident render chunk 占用同一页内四张纹理的相同 layer。`SurfaceTexturePool` 使用懒分配页；以下数值属于 `SurfaceCompileProfile v1`，不是 world format：

- 每页固定 128 layers，低于 WebGL2 保证的 256 层上限。
- `values` 使用 `RGBA16F`，依次保存 groundHeight、waterLevel、waterDepth、shorelineDistance。
- `material` 使用 `RGBA8` 保存四项材质权重；`flow` 使用 `RG8_SNORM`；`water` 使用 `RGB8` 保存 coverage、kind、profile。`waterBodyIndex` 只服务 CPU body palette 查询，不上传 GPU。
- 每个 66×66 layer 固定 74,052 字节；一页四张纹理固定 9,478,656 字节（约 9.04 MiB）。池保留等量 CPU backing store，因此 CPU 和 GPU 字节分别记账，不能把一份内存算成两种预算的共享值。
- CPU slot handle 保存 `poolId + pageIndex + layerIndex + generation`，不得持有可被复用的裸 layer 引用。每个 canonical render key 同时只能拥有一个活动 slot，跨池或过时代际的 handle 不能操作当前 slot。
- layer 回收后 generation 增加；迟到上传或释放发现 generation 不匹配时直接拒绝。代际耗尽的 slot 永久退休，不回绕形成 ABA。
- GPU 预算由调用方以精确字节显式提供；不足一整页时不能分配，预算耗尽直接报错，不降级到其他格式或无界分配。

WebGL2 shader 不动态索引一组任意页面 sampler。每个纹理页拥有一套共享材质绑定，同页 chunk 共享该材质，draw 只传 `layerIndex`；`pageIndex` 由 CPU 用于选择材质和调度批次。这既符合 GLSL ES sampler 限制，也不会为每个 chunk 复制材质。

Three.js 当前的 array texture 更新接口按 layer 标脏，不承诺任意子矩形更新。因此 `upload` 总是把 X-major CPU 字段转置并完整写入目标 layer，重复覆盖同一 slot 只保留一个待上传 layer 标记。WebGL context 丢失时池拒绝分配、上传和绑定并清空失效标记；恢复后仅把仍活动且已有内容的 layer 重新标脏。真实 WebGL2 验收会逐格式上传、同层采样、读回并执行一次 context loss/restore，不能只检查 Three.js 对象字段。

`SurfaceTexturePool` 只拥有静态 surface 字段。动态雾由独立 `SurfaceFogTexturePool` 实现，不是第五张 66×66 静态纹理；两者只共享代际 slot 身份，预算、上传记录和恢复状态互不混算。

### 9.2 GLSL 契约

新的地面与水面材质使用 WebGL2/GLSL 3 和 `sampler2DArray`。不保留 RawShaderMaterial GLSL 1 版本。当前内部 `GroundLayer` 使用 `values/material` 数组纹理和独立 fog array；`WaterLayer` 使用同 slot 的 `values/flow/water`，两者已经过真实 WebGL2 垂直切片验收。该内部组合尚未注册为 `HexMap` 生产 Layer，阶段 H 才会一次替换旧路径。

Shader 通过世界逻辑坐标计算 field UV，通过页/层索引采样；浮动原点只参与最终模型矩阵。所有纹理访问必须限制在 layer gutter 内，不跨 array layer 过滤。

### 9.3 上下文丢失

WebGL context 恢复时优先从 resident `CompiledSurfaceChunk` 重新创建纹理页和几何；CPU 编译缓存已被淘汰的块重新提交编译。不得切回旧 instanced terrain。

## 10. 合并地面网格与 LOD

### 10.1 几何

每个 16×16 渲染块使用一张在 `SurfaceLatticeSpec (u,v)` 上焊接的三角晶格，不再为每个 hex 提交 subdivision 3 的独立实例。每档 LOD 的平面 `BufferGeometry` 全局共享；chunk 只提供逻辑起点、变换、纹理 layer 和编译 bounds。共享几何通过 `surfaceToWorld` 放置，分析式六边格仍由逻辑 tile ownership 决定，不要求地面三角形逐个沿 hex 边界切开。

- 顶点只保存局部 `(u,v)` 和表面场采样坐标。
- 顶点 shader 从 groundHeight 读取宏观高度。
- 格线、格子 ID 和选择边界由逻辑世界坐标解析，不依赖逐 hex geometry。
- 材质混合、湿岸和坡面法线来自表面场。
- 地面 mesh 的 Y bounds 使用编译结果的真实最小/最大高度加视觉微位移上限。

当前 `SurfaceGroundGeometryPool` 懒创建三张不可变共享几何。LOD 0/1/2 的内部步长分别为 1/2/4 个 4× 采样间隔；三者的四条外边都固定保留 64 段、256 个唯一 canonical 边界点。中、远档在高分辨率外环和粗内部网格之间使用按实际 `surfaceToWorld` 平面做耳切的焊接过渡带，同时要求每个三角形在世界平面和逻辑 `(u,v)` 平面都非退化。定向验收检查总逻辑面积严格为 16×16、内部边恰好被两个三角形共享、边界边恰好被一个三角形共享。

### 10.2 LOD 边界

近、中、远 LOD 只降低区块内部采样密度，所有 chunk 外边界保留 canonical near-grid 的冻结边界点。每个 LOD 使用过渡三角带连接高分辨率边缘与低分辨率内部。

LOD 切换继续使用 chunk 级迟滞。相邻块即使处于不同 LOD，也必须共享完全相同的边界顶点位置和高度，不依赖 skirt 隐藏错误。skirt 只允许用于观察范围外的保守遮挡，不作为地形裂缝修复方案。

### 10.3 剔除与驻留

16×16 块是 `SurfaceCompileProfile v1` 的 frustum、水平距离和 LOD 单元，并与一个 32×32 semantic chunk 精确组成 2×2。它不是从旧渲染块尺寸按比例推导的结论；实际 draw submission、视锥边缘额外提交和编辑上传由验收测量，边缘保守性通过精确 AABB 与编译高度 bounds 控制。

source chunk 驻留不再使用 Chebyshev 正方形半径直接生成整圈坐标。调度器执行：

1. 计算镜头 render distance 与预测移动走廊；
2. 与 32×32 source chunk 的世界 AABB 求交；
3. 按距离、可见性和运动方向排序；
4. 在 source CPU 字节、compiled CPU 字节和 GPU 字节预算内获取 lease；
5. retention band 只保留真正邻近走廊的块。

这样 32×32 不会因为离散 `ceil(renderDistance / chunkSpan)` 恰好相同而比 24×24 无条件多驻留 78% 的格子。

## 11. 水面渲染

### 11.1 混合几何策略

不对每个区块提交一张大透明平面再大面积 `discard`：

- 核心绘制域的 canonical 边界采样全部为水时，使用完整规则水面 patch；66×66 gutter 只服务跨块插值，不扩大该块的绘制域。
- 海岸、湖泊和宽河使用 coverage field 提取的确定性轮廓网格。
- 只有单一纯窄河窗口使用控制点扫掠带；汇流、跨 segment 接合、河口、湖岸和混合水体统一使用 coverage mesh，避免在主线程做不确定的几何焊接。
- chunk 边界上的轮廓交点使用全局量化采样位置，独立生成也完全一致。

水面几何只决定覆盖与基础水位；颜色、波纹、泡沫和反射从同一表面场读取。

“全水 patch / coverage mesh / sweep mesh”的选择阈值由 compile profile 冻结，并只在 Worker 编译时根据量化输入决定；它不能随帧率、镜头或加载顺序切换。相同 dependency key 必须产生逐字节相同的 geometry kind 和索引缓冲。

### 11.2 深浅与色泽

水色不是固定填色，也不复用陆地材质：

~~~text
finalWaterColor =
    absorption(waterDepth, waterKind)
  + skyReflection(view, normal, environment)
  + sunSpecular(view, normal, sun)
  + shorelineScattering(shorelineDistance)
  + foam(flow, slope, wavePhase)
~~~

- 浅水由水深连续过渡到较亮、较浑浊的岸边颜色。
- 深水吸收更多红绿分量，海洋、湖泊和河流使用不同吸收 profile。
- 水深来自 `waterLevel - groundHeight`，不是按 water kind 随机指定。
- 水体相连处共享 water-body ID、水位和 profile，避免块间色断层。

### 11.3 波浪

统一平移的几条正弦波替换为分层波场：

- 海洋：2–3 组低频方向涌浪、交叉短波和世界坐标噪声扰动。
- 湖泊：幅度较小的多方向风浪，岸边按距离衰减。
- 河流：沿 flow 的细波、横向扰动和局部流速变化，不使用海洋大涌浪。
- 岸边泡沫：由 shoreline distance、局部坡度、波峰和流量共同触发。

所有相位基于逻辑世界坐标和全局时间；chunk、浮动原点和加载顺序不进入相位。波浪只做有界视觉位移，不修改静态水位或通行语义。

## 12. 统一光照与植被

### 12.1 LightingState

所有内置层共享一个结构化 `LightingState`：

~~~ts
interface LightingState {
    readonly uniformRevision: number;
    readonly sunDirection: Vec3;
    readonly sunRadiance: LinearRgb;
    readonly skyDiffuseIrradiance: LinearRgb;
    readonly groundDiffuseIrradiance: LinearRgb;
    readonly specularEnvironment: EnvironmentHandle;
    readonly environmentRevision: number;
    readonly exposure: number;
}
~~~

地面、水、树木、草和建筑读取同一太阳方向、线性色彩空间、漫反射天空/地面辐照、镜面环境和曝光。输出统一经过同一 tone mapping 与 sRGB 编码，不允许每层用独立经验乘数补亮。Three.js PBR 适配器负责把该状态映射为一个方向光、一个 Hemisphere 间接漫反射路径和 `scene.environment`；自定义 shader 使用相同分量。同一 Scene 只能有一个该 binding，不能把 Hemisphere、LightProbe 和 environment map 的漫反射贡献无条件叠加而形成双重环境光。

水面使用共享天空辐照的解析近似产生 Fresnel 反射；树木、草和 Three.js PBR/glTF 模型通过同一 Scene binding 使用太阳、天空/地面漫反射与外部环境贴图。没有外部环境贴图时 Hemisphere 路径仍提供冻结的解析天空/地面辐照，不让植被退回近黑的仅直射光结果。

太阳方向、颜色和曝光属于快速 uniform 更新，不触发表面重编译。外部环境纹理的加载、PMREM 生成和双缓冲由资源系统拥有，只有完整的新 handle 才能随递增的 `environmentRevision` 发布；`LightingStateController` 不拥有或隐式销毁纹理。阴影质量、级联和更新频率仍是生产切换层的渲染策略，不进入 `LightingState` 或 world identity。

当前 `LightingStateController` 已实现不可变快照、归一化太阳方向、严格 `uniformRevision + 1` CAS、单调 `environmentRevision`、共享 shader uniform binding、Three.js Scene binding，以及将 renderer 固定到 ACES tone mapping、统一 exposure 和 sRGB 输出的 binding。相同 environment revision 不允许偷换环境 handle；Scene release 会移除控制器创建的两盏光并恢复调用方原有 environment。外部 PMREM producer 和生产阴影策略不属于该 controller。

### 12.2 植被生成

权威语义只保存密度和 vegetation profile。`SurfaceFieldCompiler` 根据 world seed、逻辑坐标、profile 内物种权重、密度、坡度、水岸距离和稳定 salt 输出确定性 placement seeds：

- 不在陡坡、深水和河道中放置树木。
- 岸边密度连续衰减，不按格突然清空。
- 树根高度由 CPU compiled field 插值。
- LOD 只改变实例保留率和模型，不改变稳定实例身份。

当前 `VegetationLayer` 按 grass/palm/pinia/oak 共享 geometry/material 并使用 instancing。LOD0 保留全部已接受 seed，LOD1 对草做稳定二分筛选且保留树，LOD2 移除草并对树做同一 hash 的嵌套二分筛选；切换 LOD 不重新随机或移动保留实例。根部高度直接解码 compiled seed，主线程不再重复运行 placement resolver。

## 13. 编辑事务与脏区传播

### 13.1 API

编辑只通过类型化事务进入权威数据：

~~~ts
const changeSet = await world.edit(transaction => {
    transaction.raiseTerrain(area, {
        delta: 0.08,
        falloff: "smooth",
        waterPolicy: "reject"
    });
    transaction.paintMaterial(area, weights);
    transaction.paintVegetation(area, { density: 0.6, profile: "temperate-oak-mix" });
    transaction.upsertLake(lakeId, polygon, { level: 0.12 });
    transaction.upsertRiver(riverId, controlPoints, {
        width: 0.3,
        dischargeClass: 2,
        outlet: { bodyId: OCEAN_BODY_ID },
        levelMode: "fit-downhill"
    });
});

map.renderStyle.update({
    lighting: { exposure: 0.95 },
    ocean: { swellStrength: 0.7 }
});
~~~

生成器宏观配置如大陆尺度、基础海平面和水文生成参数不属于运行时 edit；修改它们创建新的 world descriptor 和 world identity。

便利参数如固定宽度或 `levelMode: "fit-downhill"` 只存在于事务输入。事务校验阶段必须把它们解析成完整、量化的权威 feature record 后再提交；重载存档不能重新运行一次拟合并得到不同河流。

### 13.2 地形与水文冲突策略

海洋 coverage 由有效高度和冻结海平面派生，因此抬高或降低海岸地形可以局部改变海岸线，不修改 `MacroDrainageGraph`。显式河流、湖泊和河口不能由普通高度操作静默改道。所有相交操作必须在提交前选择并验证一种策略：

- `reject`：默认策略。若新地面会堵断河道、超过河流水位减最小水深、破坏湖岸闭合或产生未声明溢流，整个事务失败。
- `preserve-channel`：事务层在写入前把请求转换为确定的最终高度覆盖，保持冻结的河床最小水深与湖岸约束；返回结果包含实际应用 bounds，不能只在 shader 中临时压低地面。
- `coupled`：同一事务必须同时提交足以恢复合法连通性的河流、湖盆、水位或河口 feature 修改；最终状态整体校验，不能先落地形再等待第二次编辑。

大范围重新选源、改道和重算汇水属于显式异步 authoring 操作 `rebakeHydrology(area)`。它输出可审查的 feature mutations 后再作为普通原子事务提交，不在一次实时抬地操作中隐式重跑 generator。任何策略都不得产生负水深、逆向 level profile、断头 segment 或只在渲染缓存中存在的修补数据。

冲突校验覆盖操作 bounds 加 `SURFACE_INFLUENCE_RADIUS_TILES`，并在 canonical SurfaceLattice texel/轮廓交点上检查连续地面和水位，不能只检查 tile 中心。`preserve-channel` 生成的最终 semantic overrides 必须再次通过同一校验后才能提交。

### 13.3 ChangeSet

热路径不使用 `Set<string>` 表达变化域。域使用 bitmask，bounds 在事务提交时按 chunk 聚合：

~~~ts
const enum WorldChangeDomain {
    Height = 1 << 0,
    Material = 1 << 1,
    Hydrology = 1 << 2,
    Vegetation = 1 << 3,
    Navigation = 1 << 4,
    Fog = 1 << 5,
    Application = 1 << 6
}

interface WorldChangeSet {
    readonly transactionId: bigint;
    readonly domains: number;
    readonly semanticChunks: readonly DirtySemanticChunk[];
    readonly hydrologyFeatures: readonly DirtyHydrologyFeature[];
    readonly hydrologyRegions: readonly DirtyHydrologyRegion[];
    readonly renderChunks: readonly DirtyRenderChunk[];
}
~~~

传播规则由 domain 表驱动：

| 变化 | 权威写入 | 派生失效 |
|---|---|---|
| 高度 | semantic delta | 表面场、地面、海洋 coverage、岸线、水深、植被、贴地、导航 |
| 材质 | semantic delta | 材质场、地面 |
| 水文 | hydrology feature delta | 水文 raster、岸线、水深、地面湿岸、水面、植被、导航 |
| 植被 | semantic delta | 植被 seeds 与实例 |
| 雾 | dynamic fog store | 仅雾纹理层 |
| 光照/水风格 | render style uniform | 不重编译任何 chunk |

### 13.4 原子性、并发与查询

事务先校验全部操作，再以一个 revision 提交权威增量。任一操作非法则整体不生效。

提交后受影响 render chunk 立即获得新的 `SurfaceRequestToken` 和 dependency key，并进入 Worker 编译队列。旧结果即使晚到也不能覆盖新结果。多个连续编辑合并为每块最新快照，取消尚未开始的旧任务；已经执行的任务允许结束但结果会因 token 失效被丢弃。

主线程不维护另一套“先画出来再等权威确认”的临时地形。视觉更新可以异步晚于事务提交，但查询和存档立即读取新 revision。查询发现 request token 过期或 dependency key 不匹配时必须走最新 Effective Snapshot 的共享 CPU kernel；旧 GPU 表现不能反向成为查询权威。

## 14. 渲染层、所有权与依赖

内置层全部实现真实的 `WorldRenderLayer`，`HexMap` 不再私有持有 land/water/grass/forest 的特殊刷新分支。

平面 registry 扩展为显式依赖图：

~~~text
WorldRenderSession
├── SurfaceCompilationService
├── SurfaceChunkCache
├── SurfaceTexturePool
├── LightingState
└── WorldRenderLayerRegistry
    ├── GroundLayer       requires surface + lighting
    ├── WaterLayer        requires surface + lighting
    ├── VegetationLayer   requires surface + semantic vegetation + lighting
    ├── FogLayer          requires dynamic fog
    └── CustomLayer       declares explicit dependencies
~~~

规则：

- Service 拥有编译任务、CPU cache 和纹理槽；Layer 通过 lease 使用，不直接管理 source residency。
- Layer 拥有自己的 Three.js 对象、材质、LOD 表示和释放逻辑。
- Session 决定初始化、反向销毁、上下文恢复和世界切换。
- 依赖图必须无环；重复资源 owner、缺失依赖或非法生命周期直接拒绝。
- custom layer 只能读取公开的只读 surface/semantic lease，不能修改内部 typed array。

## 15. Worker、缓存与调度

### 15.1 工作类型

Worker 池至少支持三个明确任务：

1. `generateSemanticChunk`：生成 32×32 BaseSemanticChunk。
2. `generateHydrologyRegion`：从确定性 `MacroDrainageGraph` 裁出 128×128 HydrologyRegion。
3. `compileSurfaceChunk`：将 effective window 编译为 16×16 CompiledSurfaceChunk。

有限/环绕世界的低分辨率排水图准备可以是独立任务；无限 resolver 则按 region 的有限依赖窗口求值。二者与 semantic generation 共用确定性 resolver 基础和统一调度器。任务协议使用 discriminated union，不用可选字段猜测任务类型。

### 15.2 优先级

调度顺序为：

1. 首屏中心可见块；
2. 当前视锥内缺失块；
3. 最近编辑的可见块；
4. 镜头运动预测走廊；
5. retention 预取；
6. 后台缓存填充。

生成、编译、主线程挂载和 GPU 上传分别有帧/并发预算。完成一批 Worker 任务不能绕过主线程挂载预算。

### 15.3 缓存层

| 缓存 | 键 | 淘汰依据 | 可否重建 |
|---|---|---|---|
| semantic source | world identity + chunk key + revision | CPU 字节与 lease | 是 |
| hydrology region | world identity + region key + revision | CPU 字节与 lease | 是 |
| effective window buffer | profile + capacity class | 任务结束归还 buffer pool | 是 |
| compiled CPU | exact SurfaceDependencyKey | CPU 字节、可见性、编辑热度 | 是 |
| GPU surface slot | session + compiled dependency key | GPU 字节、LOD/可见性 grace | 是 |
| dynamic fog | session + render key | 玩法驻留与 GPU 字节 | 从 fog store 恢复 |

缓存统计必须报告真实 typed-array、geometry 和 texture 估算字节，不能只报告对象数量。

## 16. 导航、模拟、拾取与贴地

### 16.1 导航

导航摘要按 32×32 semantic chunk 构建，读取 `EffectiveWorldView` 的 substrate/navigation override，并通过共享 hydrology query kernel 得到静态水体与坡度结果。导航可以持有有字节预算的 derived hydrology raster，但不能另建一套逐格水体权威。高度或水文 change domain 会精确失效相交摘要；材质和纯视觉风格不影响导航。

长程导航可以持有 semantic lease，但不能为了寻路创建 GPU surface。

### 16.2 模拟

标准模拟块默认使用 64×64，与 2×2 semantic chunk 对齐。模拟仍有独立 Store、格式版本、时钟和活动锚点；64 不属于 world surface format，也不代表镜头加载 64×64 地形。应用若改变模拟分区，只升级自己的模拟格式，不改变 world identity。

实体跨模拟块时只迁移实体状态。需要地形判断的系统按需获取 semantic/hydrology lease，不依赖 compiled render chunk。

### 16.3 拾取与贴地

射线先与 render chunk 保守 bounds 和地面/水面 mesh 相交，再把世界坐标逆映射到逻辑六边格。最终高度使用 CPU `CompiledSurfaceField` 的同一三角插值。

格子选择、路线和建造预览从逻辑坐标生成，不依赖逐 hex mesh 实例 ID。CPU compiled field 不存在或 token 已过期时，查询服务获取当前 Effective Snapshot 并使用同一共享 surface/hydrology kernel，不触发 GPU 资源创建，也不返回旧 resident field。

## 17. 格式、身份和失败策略

### 17.1 版本

完整切换时升级：

~~~ts
WORLD_GENERATOR_VERSION = 7;
WORLD_DESCRIPTOR_FORMAT_VERSION = 2;
WORLD_CHUNK_FORMAT_VERSION = 2;
WORLD_WORKER_PROTOCOL_VERSION = 5;
WORLD_DELTA_FORMAT_VERSION = 3;
HYDROLOGY_REGION_FORMAT_VERSION = 1;
HYDROLOGY_DELTA_FORMAT_VERSION = 1;
SURFACE_COMPILER_REVISION = 2;
SURFACE_COMPILE_PROFILE_VERSION = 1;
~~~

`SURFACE_COMPILER_REVISION` 和 `SURFACE_COMPILE_PROFILE_VERSION` 只用于可重建缓存键，不进入 world descriptor、world identity 或存档格式。前者表示算法变化，后者表示 render chunk、采样密度、物理纹理布局、LOD topology 和页容量这一组经过验证的配置变化。`RENDER_SURFACE_FIELD_FORMAT_VERSION` 不作为公共持久化版本存在。

v2 descriptor 不再保存可配置 `chunkSize`；32/128 由格式版本隐含。descriptor 显式记录 semantic chunk format、hydrology region format、四个 biome basis 和 vegetation/substrate catalog identity。world identity 至少包含 descriptor version、source kind、seed、generator version、这两个格式版本、语义 catalog 内容哈希和拓扑尺寸；替换同名 catalog 内容不能继续复用旧 world identity。

### 17.2 存档

旧 descriptor、packed chunk 和 delta 格式不自动迁移。加载不匹配格式时明确拒绝，并要求重新生成世界或创建新存档。

持久化只保存：

- world descriptor；
- sparse semantic delta；
- hydrology feature delta/tombstone；
- 应用自己的实体/战役状态。

BaseSemanticChunk、HydrologyRegion 和 CompiledSurfaceChunk 都可以缓存，但缓存损坏或版本不匹配时删除并重建；它们不是唯一存档副本。

### 17.3 确定性失败

以下情况立即失败，不执行静默 fallback：

- 格式或生成器版本不匹配；
- chunk 数组长度、枚举、量化范围或 bounds 非法；
- 排水 rank 不下降、终点非法、水文边界端口不匹配、feature/body ID 冲突或河流拓扑非法；
- compiled body palette 超限、SurfaceLattice 测试向量不匹配或过期 request token 尝试写入；
- WebGL2 不支持所需 array texture/GLSL 3 能力；
- 纹理页或资源预算无法容纳最小首屏工作集；
- Layer 依赖环、重复 owner 或过期 revision 写入。

Worker 崩溃可以由既有有界重试策略重启任务；重复失败向上报告，不切换旧渲染器。

## 18. 实施阶段

### 阶段 A：冻结契约与纯数据格式（已完成）

- 新增固定尺寸常量、坐标/索引函数和 v2 descriptor。
- 实现 BaseSemanticChunk SoA、校验、序列化和按需只读 tile view。
- 冻结 substrate、biome 和 vegetation profile 索引；建立“权威基础字段/派生字段/navigation override”边界测试。
- 把生成器结果一次量化进 32×32 chunk。
- 建立跨 chunk 边界、请求顺序、线程和负坐标确定性测试。

完成标志：主线程不再需要 resolver 才能读取生成地表语义。

实现结果（2026-08-30）：

- 新增 `src/world/semantic`，实现 v2 descriptor、固定 32×32 X-major 坐标/索引契约、`BaseSemanticChunk` SoA、严格校验、固定小端二进制序列化和按需 `BaseSemanticChunkView`。无限世界覆盖完整 safe-integer tile 域；最小安全整数所在的边界 chunk 通过显式 partial `validBounds` 排除唯一越界槽位。
- 当前 generator v7 沿用阶段 A 冻结的量化规则：`macroHeight = saturate(landform.elevation)` 后按 `floor(value × 65535 + 0.5)` 写入；climate 和 vegetation density 使用对应的 8 位规则；四项 biome 权重采用最大余数法并保证每个有效格严格合计 255。
- substrate 目录固定为 sediment/soil/sand/rock/permafrost；biome basis 固定为 temperate/dry/cold/alpine；vegetation profile 目录固定为 none/warm-palm-mix/cold-pinia-mix/temperate-oak-mix。descriptor 保存两个目录规范 JSON 的 SHA-256 内容哈希，目录内容改变不能复用旧 world identity。
- `BaseSemanticChunk` 校验拒绝未知字段，因而 water、坡度、材质输出、navigation 和其他派生事实不能混入基础权威格式；partial chunk 的 `validBounds` 外必须逐字节清零。
- 共享 Worker 协议在阶段 C3 后为 v5：除 `generateSemanticChunk` 与 `generateHydrologyRegion` 外，新增以 compiler/profile identity 校验的 `compileSurfaceChunk`，而不把 generator version 冒充编译器版本。v1 的 world/chunk/vegetation payload 和 generator v5 identity 未改变；两个 v2 生成任务仍使用独立 generator v7 identity。
- 已建立 descriptor/catalog identity、负坐标、环绕规范化、SoA 长度与权重、二进制 golden、请求顺序、Worker client/pool 和真实浏览器 transferable Worker 测试，并把 49 个 32×32 semantic chunk 的 generator-v7 吞吐纳入 benchmark gate。生成结果返回后可直接由主线程的只读 view 查询，不重新运行 resolver。

阶段性命名说明：在阶段 H 完整切换前，现有生产常量仍表示 v1 格式；已落地的 v2 常量使用 `WORLD_DESCRIPTOR_V2_FORMAT_VERSION`、`WORLD_SEMANTIC_CHUNK_FORMAT_VERSION` 和 `WORLD_SURFACE_V2_GENERATOR_VERSION` 避免把两种缓存/存档身份混用。切换提交会删除 v1 常量并收敛为第 17.1 节的最终名称，不保留兼容别名。

### 阶段 B：水文区域（已完成）

- 实现 `MacroDrainageGraph`、严格下降 drainage rank、稳定 feature/body ID 和终点校验。
- 从排水图裁剪 128×128 region、boundary port 和空间索引，不从边键随机创造河流。
- 生成海域、湖盆、长河、汇流和河口。
- 实现 derived hydrology raster 查询，不持久化逐格河流权威。
- 覆盖无限和 32 倍数环绕拓扑，包括末端 partial hydrology region 与四角接缝。

完成标志：所有下游路径有限终止；跨任意 region 请求顺序，河流端口、宽度、水位、流量和 body ID 完全一致。

实现结果（2026-08-30）：

- 新增 `MacroDrainageGraph`。确定性的多源 priority-flood 从每个陆地分量的规范海岸出口和显式湖盆出发，不再让密集局部海面样本全部传播排水。无海分量使用稳定最低点；足够大的临海分量使用远离出口的稳定局部低点补充内陆湖盆。每个非终点节点只有一个下游父节点，保存严格下降的 `drainageRank`、非逆升的量化 `drainageLevel`、累积流量和只增不减的 `dischargeClass`。图校验会拒绝 rank、终点、流量、body identity 或边集合不一致。
- 无限世界使用从原点对齐的 2048×2048 有限流域和 16 格宏观采样，单次 region 请求最多采样 16384 个宏观位置；不参与排水的海面样本不会进入公开图。有限/环绕世界先构建完整低分辨率图，冻结采样上限同为 16384。无限 safe-integer 最小边界 region 使用 partial `validBounds`；环绕尺寸仍只要求 32 的倍数，不要求 128 的倍数。
- `HydrologyRegion` 固定为 128×128，控制点以区域原点为基准按每格 16 单位量化到 `Int16Array`；宽度/水位剖面分别使用 `Uint8Array`/`Uint16Array`。region 保存河段、湖盆、河口、body palette 和图边裁切产生的 boundary ports，不保存逐格河流占用。feature、segment、port、connection 和 body ID 均由 descriptor/图节点/裁切位置稳定派生。
- 环绕图边先按最短拓扑位移展开，再裁到 canonical region；末端 partial region、同 region 自连接、四条边和四角交点共享同一个 connection contract。`assertMatchingHydrologyPorts` 要求两侧 edge/river/body、宽度、水位、discharge 和 flow vector 完全相同且流入/流出相反。
- 加载后的 `HydrologyRegionSpatialIndex` 使用 16×16 格 bin 和紧凑 offset/entry typed arrays；它是可丢弃索引。`deriveHydrologyRaster` 通过复用查询数组输出 X-major coverage/kind/level/flow/body-index typed arrays；海洋来自冻结海平面与调用方提供的宏观高度，逐格结果不回写 region。
- Worker 协议升级到 v4，新增 `generateHydrologyRegion`，返回的河流/湖泊 typed arrays 通过 transferable 交付；`WorldGeneratorClient` 和有界 `WorldGeneratorPool` 提供独立 hydrology lane、队列/忙碌数和滑动平均耗时。
- 验收覆盖图终止、损坏 rank 拒绝、静态湖盆、最小全海图，以及三组正负流域程序化语料中的显式湖盆、长河、汇流和海洋河口；最长可见链硬门槛为 64 条宏观边且至少跨 4 个 region。另有真实程序化长河逐边裁切、双侧端口配对、任意 region 请求顺序、负坐标、safe-integer 边界、160×160 环绕 partial region 与四角接缝、派生海/湖/河 raster、空间索引、WorkerPool 和真实浏览器 transferable Worker 验收。benchmark gate 覆盖一个 2048×2048 流域支持的 16-region 工作集及一个 128×128 raster；当前代表性基线约为 280 ms 和 8 ms。

### 阶段 C 前置：生效快照与版本正确性（已完成）

- 实现规范化 `SparseSemanticDelta`、完整 `HydrologyFeatureDelta`/tombstone 和派生 region-feature index。
- 实现 `EffectiveDeltaSnapshot`、`EffectiveWorldView` 原子发布和有界 `EffectiveWorldSnapshot` 捕获。
- 实现局部精确 `SurfaceDependencyKey`、携带 `effectiveRevision` 的 binding 和跨 session/request generation 的 token tracker。
- 验证 partial chunk、环绕 alias、world identity、revision CAS/严格递增、旧快照隔离、无关编辑缓存复用、相关编辑失效、release/remount ABA 与旧 session 拒绝。

完成标志：读取方不会观察半提交增量；旧快照不会随新 revision 改变；只有当前 token 且依赖逐项相同的结果可被接收，同时无关世界区域编辑不造成全局编译缓存失效。

实现结果（2026-08-30）：

- `EffectiveWorldView` 发布一个同时含完整 delta layer 和预构建查找表的不可变 state，提交热路径只做一次 state 指针替换；捕获成本与请求提供的 chunk/region 数量相关，不与整个基础世界大小相关。
- semantic override 使用最多 1024 项的紧凑 SoA 和二分读取；hydrology record 使用 feature-centric 全局记录，region 只引用稳定 ID。创建和发布边界复制 typed arrays，Worker transfer 不能借用这些权威 buffer。
- `SurfaceDependencyKey` 不使用 hash 代替正确性比较，也不把全局 `effectiveRevision` 混入局部内容键。`SurfaceRequestTracker` 使用 session epoch 加会话内全局单调 generation，活动表可在卸载时删除且不会发生 generation ABA。
- 本前置阶段只新增运行时 read model 与可重建缓存身份，不改变 generator 输出或持久化格式：generator 保持 v7、semantic chunk 保持 v2、hydrology region 保持 v1；`SURFACE_COMPILER_REVISION` 与 `SURFACE_COMPILE_PROFILE_VERSION` 首次冻结为 1。
- 定向验收覆盖规范编码、增量越过 partial bounds、完整河湖 record、region tombstone 覆盖、任意依赖输入顺序、跨 world 错配、revision 跳号/冲突、相关与无关编辑、旧请求/旧 session/release 后结果。benchmark gate 覆盖四个 semantic chunk 加一个 hydrology region 的 snapshot、查询、依赖构建和 token 校验 5000 次；首次验证后的代表性基线约 185 ms，即每次约 37 µs。

### 阶段 C1：CPU 表面编译器（已完成）

- 实现 canonical `SurfaceLattice`、冻结测试向量、binary16 codec 和精确 20×20 `TransferableEffectiveWindow`。
- 输出 64×64 core、单 texel gutter、十个量化字段和 body palette 的 66×66 CPU 表面场。
- 实现地面/材质连续采样，河流、湖泊、海洋 coverage，逐 texel 水位/水深/profile/flow，以及在扩张 work raster 上计算的带符号欧氏岸线距离。
- 实现严格输入/输出校验、保守 bounds、确定性 checksum、transferable 列表和共享 CPU 查询核。

完成标志：相同 effective window 的编译结果逐字节稳定；相邻块 gutter、负坐标、环绕接缝与 safe-integer partial bounds 一致；权威 ArrayBuffer 不会因传输 window/result 被 detach。

实现结果（2026-08-30）：

- `SurfaceCompileProfile v1` 冻结为 16/4/1/2/66，water body palette 上限 255；第 6 步加入 presentation 编译后 `SURFACE_COMPILER_REVISION = 2`。field 仍固定为 4,356 texel、78,408 字节，完整 chunk 总字节数按水面 geometry 和植被 SoA 实际大小确定。
- effective window 只捕获精确 semantic/hydrology 依赖，过滤同 region 内不相交 feature；delta replacement/tombstone 仍保留使 base feature 消失所需的依赖。所有 resident SoA 与 feature typed arrays 均被复制后再作为 transferable 暴露。
- SDF 在 82×82 临时栅格上计算后裁剪，解决输出 gutter 外岸线对边缘 texel 的影响；水体 palette 只统计最终 66×66 内实际出现的 body。
- 定向验收覆盖全陆地、全海洋、连续高度/湖泊/河流、相邻块字节一致、外部岸线影响、语义高度增量、无关 feature 过滤、真实跨 region 水文、负坐标、环绕 seam、safe-integer partial、损坏输入/输出和逐 texel 查询。benchmark gate 的真实跨 region 基线为 window 250 次约 139 ms（约 0.56 ms/次），编译 25 次约 324 ms（约 12.97 ms/次）。

### 阶段 C2：GPU 表面场池（已完成）

- 实现四张 paged `DataArrayTexture` 的固定物理布局、X-major 到纹理行序的整层打包和同 layer 标脏。
- 实现严格 GPU 页预算、懒分配、render-key 单一所有权、pool identity、slot generation、无回绕回收和精确 CPU/GPU 字节统计。
- 实现 WebGL context lost/restore 状态机，只重传仍活动且已上传的 layer。
- 用真实 WebGL2 验证四种内部格式、CPU/GPU texel 一致性、整层上传去重和 context restore。

完成标志：纹理 slot 回收不会发生 ABA，预算耗尽不会隐式降级；四张数组纹理可在真实 WebGL2 中上传和采样，context restore 后仍与 CPU 编译字段一致。

实现结果（2026-08-30）：

- `SurfaceCompileProfile v1` 补全 `pageLayers: 128`；`RGBA16F + RGBA8 + RG8_SNORM + RGB8` 固定为每 layer 74,052 字节、每 page 9,478,656 字节。
- `SurfaceTexturePool` 以显式 GPU 字节预算懒分配页面，保留同尺寸 CPU backing store；公开统计区分 resident、pending 和 logical upload 字节。
- slot handle 绑定 pool/page/layer/generation，release 后代际递增；过时上传、过时释放和跨池 handle 不能影响复用后的内容。
- 打包 benchmark 覆盖同一 66×66 layer 连续 100 次完整更新，代表性基线约 82 ms（约 0.82 ms/次），待上传层标记保持为 1。
- 浏览器验收真实创建并采样四张 `sampler2DArray`，逐通道对比 CPU 字段；context loss/restore 后只重传活动层并保持相同结果。

### 阶段 C3：Worker 表面编译服务（已完成，归入原始第 4 步的 CPU 编译链路）

- 将共享 Worker 协议升级到 v5，新增独立 compiler/profile identity 的 `compileSurfaceChunk` discriminated request/response。
- 把 effective window 和完整 compiled chunk（field、水面 geometry、植被 SoA）分别作为 transferable 输入/输出；Worker 将输入 buffer 转回主线程 exact-size buffer pool。
- 把 surface compilation 接入有界优先级 WorkerPool lane，公开排队、忙碌和滑动平均耗时统计。
- 实现按完整 `SurfaceDependencyKey` 查找的 compiled CPU LRU cache、严格字节预算和引用计数 lease。
- 实现同 dependency 并发合并、request token supersede/release、取消和迟到结果 `stale` 拒绝。

完成标志：权威 typed arrays 不会被 detach；真实浏览器 Worker 会转移并归还 window buffer；相同依赖只编译一次，旧 token 不能获得当前 lease，活动 lease 不会被预算淘汰。

实现结果（2026-08-30）：

- `WorldGeneratorClient` 和 `WorldGeneratorPool` 支持 `compileSurfaceChunk`，编译队列拥有独立 queued/busy/average 指标；协议错误、compiler/profile 错配和错误 dependency 结果在进入 cache 前拒绝。
- `SurfaceCompilationService` 从 `EffectiveWorldSnapshot` 原子构造请求，同 render key 后发 token 立即取代前者；同 dependency 的 in-flight job 合并，结果只为仍满足 token 和结构化依赖的请求签发 lease。
- compiled cache 以完整 chunk 的实际 `byteLength` 精确记账（固定 78,408 字节 field 加可变 presentation buffers），只淘汰无 lease 的 LRU 项；预算被活动 lease 占满时确定性报错，不做无界暂存。
- `SurfaceWindowBufferPool` 按精确 byteLength 复用输入 ArrayBuffer，并以显式 retained-byte 预算限制空闲常驻；cache hit 未投递的 window buffer 立即回池。
- 定向验收覆盖 cache hit 新 token、并发合并、supersede stale、取消、实际字节预算和 buffer 复用；真实 Chromium Worker 验证主线程输入 detach、完整 field/presentation buffer 回传和六个语义输入 buffer 归还。

### 阶段 C4：查询接入与动态雾

- 把 request token/dependency 校验接入查询 service；过期时从最新 effective snapshot 同步运行共享 CPU kernel。
- ~~将动态雾拆到独立 R8 池，并显式关联 surface slot 生命周期。~~ 已在原始第 5 步完成。

剩余完成标志：过期 field 无法服务新 revision 查询；同步查询通过定向及浏览器验收。动态雾的独立上传、代际关联和 context restore 已通过验收。

### 阶段 D：统一光照核心与合并地面网格

- 建立共享 LightingState、解析天空/PMREM 环境资源、线性色彩空间和 tone mapping。
- 实现 16×16 六边格对齐焊接网格和三档 LOD。
- 实现固定高分辨率边界及过渡三角带。
- 迁移地表材质、格线、选择和 fog 采样。
- 用新 GroundLayer 替换旧 TerrainMesh land path。

完成标志：相同可见面积下不再提交逐 hex 细分实例，chunk/LOD/环绕边界无裂缝；GroundLayer 已通过统一光照参考材质校准。

原始第 5 步实现结果（2026-08-30）：

- `SurfaceFogTexturePool` 固定为 16×16×128 `R8` page，以完整 `SurfaceTextureSlotHandle` 代际关联静态 slot；预算不足、跨池、迟到代际和 context 状态错误均明确失败，不把动态更新写进 66×66 静态层。
- `SurfaceGroundGeometryPool` 实现 1/2/4 内部步长的三档共享晶格，三档都保留逐 1/4 tile 的 canonical 外边界，并用双空间非退化的焊接过渡带连接粗内部；每个 LOD 只创建一份 vertex/index buffer。
- `LightingStateController` 原子发布统一太阳、天空/地面漫反射、环境 handle 与曝光；`GroundLayer` 按纹理页共享一个 GLSL 3 material，按 draw 写入 layer/valid bounds，持有 compiled lease，并在 revision 替换时复用 slot 后再释放旧 lease。
- 真实 Chromium 验收完成地面高度位移、材质场、动态雾明暗切换、LOD 切换和 context loss/restore。1/9/49 块 benchmark 同时执行静态整层打包、fog 上传、lease/mesh 挂载；当前代表性结果约 17/27/85 ms，49 块共用三张几何、一个静态 page 和一个 32 KiB fog page。
- 该切片保持内部状态：不向 `HexMap` 增加 v1/v2 运行时选择，旧 `TerrainMesh` 只在阶段 H 一次删除。第 6 步已补齐共享 Scene 光照 binding、水面和植被参考 shader；外部环境资源加载与生产阴影策略随阶段 H 的唯一生产路径接入，不由 `LightingStateController` 隐式拥有。

### 阶段 E：连续水面（原始第 6 步，已完成）

- 实现海洋 patch、湖岸/宽河 coverage mesh 和窄河 sweep mesh。
- 实现连续水深色、环境反射、分层波浪和 flow 驱动河流。
- 删除旧海面、湖泊和河流各自重复的岸线计算。

完成标志：海、湖、河具有可辨识形态，岸线平滑且全部读取同一 SDF。

实现结果（2026-08-30）：

- compiler revision 2 在 Worker 内输出 `none | full | coverage | sweep`。全水核心块不保存重复 geometry，直接复用与 Ground 相同 LOD patch；湖泊、海岸和宽河用固定对角线三角裁剪 coverage，交点以每个采样 interval 的 1/65,536 量化并焊接；量化宽度不超过 24 的纯河流块保存按稳定 feature key 排序的 sweep。
- `WaterLayer` 与 Ground 读取同一个 surface slot：水面基准高度、水深、岸线 SDF、flow、kind 和 profile 都来自编译纹理。海洋、湖泊和河流使用不同但有界的世界坐标波形；冻结的 192-tile 公共周期让 shader 只接收 safe-integer origin 的小模数，在负坐标和极远坐标仍保持相位连续。profile 改变色调/强度，flow 决定河流方向；深浅色、岸边泡沫、太阳高光和解析 Fresnel 使用共享 LightingState。
- `SurfacePresentationLayer` 以一个 Ground-owned `ResidentSurfaceLease` 原子组合 Ground/Water/Vegetation。三层替换复用同一静态 slot；卸载先移除 vegetation/water companion，再由 Ground 释放 fog、surface slot 和唯一 lease。context restore 先恢复纹理权威，再恢复水面/植被材质。
- 定向测试覆盖 dry/full/coverage/sweep、窄河逐字节确定性、共享全水 geometry、独有轮廓释放和完整 transferable 字节核算。真实 WebGL2 验收执行波浪时间、LOD、浮动原点及 context loss/restore，且无 GL 或 shader 错误。

### 阶段 F：植被与模型光照（原始第 6 步，已完成）

- 规范化树木/草材质并把 Three.js PBR 模型接到已有 LightingState Scene binding。
- 由 compiled field 生成植被 placement seeds 和贴地高度。

完成标志：植被不再暗沉脱离环境，所有内置层对太阳、天空和曝光响应一致。

实现结果（2026-08-30）：

- compiler 对每个有效 tile 固定尝试 8 个 grass 与 2 个 tree candidate；hash 只依赖 world identity、safe-integer 全局 tile 坐标和 candidate index。水覆盖、坡度、连续 shoreline SDF、量化 density 与 vegetation profile 共同筛选，最多输出 2,560 项 SoA；根部高度从同一 compiled ground field 插值得到。
- `VegetationLayer` 按 grass/palm/pinia/oak 使用共享 geometry/material 和稳定 instancing。LOD 保留集合严格嵌套，实例的坐标、高度、物种、旋转和缩放不随请求顺序、时间或 LOD 重算。
- `LightingStateController.bindScene` 只创建一条 DirectionalLight + HemisphereLight + `scene.environment` 路径，拒绝同 Scene 重复 binding，并在 release 时恢复原 environment；Ground、Water 和 Vegetation 自定义 shader 使用同一组太阳/天空/地面 uniform，renderer 统一 ACES、exposure 和 sRGB。
- 固定 seed 的 v2 gallery 输出 near/middle/far 三张真实水面与植被 PNG；交互浏览器验收同时检查可见像素、LOD 实例减少、时间/浮动原点画面变化、`MeshStandardMaterial` 模型照明、lease 释放和 context restore。1/9/49 benchmark 已升级为挂载完整 Ground/Water/Vegetation presentation，而不是只测 Ground；本轮代表性结果约为 26/55/211 ms，49 块仍共用一个静态纹理 page 和一个 fog page。

### 阶段 G：编辑、持久化和消费系统（原始第 7 步）

- 实现类型化 transaction、domain bitmask 和脏 bounds 聚合。
- 实现原子 WorldDeltaStore、semantic delta 与 feature-centric hydrology delta/tombstone。
- 实现 `reject`、`preserve-channel`、`coupled` 水文冲突策略和显式 hydrology rebake 输出。
- 对齐导航 32、标准模拟 64、拾取和贴地查询。
- 验证批量编辑合并、CAS、save barrier 和 stale task 拒绝。

完成标志：高度、水体、植被、雾和纯 uniform 修改只触发各自规定的最小工作集。

### 阶段 H：切换与删除旧路径

- 所有内置层改为 dependency-driven WorldRenderLayer。
- 删除 v1 packed tile 热路径、12×12 TerrainMesh、自由字符串水体 modifier 和粗粒度 refresh。
- 删除临时原型和双路径开关。
- 更新 README、现状文档和 release notes，将本文状态改为已实现。

完成标志：仓库只有一套生产 world surface/render path。

## 19. 验收标准

### 19.1 正确性

- 相同 world identity 与编辑 revision 的语义、水文和编译结果逐字节确定。
- 任意生成/编译顺序、Worker 数量、卸载重载后结果一致。
- 无限世界负坐标、环绕四条边和四个角不存在语义、几何、材质、水位或波相位接缝。
- SurfaceLattice 正/负坐标、公共边和环绕测试向量在 CPU、Worker 和 shader reference evaluator 中一致。
- 不同 LOD 相邻块边界顶点完全相同。
- 每条 drainage edge 的 rank 严格下降，所有路径有限终止；河流没有断头边界、逆流汇流、重复 ID 或请求顺序依赖。
- river/lake/ocean body ID 不随加载范围、region 裁剪、卸载重载或渲染 LOD 改变。
- 事务提交后任何旧 request token 或错误 dependency key 都不能服务 CPU 查询；非法地形/水文组合整体失败且不产生部分 delta。
- ground、水位、shore SDF 和 vegetation placement 在 CPU/GPU 契约允许误差内一致。

### 19.2 性能

性能验证只检查当前 `SurfaceCompileProfile v1` 是否满足目标工作集，不枚举没有结构依据的尺寸组合。16×16 来自 32×32 semantic chunk 的 2×2 对齐和局部编辑粒度；旧生产路径只允许作为迁移前回归基线，不是候选、兼容路径或 fallback：

- 对 1、9、49 个可见 render chunks 分别测量全陆地、海岸、全水和密集河网。
- 记录 Worker 生成/编译、主线程挂载、GPU frame p50/p95、draw calls、顶点调用、上传字节和 resident CPU/GPU 字节。
- 同等可见面积下，地面 chunk/draw 数符合 16×16 理论数量，不出现隐藏逐 hex draw；新路径相对旧基线的收益或回归必须能由顶点调用、纹理读取、上传或 draw submission 数据解释。
- 正常镜头移动不突破既有主线程 frame-task 预算；Worker 批量完成不会同帧全部挂载。
- 单格编辑只上传受影响静态 surface layers；纯 fog 和 uniform 修改不得上传静态 surface layer。
- source、hydrology、compiled CPU 与 GPU pool 均在各自字节预算内稳定淘汰，无随探索距离增长的常驻数据。

如果实现缺陷导致不达标，修复数据布局、需求集合、批处理或 shader。若证据表明 16/4/66 这一整组编译配置本身无法满足目标，则在生产切换前升级 `SURFACE_COMPILE_PROFILE_VERSION` 并重新验证；world descriptor、semantic chunk 和水文存档格式保持不变，也不恢复旧 12×12 生产路径。

### 19.3 视觉

固定种子图库至少覆盖：

- 大陆海岸、半岛、海湾和大面积海洋；
- 不同深度和尺寸的湖泊；
- 长河、支流汇合、河口与跨 region 河段；
- 平原、丘陵、山系及临水山体；
- 密林、疏林、草地和不同光照角度；
- 近、中、远 LOD 与环绕接缝。

审查重点是连续形态、层次、光照一致性、波浪非重复性和玩法格可读性，不能只用统计分布代替截图与交互检查。

## 20. 最终不变量

实现期间任何模块都不得破坏以下约束：

1. 基础格子语义只有 BaseSemanticChunk + SparseSemanticDelta；生成河网只有 MacroDrainageGraph/HydrologyRegion，编辑河湖只有完整 HydrologyFeatureDelta。
2. 逐格水体 raster、surface field、mesh、纹理和植被实例全部可重建。
3. substrate、水体、坡度、材质输出和通行性各自只有一个明确权威或派生来源，不能用多个字段表达冲突事实。
4. 32/128 属于世界格式；16/4/66 属于不可由调用方拆分修改的 compile profile，模拟 64 由应用拥有。
5. 128×128 永远不是渲染、单格编辑或整层 GPU 上传单元。
6. 排水端口来自严格无环的全局排水骨架；稳定 water-body ID 不依赖当前加载范围。
7. 动态雾与静态 surface field 分离。
8. CPU 与 GPU 共享 SurfaceLattice、宏观量化和插值；过期 request token 或错误 dependency key 不能服务查询。
9. 地形编辑不能静默破坏显式河湖，水文冲突必须在原子事务中按冻结策略解决。
10. 内置渲染层与自定义层遵守同一依赖和生命周期模型。
11. WebGL2 是 v2 唯一生产后端；WebGPU 仍按独立测量门槛决策。
12. 不保留旧格式兼容、旧渲染 fallback 或永久双路径。
13. 文档、格式常量、实现和验收测试必须在每个阶段同步更新。
