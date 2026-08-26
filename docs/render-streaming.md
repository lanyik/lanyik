# World rendering and streaming

## Pipeline

Every map runs through two intentionally separate chunk layers:

1. `WorldStreamer` asks a `WorldSource` for camera-near source chunks, cancels
   stale requests and releases chunks outside the retention policy.
2. Each resident source chunk mounts terrain, grass and forest as smaller 12×12
   render chunks. `WorldChunkScheduler` then owns their GPU/LOD lifecycle.

`StaticWorldSource` retains the caller's authoritative finite `MapInfo`, including
cities, rivers, units and wrap topology, while streaming only visual layers.
`ToroidalWorldSource` and `ProceduralWorldSource` instead own a packed sparse
tile view and a bounded worker pool. The former is fixed by seed plus dimensions
and samples periodic noise at its seams; the latter is fixed by seed alone and
has no logical edge. Their `MapInfo.data` remains empty: `tileAt()` decodes only the small
set of distinct 16-bit tile variants that are actually read. Both sources reach
the renderer through the same callbacks.

For each resident render chunk, `WorldChunkScheduler` performs this lifecycle:

1. transform the chunk's local AABB into its current toroidal image;
2. reject it by horizontal render distance and the camera frustum;
3. select a stable LOD;
4. ask terrain, grass or forest to activate only the requested chunk;
5. retain recently visited chunks in independent GPU and CPU caches;
6. release WebGL allocations first, then reconstructible CPU attributes.

Toroidal images share the canonical `BufferGeometry`, instance matrices and fog
attributes. Only chunks near a seam are cloned, rather than cloning every chunk
into all eight neighboring world images.

Worker completions do not mount every returned chunk immediately. The center
chunk is admitted synchronously for first-frame feedback; peripheral mounts go
through a priority queue capped by `frameBudgetMs` and `maxMountsPerFrame`.
Toroidal images are diffed by source-object UUID and physical offset; repeated
chunk/model completion notices coalesce into one queued synchronization instead
of clearing and recloning every image. This backpressure prevents a batch of
completed workers from creating a long main-thread frame.

The scheduler builds a flat chunk registry only when the mounted scene changes.
Normal frames iterate that registry directly instead of traversing the Three.js
scene graph. Grass fields share one blade geometry/material/clock per load
session, forest fields share each prepared model geometry/material, and every
layer caches its deterministic CPU result per LOD. Terrain chunks also share one
immutable base hex geometry per LOD; each chunk stores only instance attributes.
Disposing one chunk detaches those shared attributes before Three.js sends its
WebGL-dispose notification, so sibling chunks cannot invalidate each other.

## Frustum culling

Every frame the scheduler multiplies the camera projection matrix by
`camera.matrixWorldInverse`. Three.js extracts the six frustum planes from that
matrix. A chunk is submitted only when its conservative world-space `Box3`
intersects all relevant half-spaces. A horizontal point-to-AABB distance test is
also applied, so a very wide camera frustum cannot retain terrain beyond the
configured surface horizon.

This is explicit chunk culling. The chunk meshes set `frustumCulled = false`
because Three.js does not know about shader displacement and lazy empty geometry;
the scheduler's conservative bounds include water, mountain and grass height.

## LOD policy

| Level | Land subdivisions | Water subdivisions | Grass density | Forest density |
|---|---:|---:|---:|---:|
| LOD 0 | 3 (original quality) | 2 (original quality) | 100% | 100% |
| LOD 1 | 2 | 1 | 38% | 50% |
| LOD 2 | 1 | 0 | 14%* | 20%* |

`*` Decorative chunks normally reach their vegetation cutoff before LOD 2, but
the resource layer supports it for custom policies.

The default thresholds are 900 and 1650 world units. Grass and forests stop at
1450; terrain continues to the 2400 render distance. A 120-unit hysteresis band
keeps a chunk on its current level while the camera oscillates near a threshold.
All hex LODs retain the full-detail rim tessellation; only their inner ring is
simplified. Displaced mountain, beach and wave edges therefore evaluate at the
same points on both sides of an LOD transition, preventing cracks.

## Residency and reconstruction

- GPU target: 128 logical chunks, 300-frame grace period.
- CPU target: 192 logical chunks, 1200-frame grace period.
- Visible chunks are never evicted, even when a budget is temporarily exceeded.
- `BufferGeometry.dispose()` releases WebGL allocations while retaining CPU
  attributes for transparent re-upload.
- Forest instance-matrix and instance-color buffers participate in the same GPU
  eviction lifecycle, independently of their shared model geometry.
- CPU eviction drops reconstructible attributes. The current `WorldSource`,
  persistent fog state and deterministic placement data remain, so revisiting a
  chunk recreates the same surface and decoration layout.

Applications can tune render distances and budgets through `HexMapOptions` and
source residency through `loadWorld()`. `map.worldStreamingStats` reports source
residency, queues and retries; `map.streamingStats` reports render LOD/GPU state.

## Generation

`generateWorld()` remains synchronous for Node, tests and server-side tools, and
`WorldGeneratorClient` remains available when an application explicitly needs a
fully materialized `MapInfo`. The browser demo instead uses
`ToroidalWorldSource` with `world-generator.worker.mjs`, so a 512×512 selection
does not allocate all 262,144 tile objects. It generates the camera window and
keeps the rest reproducible from seed plus dimensions.

## Unified world sources

`HexMap.loadWorld()` owns one source for the duration of a load session. Calling
it again cancels outstanding work, unmounts resident layers and disposes the old
source. It is the preferred extensible loading API; `HexMap.load(mapData)` is a
backwards-compatible `StaticWorldSource` wrapper.

For the built-in procedural source:

1. `WorldStreamer` derives camera-near chunks and asks
   `ProceduralWorldSource` for them by distance priority.
2. `ProceduralWorldSource` submits work to `WorldGeneratorPool`.
3. Each worker returns a single transferred `Uint16Array`: one packed value per
   tile plus a one-cell halo. Generation samples global coordinates, so worker
   count, completion order and negative chunk coordinates cannot change terrain
   or create a coast seam.
4. `SparseWorldChunkStore` retains only the transferred arrays. Its virtual map
   resolves a core cell or neighboring halo directly from those arrays and
   caches decoded values by packed variant, without per-cell objects or string
   reference maps.
5. `TerrainMesh`, `GrassField` and `ForestField` mount only the core cells and
   reuse the normal 12×12 render-chunk LOD scheduler.
6. Chunks outside the retention radius dispose their geometry, grass and tree
   instances and remove their sparse tile data.

Source loads are abortable. A transient failure retries twice by default with
cancellable exponential backoff; changing camera demand or replacing the world
cancels the delay and request. Structural contract failures do not retry:
returned chunk coordinates, size and every core tile are validated against the
source before renderer state is mutated.

Camera velocity is exponentially smoothed and projected ahead by
`predictionSeconds`. Predicted requests may extend only through
`retentionRadius - loadRadius`, preserving the guaranteed current window and the
hard resident budget. Current chunks win priority ties; changes in direction
reuse the same cancellation path as normal camera demand.

## Persistent procedural cache

Passing `cache: true` to `ToroidalWorldSource` or `ProceduralWorldSource` enables
an IndexedDB cache for immutable packed base chunks. Keys include generator
version, seed, topology, finite dimensions, chunk size and chunk coordinates.
Changing any world-defining input therefore creates a distinct entry, while a
generator version bump invalidates old terrain without a database migration.

The cache defaults to a 128 MB byte budget and prunes least-recently-used
entries after writes. Reads clone the transferred `ArrayBuffer`, validate the
packed payload again, and treat missing, corrupt, blocked or unavailable browser
storage as a normal miss. Opening storage also has a two-second fail-open timeout,
so a blocked browser database cannot hold up terrain. Cache I/O never replaces
the worker fallback.

`source.clearCache()` serializes behind outstanding cache writes, advances a
source cache epoch so older in-flight worker results cannot repopulate storage,
and deletes all stored base chunks. The demo exposes this operation as a localized, confirmed
**Clear cached data** control; loaded terrain remains in memory until normal
eviction or regeneration. The operation intentionally does not delete mutable
game saves or `setTileOverride()` state. Passing `deltaStore: true` enables the
separate `IndexedDbWorldDeltaStore`; callers can instead provide a
`WorldDeltaStore` backed by a server or editor database. `source.flushDeltas()`
is the durable save barrier and `source.clearDeltas()` deletes only the active
world's sparse save. `map.worldStreamingStats` exposes hit/miss/error, entry and
byte counters for diagnostics.

A custom `WorldSource` can use HTTP, IndexedDB, a server-authoritative cache or
an editor database. Its `map` is the view read by terrain and gameplay helpers:
it may populate `data`, or expose virtual `tileAt()`/`forEachTile()` hooks.
`loadChunk()` must make the requested cells readable before resolving and
`releaseChunk()` removes transient data when appropriate. Bounded sources also
provide dimensions and wrap flags, while unbounded sources expose an infinite
`MapInfo` view.

Logical coordinates stay exact integers. When the camera's render coordinates
approach `floatingOriginThreshold`, the camera and shared world root are shifted
back towards zero. Terrain, tree models, custom units, orbit lighting and
procedural texture phase remain aligned; `getCameraTarget()` continues to return
the logical rather than rebased coordinate.

Packed procedural base tiles are shared immutable variants. Per-coordinate
gameplay fields use `ProceduralWorldSource.setTileOverride()` and
`clearTileOverride()`, a sparse sidecar that survives chunk eviction for the
source lifetime without expanding every generated cell into an object. Delta
keys include topology, seed, dimensions, chunk size and generator version by
default, while an explicit `worldId` lets applications control save slots.
Chunk snapshots carry a format version and monotonically increasing revision;
incompatible or corrupt records are rejected rather than applied.

`map.worldStreamingStats` works for every source and reports source-chunk
residency, pending work, queue depth, busy workers, completions, retries and
terminal failures. `map.streamingStats` continues to report render-chunk
visibility/LOD/GPU residency. `map.frameTaskStats` reports deferred mount work,
completed/cancelled tasks and the most recent frame's queue cost.

## Worker-prepared vegetation

Procedural and toroidal sources reuse their bounded generation pool for a
second task type: vegetation preparation. After a source chunk becomes
resident, grass and forest share one request containing only its core tiles and
the one-ring halo needed for river, lake and coast clearance. The worker performs
deterministic rejection sampling, tree-spacing checks and all three LOD builds.

The response contains transferable `Float32Array`/`Uint32Array` buffers. Grass
receives ready-to-bind offset, tile-offset, angle, scale, phase and shade
attributes; forests receive ready-to-upload column-major instance matrices,
grouped by tree model and 12x12 render chunk. The main thread still owns model
loading, Three.js object creation, fog state and WebGL buffer upload, but no
longer runs the per-blade/per-tree layout loops for streamed procedural worlds.
Queued preparation is distance-prioritized and cancellable when a chunk is
evicted. Static/custom sources without `prepareVegetation()` keep the existing
synchronous layout path, so the optional `WorldSource` capability is backward
compatible.

The shared pool reserves one Worker slot for terrain by default whenever it has
more than one Worker (`reservedChunkWorkers` is configurable). Vegetation may
use the remaining slots, but it cannot occupy the reservation while terrain is
absent. A newly requested center Chunk can therefore start immediately instead
of waiting behind several non-preemptible ~11ms vegetation jobs. Pool stats
separate queued/running terrain and vegetation work and expose an EMA for each
task duration; a single-Worker pool remains fully utilized.

## Batched GPU attribute updates

Fog/frontier changes are grouped by resident terrain, grass and forest buffer.
The renderer writes the underlying typed arrays in slices, merges overlapping
or adjacent component ranges, and marks each attribute once. Pending Three.js
update ranges are included in the merge, so several gameplay calls before the
next frame cannot accumulate redundant uploads. Cached terrain LOD attributes
are marked together to prevent a later LOD switch from exposing stale GPU data.

Tile overrides also take an incremental terrain path. Changes that keep an
instance on the same land or water draw layer update style, neighbor atlas,
priority/kind and river/lake edge attributes in place for the tile and its
one-ring dependents. A land-to-water or water-to-land transition still rebuilds
the affected 12x12 render chunk because its draw-batch membership changes.
City models refresh only when their name/model signature changes; decorative
grass and forest layers retain their safe layer-remount behavior.

## Adaptive frame budget

`loadWorld()` enables adaptive streaming by default. The controller now keeps
independent main-thread, GPU and Worker pressure levels. Each uses an EMA,
separate overload/recovery thresholds, consecutive-frame gates and a cooldown,
so an isolated hitch cannot oscillate quality. Actuators are deliberately
routed by cause:

- frame-task duration/backlog/oldest age control only the main-thread
  `FrameTaskScheduler` millisecond and task budgets;
- GPU timing, when supplied by a host, controls internal render resolution,
  vegetation density, LOD distances and vegetation-first LOD bias. When
  explicit timing is unavailable and all observable frame-task and Worker
  queues are idle, sustained slow animation frames provide a conservative
  render-pressure fallback;
- an explicit Worker-contention measurement controls Worker count (busy
  Workers still retire only after their current request settles).

Worker busy ratio and queue depth are telemetry, not proof of contention: a
full queue normally means the pool needs its configured capacity, so it no
longer causes Worker count to be reduced. `AdaptiveStreamingController.sample`
accepts CPU/GPU time, frame-task age/backlog, Worker saturation/contention,
Chunk latency, upload bytes and draw calls. `HexMap` supplies the signals it can
measure portably and exposes the rest for renderer backends or application
instrumentation. The frame-time fallback is disabled while observable work is
busy, so streaming or Worker pressure is not mislabeled as GPU pressure.

Legacy/background-gap samples above 250ms are ignored. Structured samples from
the visible `HexMap` loop are capped at 250ms but remain actionable. Recovery is
intentionally slower than degradation. Applications can opt out with
`adaptiveStreaming: false`, set
`targetFrameMs`, tune the consecutive/cooldown frame counts, and inspect
`map.adaptiveStreamingStats`. The original `frameBudgetMs`,
`maxMountsPerFrame`, Worker count and LOD options remain the level-0 ceiling.
When GPU quality changes, resident vegetation is migrated as prioritized frame
tasks instead of applying the new density only to future chunks. Near chunks
start first, async builds carry the requested quality signature, and completed
grass/forest objects replace the previous objects only after the new resources
are ready. Superseded work cannot publish after a later quality transition.

## Registering render layers

Streaming terrain, cities, grass and forests use the same `WorldRenderLayer`
registry exposed to applications. A road, resource or boundary layer can be
registered without adding another lifecycle branch to `HexMap`:

```ts
await map.registerWorldRenderLayer({
    id: "roads",
    kinds: ["road"],
    mountChunk(context) {
        const object = buildRoadChunk(context.map, context.points);
        tagWorldChunk(
            object,
            context.key,
            "road",
            getWorldChunkBounds(context.points, context.tileSize, 0, 2)
        );
        context.addObject(object);
    },
    unmountChunk() {}, // context-tracked objects are removed by HexMap
    refreshTiles({ tiles }) {
        updateRoadTiles(tiles);
    },
    activateLod(metadata, lod, visibleCopies) {
        return activateRoadGeometry(metadata, lod, visibleCopies);
    },
    releaseChunk(metadata) {
        releaseRoadGeometry(metadata);
    },
    dispose() {
        disposeRoadResources();
    }
});
```

Registration also works while a world is loaded: every resident source chunk
is mounted before the returned promise resolves. Async builders receive an
`isCurrent()` guard, layers unload in reverse registration order during a world
switch, and `unregisterWorldRenderLayer()` removes tracked objects and calls
`dispose()`. Layers with `refreshTiles()` receive coalesced tile-and-neighbor
changes without a full chunk remount; other layers use the safe remount path.
Lifecycle failures are aggregated after all remaining cleanup hooks have run;
objects added through the host are removed even when mount or unmount throws.

## Fog and unit hot paths

Fog visibility recomputation iterates only the previous and current visible
frontiers, rather than scanning the full map. `HexMap.setTilesFog()` batches
renderer changes and routes them to the owning resident source chunk. Finite
worlds keep the persistent renderer-side copy in a lazily allocated byte array;
infinite worlds retain sparse keys. Attribute uploads use partial update ranges.
Visibility flood-fill traverses only materialized tiles, so sparse holes are
barriers rather than implicit cells. Explored state remains keyed by logical
coordinate after a source Chunk leaves residency and is restored when that tile
is rendered again.

`GameEngine` keeps stable unit/viewer arrays. Moving and camera-near units update
their animation mixers every frame; idle units beyond `unitAnimationDistance`
default to `farUnitUpdateInterval` updates. Stationary wrapped units also skip
transform writes until their nearest physical world copy changes.

Run `npm run benchmark` after performance changes. It builds the library and
measures packed chunk residency plus the 512×512 fog frontier using fixed input.

## Browser stress and leak checks

`npm run test:e2e` builds the distributable demo and runs the streaming system
in Chromium with software WebGL. The suite first loads the generated Worker as a
standalone module, which catches browser-incompatible bare imports and transfer
protocol regressions before the heavier rendering cases start.

The long-distance case moves the logical camera target from source chunk 0 to
chunk 60, crossing the floating-origin threshold several times. At every stop it
waits for demand to settle and asserts bounded source residency, render/GPU
residency and texture counts. The replacement case regenerates five differently
seeded infinite worlds in one renderer and rejects monotonic or excessive
`WebGLRenderer.info.memory` growth. Both cases attach their raw JSON samples to
the Playwright result; traces, screenshots and videos are retained on failure
and uploaded by CI.

The backend/culling crossover benchmark and migration decision are recorded in
[`render-backend-evaluation.md`](./render-backend-evaluation.md).
