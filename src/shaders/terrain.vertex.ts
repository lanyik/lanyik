export const TERRAIN_VERTEX_SHADER = `
// highp to match terrain.fragment.ts (see its precision comment) - vWorldXZ /
// vLocal feed the river noise there, and varyings shouldn't lose precision on
// the vertex side of the interpolation.
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)

// Beach slope towards water neighbors (see neighborsKindA/B below). waterLevel
// is where the water plane sits (see water.vertex.ts) - a coastal land tile's
// rim sinks to meet it instead of staying flat and only color-blending in 2D.
// beachWidth is the fraction of the tile's radius over which the slope happens.
uniform float waterLevel;
uniform float beachWidth;
uniform float sandAtlasIndex;

// Mountain centres and their surrounding foothill tiles form one world-space
// height field. Nothing in mountainHeightAt treats the hex centre as a summit:
// neighbouring instances therefore evaluate the same height at every shared
// vertex instead of building one cone per tile. The lighting normal is derived
// by finite differences; mountainHeight is the vertical scale in world units.
uniform float mountainAtlasIndex;
uniform float mountainHeight;

// Rivers/lakes (tiles with the "river"/"lake" modifier - see helpers/rivers.ts
// and terrain.fragment.ts). The vertex stage only carves the bed: a smooth
// sink towards -riverDepth around a river's channel centerline / across a
// lake's body. Widths are fractions of the tile radius (hexSize); the sink
// reaches slightly past the painted waterline so the fragment stage's
// noise-bent banks always lie on sloped ground.
uniform float riverWidth;
uniform float riverBankWidth;
uniform float riverDepth;
uniform float lakeShoreWidth; // grass rim inset from a lake's shored edges

// World units one repeat of the war-fog texture spans. Fog UVs are computed
// from world position (not per-tile local UVs) so one copy of the texture
// flows continuously across every fogged tile - the image tiles seamlessly on
// each side, so neighboring repeats merge with no visible hex-shaped seams.
uniform float fogTextureSize;
uniform vec2 worldOffset; // repeated-world translation used by procedural patterns
uniform vec2 chunkOrigin; // logical origin; instance offsets stay chunk-local for float precision
uniform vec2 worldCenter; // camera target on the ground plane
uniform vec2 worldPeriod; // 0 on bounded axes, map span on wrapped axes

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;       // world-space (x,z) offset of this tile instance
attribute vec3 style;        // x = atlas cell index, y = modifier bitmask (reserved for hill/etc.), z = edge-blend priority
attribute vec3 neighborsA;   // atlas cell index of SE/S/SW neighbor (-1 = none)
attribute vec3 neighborsB;   // atlas cell index of NW/N/NE neighbor (-1 = none)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
// x = river/lake encoding, y/z = sea/lake mouth masks, w = adjacent-lake
// mask. Packed to leave two attribute slots for neighbour relief samples.
attribute vec4 waterEdges;
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts
// x elevation, y ridge strength, z valley strength, w roughness. Values are
// sampled in global tile coordinates by LandformSampler, so chunk order and
// worker count cannot change the visible macro landform.
attribute vec4 landform;
// Normalized mountain relief sampled at SE/S/SW and NW/N/NE tile centres.
// Together with landform.x at this tile centre these define a continuous fan
// surface whose shared edge endpoints are identical in adjacent instances.
attribute vec3 reliefNeighborsA;
attribute vec3 reliefNeighborsB;

varying vec2 vUV;
varying float vBorder;
varying float vTerrain;
varying float vModifiers;
varying float vPriority;
varying vec3 vNeighborsA;
varying vec3 vNeighborsB;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vEdgeFactorsA; // SE, S, SW
varying vec3 vEdgeFactorsB; // NW, N, NE
varying vec3 vNormal;
varying float vBeachT; // 0 = normal land color, 1 = fully sand (see terrain.fragment.ts)
varying float vFogState;
varying vec2 vFogUV; // world-space fog texture coords, continuous across tiles
varying float vRiverEdges; // riverEdges passed through (flat per tile - every vertex of an instance carries the same value)
varying float vRiverSeaMouthEdges;
varying float vRiverLakeMouthEdges;
varying float vLakeNeighborEdges;
varying vec2 vLocal;       // tile-local (x,z), for the fragment stage's channel distance
varying vec2 vWorldXZ;     // world (x,z), for the fragment stage's world-space bank/ripple noise
varying vec3 vNeighborsKindA; // passed through for the fragment stage's per-pixel curved coastline
varying vec3 vNeighborsKindB;
varying float vElevation;  // normalized mountain elevation (0 flat .. ~1 peak), for snowcap tinting
varying vec4 vLandform;

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

//Move each logical tile to the nearest toroidal image around the camera. This
//draws the map exactly once instead of submitting 9 complete copies; crossing
//a seam only moves far/off-screen instances from one side to the other.
vec2 nearestWorldOffset(vec2 canonical) {
    vec2 wrapped = canonical;
    if (worldPeriod.x > 0.5) wrapped.x += floor((worldCenter.x - canonical.x) / worldPeriod.x + 0.5) * worldPeriod.x;
    if (worldPeriod.y > 0.5) wrapped.y += floor((worldCenter.y - canonical.y) / worldPeriod.y + 0.5) * worldPeriod.y;
    return wrapped;
}

// Same cheap value noise as the fragment stages. Mountain relief is sampled
// exclusively in world-space so its extrema are unrelated to hex centres and
// adjacent tiles agree at every shared vertex.
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float isMountain(float atlasIndex) {
    return abs(atlasIndex - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
}

float centerMountainRelief() {
    if (isMountain(style.x) < 0.5) return 0.0;
    // Static maps do not carry generator fields; retain their historical
    // neutral mountain scale. Procedural mountain tiles cannot legitimately
    // have elevation 0, so zero is an unambiguous missing-sampler sentinel.
    if (landform.x <= 0.001) return 1.0;
    float elevationT = max((landform.x - 0.68) / 0.22, 0.0);
    return min(1.35, 0.08 + pow(elevationT, 1.3) * 1.12);
}

float cornerRelief(float center, float a, float b) {
    // Mountain centres carry relief and ordinary land centres carry zero.
    // Averaging the same three centres makes every tile touching this world
    // vertex resolve the exact same height. Ordinary land therefore becomes
    // a short foothill ramp instead of forcing the range boundary into a
    // cliff, while two-tile-wide ridges no longer acquire a trench between
    // their mountain centres.
    return (center + a + b) / 3.0;
}

float fanTriangleRelief(vec2 p, vec2 a, vec2 b, float center, float ha, float hb) {
    vec2 q = p / hexSize;
    float det = a.x * b.y - a.y * b.x;
    float wa = (q.x * b.y - q.y * b.x) / det;
    float wb = (a.x * q.y - a.y * q.x) / det;
    return max(center * (1.0 - wa - wb) + ha * wa + hb * wb, 0.0);
}

// Piecewise-linear macro elevation over the six fan triangles. A corner uses
// the same three tile-centre samples from every touching hex, and a shared
// edge is the same interpolation between its two corners from either side.
// This is the actual cross-hex height contract; no tile centre is forced high.
float mountainMacroReliefAt(vec2 p) {
    float sourceCenter = centerMountainRelief();
    float cE  = cornerRelief(sourceCenter, reliefNeighborsB.z, reliefNeighborsA.x);
    float cSE = cornerRelief(sourceCenter, reliefNeighborsA.x, reliefNeighborsA.y);
    float cSW = cornerRelief(sourceCenter, reliefNeighborsA.y, reliefNeighborsA.z);
    float cW  = cornerRelief(sourceCenter, reliefNeighborsA.z, reliefNeighborsB.x);
    float cNW = cornerRelief(sourceCenter, reliefNeighborsB.x, reliefNeighborsB.y);
    float cNE = cornerRelief(sourceCenter, reliefNeighborsB.y, reliefNeighborsB.z);
    // The mesh's fan centre is derived from its six shared corner samples,
    // rather than using the tile's source sample as a seventh control point.
    // This removes the remaining tendency for every hex centre to become a
    // little convex summit; actual extrema now come from world-space detail.
    float macroCenter = (cE + cSE + cSW + cW + cNW + cNE) / 6.0;

    const vec2 C_E  = vec2(1.0, 0.0);
    const vec2 C_SE = vec2(0.5, 0.8660254);
    const vec2 C_SW = vec2(-0.5, 0.8660254);
    const vec2 C_W  = vec2(-1.0, 0.0);
    const vec2 C_NW = vec2(-0.5, -0.8660254);
    const vec2 C_NE = vec2(0.5, -0.8660254);
    float angle = atan(p.y, p.x);
    if (angle < 0.0) angle += 6.2831853;
    if (angle < 1.0471976) return fanTriangleRelief(p, C_E, C_SE, macroCenter, cE, cSE);
    if (angle < 2.0943951) return fanTriangleRelief(p, C_SE, C_SW, macroCenter, cSE, cSW);
    if (angle < 3.1415927) return fanTriangleRelief(p, C_SW, C_W, macroCenter, cSW, cW);
    if (angle < 4.1887902) return fanTriangleRelief(p, C_W, C_NW, macroCenter, cW, cNW);
    if (angle < 5.2359878) return fanTriangleRelief(p, C_NW, C_NE, macroCenter, cNW, cNE);
    return fanTriangleRelief(p, C_NE, C_E, macroCenter, cNE, cE);
}

// The generator-driven macro surface supplies the massif and summit heights.
// Four cheap world-space samples only bend/break that surface at sub-range
// scale; they never manufacture a contour line or override the macro field.
float mountainHeightAt(vec2 p, vec2 tileOffset) {
    vec2 w = tileOffset + p + worldOffset;
    vec2 terrainP = w / hexSize;
    float warp = valueNoise(terrainP * 0.075 + vec2(17.3, 41.7)) - 0.5;
    vec2 q = terrainP + vec2(warp * 4.2, warp * -2.7);
    vec2 stretched = vec2(q.x * 0.62 + q.y * 0.16, q.y * 0.24 - q.x * 0.05);
    float crestA = valueNoise(stretched * 0.38 + vec2(37.2, 11.8));
    float crestB = valueNoise(stretched * 0.57 + vec2(-19.4, 53.1));
    float crest = max(crestA, crestB * 0.92);
    float crag = valueNoise(q * 0.86 + vec2(61.3, -18.2));
    float detailScale = 0.42 + pow(crest, 1.7) * 1.05 + (crag - 0.5) * 0.2;
    return mountainMacroReliefAt(p) * max(detailScale, 0.25);
}

// Tracks the strongest "closeness to a water-adjacent edge" (see
// vEdgeFactorsA/B) together with the direction it came from, so both the
// height (sink towards waterLevel) and its slope (for lighting normals) can be
// derived from the same single dominant edge.
vec3 strongestWaterEdge(vec3 best, float kind, float factor, vec2 dir) {
    if (kind >= 1.0 && factor > best.x) return vec3(factor, dir);
    return best;
}

// Distance from a tile-local point to the segment running from the hex center
// to the midpoint of the edge in direction dir (at the apothem) - one straight
// piece of the river channel's centerline.
float riverSegDist(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return length(p - dir * t);
}

// Distance to the river channel centerline: the min over every *connected*
// edge's center-to-edge-midpoint segment (bit i of mask, order SE,S,SW,NW,N,NE
// - decoded with mod/floor, GLSL ES 1.0 has no bitwise ops). A mask of 0 (a
// river tile with no connections) falls back to distance-to-center: a pond.
// Mirrors riverChannelDistance() in helpers/rivers.ts - keep the two in sync.
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

vec2 riverMouthSeg(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return vec2(length(p - dir * t), t / apothem);
}

float riverMouthBedT(vec2 p, float mask, float apothem) {
    float bedT = 0.0;
    for (int i = 0; i < 6; i++) {
        float bit = pow(2.0, float(i));
        if (mod(floor(mask / bit), 2.0) < 0.5) continue;

        vec2 dir = DIR_SE;
        if (i == 1) dir = DIR_S;
        else if (i == 2) dir = DIR_SW;
        else if (i == 3) dir = DIR_NW;
        else if (i == 4) dir = DIR_N;
        else if (i == 5) dir = DIR_NE;

        vec2 seg = riverMouthSeg(p, dir, apothem);
        // 0.4 half-width = 0.8 full outlet width relative to one hex side.
        float mouthWidth = mix(riverWidth, 0.4, smoothstep(0.0, 1.0, seg.y));
        float d = seg.x / hexSize;
        bedT = max(bedT, 1.0 - smoothstep(mouthWidth * 0.5, mouthWidth + riverBankWidth, d));
    }
    return bedT;
}

float edgeFieldFromMask(float mask, vec3 efA, vec3 efB) {
    float f = 0.0;
    if (mod(floor(mask /  1.0), 2.0) > 0.5) f = max(f, efA.x);
    if (mod(floor(mask /  2.0), 2.0) > 0.5) f = max(f, efA.y);
    if (mod(floor(mask /  4.0), 2.0) > 0.5) f = max(f, efA.z);
    if (mod(floor(mask /  8.0), 2.0) > 0.5) f = max(f, efB.x);
    if (mod(floor(mask / 16.0), 2.0) > 0.5) f = max(f, efB.y);
    if (mod(floor(mask / 32.0), 2.0) > 0.5) f = max(f, efB.z);
    return f;
}

// Lake shore factor: how far this point sits towards the nearest *shored* edge
// (one NOT in openMask) - 1.0 exactly on such an edge, falling off towards the
// far side. 0 on a fully-open tile (lake interior: all water). Mirrors
// isInTileWater() in helpers/rivers.ts - keep the two in sync.
float lakeShore(float openMask, vec3 efA, vec3 efB) {
    float s = 0.0;
    if (mod(floor(openMask /  1.0), 2.0) < 0.5) s = max(s, efA.x);
    if (mod(floor(openMask /  2.0), 2.0) < 0.5) s = max(s, efA.y);
    if (mod(floor(openMask /  4.0), 2.0) < 0.5) s = max(s, efA.z);
    if (mod(floor(openMask /  8.0), 2.0) < 0.5) s = max(s, efB.x);
    if (mod(floor(openMask / 16.0), 2.0) < 0.5) s = max(s, efB.y);
    if (mod(floor(openMask / 32.0), 2.0) < 0.5) s = max(s, efB.z);
    return s;
}

void main() {
    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;
    vec2 tileOffset = nearestWorldOffset(offset);
    vec2 logicalTileOffset = tileOffset + chunkOrigin;
    float riverEdges = waterEdges.x;
    float riverSeaMouthEdges = waterEdges.y;
    float riverLakeMouthEdges = waterEdges.z;
    float lakeNeighborEdges = waterEdges.w;

    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;

    vec3 best = vec3(0.0); // (edgeFactor, dir.x, dir.y)
    best = strongestWaterEdge(best, neighborsKindA.x, vEdgeFactorsA.x, DIR_SE);
    best = strongestWaterEdge(best, neighborsKindA.y, vEdgeFactorsA.y, DIR_S);
    best = strongestWaterEdge(best, neighborsKindA.z, vEdgeFactorsA.z, DIR_SW);
    best = strongestWaterEdge(best, neighborsKindB.x, vEdgeFactorsB.x, DIR_NW);
    best = strongestWaterEdge(best, neighborsKindB.y, vEdgeFactorsB.y, DIR_N);
    best = strongestWaterEdge(best, neighborsKindB.z, vEdgeFactorsB.z, DIR_NE);

    // beachWidth is the *total* transition width shared with the water layer's
    // own mirrored slope (see water.vertex.ts) - each side only covers half of
    // it, so the two meet in the middle of the shared edge instead of the
    // whole transition being crammed into the land tile alone.
    float waterEdge = clamp(best.x, 0.0, 1.0);
    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float beachT = smoothstep(e0, 1.0, waterEdge);

    // Unseen (fog of war): keep the tile perfectly flat - a coastal land
    // tile's sunken beach rim would betray that water sits next door, which
    // the fog is supposed to hide.
    float fogVisible = fogState < 0.5 ? 0.0 : 1.0;

    // Land only sinks *half* the way down to waterLevel - the water layer
    // rises to meet it the other half (see water.vertex.ts's riseY), so the
    // two tiles' fall is evenly split instead of the whole drop happening on
    // the land side alone. The extra *1.2 nudges land slightly past that
    // midpoint (rather than exactly onto it) so the two meshes' edges don't
    // end up perfectly coincident and z-fight (flickery dark patches).
    float sinkY = beachT * (waterLevel * 0.5) * 1.2 * fogVisible;

    // River/lake bed: sink smoothly towards -riverDepth around a river's
    // channel centerline / across a lake's body. Undistorted distances only -
    // the fragment stage's noise-bent waterline stays within the carved area,
    // and per-vertex noise would be too coarse at this subdivision level
    // anyway. min() with the beach sink (both are <= 0) so a mouth next to
    // the sea takes the deeper of the two carves instead of stacking them.
    float riverSink = 0.0;
    if (riverEdges >= 0.0) {
        float bedT = 0.0;
        if (riverEdges >= 2048.0) {
            float openMask = floor((riverEdges - 4096.0) / 64.0);
            float channelMask = riverEdges - 4096.0 - openMask * 64.0;
            bedT = 1.0;
            if (channelMask > 0.5) {
                bedT = max(bedT, riverMouthBedT(local, channelMask, apothem));
            }
        } else {
            float dRiver = riverChannelDist(local, riverEdges, apothem) / hexSize;
            bedT = 1.0 - smoothstep(riverWidth * 0.5, riverWidth + riverBankWidth, dRiver);
            bedT = max(bedT, riverMouthBedT(local, floor(riverSeaMouthEdges + 0.5), apothem));
            bedT = max(bedT, riverMouthBedT(local, floor(riverLakeMouthEdges + 0.5), apothem));
        }
        riverSink = -riverDepth * bedT * fogVisible;
    }
    float lakeEdge = edgeFieldFromMask(floor(lakeNeighborEdges + 0.5), vEdgeFactorsA, vEdgeFactorsB);
    if (lakeEdge > 0.0) {
        float s0Lake = 1.0 - clamp(lakeShoreWidth, 0.001, 1.0);
        float lakeSinkT = smoothstep(s0Lake, 1.0, lakeEdge);
        riverSink = min(riverSink, -riverDepth * lakeSinkT * fogVisible);
    }
    sinkY = min(sinkY, riverSink);

    // Mountain elevation comes from one continuous cross-tile field. A land
    // tile adjacent to mountains participates only in the shared foothill
    // corners, keeping the range boundary continuous without lifting its
    // centre. Interior hex edges are no longer local peak/rim pairs.
    float raiseY = 0.0;
    vec2 mountainSlope = vec2(0.0);
    float elevation = 0.0;
    float reliefInfluence = max(centerMountainRelief(), max(
        max(reliefNeighborsA.x, max(reliefNeighborsA.y, reliefNeighborsA.z)),
        max(reliefNeighborsB.x, max(reliefNeighborsB.y, reliefNeighborsB.z))
    ));
    if (reliefInfluence > 0.001) {
        float gate = fogVisible;
        if (gate > 0.0) {
            float eps = hexSize * 0.08;
            float h0 = mountainHeightAt(local, logicalTileOffset);
            float hx = mountainHeightAt(local + vec2(eps, 0.0), logicalTileOffset);
            float hz = mountainHeightAt(local + vec2(0.0, eps), logicalTileOffset);
            elevation = h0 * gate;
            raiseY = elevation * mountainHeight;
            mountainSlope = vec2(hx - h0, hz - h0) / eps * mountainHeight * gate;
        }
    }

    vec3 pos = vec3(tileOffset.x + position.x, position.y + sinkY + raiseY, tileOffset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // analytic slope of sinkY w.r.t. local (x,z), via the chain rule through
    // smoothstep, for lighting - see water.vertex.ts for the same idea applied
    // to waves. Only the single dominant edge direction is considered, which is
    // exact away from corners and a reasonable approximation right at them.
    // The mountain raise's finite-difference slope just adds on top.
    float xN = clamp((waterEdge - e0) / (1.0 - e0), 0.0, 1.0);
    float dSmooth = waterEdge > 0.0 ? 6.0 * xN * (1.0 - xN) / (1.0 - e0) : 0.0;
    vec2 slope = (waterLevel * 0.5) * 1.2 * dSmooth * (best.yz / apothem) * fogVisible + mountainSlope;
    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));

    // Rim distance for the grid line - NOT radial distance from center
    // (length(local)/hexSize): that only reaches 1.0 exactly at the 6 corners
    // and dips to ~0.866 (the apothem) at an edge's midpoint, since a hexagon's
    // boundary is 6 straight chords, not a circle. That went unnoticed while
    // this geometry had 0 subdivisions (both rim vertices of every wedge sat
    // exactly at a corner, so linear interpolation between two 1.0s stayed
    // 1.0 the whole edge) - once subdivided, the new mid-edge vertices' lower
    // radial value made the grid line threshold fail there, fragmenting a
    // continuous hex outline into isolated blobs at each corner. The edge
    // factors above are already exactly 1.0 along an entire straight edge
    // (not just at its endpoints), so reusing their max is the correct metric.
    float rimFactor = max(max(max(vEdgeFactorsA.x, vEdgeFactorsA.y), max(vEdgeFactorsA.z, vEdgeFactorsB.x)), max(vEdgeFactorsB.y, vEdgeFactorsB.z));

    vUV = uv;
    vBorder = clamp(rimFactor, 0.0, 1.0);
    vTerrain = style.x;
    vModifiers = style.y;
    vPriority = style.z;
    vBeachT = beachT;
    vNeighborsA = neighborsA;
    vNeighborsB = neighborsB;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;
    vElevation = elevation;
    vLandform = landform;
    vFogState = fogState;
    vRiverEdges = riverEdges;
    vRiverSeaMouthEdges = riverSeaMouthEdges;
    vRiverLakeMouthEdges = riverLakeMouthEdges;
    vLakeNeighborEdges = lakeNeighborEdges;
    vLocal = local;
    vec2 logicalWorldXZ = pos.xz + chunkOrigin + worldOffset;
    vWorldXZ = logicalWorldXZ;
    // Axes swapped/negated (not a plain pos.xz mapping) so the image reads
    // upright from this map's camera: the camera's azimuth is locked to ~90deg
    // (see HexMap's setupControls), which puts screen-right along world -Z and
    // screen-up along world -X - mapping u to -z and v to -x orients the
    // texture to the screen and keeps it un-mirrored when viewed from above.
    // Negation is free for a seamlessly wrapping texture (just a phase shift).
    vFogUV = vec2(-logicalWorldXZ.y, -logicalWorldXZ.x) / fogTextureSize;
}
`;
