# Natural-course follow-up

Captured on 2026-09-04 after direct user review of the generated world.

The broad seas and overall water balance were accepted. The remaining defects
were narrower in scope: small tributaries were sparse, and rivers that appeared
bent in the overview still exposed horizontal and diagonal coarse-lattice
segments in the main world. The user also reported blank minimap frames during
fast right-button panning and requested one additional prefetch ring plus a
distance-triggered demand check.

The accepted refinement keeps the ocean field unchanged. Drainage vertices use
a deterministic low-frequency warp of at most 2.5 world tiles, source regions
propose four candidates instead of three, and per-extent downstream nodes are
memoized. On the development machine, a fresh 2048×2048 to 256×256 direct
overview had a seven-run median of 0.237 seconds and 1,527 river pixels; the
previous recorded observation was 0.317 seconds and 959 river pixels. These are
observations, not portable timing thresholds.

The minimap now keeps two background page rings. While panning, demand is
rebuilt after the center moves one quarter of the active page span and once more
on release. Pointer motion inside that threshold only recomposites cached
Canvas pages.
