import {
    SURFACE_CANONICAL_HEX_SIZE,
    SURFACE_FIELD_GUTTER_TEXELS,
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_SAMPLES_PER_TILE_INTERVAL
} from "./SurfaceCompileProfile";
import type { RenderChunkKey } from "./SurfaceDependency";

export interface SurfaceCoordinate {
    readonly u: number;
    readonly v: number;
}

export interface SurfaceWorldCoordinate {
    readonly x: number;
    readonly z: number;
}

function assertFiniteCoordinate(name: string, value: number): void {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function assertHexSize(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError("surface lattice hexSize must be finite and positive");
    }
}

export function surfaceColumnStagger(column: number): 0 | 0.5 {
    if (!Number.isSafeInteger(column)) {
        throw new RangeError("surface lattice column must be a safe integer");
    }
    return column - Math.floor(column / 2) * 2 === 0 ? 0.5 : 0;
}

export function surfaceStagger(u: number): number {
    assertFiniteCoordinate("surface u", u);
    const column = Math.floor(u);
    if (!Number.isSafeInteger(column)) {
        throw new RangeError("surface lattice column exceeds the safe integer range");
    }
    const amount = u - column;
    const first = surfaceColumnStagger(column);
    if (amount === 0) return first;
    const second = surfaceColumnStagger(column + 1);
    return first + (second - first) * amount;
}

export function surfaceToWorld(
    u: number,
    v: number,
    hexSize = SURFACE_CANONICAL_HEX_SIZE
): Readonly<SurfaceWorldCoordinate> {
    assertFiniteCoordinate("surface u", u);
    assertFiniteCoordinate("surface v", v);
    assertHexSize(hexSize);
    return Object.freeze({
        x: 1.5 * hexSize * u,
        z: Math.sqrt(3) * hexSize * (v + surfaceStagger(u))
    });
}

export function worldToSurface(
    x: number,
    z: number,
    hexSize = SURFACE_CANONICAL_HEX_SIZE
): Readonly<SurfaceCoordinate> {
    assertFiniteCoordinate("surface world x", x);
    assertFiniteCoordinate("surface world z", z);
    assertHexSize(hexSize);
    const u = x / (1.5 * hexSize);
    return Object.freeze({
        u,
        v: z / (Math.sqrt(3) * hexSize) - surfaceStagger(u)
    });
}

export function surfaceLatticeTexelLocalCoordinate(
    physicalX: number,
    physicalY: number
): Readonly<SurfaceCoordinate> {
    if (!Number.isInteger(physicalX) || physicalX < 0 || physicalX >= SURFACE_FIELD_TEXTURE_SIZE
        || !Number.isInteger(physicalY) || physicalY < 0 || physicalY >= SURFACE_FIELD_TEXTURE_SIZE) {
        throw new RangeError("surface lattice physical texel lies outside the field layer");
    }
    return Object.freeze({
        u: -0.5 + (physicalX - SURFACE_FIELD_GUTTER_TEXELS + 0.5)
            / SURFACE_SAMPLES_PER_TILE_INTERVAL,
        v: -0.5 + (physicalY - SURFACE_FIELD_GUTTER_TEXELS + 0.5)
            / SURFACE_SAMPLES_PER_TILE_INTERVAL
    });
}

export function surfaceLatticeTexelWorldCoordinate(
    physicalX: number,
    physicalY: number
): Readonly<SurfaceWorldCoordinate> {
    const coordinate = surfaceLatticeTexelLocalCoordinate(physicalX, physicalY);
    return surfaceToWorld(coordinate.u, coordinate.v);
}

export function surfaceFieldTexelCoordinate(
    localU: number,
    localV: number
): Readonly<SurfaceCoordinate> {
    assertFiniteCoordinate("surface localU", localU);
    assertFiniteCoordinate("surface localV", localV);
    return Object.freeze({
        u: (localU + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL
            - 0.5 + SURFACE_FIELD_GUTTER_TEXELS,
        v: (localV + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL
            - 0.5 + SURFACE_FIELD_GUTTER_TEXELS
    });
}

export function surfaceLatticeIndex(physicalX: number, physicalY: number): number {
    if (!Number.isInteger(physicalX) || physicalX < 0 || physicalX >= SURFACE_FIELD_TEXTURE_SIZE
        || !Number.isInteger(physicalY) || physicalY < 0 || physicalY >= SURFACE_FIELD_TEXTURE_SIZE) {
        throw new RangeError("surface lattice texel lies outside the field layer");
    }
    return physicalX * SURFACE_FIELD_TEXTURE_SIZE + physicalY;
}

export function surfacePointOwnerRenderChunk(u: number, v: number): Readonly<RenderChunkKey> {
    assertFiniteCoordinate("surface u", u);
    assertFiniteCoordinate("surface v", v);
    const chunkX = Math.floor((u + 0.5) / SURFACE_RENDER_CHUNK_SIZE);
    const chunkY = Math.floor((v + 0.5) / SURFACE_RENDER_CHUNK_SIZE);
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
        throw new RangeError("surface owner render chunk exceeds the safe integer range");
    }
    return Object.freeze({ chunkX, chunkY });
}

export const SURFACE_LATTICE_TEST_VECTORS = Object.freeze([
    Object.freeze({ u: 0, v: 0, x: 0, z: Math.sqrt(3) / 2 }),
    Object.freeze({ u: 1, v: 0, x: 1.5, z: 0 }),
    Object.freeze({ u: -1, v: 0, x: -1.5, z: 0 }),
    Object.freeze({ u: -2, v: -3, x: -3, z: -2.5 * Math.sqrt(3) })
] as const);
