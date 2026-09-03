# Automatic river generation for generator v7

Status: superseded on 2026-09-03 by the corrected
[generator v8 curve-sampled water-network decision](./curve-sampled-water-network-v8.md).
This document remains as the historical record of the short local-drainage
implementation; it is not the current production contract.

## Decision

Generator v7 adds deterministic generated `river` modifiers without replacing
the existing hex world generator. Terrain, continentalness, elevation,
valleys, moisture, lakes and all gameplay coordinates remain hex-cell based.
The isolated continuous-curve prototype is not a production river skeleton.

`WorldWaterSampler` adds one sampling stage over the existing generated surface:

1. Stable spatial source cells propose a bounded number of actual hex
   coordinates. Existing terrain, elevation, moisture and valley values decide
   whether each proposed cell can become a source.
2. From a retained source, each river cell selects the lowest drainage
   potential among its six hex neighbours. The potential is a fixed weighted
   combination of the current continentalness, elevation, valley, moisture and
   lake-potential fields plus a very small coordinate-stable tie breaker.
3. A step is accepted only when potential strictly decreases. The course ends
   at standing water, an invalid terrain cell, a local minimum or the fixed
   maximum course length.

There is no continuous centreline, curve rasterization, supercover pass or
independent distance-to-curve hit test in production generation. The
"continuous but non-differentiable" requirement applies only to the represented
bank inside a retained river hex: the terrain shader uses world-space C0 value
noise so adjacent tiles agree while bank slope may change abruptly.

## Identity and topology invariants

- A source proposal is identified by generator version, seed, source-cell X/Y
  and slot. Its resulting source is one integer hex coordinate.
- The outgoing step of a cell depends only on that cell coordinate, the frozen
  style profile and existing generated surface samples. Courses that meet must
  therefore share the same downstream route and cannot split after confluence.
- Every step uses one of the six canonical hex neighbours. Strictly decreasing
  drainage potential prevents cycles, while the fixed step cap bounds work.
- Each generated river tile carries the exact six-edge connection mask from
  those steps. Adjacent cells from unrelated courses therefore remain visually
  separate instead of becoming false branches or loops. Authored rivers that
  omit the mask retain automatic neighbour connectivity.
- Recomputing an overlapping water page or source-chunk halo returns identical
  modifiers byte for byte, independently of request and residency order.
- Sea, coast, mountain and snow classification remain authoritative. Regional
  lakes win over a river modifier; river cells suppress hill and wood so
  relief or vegetation cannot cover the water surface.
- Bounded worlds clip at their edge. Even-width toroidal worlds build one
  canonical periodic mask and wrap both axes, preserving hex parity at seams.
- Sparse tile overrides remain authoritative, so generated river cells stay
  editable without persisting untouched generated cells.

## Cost and ownership

Infinite and bounded queries use 32x32 water pages. Building one page enumerates
only source cells within the maximum possible course reach and stores a compact
`Int8Array` mask, using `-1` for dry cells. A resolver retains at most 16 pages;
no world-sized graph or exploration-dependent state exists. A toroidal
resolver builds one finite canonical mask for its domain. The direct
synchronous chunk API retains only the most recent exact seed/domain resolver,
so adjacent calls reuse that mask; the Worker path retains one resolver for its
active descriptor. Neither cache changes coordinate-derived output.

The frozen style profile owns source density, suitability bands, drainage
weights, page limits and course limits. `PackedWorldChunk` stores the river bit,
six edge bits and an explicit-mask bit in its existing `Uint16`, requiring a
generator-version and chunk-format increment without growing the payload.
The existing one-cell chunk halo remains sufficient because both generation
and rendering connectivity read only six neighbours.

Verification covers deterministic checksums, direct/window equivalence,
overlapping chunk halos, six-neighbour continuity, all six directions,
toroidal seams, profile validation, bounded cache residency, the fixed visual
gallery and hot-path generation cost. Overview rasters enumerate sparse course
tiles over each requested extent and aggregate coverage per pixel; they do not
reduce a many-tile footprint to one center sample or resolve its full tile area.
