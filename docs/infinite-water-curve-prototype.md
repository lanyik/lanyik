# Infinite Water Curve Prototype

## Status and scope

`public/infinite-water.html` is an isolated visual prototype for evaluating a
direct world-space curve approach to water generation. It does not change the
v6 world generator, tile data, cache identity or the current decision to defer
production automatic rivers.

The page answers one narrower question: can an unbounded flat world query the
same natural-looking curves at any camera position without constructing a
finite drainage map first?

## Model

The prototype defines water features from stable spatial identities rather than
from chunks:

- Coarse spatial cells only own candidate identities. A seed independently
  decides whether a candidate exists, then jitters its origin anywhere inside
  the cell. The cell axes never influence the resulting path.
- Every accepted main curve independently chooses its direction, length, width
  and multiscale turn field. Integrating that field in both directions produces
  a control polyline with no shared global orientation or fixed lane spacing.
- A Catmull-Rom curve is reconstructed from the control polyline and sampled at
  a density selected from the current zoom. Camera zoom therefore changes only
  tessellation, not world-space geometry.
- Tributaries are addressed by `(curveIdentity, branchIndex)`. Their source and
  junction controls are deterministic, and the final handle follows the main
  curve tangent so junctions do not form square corners.
- The camera queries only candidate cells within the strict maximum curve reach
  and rejects non-intersecting control bounds before sampling them.
- Chunk and hex overlays are diagnostics only. They never select control points
  or influence the water path, so crossing a chunk boundary cannot bend or
  disconnect a curve.

The runtime cost is bounded by the visible world area and adaptive sample
spacing, not by distance from the origin or total explored area. Only the
current viewport geometry is retained; it is replaced when the view, seed or
curve controls change.

## Run and inspect

Start the static demo server:

```bash
npm run server
```

Then open <http://127.0.0.1:3000/infinite-water.html>. A seed can also be passed
as `?seed=value`.

- Drag to move through world space and use the wheel to zoom around the pointer.
- Adjust candidate density and curvature live.
- Toggle tributaries, chunk boundaries and the hex grid independently.
- Enable **sample polyline** to see the actual points submitted to Canvas rather
  than the conceptual continuous curve.
- `G`, `P`, `H` and `0` toggle chunks, sample points, hexes and reset the view.

`window.getInfiniteWaterDiagnostics()` exposes the seed, camera, visible feature
counts and a deterministic sample signature for browser verification.

## Deliberate omissions

This prototype evaluates geometry, continuity and query cost only. It does not
yet assign flow direction, discharge, elevation, erosion, lakes, deltas,
cross-river avoidance or gameplay crossings. Those are production integration
decisions, not fallback behavior hidden inside this scene.

Before integrating it into generator v7, the visual model should be accepted or
rejected on its own. If accepted, the next design step is to define a single
world-space water sampler that both chunk generation and rendering consume, then
add explicit confluence and width contracts without making chunks own the
network.
