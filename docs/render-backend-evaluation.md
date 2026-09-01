# Render backend and GPU-culling evaluation

## Decision

Keep `WebGLRenderer` and the existing 12×12 render-chunk culling path as the
production default. A WebGPU backend is technically viable, but it is not the
next bottleneck to remove: at 100,000 candidate instances the current chunk
frustum pass took a 0.019ms median on the evaluation machine, while exact
per-instance CPU culling and visibility compaction took a 1.590ms median and
removed only about 16% of the instances in the fixed camera view.

GPU culling should therefore be an opt-in prototype triggered by measured draw
submission or overdraw pressure. Instance count alone is not a sufficient
reason to replace the backend.

## Reproducible measurements

Run:

```sh
npm run benchmark:render-backends
```

The fixed benchmark uses the same 12×12 render-chunk granularity as the runtime,
Three.js `Frustum.intersectsBox()` for the current path, and
`Frustum.containsPoint()` plus a compacted `Uint32Array` for an exact
per-instance CPU proxy. Each timed sample runs 80 iterations after warm-up.
The command records five timed samples and uses their median for comparisons;
raw samples, range and host details remain in the JSON so a noisy run is
visible instead of being mistaken for a backend signal.

Measurements on Node 22.16.0, V8 12.4, Windows x64, Intel Core i7-11700K:

| Candidates | Render chunks | Visible instances | Chunk cull | Instance cull + compact | CPU ratio |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 81 | 10,000 | 0.010ms | 0.173ms | 17.3× |
| 50,000 | 361 | 50,000 | 0.016ms | 0.886ms | 55.4× |
| 100,000 | 729 | 83,783 | 0.019ms | 1.590ms | 83.7× |

The 100,000-instance GPU candidate buffer would require about 1.526MiB for a
position/radius record plus up to 0.381MiB for compacted indices. Those sizes are
reasonable, but a compute dispatch, synchronization and indirect draw would be
new work that does not eliminate a meaningful current CPU cost.

These numbers are a CPU crossover test, not a fabricated GPU benchmark. Backend
availability is environment-specific and a capability report alone proves no
runtime contract. A future WebGPU prototype must therefore execute and verify
its real rendering path on supported hardware instead of adding a non-failing
availability probe to the foundation suite.

## Migration cost and compatibility

Three.js `WebGPURenderer` can select WebGPU and fall back to a WebGL 2 backend,
but the renderer remains experimental and can perform worse than
`WebGLRenderer` for some scenes. Its migration guide also says that
`ShaderMaterial` and `RawShaderMaterial` are unsupported and must be ported to
node materials/TSL. See the official
[WebGPURenderer guide](https://threejs.org/manual/en/webgpurenderer).

That is a material change here: terrain, water and grass are three custom
`RawShaderMaterial` pipelines with instanced attributes, atlas/coast rules,
fog-of-war, wind and world-offset logic. Switching the renderer before porting
all three would break the core visual path. TSL does provide compute shaders and
storage-backed instanced attributes, so it is the appropriate portability layer
for a future implementation. See the official [TSL compute documentation](https://threejs.org/docs/TSL.html)
and [StorageInstancedBufferAttribute documentation](https://threejs.org/docs/pages/StorageInstancedBufferAttribute.html).

WebGPU itself exposes indirect indexed drawing, but feature-dependent behavior
such as non-zero `firstInstance` must be accounted for. The authoritative
[WebGPU specification](https://www.w3.org/TR/webgpu/) defines these commands and
feature gates. Browser coverage must also remain a product decision; MDN still
classifies the [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
as limited availability and requires a secure context.

## Prototype gates

<!-- optimization-gate:webgpu-gpu-culling -->

Start a WebGPU/GPU-culling prototype only when a representative hardware trace
meets at least one of these conditions:

- render submission or culling consumes at least 2ms at p95;
- sustained draw calls exceed 500 after layer/material batching;
- chunk-level overdraw is the measured GPU bottleneck and exact instance
  culling is expected to remove at least 30% of submitted instances;
- a new render layer needs GPU compute for work that cannot stay within the
  existing frame/Worker budgets.

### Instance-pool batching comes first for draw-call pressure

Terrain and grass already share base geometry, while trees already use
`InstancedMesh`; their remaining batches are deliberately split by render
chunk, material/model and LOD. A single global instance pool would reduce draw
submission but make independent chunk eviction, partial GPU updates, fog changes
and LOD replacement substantially more expensive.

If draw calls cross the 500-call gate before culling time crosses its gate, try a
bounded pool before changing renderer backends: group only adjacent resident
chunks with the same material/model and LOD, cap each pool to one source chunk,
and rebuild/compact it through the existing frame-task budget. Compare saved
draw calls against upload bytes and frame-time p95. Keep the current per-render-
chunk batches when the merge does not produce a measurable win. A global pool
or per-frame CPU compaction is not recommended.

Use three stages so each step is independently testable:

1. Port terrain, water and grass GLSL to TSL and run `WebGPURenderer` with its
   WebGL 2 backend until screenshots and the existing stress/leak suite match.
2. Enable WebGPU through an explicit prototype backend selection and collect
   GPU timestamps on supported physical adapters. Unsupported environments fail
   validation instead of silently switching renderers.
3. Add storage-buffer instance data, compute visibility compaction and indirect
   draws only for the layer that crossed a gate; keep source streaming,
   floating-origin coordinates and chunk residency backend-independent.

This preserves the mature streaming foundation while leaving a measured,
low-risk route to WebGPU when the workload actually needs it.
