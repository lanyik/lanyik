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
| World-style review | Fixed topology-aware metrics plus far/middle/near/debug browser artifacts | `tests/world/worldStyleGallery.review.ts`, `tests/gallery` |
| Benchmark | Reproducible hot-path regression thresholds | `scripts/benchmark-hot-paths.mjs` |
| Game simulation | Entity identity, behavior interruption, attack timing, damage and progression | `apps/survivor/tests` |
| Game benchmark | Fixed-seed combat and full-capacity enemy/projectile traversal | `scripts/benchmark-survivor.mjs` |
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

Survivor changes additionally run `npm run test:app`, `npm run app:build`,
`npm run test:app:e2e`, `npm run benchmark:app` and `npm run benchmark:app:workers`. Build the library before
the standalone app typecheck or tests; do not race those commands with a build
that replaces `dist`. CI includes the app typecheck, tests, benchmark and browser
suite. Browser checks exercise actual attack morph weights, telegraphs and
hostile projectile colors from fixed simulation ticks, including pause.

Combat Worker tests run the browser query entry on real Node threads and compare
hits, commit order and deterministic replay with the serial numerical kernel.
Transfer tests detach actual ArrayBuffers; controlled transports cover backpressure,
ordered commands, pause acknowledgment and stale-session rejection. Browser fixtures
use an inspectable test Worker entry with the production host and protocol; no debug
simulation is added to the main thread or production Worker. The assembled browser
suite exercises parallel collision queries, twenty restarts, query-worker failure,
recovery and final termination of both combat and terrain workers.
Browser checks also verify per-worker HUD records, completed query timing,
paused-window decay and narrow-screen bounds. Controlled-clock unit tests protect
occupancy accounting across in-flight work, worker replacement and disposal.
Frame tests check update-before-draw ordering in the real browser and distinguish
loop, presentation, message, GPU and long-frame samples. Controlled clocks protect
input acknowledgment at draw time, clock-clamped time and exclusion of hidden-time gaps. Deferred-task
tests exercise required barriers, nonblocking ticks, latest-request ordering, world
revision changes, entity reuse, cancellation, capacity, failure and disposal.
Fixed-clock checks cover 60/120/144/240Hz presentation over one minute, each producing
exactly 7200 simulation ticks. AI checks protect continuous 120Hz movement with 30Hz decisions,
including successful idle leaves. Inventory tests protect independent category limits,
atomic chest rewards, stable stack IDs, quantity/potency conservation and one-dose consumption.
Browser checks exercise icon-only hover, immediate dismissal, Alt pinning, one active item
tooltip, keyboard focus, narrow-screen bounds and explicit potion merging.
Before handing off an active development URL, run `npm run check:app:dev` against
the already-running server on port 5173. It loads the real page and generates and
picks up equipment, an orb and a potion stack using Vite-served modules inside
the actual unbundled Worker. It does not intercept the Worker entry or rebuild
the server, so stale development modules remain observable. Restart development
after item-schema or cross-worker contract refactors, refresh, and rerun this check.
The assembled HUD/equipment/keyboard journey has a 300-second total budget for
software rendering and captures; its individual assertion timeouts remain unchanged.

The worker benchmark measures actual copy, transfer and join costs at four bounded
projectile counts, with 100 warmup batches and five samples of 200 batches. It reports
the scheduling threshold and fixed packet sizes, and gates the full-capacity scheduled
query at 3 ms. It measures Node worker threads, not browser rendering or input latency.

The app benchmark uses one warmup and five measured runs. It gates median
CPU time per tick at 0.5 ms for 24 seconds of real travel combat, and 3 ms for
640 enemies plus 128 projectiles whose paths require scanning every enemy.
The travel workload must remain alive for every measured tick; the full-capacity
workload retains all targets without damage resolution. Reports include runtime,
CPU, raw samples and entity counts. These bounds do not measure browser/GPU time.
Optional `--baseline=<module path>` compares an independently bundled previous
simulation on the same travel seed and input; differing combat rules can change
entity counts, so this comparison does not isolate ECS overhead.

A release or infrastructure freeze also runs `npm run benchmark:check`. CI
runs the normal gates for pushes and pull requests and enables the 500-iteration
soak on its scheduled job. The verify job builds once, checks committed demo
artifacts with `check:generated:built`, and benchmarks that exact output with
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
