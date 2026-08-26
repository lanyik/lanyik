export const TERRAIN_FAST_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D map;
uniform sampler2D fogMap;
uniform vec4 textureAtlasMeta;
uniform float sandAtlasIndex;
uniform float beachWidth;
uniform float fogDarkenFactor;
uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;
uniform vec3 lightDir;
uniform float hexSize;
uniform float riverWidth;
uniform float riverBankWidth;
uniform vec3 riverColorShallow;
uniform vec3 riverColorDeep;
uniform vec3 riverBankColor;

varying vec2 vUV;
varying vec2 vTexCoord;
varying float vBorder;
varying vec3 vNormal;
varying float vFogState;
varying vec2 vFogUV;
varying float vRiverEdges;
varying vec2 vLocal;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

vec2 cellIndexToUV(float idx) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    float cols = atlasWidth / cellSize - 1e-6;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);
    return vec2(x / cols + vUV.x / cols, 1.0 - (y / rows + (1.0 - vUV.y) / rows));
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

    vec4 texColor = texture2D(map, vTexCoord);

    float coast = straightCoastField();
    if (coast > 0.0) {
        float edge = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
        float beachT = smoothstep(edge, 1.0, coast);
        if (beachT > 0.0) {
            texColor = mix(texColor, texture2D(map, cellIndexToUV(sandAtlasIndex)), beachT);
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
    vec3 color = texColor.rgb * (0.55 + 0.55 * lambertian);
    if (vFogState < 1.5) color *= fogDarkenFactor;
    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;
