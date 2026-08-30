# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- 完整的 surface/render foundation v2：descriptor v2、32×32 typed semantic authority、128×128
  hydrology regions、effective snapshots、revision/token 正确性、CPU surface compiler、分页 GPU fields、
  16×16 三档 LOD 地面、连续水体、稳定植被和统一 lighting。
- 原子 `WorldDeltaStore` v3，统一提交 semantic delta 与 hydrology feature delta，并提供 revision CAS、
  checkpoint snapshot 和 IndexedDB 实现。
- 类型化 `WorldEditor` 事务以及 `reject`、`preserve-channel`、`coupled` 水文编辑策略；每次提交生成精确
  semantic/hydrology/render/navigation/simulation dirty set。
- `WorldAuthorityRepository`、`SurfaceCompilationService`、`SurfaceQueryService`、
  `SurfacePickingService`、`SemanticNavigationIndex` 和 dependency-driven `WorldRenderSession`。
- 唯一公开的 v2 `HexMap`/`WorldSurfaceRuntime` 路径，具有显式七类字节预算、精确 demand、过期结果拒绝、
  世界原子替换和 WebGL2 context restore。
- v2 generation checkpoint manifest，将 simulation 与 world delta 在同一 generation 中提交。
- 覆盖 golden、负坐标、乱序水文、CAS 冲突、连续编辑、stale worker、1/9/49 presentation、Worker crash、
  WebGL2 restore、世界替换 soak 和性能 gate 的测试与基准。

### Changed

- descriptor format 升至 2、semantic chunk format 升至 2、generator 升至 7、Worker protocol 升至 5、
  delta store 升至 3、generation checkpoint 升至 2。
- procedural 与 static 世界都必须先编译为同一 typed authority；static 输入不再接受对象 tile、字符串
  modifier 或隐式水文。
- 渲染调度改为精确 dependency set 和分层字节预算；编辑只重编译并上传受影响的 render chunk。
- demo、README、架构文档、E2E、soak、benchmark 和视觉图库统一使用 v2 生产链路。

### Removed

- packed tile 世界、旧 `WorldSource`/`WorldStreamer`/residency/controller、`WorldSurfaceView` 热路径和旧
  Worker generation 请求。
- 旧 12×12 `TerrainMesh`、旧水体 modifier、旧 fog/forest/grass/city/unit render layers 与 shader。
- `MapInfo`/对象 tile static 输入、旧 `PathFinder`/`HierarchicalPathfinder`/`ArmyMarch` helper，以及
  所有兼容导出和 fallback。

### Fixed

- 恢复 v2 唯一生产渲染路径的天空/距离雾、世界坐标地表细节、统一六边格、沙岸、水面深浅层次/浪带/泡沫和分层植被表现；Ground/Water 外圈增加不改变权威 UV 的微型 overlap guard，并用 gutter 对称法线采样消除多 chunk 亚像素漏缝与光照接缝。
- Ground/Water 共享页材质现在会在每个 chunk draw 前上传 texture layer、有效边界和水面 phase，修复多块世界误采样单一 GPU slot 造成的规则断崖与接缝。
- 旧 revision 的 Worker、query、picking、navigation、simulation 和 GPU 结果无法再发布到新世界。
- authority transferable 不会因 Worker transfer detach；buffer pool、GPU slot generation 和 context
  restore 均保持确定所有权。
