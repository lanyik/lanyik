/** Shared material frequencies, in noise cells per hex radius. */
export const WORLD_NOISE_SCALES = [0.42, 1.07, 0.1, 3, 7, 8, 1.3, 3.2, 6, 12, 0.48, 1.15, 2.2, 5] as const;

/** Integer lattice coordinates never pass through Float32. Only the local fraction does. */
export const WORLD_NOISE_HEADER = `
precision highp int;
uniform uvec2 noiseCell[${WORLD_NOISE_SCALES.length}];
uniform vec2 noiseFraction[${WORLD_NOISE_SCALES.length}];
const float noiseScale[${WORLD_NOISE_SCALES.length}] = float[${WORLD_NOISE_SCALES.length}](${WORLD_NOISE_SCALES.map(value => value.toFixed(2)).join(", ")});

float latticeHash(uvec2 cell) {
    uint value = cell.x * 0x9e3779b9u ^ cell.y * 0x85ebca6bu;
    value ^= value >> 16;
    value *= 0x7feb352du;
    value ^= value >> 15;
    value *= 0x846ca68bu;
    value ^= value >> 16;
    return float(value >> 8) / 16777216.0;
}

float worldNoise(vec2 localXZ, int octave, vec2 shift) {
    vec2 p = localXZ / hexSize * noiseScale[octave] + noiseFraction[octave] + shift;
    uvec2 cell = noiseCell[octave] + uvec2(ivec2(floor(p)));
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(latticeHash(cell), latticeHash(cell + uvec2(1u, 0u)), u.x),
        mix(latticeHash(cell + uvec2(0u, 1u)), latticeHash(cell + uvec2(1u)), u.x),
        u.y
    );
}
`;
