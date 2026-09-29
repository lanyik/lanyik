# three-hex-map

导航：[总导航 · 入口与协作](docs/README.md#entrypoints) · [按任务阅读](docs/README.md#routes)

English | [简体中文](README.zh-CN.md)

A browser-first 3D hex-world renderer and streamed-world runtime built on
[three.js](https://threejs.org/). It renders Civilization-style terrain with
instancing and custom shaders, while keeping world generation, persistence,
and pathfinding behind explicit runtime boundaries.

This repository is the customized [lanyik/lanyik](https://github.com/lanyik/lanyik)
fork of [gunyakov/three-hex-map](https://github.com/gunyakov/three-hex-map).

[Changelog](CHANGELOG.md) · [Documentation index](docs/README.md)

The hex-world baseline is preserved on `release/2026-09-29-hex-world-baseline`.
`main` contains current development, including the [continuous-world foundation design](docs/decisions/continuous-world-foundation.md)
and repository cleanup; completed branches and old experiments are recorded in the [branch archive](docs/README.md#branches).
The new world foundation is still a proposal;
the runtime and library usage below still describe the existing hex implementation.

## Project status

| Area | Current state |
|---|---|
| Package | Metadata remains at `0.5.0`; the current branch also contains the work listed under **Unreleased** |
| Rendering | Production path is WebGL2 with instanced terrain, water and vegetation, source-chunk streaming, 12x12 render chunks and three LOD levels |
| World runtime | Bounded static maps, streamed toroidal maps, deterministic infinite worlds and custom `WorldSource` implementations use one `HexMap.loadWorld()` entry |
| Gameplay services | Sparse world deltas, recoverable generation checkpoints and hierarchical pathfinding are implemented as optional package subpaths |
| Demo | Finite toroidal and infinite modes share one page and one remembered mode selector |
| Foundation | Infrastructure v1 is frozen; lifecycle, ownership, scheduling, persistence and resource-budget contracts are covered by automated gates |
| World style | Generation v1 now uses broad connected oceans and deterministic coarse-drainage river networks alongside continuous relief, climate snow and regional forests |
| Game application | A survivor RPG with bounded ECS, monster behavior trees, animated Quaternius actors, radial hex regions, four residency rings, character/bag windows, mana skills, eleven equipment slots and six level-unlocked treasure-orb sockets |

Repository development requires Node.js `^20.19.0 || >=22.12.0` and npm.
Library consumers provide `three` `^0.185.0` as a peer dependency.

## What works today

- Deterministic landforms across bounded, toroidal and infinite topologies,
  including elevation, continentalness, ridges, valleys, roughness, moisture
  and temperature.
- Chunk-streamed terrain, water, grass and glTF forests with frustum/distance
  culling, opaque horizon blending, stable LOD, bounded CPU/GPU residency and
  floating-origin rebasing.
- Periodic four-way wrapped maps with seam-aware rendering, picking, neighbors,
  fog and shortest-path movement.
- Generated drainage rivers, broad oceans, authored lakes/rivers, shared mountain geometry, atlas de-tiling,
  atmospheric sky, cities, units and fog of war.
- Worker-based terrain and vegetation generation, optional IndexedDB base-chunk
  caching and sparse persistent tile overrides.
- A paged data-driven minimap with bounded Canvas/LRU storage, smooth zoom,
  captured right-button panning, camera recentering, background overview
  generation with two-ring prefetch, and explicit destination confirmation.
- Generation-scoped cancellation, WebGL context recovery, resource accounting,
  queue backpressure and observable lifecycle drain.
- Optional `GameEngine` unit controls and long-distance hierarchical routing.
- A standalone `apps/survivor` game with fixed-step combat, batched enemy and
  pickup rendering, Diablo-style rarity/affix loot, equipment swapping and
  deterministic runs.
- English and Simplified Chinese demo UI, live visual controls and runtime
  diagnostics for frame, Worker, cache and residency state.

On Windows, double-click [`run.bat`](run.bat) to install locked dependencies when
`node_modules` is missing, prepare assets, build the production game and open
<http://127.0.0.1:4174>. Each launch builds the current source, then serves
`apps/survivor/dist`; source edits do not hot-update or reload the running page.
It requires Node.js `^20.19.0 || >=22.12.0` and npm. Keep the terminal open while
playing; press Ctrl+C to stop. Startup errors remain visible. If port 4174 is
already occupied, stop the existing server first. Use `npm run app:preview` to
serve an existing production build without rebuilding.

For development with hot updates, use `npm run app:dev` and open
<http://127.0.0.1:5173>. Browser saves are separate for ports 5173 and 4174.
Use WASD to move; attacks target the nearest monster
automatically, `I` opens equipment and `P` pauses combat.
`Z` toggles auto combat with nearby targeting, chest pickup, low-health potions and
limited dodging; WASD takes over movement and death stops automation. `F`
independently toggles automatic skill casts. Architecture and implemented gameplay contracts are documented in
[App development](docs/app-development.md) and
[Combat and progression](docs/game/combat-and-progression.md).

## Run the demo

On Windows, double-click [`run-demo.bat`](run-demo.bat) to install locked
dependencies when `node_modules` is missing, build the demo assets, and open
<http://127.0.0.1:3000>. Every launch builds the current source.
It requires Node.js `^20.19.0 || >=22.12.0` and npm. Keep the terminal open while
using the demo; press Ctrl+C to stop. Startup errors remain visible. If port 3000
is already occupied, stop the existing server first.
`public/js/` is generated locally from source and locked dependencies, and is
not committed. Use `npm run server` to serve an existing build; rebuild after
source changes.

Alternatively, use the command line:

```bash
git clone https://github.com/lanyik/lanyik.git three-hex-map
cd three-hex-map
npm ci
npm start
```

Open <http://127.0.0.1:3000>. The control panel exposes two modes:

| Mode | Purpose |
|---|---|
| Finite toroidal | A seed plus width/height, streamed through Workers without materializing the complete map |
| Infinite world | An unbounded procedural source with a camera-centered resident window |

The **Water generation** folder exposes bounded ocean frequency/coverage and
river source, bend and width parameters. Committing a value regenerates the
world; the chosen values are part of its descriptor and cache identity.

The selected mode survives reloads. The `?infinite` flag and coordinate query
parameters can also select the initial infinite-world view.

Click the canvas before using **WASD**. Left-click selects a tile, right-drag
orbits the camera and the wheel zooms. Both modes are world viewers.

## Use as a library

The current repository state is ahead of the `0.5.0` release metadata, so use a
repository checkout/workspace dependency when you need unreleased APIs. The
package expects the application to provide its own compatible `three` copy.

### Static or application-owned map

```ts
import { HexMap, StaticWorldSource } from "three-hex-map";

const map = new HexMap({
    element: "#world",
    size: 40,
    texturesBaseUrl: "/hex-assets/textures/"
});

await map.loadWorld({
    source: new StaticWorldSource(mapData)
});

map.on("click", ({ x, y, tile }) => console.log(x, y, tile));

// When the canvas is permanently removed:
await map.disposeAsync();
```

`HexMap`, `Unit` and `GameEngine` expose separate typed event maps. Event names
select their payload type automatically; an `error` event with no listener is
thrown instead of being silently ignored. See
[event contracts](docs/event-contracts.md).

`await map.load(mapData)` remains a compatibility wrapper for finite
`StaticWorldSource` maps. `loadWorld()` is the preferred entry for every source
type and owns that source until the world is replaced or the map is disposed.

### Streamed procedural world

```ts
import { HexMap, ProceduralWorldSource } from "three-hex-map";
import {
    IndexedDbWorldChunkCache,
    IndexedDbWorldDeltaStore
} from "three-hex-map/persistence";

const map = new HexMap({ element: "#world", texturesBaseUrl: "/hex-assets/textures/" });
const source = new ProceduralWorldSource({
    seed: "endless-continent",
    workerUrl: "/hex-assets/world-generator.worker.mjs",
    workerCount: 4,
    chunkSize: 24,
    cache: new IndexedDbWorldChunkCache(),
    deltaStore: new IndexedDbWorldDeltaStore()
});

await map.loadWorld({
    source,
    initialTile: { x: 0, y: 0 },
    loadRadius: 2,
    retentionRadius: 3,
    frameBudgetMs: 3,
    maxMountsPerFrame: 2
});

await map.setTileOverride(12, -4, {
    city: { name: "Outpost", model: "Assets/models/monument" }
});
await source.flushDeltas();
```

Persistence implementations live only in the optional `persistence` subpath.
Stores passed in source options belong to that source and are disposed with it;
constructor dependency injection is reserved for caller-owned/test resources.

The package ships `dist/world-generator.worker.mjs` through the
`three-hex-map/world-generator.worker` export. Configure your bundler or asset
pipeline to emit that module and pass its public URL to the source. Source
chunks default to 24 tiles and accept integer sizes from 1 to 128; the renderer
independently batches resident content into fixed 12x12 render chunks.

Use `ToroidalWorldSource` when the same Worker/cache model needs finite periodic
bounds. It accepts even widths and dimensions from 8 to 512. Implement
`WorldSource` directly for HTTP, editor, IndexedDB or server-authoritative data.

Generated relief uses an 80-world-unit `mountainHeight` display scale by
default. The browser demo keeps rendering on `requestAnimationFrame`, records a
240 FPS performance target, and disables automatic quality migration so FPS
comparisons use a fixed workload. The observable ceiling is still the
browser/display refresh rate rather than a library-side frame lock.

### Package entry points

| Import | Responsibility |
|---|---|
| `three-hex-map` | `HexMap`, `GameEngine`, world sources, streaming, runtime ownership and core helpers |
| `three-hex-map/persistence` | Base-chunk caches, sparse world deltas and recoverable checkpoints |
| `three-hex-map/pathfinding` | Versioned navigation summaries and hierarchical routing |
| `three-hex-map/world-generator.worker` | Browser module Worker used by procedural sources |

## Map data and editing

`StaticWorldSource` and `GameEngine.init()` accept a `MapInfo` object. A complete
sample is available at [public/gameInfo/map.json](public/gameInfo/map.json).

```jsonc
{
  "w": 40,
  "h": 34,
  "wrapX": true,
  "wrapY": true,
  "data": {
    "0": {
      "0": {
        "type": "land",
        "modifiers": ["wood", "river"],
        "treeModel": "Assets/models/oak",
        "city": { "name": "Rome", "model": "Assets/models/monument" }
      }
    }
  }
}
```

Supported built-in terrain values are `sea`, `coastal`, `land`, `sand`,
`tundra` and `snow`. Built-in modifiers include `hill`, `wood`, `river` and
`lake`; modifier strings remain extensible for custom layers.

Mutable procedural sources keep generated terrain immutable and store only
sparse coordinate overrides. Use `setTileOverride()`, `setTileOverrides()` and
`clearTileOverride()` on `HexMap` so resident visuals refresh with the data.

All constructor and world-load options are defined in
[src/HexMapOptions.ts](src/HexMapOptions.ts). The demo is the easiest place to
inspect live shader, water generation/rendering, vegetation, LOD, cache and
adaptive-streaming controls.

## Optional game loop

`GameEngine` remains available for unit selection, movement and unit-driven fog
of war:

```ts
import { GameEngine } from "three-hex-map";

const game = new GameEngine({ element: "#world", fogOfWar: true });
await game.init(mapData, unitsData);
game.on("end_move", event => console.log("arrived", event));

// Later:
game.dispose();
```

It provides unit controls rather than a complete Civilization ruleset. New
large-world gameplay owns its authoritative state in the application and uses
the persistence and pathfinding services independently of camera residency.
The survivor application's boundaries are defined in
[App development](docs/app-development.md). Entity storage and monster decisions
are documented in [Combat ECS and behavior trees](docs/game/simulation-and-ai.md).

## Development and verification

| Command | Purpose |
|---|---|
| `npm run build:lib` | Build ESM, CJS, global bundle and declarations into `dist/` |
| `npm run build` | Build the library and copy the runnable demo assets into `public/` |
| `npm run server` | Serve `public/` on port 3000 without rebuilding |
| `npm run app:dev` | Build dependencies and run the hot-updating game development server on port 5173 |
| `npm run app:build` | Type-check and build the production survivor application |
| `npm run app:preview` | Serve the existing production game on port 4174 without rebuilding |
| `npm run test:app` | Run deterministic survivor core tests |
| `npm run test:app:e2e` | Run the survivor browser acceptance flow |
| `npm run benchmark:app` | Check survivor simulation CPU budgets |
| `npm start` | Build, then serve the demo |
| `npm test` | Run deterministic Vitest contract and stability tests |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run test:e2e` | Build and run Chromium integration tests; normal runs skip the opt-in soak |
| `npm run test:soak` | Run the replacement/resource soak with `FOUNDATION_SOAK_ITERATIONS` configured |
| `npm run benchmark:check` | Build and enforce hot-path regression thresholds |
| `npm run check:generated` | Rebuild, verify generated browser files against their inputs, and check tracked forest LOD outputs |
| `npm run check:docs` | Check local documentation links, heading anchors and index reachability |

Choose local checks by the changed contract using the
[test matrix](docs/testing.md#change-based-local-validation). It distinguishes
documentation, library, gameplay, browser, lifecycle and performance work;
CI still runs the complete regression gates.

## Documentation and roadmap

The [complete documentation map](docs/README.md) provides relationship diagrams,
task-based reading routes, direct links to every design, source entry points and
historical evidence on one page. Before changing code, read
[AGENTS](AGENTS.md) for development rules, then select the owning contract and
implementation from the [task routes](docs/README.md#routes). This is the single design index.

Current deliberate boundaries:

- [World-style generation v1](docs/world-style-generation-v1.md) includes the
  implemented broad-ocean and coarse-drainage water revision.
- WebGPU/GPU culling remains deferred; the automatic-river gate is implemented
  with recorded evidence and a decision in the
  [machine-checked optimization register](docs/optimization-gates.md).
- Multiplayer reconciliation, cloud saves, server authority and a complete
  economy/combat ruleset are application-level work, not current library
  features.

## Credits and license

- Original project: [gunyakov/three-hex-map](https://github.com/gunyakov/three-hex-map).
- Inspired by [threejs-hex-map](https://github.com/Bunkerbewohner/threejs-hex-map).
- The legacy local pathfinder was based on
  [hexpath](https://github.com/weixiaofan/hexpath) by weixiaofan and was later
  reworked for TypeScript, terrain restrictions and wrapped maps.

Licensed under the [Mozilla Public License 2.0](LICENSE).
