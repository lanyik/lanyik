# Infinite Water Curve Field

## Status and scope

`public/infinite-water.html` is the visual inspection scene for the same
deterministic curve and basin field consumed by generator v11. It imports the
built `infinite-water-curve-field.mjs` entry, while production
`WorldWaterSampler` imports its TypeScript source. There is no longer a second
inspector-only basin implementation.

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
- A separate candidate grid creates rotated elliptical sea basins. Stable
  priorities apply Poisson thinning before three harmonic waves shape each
  bounded coastline; the configured separation is larger than twice the
  conservative maximum reach, so independent basins in the open field retain
  land corridors.

The reference profile is expressed in radius-one hex world units. The visual
scene scales it by its 28-pixel diagnostic hex radius; production consumes it
at unit scale. Density, curvature and sea-density controls override the same
reference values, so the browser scene remains a faithful geometry inspector.

## Production sampling boundary

The shared path is a macro sampling parent, not a second render layer.
Generator v11 converts it to the existing hex world:

1. Curve samples are rounded through axial/cube coordinates to the current
   even-column grid.
2. A cube-coordinate line fills every gap between samples, guaranteeing a chain
   of six-neighbour cells across page and chunk boundaries.
3. Each curve radius is sampled against nearby hex footprints. Every family
   has a multi-cell minimum radius; major paths occupy a visible fraction of a
   default 24-cell source chunk without depending on the configured chunk size.
4. Intersecting bounded basins are sampled with the same harmonic boundary
   function used by the inspector, expanded by one hex apothem for cell coverage.
5. Selected cells become ordinary `Land.sea`/`Land.coastal` terrain. Their
   visual boundary is the discrete hex occupancy boundary, not a smooth spline
   mesh or a river-channel displacement inside a land cell.

Infinite/bounded production uses a bounded 32x32-page LRU. Toroidal production
owns one canonical, domain-scaled feature set and wraps the rasterized paths and
basins into a periodic mask. Overview generation queries the same water field
directly so paths and basin edges survive wide-area minimap downsampling.

See the current
[generator v11 decision](./decisions/sampled-water-only-v11.md) for the source,
identity and verification contract; the
[generator v10 decision](./decisions/chunk-scale-water-and-carved-basins-v10.md)
retains the geometry details. The superseded generator v7-v9 documents retain
the earlier local-drainage, channel and thin-ribbon decisions.

## Finite-reach broad-water basins

The shared ocean layer uses randomly jittered candidate basins followed by
deterministic Poisson thinning. Surviving rotated elliptical basins have
harmonic boundaries, a conservative maximum reach below 87 radius-one world
units and at least 200 units between centres. At the inspector's 28-pixel
diagnostic scale these become a reach below 2,410 pixels and a 5,600-pixel
separation, leaving more than 780 pixels between the conservative boundary
circles. Open-field basins therefore cannot merge into an unbounded water wall;
toroidal modulo wrapping may intentionally connect water across its periodic
seam.

The inspector caches its presentation mask in screen space and refreshes it
after interaction. Production queries the same basin records by world bounds
and rasterizes only intersecting tile extents into its bounded page cache.

## Run and inspect

Start the static server:

```bash
npm run server
```

Open <http://127.0.0.1:3000/infinite-water.html>, optionally with
`?seed=value`.

- Drag to pan and use the wheel to zoom around the pointer.
- Adjust curve density, accumulated curvature and shared sea density.
- Toggle branches, sample polylines, chunk boundaries and the hex overlay.
- `G`, `P`, `H` and `0` toggle chunks, samples, hexes and reset the view.

`window.getInfiniteWaterDiagnostics()` exposes deterministic geometry and ocean
metrics for browser verification.

## Deliberate omissions

Generator v11 does not claim physical discharge, erosion, drainage elevation,
deltas or navigability. It establishes deterministic multi-cell water paths,
bounded broad seas and faithful hex sampling. Gameplay classification,
crossings, city placement and any later physical hydrology remain separate
versioned decisions.
