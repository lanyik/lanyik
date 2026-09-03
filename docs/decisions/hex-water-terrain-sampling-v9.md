# Hex-terrain water sampling for generator v9

Status: implemented on 2026-09-04. Supersedes the generator v8 channel-modifier
integration while retaining its deterministic infinite curve/polyline source.

## Decision

Generated waterways are terrain classification, not a visual groove cut into
land. The curve field supplies a continuous sampling ribbon; the world
generator converts that ribbon into the existing six-sided terrain cells and
emits ordinary `Land.sea` or `Land.coastal` tiles. It never writes a `river`
modifier and does not carry a per-cell edge mask.

The older authored `river` modifier remains a separate static-map rendering
feature. It is not part of procedural world generation. The `riverEdges` field
added by generator v7/v8 had no independent authoring or gameplay purpose and
has been removed from `TileInfo`, sparse edits and packed chunks.

## Sampling contract

`InfiniteWaterCurveField` remains the only macro geometry source shared by the
browser inspector and `WorldWaterSampler`. Each path point already carries a
deterministic radius. Production now uses it as follows:

1. Consecutive samples form short world-space segments.
2. Axial/cube rounding plus a six-neighbour hex line retains a connected
   one-cell skeleton even when a ribbon is narrower than one cell.
3. Wider paths additionally select nearby hexes by expanding center-distance
   sampling by the radius-one hex apothem. This represents the cell footprint
   without introducing sub-cell render geometry.
4. The resulting boolean mask is independent of elevation and biome. This
   preserves the curve field's topology instead of allowing mountains or local
   noise to punch holes through a waterway.
5. The surface resolver unions curve water with continental water. A water
   cell touching any final non-water neighbour is `Land.coastal`; otherwise it
   is `Land.sea`. Lakes are evaluated afterward and exclude curve-water cells,
   so lake clusters cannot be partially overwritten into isolated remnants.

The final outline is therefore made from hex occupancy and is angular and
non-differentiable even when its macro parent is smooth. Rendering uses the
normal water mesh and coast system; the terrain shader's river-bed displacement
is not involved.

## Infinite and periodic storage

Infinite and bounded domains rasterize on demand into 32x32 `Uint8Array` pages
with a 16-page LRU. Page queries expand by the curve field's maximum radius so
wide ribbons agree at page boundaries. Toroidal worlds rasterize one canonical,
domain-scaled feature set into a periodic `Uint8Array` mask. Overview generation
enumerates the same curve-water cells over non-water base terrain and aggregates
footprint coverage so thin paths survive coarse minimap pixels without drawing
course lines across existing oceans.

Removing generated channel flags and six-edge masks leaves exactly eight bits
of generated tile state. Packed chunks therefore move to format v3 and one
`Uint8Array` value per tile, halving Worker transfer and resident base-chunk
memory relative to v2. Generator identity advances to v9; no compatibility or
fallback decoder is retained.

## Frozen verification

- infinite chunk: `1f4e1e07`
- toroidal chunk: `76903c55`
- bounded world: `87c5d4d5`
- continuous landform fields: `7ffc9327`
- regional forest/lake/water sample: `9e5ede59`
- request-order foundation corpus: `04ddbbdd`

Verification covers deterministic overlap queries, radius-sensitive ribbon
coverage, six-neighbour connectivity, page boundaries, bounded LRU residency,
exact toroidal repetition, full-water terrain output, absence of generated
river modifiers/edge masks, coarse overview retention and fixed-corpus style
metrics.
