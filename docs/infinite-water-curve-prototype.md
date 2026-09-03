# Infinite Water Curve Field

## Status and scope

`public/infinite-water.html` is the visual inspection scene for the same
deterministic curve field now consumed by generator v9. It is no longer a
separate implementation: the page imports the built
`infinite-water-curve-field.mjs` entry, while production `WorldWaterSampler`
imports its TypeScript source.

The scene still contains a separate broad-water basin experiment. Those basin
shapes are not part of generator v9; the production world retains its existing
continental sea and regional lake rules.

## Shared curve model

`InfiniteWaterCurveField` defines water geometry from stable spatial identities
rather than chunks or camera state:

- Three ownership-cell families represent short, medium and major paths with
  different counts, lengths, widths and control spacing.
- A low-frequency deterministic density field creates regional variation but
  keeps a nonzero floor so a camera-sized region cannot become an accidental
  curve desert.
- Every accepted main path independently chooses position, direction, length,
  accumulated turn and whether it is reconstructed as a Catmull-Rom curve or
  kept as a control polyline.
- Tributaries are addressed by their parent feature and branch index. Their
  cubic endpoint is an exact parent control, producing a real junction.
- Bounds queries enumerate only ownership cells inside a proven maximum reach,
  reject non-intersecting controls before publishing paths and return complete,
  identical geometry through overlapping queries.

The reference profile is expressed in radius-one hex world units. The visual
scene scales it by its 28-pixel diagnostic hex radius; production consumes it
at unit scale. Density and curvature controls override only those two reference
values, so the browser scene remains a faithful geometry inspector.

## Production sampling boundary

The shared path is a macro sampling parent, not a second render layer.
Generator v9 converts it to the existing hex world:

1. Curve samples are rounded through axial/cube coordinates to the current
   even-column grid.
2. A cube-coordinate line fills every gap between samples, guaranteeing a chain
   of six-neighbour cells across page and chunk boundaries.
3. Each curve radius is sampled against nearby hex footprints. The centerline
   keeps sub-cell tributaries continuous while major paths occupy multiple
   cells according to their generated width.
4. Selected cells become ordinary `Land.sea`/`Land.coastal` terrain. Their
   visual boundary is the discrete hex occupancy boundary, not a smooth spline
   mesh or a river-channel displacement inside a land cell.

Infinite/bounded production uses a bounded 32x32-page LRU. Toroidal production
owns one canonical, domain-scaled feature set and wraps the rasterized steps
into a periodic mask. Overview generation queries the same curves directly so
thin long paths survive wide-area minimap downsampling.

See the current
[generator v9 decision](./decisions/hex-water-terrain-sampling-v9.md) for the
identity, topology, packed-format and verification contract. The superseded
generator v7 document records the short local-drainage implementation that was
removed after the integration requirement was clarified.

## Bounded broad-water experiment

The visual-only ocean layer uses randomly jittered candidate basins followed by
deterministic Poisson thinning. Surviving rotated elliptical basins have
harmonic boundaries, a maximum 2,600-unit reach and at least 5,600 units between
centres. This preserves a minimum 400-unit land corridor and prevents adjacent
basins from merging into an unbounded water wall.

The ocean mask is cached in screen space and refreshed after interaction. It is
composited after curves only for visual experimentation; it does not change the
shared curve field or any production terrain sample.

## Run and inspect

Start the static server:

```bash
npm run server
```

Open <http://127.0.0.1:3000/infinite-water.html>, optionally with
`?seed=value`.

- Drag to pan and use the wheel to zoom around the pointer.
- Adjust curve density, accumulated curvature and visual-only sea density.
- Toggle branches, sample polylines, chunk boundaries and the hex overlay.
- `G`, `P`, `H` and `0` toggle chunks, samples, hexes and reset the view.

`window.getInfiniteWaterDiagnostics()` exposes deterministic geometry and ocean
metrics for browser verification.

## Deliberate omissions

Generator v9 does not claim physical discharge, erosion, drainage elevation,
deltas or navigability. It establishes a deterministic macro water skeleton
and faithful hex sampling. Gameplay classification, crossings, city placement
and any later physical hydrology remain separate versioned decisions.
