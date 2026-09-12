export const GROUND_PROJECTION_HEADER = `
uniform sampler2D groundProjectionMap;
uniform vec4 groundProjectionBounds;
uniform vec2 groundProjectionChunkOffset;
uniform float groundProjectionEnabled;

vec3 applyGroundProjection(vec3 color, vec2 worldXZ) {
    if (groundProjectionEnabled < 0.5) return color;
    vec2 uv = (worldXZ + groundProjectionChunkOffset - groundProjectionBounds.xy) / groundProjectionBounds.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return color;
    vec4 decal = texture(groundProjectionMap, vec2(uv.x, 1.0 - uv.y));
    // Normal stamps accumulate premultiplied colour/coverage. Additive stamps preserve coverage.
    return color * (1.0 - decal.a) + decal.rgb;
}
`;
