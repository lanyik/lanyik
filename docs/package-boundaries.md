# Package boundaries

导航：[总导航 · 地图基础库](README.md#foundation) · [按任务阅读](README.md#routes)

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

Each subpath has independent ESM, CommonJS and declaration outputs. The classic
`hex-map.global.js` is built from the renderer entry and does not publish the
pathfinding or persistence implementation APIs. Those modules must be loaded through a module
bundler or native ESM when needed.

The validation build reports the current root ESM size in the `tsup` output.
This is a build observation rather than a fixed budget; use the `tsup` output
from `npm run build:lib` as the current measurement. Pathfinding and
browser persistence remain separate subpaths, so applications do not pull those
optional runtimes through their dedicated imports. The root exposes only the
cache/delta capability contracts and deterministic normalization/key helpers.
Applications explicitly construct IndexedDB implementations from
`three-hex-map/persistence` and pass them to a world source, which owns and
disposes option-level stores. `npm run check:package-boundaries:built` scans all
root runtime formats after a build and fails if IndexedDB implementation markers
cross that boundary.

Gameplay simulation belongs to the application. The package has no simulation
subpath; applications define their own state and implement
`GenerationCheckpointParticipant` when saving it together with terrain deltas.
See [App development](./app-development.md) for the current survivor RPG
application and its boundary from the reusable world runtime.

## Demo build and startup

`npm run build` generates forest LODs, builds the library and world-generation
Worker, then copies the browser bundles and dependencies into `public/`.
`npm start` builds before serving that directory on port 3000; `npm run server`
serves existing outputs without rebuilding.

The Windows entry point [`run-demo.bat`](../run-demo.bat) fixes its working
directory to the repository root and checks Node.js `^20.19.0 || >=22.12.0` and
npm. When `node_modules` is missing it runs `npm ci`, then executes
`npm run build` followed by `npm run server -- -a 127.0.0.1 -o`.
The server binds to loopback port 3000 and opens the browser after listening.
It stays in the same terminal until Ctrl+C; dependency, build or port-binding
failure stops startup and keeps the error visible without stopping other processes.
The batch file uses CRLF line endings and ASCII console messages.
The game has its own [`run.bat`](../run.bat) entry on port 5173, described in
[App development](./app-development.md#构建与验证).
