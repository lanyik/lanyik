export const TERRAIN_FAST_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D map;
uniform sampler2D fogMap;
uniform vec4 textureAtlasMeta;
uniform vec2 terrainTextureWorldSize;
uniform float sandAtlasIndex;
uniform float beachWidth;
uniform float fogDarkenFactor;
uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;
uniform float landformDebugMode;
uniform vec3 lightDir;
uniform float hexSize;
uniform float riverWidth;
uniform float riverBankWidth;
uniform vec3 riverColorShallow;
uniform vec3 riverColorDeep;
uniform vec3 riverBankColor;

varying vec2 vUV;
varying float vBorder;
varying float vTerrain;
varying vec3 vNormal;
varying float vFogState;
varying vec2 vFogUV;
varying float vRiverEdges;
varying vec2 vLocal;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying vec4 vLandform;
varying vec4 vBiomeWeights;
varying vec2 vWorldXZ;

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

vec3 elevationDebugColor(float value) {
    vec3 ground = vec3(0.035, 0.055, 0.09);
    vec3 slope = vec3(0.12, 0.58, 0.34);
    vec3 crest = vec3(0.92, 0.42, 0.09);
    vec3 summit = vec3(0.98, 0.96, 0.9);
    vec3 color = mix(ground, slope, smoothstep(0.02, 0.34, value));
    color = mix(color, crest, smoothstep(0.34, 0.76, value));
    color = mix(color, summit, smoothstep(0.76, 1.12, value));
    float band = fract(max(value, 0.0) * 8.0);
    float contourDistance = min(band, 1.0 - band);
    return color * mix(0.58, 1.0, smoothstep(0.015, 0.075, contourDistance));
}

vec3 landformDebugColor() {
    if (landformDebugMode < 1.5) return elevationDebugColor(vLandform.x);
    if (landformDebugMode < 2.5) return mix(vec3(0.08, 0.03, 0.12), vec3(1.0, 0.38, 0.08), vLandform.y);
    if (landformDebugMode < 3.5) return mix(vec3(0.08, 0.09, 0.12), vec3(0.08, 0.76, 1.0), vLandform.z);
    return mix(vec3(0.12, 0.1, 0.18), vec3(0.95, 0.82, 0.34), vLandform.w);
}

// Fast mode keeps the same single texture lookup. Two broad sine waves replace
// full value noise, providing a cheap continuous UV bend and material tint.
vec3 terrainPattern() {
    vec2 p = vWorldXZ / max(hexSize * 4.0, 1.0);
    float macro = clamp(
        0.5
            + 0.25 * sin(dot(p, vec2(0.73, 1.21)))
            + 0.25 * sin(dot(p, vec2(-1.37, 0.61)) + 1.9),
        0.0,
        1.0
    );
    float warp = (macro - 0.5) * hexSize * 1.15;
    vec2 sampleWorld = vWorldXZ + vec2(warp, -warp * 0.73);
    vec2 phase = fract(sampleWorld / max(terrainTextureWorldSize, vec2(1.0)) * 0.5) * 2.0;
    return vec3(1.0 - abs(phase - 1.0), macro);
}

vec2 cellIndexToUV(float idx, vec2 regionUV) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    float inset = max(textureAtlasMeta.w, 0.5);
    float cols = atlasWidth / cellSize;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);
    vec2 cellOriginPx = vec2(x * cellSize, (rows - y - 1.0) * cellSize);
    vec2 usablePx = vec2(max(cellSize - inset * 2.0, 1.0));
    return (cellOriginPx + vec2(inset) + regionUV * usablePx)
        / vec2(atlasWidth, atlasHeight);
}

vec4 sampleTerrainCell(float idx, vec3 pattern) {
    vec4 color = texture2D(map, cellIndexToUV(idx, pattern.xy));
    float tone = mix(0.91, 1.09, smoothstep(0.08, 0.92, pattern.z));
    color.rgb *= tone;
    return color;
}

vec3 applyBiomeMaterial(vec3 color) {
    vec4 weights = max(vBiomeWeights, 0.0);
    weights /= max(dot(weights, vec4(1.0)), 0.0001);
    vec3 tint = weights.x * vec3(0.97, 1.04, 0.96)
        + weights.y * vec3(1.12, 1.01, 0.82)
        + weights.z * vec3(0.90, 0.99, 1.09)
        + weights.w * vec3(0.86, 0.90, 0.94);
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float desaturate = weights.z * 0.10 + weights.w * 0.24;
    return mix(color, vec3(luminance), desaturate) * tint;
}

float riverSegDist(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return length(p - dir * t);
}

float riverChannelDist(vec2 p, float mask, float apothem) {
    float d = length(p);
    if (mod(floor(mask /  1.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SE, apothem));
    if (mod(floor(mask /  2.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_S,  apothem));
    if (mod(floor(mask /  4.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SW, apothem));
    if (mod(floor(mask /  8.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NW, apothem));
    if (mod(floor(mask / 16.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_N,  apothem));
    if (mod(floor(mask / 32.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NE, apothem));
    return d;
}

float straightCoastField() {
    vec3 kA = floor(vNeighborsKindA + 0.5);
    vec3 kB = floor(vNeighborsKindB + 0.5);
    float coast = 0.0;
    if (kA.x >= 0.5) coast = max(coast, vEdgeFactorsA.x);
    if (kA.y >= 0.5) coast = max(coast, vEdgeFactorsA.y);
    if (kA.z >= 0.5) coast = max(coast, vEdgeFactorsA.z);
    if (kB.x >= 0.5) coast = max(coast, vEdgeFactorsB.x);
    if (kB.y >= 0.5) coast = max(coast, vEdgeFactorsB.y);
    if (kB.z >= 0.5) coast = max(coast, vEdgeFactorsB.z);
    return coast;
}

void main() {
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    vec3 materialPattern = terrainPattern();
    vec4 texColor = sampleTerrainCell(vTerrain, materialPattern);
    texColor.rgb = applyBiomeMaterial(texColor.rgb);

    float coast = straightCoastField();
    if (coast > 0.0) {
        float edge = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
        float beachT = smoothstep(edge, 1.0, coast);
        if (beachT > 0.0) {
            texColor = mix(texColor, sampleTerrainCell(sandAtlasIndex, materialPattern), beachT);
        }
    }

    if (vRiverEdges > -0.5) {
        float mask = floor(vRiverEdges + 0.5);
        float waterT = 0.0;
        float bankT = 0.0;
        float depthT = 0.0;
        if (mask >= 2048.0) {
            waterT = 1.0;
            depthT = 1.0;
        } else {
            float d = riverChannelDist(vLocal, mask, hexSize * 0.8660254) / hexSize;
            bankT = 1.0 - smoothstep(riverWidth + riverBankWidth * 0.35, riverWidth + riverBankWidth, d);
            waterT = 1.0 - smoothstep(riverWidth - 0.04, riverWidth, d);
            depthT = 1.0 - smoothstep(0.0, riverWidth, d);
        }
        texColor = mix(texColor, vec4(riverBankColor, 1.0), bankT);
        texColor = mix(texColor, vec4(mix(riverColorShallow, riverColorDeep, depthT), 1.0), waterT);
    }

    vec3 normal = normalize(vNormal);
    float lambertian = max(dot(normalize(lightDir), normal), 0.0);
    vec3 color = landformDebugMode > 0.5
        ? landformDebugColor() * (0.72 + lambertian * 0.28)
        : texColor.rgb * (0.55 + 0.55 * lambertian);
    if (vFogState < 1.5) color *= fogDarkenFactor;
    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;
