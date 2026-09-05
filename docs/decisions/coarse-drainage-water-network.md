# Coarse-drainage water network

Status: implemented; reviewed water defaults and authored upstream length on 2026-09-05 (generator v17).

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
   apart. Its vertices receive a bounded, low-frequency continuous warp before
   sampling and rasterization, so the graph keeps coarse drainage cost without
   exposing six mechanically straight world-space directions. Stable source
   regions propose four bounded candidates. A source follows the strictly
   lowest adjacent drainage potential until it reaches the macro ocean or
   stops; only sea-reaching paths of sufficient length survive.

Drainage potential is dominated by the ocean field and adjusted by elevation,
valley, moisture and a very small coordinate-stable jitter. Because the choice
at a coarse coordinate is independent of the source that reached it, courses
that meet share the same downstream path. The number of source courses crossing
a point is the flow proxy: the radius now varies continuously from 1.75 to 4
hex-neighbour spacings via `smoothstep(1, 24, flow)`. Each successful source
course extends up to `riverLength / 8` genuine incoming drainage edges upstream,
choosing the highest-potential eligible predecessor. Default length 24 retains
three steps; accepted values are 0–96 in increments of 8. This is nominal extra
upstream length, not a prescribed total arc length. Zero disables extension,
not rivers; a watershed or missing eligible predecessor stops it early.
Source count and the 72-node trace limit remain bounded; the existing
downstream route and source-search radius do not change.

The reviewed default warp frequency/amplitude are 0.08 / 3.75, source-region
spacing is 16, ocean frequency multiplier is 1.4 and ocean threshold is 0.46.
`WORLD_WATER_STYLE_RANGES` supplies both the panel and API validation; the full
bounds/default/step table is in [section 6.7 of the style design](../world-style-generation-v1.md#67-水体作者参数v17).
Tributary/main radius intervals are disjoint so every slider combination is valid.
Warp amplitude remains below half a coarse step, with a 3.90 authoring ceiling;
the old hidden 3.5 clamp is removed. Reduced lattices in small toroidal worlds
scale the warp proportionally. Base and authored profiles use one ocean-field
factory so changing the default multiplier cannot diverge direct sampling.
Accumulated rendered-centre distance to the
actual sea endpoint drives an additional smooth mouth flare over the last 24
neighbour spacings, reaching 1.6 times the local flow radius at the sea. Merely
passing near a coast does not trigger widening.

Warped coarse edges are rasterized against the renderer's even-column offset
grid. Each reach rounds the next coarse corner with a quadratic Bezier between
edge midpoints. Coarse nodes are controls, not mandatory hard vertices; real
sources and sea endpoints retain their positions. Incoming branches meet at
one outgoing midpoint with aligned tangents. Curve samples stay in continuous
rendered coordinates and use a 1/16-neighbour-spacing interpolation tolerance,
bounded to 32 segments per reach. Curves stay inside the original path's convex
hull, avoiding outward overshoot and hooks. Sea distance and width progression
use their accumulated arc length.

Each curve sweeps a disk with linearly interpolated endpoint radii; a complete
hex becomes water when its centre falls inside that envelope. Every candidate
is tested once against the union, without first rounding curve samples to hexes.
Minimizing `|P - tD|² - (r0 + t dr)²` for `t` in `[0,1]` avoids
stepped width bands and covers coincident endpoints or nested disks. Custom
sub-cell widths also retain a connected digital spine. Fractional radii never
create partially water tiles. This replaces the old
union of graph-distance hex disks, whose coordinate parity disagreed with the
render grid and whose overlapping polygonal dilation created avoidable bank
protrusions. Ambiguous outer cells are decided geometrically, never randomly.

Generated river tiles still use the existing `sea`/`coastal` tile types, so
generation and gameplay classify every tile wholly as water or land; the
existing narrow shore-material transition does not change tile ownership.
Traversal, chunk encoding and sparse overrides need no new format. Random
generated lakes are removed. Authored `lake` and `river` modifiers remain
valid and unchanged.

## Identity and bounded state

- Source identity and flow jitter are hashes of the world seed, stable region
  or canonical coordinate, slot and dedicated salt. The lattice warp uses two
  seeded continuous fields and periodic sampling in toroidal worlds. Request
  order and worker count never participate.
- Infinite and bounded domains build 128×128 bit-mask pages with a 16-page LRU
  ceiling. A page considers every source within the maximum possible upstream
  reach plus warp, a coarse-step curve margin and maximum mouth-width padding, which makes adjacent pages
  and differently sized requests agree.
- Toroidal domains enumerate canonical sources once and build one
  `width × height` bit mask. All reads normalize coordinates before indexing.
- Failed inland paths are discarded rather than converted into random ponds.
- Generator v14 corrected raster coordinate parity; v15 added upstream extension,
  continuous flow widths and tapered mouths; v16 rounds the actual centreline.
  V17 changes the water defaults and adds required `waterStyle.riverLength`.
  Descriptor v3 and Worker protocol v5 explicitly reject old identities and
  missing fields; there is no migration or per-field defaulting. Normalization,
  equality and serialization include length, partitioning chunks, overview
  resolvers, persistence and navigation through the existing fingerprint.
  Packed chunk encoding remains v1. Golden checksums change only where affected.

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

Each extent also memoizes sampled drainage nodes and their selected downstream
edge. Flow and sea distance are aggregated by canonical node, and every directed
reach is rasterized only once even when multiple source courses share it.
Additional tributary candidates therefore reuse shared confluence work
instead of repeatedly sampling the same suffix. The refinement observation on
the same development machine is about 0.24 s for the 2048×2048 to 256×256
direct overview, with 1,527 visible river pixels versus the previous 959.

## Rejected alternatives

- Final-elevation thresholding mixes relief detail into coastlines and recreates
  the reported noise.
- Independent random lake or water placement cannot produce drainage identity
  or confluence.
- Randomly accepting boundary hexes produces seed-stable noise, not a closer
  approximation of the intended bank. Centre-to-course distance is the unique
  deterministic ownership rule for a categorical tile surface.
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
