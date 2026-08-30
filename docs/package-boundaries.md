# 包边界

| 入口 | 责任 |
|---|---|
| `three-hex-map` | v2 descriptor/semantic/hydrology 格式、Worker、编译器、渲染器、编辑器、查询与拾取 |
| `three-hex-map/persistence` | `WorldDeltaStore` v3、checkpoint journal、generation checkpoint v2 |
| `three-hex-map/pathfinding` | 基于生效语义快照的 `SemanticNavigationIndex` |
| `three-hex-map/simulation` | 64×64 模拟块、活跃/后台 tick 与 checkpoint store |

主入口的 `HexMap` 只接收 `WorldAuthoritySource` 和 `SurfaceCompilationWorker`。它不接收 MapInfo、packed chunk、旧 WorldSource 或渲染后端开关。

`WorldSurfaceRuntime` 持有一个世界会话的 source、delta store、editor、authority repository、compiler、query、picking、GPU pool、lighting 和 presentation。`WorldRenderSession` 释放时按依赖图逆序拆除对象；source 最终随 repository 释放。应用若把一个 `WorldSurfaceWorkerPool` 同时交给 procedural source 与 compiler，必须让 source 使用 `ownsPool: true`，从而在会话结束时唯一释放。

静态世界通过 `compileStaticWorldAuthority()` 接入，只接受量化 typed SoA 和完整 typed hydrology regions。程序化世界通过 `ProceduralWorldAuthoritySource` 接入。两者从 repository 之后共享同一条生效快照、编译和渲染路径。
