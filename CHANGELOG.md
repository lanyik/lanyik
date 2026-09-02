# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- An isolated infinite water-curve prototype with independently seeded
  world-space origin, direction, length and multiscale turning for every main
  curve, deterministic tributaries, view-local adaptive sampling,
  chunk/hex/sample diagnostics, and browser coverage for distant queries and
  seed reproducibility.
- A paged data-driven world minimap backed by versioned Worker overview rasters,
  bounded Canvas/LRU storage, progressive refinement, smooth pointer-anchored
  zoom, camera heading and explicit destination confirmation.
- Opaque linear horizon blending shared by terrain, water, grass and standard
  Three.js model materials. The default hard render distance now includes a
  fully fogged outer band, hiding whole-chunk load/unload without transparent
  sorting or changing source-retention ownership.
- Internal `WorldSurfaceResolver` and `WorldSurfaceView` authorities that
  centralize versioned terrain classification, continuous relief, biome weights,
  vegetation/lake patches and sparse terrain edits while providing deterministic
  shared-corner surface heights without a world-sized cache.
- A deterministic continuous `LandformSampler` for elevation,
  continentalness, mountain ridges, valleys, roughness, moisture and
  temperature across bounded, toroidal and infinite worlds, plus live
  final-height/ridge/valley/roughness inspection colors in the demo panel.
- Generation-scoped lifecycle ownership with late-publication guards,
  cancellation propagation, bounded/observable drain tracking, and
  `HexMap.disposeAsync()`.
- Strict multi-store generation checkpoints with immutable staging, an atomic
  CAS manifest, complete simulation/delta snapshots, explicit migrations,
  previous-generation retention, descriptor validation, and orphan cleanup.
- CPU/GPU byte budgets, geometry/texture/model accounting, weighted queue
  backpressure, starvation protection, federated runtime telemetry, and real
  WebGL GPU timer queries.
- Scoped resource accounts with disposable reservation handles and a read-only
  `HexMap.resourceBudget` diagnostics surface.
- Renderer-host, interaction, option-validation and world-editing boundaries;
  `HexMap.ts` remains the compatibility orchestrator while ownership continues
  moving behind those boundaries.
- Deterministic and fault-injected acceptance tests, rapid replacement E2E, and
  a configurable scheduled browser soak with lifecycle, WebGL and JS-heap hard bounds.
- A topology-aware world-style review corpus with fixed bounded, 512×512
  toroidal, positive/negative infinite, pressure and minimum-size samples;
  Playwright emits far, middle, near and elevation-debug views plus runtime metrics.
- Frozen world descriptors and Worker protocol versions, literal golden
  generation checksums, real Worker-crash replacement E2E, and repeated real
  WebGL context-loss recovery with bounded resources.
- Optional four-way toroidal map topology (`MapInfo.wrapX` / `wrapY`) with
  periodic procedural noise, seam-aware terrain/coast/river/fog neighbors,
  repeated rendering, wrapped picking and shortest-path routing across edges.
- Seamless camera recentering when crossing a world boundary; procedural shader
  patterns retain their phase through the recenter instead of visibly jumping.
- WASD camera movement, left-click-only tile selection, unrestricted right-drag
  orbit controls, and localized on-screen control hints.
- Procedural atmospheric sky dome with horizon haze and filmic tone mapping,
  replacing the flat gray background at low camera angles.
- Localized performance monitor with horizontally tiled FPS, frame time, memory,
  draw-call, triangle, visible/resident chunk and LOD counters.
- Dedicated browser Worker build and `WorldGeneratorClient` for non-blocking
  procedural generation. Supported world dimensions now extend to 512×512.
- Deterministic infinite-world chunks with a compact 16-bit tile format, halo
  cells for seamless borders, a prioritized multi-Worker pool, sparse
  reference-counted residency, camera-driven loading and floating-origin
  rebasing through `ProceduralWorldSource` and `HexMap.loadWorld()`.
- Unified `HexMap.loadWorld()` API with public `WorldSource`,
  `StaticWorldSource`, `ProceduralWorldSource` and `WorldStreamer` abstractions
  for finite, wrapped, infinite and application-defined chunk providers.
- Abortable exponential-backoff source retries, strict source/chunk contract
  validation and source-level residency/retry/failure statistics.
- A priority/frame-budget queue for main-thread chunk mounting, runtime queue
  statistics and a reproducible hot-path benchmark command.
- Sparse per-coordinate overrides for mutable gameplay state on packed
  procedural worlds without materializing every generated tile.
- Finite `ToroidalWorldSource` streaming that reproduces eager periodic worlds
  from seed plus dimensions without retaining every tile object.
- Optional bounded IndexedDB base-chunk cache with versioned keys, LRU pruning,
  runtime hit/storage counters and an explicit localized clear-data control.
- Velocity-smoothed forward chunk prefetch constrained to the retention margin.

### Changed

- Deferred WebGPU/GPU-culling and automatic-river work now has a machine-checked
  decision register with explicit triggers, structured evidence and approval
  states; the render crossover benchmark reports five-sample median timing.
- `EventEmitter` is now generic over typed payload maps; `HexMap`, `Unit` and
  `GameEngine` expose distinct event contracts, and unobserved `error` events
  throw instead of being silently discarded.
- Hot-path benchmarks now use explicit warmups and five-sample medians, report
  raw ranges/spread plus the Node/V8/CPU environment, require exposed GC for the
  gate, and reject invalid benchmark environment controls.
- World-load validation and derived session settings now live in a testable
  `WorldLoadPlan`; `HexMap` no longer mirrors source, streamer and residency
  references already owned by `RenderWorldController`.
- Browser cache and delta-store implementations now live exclusively in the
  `three-hex-map/persistence` subpath. Procedural sources accept explicit store
  capabilities, own option-level stores, and keep dependency-injected stores
  caller-owned; CI verifies that IndexedDB code cannot re-enter the root bundle.
- CI now builds the distributable once per verification job, then checks
  generated assets and runs the performance gate against that exact output;
  self-contained local commands still build before checking.
- Advanced world generation to v6: permanent snow now follows an elevated,
  temperature-dependent snowline and generated snow retains hill relief, while
  cold lowlands remain tundra. Mountain summit snow is climate-aware, mountain
  lighting interpolates shared-corner slopes to remove per-hex normal seams,
  and the persistent tactical grid is now opt-in instead of enabled by default.
- Established the first world-style generation v1 freeze baseline on generator v5 after the normal gates,
  performance regression checks, scheduled replacement soak and fixed visual
  gallery all passed. The later climate-snow correction advanced the current
  frozen identity to generator v6. Future gameplay consumes the surface
  contracts instead of extending generator or `HexMap` domain state.
- Deferred automatic river generation after the fixed world gallery found no
  recurring hydrology-shaped visual defect. Existing manual river rendering,
  editing and persistence remain; no local pseudo-network or regional hydrology
  state is added to generator v5.
- Upgraded procedural generation to generator v5 after the fixed gallery
  reproduced peppered forests. Wood placement now uses a continuous regional
  density threshold with bounded deterministic edge jitter; generator checksums
  and cache/save identity advance while chunk, descriptor and Worker formats stay unchanged.
- Established the versioned generator identity at v4 and Worker protocol v2.
  One canonical descriptor fingerprint now drives chunk-cache keys, default
  world IDs and navigation terrain revisions; both Worker directions validate
  generator identity.
- Cities, units, paths, markers, camera targets, grass, trees and custom render
  layers now consume the authoritative effective surface. Grass and tree Y are
  resolved per instance on the main thread, and revisioned height changes rebuild
  asynchronous consumers before emitting `surfacechange`.
- Eager, toroidal and infinite chunk generation now use one frozen style
  profile and resolver. Terrain and placement consumers use the same effective
  current macro surface while sparse edits remain authoritative.
- Refocused the README and documentation around the current streamed-world
  architecture, package entry points, demo modes and verification workflow;
  removed obsolete implementation plans and unreferenced legacy textures.
- Corrected package and README license metadata to match the repository's
  Mozilla Public License 2.0 text.
- Focused the foundation test suite on distinct contracts: removed duplicate
  acceptance and capability probes, centralized deterministic async gates,
  strengthened structured-checksum and restore-lock coverage, and documented
  the tiered verification policy.
- Terrain atlas cells now retain detail at a two-hex span by default. One
  continuous world-space UV warp and macro tint field break up visible tiling
  without adding another `terrain.png` lookup; the span remains live-tunable.
- Procedural terrain generation now uses generator version 5. Generation and
  rendering consume the same seed and continuous elevation field; mountain
  tiles share edge/corner heights with their neighbors and hex centers are no
  longer forced into one peak per tile.
- Consolidated the finite, infinite, and persistent-campaign demos under the
  `/` entry point with a remembered in-game world-mode selector; legacy query
  flags remain available for automation and old bookmarks.
- Terrain, water, grass and forests now expose lazy chunk-resource interfaces
  managed by a dedicated scheduler. Only distance/frustum-visible canonical or
  toroidal chunks construct CPU render data and submit GPU work.
- Three LOD levels preserve the original subdivision/density in the near field,
  reduce sub-pixel interior geometry and decoration density farther away, and
  use a hysteresis band to prevent boundary thrashing.
- Independent 128-chunk GPU and 192-chunk CPU residency budgets evict inactive
  WebGL buffers first, then reconstructible CPU attributes. Toroidal copies
  share canonical resources and are only created for seam regions that can
  become visible.
- Streaming mode incrementally mounts and releases terrain, grass and 3D forest
  layers while preserving lighting, orbit controls and custom unit objects.
- Finite and procedural worlds now share one source-chunk mount/unmount path and
  one public `HexMap.loadWorld()` entry point.
- Procedural chunks remain packed behind a virtual map view; grass/forest model
  resources and deterministic per-LOD results are shared or cached across
  source chunks. The render scheduler uses a persistent flat registry.
- Terrain and grass chunks share immutable base instancing geometry across LOD
  resources, reducing repeated CPU attributes and WebGL buffer creation.
- Fog recomputation now follows only the visible frontier, batches resident
  chunk updates and stores finite renderer state at one byte per cell. Distant
  idle unit mixers update at a configurable lower cadence.

### Fixed

- World replacement now invalidates and aborts old minimap overview pages before
  disposing their source. Worker client and pool teardown classify accepted
  work as `AbortError`, preventing expected cancellation from surfacing as a
  runtime failure or retrying stale demand against the replacement world. The
  replacement soak now distinguishes the active minimap's bounded background
  work from leaked superseded-source domains and disposes consumers in ownership
  order before asserting a zero-work final state.
- City/outpost edits now refresh their terrain model and suppress only the
  affected tile's grass/tree instances in place; they no longer remount the
  surrounding streamed vegetation chunks and cause a visible scene refresh.
- Made generation publication and orphan collection share a staging/manifest
  transaction fence, so garbage collection cannot publish a manifest whose
  verified stage was concurrently removed.
- Bounded checkpoint history to exactly one previous generation and made
  checksums type-aware for `Map`, `Set`, and `Date` while retaining recovery
  compatibility with already-published v1 checksums.
- Rejected terrain edits during checkpoint restore instead of silently losing
  them, and reclaimed legacy participant staging when its prepared token could
  not be journaled without an ambiguous commit.
- Prevented failed checkpoint prepares from being resumed with tokens captured
  at a later application state; retries now abort/roll back the old generation.
- Prevented impossible overweight tasks from evicting an entire queue, kept
  starvation aging out of admission eviction, and preserved mount priority on
  backpressure retries.
- Added GPU-query freshness and saturation telemetry so adaptive rendering does
  not become blind while the GPU query ring is full.
- Corrected bounded-map picking so points outside the map no longer snap to an
  edge tile, and hardened topology/fog/generator runtime input validation.
- Replaced the legacy sparse-array pathfinder with a typed heap-based A* that
  preserves shortest wrapped routes and respects occupied tiles.
- Unit animation now lands exactly on its endpoint, rejects overlapping moves,
  and takes the short visual route across toroidal seams.
- Added race guards for repeated map/game initialization and asynchronous forest
  rebuilds; worker protocol/fatal errors now reject requests instead of hanging.
- Enforced `maxResidentChunks` as a hard nearest-demand limit and fixed the
  abort/re-request race that could leave a returned-to center chunk unloaded.
- Toroidal copy updates are coalesced and diffed incrementally instead of
  rebuilding every physical image after each chunk, city or forest completion.
- Toroidal images now inherit per-chunk render callbacks and receive lazily
  activated terrain/grass geometry, preventing empty ground beneath copied
  forests at finite-world seams.
- Restored `HexMap.load(mapData)` as a backwards-compatible wrapper while keeping
  `loadWorld()` as the preferred source-based API.
- Added complete `HexMap`/`GameEngine` disposal, route/city/forest GPU cleanup,
  wrapped-city fog synchronization, and embedded-canvas resize observation.
- Package metadata now points to this fork, CommonJS uses a `.cjs` entry, and
  the transitive esbuild security advisory is resolved.

- Grass wraps with its owning hex, and physical terrain/grass chunks share the
  same toroidal placement and visibility rules as their decorations, preventing
  surface content from appearing to float beyond a cut-off ground edge.

## [0.5.0] - 2026-07-19

### Added

- **Curved coastlines** - the visual land/sea waterline is bent by static world-space
  value noise (the same technique as the river banks), so bays and headlands cut
  across the straight hex edges instead of tracing them:
  - the bend is one-sided (inland only): the land layer paints animated sea water
    (shore-matched color + ripple) ringed by the sand beach up to the bent line, so
    the whole visible waterline is drawn from a single tile's own data and stays
    seam-free (per-tile shore fields of neighboring water tiles disagree near shared
    corners, so nothing hard is ever painted on the water side);
  - coastal foam (lapping strip + travelling bands) and the shore lightening recede
    with the bent waterline; the land side draws the strip's inland continuation;
  - new `coastCurvature` option/property (0..1, live uniform, default 0.5) - 0
    restores the old straight-edge coasts.
- **Mountains** - new `Land.mountain` terrain type (`"type": "mountain"` in map
  data, `mountain` texture cell in the atlas):
  - tiles rise into noise-craggy 3D peaks on the land layer (no extra mesh), with
    finite-difference lighting normals and a snow-tinted cap near the summit;
  - adjacent mountain tiles hold their shared edge up at a saddle height, connecting
    into continuous ridgelines; saddles taper at corners whose third tile is not a
    mountain (and towards water edges), keeping the displaced surfaces crack-free;
  - flattens under unseen war fog like the beach sink (relief must not betray what
    fog hides), and surrounding tiles blend towards the rock texture at the foot
    (highest `LandPriority`);
  - impassable to units unless their info.json sets `"mountain": true` (new optional
    `UnitInfo.mountain` flag); new `mountainHeight` option/property (world units,
    live uniform, default `size * 0.6`). Don't combine the river/lake modifiers with
    mountain tiles - the carve wins and the peak stays flat.
- **Organic land-type transitions** - the `landBlendWidth` band between
  differently-typed land tiles meanders with the same world-space noise and its
  strength is modulated into patches, replacing the straight edge-parallel bands.
  New `landBlendCurvature` option/property (0..1, live uniform, default 0.5).
- **Lake-side shore rendering** - lake tiles now render as full water bodies while
  adjacent land tiles paint the curved green shoreline/water strip, matching the
  land/sea coastline model and giving lakes more natural, non-hex-shaped edges.

### Changed

- The land layer's hex geometry is subdivided one level deeper (3 instead of 2) so
  mountain peaks bend smoothly; the demo's hex size is now 48 (was 40) to give the
  new coast/relief detail more room.
- `waterCornerRounding` now also shapes the land layer's per-pixel coast field, so
  both sides of a rounded corner agree (it is applied to both materials).
- Coastal foam waves now also animate on the land-painted water strips created by
  curved coastlines, instead of appearing only on real sea/coastal water tiles.
- River mouths that connect to sea/coastal or lake tiles now widen smoothly toward
  the target edge, up to 80% of one hex side. Sea mouths blend into coastal water
  color; lake mouths keep the river/lake water color.
- Lake-to-river openings now use the same widened mouth shape from both sides, with
  matching terrain carving.

### Fixed

- Units created through `GameEngine` now use the active `HexMap` size, keeping unit
  placement and movement aligned with terrain when maps use a non-default hex size.
- Tree placement now avoids shader-painted shore areas: curved land/sea coastlines,
  curved lake shorelines, and widened river mouths.
- Grass/tree water clearance now accounts for widened river mouths and the new
  lake-adjacent shoreline painted on land tiles.

## [0.4.0] - 2026-07-15

### Added

- **Rivers** - a `Land.land` ("grass") tile carrying the free-form `"river"` modifier
  (`TileInfo.modifiers`) renders an animated water channel flowing through the hex,
  drawn entirely by the land layer's shaders (no extra meshes or textures):
  - connectivity is auto-detected from neighbors: an edge connects when the neighbor
    is itself a river/lake tile, or is sea/coastal (the river's mouth) - see
    `src/helpers/rivers.ts`; map authors only mark tiles, there is no separate
    river-path data to keep in sync;
  - banks are bent by static world-space value noise, so the waterline curves
    naturally instead of tracing straight center-to-edge strips, and continues
    seamlessly across tile borders with no seams or width jumps;
  - a tile with one connection ends in a source pool, junctions/forks merge
    naturally, zero connections renders a pond;
  - shallow-to-deep color shading plus animated ripple noise (non-directional, since
    junctions have no single flow direction);
  - a noise-varied light vegetation strip hugs both banks;
  - the riverbed is carved as a real 3D depression (same technique as the coastal
    beach slope), merged with the beach sink at sea mouths.
- **Lakes** - a `Land.land` tile with the `"lake"` modifier fills the hex with water
  except a noise-curved grass shore rim inset from every edge whose neighbor is not
  water. Edges to other lake/sea/coastal tiles are fully open, so neighboring lake
  tiles merge into one continuous body; edges to river tiles keep the rim but get a
  channel-shaped opening that lines up exactly with the neighbor's river channel, so
  rivers visibly flow in and out of lakes.
- **New `HexMapOptions` / live-tunable properties** for the above (all live shader
  uniforms, no rebuild): `riverWidth`, `riverBankWidth`, `riverCurvature`,
  `riverColorShallow`/`riverColorDeep` (default to the map's water colors),
  `riverBankColor`, `riverFlowSpeed`, `riverDepth`, `lakeShoreWidth`.
- **War fog show/hide toggle** - new `HexMap.warFogVisible` property. Hiding the fog
  repaints every tile as visible for map inspection, while the per-tile fog states
  keep being recorded from `setTileFog()` underneath - re-showing repaints the
  *current* fog exactly, including updates made while it was hidden. Purely visual:
  GameEngine's fog tracking, unit visibility and pathfinding are untouched.
- Demo GUI: "war fog" checkbox, "Rivers & lakes" folder (width, bank width,
  curvature, flow speed, depth, lake shore, water/bank colors), and `window.game`
  exposed on the demo page for console debugging.
- Demo map (`public/gameInfo/map.json`): a test river network (source, junctions,
  two sea mouths) flowing through a 4-tile lake.

### Changed

- **BREAKING (map data): `TileInfo.wood` was removed** - wood is now a tile
  *modifier* like the others: `"modifiers": ["wood"]` instead of `"wood": true`.
  Existing map files must be migrated (the demo map has been).
- **BREAKING (API): the static water mode was removed** - sea/coastal tiles always
  render on the animated water layer. The `waterAnimation` option and the
  `HexMap.waterAnimation` getter/setter are gone, along with the flat atlas-textured
  water code path in `TerrainMesh` and the demo GUI's "enabled" switch.
- Tile modifiers are now the single home for per-tile flags: `"hill"`, `"wood"`,
  `"river"`, `"lake"` (documented in `src/interfaces.ts`).

### Fixed

- Fog of war no longer silently resets on layer rebuilds: changing grass density,
  `treesPerTile`, etc. used to recreate that layer with every tile visible until the
  next unit moved - rebuilt layers now get the recorded fog states reapplied.
- Grass blades and trees no longer stand in river/lake water:
  - the scatter clearance now accounts for the waterline's maximum outward noise
    bend (previously blades landed in every noise-pushed bulge of the water);
  - a blade with no dry spot found after the placement attempts is now dropped
    instead of being force-placed at the last (possibly in-water) attempt;
  - lake tiles are skipped entirely by grass/tree scatter - the dry shore rim is
    too narrow to place them reliably.
- Terrain shaders now run at `highp` precision - the world-space noise hash used by
  the river/lake rendering collapses into visible artifacts at lower precision.
- Instanced bitmask attributes are re-rounded to exact integers in the fragment
  shader before bit-decoding - varying interpolation is not exact even for values
  constant across an instance, and `floor(mask / 2^i)` otherwise decodes different
  bits on neighboring pixels (pixel-level garbage along the waterline).

## [0.3.0] - earlier

Baseline for this changelog: instanced terrain/water layers, animated water with
coastal foam waves, beach slopes, land-type edge blending, grass and forest layers,
cities, units/GameEngine, fog of war, pathfinding.
