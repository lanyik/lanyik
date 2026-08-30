export const WORLD_SEMANTIC_CHUNK_SIZE = 32;
export const WORLD_SEMANTIC_CHUNK_TILE_COUNT = WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE;
export const WORLD_SEMANTIC_CHUNK_FORMAT_VERSION = 2;
export const WORLD_SURFACE_V2_GENERATOR_VERSION = 7;
export const HYDROLOGY_REGION_FORMAT_VERSION = 1;
export const BASE_SEMANTIC_CHUNK_REVISION = 0;
export const HYDROLOGY_REGION_SIZE = 128;
export const HYDROLOGY_REGION_REVISION = 0;
export const HYDROLOGY_COORDINATE_SCALE = 16;
export const HYDROLOGY_MACRO_CELL_SIZE = 16;
export const HYDROLOGY_INFINITE_BASIN_SIZE = 2048;
export const HYDROLOGY_MACRO_CELLS_PER_INFINITE_BASIN =
    HYDROLOGY_INFINITE_BASIN_SIZE / HYDROLOGY_MACRO_CELL_SIZE;

export interface SemanticChunkKey {
    readonly chunkX: number;
    readonly chunkY: number;
}

export interface HydrologyRegionKey {
    readonly regionX: number;
    readonly regionY: number;
}

export interface HydrologyRegionLocalBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

export interface SemanticChunkLocation {
    readonly key: SemanticChunkKey;
    readonly localX: number;
    readonly localY: number;
    readonly index: number;
}

export interface LocalTileBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

export const FULL_SEMANTIC_CHUNK_BOUNDS: Readonly<LocalTileBounds> = Object.freeze({
    minX: 0,
    minY: 0,
    maxXExclusive: WORLD_SEMANTIC_CHUNK_SIZE,
    maxYExclusive: WORLD_SEMANTIC_CHUNK_SIZE
});

export const FULL_HYDROLOGY_REGION_BOUNDS: Readonly<HydrologyRegionLocalBounds> = Object.freeze({
    minX: 0,
    minY: 0,
    maxXExclusive: HYDROLOGY_REGION_SIZE,
    maxYExclusive: HYDROLOGY_REGION_SIZE
});

function assertSafeInteger(name: string, value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

export function assertSemanticChunkKey(value: SemanticChunkKey): void {
    if (!value || typeof value !== "object") throw new TypeError("semantic chunk key must be an object");
    if (Object.getOwnPropertyNames(value).some(name => name !== "chunkX" && name !== "chunkY")) {
        throw new TypeError("semantic chunk key contains unknown fields");
    }
    assertSafeInteger("semantic chunkX", value.chunkX);
    assertSafeInteger("semantic chunkY", value.chunkY);
    const originX = value.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    const originY = value.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
    if (originX > Number.MAX_SAFE_INTEGER || originX + WORLD_SEMANTIC_CHUNK_SIZE - 1 < Number.MIN_SAFE_INTEGER
        || originY > Number.MAX_SAFE_INTEGER || originY + WORLD_SEMANTIC_CHUNK_SIZE - 1 < Number.MIN_SAFE_INTEGER) {
        throw new RangeError("semantic chunk key exceeds the safe integer tile range");
    }
}

export function assertHydrologyRegionKey(value: HydrologyRegionKey): void {
    if (!value || typeof value !== "object") throw new TypeError("hydrology region key must be an object");
    if (Object.getOwnPropertyNames(value).some(name => name !== "regionX" && name !== "regionY")) {
        throw new TypeError("hydrology region key contains unknown fields");
    }
    assertSafeInteger("hydrology regionX", value.regionX);
    assertSafeInteger("hydrology regionY", value.regionY);
    const originX = value.regionX * HYDROLOGY_REGION_SIZE;
    const originY = value.regionY * HYDROLOGY_REGION_SIZE;
    if (originX > Number.MAX_SAFE_INTEGER || originX + HYDROLOGY_REGION_SIZE - 1 < Number.MIN_SAFE_INTEGER
        || originY > Number.MAX_SAFE_INTEGER || originY + HYDROLOGY_REGION_SIZE - 1 < Number.MIN_SAFE_INTEGER) {
        throw new RangeError("hydrology region key exceeds the safe integer tile range");
    }
}

export function assertHydrologyRegionLocalBounds(value: HydrologyRegionLocalBounds): void {
    if (!value || typeof value !== "object") throw new TypeError("hydrology region bounds must be an object");
    const allowed = new Set(["minX", "minY", "maxXExclusive", "maxYExclusive"]);
    if (Object.getOwnPropertyNames(value).some(name => !allowed.has(name))) {
        throw new TypeError("hydrology region bounds contain unknown fields");
    }
    for (const [name, coordinate] of [
        ["minX", value.minX],
        ["minY", value.minY],
        ["maxXExclusive", value.maxXExclusive],
        ["maxYExclusive", value.maxYExclusive]
    ] as const) {
        if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate > HYDROLOGY_REGION_SIZE) {
            throw new RangeError(
                `hydrology region bounds ${name} must be an integer between 0 and ${HYDROLOGY_REGION_SIZE}`
            );
        }
    }
    if (value.minX >= value.maxXExclusive || value.minY >= value.maxYExclusive) {
        throw new RangeError("hydrology region bounds must contain at least one tile");
    }
}

export function assertLocalTileBounds(value: LocalTileBounds): void {
    if (!value || typeof value !== "object") throw new TypeError("local tile bounds must be an object");
    const allowed = new Set(["minX", "minY", "maxXExclusive", "maxYExclusive"]);
    if (Object.getOwnPropertyNames(value).some(name => !allowed.has(name))) {
        throw new TypeError("local tile bounds contain unknown fields");
    }
    for (const [name, coordinate] of [
        ["minX", value.minX],
        ["minY", value.minY],
        ["maxXExclusive", value.maxXExclusive],
        ["maxYExclusive", value.maxYExclusive]
    ] as const) {
        if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate > WORLD_SEMANTIC_CHUNK_SIZE) {
            throw new RangeError(`local tile bounds ${name} must be an integer between 0 and ${WORLD_SEMANTIC_CHUNK_SIZE}`);
        }
    }
    if (value.minX >= value.maxXExclusive || value.minY >= value.maxYExclusive) {
        throw new RangeError("local tile bounds must contain at least one tile");
    }
}

export function semanticChunkCoordinate(tileCoordinate: number): number {
    assertSafeInteger("semantic tile coordinate", tileCoordinate);
    return Math.floor(tileCoordinate / WORLD_SEMANTIC_CHUNK_SIZE);
}

export function hydrologyRegionCoordinate(tileCoordinate: number): number {
    assertSafeInteger("hydrology tile coordinate", tileCoordinate);
    return Math.floor(tileCoordinate / HYDROLOGY_REGION_SIZE);
}

export function semanticChunkLocalIndex(localX: number, localY: number): number {
    if (!Number.isInteger(localX) || localX < 0 || localX >= WORLD_SEMANTIC_CHUNK_SIZE
        || !Number.isInteger(localY) || localY < 0 || localY >= WORLD_SEMANTIC_CHUNK_SIZE) {
        throw new RangeError(`semantic local coordinates must be integers between 0 and ${WORLD_SEMANTIC_CHUNK_SIZE - 1}`);
    }
    // WORLD_CHUNK_FORMAT_VERSION v2 freezes X-major storage.
    return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
}

export function locateSemanticTile(tileX: number, tileY: number): SemanticChunkLocation {
    assertSafeInteger("semantic tileX", tileX);
    assertSafeInteger("semantic tileY", tileY);
    const chunkX = semanticChunkCoordinate(tileX);
    const chunkY = semanticChunkCoordinate(tileY);
    const localX = tileX - chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    const localY = tileY - chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
    return {
        key: { chunkX, chunkY },
        localX,
        localY,
        index: semanticChunkLocalIndex(localX, localY)
    };
}

export function semanticChunkOrigin(key: SemanticChunkKey): Readonly<{ x: number; y: number }> {
    assertSemanticChunkKey(key);
    return {
        x: key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE,
        y: key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE
    };
}

export function hydrologyRegionOrigin(key: HydrologyRegionKey): Readonly<{ x: number; y: number }> {
    assertHydrologyRegionKey(key);
    return {
        x: key.regionX * HYDROLOGY_REGION_SIZE,
        y: key.regionY * HYDROLOGY_REGION_SIZE
    };
}

export function localBoundsContain(bounds: LocalTileBounds, localX: number, localY: number): boolean {
    return localX >= bounds.minX && localX < bounds.maxXExclusive
        && localY >= bounds.minY && localY < bounds.maxYExclusive;
}

export function positiveIntegerModulo(value: number, modulus: number): number {
    if (!Number.isSafeInteger(value)) throw new RangeError("modulo value must be a safe integer");
    if (!Number.isSafeInteger(modulus) || modulus <= 0) {
        throw new RangeError("modulo modulus must be a positive safe integer");
    }
    return value - Math.floor(value / modulus) * modulus;
}
