# Persistent campaign vertical slice

The **Persistent campaign** mode in the `/` demo's control panel is the first
end-to-end consumer of the streamed-world architecture. It is intentionally a
small integration example, not a second game engine. The selected mode is
remembered, so reloading `/` returns to the campaign and exercises recovery.

```text
ProceduralWorldSource ──> streamed render chunks ──> HexMap
        │                         independent camera window
        ├── World Delta Store ──> persistent arrival outpost
        │
        └── HierarchicalPathfinder ──> route corridor leases
                                         │ release after planning
                                         ▼
IndexedDbSimulationChunkStore <── WorldSimulationRuntime
                                         │
                                         └── ArmyMarch background ticks
```

## Scenario

1. The demo recovers one committed generation containing both the complete
   simulation snapshot and sparse terrain deltas. A legacy direct-store save is
   imported once when no generation manifest exists. If no army exists, it
   creates `first-army` on a resident passable tile.
2. **Start long march** chooses a passable target in another source chunk and
   plans it with `HierarchicalPathfinder`.
3. `ArmyMarch` copies the route into simulation state and immediately releases
   the pathfinder's detailed chunk leases. Rendering may unload those chunks.
4. The initial player area remains an activity anchor. Once the army leaves it,
   the same route continues at the background tick interval, independent of
   camera position and render residency.
5. Arrival writes a monument city through `HexMap.setTileOverride()` and
   publishes a strict generation checkpoint containing both authoritative
   stores.
6. Reloading validates the full world descriptor and restores the army and
   outpost from the same committed generation. Moving the camera to the
   destination then renders the restored delta.

Run it manually by opening:

```text
http://127.0.0.1:3000/
```

Choose **Persistent campaign** under **World generation**. The campaign panel
can start a route, follow the army, or create an explicit save barrier.
Clicking a visible passable tile also issues an order. Legacy query flags such
as `?infinite&campaign&autostart` remain available to deterministic browser
automation, but they are no longer separate user-facing launch routes.

## Deliberate boundaries

- Army position, route cursor and progress belong to simulation snapshots.
- The outpost belongs to sparse World Delta persistence.
- The marker is disposable presentation state and is never persisted.
- This example writes only a passability-neutral city delta. A terrain editor
  must rebuild versioned navigation summaries when terrain or movement costs
  change; it must not reuse the demo's neutral-delta revision policy.
- There is no combat, economy, rollback, multiplayer merge or generic ECS in
  this slice. Those require real gameplay data before becoming public runtime
  contracts.

`tests/world/armyMarch.test.ts` verifies route-to-background-tick behavior.
`tests/e2e/campaign.spec.ts` moves the camera away, completes the route, reloads
the page, and verifies both the army snapshot and outpost delta.
