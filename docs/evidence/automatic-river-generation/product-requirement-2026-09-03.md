# Infinite-world generated water requirement

Captured on 2026-09-03 from the active world-generation design review and
corrected after the production boundary was clarified.

The existing generated hex world now requires a deterministic water-network
sampling stage that works at arbitrary positive or negative coordinates.
Manual river content cannot cover an infinite coordinate space and cannot make
separately generated chunk halos agree by itself.

The production requirement explicitly does **not** adopt the isolated infinite
continuous-curve prototype as the world skeleton. Existing terrain fields and
the six-neighbour hex grid remain authoritative. Sources are sampled on hex
coordinates and courses advance only through adjacent hex cells using the
current generated surface fields.

Visual river banks should be continuous across tile borders without becoming
spline-smooth. That is a rendering constraint inside selected river cells, not
permission to introduce continuous curve geometry into world generation.

The first production increment generates `river` modifiers only. Existing
continental sea classification and regional lake rules remain authoritative;
changing sea size, lake placement or the base terrain algorithm is outside this
approval and requires a separate generator review.
