import {
    COMPILED_SURFACE_TEXEL_COUNT,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";
import {
    surfaceStagger,
    surfaceTexelCenterAxis,
    surfaceToWorld,
    worldToSurface
} from "./SurfaceLattice";
import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow
} from "./TransferableEffectiveWindow";

export interface SurfaceWorldPoint {
    readonly x: number;
    readonly z: number;
}

export interface SurfaceContourSegment {
    readonly start: SurfaceWorldPoint;
    readonly end: SurfaceWorldPoint;
}

function interpolateCrossing(
    firstU: number,
    firstV: number,
    firstHeight: number,
    secondU: number,
    secondV: number,
    secondHeight: number,
    threshold: number,
    hexSize: number
): SurfaceWorldPoint {
    const amount = (threshold - firstHeight) / (secondHeight - firstHeight);
    return surfaceToWorld(
        firstU + (secondU - firstU) * amount,
        firstV + (secondV - firstV) * amount,
        hexSize
    );
}

function addContourSegments(
    segments: SurfaceContourSegment[],
    crossings: readonly (SurfaceWorldPoint | undefined)[],
    bottomLeftInside: boolean,
    centerInside: boolean
): void {
    const present = crossings.flatMap((point, edge) => point ? [{ point, edge }] : []);
    if (present.length === 2) {
        segments.push({ start: present[0].point, end: present[1].point });
        return;
    }
    if (present.length !== 4) return;
    const pairA = bottomLeftInside === centerInside;
    const pairs = pairA ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
    for (const [first, second] of pairs) {
        segments.push({
            start: crossings[first] as SurfaceWorldPoint,
            end: crossings[second] as SurfaceWorldPoint
        });
    }
}

export function surfaceHeightContours(
    window: Readonly<TransferableEffectiveWindow>,
    threshold: number,
    hexSize: number
): readonly SurfaceContourSegment[] {
    if (!Number.isFinite(threshold)) throw new RangeError("surface contour threshold must be finite");
    const segments: SurfaceContourSegment[] = [];
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
            const inside = heights.map(height => height < threshold);
            if (inside.every(value => value === inside[0])) continue;
            const crossings: (SurfaceWorldPoint | undefined)[] = [undefined, undefined, undefined, undefined];
            if (inside[0] !== inside[1]) {
                crossings[0] = interpolateCrossing(
                    tileX, tileY, heights[0], tileX, tileY + 1, heights[1], threshold, hexSize
                );
            }
            if (inside[1] !== inside[2]) {
                crossings[1] = interpolateCrossing(
                    tileX, tileY + 1, heights[1], tileX + 1, tileY + 1, heights[2], threshold, hexSize
                );
            }
            if (inside[2] !== inside[3]) {
                crossings[2] = interpolateCrossing(
                    tileX + 1, tileY + 1, heights[2], tileX + 1, tileY, heights[3], threshold, hexSize
                );
            }
            if (inside[3] !== inside[0]) {
                crossings[3] = interpolateCrossing(
                    tileX + 1, tileY, heights[3], tileX, tileY, heights[0], threshold, hexSize
                );
            }
            addContourSegments(
                segments,
                crossings,
                inside[0],
                (heights[0] + heights[1] + heights[2] + heights[3]) / 4 < threshold
            );
        }
    }
    return Object.freeze(segments);
}

function pointSegmentDistance(x: number, z: number, segment: Readonly<SurfaceContourSegment>): number {
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

export function surfaceContourDistances(
    window: Readonly<TransferableEffectiveWindow>,
    contours: readonly SurfaceContourSegment[],
    hexSize: number,
    saturation: number
): Float64Array {
    if (!Array.isArray(contours) || !Number.isFinite(saturation) || saturation <= 0) {
        throw new RangeError("surface contour distance input is invalid");
    }
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

export function quantizeSurfaceCoverage(signedDistance: number, antialiasRadius: number): number {
    if (!Number.isFinite(signedDistance)
        || !Number.isFinite(antialiasRadius) || antialiasRadius <= 0) {
        throw new RangeError("surface coverage distance input is invalid");
    }
    const coverage = Math.max(0, Math.min(1, 0.5 - signedDistance / (antialiasRadius * 2)));
    return Math.floor(coverage * 255 + 0.5);
}
