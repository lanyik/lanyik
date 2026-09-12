/** Continuous patch offsets break atlas repetition while preserving explicit mip gradients. */
export const TERRAIN_MATERIAL_SAMPLING = `
uniform float rockAtlasIndex;
in float vSurfaceSlope;

vec4 sampleTerrainCell(float idx, vec3 pattern) {
    float patchPhase = pattern.z * 8.0;
    float index = floor(patchPhase);
    vec2 offsetA = sin(vec2(3.17, 6.83) * (index + 1.0)) * 0.43;
    vec2 offsetB = sin(vec2(3.17, 6.83) * (index + 2.0)) * 0.43;
    vec4 first = textureGrad(map, vec3(pattern.xy + offsetA, idx), terrainGradientX, terrainGradientY);
    vec4 second = textureGrad(map, vec3(pattern.xy + offsetB, idx), terrainGradientX, terrainGradientY);
    // At an integer boundary the outgoing B and incoming A are identical.
    vec4 color = mix(first, second, smoothstep(0.2, 0.8, fract(patchPhase)));
    color.rgb *= mix(0.9, 1.1, smoothstep(0.08, 0.92, pattern.z));
    return color;
}

vec4 applySlopeMaterial(vec4 base, vec3 pattern) {
    // World-space slope, before normalMatrix: camera orbit cannot change rock coverage.
    float exposure = smoothstep(0.22, 0.85, vSurfaceSlope) * 0.85;
    if (exposure > 0.001 && abs(vTerrain - rockAtlasIndex) > 0.1) {
        base = mix(base, sampleTerrainCell(rockAtlasIndex, pattern), exposure);
    }
    return base;
}
`;
