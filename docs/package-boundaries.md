# Package boundaries

The renderer remains the default package entry. Optional game-runtime APIs use
explicit subpaths:

| Import | Responsibility |
|---|---|
| `three-hex-map` | HexMap, rendering, world sources, streaming and core helpers |
| `three-hex-map/persistence` | IndexedDB chunk cache and sparse world deltas |
| `three-hex-map/pathfinding` | Versioned hierarchical navigation summaries and routing |
| `three-hex-map/simulation` | Camera-independent simulation runtime and snapshot stores |

Each subpath has independent ESM, CommonJS and declaration outputs. The classic
`hex-map.global.js` is built from the renderer entry and does not publish the
pathfinding or simulation APIs. Those modules must be loaded through a module
bundler or native ESM when needed.

The 2026-08-26 validation build reports the root ESM at 643.51 KB unminified.
This is a build observation rather than a fixed budget; use the `tsup` output
from `npm run build:lib` as the current measurement. Pathfinding and simulation
remain separate subpaths, so applications do not pull those optional runtimes
through their dedicated imports. Persistence remains internally reachable from
core because `ProceduralWorldSource` supports `cache: true` and
`deltaStore: true`; removing that implementation would require a later async
provider/factory API rather than an `exports`-only change.
