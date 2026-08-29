import { positiveModulo } from "../helpers/topology";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";

export interface SurfaceCoordinate {
    readonly u: number;
    readonly v: number;
}

export interface SurfaceWorldCoordinate {
    readonly x: number;
    readonly z: number;
}

export interface SurfaceRenderChunkLocation extends SurfaceCoordinate {
    readonly chunkX: number;
    readonly chunkY: number;
    readonly localU: number;
    readonly localV: number;
}

export function surfaceColumnStagger(column: number): number {
    if (!Number.isSafeInteger(column)) {
        throw new RangeError("surface lattice column must be a safe integer");
    }
    return positiveModulo(column, 2) === 0 ? 0.5 : 0;
}

export function surfaceStagger(u: number): number {
    if (!Number.isFinite(u) || !Number.isSafeInteger(Math.floor(u))) {
        throw new RangeError("surface lattice u coordinate must have a safe integer column");
    }
    const column = Math.floor(u);
    const t = u - column;
    const current = surfaceColumnStagger(column);
    return current + (surfaceColumnStagger(column + 1) - current) * t;
}

export function surfaceToWorld(u: number, v: number, hexSize: number): SurfaceWorldCoordinate {
    if (!Number.isFinite(v)) throw new RangeError("surface lattice v coordinate must be finite");
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("surface lattice hex size must be positive and finite");
    }
    return {
        x: 1.5 * hexSize * u,
        z: Math.sqrt(3) * hexSize * (v + surfaceStagger(u))
    };
}

export function worldToSurface(x: number, z: number, hexSize: number): SurfaceCoordinate {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        throw new RangeError("surface lattice world coordinates must be finite");
    }
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("surface lattice hex size must be positive and finite");
    }
    const u = x / (1.5 * hexSize);
    if (!Number.isSafeInteger(Math.floor(u))) {
        throw new RangeError("surface lattice world x exceeds the safe logical range");
    }
    return {
        u,
        v: z / (Math.sqrt(3) * hexSize) - surfaceStagger(u)
    };
}

function surfaceRenderChunkAxis(name: string, coordinate: number): {
    readonly chunk: number;
    readonly local: number;
} {
    if (!Number.isFinite(coordinate) || !Number.isSafeInteger(Math.floor(coordinate))) {
        throw new RangeError(`${name} must have a safe finite logical column`);
    }
    const size = SURFACE_COMPILE_PROFILE.renderChunkSize;
    const shifted = coordinate + 0.5;
    if (!Number.isFinite(shifted) || !Number.isSafeInteger(Math.floor(shifted))) {
        throw new RangeError(`${name} exceeds the safe render chunk ownership range`);
    }
    const chunk = Math.floor(shifted / size);
    const origin = chunk * size;
    if (!Number.isSafeInteger(chunk) || !Number.isSafeInteger(origin)) {
        throw new RangeError(`${name} render chunk origin exceeds the safe logical range`);
    }
    const local = coordinate - origin;
    if (local < -0.5 || local >= size - 0.5) {
        throw new Error(`${name} did not resolve to the canonical half-open render core`);
    }
    return { chunk, local };
}

// Continuous queries share the renderer's half-open core ownership rule. In
// particular, u/v = chunkOrigin + 15.5 belongs to the following chunk at -0.5.
export function surfaceRenderChunkLocation(u: number, v: number): SurfaceRenderChunkLocation {
    const horizontal = surfaceRenderChunkAxis("surface u coordinate", u);
    const vertical = surfaceRenderChunkAxis("surface v coordinate", v);
    return Object.freeze({
        u,
        v,
        chunkX: horizontal.chunk,
        chunkY: vertical.chunk,
        localU: horizontal.local,
        localV: vertical.local
    });
}

// Returns one axis of the globally phased texel-center coordinate. The same
// function is used for X/U and Y/V so compiler loops cannot drift into separate
// edge conventions.
export function surfaceTexelCenterAxis(renderChunkCoordinate: number, texelIndex: number): number {
    if (!Number.isSafeInteger(renderChunkCoordinate)) {
        throw new RangeError("render chunk coordinate must be a safe integer");
    }
    const maximumTexel = SURFACE_COMPILE_PROFILE.renderChunkSize
        * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
        + SURFACE_COMPILE_PROFILE.gutterTexels - 1;
    if (!Number.isInteger(texelIndex)
        || texelIndex < -SURFACE_COMPILE_PROFILE.gutterTexels
        || texelIndex > maximumTexel) {
        throw new RangeError("surface texel index is outside the physical layer");
    }
    const chunkOrigin = renderChunkCoordinate * SURFACE_COMPILE_PROFILE.renderChunkSize;
    if (!Number.isSafeInteger(chunkOrigin)) {
        throw new RangeError("render chunk origin exceeds the safe logical range");
    }
    return chunkOrigin - 0.5
        + (texelIndex + 0.5) / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
}
