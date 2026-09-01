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
