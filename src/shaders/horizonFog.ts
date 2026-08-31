// RawShaderMaterial does not receive Three.js shader chunks. These snippets
// mirror Three's linear Fog factor so terrain, water and grass blend exactly
// like the standard materials used by forests, cities and registered layers.
export const HORIZON_FOG_VERTEX_VARYING = `
varying float vHorizonFogDepth;
`;

export const HORIZON_FOG_FRAGMENT_HEADER = `
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying float vHorizonFogDepth;

vec3 applyHorizonFog(vec3 color) {
    float fogFactor = smoothstep(fogNear, fogFar, vHorizonFogDepth);
    return mix(color, fogColor, fogFactor);
}
`;

export const HORIZON_FOG_FRAGMENT_APPLY = `
    gl_FragColor.rgb = applyHorizonFog(gl_FragColor.rgb);
`;
