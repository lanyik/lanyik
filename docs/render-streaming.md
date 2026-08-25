# World rendering and streaming

## Pipeline

Every map runs through two intentionally separate chunk layers:

1. `WorldStreamer` asks a `WorldSource` for camera-near source chunks, cancels
   stale requests and releases chunks outside the retention policy.
2. Each resident source chunk mounts terrain, grass and forest as smaller 12×12
   render chunks. `WorldChunkScheduler` then owns their GPU/LOD lifecycle.

`StaticWorldSource` retains the caller's authoritative finite `MapInfo`, including
cities, rivers, units and wrap topology, while streaming only visual layers.
`ProceduralWorldSource` instead owns a packed sparse tile view and a bounded
worker pool. Its `MapInfo.data` remains empty: `tileAt()` decodes only the small
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
This backpressure prevents a batch of completed workers from creating a long
main-thread frame.

The scheduler builds a flat chunk registry only when the mounted scene changes.
Normal frames iterate that registry directly instead of traversing the Three.js
scene graph. Grass fields share one blade geometry/material/clock per load
session, forest fields share each prepared model geometry/material, and every
layer caches its deterministic CPU result per LOD.

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

`generateWorld()` remains synchronous for Node, tests and server-side tools. The
browser demo uses `WorldGeneratorClient` and `world-generator.worker.mjs`, so
noise sampling and coast classification for worlds up to 512×512 do not block
the main render thread. The resulting plain `MapInfo` remains compatible with
pathfinding, fog, picking and gameplay systems.

## Unified world sources

`HexMap.loadWorld()` owns one source for the duration of a load session. Calling
it again cancels outstanding work, unmounts resident layers and disposes the old
source. It is the sole loading API; callers explicitly choose a built-in or
custom `WorldSource`.

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

`map.worldStreamingStats` works for every source and reports source-chunk
residency, pending work, queue depth, busy workers, completions, retries and
terminal failures. `map.streamingStats` continues to report render-chunk
visibility/LOD/GPU residency. `map.frameTaskStats` reports deferred mount work,
completed/cancelled tasks and the most recent frame's queue cost.

## Fog and unit hot paths

Fog visibility recomputation iterates only the previous and current visible
frontiers, rather than scanning the full map. `HexMap.setTilesFog()` batches
renderer changes and routes them to the owning resident source chunk. Finite
worlds keep the persistent renderer-side copy in a lazily allocated byte array;
infinite worlds retain sparse keys. Attribute uploads use partial update ranges.

`GameEngine` keeps stable unit/viewer arrays. Moving and camera-near units update
their animation mixers every frame; idle units beyond `unitAnimationDistance`
default to `farUnitUpdateInterval` updates. Stationary wrapped units also skip
transform writes until their nearest physical world copy changes.

Run `npm run benchmark` after performance changes. It builds the library and
measures packed chunk residency plus the 512×512 fog frontier using fixed input.
