# three-hex-map

A WebGL2 hex-world renderer built around one versioned surface-authority pipeline. The current production path uses 32×32 semantic SoA chunks, 128×128 vector hydrology regions, 16×16 render chunks, a deterministic CPU compiler, paged GPU fields, continuous water, compiled vegetation, and exact dependency-driven residency.

The old packed-tile, 12×12 `TerrainMesh`, string-water-modifier, and coarse-refresh runtimes have been removed. Existing saves using those formats are not migrated.

## Install

```bash
npm install three-hex-map three
```

`three` is a peer dependency. The runtime requires WebGL2.

## Procedural world

```ts
import {
  HexMap,
  ProceduralWorldAuthoritySource,
  WorldSurfaceWorkerPool,
  createWorldDescriptorV2,
  SURFACE_GPU_PAGE_BYTES,
  SURFACE_FOG_PAGE_BYTES
} from "three-hex-map";

// Publish the package's `three-hex-map/world-generator.worker` export at this URL.
// A bundler may instead provide its own Worker URL import convention.
const workerUrl = new URL("/world-generator.worker.mjs", window.location.origin);
const pool = new WorldSurfaceWorkerPool(workerUrl, { size: 3 });
const descriptor = createWorldDescriptorV2({
  seed: "campaign-01",
  topology: { kind: "infinite" }
});
const source = new ProceduralWorldAuthoritySource({
  descriptor,
  pool,
  ownsPool: true
});

const map = new HexMap({
  element: "#world",
  hexSize: 2,
  heightScale: 24
});

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

`HexMap` enables the atmospheric sky, prefetch-radius distance fog, and a light-blue background by default. Set `skyVisible: false` to omit the sky shader or use `backgroundColor` to override the background and fog color. Ground, water, and vegetation still consume only v2 compiled fields.

`HexMap.loadWorld()` replaces a complete render session atomically. The source, effective delta snapshot, compiler requests, CPU leases, GPU slots, render layers, queries, and picking service all use the same descriptor and exact revision.

The bundled demo keeps the established v1 operator shell: the right-side `dat.GUI` control panel, top-left performance monitor, WASD camera translation, left-click selection, right-drag orbit, and wheel zoom. Those controls are adapters over the single v2 runtime; they do not restore the removed renderer or world-source path. Live presentation controls are applied through `map.setPresentationStyle()`, which updates distance-fog strength, ground/water shader uniforms, and deterministic vegetation instances without recompiling authority data. A fog strength of `0` disables distance fog; `1` preserves the world-load default and values up to `2` bring the fog range closer.

The Worker file is a package export, but its final public URL is application/bundler-specific. Deploy that export as a separate module asset; do not inline it into the main-thread bundle.

## Editing and saves

`map.edit()` builds a typed transaction. Terrain edits select an explicit water policy: `reject`, `preserve-channel`, or `coupled`.

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

`WorldDeltaStore` format 3 commits semantic and hydrology mutations under one world CAS revision. Hydrology features also carry feature-level CAS revisions. A committed `WorldChangeSet` precisely invalidates render, navigation, and simulation chunks; stale Worker results cannot publish.

For durable browser storage, pass `IndexedDbWorldDeltaStore` from `three-hex-map/persistence` into `loadWorld()`.

## Static world input

`compileStaticWorldAuthority()` accepts only typed, X-major SoA fields plus an explicit SHA-256 content identity and typed hydrology regions. It does not parse terrain names, modifier strings, or implicit water data.

## Package boundaries

| Import | Responsibility |
|---|---|
| `three-hex-map` | Authority formats, Worker pool, compiler, renderer, editor, queries, picking |
| `three-hex-map/persistence` | Delta-store v3 and generation checkpoints |
| `three-hex-map/pathfinding` | `SemanticNavigationIndex` |
| `three-hex-map/simulation` | Camera-independent 64×64 simulation runtime |

Canonical identities are currently descriptor format 2, semantic chunk format 2, hydrology region format 3, generator 9, surface compiler revision 4, Worker protocol 5, and delta format 3.

## Development gates

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run benchmark:check
npm run review:world-style
$env:FOUNDATION_SOAK_ITERATIONS='500'; npm run test:soak
```

See [the v2 architecture](docs/surface-render-foundation-v2.md), [rendering and streaming](docs/render-streaming.md), and [test strategy](docs/testing.md).

License: MPL-2.0.
