# Test strategy

The test suite protects observable contracts and failure boundaries. Test
counts are not an acceptance target: adding or removing a case is useful only
when it changes the defects the suite can detect.

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

A release or infrastructure freeze also runs `npm run benchmark:check`. CI
runs the normal gates for pushes and pull requests and enables the 500-iteration
soak on its scheduled job. The verify job builds once, checks committed demo
artifacts with `check:generated:built`, and benchmarks that exact output with
`benchmark:check:built`; the public `check:generated` and `benchmark:check`
commands remain self-contained for local use.

Changes to generator classification, modifiers, vegetation placement, climate
or surface semantics additionally run:

```powershell
npm run review:world-style
```

The metrics pass covers four bounded seeds, six 512×512 toroidal seeds, four
infinite seeds at positive and negative windows, pressure seeds and minimum
dimensions. The gallery pass uses `quality=gallery`: full terrain materials and
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
