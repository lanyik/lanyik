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
| `three-hex-map` | HexMap, rendering, world sources, streaming, persistence contracts and core helpers |
| `three-hex-map/persistence` | IndexedDB chunk cache, sparse world deltas and recoverable checkpoints |
| `three-hex-map/pathfinding` | Versioned hierarchical navigation summaries and routing |
| `three-hex-map/simulation` | Camera-independent simulation runtime and snapshot stores |
| `three-hex-map/infinite-water-curve-field` | Deterministic curve/polyline queries shared by generator v8 and the browser visual inspector |

Each subpath has independent ESM, CommonJS and declaration outputs. The classic
`hex-map.global.js` is built from the renderer entry and does not publish the
pathfinding, simulation or curve-field authoring APIs. Those modules must be
loaded through a module bundler or native ESM when needed. Production world
generation still contains the curve sampler internally because it owns the
generated-water result.

The validation build reports the current root ESM size in the `tsup` output.
This is a build observation rather than a fixed budget; use the `tsup` output
from `npm run build:lib` as the current measurement. Pathfinding, simulation and
browser persistence remain separate subpaths, so applications do not pull those
optional runtimes through their dedicated imports. The root exposes only the
cache/delta capability contracts and deterministic normalization/key helpers.
Applications explicitly construct IndexedDB implementations from
`three-hex-map/persistence` and pass them to a world source, which owns and
disposes option-level stores. `npm run check:package-boundaries:built` scans all
root runtime formats after a build and fails if IndexedDB implementation markers
cross that boundary.
