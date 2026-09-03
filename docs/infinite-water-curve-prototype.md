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

- Three independent candidate families represent short, medium and major
  curves. Each has a different ownership-cell size, feature count, length,
  width and sampling scale, so no single spacing can emerge across zoom levels.
- A continuous low-frequency density field controls candidate acceptance. It
  deliberately produces empty regions and dense clusters; accepted origins are
  then independently jittered inside their ownership cells. Cell axes never
  influence a resulting path.
- Every accepted curve independently chooses its direction, length, width and
  turn field. Turn is accumulated along the control line instead of remaining
  bounded around its initial heading, allowing long curves to change direction
  substantially. There is no shared global orientation.
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

## Broad ocean field

The ocean is generated independently from the curve candidates. A very
low-frequency continental field, a regional field and smaller coastline detail
are sampled after deterministic two-dimensional domain warping. Thresholding
that continuous value produces single water bodies spanning many render and
source chunks rather than per-tile water noise.

The ocean mask is sampled into a bounded screen-space cache only when the
camera, seed, sea level or viewport changes. The cached mask is transformed
during active pan/zoom and resampled after a short interaction debounce, so
navigation does not synchronously rebuild the coastline on every pointer event.
It is composited after river curves, so curve portions beneath the ocean
disappear while their landward parts end at the same deterministic coastline.
Chunk and hex diagnostics are drawn last and do not affect either field.

## Run and inspect

Start the static demo server:

```bash
npm run server
```

Then open <http://127.0.0.1:3000/infinite-water.html>. A seed can also be passed
as `?seed=value`.

- Drag to move through world space and use the wheel to zoom around the pointer.
- Adjust candidate density, accumulated curvature and ocean coverage live.
- Toggle tributaries, chunk boundaries and the hex grid independently.
- Enable **sample polyline** to see the actual points submitted to Canvas rather
  than the conceptual continuous curve.
- `G`, `P`, `H` and `0` toggle chunks, sample points, hexes and reset the view.

`window.getInfiniteWaterDiagnostics()` exposes the seed, camera, visible feature
counts, direction-bin count, viewport ocean coverage and a deterministic sample
signature for browser verification.

## Deliberate omissions

This prototype evaluates geometry, continuity, large water-body composition and
query cost only. It does not yet assign flow direction, discharge, elevation,
erosion, lakes, deltas, cross-river avoidance or gameplay crossings. Those are
production integration decisions, not fallback behavior hidden inside this
scene.

Before integrating it into generator v7, the visual model should be accepted or
rejected on its own. If accepted, the next design step is to define a single
world-space water sampler that both chunk generation and rendering consume, then
add explicit confluence and width contracts without making chunks own the
network.
