# 世界表面与渲染基建 v2 设计

状态：**完整设计稿、待评审、尚未实施**。本文描述下一代世界表面与渲染基建的目标结构；当前生产实现仍以 [世界风格生成 v1](./world-style-generation-v1.md) 和 [渲染与流式加载](./render-streaming.md) 为准。

实施 v2 时直接替换旧的数据和渲染热路径，不保留旧格式兼容、旧地形渲染 fallback 或两套生产实现。迁移完成并通过验收后，v1 文档转为历史记录，本文转为当前实现文档。

## 1. 最终结论

项目采用“权威语义数据 → 生效世界视图 → 可重建表面场 → 渲染层”的单向数据架构：

~~~text
WorldDescriptor v2
        │
        ├── BaseSemanticChunk 32×32 ── SparseSemanticDelta
        │                                      │
        └── HydrologyRegion 128×128 ── SparseHydrologyDelta
                           │          │
                           └────┬─────┘
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
                                │
                           Dynamic Fog
                         独立的高频状态场
~~~

固定数值基底如下：

| 层级 | 固定尺寸 | 数量关系 | 主要职责 |
|---|---:|---:|---|
| 表面编译/渲染块 | 16×16 格 | 最小空间工作单元 | 剔除、LOD、局部重编译、GPU 表面场层 |
| 权威语义/source chunk | 32×32 格 | 2×2 个渲染块 | Worker 生成、SoA 数据、稀疏地形增量、导航摘要 |
| 标准模拟块 | 64×64 格 | 2×2 个语义块 | 默认实体驻留和后台模拟分区；不参与渲染驻留 |
| 水文区域 | 128×128 格 | 4×4 个语义块、8×8 个渲染块 | 河网、湖盆、河口、跨区边界门和水体身份 |
| 近景表面场核心 | 64×64 样本 | 每格 4×4 样本 | 高度、材质、岸线距离、水深和流向 |

表面场每边增加一个采样 texel 的 gutter，GPU 层尺寸为 66×66。编译器输入使用至少两格语义 halo；输入 halo 是临时快照，不进入权威 chunk，也不改变 chunk 归属。

这些尺寸是格式契约，不再作为普通运行参数暴露。特别是：

- 128×128 只负责低频宏观水文，不直接成为渲染或编辑重建单元。
- 单格编辑最多使相交的 16×16 渲染块及固定 halo 邻块变脏。
- 32×32 source chunk 不再沿用当前基于正方形 `loadRadius` 的整圈加载；需求集合按区块 AABB、预测走廊和字节预算精确计算。
- 导航直接复用 32×32 语义边界；模拟默认 64×64，但其驻留仍由游戏活动锚点决定，与镜头无关。

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
7. 16/32/64/128 各层完全对齐，负坐标、环绕世界、浮动原点和 LOD 边界无缝。
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
- 不让调用方任意选择 12、24、32、96、128 等 chunkSize 组合。

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
- 程序化环绕世界的宽和高必须是 128 的正整数倍，最小为 256；这同时满足六边格横向偶数周期和水文边界闭合。
- 静态有限世界可以不是 128 的倍数，最外层语义块和水文区使用显式有效 bounds，不读取 bounds 外数据。
- 环绕世界在分块、随机采样和 feature ID 生成前先规范化坐标；相对距离使用最短环绕距离。

### 4.3 对齐关系

所有分块从逻辑原点 `(0, 0)` 对齐。一个上层区域必须完整包含整数个下层块，不允许按调用方起点重新对齐。

~~~text
HydrologyRegion 128
└── 4×4 SemanticChunk 32
    └── 2×2 RenderChunk 16
        └── 64×64 core surface samples
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

    readonly terrainClass: Uint8Array;
    readonly macroHeight: Uint16Array;
    readonly biomeWeights: Uint8Array;
    readonly climate: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationKind: Uint8Array;
}
~~~

数组布局固定为 X-major 或 Y-major 中的一种，由 chunk format 锁定；所有模块只能通过共享索引函数访问，不各自重写下标公式。

字段语义：

| 字段 | 布局 | 语义 |
|---|---|---|
| terrainClass | 1× `Uint8`/格 | 基础陆地类别与不可通行语义，不编码河流曲线 |
| macroHeight | 1× `Uint16`/格 | 归一化、量化的权威宏观地表高度 |
| biomeWeights | 4× `Uint8`/格 | 四个材质/生态权重，解码后归一化 |
| climate | 2× `Uint8`/格 | 温度与湿度，供植被和后续玩法查询 |
| vegetationDensity | 1× `Uint8`/格 | 区域植被密度，不是实例列表 |
| vegetationKind | 1× `Uint8`/格 | 冻结枚举或物种表索引 |

海洋不通过一个独立 mesh modifier 表示。低于冻结海平面的宏观地表形成基础海域；湖盆与河流来自水文区域。按格派生出的 `ocean/lake/river` 结果属于查询缓存，不与水文 feature 形成第二份权威。

所有数组长度、枚举范围、权重和量化值在发布到 Store 前一次性校验。对象式 `getTile()` 仅作为按需只读视图存在，不在生成、编译、导航或渲染热路径保存大量对象。

### 5.2 生成与量化

`WorldSurfaceResolver` 保留纯生成规则职责，但输出一次量化写入 `BaseSemanticChunk`。主线程不再为了渲染重新调用 resolver。

量化规则由生成器版本和 chunk format 共同冻结：

- 相同 descriptor 与坐标得到逐字节相同的 semantic chunk。
- 结果与请求顺序、Worker 数量、source chunk 是否命中缓存无关。
- 邻块共享边界使用相同全局采样点和舍入规则。
- 量化发生在权威数据入口，不允许每个消费者自行将浮点结果转成不同精度。

`macroHeight` 表示玩法和渲染共享的宏观表面。Shader 可以添加受限的纯视觉微位移，但城市、单位、树木、路线、拾取和导航不需要复现水波或微法线。

### 5.3 静态世界

`StaticWorldSource` 在加载边界把 `MapInfo` 编译为相同的 32×32 SoA chunk。静态来源可以没有程序种子，但必须提供确定的基础高度、水体和植被解释。进入 `EffectiveWorldView` 后，渲染层不区分静态与程序世界。

## 6. 水文区域与水体权威

### 6.1 唯一权威层级

水体权威固定为：

~~~text
海平面 + 宏观高度                    HydrologyRegion features
        │                         河流 / 湖盆 / 河口 / 连通关系
        └──────────────┬─────────────────────┘
                       ▼
              DerivedHydrologyRaster
           coverage / kind / depth / flow
                       │
                       ▼
               CompiledSurfaceField
~~~

禁止同时持久化“河流 spline”和可编辑的逐格河流占用、下游方向、流量两份权威。逐格结果只能是可丢弃查询缓存或编译产物。

### 6.2 HydrologyRegion

每个 128×128 区域保存有界的矢量水体特征：

~~~ts
interface HydrologyRegion {
    readonly key: HydrologyRegionKey;
    readonly revision: number;
    readonly boundaryPorts: readonly HydrologyPort[];
    readonly rivers: readonly RiverFeatureSegment[];
    readonly lakes: readonly LakeFeature[];
    readonly mouths: readonly RiverMouthFeature[];
}

interface RiverFeatureSegment {
    readonly riverId: HydrologyFeatureId;
    readonly segmentId: HydrologySegmentId;
    readonly controlPoints: Int16Array;
    readonly widthProfile: Uint8Array;
    readonly dischargeClass: number;
    readonly entry: RiverEndpoint;
    readonly exit: RiverEndpoint;
}
~~~

控制点相对区域原点量化。同一条河跨区时共享稳定 `riverId`，各段使用独立 `segmentId` 并通过 boundary port 连接；不把一条无限长河复制到所有经过区域。

### 6.3 跨区域确定性

相邻区域的公共边只由规范化边键决定。边键的唯一拥有者生成 boundary port；两侧根据同一 descriptor、生成器版本和边键得到完全相同的端点、宽度等级、流量等级和连接 ID。

区域内部河段使用固定宏观高度采样和端口约束生成，不读取“当前已经加载的邻区”。汇流只允许流量增加，河口必须连接海域、湖泊或下一段有效端口。发现闭环、孤立出口、重复 feature ID 或边界不匹配时生成失败，不用局部伪河或断头贴图降级。

### 6.4 海洋、湖泊和河流

- **海洋**：由冻结海平面与连续宏观高度场形成，可跨任意数量区域；海岸不是逐格 polygon。
- **湖泊**：由水文区域的盆地 feature 给出连续边界、水位和稳定 water-body ID；地面仍在湖面下连续存在。
- **河流**：由中心样条、宽度剖面、流量等级和流向形成带状水体；渲染宽度提高不会修改权威格子数据。
- **河口**：显式连接河流与海洋或湖泊，负责宽度过渡、流向衰减和材质混合。

这不是完整水文模拟，但必须保证长河、汇流、入海和跨区连续。

### 6.5 空间索引与预算

每个区域在加载后构建可丢弃的紧凑只读空间索引；索引不进入权威格式。查询 16×16 渲染块时只返回与块 bounds 加固定 halo 相交的 feature，不扫描区域全部河流。

生成器必须限制单区域 feature 数、控制点数和序列化字节。超出冻结上限是生成错误，需要修正规则或升级版本，不能静默截断造成跨区断流。

## 7. 生效世界视图与稀疏增量

### 7.1 合并顺序

运行时唯一语义结果为：

~~~text
BaseSemanticChunk
  + SparseSemanticDelta
  + HydrologyRegion
  + SparseHydrologyDelta
  = EffectiveWorldView
~~~

`EffectiveWorldView` 不复制整个世界。无修改 chunk 直接引用基础 SoA；存在修改时通过紧凑覆盖表和版本化快照生成编译输入。

渲染、导航、贴地、植被放置和公开查询都从该视图读取，不允许直接绕过它读取生成器或 delta store。

### 7.2 增量职责

语义增量按 32×32 chunk 保存：

- 高度与地形类别；
- 材质/biome 权重；
- 植被密度与种类；
- 与应用有关、但不属于 surface compiler 的可选格子 section。

水文增量按 128×128 region 保存：

- 新增、修改和删除湖盆；
- 新增、修改和删除河流 feature；
- 水位、宽度剖面、河口和连通关系修改。

河流编辑导致的逐格 coverage 不写回 semantic delta。

调用方提交的是世界坐标中的完整河流或湖泊，不手工维护区域分段。事务层负责裁剪 feature、生成稳定 segment ID 并收集所有受影响 region。Hydrology delta store 必须提供带各区 expected revision 的多区域原子 CAS：任一 revision 冲突时整条 feature 修改都不落盘，不能留下半条新河和半条旧河。不具备该原子契约的 Store 不能用于水文编辑。

### 7.3 只读查询

公共便利 API 可以返回结构化对象：

~~~ts
interface EffectiveTileView {
    readonly terrain: TerrainKind;
    readonly height: number;
    readonly biomeWeights: readonly [number, number, number, number];
    readonly vegetation: VegetationView;
    readonly water?: WaterQueryResult;
}
~~~

这些对象按需创建，不能在 resident map 中逐格常驻。批量系统使用 typed-array window 或迭代器。

## 8. 表面场编译器

### 8.1 输入与输出

`SurfaceCompilationService` 为每个 16×16 渲染块建立不可变编译请求：

~~~ts
interface SurfaceCompileRequest {
    readonly key: RenderChunkKey;
    readonly semanticRevisionVector: Uint32Array;
    readonly hydrologyRevisionVector: Uint32Array;
    readonly compilerRevision: number;
    readonly effectiveWindow: TransferableEffectiveWindow;
}

interface CompiledSurfaceChunk {
    readonly key: RenderChunkKey;
    readonly revisionToken: bigint;
    readonly bounds: CompiledSurfaceBounds;
    readonly field: CompiledSurfaceField;
    readonly waterGeometry?: CompiledWaterGeometry;
    readonly vegetationSeeds: CompiledVegetationSeeds;
}
~~~

请求快照包含 16×16 核心区、两格语义 halo 和相交水文 feature。所有 ArrayBuffer 转移给 Worker；主线程不重新解析同一窗口。

地面 topology 不属于逐块编译结果。近、中、远三张平面三角晶格由所有 GroundLayer chunk 共享；编译块只提供表面场、真实 bounds 和可选的混合水面 geometry。`CompiledWaterGeometry` 使用 discriminated union 表示无水、共享完整水面 patch 或该块独有的轮廓 buffer，避免为全陆地和全水块保存重复顶点。

### 8.2 64×64 核心表面场

近景核心每格采样 4×4。采样位置由逻辑世界坐标和冻结格内格点定义，不按 mesh 局部 AABB 临时均分，因此相邻块、不同 LOD 和独立编译都命中同一世界采样点。

逻辑字段布局：

| 字段 | CPU 量化表示 | GPU 表示 | 用途 |
|---|---|---|---|
| groundHeight | binary16 bits in `Uint16` | `R16F` | 地面顶点高度和 CPU 贴地 |
| materialWeights | 4× `Uint8` | `RGBA8` | 连续地表材质混合 |
| waterLevel | binary16 bits in `Uint16` | `R16F` | 独立水面高度 |
| waterDepth | binary16 bits in `Uint16` | `R16F` | 深浅色、透明度和玩法查询 |
| shorelineDistance | binary16 bits in `Uint16` | `R16F` | 陆水过渡、泡沫、湿岸 |
| flow | 2× `Int8` | `RG8_SNORM` | 河流与局部波纹方向 |
| waterCoverage/kind | 2× `Uint8` | `RG8` | 水面覆盖率与 ocean/lake/river 分类 |

浮点字段的 CPU 数组保存 IEEE 754 binary16 原始位，CPU 通过共享解码器读取，GPU 原样上传为 half-float texel。Shader 对参与宏观几何和查询一致性的字段使用 `texelFetch` 后手动插值，不依赖厂商纹理过滤舍入或可选的浮点线性过滤扩展。

物理纹理可以在不改变逻辑字段的前提下合并通道，但合并方案由 `SURFACE_COMPILER_REVISION` 锁定。按上述布局估算，一个含 gutter 的静态表面场约 70 KiB CPU 数据和同量级 GPU 数据，具体以实际内部格式为准。

动态战争迷雾不进入该静态表面层。雾使用独立的低分辨率 `R8` array texture，允许频繁小额更新而不重新上传约 70 KiB 静态数据。它与可见 surface chunk 共用 slot 页号和 layer 号，但拥有独立存储、标脏和上传记录；surface slot 释放时 GPU fog layer 一并释放，权威 fog state 仍由 fog store 保存。

### 8.3 连续岸线与地形

编译顺序固定为：

1. 从量化宏观高度重建连续地面基底。
2. 应用有效高度编辑，并在编辑边缘使用确定性 falloff。
3. 栅格化海平面、湖盆和河流 feature 得到水体 coverage 与 water-body ID。
4. 计算带符号岸线距离、独立水位和水深。
5. 根据坡度、气候、湿岸距离和 biome 得到材质权重。
6. 选择共享地面 topology，生成必要的水面 coverage mesh 和植被确定性种子。
7. 量化输出，并计算保守 bounds、字节数和内容哈希。

湖泊不再把整格地面删除。水下地面保持连续，岸边由水体 coverage 与地面高度相交形成；湿岸、沙滩、浅水色和泡沫都读取同一 shoreline distance，因此不会出现四套不同边界。

### 8.4 CPU/GPU 一致性

CPU 查询和 GPU 顶点位移共享：

- 相同量化值与解码常量；
- 相同逻辑采样坐标；
- 相同三角划分和双线性/重心插值约定；
- 相同岸线 coverage 阈值。

CPU 不复现纯视觉海浪、法线细节、闪光和环境反射。玩法高度是 groundHeight 或静态 waterLevel；视觉水面位移只能在冻结的小范围内变化。

## 9. GPU 表面场池

### 9.1 分页 DataArrayTexture

每个 resident render chunk 占用一组相同页号和 layer 号。纹理池使用懒分配页：

- 每页固定 128 layers，低于 WebGL2 保证的 256 层上限。
- 高度/水体、材质、流向/coverage 分别使用同层索引的 `DataArrayTexture`。
- 静态字段与动态雾使用独立纹理和更新记录，但共用同一 slot allocator，避免 shader 需要绑定任意的 surface-page/fog-page 组合。
- CPU slot handle 保存 `pageIndex + layerIndex + generation`，不得持有可被复用的裸 layer 引用。
- layer 回收后 generation 增加；迟到的 Worker 或上传任务发现 generation 不匹配时直接丢弃。

WebGL2 shader 不动态索引一组任意页面 sampler。每个纹理页拥有一套共享材质绑定，同页 chunk 共享该材质，draw 只传 `layerIndex`；`pageIndex` 由 CPU 用于选择材质和调度批次。这既符合 GLSL ES sampler 限制，也不会为每个 chunk 复制材质。

Three.js 当前的 array texture 更新接口按 layer 标脏，不承诺任意子矩形更新。因此 v2 的编辑预算按“受影响层完整上传”计算，而不是假设驱动可以只传几个 texel。

### 9.2 GLSL 契约

新的地面与水面材质使用 WebGL2/GLSL 3 和 `sampler2DArray`。不保留 RawShaderMaterial GLSL 1 版本。

Shader 通过世界逻辑坐标计算 field UV，通过页/层索引采样；浮动原点只参与最终模型矩阵。所有纹理访问必须限制在 layer gutter 内，不跨 array layer 过滤。

### 9.3 上下文丢失

WebGL context 恢复时优先从 resident `CompiledSurfaceChunk` 重新创建纹理页和几何；CPU 编译缓存已被淘汰的块重新提交编译。不得切回旧 instanced terrain。

## 10. 合并地面网格与 LOD

### 10.1 几何

每个 16×16 渲染块使用一张焊接的六边格对齐三角晶格，不再为每个 hex 提交 subdivision 3 的独立实例。每档 LOD 的平面 `BufferGeometry` 全局共享，chunk 只提供变换、纹理 layer 和编译 bounds。

- 顶点只保存局部平面坐标和表面场采样坐标。
- 顶点 shader 从 groundHeight 读取宏观高度。
- 格线、格子 ID 和选择边界由逻辑世界坐标解析，不依赖逐 hex geometry。
- 材质混合、湿岸和坡面法线来自表面场。
- 地面 mesh 的 Y bounds 使用编译结果的真实最小/最大高度加视觉微位移上限。

### 10.2 LOD 边界

近、中、远 LOD 只降低区块内部采样密度，所有 chunk 外边界保留冻结的最高边界采样点。每个 LOD 使用过渡三角带连接高分辨率边缘与低分辨率内部。

LOD 切换继续使用 chunk 级迟滞。相邻块即使处于不同 LOD，也必须共享完全相同的边界顶点位置和高度，不依赖 skirt 隐藏错误。skirt 只允许用于观察范围外的保守遮挡，不作为地形裂缝修复方案。

### 10.3 剔除与驻留

16×16 块继续是 frustum、水平距离和 LOD 单元。相比 12×12，它在相同面积下减少约 44% 的调度对象和 draw batch；视锥边缘的额外提交由精确 AABB 和保守高度 bounds 控制。

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

- 核心区和 halo 全部为水时，使用完整规则水面 patch。
- 海岸、湖泊和宽河使用 coverage field 提取的确定性轮廓网格。
- 窄河使用样条扫掠带，并在汇流、河口和湖岸处与 coverage mesh 焊接。
- chunk 边界上的轮廓交点使用全局量化采样位置，独立生成也完全一致。

水面几何只决定覆盖与基础水位；颜色、波纹、泡沫和反射从同一表面场读取。

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
    readonly sunDirection: Vec3;
    readonly sunColor: LinearRgb;
    readonly skyIrradiance: LinearRgb;
    readonly groundIrradiance: LinearRgb;
    readonly environmentMap: EnvironmentHandle;
    readonly exposure: number;
}
~~~

地面、水、树木、草和建筑读取同一太阳方向、线性色彩空间、环境光和曝光。输出统一经过 sRGB 编码与同一 tone mapping，不允许每层用独立经验乘数补亮。

水面使用环境图或解析天空近似产生 Fresnel 反射；树木和 glTF 模型使用同一环境照明与太阳阴影。没有环境贴图时由冻结的解析天空生成环境资源，而不是让植被退回近黑的仅直射光结果。

### 12.2 植被生成

权威语义只保存密度和种类。`SurfaceFieldCompiler` 根据 world seed、逻辑坐标、密度、坡度、水岸距离和稳定 salt 输出确定性 placement seeds：

- 不在陡坡、深水和河道中放置树木。
- 岸边密度连续衰减，不按格突然清空。
- 树根高度由 CPU compiled field 插值。
- LOD 只改变实例保留率和模型，不改变稳定实例身份。

VegetationLayer 可以继续按模型与 LOD 使用 instancing；地面改成合并网格不要求把树木合成静态 geometry。

## 13. 编辑事务与脏区传播

### 13.1 API

编辑只通过类型化事务进入权威数据：

~~~ts
const changeSet = await world.edit(transaction => {
    transaction.raiseTerrain(area, { delta: 0.08, falloff: "smooth" });
    transaction.paintMaterial(area, weights);
    transaction.paintVegetation(area, { density: 0.6, kind: "oak" });
    transaction.upsertLake(lakeId, polygon, { level: 0.12 });
    transaction.upsertRiver(riverId, controlPoints, { width: 0.3 });
});

map.renderStyle.update({
    lighting: { exposure: 0.95 },
    ocean: { swellStrength: 0.7 }
});
~~~

生成器宏观配置如大陆尺度、基础海平面和水文生成参数不属于运行时 edit；修改它们创建新的 world descriptor 和 world identity。

### 13.2 ChangeSet

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
    readonly hydrologyRegions: readonly DirtyHydrologyRegion[];
    readonly renderChunks: readonly DirtyRenderChunk[];
}
~~~

传播规则由 domain 表驱动：

| 变化 | 权威写入 | 派生失效 |
|---|---|---|
| 高度 | semantic delta | 表面场、地面、水深、植被、贴地、导航 |
| 材质 | semantic delta | 材质场、地面 |
| 水文 | hydrology delta | 水文 raster、岸线、水深、地面湿岸、水面、植被、导航 |
| 植被 | semantic delta | 植被 seeds 与实例 |
| 雾 | dynamic fog store | 仅雾纹理层 |
| 光照/水风格 | render style uniform | 不重编译任何 chunk |

### 13.3 原子性与并发

事务先校验全部操作，再以一个 revision 提交权威增量。任一操作非法则整体不生效。

提交后受影响 render chunk 获得新的 revision token，并进入 Worker 编译队列。旧结果即使晚到也不能覆盖新结果。多个连续编辑合并为每块最新快照，取消尚未开始的旧任务；已经执行的任务允许结束但结果会因 token 失效被丢弃。

主线程不维护另一套“先画出来再等权威确认”的临时地形。视觉更新可以异步晚于事务提交，但查询和存档立即读取新 revision。

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

Worker 池至少支持两个明确任务：

1. `generateSemanticChunk`：生成 32×32 BaseSemanticChunk。
2. `compileSurfaceChunk`：将 effective window 编译为 16×16 CompiledSurfaceChunk。

HydrologyRegion 可以由独立任务生成，但与 semantic generation 共用确定性 resolver 和统一调度器。任务协议使用 discriminated union，不用可选字段猜测任务类型。

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
| effective window | 不跨任务缓存 | 任务结束立即释放 | 是 |
| compiled CPU | compiler revision + dependency revisions + render key | CPU 字节、可见性、编辑热度 | 是 |
| GPU surface slot | compiled content token | GPU 字节、LOD/可见性 grace | 是 |
| dynamic fog | session + render key | 玩法驻留与 GPU 字节 | 从 fog store 恢复 |

缓存统计必须报告真实 typed-array、geometry 和 texture 估算字节，不能只报告对象数量。

## 16. 导航、模拟、拾取与贴地

### 16.1 导航

导航摘要按 32×32 semantic chunk 构建，读取 `EffectiveWorldView` 的通行语义与静态水体结果。高度或水文 change domain 会精确失效相交摘要；材质和纯视觉风格不影响导航。

长程导航可以持有 semantic lease，但不能为了寻路创建 GPU surface。

### 16.2 模拟

标准模拟块改为 64×64，与 2×2 semantic chunk 对齐。模拟仍有独立 Store、时钟和活动锚点；64 是默认格式基底，不代表镜头加载 64×64 地形。

实体跨模拟块时只迁移实体状态。需要地形判断的系统按需获取 semantic/hydrology lease，不依赖 compiled render chunk。

### 16.3 拾取与贴地

射线先与 render chunk 保守 bounds 和地面/水面 mesh 相交，再把世界坐标逆映射到逻辑六边格。最终高度使用 CPU `CompiledSurfaceField` 的同一三角插值。

格子选择、路线和建造预览从逻辑坐标生成，不依赖逐 hex mesh 实例 ID。CPU compiled field 未驻留时，查询服务获取 semantic window 并使用同一共享插值模块，不触发 GPU 资源创建。

## 17. 格式、身份和失败策略

### 17.1 版本

完整切换时升级：

~~~ts
WORLD_GENERATOR_VERSION = 6;
WORLD_DESCRIPTOR_FORMAT_VERSION = 2;
WORLD_CHUNK_FORMAT_VERSION = 2;
WORLD_WORKER_PROTOCOL_VERSION = 3;
WORLD_DELTA_FORMAT_VERSION = 3;
HYDROLOGY_REGION_FORMAT_VERSION = 1;
HYDROLOGY_DELTA_FORMAT_VERSION = 1;
SURFACE_COMPILER_REVISION = 1;
~~~

`SURFACE_COMPILER_REVISION` 只用于可重建缓存键，不进入存档格式。`RENDER_SURFACE_FIELD_FORMAT_VERSION` 不作为公共持久化版本存在。

v2 descriptor 不再保存可配置 `chunkSize`；32/128 由格式版本隐含。descriptor 显式记录 semantic chunk format 与 hydrology region format，world identity 至少包含 descriptor version、source kind、seed、generator version、这两个格式版本和拓扑尺寸。

### 17.2 存档

旧 descriptor、packed chunk 和 delta 格式不自动迁移。加载不匹配格式时明确拒绝，并要求重新生成世界或创建新存档。

持久化只保存：

- world descriptor；
- sparse semantic delta；
- sparse hydrology delta；
- 应用自己的实体/战役状态。

BaseSemanticChunk、HydrologyRegion 和 CompiledSurfaceChunk 都可以缓存，但缓存损坏或版本不匹配时删除并重建；它们不是唯一存档副本。

### 17.3 确定性失败

以下情况立即失败，不执行静默 fallback：

- 格式或生成器版本不匹配；
- chunk 数组长度、枚举、量化范围或 bounds 非法；
- 水文边界端口不匹配、feature ID 冲突或河流拓扑非法；
- WebGL2 不支持所需 array texture/GLSL 3 能力；
- 纹理页或资源预算无法容纳最小首屏工作集；
- Layer 依赖环、重复 owner 或过期 revision 写入。

Worker 崩溃可以由既有有界重试策略重启任务；重复失败向上报告，不切换旧渲染器。

## 18. 实施阶段

### 阶段 A：冻结契约与纯数据格式

- 新增固定尺寸常量、坐标/索引函数和 v2 descriptor。
- 实现 BaseSemanticChunk SoA、校验、序列化和按需只读 tile view。
- 把生成器结果一次量化进 32×32 chunk。
- 建立跨 chunk 边界、请求顺序、线程和负坐标确定性测试。

完成标志：主线程不再需要 resolver 才能读取生成地表语义。

### 阶段 B：水文区域

- 实现 128×128 region、稳定 feature ID、边界端口和空间索引。
- 生成海域、湖盆、长河、汇流和河口。
- 实现 derived hydrology raster 查询，不持久化逐格河流权威。
- 覆盖无限和 128 倍数环绕拓扑。

完成标志：跨任意 region 请求顺序，河流端口、宽度、水位和 ID 完全一致。

### 阶段 C：表面编译器与纹理池

- 实现 effective window 和 Worker 编译协议。
- 输出 64×64 core + gutter 的量化表面场。
- 实现 paged DataArrayTexture、generation token、整层上传和 context restore。
- 将动态雾拆到独立 R8 池。

完成标志：CPU/GPU 宏观高度、水位和岸线采样一致，过期任务无法覆盖新 revision。

### 阶段 D：合并地面网格

- 实现 16×16 六边格对齐焊接网格和三档 LOD。
- 实现固定高分辨率边界及过渡三角带。
- 迁移地表材质、格线、选择和 fog 采样。
- 用新 GroundLayer 替换旧 TerrainMesh land path。

完成标志：相同可见面积下不再提交逐 hex 细分实例，chunk/LOD/环绕边界无裂缝。

### 阶段 E：连续水面

- 实现海洋 patch、湖岸/宽河 coverage mesh 和窄河 sweep mesh。
- 实现连续水深色、环境反射、分层波浪和 flow 驱动河流。
- 删除旧海面、湖泊和河流各自重复的岸线计算。

完成标志：海、湖、河具有可辨识形态，岸线平滑且全部读取同一 SDF。

### 阶段 F：统一光照与植被

- 建立共享 LightingState、环境资源、色彩空间和 tone mapping。
- 迁移树、草、建筑与水面光照。
- 由 compiled field 生成植被 placement seeds 和贴地高度。

完成标志：植被不再暗沉脱离环境，所有内置层对太阳、天空和曝光响应一致。

### 阶段 G：编辑、持久化和消费系统

- 实现类型化 transaction、domain bitmask 和脏 bounds 聚合。
- 升级 semantic/hydrology delta Store。
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
- 不同 LOD 相邻块边界顶点完全相同。
- 河流没有断头边界、逆流汇流、重复 ID 或请求顺序依赖。
- ground、水位、shore SDF 和 vegetation placement 在 CPU/GPU 契约允许误差内一致。

### 19.2 性能

性能验证是实现验收，不再用于决定是否退回 12×12：

- 对 1、9、49 个可见 render chunks 分别测量全陆地、海岸、全水和密集河网。
- 记录 Worker 生成/编译、主线程挂载、GPU frame p50/p95、draw calls、顶点调用、上传字节和 resident CPU/GPU 字节。
- 同等可见面积下，地面 chunk/draw 数符合 16×16 理论数量，不出现隐藏逐 hex draw。
- 正常镜头移动不突破既有主线程 frame-task 预算；Worker 批量完成不会同帧全部挂载。
- 单格编辑只上传受影响静态 surface layers；纯 fog 和 uniform 修改不得上传静态 surface layer。
- source、hydrology、compiled CPU 与 GPU pool 均在各自字节预算内稳定淘汰，无随探索距离增长的常驻数据。

如果不达标，修复数据布局、需求集合、批处理或 shader；不恢复旧 12×12 生产路径。

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

1. 权威语义只有 Base + SparseDelta；河流曲线只有 HydrologyRegion + HydrologyDelta。
2. 逐格水体 raster、surface field、mesh、纹理和植被实例全部可重建。
3. 16/32/64/128 是固定格式层级，不是随调用方变化的调优旋钮。
4. 128×128 永远不是渲染、单格编辑或整层 GPU 上传单元。
5. 动态雾与静态 surface field 分离。
6. CPU 与 GPU 共享宏观量化和插值，不要求玩法复现纯视觉细节。
7. 内置渲染层与自定义层遵守同一依赖和生命周期模型。
8. WebGL2 是 v2 唯一生产后端；WebGPU 仍按独立测量门槛决策。
9. 不保留旧格式兼容、旧渲染 fallback 或永久双路径。
10. 文档、格式常量、实现和验收测试必须在每个阶段同步更新。
