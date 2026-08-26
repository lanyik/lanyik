# World simulation runtime

`WorldSimulationRuntime` is the gameplay-side counterpart to camera-driven
render streaming. It contains no Three.js objects and never reads camera state.

```text
camera -> WorldStreamer -> short-lived render chunks

players/events -> activity anchors -> high-frequency simulation chunks
all other resident entity chunks     -> low-frequency background simulation

SimulationChunkStore <-> hibernated sparse entity snapshots
```

This separation means an AI army or production queue on another continent can
continue to advance after its terrain and models leave GPU/CPU render residency.
Applications choose which simulation chunks remain resident and may hibernate
cold chunks after saving them.

```ts
import {
    IndexedDbSimulationChunkStore,
    WorldSimulationRuntime
} from "three-hex-map/simulation";

type ArmyState = { supplies: number };
const simulation = new WorldSimulationRuntime<ArmyState>({
    chunkSize: 96,
    activeTickIntervalSeconds: 0.1,
    backgroundTickIntervalSeconds: 5,
    maxTicksPerAdvance: 50,
    checkpointIntervalSeconds: 30,
    store: new IndexedDbSimulationChunkStore({ worldId: "campaign-slot-1" })
});

simulation.registerSystem({
    id: "consume-supplies",
    update(context) {
        for (const army of context.entities) {
            context.setEntityState(army.id, {
                supplies: army.state.supplies - context.deltaSeconds
            });
        }
    }
});

simulation.addEntity({ id: "army-b", x: 12000, y: -4000, state: { supplies: 100 } });
simulation.setActivityAnchor({ id: "player-a", x: 0, y: 0, radiusChunks: 2 });

// Call from a server clock, fixed game loop, or HexMap's frame event. The
// runtime remains independent even when a render frame supplies the delta.
await simulation.advance(deltaSeconds);
```

Systems receive an immutable entity snapshot for the current tick and stage
state changes, movement, removal and spawning through the context. Mutations
apply between deterministic tick rounds, so crossing into another simulation
chunk cannot make an entity update twice in the same round. Chunk and system
iteration order is stable. Per-chunk simulated time advances by the interval it
actually processed rather than by render-frame time.

`maxTicksPerAdvance` prevents a long pause from causing an unbounded catch-up
spike; dropped ticks are visible in `runtime.stats`. `flush()` writes all dirty
resident snapshots. `hibernateChunk()` saves and releases a non-active Chunk,
while `wakeChunk()` restores it. A production application can implement
`SimulationChunkStore` over an authoritative server. The included IndexedDB
store persists browser campaigns by `worldId`; the memory store is useful for
sessions and tests.

Built-in stores implement `listChunks()`, and a fresh runtime can call
`restoreStoredChunks()` to discover and atomically restore every snapshot for
its `worldId` without an external chunk manifest. Custom stores may omit
enumeration when their application already owns the manifest. Empty dirty
chunks are deleted at the next save barrier rather than accumulating historical
snapshots as entities move across the world.

`wakeChunk()`, `hibernateChunk()`, `advance()` and `flush()` share one ordered
operation queue. Lifecycle revisions are checked after every storage await, so
an old restore cannot publish a Chunk after `dispose()`, and concurrent wakes of
the same Chunk perform only one restore. Synchronous structural methods such as
`addEntity()` and `removeEntity()` reject while an asynchronous operation is in
flight; await the operation before mutating from application code. Systems may
still stage structural mutations through their tick context.

Restored snapshots are validated before any entity is installed: format and
time fields must be valid, every entity must be an object with a non-empty ID,
IDs must be unique inside the snapshot, and coordinates must be canonical and
belong to the declared Chunk. A malformed snapshot therefore fails atomically.

Call `await runtime.flush()` at a save barrier before `dispose()`. Disposal
invalidates pending work immediately and releases the store after queued work
has settled. Activity anchors affect frequency only: they do not load terrain
and they do not control whether distant resident entity chunks continue
background simulation.

## Route-driven army slice

The simulation subpath also exports the deliberately small `ArmyMarch` helper.
It converts a `HierarchicalPathfinder` result into persistent route state and a
camera-independent simulation system:

```ts
import {
    WorldSimulationRuntime,
    createArmyMarchState,
    createArmyMarchSystem,
    orderArmyMarch
} from "three-hex-map/simulation";

const runtime = new WorldSimulationRuntime({ store, chunkSize: 24 });
runtime.registerSystem(createArmyMarchSystem());
runtime.addEntity({
    id: "first-army",
    x: 0,
    y: 0,
    state: createArmyMarchState({ speedTilesPerSecond: 6 })
});

await orderArmyMarch(runtime, pathfinder, "first-army", { x: 72, y: 12 });
await runtime.advance(deltaSeconds);
await runtime.flush();
```

The helper owns no render object and releases path-owned terrain leases as soon
as the route is copied into simulation state. Applications remain responsible
for route invalidation policy when gameplay edits change terrain passability.
