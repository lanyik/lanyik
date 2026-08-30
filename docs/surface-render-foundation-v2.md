# 世界表面与渲染基建 v2

状态：原始实施清单第 1–8 步已完成，v2 是唯一生产路径。旧 packed tile、旧 descriptor、旧 WorldSource/Streamer、12×12 TerrainMesh、水体 modifier、粗粒度 refresh、旧导航和旧 Worker 请求已删除；不提供兼容层、迁移或运行时 fallback。

## 1. 最终数据流

```text
WorldDescriptorV2
  ├─ BaseSemanticChunk 32×32 ── SparseSemanticDelta ─┐
  └─ MacroDrainageGraph                              │
       └─ HydrologyRegion 128×128 ─ FeatureDelta ───┤
                                                    ▼
                                           EffectiveWorldView
                                                    │ exact revision
                                                    ▼
                                      SurfaceCompilationService
                                                    │ Worker
                                                    ▼
                                      CompiledSurfaceChunk 16×16
                                                    │
                      ┌─────────────────────────────┼───────────────────────────┐
                      ▼                             ▼                           ▼
                  GroundLayer                  WaterLayer                VegetationLayer
                      └─────────────────────────────┼───────────────────────────┘
                                                    ▼
                                      dependency-driven render session

Dynamic fog authority ── SurfaceFogTexturePool R8 ── GroundLayer
```

生成、静态输入、编辑、导航、模拟、查询、拾取和渲染只读这一条权威链。编译字段、水面 geometry、植被实例和 GPU texture 都是可丢弃、可重建的派生数据。

## 2. 冻结版本和尺度

| 契约 | 当前值 | 责任 |
|---|---:|---|
| `WORLD_DESCRIPTOR_FORMAT_VERSION` | 2 | source、拓扑和 catalog 身份 |
| `WORLD_CHUNK_FORMAT_VERSION` | 2 | 32×32 semantic SoA |
| `HYDROLOGY_REGION_FORMAT_VERSION` | 1 | 128×128 矢量水文切片 |
| `WORLD_GENERATOR_VERSION` | 7 | 程序化语义和水文生成 |
| `WORLD_WORKER_PROTOCOL_VERSION` | 5 | 语义、水文和表面编译消息 |
| `SURFACE_COMPILER_REVISION` | 2 | field、水面 geometry、植被 seed |
| `SURFACE_COMPILE_PROFILE_VERSION` | 1 | 16/4/1/2/66/128 profile |
| `WORLD_DELTA_FORMAT_VERSION` | 3 | semantic + hydrology 原子存档 |
| `WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION` | 3 | 32×32 导航摘要 |

`SurfaceCompileProfile v1` 固定为：

```text
renderChunkSize          = 16 tiles
samplesPerTileInterval   = 4
fieldCoreSize            = 64 texels
gutterTexels             = 1
textureLayerSize         = 66 texels
influenceRadiusTiles     = 2
texturePageLayers        = 128
```

32 与 128 是权威格式；16、4、66 和 128 layers 是整体版本化的可重建编译 profile。调用方不能逐项改尺寸。

## 3. 坐标、拓扑与索引

所有逻辑坐标必须是 safe integer。负坐标分块统一使用数学向下取整：

```ts
chunkX = Math.floor(tileX / chunkSize);
localX = tileX - chunkX * chunkSize;
```

semantic、hydrology、render、navigation 和 simulation 都从逻辑原点对齐。权威数组使用 X-major；调用方必须使用共享坐标/索引函数，不能自行用 `%`、位运算或截断除法重写。

支持：

- 无限程序世界；
- 宽高为 32 正整数倍的程序化环绕世界；
- typed 静态 bounded/toroidal 世界，末端 chunk/region 使用显式 valid bounds。

浮动原点只改变 Scene 局部变换，不进入 descriptor、feature ID、随机相位、dependency key 或编译 checksum。

## 4. 语义权威

`BaseSemanticChunk` 固定包含：

```ts
substrateClass: Uint8Array;      // 1 / tile
macroHeight: Uint16Array;        // 1 / tile
biomeWeights: Uint8Array;        // 4 / tile, sum = 255
climate: Uint8Array;             // 2 / tile
vegetationDensity: Uint8Array;   // 1 / tile
vegetationProfile: Uint8Array;   // 1 / tile
```

一个完整 chunk 是 1024 格、11 KiB payload。格式校验长度、枚举、bounds、权重和量化范围；序列化有逐字节 golden。对象式 tile view 只按需创建，不进入生成、导航、编译或渲染热路径。

程序化 Worker 一次性把连续 landform、biome、climate 和 vegetation 量化为 SoA。主线程挂载不再调用 resolver。

静态世界通过 `compileStaticWorldAuthority()` 输入 X-major typed SoA、显式 64 位十六进制 SHA-256 内容哈希和精确覆盖世界的 typed hydrology regions。它不解析 `MapInfo`、地形字符串、modifier 或隐式水体。

## 5. 水文权威

`MacroDrainageGraph` 冻结下游 rank、终点、汇流和稳定 ID。有限/环绕世界先构造完整低分辨率排水图再切 region；无限世界按原点对齐的 2048×2048 有限流域分解，每个 region 只有有限依赖。

`HydrologyRegion` 保存河段、湖盆、河口、body palette 和裁切产生的 boundary ports，不保存逐格占用。相邻 region 的 port/connection 必须由同一图边派生并逐字节匹配。feature 空间索引和 derived raster 都是可丢弃查询产物。

编辑的 river/lake 使用完整 `HydrologyFeatureDelta`，包含稳定 feature/body ID、控制点、宽度/水位 profile、source/outlet 和 revision。Store 在提交前验证连接目标与河网无环性。

## 6. 生效快照与依赖正确性

`EffectiveWorldView` 把 base semantic/hydrology 与不可变 delta snapshot 合并。每次 capture 产生：

- `worldIdentity`；
- `effectiveRevision`；
- base semantic chunk revision；
- base hydrology region revision；
- 参与窗口的 feature revision。

`SurfaceDependencyKey` 是结构化值，不是易错的拼接字符串。`SurfaceRequestToken` 额外包含 session epoch 和 render-chunk generation。

Worker 结果只有同时满足以下条件才能发布：

1. world identity 相同；
2. compiler/profile identity 相同；
3. dependency key 与当前 effective snapshot 相同；
4. request token 仍是该 render chunk 的当前 generation。

旧世界、旧编辑 revision、已取消 demand 和 context replacement 的结果全部作为 stale 丢弃。

## 7. WorldDeltaStore v3 与编辑

`WorldDeltaStore.commit()` 在一个原子边界内处理 semantic mutations 和 hydrology mutations：

- 世界级 `expectedRevision` CAS；
- feature 级 `expectedRevision` CAS；
- 稀疏 semantic delta 合并和 tombstone；
- feature 图校验；
- 新 immutable delta snapshot；
- 精确 `WorldChangeSet`。

Memory 和 IndexedDB 实现共享契约；IndexedDB 的 read/CAS/write 位于同一个 transaction。冲突或校验失败不会留下部分写入。

`WorldEditTransaction` 提供类型化 raise terrain、paint material、paint vegetation、upsert/delete river/lake。地形与水文冲突策略固定为：

- `reject`：拒绝整个事务；
- `preserve-channel`：把地面夹到水文约束；
- `coupled`：同事务修改 feature，或使用显式 hydrology rebaker。

`WorldEditor` 把连续编辑串行到最新 `effectiveRevision`。提交的 `WorldChangeSet` 根据两格表面影响半径，分别计算 dirty semantic chunks、hydrology regions/features、16×16 render chunks、32×32 navigation chunks 和 64×64 simulation chunks。

`saveBarrier()` 等待提交队列、返回拥有自身 buffer 的 checkpoint，再压缩待提交记录。Generation checkpoint v2 可以把 delta checkpoint 与 simulation checkpoint 放进同一 manifest generation。旧 checksum 和旧存档不恢复。

## 8. CPU 表面编译与查询

每个 16×16 render chunk 构造带两格 halo 的 20×20 `TransferableEffectiveWindow`。窗口包含语义 SoA 与相交的 river/lake feature；它是临时副本，不 detach 权威数组。

编译顺序固定：

1. 重建连续宏观地面；
2. 应用有效高度编辑；
3. 栅格化海洋、湖泊和河流；
4. 计算 water coverage、kind、profile、body palette；
5. 计算 water level、depth、shoreline SDF 和 flow；
6. 计算连续材质权重；
7. 量化 66×66 field 和 bounds；
8. 编译 full/coverage/sweep 水面 geometry；
9. 生成稳定 vegetation seed SoA；
10. 计算精确 byteLength 与 checksum。

四张静态 GPU field 每 layer 的总量为 74,052 字节：

| texture | format | 内容 |
|---|---|---|
| values | `RGBA16F` | groundHeight、waterLevel、waterDepth、shorelineDistance |
| material | `RGBA8` | 四项材质权重 |
| flow | `RG8_SNORM` | 世界 XZ 流向 |
| water | `RGB8` | coverage、kind、profile |

CPU 查询与 shader 共享 lattice、texel-center 双线性采样、binary16 编解码和有效边界。`SurfaceQueryService` 只使用 dependency 仍精确匹配的 resident lease；否则从最新 authority 同步执行同一 reference compiler。拾取只 raycast 新 Ground/Water，然后用 query service 返回最终玩法高度。

## 9. Worker 和内存所有权

生产 Worker 协议只有三种请求：

- `generateSemanticChunk`；
- `generateHydrologyRegion`；
- `compileSurfaceChunk`。

旧 `world`、`chunk`、`vegetation` payload 已删除。`WorldSurfaceWorkerPool` 有固定 worker 数、queue 上限、lane/priority 排序、AbortSignal、一次 worker crash 重启和可观察统计。

编译服务使用显式 byte-budgeted window buffer pool。发送前记录每个 buffer 长度；Worker 成功或编译错误都必须原样归还窗口 buffers。缺失、重复、长度变化或错误 dependency 的返回均确定性拒绝。

## 10. GPU pool、LOD 与表现

`SurfaceTexturePool` 懒分配 128-layer page，四张 texture 使用相同 page/layer。slot handle 包含 pool/page/layer/generation；回收后 generation 增加，迟到上传和释放不能形成 ABA。预算不足一整页时构造失败，页耗尽时 allocate 失败，不切换格式。

动态雾使用独立 16×16 R8 `SurfaceFogTexturePool`，与 surface slot generation 绑定但独立记账和上传。

地面使用三张全局共享、焊接的 LOD 0/1/2 geometry。内部步长分别为 1/2/4 个 4×采样间隔；四条边始终保留 canonical 64 段边界，通过过渡带连接粗内部，不用 skirt 掩盖相邻 LOD 裂缝。

水面模式：

- 无水：不建 mesh；
- 全水：共享 full patch；
- 湖泊/宽河：coverage contour mesh；
- 纯窄河：显式 sweep mesh。

Ground、Water、Vegetation 共享一个 `LightingStateController` 和 Scene binding。水体颜色、波形、flow、shoreline 与 body profile 来自 compiled field；植被只消费 compiled seeds，并按 LOD 取稳定嵌套子集。

## 11. 依赖驱动的生产会话

`WorldRenderSession` 只接受规范化的精确 demand set。`DependencyDrivenRenderGraph` 固定内置顺序：

```text
Ground -> Water -> Vegetation -> dynamic fog
```

卸载顺序严格相反。自定义层必须声明 `requires` 和 `owns`，循环、缺失依赖和重复 owner 在 initialize 时失败。

会话同时执行七类预算：semantic authority、hydrology authority、compiled CPU cache、retained window、compiled working set、surface GPU、fog GPU。超预算时拒绝完整新增集合并回滚，而不是隐式少画或用旧路径。

编辑提交后仅 dirty demanded chunks 取消旧 token、释放旧 lease、重新捕获 authority、编译和上传；其他块保持不动。LOD 变化只切共享 geometry/实例子集，不触发 authority 或 field 重编译。

`SurfacePresentationLayer`、`SemanticNavigationIndex`、`WorldSimulationRuntime.applyWorldChangeSet()`、`SurfacePickingService` 和 `SurfaceQueryService` 都消费结构化 change/dependency 数据，不做全世界 refresh。

## 12. HexMap 切换与生命周期

公开 `HexMap` 构造 WebGL2 renderer、camera 和 controls。`loadWorld()` 在新 Scene 中创建完整 `WorldSurfaceRuntime`，等待初始精确 demand 挂载后才替换 active Scene；过期 load 会释放自己的 runtime，不能覆盖较新的世界。

一个 runtime 唯一拥有：source、store/editor、repository、compiler、query、picking、texture pools、lighting、presentation 和 render session。dispose 按依赖顺序清空 Scene 与 GPU/CPU 资源。WebGL context lost 时停止 session time 更新和需求发布；restore 后从当前 CPU backing 恢复 texture/fog/geometry，不创建旧渲染器。

## 13. 确定性失败边界

以下情况直接失败：

- 版本、descriptor、catalog、compiler 或 profile identity 不匹配；
- safe-integer、bounds、SoA 长度、量化值或权重非法；
- 水文 rank/连接/port/feature 图损坏；
- static hydrology 未精确覆盖世界；
- CAS 冲突；
- queue、CPU、GPU 或工作集预算耗尽；
- Worker 返回错误 transferable 或 stale token；
- WebGL2 不可用；
- render layer dependency 图非法。

没有旧格式兼容、自动迁移、WebGL1、packed tile、字符串水体 modifier、旧 TerrainMesh 或双生产开关。

## 14. 验收门槛

自动化必须覆盖：

- descriptor、semantic serialization 和固定种子逐字节 golden；
- 负坐标、safe-integer 边界、bounded partial、toroidal 四角；
- drainage 有限终止、跨 region port 匹配、请求乱序和卸载重载一致；
- semantic/hydrology 原子提交、世界/feature CAS、连续编辑、save/restore barrier；
- dependency key、request token、取消和 stale result；
- CPU/GPU 采样一致、slot generation、完整 layer upload、context restore；
- 1/9/49 presentation profile 和七类预算；
- 真实 Worker crash replacement、真实 WebGL2 流送、世界原子替换；
- near/middle/far 固定图库和交互检查；
- 非零本地 soak，发布时 500 次 replacement soak。

标准命令见 [testing.md](./testing.md)。

## 15. 原始八步完成映射

1. 权威语义格式：descriptor 2、generator 7、32×32 SoA、serialization、static typed authority、Worker generation。
2. 水文权威：MacroDrainageGraph、128×128 regions、ports、spatial index、derived raster、无限有限依赖。
3. 生效快照：semantic/feature delta、EffectiveWorldView、effectiveRevision、dependency key、request token、change kernel。
4. CPU 编译：lattice、20×20 window、66×66 fields、buffer pool、reference query、stale rejection。
5. GPU/地面：paged array textures、R8 fog、context restore、共享三档 LOD、LightingState、GroundLayer、1/9/49。
6. 水体/植被：full/coverage/sweep water、统一 shoreline/flow/profile、compiled vegetation、共享光照、图库。
7. 编辑/存档/消费：WorldDeltaStore v3、类型化事务、三种水文策略、checkpoint、精确 dirty、导航/模拟/查询/拾取迁移。
8. 一次性切换/删除：dependency-driven HexMap、精确需求与预算、唯一公开入口、删除旧 packed/12×12/modifier/refresh 路径、全量门禁。
