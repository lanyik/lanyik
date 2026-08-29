export const WORLD_SEMANTIC_CHUNK_SIZE = 32;
export const WORLD_SEMANTIC_CHUNK_TILE_COUNT = WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE;
export const WORLD_SEMANTIC_CHUNK_FORMAT_VERSION = 2;
export const WORLD_SURFACE_V2_GENERATOR_VERSION = 6;
export const HYDROLOGY_REGION_FORMAT_VERSION = 1;
export const BASE_SEMANTIC_CHUNK_REVISION = 0;

export interface SemanticChunkKey {
    readonly chunkX: number;
    readonly chunkY: number;
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
