/** Continuous patch offsets break atlas repetition while preserving explicit mip gradients. */
export const TERRAIN_MATERIAL_SAMPLING = `
uniform float rockAtlasIndex;
uniform float grassAtlasIndex;
uniform float soilAtlasIndex;
in float vSurfaceSlope;
in vec3 vViewPosition;
uniform mat3 normalMatrix;
#ifdef TERRAIN_SURFACE_MAP
uniform highp sampler2DArray surfaceMap;

vec4 sampleTerrainSurface(float idx, vec2 uv) {
    vec4 detail = textureGrad(surfaceMap, vec3(uv, idx), terrainGradientX, terrainGradientY);
    // Mirrored wrapping reverses the tangent-space normal on alternate repeats.
    detail.xy = (detail.xy * 2.0 - 1.0) * (1.0 - 2.0 * mod(floor(uv), 2.0));
    return detail;
}

vec3 lightTerrainSurface(vec3 albedo, vec4 surface) {
    vec3 n = normalize(vNormal);
    vec3 axis = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
    vec3 t = normalize(axis - n * dot(n, axis));
    vec3 b = normalize(cross(t, n));
    vec2 xy = surface.xy * .7;
    n = normalize(t * xy.x + b * xy.y + n * sqrt(max(.01, 1.0 - dot(xy, xy))));
    vec3 l = normalize(normalMatrix * lightDir);
    vec3 v = normalize(vViewPosition);
    vec3 h = normalize(l + v);
    float nl = max(dot(n, l), 0.0), nv = max(dot(n, v), .001);
    float nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0);
    float roughness = clamp(surface.z, .32, 1.0);
    float a2 = pow(roughness, 4.0);
    float denom = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / (3.141593 * denom * denom);
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    float geometry = nl * nv / max(.001, (nl * (1.0 - k) + k) * (nv * (1.0 - k) + k));
    float fresnel = .04 + .96 * pow(1.0 - vh, 5.0);
    float specular = distribution * geometry * fresnel / max(.001, 4.0 * nl * nv);
    vec3 linear = pow(max(albedo, vec3(0.0)), vec3(2.2));
    vec3 ambient = vec3(.28, .34, .40) * mix(.45, 1.0, surface.w);
    vec3 lit = linear * ambient + (linear * .96 + vec3(specular)) * vec3(1.0, .91, .77) * nl * 1.1;
    // The custom terrain pass writes display-referred colors, as do its water,
    // fog and projection passes. Standard-material trees use renderer ACES.
    return pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2));
}
#endif

vec4 sampleTerrainLayer(float idx, vec3 pattern) {
    float patchPhase = pattern.z * 8.0;
    float index = floor(patchPhase);
    vec2 offsetA = sin(vec2(3.17, 6.83) * (index + 1.0)) * 0.43;
    vec2 offsetB = sin(vec2(3.17, 6.83) * (index + 2.0)) * 0.43;
    vec4 first = textureGrad(map, vec3(pattern.xy + offsetA, idx), terrainGradientX, terrainGradientY);
    vec4 second = textureGrad(map, vec3(pattern.xy + offsetB, idx), terrainGradientX, terrainGradientY);
    // At an integer boundary the outgoing B and incoming A are identical.
    vec4 color = mix(first, second, smoothstep(0.2, 0.8, fract(patchPhase)));
    color.rgb *= mix(0.9, 1.1, smoothstep(0.08, 0.92, pattern.z));
#ifdef TERRAIN_SURFACE_MAP
    vec4 surface = mix(sampleTerrainSurface(idx, pattern.xy + offsetA), sampleTerrainSurface(idx, pattern.xy + offsetB), smoothstep(0.2, 0.8, fract(patchPhase)));
    // Shade before material blending: color, normals, roughness and AO use
    // exactly the same slope, biome-border and patch contributions.
    color.rgb = lightTerrainSurface(color.rgb, surface);
#endif
    return color;
}

vec4 sampleTerrainCell(float idx, vec3 pattern) {
    vec4 base = sampleTerrainLayer(idx, pattern);
    if (soilAtlasIndex >= 0.0 && abs(idx - grassAtlasIndex) < 0.1) {
        float soil = smoothstep(.48, .78, pattern.z) * .72;
        if (soil > .001) base = mix(base, sampleTerrainLayer(soilAtlasIndex, pattern), soil);
    }
    return base;
}

vec4 applySlopeMaterial(vec4 base, vec3 pattern) {
    // World-space slope, before normalMatrix: camera orbit cannot change rock coverage.
    float exposure = smoothstep(0.22, 0.85, vSurfaceSlope) * 0.85;
    if (exposure > 0.001 && abs(vTerrain - rockAtlasIndex) > 0.1) {
        base = mix(base, sampleTerrainCell(rockAtlasIndex, pattern), exposure);
    }
    return base;
}

vec3 applySnowMaterial(vec3 base, float coverage) {
    // Snow accumulates on shelves; steep faces retain their rock structure.
    coverage *= 1.0 - smoothstep(0.35, 0.8, vSurfaceSlope) * 0.85;
    vec3 snow = vec3(0.93, 0.95, 0.98);
#ifdef TERRAIN_SURFACE_MAP
    snow = lightTerrainSurface(snow, vec4(0.0, 0.0, 0.92, 1.0));
#endif
    return mix(base, snow, coverage * 0.78);
}
`;
