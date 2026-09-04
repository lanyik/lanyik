# Sampled-water-only generation for generator v11

Status: implemented on 2026-09-04. Supersedes generator v10 as the current
water-source contract while retaining its multi-cell paths and carved basins.

## Requirement

Generator v10 combined the new bounds-queryable water field with two older
procedural sources: elevation-threshold continental ocean and regional lake
placement. Once curves and finite-reach basins author the intended water mask,
that union creates overlapping authorities and makes water coverage harder to
reason about. Production generation now needs one source of truth.

## Decision

`WorldWaterSampler` is the only procedural authority allowed to create
`Land.sea` or `Land.coastal` tiles:

1. Base terrain classification no longer turns low elevation into sea. It
   classifies only mountain, snow, tundra, sand or ordinary land.
2. Bounded-world edge depression is removed. It existed to force a continental
   ocean ring and would otherwise leave an artificial low shelf after removing
   that ocean classification.
3. The `lakePatch` noise field, `lakePotential` surface output, lake placement
   thresholds and generated `lake` modifier path are removed. This also avoids
   one fractal-noise sample per landform query.
4. `WorldSurfaceSample` now describes only the underlying land surface, so its
   biome union contains only temperate, dry, cold and alpine labels; ocean and
   coast remain final tile/rendering classifications.
5. Final water classification is exactly the sampler mask. A sampled cell with
   any in-domain non-sampled neighbour is `coastal`; every other sampled cell
   is `sea`.
6. Overview generation no longer has a continental-ocean color branch and
   paints water only from the sampled-water coverage mask.

`terrain.seaLevel` remains a vertical relief datum: sampled water is held at
the shoreline baseline and nearby low land starts at the plain floor. It no
longer decides whether a coordinate contains water.

Static maps, sparse overrides and custom application data may still use the
existing `sea`, `coastal` and `lake` representation and rendering behavior.
Only their automatic placement by the built-in procedural generator is
removed.

## Identity and verification

This changes generated terrain and the public continuous-surface profile, so
the generator identity advances to v11. `PackedWorldChunk` remains v3, Worker
protocol remains v3 and the descriptor format remains v1; their layouts did
not change.

Frozen v11 checksums are:

- infinite chunk: `9e6bd1f5`
- toroidal chunk: `9da5ca6b`
- bounded world: `abc2dff4`
- continuous relief/biome/vegetation fields: `aca29211`
- regional forest and sampled-water result: `e18874b9`
- request-order foundation corpus: `8379c4e6`

Tests assert both directions of the source contract across a fixed window:
every sampler cell resolves to sea/coast, and every resolved sea/coast cell is
present in the sampler enumeration. They also reject generated `lake` and
`river` modifiers, freeze topology seams and checksums, and retain the existing
water connectivity, chunk-independence, cache, gallery and performance gates.
