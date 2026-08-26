# Chunk residency and ownership

`WorldSource` is the storage and I/O boundary. It intentionally retains the
low-level `loadChunk()` / `releaseChunk()` contract, while
`ChunkResidencyCoordinator` owns the cross-system lifetime of materialized
chunks.

```text
WorldStreamer lease -------+
Pathfinder route lease -----+--> ChunkResidencyCoordinator --> WorldSource
Simulation lease ----------+
```

Use the source-scoped factory whenever several systems share a source:

```ts
const residency = getChunkResidencyCoordinator(source);

const renderLease = await residency.acquireChunk(2, 3, {
    owner: "render",
    priority: 0,
    signal
});

try {
    render(renderLease.chunk);
} finally {
    renderLease.release();
}
```

Concurrent acquisitions of the same canonical chunk share one source load.
Every acquisition receives an independent, idempotent lease. Aborting one
waiter does not cancel a load still required by another owner, and the source
chunk is released only after the final lease ends.

`WorldStreamer` and `HierarchicalPathfinder` use the source-scoped coordinator
by default. `HexMap.worldChunkResidency` exposes the coordinator for the active
world session. Explicit injection is useful in kernels and tests:

```ts
const finder = new HierarchicalPathfinder(
    source,
    navigation,
    passable,
    { residency, owner: "army-navigation" }
);
```

The coordinator's stats expose resident/pending chunk counts and active leases
grouped by owner. Those counts are diagnostics, not an eviction policy. Camera
retention remains the streamer's job; route and simulation lifetimes remain
their owners' jobs.

Disposing a coordinator invalidates every lease in that world session. Pass
`true` to `dispose(true)` only when the coordinator also owns the source
lifecycle. A subsystem that merely owns leases should release those leases and
must not dispose a shared coordinator.
