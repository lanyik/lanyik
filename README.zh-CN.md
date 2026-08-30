# three-hex-map

这是一个基于 WebGL2 的六边形世界渲染器，当前生产实现只有一条版本化地表权威链：32×32 语义 SoA、128×128 矢量水文区域、16×16 渲染块、确定性 CPU 编译、分页 GPU field、连续水体、编译植被，以及按精确依赖驱动的驻留系统。

旧 packed tile、12×12 `TerrainMesh`、字符串水体 modifier 和粗粒度刷新运行时已经删除；旧格式存档不自动迁移。

## 安装

```bash
npm install three-hex-map three
```

`three` 是 peer dependency，运行环境必须支持 WebGL2。

## 程序化世界

```ts
import {
  HexMap,
  ProceduralWorldAuthoritySource,
  WorldSurfaceWorkerPool,
  createWorldDescriptorV2,
  SURFACE_GPU_PAGE_BYTES,
  SURFACE_FOG_PAGE_BYTES
} from "three-hex-map";

// 把包的 `three-hex-map/world-generator.worker` 导出发布到这个 URL；
// 也可以使用构建器自己的 Worker URL 导入约定。
const workerUrl = new URL("/world-generator.worker.mjs", window.location.origin);
const pool = new WorldSurfaceWorkerPool(workerUrl, { size: 3 });
const descriptor = createWorldDescriptorV2({
  seed: "campaign-01",
  topology: { kind: "infinite" }
});
const source = new ProceduralWorldAuthoritySource({ descriptor, pool, ownsPool: true });

const map = new HexMap({ element: "#world", hexSize: 2, heightScale: 24 });
await map.loadWorld({
  source,
  worker: pool,
  initialTile: { x: 0, y: 0 },
  visibleRadiusTiles: 24,
  prefetchRadiusTiles: 40,
  lod1DistanceTiles: 12,
  lod2DistanceTiles: 28,
  budgets: {
    semanticAuthorityBytes: 4 * 1024 * 1024,
    hydrologyAuthorityBytes: 24 * 1024 * 1024,
    compiledCpuBytes: 32 * 1024 * 1024,
    retainedWindowBytes: 4 * 1024 * 1024,
    compiledWorkingSetBytes: 32 * 1024 * 1024,
    surfaceGpuBytes: SURFACE_GPU_PAGE_BYTES,
    fogGpuBytes: SURFACE_FOG_PAGE_BYTES
  }
});
```

`HexMap.loadWorld()` 原子替换整套渲染会话。source、生效 delta 快照、编译请求、CPU lease、GPU slot、渲染层、查询和拾取使用同一个 descriptor 与精确 revision。

Worker 是独立包导出，但最终公开 URL 由应用或构建器决定；应把它作为单独 module asset 发布，不要内联进主线程 bundle。

随附 demo 继续使用 v1 的右侧控制面板、左上性能监控和原有相机操作。实时视觉参数统一经 `map.setPresentationStyle()` 写入 v2 runtime；“雾效强度”为 `0` 时关闭距离雾，`1` 为世界加载默认值，最高 `2` 会缩短雾距。

## 编辑与存档

`map.edit()` 创建类型化事务。地形编辑必须明确选择 `reject`、`preserve-channel` 或 `coupled` 水文策略。

```ts
await map.edit(transaction => {
  transaction.raiseTerrain(
    { kind: "rectangle", minX: 8, minY: 8, maxX: 12, maxY: 12 },
    { delta: 0.03, falloff: "smooth", waterPolicy: "preserve-channel" }
  );
});

const checkpoint = await map.runtime.store.saveBarrier(
  map.runtime.source.descriptor
);
```

`WorldDeltaStore` v3 在一个世界 CAS revision 下原子提交语义与水文变更；水文 feature 还有独立 CAS revision。提交生成的 `WorldChangeSet` 精确失效渲染、导航和模拟块，过期 Worker 结果不能发布。浏览器持久化可从 `three-hex-map/persistence` 使用 `IndexedDbWorldDeltaStore`。

## 静态世界

`compileStaticWorldAuthority()` 只接受 X-major typed SoA、显式 SHA-256 内容身份和完整 typed hydrology regions；不会解释地形名称、modifier 字符串或隐式水体。

## 包边界

| 入口 | 职责 |
|---|---|
| `three-hex-map` | 权威格式、Worker pool、编译、渲染、编辑、查询、拾取 |
| `three-hex-map/persistence` | DeltaStore v3 与 generation checkpoint |
| `three-hex-map/pathfinding` | `SemanticNavigationIndex` |
| `three-hex-map/simulation` | 与相机无关的 64×64 模拟运行时 |

当前权威版本为 descriptor 2、semantic chunk 2、hydrology region 3、generator 9、surface compiler 3、Worker protocol 5、delta 3。

## 开发门禁

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run benchmark:check
npm run review:world-style
$env:FOUNDATION_SOAK_ITERATIONS='500'; npm run test:soak
```

详见 [v2 架构](docs/surface-render-foundation-v2.md)、[渲染与流式加载](docs/render-streaming.md) 和 [测试策略](docs/testing.md)。

许可证：MPL-2.0。
