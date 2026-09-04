# Chunk-scale waterways and carved sea basins for generator v10

Status: superseded on 2026-09-04 by the
[generator v11 sampled-water-only decision](./sampled-water-only-v11.md).
This record preserves the v10 width and carved-basin design.

## Requirement

Production sampling made most generated waterways read as one-cell lines, and
the reviewed broad-water basins existed only in the browser inspector. The
world needs waterways that remain legible at source-chunk scale and the same
bounded basin shapes carved into authoritative generated terrain.

The visual target uses the default 24-cell source chunk as a scale reference,
but generation must not depend on the configured `chunkSize`. A seed therefore
produces the same terrain when an application changes streaming granularity.

## Waterway width contract

The three existing path families retain their ownership cells, lengths,
density, directions and branch identity. Only their radius profile changes:

| Family | Half-width in radius-one world units |
|---|---:|
| Short | `27/28` to `42/28` |
| Medium | `38/28` to `78/28` |
| Major | `76/28` to `162/28` |

Main paths and branches now clamp their sampled width to the family minimum;
the previous growth taper can no longer collapse the production ribbon below
that floor. Hex-line traversal still provides the connected skeleton, while
the existing radius-plus-hex-apothem footprint test fills neighboring cells.
Small waterways consequently read as multi-cell bands and major paths occupy a
visible fraction of a 24-cell chunk without becoming tied to chunk boundaries.

## Shared carved-basin field

The former inspector-only ocean algorithm now belongs to
`InfiniteWaterCurveField` beside the paths:

1. Spatially addressed candidate cells derive identity, center and priority
   only from the world seed and integer ownership coordinates.
2. Deterministic Poisson thinning rejects a candidate when a higher-priority
   neighbor lies inside the minimum center separation.
3. Surviving basins are rotated ellipses with three deterministic harmonic
   boundary waves. The reference profile uses a 200-unit minimum separation
   and a conservative maximum reach below 87 units, preserving a positive
   land corridor between independent basins in the open field.
4. Bounds queries publish complete basin records through overlapping windows.
   The browser inspector and production sampler consume those same records and
   the same `waterBasinValue()` boundary function.
5. Production scans only the basin bounding boxes intersecting the requested
   page/extent, expands by one hex apothem, and writes the result into the same
   bounded 32x32 water-page LRU. Toroidal worlds rasterize owned basins into
   their one canonical periodic mask; modulo wrapping may join water across a
   seam while keeping the mask exactly periodic.

The basin mask unions with curve water and continental water before final
six-neighbor coast classification. It can therefore carve a broad sea through
generated land or highland; interior cells are `sea`, boundary cells are
`coastal`, and lake/vegetation/hill output is suppressed by the existing water
terrain rule. No spline or basin mesh is added to rendering.

## Identity, storage and verification

This is a deterministic terrain-semantic change, so the generator identity
advances to v10. `PackedWorldChunk` remains v3 (`Uint8Array`), Worker protocol
remains v3, and the descriptor format remains v1. Descriptor fingerprints
already include the generator version, so old cache and save identities are
rejected without a compatibility decoder.

Frozen v10 checksums are:

- infinite chunk: `343a013f`
- toroidal chunk: `1a05c247`
- bounded world: `5394bd7b`
- continuous landform fields: `7ffc9327`
- regional forest/lake/generated-water sample: `0e8e6953`
- request-order foundation corpus: `a778f09f`

Verification covers basin seed determinism, overlapping queries, center
separation, multi-chunk component size, width-sensitive coverage, page-edge
agreement, bounded LRU residency, exact toroidal repetition, overview color,
fixed-corpus topology/quality gates, the shared browser inspector, package
boundaries and hot-path performance.
