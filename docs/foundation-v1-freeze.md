# Infrastructure v1 freeze contract

Status: frozen on 2026-08-27. The acceptance commands at the end of this
document passed together on the freeze revision. Exact test counts are not part
of the contract; the protected invariants and test-layer policy are documented
in [testing.md](./testing.md).

The freeze covers lifecycle ownership, streamed world chunks, runtime work
scheduling, resource budgeting, checkpoint persistence, and render-layer
ownership. New simulation, economy, combat, automation, unit, and building
systems must consume these contracts instead of adding their state to `HexMap`.

## Strict generation checkpoints

`GenerationCheckpointCoordinator` is the authoritative save path. A save first
captures every required participant, writes immutable records under one unique
`saveId`, reads each record back and verifies its checksum, then publishes one
manifest with an IndexedDB compare-and-set transaction. The manifest is the
only commit point.

- A crash before manifest publication leaves the previous generation active.
- A crash after publication exposes the complete new generation.
- The manifest retains one complete previous generation; garbage collection
  keeps both referenced generations and removes only unreferenced staging data
  after the configured grace period. Previous-generation metadata is copied
  without recursively retaining older manifests.
- Competing writers use the manifest revision as a CAS fence. Records from
  different `saveId` values can never be combined into one generation.
- Manifest publication revalidates every referenced stage in the same
  manifest/staging transaction. Garbage collection reads the live manifest and
  deletes stages under that same transaction fence, so it cannot remove a
  verified stage immediately before publication.
- Recovery validates the complete world descriptor and every participant
  checksum before applying any snapshot. Structured `Map`, `Set`, and `Date`
  values have type-aware checksums; recovery still accepts already-published
  v1 checksums and upgrades them on the next save.
- A participant migration restores the old snapshot and publishes a new
  generation. Committed records are never rewritten in place.

The campaign registers the real `WorldSimulationRuntime` and sparse terrain
delta source as required participants. Their snapshot restore operations
replace the complete backing store atomically. Rebuildable render/cache state
is deliberately excluded from the authoritative checkpoint. Terrain edits are
rejected with an explicit recovery-in-progress error during replacement rather
than being accepted and then silently discarded.

`CheckpointCoordinator` and `createFlushCheckpointParticipant()` remain
available as compatibility APIs, but a flush participant is not a strict
point-in-time save and must not become an authoritative gameplay save path. If
a legacy participant prepares durable staging but its token journal write
fails, the coordinator verifies whether that write committed; it either keeps
the referenced staging for recovery or rolls back the unreferenced staging.

## Frozen world-generation protocol

The complete `WorldDescriptor` is stored in every committed generation. It
includes the seed, source kind, topology and dimensions, chunk size, generator
version, chunk format version, and descriptor format version. Recovery rejects
an exact-descriptor mismatch.

Version changes follow these rules:

| Change | Required action |
|---|---|
| Generated tile bytes or deterministic algorithm | Increment `WORLD_GENERATOR_VERSION`; update golden checksums in the same intentional change |
| Packed chunk encoding or halo semantics | Increment `WORLD_CHUNK_FORMAT_VERSION` |
| Worker request/response shape or transfer semantics | Increment `WORLD_WORKER_PROTOCOL_VERSION` and update both endpoints together |
| Persisted descriptor fields or meaning | Increment `WORLD_DESCRIPTOR_FORMAT_VERSION` and provide an explicit compatibility decision |
| Simulation or delta snapshot shape | Increment that participant version and provide a migration, or reject the old save |

Changing a golden checksum without the corresponding explicit protocol change
is a test failure, not routine snapshot maintenance. Worker requests and
responses are validated for protocol version and generator identity; chunk
responses are additionally validated against the requested coordinates, size
and packed format. Browser E2E uses a
real module Worker crash and verifies that the bounded pool replaces it before
serving the next request.

## Render ownership and recovery

Custom `WorldRenderLayer` implementations receive a lifecycle-scoped host.
They can publish scene objects only through `addObject()` and `removeObject()`;
the raw world root is not part of the host contract. Published objects are
tracked by layer and chunk, rejected after the world generation is stale, and
removed on unmount, failed initialization, world replacement, unregister, and
dispose. Chunk-tagged allocations participate in scheduler resource accounting;
non-chunk unit/building/effect owners use `HexMap.createResourceAccount()`.

`HexMapRendererHost` owns both `webglcontextlost` and
`webglcontextrestored`. While lost, rendering, frame mounting, and GPU timing
are paused. Restore resets renderer state and GPU queries, invalidates managed
geometry/material/texture uploads, resumes scheduling, and republishes context
generation diagnostics. Browser acceptance performs ten real loss/restore
cycles and asserts that rendering resumes while geometry, texture, query, and
work-queue counts remain bounded.

## Freeze gate

See [testing.md](./testing.md) for the responsibility of each layer and the
precise meaning of the 500-iteration soak.

Run on one revision:

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
$env:FOUNDATION_SOAK_ITERATIONS='500'; npm run test:soak
npm run benchmark:check
```

After the gate passes, infrastructure changes require a demonstrated contract
defect or an explicitly scoped infrastructure v2 (for example WebGPU,
multiplayer synchronization, cloud saves, or a new supported browser family).
Terrain content, gameplay data, and tuning parameters may continue to evolve
through the versioned interfaces. World-style generation v1 is implemented and
frozen in [world-style-generation-v1.md](./world-style-generation-v1.md); it
deliberately consumes the frozen streaming and render ownership contracts
instead of reopening them. `AssetRegistry` is intentionally deferred
until the first real unit/building assets define its actual lookup and lifetime
requirements; it must build on the existing resource accounts.
