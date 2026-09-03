# Infinite-world generated water requirement

Captured and corrected on 2026-09-03 during active world-generation review.

The existing generated hex world requires a deterministic water-network
sampling stage at arbitrary positive and negative coordinates. Manual river
content cannot cover an infinite coordinate space or make separately generated
chunk halos agree.

The infinite curve/polyline field created during the visual review is the
intended macro sampling source. Production must query that field and convert
its paths into water-bearing hex cells. The existing world generator remains
the terrain base and the six-neighbour hex grid remains the authoritative
output; neither condition means that terrain noise should invent a different
short drainage path.

The conversion must fill gaps between curve samples, write exact connected hex
edges and remain deterministic across pages, chunks, reloads and toroidal
seams. Terrain may decide whether a sampled point is land, sea, mountain or an
existing lake, but it must not replace the curve's macro shape.

Final water is intentionally angular and non-differentiable at hex scale even
when a parent curve is smooth. The first production correction changes river
modifiers only. Existing continental sea classification and regional lake
placement remain outside this decision; the prototype's broad ocean basins are
not imported.
