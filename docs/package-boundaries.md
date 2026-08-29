# Package boundaries

The runtime foundation types (`LifecycleScope`, `ResourceBudgetLedger`,
`PriorityTaskQueue`, and `RuntimeWorkCoordinator`) are exported from the main
entry. Recoverable checkpoint infrastructure is also available from the
`three-hex-map/persistence` subpath. See
[foundation-infrastructure.md](./foundation-infrastructure.md) for ownership
and recovery contracts, and
[foundation-v1-freeze.md](./foundation-v1-freeze.md) for the versioning rules
and final freeze gate. The versioned terrain-content layer is implemented and
frozen in [world-style-generation-v1.md](./world-style-generation-v1.md). The test layers
and their execution policy are defined in [testing.md](./testing.md).

`ResourceBudgetLedger` is the low-level owner API. Applications extending a
`HexMap` should normally use `map.createResourceAccount(label)` and retain the
returned reservation handles; `map.resourceBudget` is intentionally a frozen
diagnostics-only view so an extension cannot clear or force the shared ledger.

The renderer remains the default package entry. Optional game-runtime APIs use
explicit subpaths:

| Import | Responsibility |
|---|---|
| `three-hex-map` | HexMap, rendering, world sources, streaming and core helpers |
| `three-hex-map/persistence` | IndexedDB chunk cache, sparse world deltas and recoverable checkpoints |
| `three-hex-map/pathfinding` | Versioned hierarchical navigation summaries and routing |
| `three-hex-map/simulation` | Camera-independent simulation runtime and snapshot stores |

Each subpath has independent ESM, CommonJS and declaration outputs. The classic
`hex-map.global.js` is built from the renderer entry and does not publish the
pathfinding or simulation APIs. Those modules must be loaded through a module
bundler or native ESM when needed.

The validation build reports the current root ESM size in the `tsup` output.
This is a build observation rather than a fixed budget; use the `tsup` output
from `npm run build:lib` as the current measurement. Pathfinding and simulation
remain separate subpaths, so applications do not pull those optional runtimes
through their dedicated imports. Persistence remains internally reachable from
core because `ProceduralWorldSource` supports `cache: true` and
`deltaStore: true`; removing that implementation would require a later async
provider/factory API rather than an `exports`-only change.
