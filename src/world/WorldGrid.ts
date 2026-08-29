import {
    HYDROLOGY_REGION_SIZE,
    SURFACE_COMPILE_PROFILE,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";

export interface ChunkCoordinate {
    readonly chunkX: number;
    readonly chunkY: number;
}

export interface ChunkLocation extends ChunkCoordinate {
    readonly localX: number;
    readonly localY: number;
}

export function assertLogicalCoordinate(name: string, value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

export function chunkLocation(tileX: number, tileY: number, chunkSize: number): ChunkLocation {
    assertLogicalCoordinate("logical tile x", tileX);
    assertLogicalCoordinate("logical tile y", tileY);
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError("chunk size must be a positive safe integer");
    }
    const chunkX = Math.floor(tileX / chunkSize);
    const chunkY = Math.floor(tileY / chunkSize);
    return {
        chunkX,
        chunkY,
        localX: tileX - chunkX * chunkSize,
        localY: tileY - chunkY * chunkSize
    };
}

export function semanticChunkLocation(tileX: number, tileY: number): ChunkLocation {
    return chunkLocation(tileX, tileY, WORLD_SEMANTIC_CHUNK_SIZE);
}

export function hydrologyRegionLocation(tileX: number, tileY: number): ChunkLocation {
    return chunkLocation(tileX, tileY, HYDROLOGY_REGION_SIZE);
}

export function renderChunkLocation(tileX: number, tileY: number): ChunkLocation {
    return chunkLocation(tileX, tileY, SURFACE_COMPILE_PROFILE.renderChunkSize);
}

export function chunkOrigin(chunkX: number, chunkY: number, chunkSize: number): { x: number; y: number } {
    assertLogicalCoordinate("chunk x", chunkX);
    assertLogicalCoordinate("chunk y", chunkY);
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError("chunk size must be a positive safe integer");
    }
    const x = chunkX * chunkSize;
    const y = chunkY * chunkSize;
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)
        || !Number.isSafeInteger(x + chunkSize - 1)
        || !Number.isSafeInteger(y + chunkSize - 1)) {
        throw new RangeError("chunk bounds exceed the safe logical coordinate range");
    }
    return { x, y };
}
