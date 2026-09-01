import type { PackedWorldChunk } from "./generateWorldChunk";
import { assertWorldDescriptor, serializeWorldDescriptor, type WorldDescriptor } from "./WorldDescriptor";

export interface WorldChunkCacheStats {
    available: boolean;
    hits: number;
    misses: number;
    writes: number;
    errors: number;
    entries: number;
    bytes: number;
}

export interface WorldChunkCache {
    readonly stats: Readonly<WorldChunkCacheStats>;
    get(key: string): Promise<PackedWorldChunk | undefined>;
    put(key: string, chunk: PackedWorldChunk): Promise<boolean>;
    clear(): Promise<boolean>;
    flush?(): Promise<void>;
    dispose(): void;
}

export interface WorldChunkCacheKeyOptions {
    descriptor: WorldDescriptor;
    chunkX: number;
    chunkY: number;
}

export function createWorldChunkCacheKey(options: WorldChunkCacheKeyOptions): string {
    if (!options || typeof options !== "object") throw new TypeError("world chunk cache key options are required");
    assertWorldDescriptor(options.descriptor);
    if (!Number.isSafeInteger(options.chunkX) || !Number.isSafeInteger(options.chunkY)) {
        throw new RangeError("world chunk cache coordinates must be safe integers");
    }
    return JSON.stringify([
        serializeWorldDescriptor(options.descriptor),
        options.chunkX,
        options.chunkY
    ]);
}
