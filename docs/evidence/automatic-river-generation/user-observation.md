# Automatic river generation trigger observation

On 2026-09-04 the user reviewed a 2048×2048 world overview and reported three
recurring defects across the recent water-generation iterations:

1. Water from the original final-height threshold appeared as pure noise with
   no recognizable drainage network.
2. Sampled river variants were one hex wide or otherwise visually unnatural.
3. The sampled overview path made minimap generation materially slower.

The user explicitly requested an algorithmic optimization rather than another
parameter-only adjustment. The accepted implementation direction is a separate
low-frequency ocean field plus bounded coarse-grid drainage, with targeted
structural and timing verification instead of a full screenshot-gallery run.
