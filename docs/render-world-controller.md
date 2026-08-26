# Render world controller

`RenderWorldController` is the lifecycle boundary between the interactive
`HexMap` shell and a streamed world session. It owns the session's
`WorldSource`, shared `ChunkResidencyCoordinator`, and `WorldStreamer`.

```text
HexMap
  camera / input / picking / public API
             |
RenderWorldController
  source -> shared chunk leases -> camera-demand streamer
             |
HexMap render callbacks
  terrain / grass / forest / custom WorldRenderLayer objects
```

The controller intentionally accepts render callbacks instead of importing
Three.js objects. That makes session cancellation, source disposal, and lease
cleanup independently testable while the existing render-layer implementations
remain stable.

`HexMap.renderWorldController` exposes the active controller and
`HexMap.worldChunkResidency` exposes its residency coordinator. Replacing a
world stops the controller, releases all session leases, unloads render layers,
and then disposes the source.

Render-layer teardown is best-effort and exhaustive. A failed mount rolls back
objects already added through the layer host; unmount, unload and disposal keep
processing the remaining layers and then report one
`WorldRenderLayerLifecycleError` containing every failure. Chunk mount state is
tracked explicitly, making repeated or partial cleanup idempotent.

This is the first extraction seam, not the final decomposition. Camera/input,
picking, and public APIs stay in `HexMap`; future moves of render-layer
registration, frame tasks, LOD scheduling, and adaptive telemetry can target
the controller without changing `WorldSource` or chunk ownership again.
