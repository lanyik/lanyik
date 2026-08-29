import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    SURFACE_WATER_KIND_OCEAN,
    createCompiledSurfaceField,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import {
    CompiledWaterBodyPalette,
    createCompiledWaterBodyPalette
} from "./CompiledWaterBodyPalette";
import { finiteFloat16Bits, float16BitsToFloat32 } from "./HalfFloat";
import { OCEAN_BODY_ID } from "./HydrologyIdentity";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";
import {
    surfaceStagger,
    surfaceTexelCenterAxis,
    surfaceToWorld,
    worldToSurface
} from "./SurfaceLattice";
import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import { compileSemanticSurfaceField } from "./compileSemanticSurfaceField";

interface WorldPoint {
    readonly x: number;
    readonly z: number;
}

interface ContourSegment {
    readonly start: WorldPoint;
    readonly end: WorldPoint;
}

export interface OceanSurfaceCompilation {
    readonly field: CompiledSurfaceField;
    readonly waterBodies: CompiledWaterBodyPalette;
}

function interpolateCrossing(
    firstU: number,
    firstV: number,
    firstHeight: number,
    secondU: number,
    secondV: number,
    secondHeight: number,
    seaLevel: number,
    hexSize: number
): WorldPoint {
    const amount = (seaLevel - firstHeight) / (secondHeight - firstHeight);
    return surfaceToWorld(
        firstU + (secondU - firstU) * amount,
        firstV + (secondV - firstV) * amount,
        hexSize
    );
}

function addContourSegments(
    segments: ContourSegment[],
    crossings: readonly (WorldPoint | undefined)[],
    bottomLeftWet: boolean,
    centerWet: boolean
): void {
    const present = crossings.flatMap((point, edge) => point ? [{ point, edge }] : []);
    if (present.length === 2) {
        segments.push({ start: present[0].point, end: present[1].point });
        return;
    }
    if (present.length !== 4) return;
    const pairA = bottomLeftWet === centerWet;
    const pairs = pairA ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
    for (const [first, second] of pairs) {
        segments.push({ start: crossings[first] as WorldPoint, end: crossings[second] as WorldPoint });
    }
}

function oceanContours(
    window: Readonly<TransferableEffectiveWindow>,
    hexSize: number
): readonly ContourSegment[] {
    const segments: ContourSegment[] = [];
    for (let localX = 0; localX < EFFECTIVE_WINDOW_TILE_SIZE - 1; localX += 1) {
        const tileX = window.originTileX + localX;
        for (let localY = 0; localY < EFFECTIVE_WINDOW_TILE_SIZE - 1; localY += 1) {
            const tileY = window.originTileY + localY;
            const bottomLeft = localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
            const topLeft = bottomLeft + 1;
            const bottomRight = bottomLeft + EFFECTIVE_WINDOW_TILE_SIZE;
            const topRight = bottomRight + 1;
            if (window.valid[bottomLeft] === 0 || window.valid[topLeft] === 0
                || window.valid[bottomRight] === 0 || window.valid[topRight] === 0) continue;
            const heights = [
                window.macroHeight[bottomLeft],
                window.macroHeight[topLeft],
                window.macroHeight[topRight],
                window.macroHeight[bottomRight]
            ];
            const wet = heights.map(height => height < window.seaLevel);
            if (wet.every(value => value === wet[0])) continue;
            const crossings: (WorldPoint | undefined)[] = [undefined, undefined, undefined, undefined];
            if (wet[0] !== wet[1]) {
                crossings[0] = interpolateCrossing(
                    tileX, tileY, heights[0], tileX, tileY + 1, heights[1], window.seaLevel, hexSize
                );
            }
            if (wet[1] !== wet[2]) {
                crossings[1] = interpolateCrossing(
                    tileX, tileY + 1, heights[1], tileX + 1, tileY + 1, heights[2], window.seaLevel, hexSize
                );
            }
            if (wet[2] !== wet[3]) {
                crossings[2] = interpolateCrossing(
                    tileX + 1, tileY + 1, heights[2], tileX + 1, tileY, heights[3], window.seaLevel, hexSize
                );
            }
            if (wet[3] !== wet[0]) {
                crossings[3] = interpolateCrossing(
                    tileX + 1, tileY, heights[3], tileX, tileY, heights[0], window.seaLevel, hexSize
                );
            }
            addContourSegments(
                segments,
                crossings,
                wet[0],
                (heights[0] + heights[1] + heights[2] + heights[3]) / 4 < window.seaLevel
            );
        }
    }
    return Object.freeze(segments);
}

function pointSegmentDistance(x: number, z: number, segment: Readonly<ContourSegment>): number {
    const deltaX = segment.end.x - segment.start.x;
    const deltaZ = segment.end.z - segment.start.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (lengthSquared <= 0) return Math.hypot(x - segment.start.x, z - segment.start.z);
    const amount = Math.max(0, Math.min(1,
        ((x - segment.start.x) * deltaX + (z - segment.start.z) * deltaZ) / lengthSquared
    ));
    return Math.hypot(
        x - (segment.start.x + deltaX * amount),
        z - (segment.start.z + deltaZ * amount)
    );
}

function surfaceAxisToTexel(axis: number, renderChunkCoordinate: number): number {
    return (axis - renderChunkCoordinate * SURFACE_COMPILE_PROFILE.renderChunkSize + 0.5)
        * SURFACE_COMPILE_PROFILE.samplesPerTileInterval - 0.5;
}

function oceanShorelineDistances(
    window: Readonly<TransferableEffectiveWindow>,
    contours: readonly ContourSegment[],
    hexSize: number,
    saturation: number
): Float64Array {
    const distances = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    distances.fill(saturation);
    if (contours.length === 0) return distances;
    const worldX = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    const worldZ = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX += 1) {
        const u = surfaceTexelCenterAxis(window.renderKey.chunkX, texelX);
        const x = 1.5 * hexSize * u;
        const stagger = surfaceStagger(u);
        for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY += 1) {
            const v = surfaceTexelCenterAxis(window.renderKey.chunkY, texelY);
            const index = surfaceFieldTexelIndex(texelX, texelY);
            worldX[index] = x;
            worldZ[index] = Math.sqrt(3) * hexSize * (v + stagger);
        }
    }
    const surfaceRadiusU = saturation / (1.5 * hexSize);
    // Z depends on v + stagger(u); the additional half tile covers the full
    // possible stagger difference while exact world distance decides inclusion.
    const surfaceRadiusV = saturation / (Math.sqrt(3) * hexSize) + 0.5;
    for (const contour of contours) {
        const start = worldToSurface(contour.start.x, contour.start.z, hexSize);
        const end = worldToSurface(contour.end.x, contour.end.z, hexSize);
        const minimumTexelX = Math.max(-SURFACE_COMPILE_PROFILE.gutterTexels, Math.floor(
            surfaceAxisToTexel(Math.min(start.u, end.u) - surfaceRadiusU, window.renderKey.chunkX)
        ));
        const maximumTexelX = Math.min(SURFACE_COMPILE_PROFILE.textureLayerSize
            - SURFACE_COMPILE_PROFILE.gutterTexels - 1, Math.ceil(
            surfaceAxisToTexel(Math.max(start.u, end.u) + surfaceRadiusU, window.renderKey.chunkX)
        ));
        const minimumTexelY = Math.max(-SURFACE_COMPILE_PROFILE.gutterTexels, Math.floor(
            surfaceAxisToTexel(Math.min(start.v, end.v) - surfaceRadiusV, window.renderKey.chunkY)
        ));
        const maximumTexelY = Math.min(SURFACE_COMPILE_PROFILE.textureLayerSize
            - SURFACE_COMPILE_PROFILE.gutterTexels - 1, Math.ceil(
            surfaceAxisToTexel(Math.max(start.v, end.v) + surfaceRadiusV, window.renderKey.chunkY)
        ));
        for (let texelX = minimumTexelX; texelX <= maximumTexelX; texelX += 1) {
            for (let texelY = minimumTexelY; texelY <= maximumTexelY; texelY += 1) {
                const index = surfaceFieldTexelIndex(texelX, texelY);
                distances[index] = Math.min(distances[index], pointSegmentDistance(
                    worldX[index], worldZ[index], contour
                ));
            }
        }
    }
    return distances;
}

function quantizeCoverage(signedDistance: number, antialiasRadius: number): number {
    const coverage = Math.max(0, Math.min(1, 0.5 - signedDistance / (antialiasRadius * 2)));
    return Math.floor(coverage * 255 + 0.5);
}

export function compileOceanSurfaceField(
    window: Readonly<TransferableEffectiveWindow>
): OceanSurfaceCompilation {
    assertTransferableEffectiveWindow(window);
    const semantic = compileSemanticSurfaceField(window);
    const groundHeight = semantic.groundHeight.slice();
    const materialWeights = semantic.materialWeights.slice();
    const waterLevel = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterDepth = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const flow = new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2);
    const waterCoverage = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterKind = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterProfile = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const hexSize = window.dependencyKey.metrics.hexSize;
    const heightScale = window.dependencyKey.metrics.heightScale;
    const seaWorldLevel = window.seaLevel / 0xffff * heightScale;
    const seaLevelBits = finiteFloat16Bits("compiled ocean level", seaWorldLevel);
    const quantizedSeaWorldLevel = float16BitsToFloat32(seaLevelBits);
    const saturation = SURFACE_COMPILE_PROFILE.influenceRadiusTiles * Math.sqrt(3) * hexSize;
    const antialiasRadius = 0.5 * Math.min(1.5 * hexSize, Math.sqrt(3) * hexSize)
        / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const contours = oceanContours(window, hexSize);
    const contourDistances = oceanShorelineDistances(window, contours, hexSize, saturation);
    let hasOceanCoverage = false;
    for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX += 1) {
        for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY += 1) {
            const index = surfaceFieldTexelIndex(texelX, texelY);
            const ground = float16BitsToFloat32(groundHeight[index]);
            const wet = ground < quantizedSeaWorldLevel;
            const distance = contourDistances[index];
            const signedDistance = wet ? -distance : distance;
            shorelineDistance[index] = finiteFloat16Bits(
                "compiled ocean shoreline distance",
                Math.max(-saturation, Math.min(saturation, signedDistance))
            );
            const rawCoverage = quantizeCoverage(signedDistance, antialiasRadius);
            const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
            if (coverage === 0) continue;
            hasOceanCoverage = true;
            waterCoverage[index] = coverage;
            waterKind[index] = SURFACE_WATER_KIND_OCEAN;
            waterBodyIndex[index] = 1;
            waterLevel[index] = seaLevelBits;
            waterDepth[index] = finiteFloat16Bits(
                "compiled ocean depth",
                Math.max(0, quantizedSeaWorldLevel - ground)
            );
        }
    }
    const field = createCompiledSurfaceField({
        groundHeight,
        materialWeights,
        waterLevel,
        waterDepth,
        shorelineDistance,
        flow,
        waterCoverage,
        waterKind,
        waterProfile,
        waterBodyIndex
    });
    return Object.freeze({
        field,
        waterBodies: createCompiledWaterBodyPalette(hasOceanCoverage
            ? [{ bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 }] : [])
    });
}
