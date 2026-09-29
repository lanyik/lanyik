# Render backend and GPU-culling evaluation

导航：[总导航 · 验证与决策](README.md#verification) · [按任务阅读](README.md#routes)

## Decision

Scope: this decision and its measurements describe the existing hex-world
renderer. The [continuous-world design](decisions/continuous-world-foundation.md)
starts its technical sample on this backend, but must measure its own terrain,
water and atmosphere workload before claiming suitability for the full game.

Keep `WebGLRenderer` and the existing 12×12 render-chunk culling path as the
production default. Evaluate a backend migration against a measured production
bottleneck and the material/asset migration cost; candidate instance count alone
does not establish that per-instance GPU culling is worth that change.

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

This is a CPU crossover test, not a GPU benchmark. Measure candidate buffers,
visibility compaction, submission and synchronization on the actual prototype;
a capability report alone proves no runtime contract. Run the production
rendering path on supported hardware before accepting a backend migration.

## Migration cost and compatibility

Three.js `WebGPURenderer` can select WebGPU and fall back to a WebGL 2 backend,
but the renderer remains experimental and can perform worse than
`WebGLRenderer` for some scenes. Its migration guide also says that
`ShaderMaterial` and `RawShaderMaterial` are unsupported and must be ported to
node materials/TSL. See the official
[WebGPURenderer guide](https://threejs.org/manual/pages/webgpurenderer).

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
