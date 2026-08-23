# World rendering and streaming

## Pipeline

The renderer keeps the authoritative `MapInfo` in memory, but it does not build
render data for every tile. Each visual layer creates inexpensive 12×12 chunk
shells with conservative bounds. `WorldChunkScheduler` then owns this lifecycle:

1. transform the chunk's local AABB into its current toroidal image;
2. reject it by horizontal render distance and the camera frustum;
3. select a stable LOD;
4. ask terrain, grass or forest to activate only the requested chunk;
5. retain recently visited chunks in independent GPU and CPU caches;
6. release WebGL allocations first, then reconstructible CPU attributes.

Toroidal images share the canonical `BufferGeometry`, instance matrices and fog
attributes. Only chunks near a seam are cloned, rather than cloning every chunk
into all eight neighboring world images.

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
- CPU eviction drops reconstructible attributes. The source `MapInfo`, persistent
  fog state and deterministic placement seeds remain, so revisiting a chunk
  recreates the same surface and decoration layout.

Applications can tune the distances and budgets through `HexMapOptions`, disable
LOD while retaining streaming, and inspect live counts through
`map.streamingStats`.

## Generation

`generateWorld()` remains synchronous for Node, tests and server-side tools. The
browser demo uses `WorldGeneratorClient` and `world-generator.worker.mjs`, so
noise sampling and coast classification for worlds up to 512×512 do not block
the main render thread. The resulting plain `MapInfo` remains compatible with
pathfinding, fog, picking and gameplay systems.
