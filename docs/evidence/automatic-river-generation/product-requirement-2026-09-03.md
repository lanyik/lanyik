# Infinite-world generated water requirement

Captured on 2026-09-03 from the active world-generation design review.

The generated flat world now requires a deterministic water network that can
be sampled at arbitrary positive or negative coordinates. Manual river content
cannot cover an infinite coordinate space and cannot guarantee that separately
generated chunk halos agree. The accepted visual direction is the isolated
infinite-water prototype's disordered curve field, with two production
corrections:

- broad curve families define only the large-scale route;
- the represented water course must be continuous but locally non-smooth, and
  must never be produced by independent tile-centre hit tests.

The first production increment generates river modifiers. Existing continental
sea classification and regional lake rules remain authoritative; changing
those fields is outside this approval and would require its own generator
review.
