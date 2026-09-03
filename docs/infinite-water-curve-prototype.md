# Infinite Water Curve Prototype

## Status and scope

`public/infinite-water.html` remains an isolated visual prototype for evaluating
a direct world-space curve approach to water generation. Generator v7 does not
use its curves, feature identities, tessellation or broad-water layer. The page
remains available only as a visual experiment in disorder and bank character.

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

## Separation from generator v7

The prototype was explicitly rejected as the production river skeleton after
the integration boundary was clarified. Generator v7 keeps the existing world
and hex cells authoritative: `WorldWaterSampler` proposes source hexes and
walks the lowest drainage potential among the six adjacent hexes. It contains
no continuous centreline, feature curve, curve-to-grid rasterizer or
view-dependent sampling.

Only one visual lesson is shared. The terrain fragment shader uses bilinear C0
value noise for the bank inside a selected river hex. Values agree across tile
borders while slope can change at the noise lattice edges. This does not affect
which hexes contain water; macro terrain, sea and lake generation retain their
existing rules.

## Bounded broad-water field

Broad water is generated independently from the curve candidates. Fine spatial
cells propose randomly jittered basin centers and priorities. A deterministic
Poisson-thinning pass rejects a candidate whenever a higher-priority center is
too close, so the surviving centers have no visible placement grid while still
obeying a hard minimum separation.

Each center owns one rotated elliptical basin with several angular boundary
harmonics. A basin can span many render and source chunks, but its effective
radius is capped below `2,600` world units. Surviving centers are separated by
at least `5,600` units, which guarantees a land corridor of at least `400`
units and prevents neighboring basins from merging into an unbounded water
wall. The sea-density control changes candidate frequency and modestly changes
size within that cap; it cannot remove the corridor invariant.

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
- Adjust candidate density, accumulated curvature and bounded-sea density live.
- Toggle tributaries, chunk boundaries and the hex grid independently.
- Enable **sample polyline** to see the actual points submitted to Canvas rather
  than the conceptual continuous curve.
- `G`, `P`, `H` and `0` toggle chunks, sample points, hexes and reset the view.

`window.getInfiniteWaterDiagnostics()` exposes the seed, camera, visible feature
counts, direction-bin count, viewport ocean coverage, largest queried basin,
minimum land corridor and a deterministic sample signature for browser
verification.

## Deliberate omissions

The prototype's curves and sea basins are not part of generator v7. Production
rivers use a style-scale drainage potential derived from existing generated
surface fields; they do not claim physical discharge, erosion, deltas or
crossing placement. Those remain separate gameplay and hydrology decisions.
