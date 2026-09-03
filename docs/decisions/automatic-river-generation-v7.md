# Automatic river generation for generator v7

Status: approved on 2026-09-03; implementation pending.

## Decision

Generator v7 may add deterministic generated `river` modifiers. It will reuse
the prototype's direct curve-field idea, but not its smooth screen-space
Catmull-Rom ribbon or view-dependent sampling. The production representation is
a sparse, coordinate-addressable collection of finite curve features repeated
over the unbounded plane. A bounded candidate query makes the collection
effectively infinite without a world-sized hydrology graph.

Each feature has a coarse accumulated-turn centreline. A seeded, piecewise
linear multi-octave displacement is evaluated by arc length down to sub-hex
scale. Its finite representation is C0-continuous and has slope discontinuities
at the retained knots. A topology-preserving hex traversal converts every
successive segment into adjacent cells; independent cell-centre inclusion is
forbidden.

## Identity and topology invariants

- A main course is identified by generator version, seed, feature-cell X/Y and
  slot. Tributaries additionally include their parent feature and branch slot.
- A tributary begins at an exact retained point of its parent. Their rasterized
  cell chains therefore share at least one cell; accidental near-misses are not
  treated as confluences.
- Every retained curve segment becomes a six-neighbour cell chain. Recomputing
  an overlapping page or chunk halo must return the same modifiers byte for
  byte, independently of request order.
- On ordinary land, a chain is a river. Entering a sea, coast or lake terminates
  that visible land reach at a deterministic mouth. Leaving water starts a new
  land reach; no hidden directional-flow claim is made.
- Curve endpoints that remain on land are deterministic sources. This version
  does not claim elevation-derived drainage, erosion or globally directed flow.
- Bounded worlds clip at their edge. Even-width toroidal worlds rasterize one
  canonical periodic mask and wrap both axes, so a course crossing a seam
  continues in the corresponding neighbouring cell.
- Sparse tile overrides remain authoritative, so generated river cells stay
  editable without storing untouched generated cells.

## Cost and ownership

Infinite and bounded queries use fixed-size water pages. A page enumerates only
feature cells within the profile's maximum geometric reach and holds a compact
local bit mask. The resolver owns a small bounded page cache; no regional state
is persisted and no result depends on loaded chunks. Toroidal resolvers build a
single sparse canonical mask because their entire domain is finite.

The style profile owns density, reach, turning, roughness and sampling limits.
The generated river bit is added to `PackedWorldChunk`, requiring a chunk-format
and generator-version increment. The existing one-cell halo remains sufficient
because rendering connectivity reads only six neighbours.

Before shipping, verification must cover deterministic checksums, direct/window
equivalence, overlapping chunk halos, six-neighbour chain continuity,
toroidal seams, profile validation, bounded cache residency and hot-path
generation cost. The fixed gallery is then reviewed for density and directional
bias; visual tuning cannot weaken the topology invariants.
