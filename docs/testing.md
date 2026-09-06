# Test strategy

The test suite protects observable contracts and failure boundaries. Test
counts are not an acceptance target: adding or removing a case is useful only
when it changes the defects the suite can detect.

The standard TypeScript gate enables `noUnusedLocals` and
`noUnusedParameters`. Remove dead declarations and unreachable compatibility
branches; test fixtures must initialize the production layer registry instead
of keeping a test-only runtime path alive.

## Test layers

| Layer | Purpose | Typical location |
|---|---|---|
| Contract tests | Deterministic algorithms, validation, state transitions and public API results | `tests/world`, `tests/runtime`, `tests/rendering`, `tests/persistence` |
| Fault/interleaving tests | Crashes, cancellation, paused asynchronous operations and competing writers | Tests beside the owning contract |
| Foundation acceptance | A small set of cross-component invariants that do not duplicate detailed contract tests | `tests/stability` |
| Browser E2E | Real Worker, WebGL, input and application wiring that DOM or fake implementations cannot prove | `tests/e2e` |
| Browser soak | Repeated world-session replacement and resource-bound sampling | `tests/e2e/foundation-soak.spec.ts` |
| Game application | Pure clock, session, construction and inventory contracts; render ownership and production-build browser integration | `apps/expedition/tests`, `apps/expedition/tests/e2e` |
| World-style review | Fixed topology-aware metrics plus far/middle/near/debug browser artifacts | `tests/world/worldStyleGallery.review.ts`, `tests/gallery` |
| Benchmark | Reproducible hot-path regression thresholds | `scripts/benchmark-hot-paths.mjs` |
| Optimization decision | Deferred-work trigger declarations and evidence integrity | `docs/optimization-gates.json` |

Prefer the lowest layer that can observe the contract. Escalate to browser E2E
only for browser-owned behavior such as module Workers, WebGL context recovery,
focus/input routing, or the assembled demo. Capability reporting by itself is
not an acceptance test; a feature test must perform the operation and verify
the resulting state.

Use controlled promises for race tests so each interleaving is explicit and
deterministic. Avoid timers as synchronization, random stress without a fixed
seed, and assertions against private implementation shape when the same result
is visible through a public contract.

## Required gates

For an ordinary change, run:

```powershell
npm test
npm run typecheck
npm run check:optimization-gates
npm run build
npm run test:e2e
```

`npm run test:e2e` skips the opt-in soak unless
`FOUNDATION_SOAK_ITERATIONS` is positive. Changes to lifecycle ownership,
world replacement, Worker recovery, WebGL recovery, scheduling, residency, or
resource accounting must additionally run:

```powershell
$env:FOUNDATION_SOAK_ITERATIONS='500'; npm run test:soak
```

Application changes also run `npm run app:build` and `npm run test:app:e2e`.
The root `npm test` includes application unit tests; the application build checks
its source, configuration and tests with TypeScript. Application E2E runs on
port 4174 and stores browser artifacts under `test-results/app`, separate from
the foundation demo on port 4173. Both application gates run in CI.

Vitest resolves the public `three-hex-map` root import to `src/index.ts`, allowing
application integration tests to exercise the library before a build exists.
Application development and production builds still consume public package
outputs. Mineral tests cover real terrain generation, bounded landing failures,
resource access across water, and instance-buffer eviction/reconstruction;
browser tests perform mineral location and tile inspection through the UI.
Industry tests verify multi-cell rotations, atomic costs/refunds, finite capacity
and reserves, disconnected machines, and deterministic tick grouping. Rendering
tests cover cross-source building ownership, eviction/reconstruction, exhausted
mineral visibility and final resource release. Browser construction tests use
B/R/Esc, actual category tabs and terrain placement, then check real inventory
against ore depletion through pause/speed controls and warehouse demolition.
Power tests cover isolated/merged/split networks, device-owned joules, daylight,
charge/discharge rates and capacity, whole-load allocation and non-mutating
configuration. Industry tests also exercise refining input ownership, priority,
recipe switching, one-batch output backpressure and real materials funding storage.
Energy browser scenarios build new facilities through the catalog, change actual
generation and load priority, refine all battery materials and verify charging.
Explorer contracts cover negative coordinates, diagonal/frame-rate speed, body collision,
bounded route finding, layout invalidation, focus/visibility suspension and nearby construction.
Browser tests walk a real astronaut, verify the camera follows the same tile, isolate text
input, reject construction over the body, and navigate to ore before building a miner.
Placement helpers drive the public pointer/keyboard handlers and read visible validity and
coordinates, selecting a bounded candidate footprint without modifying gameplay state directly.
Mineral inspection, planet replacement, mining and warehouse scenarios run
separately to keep each within the software-rendering timeout.
The unsuitable-seed rejection allows 60 seconds for all nine terrain survey
windows under software rendering; ordinary UI assertions keep their 20-second
default and the ordinary per-test budget remains 120 seconds. Solar/relay
construction, load-priority recovery and battery production are separate scenarios.
The mining and priority scenarios allow 180 seconds, including actual walking navigation.
The battery scenario allows 240 seconds
for three actual refining runs, paid construction, charging and final inspection;
refining ten real units has a 35-second assertion budget at 4× under software rendering.

A release or infrastructure freeze also runs `npm run benchmark:check`. CI
runs the normal gates for pushes and pull requests and enables the 500-iteration
soak on its scheduled job. The verify job builds the library/demo and application,
checks committed demo artifacts with `check:generated:built`, and benchmarks that output with
`benchmark:check:built`. It also runs `check:package-boundaries:built` against
the same outputs so IndexedDB implementations cannot drift back into the root
bundle. The public `check:generated`, `check:package-boundaries` and
`benchmark:check` commands remain self-contained for local use.

`check:optimization-gates` validates the deferred-optimization register on
every CI run. It does not substitute CI software rendering for physical GPU
evidence: moving a gate out of `deferred` requires committed structured
measurements and raw artifacts that satisfy the recorded trigger expression.

The hot-path benchmark performs one untimed warmup followed by five timed runs
for every case and gates the median, not a single cold sample. Its JSON records
Node/V8, OS, architecture, CPU model, logical CPU count, GC availability, every
sample, min/max and spread. `--check` requires `--expose-gc`. For controlled
diagnostics, `FOUNDATION_BENCHMARK_WARMUPS` accepts 1–5 and
`FOUNDATION_BENCHMARK_SAMPLES` accepts an odd value from 3–15;
`FOUNDATION_BENCHMARK_SCALE` must be a positive finite threshold multiplier.
Invalid environment values fail explicitly instead of silently using defaults.

Changes to generator classification, modifiers, vegetation placement, climate
or surface semantics additionally run:

```powershell
npm run review:world-style
```

Vegetation placement contracts cover coverage of all six edge bands, stable
LOD subsets, independent request equivalence and scale-dependent trunk spacing
across model/chunk/toroidal seams. `surfaceHexMarker.test.ts` checks sloped rims,
bounded projection reuse and invalidation, ray picking and translated worlds.
`surface-markers.spec.ts` exercises real hover/click wiring with grass and trees
enabled, captures `vegetation-and-slope-marker.png`, and changes mountain height
to verify both markers refresh. This complements the standard gallery, whose
grass is disabled for software-rendering cost.

The metrics pass covers four bounded seeds, six 512×512 toroidal seeds, four
infinite seeds at positive and negative windows, water/land extreme seeds and
minimum dimensions. It measures water-component dominance and isolation in
addition to terrain and forest structure. The gallery pass uses
`quality=gallery`: full terrain materials and
trees remain enabled, while grass, sky and antialiasing are disabled and tree
instance density is reduced so all four fixed views remain practical under CI
software rendering. Per-sample JSON and images are artifacts; topology,
connectivity and broad composition ranges are the stable gates.

## Meaning of the 500-iteration soak

One iteration is one call to `HexMap.loadWorld()` with a new procedural source;
it is not a simulation turn or a generated terrain tile. Every twenty-fifth
iteration starts three competing loads to exercise cancellation and stale
publication, with the last load required to win.

The test waits for the winning render world to settle and samples lifecycle
work, shared work domains, resident chunks, WebGL resources, pending GPU
queries, and JavaScript heap use. The active world's minimap may retain its
designed maximum of two non-critical overview requests with one configured
Worker busy; the work-domain count must remain fixed so superseded source pools
cannot accumulate. All other values remain within fixed bounds. Final disposal
first releases the minimap consumer and then the map, after which no queued
work or resource-budget reservations may remain. Five hundred iterations are a
freeze/release confidence gate, not a replacement for the deterministic tests
that identify a specific failing interleaving.

## Keeping the suite focused

A test should normally be removed or merged when all of the following hold:

- another test exercises the same observable contract through an equal or more
  realistic path;
- it does not cover a distinct failure point, version rule, or boundary value;
- deleting it does not make a regression materially harder to diagnose.

Keep tests that look similar when they isolate different commit points,
ownership transitions, protocol versions, or resource types. Do not record an
exact suite count in contracts or release documentation; counts change as
coverage becomes more precise.
