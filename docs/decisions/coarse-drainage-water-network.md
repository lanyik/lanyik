# Coarse-drainage water network

Status: implemented on 2026-09-04.

## Context

The previous procedural water mask compared the final terrain elevation with a
sea-level threshold. That elevation contains terrain detail, ridge and valley
signals whose spatial frequencies are appropriate for relief but not for an
ocean boundary. At a 2048×2048 overview scale the result reads as scattered
blue noise rather than coastlines. Two later sampled-water experiments also
showed one-hex pseudo-rivers and materially slower overview generation.

The required result is visual hydrology, not a physical water-cycle simulation:
broad connected sea regions, recognizable tributaries and confluences, stable
cross-chunk identity, and bounded generation work for infinite worlds.

## Decision

Water generation has two independent layers:

1. `LandformSampler.ocean` is an unwarped, low-frequency continuous field. It
   alone owns the procedural sea/land mask. Bounded worlds add a center lift and
   retain edge falloff; toroidal worlds sample the same field periodically.
2. `WorldWaterSampler` works on an axial hex lattice spaced eight world tiles
   apart. Stable source regions propose a bounded number of candidates. A
   source follows the strictly lowest adjacent drainage potential until it
   reaches the macro ocean or stops; only sea-reaching paths of sufficient
   length survive.

Drainage potential is dominated by the ocean field and adjusted by elevation,
valley, moisture and a very small coordinate-stable jitter. Because the choice
at a coarse coordinate is independent of the source that reached it, courses
that meet share the same downstream path. The number of source courses crossing
a point is the flow proxy: normal reaches rasterize to a three-hex diameter and
high-flow reaches to five.

Coarse edges are rasterized with hex-line interpolation. Generated river tiles
use the existing `sea`/`coastal` tile types, so water rendering, coastline
geometry, traversal rules, chunk encoding and sparse overrides need no new
format. Random generated lakes are removed. Authored `lake` and `river`
modifiers remain valid and unchanged.

## Identity and bounded state

- Source identity and flow jitter are hashes of the world seed, stable region
  or canonical coordinate, slot and dedicated salt. Request order and worker
  count never participate.
- Infinite and bounded domains build 128×128 bit-mask pages with a 16-page LRU
  ceiling. A page considers every source within the maximum possible upstream
  reach, which makes adjacent pages and differently sized requests agree.
- Toroidal domains enumerate canonical sources once and build one
  `width × height` bit mask. All reads normalize coordinates before indexing.
- Failed inland paths are discarded rather than converted into random ponds.
- The generator identity and golden checksums change; packed chunks,
  descriptors and worker protocol formats do not.

## Overview path and budget

`sampleGenerated()` deliberately returns the macro surface without tracing a
river. `visitGeneratedRiverTiles()` traces a requested extent once, rasterizes
its courses and lets the overview map river tiles directly to pixels. A
2048×2048 world therefore samples 256×256 surface pixels plus coarse drainage
work; it does not resolve 4,194,304 world tiles.

The implementation observation on the development machine is about 0.32 s in a
direct process and a 0.40 s browser-worker median for a 2048×2048 infinite
extent rendered to one 256×256 raster. This is a one-shot worker task and an
observation, not a portable wall-clock gate. Structural tests enforce
deterministic enumeration, overlap/page agreement, sea or extent drainage,
broad-ocean component bounds and toroidal periodicity.

## Rejected alternatives

- Final-elevation thresholding mixes relief detail into coastlines and recreates
  the reported noise.
- Independent random lake or water placement cannot produce drainage identity
  or confluence.
- Tracing from every overview pixel scales work with display pixels and repeats
  the same courses.
- A global watershed atlas or full hydraulic simulation would add unbounded
  state and startup work without a current gameplay requirement.
- Keeping unsuccessful courses as inland water creates arbitrary dead-end
  channels; inland basins can be designed later if gameplay needs them.

## Consequences

Large local windows can legitimately be almost all continent or almost all
ocean because the sea field is intentionally broad. Quality gates therefore
measure macro-scale component structure instead of forcing every small window
to a target water percentage. Adding persistent basins, editable watershed
propagation or physical accumulation remains a separate future decision.
