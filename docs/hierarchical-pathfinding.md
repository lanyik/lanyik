# Hierarchical pathfinding

`HierarchicalPathfinder` finds long routes without making the rendering window
resident along every high-level search branch.

```text
start/end detail chunks
        ↓
Portal graph search through WorldNavigationIndex summaries
        ↓
ordered source-chunk corridor
        ↓
lease only corridor detail through ChunkResidencyCoordinator
        ↓
per-chunk local BFS and exact portal stitching
```

Each version 2 `WorldNavigationChunkSummary` groups continuous passable boundary
crossings into entrances and keeps at most two symmetric representative
portals per entrance by default. It then stores the weighted shortest cost
between every connected representative inside that Chunk. On a 12x12 open
interior Chunk this reduces 94 directed crossings to 10 representatives and
the cost matrix from 8,836 to 100 cells.
The high-level search reads summaries only. Once it finds a corridor, local
search validates and expands it using exact resident tiles.

```ts
import {
    HierarchicalPathfinder,
    ProceduralWorldNavigationIndex
} from "three-hex-map/pathfinding";
import { getChunkResidencyCoordinator } from "three-hex-map";

const navigation = new ProceduralWorldNavigationIndex({
    source,
    movementType: "walker",
    passable: tile => unitTerrain[tile.type] !== undefined,
    movementCost: tile => unitTerrain[tile.type],
    deltaRevision: 0
});

const finder = new HierarchicalPathfinder(
    source,
    navigation,
    tile => unitTerrain[tile.type] !== undefined,
    {
        residency: getChunkResidencyCoordinator(source),
        movementType: "walker",
        movementCost: tile => unitTerrain[tile.type]
    }
);
const route = await finder.find(start, destination, {
    maxVisitedPortals: 100_000,
    signal: abortController.signal
});

unit.follow(route.path);
// Release path-owned leases after the movement system no longer needs their
// detailed tiles. Other owners' leases for the same chunks remain valid.
route.release();
```

`ProceduralWorldNavigationIndex` deterministically derives summaries from
packed terrain without calling `WorldSource.loadChunk()` or installing tiles in
the render source. It borrows the procedural source's `sampleBaseChunk()` path,
which sends generation to the existing bounded Worker pool using the complete
source descriptor and cached Worker resolver. It creates no additional Workers
and does not own/dispose the borrowed source. Its LRU bounds summary memory
independently of world size.
Unless explicitly overridden for an authored source, its `terrainRevision` is
the canonical serialized world descriptor fingerprint, matching procedural and
toroidal `WorldSource.getChunkRevision()`; a bare generator version is not a
complete terrain identity.
Seed, dimensions, chunk size and water style come directly from the source,
avoiding independently configured navigation terrain. Custom passability and
movement-cost callbacks still execute on the calling thread during the compact
summary build; each uncached summary yields a browser task before this work.
Terrain sampling no longer blocks that thread. The pathfinder's AbortSignal
reaches queued/running sampling requests; clear, per-chunk invalidation and
dispose cancel pending work and prevent late cache publication. Cancelling a
running Worker task rejects its result; it does not preempt synchronous Worker
computation. A separate data-only movement protocol is needed to move arbitrary
summary rules into Workers.
For authored/server worlds, build summaries with
`buildWorldNavigationSummary()` and store them in `MemoryWorldNavigationIndex`
or implement `WorldNavigationIndex` over a database/CDN.

Every navigation index has an explicit `clear()`/`dispose()` lifecycle. Both
built-in indexes release their summary maps on disposal and reject later reads;
the application disposes its index when its world session ends.
Custom indexes must provide the same deterministic ownership
boundary even when their summaries live outside process memory.

The passability and movement-cost rules used to build summaries must match the
rules passed to the finder. Different unit movement classes use separate
indexes identified by `movementType`. Summaries also carry `terrainRevision`
and `deltaRevision`; `invalidateChunk()` removes a stale entry from either
built-in index. Procedural/toroidal sources expose their current per-Chunk
revision, so the finder automatically invalidates and retries a mismatched
summary, then throws `StaleWorldNavigationSummaryError` if the index still
cannot provide the matching revision. The owner of authored deltas must rebuild
or fetch that summary—silently applying a base-terrain summary to modified
terrain is not safe.

`maxPortalsPerEntrance` trades route fidelity for summary size. The default of
two preserves both ends of long openings; raise it for precision-sensitive maps
or set it above the boundary size to retain every crossing. Chunk summaries are
the measured bottleneck addressed by version 2. A Region/Continent graph is
still a future tier: add it only when traces show that searches visit too many
Chunk summaries, because another hierarchy increases preprocessing,
invalidation, and storage costs.
Search is cancellable, has a hard portal-visit limit, validates detailed local
segments, and releases all path-owned leases automatically when it throws.

The legacy synchronous `PathFinder` is intentionally a finite-map API. It now
rejects `map.infinite` at construction instead of silently truncating paths via
the compatibility `w * h` fields. Infinite or streamed worlds must use
`HierarchicalPathfinder`, whose search budget and residency lifetime are
explicit.
