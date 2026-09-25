# Test strategy

导航：[总导航 · 验证与决策](README.md#verification) · [按任务阅读](README.md#routes)

Tests protect observable behavior and failure boundaries. Counts are not acceptance
targets. Read the owning contract from the [documentation index](README.md) before
choosing checks; development and cleanup criteria are in [AGENTS](../AGENTS.md).

## Test layers

| Layer | What it proves | Location / owning contract |
|---|---|---|
| Unit and contract | Deterministic rules, validation, state transitions and public API results | `tests/helpers`, `tests/world`, `tests/runtime`, `tests/rendering`, `tests/persistence` |
| Fault and interleaving | Cancellation, competing writers, failure, stale publication and resource ownership | Tests beside the owning contract; [foundation](foundation-infrastructure.md) |
| Foundation acceptance | Cross-component invariants beyond individual contract tests | `tests/stability` |
| Browser | Real Workers, WebGL, input routing, recovery and assembled application behavior | `tests/e2e`, `apps/survivor/tests/e2e` |
| Soak | Repeated world replacement and bounded retained resources | `tests/e2e/foundation-soak.spec.ts` |
| World-style review | Topology metrics and far/middle/near/debug captures | `tests/world/worldStyleGallery.review.ts`, `tests/gallery`; [world style](world-style-generation-v1.md) |
| Game simulation | ECS identity, action timing, settlement, status, items and progression | `apps/survivor/tests`; [game contracts](README.md#game) |
| Benchmarks | Reproducible hot-path, simulation and query-worker budgets | [benchmark scope](#benchmark-scope) |
| Documentation | Local links, heading anchors and documentation index reachability | `scripts/check-docs.mjs`, `tests/helpers/documentation.test.js` |
| Optimization decisions | Trigger declarations and committed evidence integrity | [optimization gates](optimization-gates.md) |

Use the lowest layer that observes the contract. Similar-looking tests stay when
they protect different commit points, protocol versions or ownership boundaries.
Use controlled promises for interleavings and fixed seeds for stochastic rules;
do not replace behavior assertions with capability flags or implementation-shaped
expectations. Keep compile-time negative assertions: `tsc` checks their
`@ts-expect-error` contracts even when runtime execution is intentionally skipped.

Root tests are grouped by domain: option merging belongs in `tests/helpers`, event
dispatch in `tests/runtime`, and generation/Worker requests in `tests/world`.
Worker mocks are scoped to their own suite and restored after each test.
Browser combat fixtures advance through the session's normal in-flight barrier;
they do not bypass it with direct transport calls, which could race an automatic
save during slow screenshots. Production Worker entry points expose no fixture state.
The assembled HUD/resource journey uses the test Worker's damage-immunity fixture so
software-rendered layout checks cannot kill its actor before keyboard assertions.
Combat death and automatic-combat shutdown remain separate gameplay/Worker checks.
Regional ecology checks keep the full coordinate sweep but validate each immutable
chunk layout once while it remains resident; reconstructed chunk instances are
checked again. Residency, population consumption and reentry have separate checks.
Both TypeScript gates enable unused-declaration checks. Remove dead declarations
instead of preserving test-only production branches or compatibility scaffolding.

## Change-based local validation

Run `npm run check:docs` and `git diff --check` for every change. Add the applicable
rows below; a documentation-only edit does not require a browser soak or CPU benchmark.
Multiple changed boundaries require the union of their checks.

| Changed boundary | Required local checks |
|---|---|
| Documentation, links, navigation only | Documentation gate; manually compare changed behavior descriptions with code |
| Documentation checker | `npm test -- tests/helpers/documentation.test.js` plus the documentation gate against this repository |
| Benchmark sampling, statistics or diagnosis only | Focused benchmark-helper tests and the affected real benchmark scenarios; check every round and instrumented/uninstrumented workload counters |
| Test organization or application export visibility only, without runtime behavior changes | Affected unit suite(s), corresponding typecheck; app export changes also build the app |
| Library algorithms or public types | `npm test`, `npm run typecheck`, `npm run build`; public exports/package changes also `npm run check:package-boundaries:built` |
| Pure gameplay rules, settlement, status, inventory or saves | `npm run test:app`, app typecheck/build; also the relevant browser flows if a published state, command, schema or UI contract changes |
| Input, UI, animation, shaders, asset loading or browser wiring | Affected unit suites and build; `npm run test:e2e` for library behavior or `npm run test:app:e2e` for game behavior |
| Lifecycle ownership, world replacement, Worker/WebGL recovery, scheduling, residency or resource accounting | Affected unit and browser suites plus the 500-iteration soak below |
| Terrain classification, modifiers, vegetation, climate or surface semantics | Library checks and `npm run review:world-style`; game checks when collision or game visuals also change |
| Simulation hot paths, AI, spatial queries or capacities | Game checks plus `npm run benchmark:app`; query scheduling/transport/kernel changes also `npm run benchmark:app:workers` |
| Library hot paths or memory layout | Library checks plus `npm run benchmark:check` |
| Enemy stats or combat formulas | Game checks and `npm run report:combat-balance`; review the regenerated calibration against [balance rules](game/combat-and-progression.md#数值校准) |
| Inventory/HUD rendering performance | UI/browser checks and the full-inventory measurement described in [UI performance](game/ui-performance.md) |
| Build, generation inputs, package outputs or optimization register | Owning checks plus `check:generated`, `check:package-boundaries` or `check:optimization-gates` as applicable |

Game tests consume the built library. After a clean install or changes to library
code/assets, first run `npm run app:prepare`. Thereafter
`npm run build --workspace @preview/survivor` typechecks and builds the app without
rebuilding unchanged inputs. `npm run app:build` includes the preparation step.
Do not race tests or typechecks against a command that replaces their `dist` or
`apps/survivor/.assets` inputs; finish asset preparation before starting game tests.

For lifecycle changes, in PowerShell:

```powershell
$env:FOUNDATION_SOAK_ITERATIONS='500'
npm run test:soak
Remove-Item Env:FOUNDATION_SOAK_ITERATIONS
```

Before handing off a running development URL, run `npm run check:app:dev` against
the existing server on port 5173. This checks actual Vite modules and the unbundled
Worker, including item generation/pickup, skill dragging, map sampling, narrow
layouts and shader errors. A production build or HTTP 200 does not prove that the
development server is serving the current modules. Item-schema or cross-Worker
contract refactors require a development restart and refresh before this check.

## CI and release gates

[CI](../.github/workflows/ci.yml) runs the complete verification set on pushes and
pull requests: documentation, root tests/types, optimization register, library
build, app types/tests, both game benchmarks, generated artifact consistency,
package boundaries and library hot-path budgets. Browser jobs then run library
and game E2E; the scheduled job additionally enables the 500-iteration soak.
The local matrix selects relevant checks without weakening this CI coverage.

The verify job checks and benchmarks its already-built outputs using
`check:generated:built`, `check:package-boundaries:built` and `benchmark:check:built`.
The unsuffixed commands build first and are self-contained for local use.
Release or infrastructure freeze acceptance runs the complete set and the soak;
the [freeze contract](foundation-v1-freeze.md) defines the protected invariants.

`check:optimization-gates` validates structured evidence and trigger states; CI
software rendering does not substitute for physical GPU evidence. Gallery captures,
pixel comparisons and WebGL counters prove different things from Node CPU timing.
See the [evidence and measurement catalog](README.md#evidence) for historical
results with their original conditions.

## Benchmark scope

The library benchmark performs an untimed warmup and five measured runs and gates
the median. JSON includes runtime, CPU, raw samples and spread. `--check` requires
`--expose-gc`; warmups accept 1–5, samples an odd 3–15 and threshold scale a positive
finite value through the `FOUNDATION_BENCHMARK_*` variables. Invalid values fail.

Game timing separates real travel combat, full-capacity AI/movement/attack generation
and procedural-terrain combat. Travel health is restored between ticks to measure
the complete route with actual hit settlement; crowded input discards hits so all
targets remain available. Neither establishes starter-character survival or GPU
frame rate. Exact scene construction and budgets belong to
[simulation and AI](game/simulation-and-ai.md) and [terrain navigation](game/terrain-navigation.md).

`npm run benchmark:app` retains latency statistics for all five rounds: nearest-rank
P50/P95/P99, maximum, worst 1-based sample ordinals, over-budget count/fraction, longest
consecutive run and cumulative excess. Pooled percentiles use all operations;
consecutive runs never cross round boundaries. Fixed timing buffers are allocated
before each loop; setup, resets, assertions and report construction are excluded.
Cold fixture operations remain measured, with construction time reported separately
where applicable. This operation-only mean is not a before/after speedup against old
reports that included loop bookkeeping.

The existing mean-budget gate remains enforced. Per-operation overruns against that
budget and the simulation tick period are observations, not newly calibrated CI limits.
Maximum and sample identity matter when synchronized events occupy less than 1% of
ticks; a low P99 alone does not establish smooth execution.

For focused diagnosis, run
`node --expose-gc scripts/benchmark-survivor.mjs --check --scenarios=fireEffects,autoAvoidance,terrain,autoCombat --profile --output=report.json`.
Omit `--scenarios` for the full suite. Output contains the source commit, benchmark
source hashes and runtime bundle hash. Stage probes run in separate repeated fixtures
after ordinary samples, time synchronous inclusive/self cost and count calls, and
record bounded GC events overlapping measured operations. Nested inclusive costs
must not be added together; probe overhead and GC correlation are not causal or FPS
claims. Workload counters must match the corresponding uninstrumented fixtures.
Profiles are limited to those four scenarios; no timers or hooks enter the production
simulation, Worker protocol or UI. The committed [tail-latency sample](game/measurements/performance-tail-latency.json)
records one machine and artificial pressure workloads, not a full-capacity browser guarantee.
For a same-harness comparison, `--runtime-ref=<commit-hash>` bundles the committed
TypeScript runtime through Git reads; installed dependencies and built library inputs
stay the same. The report identifies that runtime separately from the benchmark source.

The query benchmark includes candidate preparation, copy, transfer and join costs,
with the stationary index built before timing. It measures real Node threads, not
browser input latency. Serial and scheduled full-capacity queries have budget gates;
enabling production parallel queries additionally requires an improvement over
serial execution. Configuration and thresholds belong to the simulation contract.

`node --expose-gc scripts/benchmark-survivor-pipeline.mjs <baseline-commit>` builds
the committed baseline through Git reads without replacing the worktree. It times
expiry events and snapshot sharing separately, checks an exact 1,200-tick open-terrain replay,
and compares native render copies with sparse slot writes. Snapshot cloning and
status setup are excluded from their respective timings; this is Node CPU evidence.
`--replay-only` skips timings. Replay also covers 600 ticks each of procedural-terrain
travel and automatic combat, comparing checkpoints (including RNG), UI snapshots,
entity component arrays and regional layouts every 60 ticks against the baseline.
An interleaved burn replay also compares admission, replacement, consumption, cleanse,
callback reapplication, entity reuse, ordered damage events and individual saved layers.
Avoidance replay compares 288 candidate scores across positive/negative chunk boundaries,
curved shots, different heights, early score limits and reused projectile slots.
`node scripts/benchmark-survivor-combat.mjs <preview-url>` observes the complete
2560×1440 browser path with a valid mixed-school build, moving/resting input,
durable enemies and replenished player vitals. It retains real casting, AI, hit
settlement, Worker pacing and rendering; an 8-second warmup precedes a 15-second
sample. It asserts that all three status families actually occur, reports raw
diagnostic windows and never infers GPU timing from frame rate.

## Meaning of the 500-iteration soak

One iteration is one `HexMap.loadWorld()` replacement, not a tick or terrain tile.
Every twenty-fifth iteration starts competing loads and requires the last to win.
The settled session is sampled for lifecycle work, shared work domains, residency,
WebGL resources, GPU queries and heap bounds. The active minimap may retain its
designed two non-critical overview requests; superseded work domains cannot accumulate.
Final disposal releases the minimap and map, leaving no queued work or budget
reservations. Deterministic interleaving tests remain necessary to diagnose failures.
