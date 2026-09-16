# Deferred optimization gates

导航：[总导航 · 验证与决策](README.md#verification) · [按任务阅读](README.md#routes)

`optimization-gates.json` is the machine-checked decision register for costly
work that is deliberately outside the current foundation. It prevents a vague
roadmap item from becoming an implementation merely because it sounds useful,
and prevents a real measured bottleneck from remaining hidden in prose.

Run the register check with:

```sh
npm run check:optimization-gates
```

The check validates each owner-document marker, measurement command, trigger
expression, evidence path and decision record. CI runs it before building.
The checker validates structure and evidence evaluation; changes must also be
reviewed against the owner document to verify metric ownership and meaning.
This is a decision-integrity check, not a synthetic claim that browser GPU or
visual-quality thresholds have been measured on CI hardware.

## State transitions

Use the states in order:

1. `deferred`: no trigger evidence is attached and no implementation starts.
2. `triggered`: a committed evidence JSON document satisfies at least one full
   trigger group.
3. `approved`: the evidence still satisfies a trigger and a reviewed decision
   record accepts the cost and verification plan.
4. `implemented`: the approved design and its owning code/document contracts
   have shipped together.

Do not skip directly from `deferred` to implementation. A single trigger group
is an AND-set; groups are OR alternatives. Boolean measurements only support
exact equality. Numeric measurements use the operator recorded in the gate.

## Evidence contract

Every non-deferred gate references at least one repository-local JSON document
with exactly this shape:

```json
{
  "schemaVersion": 1,
  "gateId": "webgpu-gpu-culling",
  "capturedAt": "2026-09-01T12:00:00.000Z",
  "measurementContext": "Physical browser hardware, fixed stress scene and trace settings",
  "measurements": {
    "renderSubmissionOrCullingP95Ms": 2.2
  },
  "artifactReferences": [
    "docs/evidence/webgpu-gpu-culling/trace.json"
  ]
}
```

Raw traces, screenshots or review output stay referenced rather than copied
into the summary. The checker requires those artifacts to exist and recomputes
the trigger expression from `measurements`; a prose assertion or an unrelated
file cannot advance the state. Approval additionally requires a repository-
local decision record.

## Current decisions

- [WebGPU/GPU culling](./render-backend-evaluation.md) uses the repeatable CPU
  crossover benchmark as a baseline, but requires a representative physical-
  hardware browser trace for frame, submission, draw-call and overdraw gates.
- [Automatic river generation](./decisions/coarse-drainage-water-network.md) is
  implemented after direct 2048×2048 overview review exposed fragmented
  detail-noise water, unnatural sampled channels and excessive overview cost.
  Its trigger groups are an explicit user hydrology requirement; at least three
  recurring defect samples across at least two topology groups and two consecutive
  fixed-corpus runs; or a gameplay requirement for a navigable/editable river
  network. These are river-design triggers, not WebGPU migration triggers. The
  implemented low-frequency ocean mask and bounded coarse drainage do not claim
  to provide a navigable/editable river graph.

Adding a new deferred optimization means adding one register entry, an owner
marker and a reproducible measurement command. Keep speculative implementation
details out until evidence moves the gate to `approved`.
