import { WORLD_NOISE_HEADER } from "./worldNoise";
import { WORLD_LIGHTING_HEADER } from "./worldLighting";
import { GROUND_PROJECTION_HEADER } from "./groundProjection";
import { HORIZON_FOG_FRAGMENT_APPLY, HORIZON_FOG_FRAGMENT_HEADER } from "./horizonFog";

export const WATER_FRAGMENT_SHADER = `
precision highp float;
out vec4 waterColor;
${WORLD_LIGHTING_HEADER}

${HORIZON_FOG_FRAGMENT_HEADER.replace(/varying /g, "in ")}

// Curved coastline (see terrain.fragment.ts's coast block - this is its water
// side): the shore-distance field is recomputed per-pixel and bent by the SAME
// static world-space noise the land layer uses. The bend is one-sided (inland
// only), so the actual waterline always lies on the LAND tile - this shader
// never paints past it, it only keys the foam and shore lightening off the
// bent field so they softly continue the land side's line across the seam.
// (Painting hard features like sand here doesn't work: the per-tile shore
// fields of neighboring water tiles disagree near shared corners, cutting
// visible gaps/straight seams into anything they draw.)
uniform float waterCornerRounding;
uniform float coastCurvature;
uniform float beachWidth;

${GROUND_PROJECTION_HEADER}

uniform sampler2D fogMap;        // war-fog.jpg, tiled per-tile via vUV
uniform float fogDarkenFactor;   // color multiplier for Explored (fogState 1) tiles

uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;

uniform vec3 lightDir;
uniform mat3 normalMatrix;
uniform vec3 chunkCameraPosition;

uniform vec3 waterColorDeep;
uniform vec3 waterColorShallow;
uniform float sparkleIntensity;
uniform float fresnelIntensity;

// Stylized coastal foam (after Harry Alisavakis' "My take on shaders: Stylized
// water shader" - his foam comes from a scene-depth difference + scrolling
// noise texture; this engine has no depth pass, but vShoreT is exactly the
// same "how close to the shore is this fragment" signal, so the foam recipe
// (noise-distorted bands marching towards the waterline + a solid lapping
// edge) ports directly onto it).
uniform float hexSize;        // shared with the vertex stage (commonUniforms)
uniform float uTime;          // shared with the vertex stage's wave clock
uniform float foamEnabled;    // 0/1 gate, cheap enough to keep as a uniform
uniform vec3 foamColor;
uniform float foamCount;      // wave bands per shore-to-center span
uniform float foamSpeed;      // bands' travel speed towards the shore
uniform float foamWidth;      // band thickness, fraction of one band's wavelength
uniform float foamRange;      // how far out from the shore bands reach (0..1 of tile radius)
uniform float foamDistortion; // 0..1, how strongly noise bends/breaks the bands
uniform float foamOpacity;

in vec2 vUV;
in float vBorder;
in float vPriority;
in vec3 vNeighborsPriorityA;
in vec3 vNeighborsPriorityB;
in vec3 vNeighborsKindA;
in vec3 vNeighborsKindB;
in vec3 vEdgeFactorsA;
in vec3 vEdgeFactorsB;
in vec3 vNormal;
in vec3 vWorldPos;
in float vBeachT;
in float vShoreT;
in float vFogState;
in vec2 vFogUV;


// Picks the single strongest edge among the 6 whose neighbor both passes the
// one-directional priority gate and is itself water (a sea tile bordering a
// shallower coastal tile), returning (bestFactor, kind). Mirrors the land
// shader's strongestWaterEdge() (see terrain.vertex.ts).
vec2 strongestWaterEdge(vec2 best, float kind, float priority, float factor) {
    if (kind < 0.5 || priority <= vPriority) return best;
    if (factor > best.x) return vec2(factor, kind);
    return best;
}

// Cheap value noise - stands in for the article's scrolling noise texture
// (keeps the shader texture-free like the rest of this water layer).
${WORLD_NOISE_HEADER}

// Same corner treatment as water.vertex.ts's roundedCorner() - duplicated per
// pixel here so the bent waterline works with the rounded field, not the
// vertex-interpolated approximation of it.
float roundedCorner(float isLandA, float isLandB, float dA, float dB) {
    if (isLandA < 0.5 || isLandB < 0.5) return -1.0;
    float sharp = max(dA, dB);
    float rounded = length(vec2(dA, dB));
    return mix(sharp, rounded, clamp(waterCornerRounding, 0.0, 1.0));
}

// Per-pixel shore-distance field: mirrors water.vertex.ts's coastal factor
// (straight per-edge max + rounded corners), 1.0 exactly on an edge shared
// with land, 0 on tiles without land neighbors. Kinds are re-rounded first -
// Varying interpolation is not exact even for per-instance-constant values.
float shoreField() {
    vec3 kA = floor(vNeighborsKindA + 0.5);
    vec3 kB = floor(vNeighborsKindB + 0.5);
    float lSE = (kA.x > -0.5 && kA.x < 0.5) ? 1.0 : 0.0;
    float lS  = (kA.y > -0.5 && kA.y < 0.5) ? 1.0 : 0.0;
    float lSW = (kA.z > -0.5 && kA.z < 0.5) ? 1.0 : 0.0;
    float lNW = (kB.x > -0.5 && kB.x < 0.5) ? 1.0 : 0.0;
    float lN  = (kB.y > -0.5 && kB.y < 0.5) ? 1.0 : 0.0;
    float lNE = (kB.z > -0.5 && kB.z < 0.5) ? 1.0 : 0.0;

    float s = 0.0;
    s = max(s, lSE > 0.5 ? vEdgeFactorsA.x : 0.0);
    s = max(s, lS  > 0.5 ? vEdgeFactorsA.y : 0.0);
    s = max(s, lSW > 0.5 ? vEdgeFactorsA.z : 0.0);
    s = max(s, lNW > 0.5 ? vEdgeFactorsB.x : 0.0);
    s = max(s, lN  > 0.5 ? vEdgeFactorsB.y : 0.0);
    s = max(s, lNE > 0.5 ? vEdgeFactorsB.z : 0.0);
    if (s <= 0.0) return 0.0;

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    s = max(s, roundedCorner(lSE, lS,  dSE, dS));
    s = max(s, roundedCorner(lS,  lSW, dS,  dSW));
    s = max(s, roundedCorner(lSW, lNW, dSW, dNW));
    s = max(s, roundedCorner(lNW, lN,  dNW, dN));
    s = max(s, roundedCorner(lN,  lNE, dN,  dNE));
    s = max(s, roundedCorner(lNE, lSE, dNE, dSE));
    return s;
}

// Coastal foam factor (0..1) for the current fragment. Two parts, both keyed
// off shoreDist (0 exactly at the - possibly noise-bent - waterline):
//   1) travelling bands: fract(shoreDist * foamCount + t) makes foamCount
//      bands whose crests march towards the shore as t grows, faded out with
//      distance so they read as swells rolling in and dying at the beach;
//   2) lapping edge: a solid strip of foam hugging the waterline itself.
// World-space value noise perturbs both so the bands wobble and tear instead
// of tracing the hex outline as perfect straight/parallel lines.
float coastalFoam(vec2 worldXZ, float t, float shoreDist) {
    // ~3 noise cells per tile radius; the second, slowly scrolling octave
    // keeps the tear pattern itself alive instead of frozen in world space.
    float n = worldNoise(worldXZ, 3, vec2(0.0, t * 0.2));
    n = 0.5 * n + 0.5 * worldNoise(worldXZ, 4, - vec2(t * 0.15, 0.0));
    float distort = (n - 0.5) * foamDistortion;

    // 1) travelling bands
    float phase = fract(shoreDist * foamCount + t * foamSpeed + distort * 2.0);
    float halfW = clamp(foamWidth, 0.02, 1.0) * 0.5;
    float band = smoothstep(halfW, halfW * 0.35, abs(phase - 0.5));
    float fade = 1.0 - smoothstep(foamRange * 0.35, max(foamRange, 0.001), shoreDist);
    // noise also modulates each band's strength so crests come and go
    band *= fade * (0.55 + 0.45 * n);

    // 2) lapping edge, its reach wobbling with the same noise
    float edge = smoothstep(0.12, 0.0, shoreDist + distort * 0.35);

    return clamp(edge + band, 0.0, 1.0) * foamOpacity;
}

void main() {
    // Unseen: same short-circuit as the land layer (terrain.fragment.ts) -
    // replace the tile outright with the war-fog texture, skipping the wave
    // lighting/sparkle/fresnel/grid work below entirely. vFogUV is world-space
    // (see terrain.vertex.ts's comment), so the texture flows seamlessly
    // across neighboring fogged tiles instead of restarting per hex.
    if (vFogState < 0.5) {
        waterColor = vec4(texture(fogMap, vFogUV).rgb, 1.0);
${HORIZON_FOG_FRAGMENT_APPLY.replace(/gl_FragColor/g, "waterColor")}
        return;
    }

    // self color: this mesh only ever contains sea (priority 0) / coastal
    // (priority 1) tiles (see TerrainMesh's WATER_TYPES split), so vPriority
    // alone is enough to tell which one a given instance is.
    vec4 texColor = vec4(vPriority < 0.5 ? waterColorDeep : waterColorShallow, 1.0);

    // water-to-water (e.g. sea blending towards a shallower coastal tile): blend once,
    // towards the single closest higher-priority water edge.
    vec2 water = vec2(0.0);
    water = strongestWaterEdge(water, vNeighborsKindA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x);
    water = strongestWaterEdge(water, vNeighborsKindA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y);
    water = strongestWaterEdge(water, vNeighborsKindA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z);
    water = strongestWaterEdge(water, vNeighborsKindB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x);
    water = strongestWaterEdge(water, vNeighborsKindB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y);
    water = strongestWaterEdge(water, vNeighborsKindB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z);
    if (water.x > 0.0) {
        vec3 otherColor = water.y > 1.5 ? waterColorShallow : waterColorDeep;
        texColor = mix(texColor, vec4(otherColor, 1.0), clamp(water.x, 0.0, 1.0));
    }

    // Curved coastline: recompute the shore field per-pixel and bend it with
    // the SAME one-sided static world-space noise as the land layer's coast
    // block (see terrain.fragment.ts) - the waterline sits inland, and the
    // shore visuals below (lightening, foam) recede with it so they continue
    // the land side's line across the seam. The wave-damping geometry stays
    // keyed to the un-bent vertex factors, which only affects height.
    float shore = shoreField();
    float fBent = 0.0;
    if (shore > 0.0) {
        float cn = worldNoise(vWorldPos.xz, 6, vec2(0.0));
        cn = 0.6 * cn + 0.4 * worldNoise(vWorldPos.xz, 7, vec2(0.0));
        fBent = shore - cn * coastCurvature * 0.5;
    }

    // shoreline: lighten towards a foamy/sandy tint as the water nears the
    // (bent) coastline. Blending towards waterColorShallow itself would be a
    // no-op on a map with no "sea" tiles (every water tile is already
    // priority 1 = shallow, so texColor is already waterColorShallow) - blend
    // towards a brightened version instead so the effect is visible
    // regardless of whether the tile started as deep or shallow.
    float e0Beach = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float shoreT = smoothstep(e0Beach, 1.0, fBent);
    if (shoreT > 0.0) {
        vec3 shoreColor = mix(waterColorShallow, vec3(1.0), 0.5);
        texColor = mix(texColor, vec4(shoreColor, 1.0), shoreT);
    }

    vec3 normal = normalize(vNormal);
    vec3 light = normalize(normalMatrix * lightDir);
    vec3 viewDir = normalize(normalMatrix * (chunkCameraPosition - vWorldPos));

    vec3 color = worldDiffuse(texColor.rgb, normal, 1.0);

    // sun glitter: sharp specular highlight off the wave-perturbed normal
    vec3 halfDir = normalize(light + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 60.0);
    color += spec * worldSunColor * sparkleIntensity * worldDirectVisibility;

    // The same prefiltered sky as model materials; no planar reflection pass.
    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
    color = mix(color, worldSky(reflect(-viewDir, normal), .2), fresnel * 0.5 * fresnelIntensity);

    // coastal foam waves - only fragments on a land-adjacent tile have a
    // shore field > 0, so open sea skips the noise work entirely. Keyed to
    // the bent waterline's distance so the bands/lapping edge follow the
    // curve. Applied before the fog darkening below so foam on Explored
    // tiles dims with the water.
    if (foamEnabled > 0.5 && shore > 0.001) {
        color = mix(color, foamColor, coastalFoam(vWorldPos.xz, uTime, max(1.0 - fBent, 0.0)));
    }

    // Explored (previously seen, currently outside every unit's view range):
    // keep the water visible, just darker - mirrors the land layer's own
    // fogState handling in terrain.fragment.ts.
    if (vFogState < 1.5) color *= fogDarkenFactor;

    waterColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        waterColor = mix(vec4(gridColor, 1.0), waterColor, 1.0 - gridOpacity);
    }
    if (vFogState > 1.5) waterColor.rgb = applyGroundProjection(waterColor.rgb, vWorldPos.xz);
${HORIZON_FOG_FRAGMENT_APPLY.replace(/gl_FragColor/g, "waterColor")}
}
`;
