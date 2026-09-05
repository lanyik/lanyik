# Event contracts

`EventEmitter<Events>` binds each event name to one payload type. `HexMap`,
`Unit` and `GameEngine` publish separate maps instead of sharing one union:

| Emitter | Events |
|---|---|
| `HexMapEventMap` | `loadstart`, `load`, `error`, `frame`, WebGL context changes, `surfacechange`, `click`, `hover` |
| `UnitEventMap` | `start_move`, `cell_enter`, `end_move` |
| `GameEngineEventMap` | all unit movement events plus `hover`, `click`, `unitClick` |

The event maps and their named payload interfaces are exported from the root
package. Payload requirements apply to `emit()`, and `on()`/`off()` infer the
listener parameter from the selected name. `void` events omit the payload:

```ts
map.on("frame", ({ dtS, cpuFrameMs, gpuFrameMs }) => {
    // All fields are inferred from HexMapFrameEvent.
});
map.on("load", () => {});
```

The frame event's `t` is the animation-frame timestamp and `dtS` is the elapsed
time since the previous frame (zero on startup/context recovery). `cpuFrameMs`
measures the previous frame's CPU work; `gpuFrameMs` is an asynchronously
available GPU timer result. Neither measures display cadence. The demo computes
actual FPS as frame intervals counted per elapsed timestamp window. Its primary
panel shows CPU work, GPU render time, `max(mean CPU, mean GPU)` frame work and
`1000 / frame work` theoretical FPS over 500 ms windows. CPU/GPU work overlaps
across frames, so these averages are not added. This estimates throughput at the
current workload without the display interval; it is not a measured uncapped
frame rate and excludes work outside the map's animation callback/GPU query.
When only one processor has valid samples, the panel explicitly labels that
processor's ceiling; it never treats a missing GPU sample as measured zero.
Zero work produces no FPS estimate. No GPU sample is reused across windows.
Actual FPS remains a separate reference, and diagnostics retain `frameTime` as
the mean display interval. Hidden pages and context recovery reset sampling.

Dispatch is synchronous and uses a listener snapshot. Adding or removing a
listener during dispatch affects the next emission, not the current snapshot.
A listener exception propagates to the emitter's caller; remaining listeners
in that dispatch are not invoked.

## Error policy

An `error` event without a listener throws its `Error` payload synchronously.
This prevents background render, Worker or rebuild failures from disappearing
because an application forgot to register diagnostics. With one or more error
listeners, dispatch follows the normal synchronous rules.

World-layer teardown is the deliberate exception because one failing observer
must not strand GPU cleanup. Teardown first aggregates and releases resources,
then emits the aggregate to registered error listeners. With no listener it
writes the aggregate to `console.error`; if an error listener itself throws,
that observer failure is also logged after cleanup completes.
