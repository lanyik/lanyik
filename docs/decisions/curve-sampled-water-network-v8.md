# Curve-sampled water networks for generator v8

Status: superseded on 2026-09-04 by the
[generator v9 hex-terrain sampling decision](./hex-water-terrain-sampling-v9.md).
This record preserves the intermediate implementation that incorrectly routed
generated water through the land-tile river-channel modifier. It had already
superseded the generator v7 local-drainage decision.

## Corrected requirement

The infinite curve/polyline field is the macro sampling source for generated
water. It is not merely a visual reference and it is not replaced by a short
hex-neighbour downhill walk. The existing world generator remains responsible
for terrain and the final output remains six-sided tiles, but the large-scale
water shape comes from deterministic curves queried at arbitrary coordinates.

`InfiniteWaterCurveField` is the single source of curve geometry used by both
`public/infinite-water.html` and production `WorldWaterSampler`:

1. Three spatially addressed families generate short, medium and major paths.
   Each feature identity contains seed, family, ownership-cell X/Y and slot.
2. Stable density fields vary regional frequency without allowing
   camera-sized curve deserts. Each accepted feature independently chooses its
   origin, angle, length and accumulated turn, so there is no global diagonal,
   horizontal or vertical order.
3. Main paths deterministically choose either a Catmull-Rom curve or a control
   polyline. Addressed cubic branches terminate on exact main-path controls.
4. A bounds query enumerates only ownership cells inside maximum geometric
   reach and returns identical complete feature paths for overlapping queries.

The broad-water basin layer in the prototype remains visual-only. Generator v8
does not change continental sea classification or regional lake placement.

## Hex sampling contract

Production never renders a separate spline mesh. `WorldWaterSampler` converts
each queried path into the authoritative hex representation:

- World-space samples are rounded through axial/cube coordinates to the
  existing even-column offset grid.
- Consecutive samples are joined by a cube-coordinate hex line, so every
  retained step is one of the six canonical neighbours. The output is a
  continuous, angular, non-differentiable hex chain even when its macro parent
  is smooth.
- Existing land, sand and tundra cells under the chain become `river` cells.
  Terrain does not steer or randomize the macro path. Sea/coast opens a mouth;
  mountain and snow interrupt it; an existing generated lake wins over river.
- Every retained step writes reciprocal six-edge masks. A land-to-sea step
  writes the landward mouth edge. Branch joins and crossings therefore use
  actual sampled topology, while nearby unrelated chains are not connected by
  proximity.
- River tiles continue to suppress hill and wood, use the existing water
  shader and remain editable through sparse tile overrides.

## Infinite, bounded and toroidal identity

Infinite and bounded worlds query the same global curve field through 32x32
water pages. Each resolver retains at most 16 compact `Int8Array` masks; page
order, chunk residency and camera position cannot affect feature identity.
Large overview requests enumerate intersecting curve paths directly instead of
materializing all tiles in their footprint.

Bounded worlds clip sampled cells at their domain. Toroidal worlds own one
canonical set of features, scale spatial lengths relative to the 512-cell
reference domain, rasterize paths once and wrap their hex steps into one
periodic mask. Even world width preserves hex parity across the X seam.

The curve query and hex rasterization have finite reach and work proportional
to the requested area, not explored distance. There is no world-sized drainage
graph, global atlas, exploration state or compatibility branch.

## Versioning and verification

The semantic correction increments the generator to v8. The compact chunk
layout remains v2: bit 8 is the river flag, bits 9-14 store the six-edge mask
and bit 15 marks it explicit. Descriptor fingerprints therefore isolate old
cache and persistence identities without increasing per-tile payload.

Frozen v8 checksums are:

- infinite chunk: `c66b54d6`
- toroidal chunk: `184132e3`
- bounded world: `30bf99af`
- regional forest/lake sample including river suppression: `152bdeb0`
- request-order foundation corpus: `db01e7d9`

Verification covers curve-query overlap, seed determinism, mixed curves and
polylines, long chord and direction diversity, hex-edge reciprocity, page
boundaries, bounded LRU residency, exact toroidal repetition, fixed gallery
topology, the 2048x2048 overview, browser prototype reuse and hot-path budgets.
