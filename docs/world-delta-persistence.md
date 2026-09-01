# World delta persistence

Generated terrain remains rebuildable. `WorldDeltaStore` persists only sparse
gameplay/editor overrides and keeps them in a database separate from the base
terrain cache.

## Chunk batches

Built-in stores support one merge and one revision increment per affected
chunk:

```ts
import { IndexedDbWorldDeltaStore } from "three-hex-map/persistence";

const deltas = new IndexedDbWorldDeltaStore({ databaseName: "campaign" });
const current = await deltas.loadChunk(worldId, chunkX, chunkY, { chunkSize: 24 });
const saved = await deltas.putChunkDelta?.(
    worldId,
    chunkX,
    chunkY,
    [
        { x: 2, y: 3, override: { unit: "scout" } },
        { x: 4, y: 5, override: null }
    ],
    { chunkSize: 24, expectedRevision: current?.revision ?? 0 }
);
```

When `deltas` is passed through a procedural source's `deltaStore` option, the
source takes ownership and disposes it. Direct store users, including the sample
above, must dispose it themselves after their final `flush()`.

An object replaces the complete persisted override at that coordinate; `null`
deletes it. `ProceduralWorldSource.setTileOverrides()` and
`ToroidalWorldSource.setTileOverrides()` group editor changes by chunk before
calling this API. A thousand edits in one chunk therefore produce one memory
merge, one revision increment, and one IndexedDB read/write transaction.
Each operation carries `chunkSize`; entries outside the declared Chunk and
duplicate coordinates in stored data are rejected before overrides are
installed. Getters and persisted records deep-copy nested modifiers, rivers and
city data, so callers cannot mutate source state without a revisioned setter.

`putTile()` and `deleteTile()` remain compatibility shims. They are safe across
reopened IndexedDB store instances, but each call is still an individual batch.
Use `putChunkDelta()` or a source batch for editor-sized work.

## Revisions and conflicts

`expectedRevision: 0` means that the chunk must not exist. A mismatch rejects
with `WorldDeltaConflictError`, which reports both revisions. The IndexedDB
implementation performs the check and write in the same read/write
transaction, so two store instances cannot both commit the same expected
revision.

Deleting the final entry retains an empty revisioned record. This avoids an ABA
problem where a deleted chunk would otherwise appear to return to revision 0.
`clear(worldId)` is the explicit operation that removes all records for a save.
Semantically empty batches do not increment the revision: writing an identical
override, deleting a missing entry, and a batch whose final state equals its
initial state are all no-ops.

## Durability boundary

Source sessions serialize one write per Chunk and retain the latest unconfirmed
tile epoch until its write succeeds. Await `flushDeltas()` at save barriers and
before ending a session: it waits for Session-owned writes as well as the Store
barrier, rejects on a failed write, and retries still-pending coordinates on the
next call. A stale successful write cannot acknowledge a newer edit to the same
tile. IndexedDB mutations remain serialized, and direct Store users should
likewise await `flush()` for compatibility methods whose return type is `void`.

Records carry `WORLD_DELTA_FORMAT_VERSION`. Format 2 records include the source
`chunkSize`; format 1 records are validated against the caller's chunk geometry
and normalized to format 2 on their next IndexedDB write. Incompatible,
cross-Chunk or duplicate data fails closed during load.

Sources keep state for chunks with live overrides plus transient tile protection
while a restore or persistence acknowledgement is outstanding. Recently emptied
chunks use a bounded revision-tombstone set; overflow promotes a conservative
global revision baseline and releases the set. `clearDeltas()` also clears all
session tracking. Thus historical edit count is not an unbounded retention
mechanism. `WorldSource.stats` exposes `trackedDeltaChunks`, `pendingDeltaTiles`
and `restoringDeltaChunks` for save-session telemetry.

The current format is a local-save model, not a distributed synchronization
protocol. It deliberately does not yet add a WAL, snapshots, compression, or
automatic multiplayer conflict merging. A server-backed store can implement
the same chunk-batch/CAS contract, while command logs and merge policy should
be selected only after the authoritative game-state model is known.
