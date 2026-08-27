# three-hex-map

English | [简体中文](README.zh-CN.md)

Project repository reference: [lanyik/lanyik](https://github.com/lanyik/lanyik).
This customized build is based on the original
[gunyakov/three-hex-map](https://github.com/gunyakov/three-hex-map) project.

## Procedural world demo

This fork starts as a graphics-only Civilization-style world viewer. It keeps the upstream instanced terrain, water, coast, mountain, grass, and forest rendering, and adds deterministic world generation from a seed.

```bash
npm install
npm start
```

Open <http://127.0.0.1:3000>. Use the language selector to switch between English and Simplified Chinese; the choice persists across reloads. Use the **World generation** panel to change the seed or dimensions and rebuild the map. The generated demo is a four-way wrapped toroidal world: crossing any edge continues at the opposite edge. Click the map and move with **WASD**, left-click to select a tile, right-drag to orbit freely, and use the wheel to zoom. Keyboard input belongs only to the focused canvas when a page contains multiple maps. The default page does not start units, turns, or fog-of-war gameplay.

A Civilization-like 3D hexagonal terrain map for the browser, built on [three.js](https://threejs.org/) and rendered with instancing + custom shaders. Rendering is batched per visible chunk, never per tile.

See the [live demo](https://gunyakov.github.io/three-hex-map/public/index.html) · [Changelog](CHANGELOG.md)

![Screenshot](public/main.png)

## Features

- **Four-way toroidal worlds** - optional `wrapX`/`wrapY` map topology, physically repeated streamed chunks, camera wrapping, seam-aware picking, neighbors, fog and pathfinding. The procedural demo uses periodic noise and wraps both axes by default.
- **Atmospheric sky** - a procedural sky dome replaces the flat background with blue zenith, atmospheric horizon haze and a physically positioned sun while orbiting down toward the horizon.
- **Complete world streaming** - terrain, water, grass and trees are split into 12×12 logical chunks. The scheduler combines distance/frustum culling, three stable LOD levels, lazy CPU geometry construction, lazy WebGL upload and separate 128-GPU/192-CPU logical-chunk caches. Near terrain retains the original full subdivision and decoration density.
- **Large procedural worlds** - deterministic generation supports 8–512 tiles per dimension. The demo performs generation in a dedicated Worker, keeping camera/UI rendering responsive while a 512×512 world is created.
- **Instanced terrain** - every visible chunk uses `InstancedBufferGeometry` batches (land, water, grass, trees), with grid lines, land-type edge blending and beach slopes computed in the shaders.
- **Animated water** - sea/coastal tiles render as a solid-colored, wave-displaced surface (sum-of-sines with analytic normals) with sparkle, fresnel and stylized coastal foam waves rolling towards every shoreline.
- **Rivers** - mark a grass tile with the `"river"` modifier and it renders an animated water channel with noise-curved banks, a light vegetation strip, a carved 3D riverbed and shallow-to-deep shading. Connectivity is auto-detected from neighbors: rivers merge at junctions, spring from source pools and flow into lakes and the sea.
- **Lakes** - the `"lake"` modifier fills a tile with water except a noise-curved grass shore rim; neighboring lake tiles merge into one body and river channels visibly open through the shore.
- **Forests & grass** - instanced glTF tree models per wood tile (mixable species via per-tile `treeModel`) and a wind-animated grass-blade layer on grass tiles. Both automatically keep clear of river/lake water.
- **Cities** - a tile with `city` gets a 3D model + floating text label instead of plain terrain.
- **Units & game loop** (optional `GameEngine`) - glTF units with animations, click-to-move A* pathfinding with terrain/unit restrictions, hover route preview.
- **Fog of war** - unseen tiles render a fog texture, explored-but-out-of-view tiles render darkened, across every layer (terrain, water, grass, trees, cities, units). Can be hidden/re-shown at runtime without losing state.
- **Live tuning** - nearly every visual knob is a live shader uniform exposed as a property (see the dat.gui panel in the demo); no rebuilds needed.

## Getting started

### Run the demo locally

```bash
git clone https://github.com/lanyik/lanyik.git three-hex-map
cd three-hex-map
npm install
npm run start   # builds the library + demo, then serves ./public
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The demo page ([public/index.html](public/index.html)) is also the best usage reference - it spells out every option and wires a dat.gui panel to the live-tunable properties.

### Use as a library

three.js is a **peer dependency** - your page/bundle supplies its own copy.

```ts
import { HexMap, StaticWorldSource } from "three-hex-map";

const map = new HexMap({
    element: "canvas",          // CSS selector of your <canvas>
    size: 40,                   // hex circumradius, world units
    texturesBaseUrl: "textures/" // terrain.png / land-atlas.json / war-fog.jpg
});

await map.loadWorld({ source: new StaticWorldSource(mapData) });

map.on("click", ({ x, y, tile }) => console.log("clicked", x, y, tile));
map.on("hover", ({ x, y, tile }) => console.log("hover", x, y, tile));
```

`loadWorld()` is the preferred unified entry point for finite, wrapped,
procedural and custom remote worlds. Existing finite-map code can continue to
call `await map.load(mapData)`; it is a compatibility wrapper around
`StaticWorldSource`.

Call `map.dispose()` when the canvas is permanently removed. `GameEngine` owns
its map and exposes the matching `game.dispose()` lifecycle method.

Or take the batteries-included game loop (unit selection, click-to-move, fog of war driven by unit view ranges):

```ts
import { GameEngine } from "three-hex-map";

const game = new GameEngine({ element: "canvas", fogOfWar: true });
await game.init(mapData, unitsData); // unitsData: UnitPlacement[] (id/type/x/y)

game.on("unitClick", coords => console.log(game.currentUnit?.actions));
game.on("end_move", payload => console.log("unit arrived", payload));
```

## Map data

`StaticWorldSource` and `GameEngine.init()` take a plain `MapInfo` object - see [public/gameInfo/map.json](public/gameInfo/map.json) for a full example:

```jsonc
{
    "w": 40, "h": 34,
    "wrapX": true, "wrapY": true, // optional; absent/false keeps a bounded map
  "data": {
    "0": {                       // column x
      "0": {                     // row y
        "type": "land",          // sea | coastal | land | sand | tundra | snow
        "modifiers": ["wood"],   // optional flags, see below
        "treeModel": "Assets/models/oak", // optional per-tile tree species
        "city": { "name": "Rome", "model": "Assets/models/monument" } // optional
      }
    }
  }
}
```

Horizontally wrapped flat-top hex maps must have an even width so the staggered
columns meet with the same parity. `generateWorld({ ..., topology: "toroidal" })`
enforces this automatically and produces periodic terrain without artificial
ocean falloff at the four edges.

### Tile modifiers

| Modifier  | Effect |
|-----------|--------|
| `"hill"`  | raised-looking tile |
| `"wood"`  | scatters instanced tree models on the tile |
| `"river"` | animated water channel through the hex; connects automatically to neighboring river/lake/sea/coastal tiles (a single-connection tile renders a source pool) |
| `"lake"`  | water fills the hex except a grass shore rim; adjacent lake tiles merge into one body, adjacent rivers flow in through channel openings |

Modifiers are free-form strings, so new ones don't require core changes - only shader/atlas support for whatever reads them.

### Units

Units are declared as an array of placements (`{ id, type, x, y }`) where `type` is a *model folder* (e.g. `Assets/units/viking_boat`) containing `model.glb` + `info.json`. The `info.json` carries both the model fine-tuning (offset/rotation/scale) and the gameplay stats: movement points, health, attack/defence, view range, allowed terrain types and animations. Tree and city models follow the same folder convention.

## Options

Everything is optional except `element`. The full, documented list lives in [`HexMapOptions`](src/HexMap.ts); the highlights:

| Group | Options |
|-------|---------|
| Layout | `size`, `texturesBaseUrl`, `maxPixelRatio`, `antialias`, `terrainShaderQuality`, `skyVisible` |
| Grid | `gridVisible`, `gridColor`, `gridWidth`, `gridOpacity` |
| Water | `waterColorShallow/Deep`, `waterWaveAmplitude/Frequency/Speed`, `waterSparkleIntensity`, `waterFresnelIntensity`, `waterDepth`, `beachWidth` |
| Coastal foam | `coastalWavesEnabled`, `coastalWaveColor/Count/Speed/Width/Range/Distortion/Opacity` |
| Blending | `landBlendWidth`, `landBlendEnabled`, `waterCornerRounding` |
| Rivers & lakes | `riverWidth`, `riverBankWidth`, `riverCurvature`, `riverColorShallow/Deep`, `riverBankColor`, `riverFlowSpeed`, `riverDepth`, `lakeShoreWidth` |
| Trees | `treesPerTile`, `treeModel`, `treeScale` |
| Grass | `grassEnabled`, `grassDensity`, `grassBladeWidth/Height`, `grassWindStrength/Speed` |
| Streaming | `renderDistance`, `lodEnabled`, `lodNearDistance`, `lodFarDistance`, `vegetationRenderDistance`, `chunkLodHysteresis`, `gpuChunkCacheSize`, `cpuChunkCacheSize` |
| Fog of war | `fogTexture`, `fogDarkenFactor`, `fogTextureSize` |
| GameEngine only | `fogOfWar`, `preventCellClick` |

Almost all of these are also **live properties** on the `HexMap` instance (`map.riverCurvature = 0.8`, `map.waterWaveSpeed = 2`, ...) backed by shader uniforms - only a few (tree/grass density and sizes) rebuild their layer.

The streaming pipeline, LOD guarantees, cache lifecycle and frustum calculation
are documented in [docs/render-streaming.md](docs/render-streaming.md). Runtime
source-level residency/retry counters are available through
`map.worldStreamingStats`; render visibility/LOD/GPU counters remain available
through `map.streamingStats`, and deferred main-thread mount work through
`map.frameTaskStats`.

For a large finite four-way-wrapped world, stream the same deterministic
seed/width/height world instead of materializing every tile up front:

```ts
import { ToroidalWorldSource } from "three-hex-map";

const source = new ToroidalWorldSource({
    seed: "continent",
    width: 512,
    height: 512,
    workerUrl: new URL("/assets/world-generator.worker.mjs", window.location.href),
    workerCount: 4,
    chunkSize: 24,
    cache: true,
    cacheMaxBytes: 128 * 1024 * 1024
});
await map.loadWorld({ source });
```

Only nearby chunks are generated and retained. The cache key includes the
generator version, seed, dimensions, topology, chunk size and coordinates, so
different test worlds cannot collide. The default persistent cache is bounded
to 128 MB and evicts least-recently-used chunks. `await source.clearCache()`
removes its stored base chunks; `clearWorldChunkCache()` performs the same
operation without an active source. Cache failures degrade to worker generation
and never prevent the world from loading.

For a world whose logical size is not stored up front, pass the multi-worker
procedural source to the same entry point. It keeps only a camera-centered
chunk window in JavaScript and GPU memory, transfers packed 16-bit tile data,
and rebases the Three.js world root before large coordinates lose precision:

```ts
import { ProceduralWorldSource } from "three-hex-map";

const source = new ProceduralWorldSource({
    seed: "endless-continent",
    workerUrl: new URL("/assets/world-generator.worker.mjs", window.location.href),
    workerCount: 4,
    chunkSize: 24,
    cache: true,
    deltaStore: true
});

await map.loadWorld({
    source,
    loadRadius: 2,
    retentionRadius: 3,
    frameBudgetMs: 3,
    maxMountsPerFrame: 2,
    maxRetries: 2,
    predictionSeconds: 1.25,
    predictionMaxChunks: 1,
    initialTile: { x: 0, y: 0 }
});

console.log(map.worldStreamingStats);
```

Generated base tiles are compact shared immutable variants. Coordinate-specific
gameplay state stays sparse: use `await map.setTileOverride(x, y, changes)`,
`await map.setTileOverrides(changes)` for coalesced editor-sized batches, and
`await map.clearTileOverride(x, y)` for fields such as `unit`, terrain, vegetation
or `city` without materializing the whole infinite world. With `deltaStore: true`,
overrides are restored from a separate IndexedDB save across page sessions; call
`await source.flushDeltas()` at an explicit save barrier. Unit-only changes avoid GPU work;
visual changes immediately rebuild only resident source chunks touched by that
tile or its neighbors. The lower-level source methods remain available for
headless/data-only consumers that do not have an active `HexMap` renderer.

`chunkSize` must be a multiple of 12. `loadRadius`, `retentionRadius`,
`maxResidentChunks`, `frameBudgetMs`, `maxMountsPerFrame`, `maxRetries`, `retryBaseDelayMs` and
`floatingOriginThreshold` are optional tuning controls. Movement direction is
smoothed and prefetched only inside the retention margin; stale predicted work
is cancelled by the normal demand scheduler. Transient source
failures retry twice by default with cancellable exponential backoff; malformed
chunk contracts fail immediately before they can pollute the runtime map.

`WorldSource` is public: implement chunk loading/release, boundary resolution
and a materialized or virtual `map` view to connect HTTP, IndexedDB, authoritative server
worlds or editor data without changing the renderer. A source instance is owned
by one `loadWorld()` session and is disposed automatically when the world changes.

Global AI and production should use the camera-independent
`WorldSimulationRuntime` from `three-hex-map/simulation`; see
[docs/world-simulation.md](docs/world-simulation.md). Long routes across
unloaded terrain use `HierarchicalPathfinder` from
`three-hex-map/pathfinding`; see
[docs/hierarchical-pathfinding.md](docs/hierarchical-pathfinding.md).

Open the single demo entry at `/` and choose **World mode** in the control
panel. It switches between the streamed finite toroidal source, the infinite
world, and the persistent campaign without requiring a different user-facing
URL. Infinite modes also expose their initial `x`/`y` coordinates in the same
panel, and the selected mode is remembered across reloads. Query flags remain
supported for automated tests and old bookmarks. Arbitrary
`Unit` objects added through `map.add()` remain under the rebased world root;
global simulation/pathfinding across unloaded chunks is intentionally an
application-level concern rather than materializing the entire world again.

Select **Persistent campaign** in that panel for the minimal vertical slice.
It orders an army across multiple source chunks, keeps it advancing after the
camera moves away, creates an outpost through a World Delta on arrival, and
restores both simulation and world state from IndexedDB after a reload. See
[docs/campaign-vertical-slice.md](docs/campaign-vertical-slice.md) for the
runtime boundaries and verification flow.

## Fog of war

`HexMap` renders whatever fog states it is told: `map.setTileFog(x, y, state)` with `0 = Unseen` (fog texture), `1 = Explored` (darkened) or `2 = Visible`. `GameEngine` (with `fogOfWar: true`, the default) drives this from every unit's view range as units move.

`map.warFogVisible = false` hides the fog for map inspection - states keep being tracked underneath, so setting it back to `true` repaints the current fog exactly.

## Events

`HexMap`/`GameEngine` are `EventEmitter`s: `load`, `click`, `hover`, `unitClick`, `start_move`, `cell_enter`, `end_move`, plus a per-rendered-frame `frame` event on `HexMap`.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run build:lib` | builds `dist/` (ESM + CJS + global/UMD bundle + type declarations) |
| `npm run build:demo` | `build:lib` + copies the bundle/vendor files into `public/` |
| `npm run server` | serves `public/` on port 3000 |
| `npm run start` | `build:demo` + `server` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | runs the full Vitest suite |
| `npm run benchmark` | builds and measures packed-chunk and fog hot paths |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes. The current package version is
**0.5.0**, with large-world streaming and LOD work currently documented under
**Unreleased**.

## Credits

- Inspired by [threejs-hex-map](https://github.com/Bunkerbewohner/threejs-hex-map).
- Path finding based on [hexpath](https://github.com/weixiaofan/hexpath) by weixiaofan[^1].

## License

[ISC](LICENSE)

[^1]: Source was reworked for TypeScript compatibility and organized as a class, with added support for unit restrictions and land types.
