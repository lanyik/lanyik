# Documentation

This directory documents the current repository rather than transient work
plans. Start with the root [README](../README.md) for setup and public API usage.

## Current state

| Area | Status | Source of truth |
|---|---|---|
| Package metadata | `0.5.0`; current `main` also contains unreleased work | [CHANGELOG](../CHANGELOG.md) |
| Rendering and world streaming | Implemented; WebGL2, source chunks, 12x12 render chunks, LOD and bounded residency | [render-streaming.md](./render-streaming.md) |
| Runtime foundation | Infrastructure v1 frozen on 2026-08-27 | [foundation-v1-freeze.md](./foundation-v1-freeze.md) |
| Persistence and pathfinding | Implemented as optional package subpaths | [package-boundaries.md](./package-boundaries.md) |
| Survivor RPG application | Playable vertical slice with combat, levels, attributes and generated equipment | [app-development.md](./app-development.md) |
| World-style generation v1 | Broad connected oceans and deterministic coarse-drainage rivers, with elevated climate snow and seam-free mountain lighting | [world-style-generation-v1.md](./world-style-generation-v1.md) |
| WebGPU/GPU culling | Evaluated and deferred until measurements justify a prototype | [render-backend-evaluation.md](./render-backend-evaluation.md) |
| Deferred optimization register | Machine-checked triggers, evidence and approval states | [optimization-gates.md](./optimization-gates.md) |

## Architecture and contracts

- [Runtime foundation architecture](./foundation-infrastructure.md): lifecycle,
  recovery, resource budgets, scheduling and module ownership.
- [Infrastructure v1 freeze contract](./foundation-v1-freeze.md): boundaries that
  new gameplay and content systems must consume rather than reopen.
- [Package boundaries](./package-boundaries.md): main entry and optional
  `persistence` and `pathfinding` subpaths.
- [Event contracts](./event-contracts.md): typed HexMap, Unit and GameEngine
  payload maps plus synchronous dispatch and unhandled-error policy.
- [Test strategy](./testing.md): contract tests, browser E2E, soak tests and
  benchmark gates.

## World and rendering

- [Rendering and streaming](./render-streaming.md): the end-to-end source,
  render-chunk, Worker, LOD, cache, editing and custom-layer pipeline.
- [Render world controller](./render-world-controller.md): ownership of one
  streamed rendering session.
- [Chunk residency](./chunk-residency.md): shared leases across rendering,
  navigation and application consumers.
- [World delta persistence](./world-delta-persistence.md): sparse mutable
  overrides kept separate from reproducible base terrain.

## Gameplay-side services

- [Hierarchical pathfinding](./hierarchical-pathfinding.md): long routes over
  unloaded source chunks.
- [Combat, progression and equipment](./game/combat-and-progression.md): the
  implemented fixed-step battle, regional populations, XP, attributes, generated loot
  and capacity contracts.
- [Combat ECS and behavior trees](./game/simulation-and-ai.md): bounded SoA
  storage, entity identity, system order, interruptible monster actions and CPU gates.
- [Survivor interface design](./game/interface-design.md): HUD information
  hierarchy, character and inventory workspaces, item cards and responsive layout.

## Decisions and roadmap

- [App development](./app-development.md): implemented survivor application
  boundaries, authoritative fixed-step state, batched rendering, UI snapshots,
  lifecycle and verification commands.
- [Survivor RPG concept](../游戏想法.md): player-facing loop, current playable
  scope and explicitly deferred progression layers.
- [Deferred optimization gates](./optimization-gates.md): measurable triggers,
  evidence format and approval state for intentionally postponed work.
- [Render backend evaluation](./render-backend-evaluation.md): why WebGL2 and
  chunk-level CPU culling remain the production path.
- [World-style generation v1](./world-style-generation-v1.md): implemented
  terrain generation, surface authority, rendering contracts and freeze gates.
- [Coarse drainage water network](./decisions/coarse-drainage-water-network.md):
  why the water mask and bounded drainage sampler replace detail-noise water.

When updating documentation, keep current behavior in the README or the owning
architecture document, release deltas in the changelog, and future work in an
explicitly marked design document. Do not commit agent instructions, task
checklists, exact test counts or temporary investigation notes as product docs.
