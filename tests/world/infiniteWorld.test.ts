import { describe, expect, test, vi } from "vitest";

import {
    decodeWorldChunkTile,
    generateWorld,
    generateWorldChunk,
    getMapTile,
    Land,
    MapInfo,
    PackedWorldChunk,
    ProceduralWorldSource,
    SparseWorldChunkStore,
    StaticWorldSource,
    ToroidalWorldSource,
    WorldChunk,
    WorldChunkGenerationOptions,
    WorldGeneratorPool,
    WorldChunkCache,
    WorldChunkCacheStats,
    createWorldChunkCacheKey,
    WorldStreamer
} from "../../src/index";
import { ChunkGeneratorClient, ChunkRequestOptions } from "../../src/world/WorldGeneratorPool";

interface DeferredRequest {
    options: WorldChunkGenerationOptions;
    resolve(chunk: PackedWorldChunk): void;
    reject(error: Error): void;
}

class DeferredChunkClient implements ChunkGeneratorClient {
    readonly requests: DeferredRequest[] = [];
    disposed = false;

    generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk> {
        return new Promise((resolve, reject) => this.requests.push({ options, resolve, reject }));
    }

    dispose(): void {
        this.disposed = true;
    }
}

class MemoryChunkCache implements WorldChunkCache {
    readonly chunks = new Map<string, PackedWorldChunk>();
    readonly stats: WorldChunkCacheStats = {
        available: true,
        hits: 0,
        misses: 0,
        writes: 0,
        errors: 0,
        entries: 0,
        bytes: 0
    };
    disposed = false;

    async get(key: string): Promise<PackedWorldChunk | undefined> {
        const chunk = this.chunks.get(key);
        if (!chunk) {
            this.stats.misses += 1;
            return undefined;
        }
        this.stats.hits += 1;
        return { ...chunk, tiles: chunk.tiles.slice() };
    }

    async put(key: string, chunk: PackedWorldChunk): Promise<boolean> {
        this.chunks.set(key, { ...chunk, tiles: chunk.tiles.slice() });
        this.stats.writes += 1;
        this.stats.entries = this.chunks.size;
        this.stats.bytes = [...this.chunks.values()].reduce((total, value) => total + value.tiles.byteLength, 0);
        return true;
    }

    async clear(): Promise<boolean> {
        this.chunks.clear();
        this.stats.entries = 0;
        this.stats.bytes = 0;
        return true;
    }

    dispose(): void {
        this.disposed = true;
    }
}

const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
};

describe("deterministic infinite world chunks", () => {
    test("uses a compact deterministic payload and supports negative chunks", () => {
        const first = generateWorldChunk({ seed: "endless", chunkX: -3, chunkY: 7, chunkSize: 12 });
        const second = generateWorldChunk({ seed: "endless", chunkX: -3, chunkY: 7, chunkSize: 12 });
        expect(second.tiles).toEqual(first.tiles);
        expect(first.tiles.byteLength).toBe((12 + 2) ** 2 * 2);
        expect(() => decodeWorldChunkTile(first, -1, -1)).not.toThrow();
        expect(() => decodeWorldChunkTile(first, 12, 12)).not.toThrow();
    });

    test("adjacent chunks agree exactly across their halo", () => {
        const left = generateWorldChunk({ seed: 91, chunkX: 0, chunkY: 0, chunkSize: 12 });
        const right = generateWorldChunk({ seed: 91, chunkX: 1, chunkY: 0, chunkSize: 12 });
        for (let y = -1; y <= 12; y += 1) {
            expect(decodeWorldChunkTile(left, 12, y)).toEqual(decodeWorldChunkTile(right, 0, y));
            expect(decodeWorldChunkTile(left, 11, y)).toEqual(decodeWorldChunkTile(right, -1, y));
        }
    });

    test("serves overlapping halos from packed chunks without materializing tile objects", () => {
        const store = new SparseWorldChunkStore();
        const left = generateWorldChunk({ seed: 4, chunkX: 0, chunkY: 0, chunkSize: 12 });
        const right = generateWorldChunk({ seed: 4, chunkX: 1, chunkY: 0, chunkSize: 12 });
        store.add(left);
        store.add(right);
        expect(store.hasCoreTile(12, 0)).toBe(true);
        expect(getMapTile(store.map, 12, 0)).toEqual(decodeWorldChunkTile(right, 0, 0));
        expect(getMapTile(store.map, 11, 0)).toEqual(decodeWorldChunkTile(left, 11, 0));
        expect(Object.keys(store.map.data)).toHaveLength(0);
        expect(store.residentPayloadBytes).toBe(left.tiles.byteLength + right.tiles.byteLength);
        expect(store.decodedTileVariantCount).toBeLessThan(20);
        store.remove(0, 0);
        expect(getMapTile(store.map, 12, 0)).toBeDefined();
        expect(getMapTile(store.map, 11, 0)).toBeDefined(); // right chunk halo
        store.remove(1, 0);
        expect(store.residentChunkCount).toBe(0);
        expect(getMapTile(store.map, 12, 0)).toBeUndefined();
        expect(Object.keys(store.map.data)).toHaveLength(0);
    });

    test("finite toroidal chunks exactly match eager generation", () => {
        const width = 20;
        const height = 17;
        const chunkSize = 12;
        const seed = "streamed-round-world";
        const eager = generateWorld({ seed, width, height, topology: "toroidal" });
        for (let chunkX = 0; chunkX < Math.ceil(width / chunkSize); chunkX += 1) {
            for (let chunkY = 0; chunkY < Math.ceil(height / chunkSize); chunkY += 1) {
                const chunk = generateWorldChunk({
                    seed,
                    chunkX,
                    chunkY,
                    chunkSize,
                    world: { width, height, topology: "toroidal" }
                });
                const maxX = Math.min(chunkSize, width - chunkX * chunkSize);
                const maxY = Math.min(chunkSize, height - chunkY * chunkSize);
                for (let localX = 0; localX < maxX; localX += 1) {
                    for (let localY = 0; localY < maxY; localY += 1) {
                        expect(decodeWorldChunkTile(chunk, localX, localY)).toEqual(
                            eager.data[chunkX * chunkSize + localX][chunkY * chunkSize + localY]
                        );
                    }
                }
            }
        }
    });

    test("bounded sparse stores resolve seam halos without materializing the map", () => {
        const options = { width: 20, height: 17, wrapX: true, wrapY: true };
        const store = new SparseWorldChunkStore(options);
        const chunk = generateWorldChunk({
            seed: "seam",
            chunkX: 0,
            chunkY: 0,
            chunkSize: 12,
            world: { width: options.width, height: options.height, topology: "toroidal" }
        });
        expect(store.add(chunk)).toHaveLength(144);
        expect(getMapTile(store.map, -1, 0)).toEqual(decodeWorldChunkTile(chunk, -1, 0));
        expect(getMapTile(store.map, 0, -1)).toEqual(decodeWorldChunkTile(chunk, 0, -1));
        expect(Object.keys(store.map.data)).toHaveLength(0);
    });

    test("stores mutable per-coordinate overrides without expanding shared base variants", () => {
        const store = new SparseWorldChunkStore();
        const chunk = generateWorldChunk({ seed: 4, chunkX: 0, chunkY: 0, chunkSize: 12 });
        store.add(chunk);
        const base = getMapTile(store.map, 0, 0)!;
        const variants = store.decodedTileVariantCount;

        store.setTileOverride(0, 0, { unit: "scout", city: { name: "Outpost" } });
        const overridden = getMapTile(store.map, 0, 0)!;
        expect(overridden).not.toBe(base);
        expect(Object.isFrozen(base)).toBe(true);
        expect(Object.isFrozen(overridden)).toBe(false);
        expect(overridden.unit).toBe("scout");
        expect(overridden.city?.name).toBe("Outpost");
        expect(store.tileOverrideCount).toBe(1);
        expect(store.decodedTileVariantCount).toBe(variants);
        expect(getMapTile(store.map, 0, 1)?.unit).toBeUndefined();

        store.remove(0, 0);
        store.add(chunk);
        expect(getMapTile(store.map, 0, 0)?.unit).toBe("scout");

        expect(store.clearTileOverride(0, 0)).toBe(true);
        expect(getMapTile(store.map, 0, 0)?.unit).toBeUndefined();
        expect(store.tileOverrideCount).toBe(0);
    });

    test("rejects malformed transferred payloads before installing sparse data", () => {
        const store = new SparseWorldChunkStore();
        const chunk = generateWorldChunk({ seed: 1, chunkX: 0, chunkY: 0, chunkSize: 12 });
        expect(() => store.add({ ...chunk, tiles: new Uint16Array(1) })).toThrow(/payload is invalid/);
        expect(store.residentChunkCount).toBe(0);
    });
});

describe("world generator pool", () => {
    test("keeps one task per worker and prioritizes camera-near queued chunks", async () => {
        const clients: DeferredChunkClient[] = [];
        const pool = new WorldGeneratorPool("unused", {
            size: 2,
            clientFactory: () => {
                const client = new DeferredChunkClient();
                clients.push(client);
                return client;
            }
        });
        const runningA = pool.generateChunk({ seed: 1, chunkX: 0, chunkY: 0 }, { priority: 0 });
        const runningB = pool.generateChunk({ seed: 1, chunkX: 1, chunkY: 0 }, { priority: 0 });
        const far = pool.generateChunk({ seed: 1, chunkX: 9, chunkY: 0 }, { priority: 9 });
        const near = pool.generateChunk({ seed: 1, chunkX: 2, chunkY: 0 }, { priority: 2 });

        expect(clients[0].requests).toHaveLength(1);
        expect(clients[1].requests).toHaveLength(1);
        clients[0].requests[0].resolve(generateWorldChunk(clients[0].requests[0].options));
        await flush();
        expect(clients[0].requests[1].options.chunkX).toBe(2);
        clients[0].requests[1].resolve(generateWorldChunk(clients[0].requests[1].options));
        clients[1].requests[0].resolve(generateWorldChunk(clients[1].requests[0].options));
        await flush();
        const farRequest = clients.flatMap(client => client.requests).find(request => request.options.chunkX === 9)!;
        farRequest.resolve(generateWorldChunk(farRequest.options));
        await Promise.all([runningA, runningB, near, far]);
        expect(pool.stats.completed).toBe(4);
        pool.dispose();
        expect(clients.every(client => client.disposed)).toBe(true);
    });

    test("removes an aborted queued request", async () => {
        const client = new DeferredChunkClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const running = pool.generateChunk({ seed: 1, chunkX: 0, chunkY: 0 });
        const controller = new AbortController();
        const queued = pool.generateChunk({ seed: 1, chunkX: 1, chunkY: 0 }, { signal: controller.signal });
        controller.abort();
        await expect(queued).rejects.toMatchObject({ name: "AbortError" });
        client.requests[0].resolve(generateWorldChunk(client.requests[0].options));
        await running;
        expect(client.requests).toHaveLength(1);
        pool.dispose();
    });
});

describe("procedural world source", () => {
    test("versions cache keys by generator, topology, dimensions and coordinates", () => {
        const base = {
            seed: "cache-key",
            chunkX: 0,
            chunkY: 0,
            chunkSize: 12,
            generatorVersion: 1
        };
        const infinite = createWorldChunkCacheKey(base);
        expect(createWorldChunkCacheKey({ ...base })).toBe(infinite);
        expect(createWorldChunkCacheKey({ ...base, generatorVersion: 2 })).not.toBe(infinite);
        expect(createWorldChunkCacheKey({
            ...base,
            world: { width: 24, height: 24, topology: "toroidal" }
        })).not.toBe(infinite);
        expect(createWorldChunkCacheKey({ ...base, chunkX: -1 })).not.toBe(infinite);
    });

    test("reuses cached chunks and exposes an explicit clear operation", async () => {
        const client = new DeferredChunkClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const cache = new MemoryChunkCache();
        const source = new ProceduralWorldSource(
            { seed: "cached", workerUrl: "unused", chunkSize: 12 },
            { pool, cache }
        );

        const first = source.loadChunk(0, 0);
        await flush();
        client.requests[0].resolve(generateWorldChunk(client.requests[0].options));
        const loaded = await first;
        await flush();
        expect(cache.stats.writes).toBe(1);
        source.releaseChunk(loaded);

        const cached = await source.loadChunk(0, 0);
        expect(cached.coreTiles).toHaveLength(144);
        expect(client.requests).toHaveLength(1);
        expect(source.stats.cacheHits).toBe(1);
        expect(source.stats.cachedChunks).toBe(1);
        expect(await source.clearCache()).toBe(true);
        expect(cache.chunks.size).toBe(0);
        source.dispose();
        expect(cache.disposed).toBe(false); // caller-owned cache remains reusable
        cache.dispose();
    });

    test("does not repopulate cleared storage from an older in-flight generation", async () => {
        const client = new DeferredChunkClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const cache = new MemoryChunkCache();
        const source = new ProceduralWorldSource(
            { seed: "clear-race", workerUrl: "unused", chunkSize: 12 },
            { pool, cache }
        );

        const pending = source.loadChunk(0, 0);
        await flush();
        expect(client.requests).toHaveLength(1);
        expect(await source.clearCache()).toBe(true);
        client.requests[0].resolve(generateWorldChunk(client.requests[0].options));
        await pending;
        await flush();

        expect(cache.stats.writes).toBe(0);
        expect(cache.chunks.size).toBe(0);
        source.dispose();
    });

    test("uses the unified streamer to load and evict sparse chunks", async () => {
        const client = new DeferredChunkClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const source = new ProceduralWorldSource(
            { seed: 7, workerUrl: "unused", chunkSize: 12 },
            { pool }
        );
        const loaded = vi.fn();
        const unloading = vi.fn();
        const streamer = new WorldStreamer(source, {
            chunkLoaded: loaded,
            chunkUnloading: unloading
        }, { loadRadius: 0, retentionRadius: 0, maxResidentChunks: 1 });

        const first = streamer.setCenterTile(0, 0);
        client.requests[0].resolve(generateWorldChunk(client.requests[0].options));
        await first;
        expect(streamer.stats.residentChunks).toBe(1);
        expect(streamer.hasResident(0, 0)).toBe(true);
        expect(loaded).toHaveBeenCalledOnce();

        const second = streamer.setCenterTile(24, 0);
        expect(unloading).toHaveBeenCalledOnce();
        await flush();
        client.requests[1].resolve(generateWorldChunk(client.requests[1].options));
        await second;
        expect(streamer.stats.residentChunks).toBe(1);
        expect(source.store.hasCoreTile(24, 0)).toBe(true);
        expect(source.store.hasCoreTile(0, 0)).toBe(false);
        expect(streamer.hasResident(0, 0)).toBe(false);
        expect(streamer.hasResident(2, 0)).toBe(true);
        streamer.dispose();
        expect(client.disposed).toBe(true);
    });

    test("streams a finite toroidal source with partial edge chunks", async () => {
        const client = new DeferredChunkClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const source = new ToroidalWorldSource(
            { seed: "finite", width: 20, height: 17, workerUrl: "unused", chunkSize: 12 },
            { pool }
        );
        expect(source.resolveChunk(-1, -1)).toEqual({ x: 1, y: 1 });
        const pending = source.loadChunk(1, 1);
        client.requests[0].resolve(generateWorldChunk(client.requests[0].options));
        const chunk = await pending;
        expect(chunk.coreTiles).toHaveLength(8 * 5);
        expect(source.hasTile(19, 16)).toBe(true);
        expect(source.map.infinite).not.toBe(true);
        expect(Object.keys(source.map.data)).toHaveLength(0);
        source.dispose();
    });
});

function staticMap(w = 24, h = 12, wrapX = false): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < w; x += 1) {
        data[x] = {};
        for (let y = 0; y < h; y += 1) data[x][y] = { type: Land.land };
    }
    data[1][1] = { type: Land.land, modifiers: ["river"], city: { name: "Kept" } };
    return { data, w, h, wrapX };
}

describe("unified world sources and streamer", () => {
    test("prefetches the predicted movement direction inside the retention margin", async () => {
        const source = new StaticWorldSource(staticMap(60, 12), { chunkSize: 12 });
        const loaded = vi.fn();
        const streamer = new WorldStreamer(source, {
            chunkLoaded: loaded,
            chunkUnloading: vi.fn()
        }, { loadRadius: 0, retentionRadius: 1, maxResidentChunks: 2 });

        await streamer.setCenterTile(12, 0, { x: 24, y: 0 });
        await flush();
        expect(streamer.hasResident(1, 0)).toBe(true);
        expect(streamer.hasResident(2, 0)).toBe(true);
        expect(loaded).toHaveBeenCalledTimes(2);
        streamer.dispose();
    });

    test("normalizes finite prediction at the exact tile seam before resolving partial chunks", async () => {
        const source = new StaticWorldSource(staticMap(42, 12, true), { chunkSize: 12 });
        const streamer = new WorldStreamer(source, {
            chunkLoaded: vi.fn(),
            chunkUnloading: vi.fn()
        }, { loadRadius: 0, retentionRadius: 1, maxResidentChunks: 2 });

        await streamer.setCenterTile(41, 0, { x: 42, y: 0 });
        await flush();
        expect(streamer.hasResident(3, 0)).toBe(true);
        expect(streamer.hasResident(0, 0)).toBe(true);
        streamer.dispose();
    });

    test("enforces maxResidentChunks as a hard nearest-demand limit", async () => {
        const source = new StaticWorldSource(staticMap(36, 36), { chunkSize: 12 });
        const streamer = new WorldStreamer(source, {
            chunkLoaded: vi.fn(),
            chunkUnloading: vi.fn()
        }, { loadRadius: 1, retentionRadius: 1, maxResidentChunks: 1 });

        await streamer.setCenterTile(12, 12);
        await flush();
        expect(streamer.stats.residentChunks).toBe(1);
        expect(streamer.residentChunks).toEqual([
            expect.objectContaining({ chunkX: 1, chunkY: 1 })
        ]);
        streamer.dispose();
    });

    test("replaces an aborted pending request when demand returns before settlement", async () => {
        class AbortableSource extends StaticWorldSource {
            public requests = 0;

            public override loadChunk(chunkX: number, chunkY: number, request?: ChunkRequestOptions): Promise<WorldChunk> {
                this.requests += 1;
                return new Promise((resolve, reject) => {
                    const abort = () => {
                        const error = new Error("aborted");
                        error.name = "AbortError";
                        reject(error);
                    };
                    request?.signal?.addEventListener("abort", abort, { once: true });
                    queueMicrotask(() => {
                        request?.signal?.removeEventListener("abort", abort);
                        if (!request?.signal?.aborted) resolve(super.loadChunk(chunkX, chunkY, request));
                    });
                });
            }
        }

        const source = new AbortableSource(staticMap(24, 12), { chunkSize: 12 });
        const streamer = new WorldStreamer(source, {
            chunkLoaded: vi.fn(),
            chunkUnloading: vi.fn()
        }, { loadRadius: 0, retentionRadius: 0, maxResidentChunks: 1 });

        const first = streamer.setCenterTile(0, 0);
        const away = streamer.setCenterTile(12, 0);
        const returned = streamer.setCenterTile(0, 0);
        await expect(first).rejects.toMatchObject({ name: "AbortError" });
        await expect(away).rejects.toMatchObject({ name: "AbortError" });
        await expect(returned).resolves.toMatchObject({ chunkX: 0, chunkY: 0 });
        expect(streamer.hasResident(0, 0)).toBe(true);
        expect(source.requests).toBe(3);
        streamer.dispose();
    });

    test("does not mount a stale result from a source that ignores abort signals", async () => {
        class DeferredSource extends StaticWorldSource {
            public readonly completions: Array<() => void> = [];

            public override loadChunk(chunkX: number, chunkY: number, _request?: ChunkRequestOptions): Promise<WorldChunk> {
                return new Promise(resolve => {
                    this.completions.push(() => resolve(super.loadChunk(chunkX, chunkY)));
                });
            }
        }

        const source = new DeferredSource(staticMap(24, 12), { chunkSize: 12 });
        const loaded = vi.fn();
        const streamer = new WorldStreamer(source, {
            chunkLoaded: loaded,
            chunkUnloading: vi.fn()
        }, { loadRadius: 0, retentionRadius: 0, maxResidentChunks: 1 });

        const stale = streamer.setCenterTile(0, 0);
        const away = streamer.setCenterTile(12, 0);
        const returned = streamer.setCenterTile(0, 0);
        source.completions[0]();
        source.completions[1]();
        source.completions[2]();
        await expect(stale).rejects.toMatchObject({ name: "AbortError" });
        await expect(away).rejects.toMatchObject({ name: "AbortError" });
        await expect(returned).resolves.toMatchObject({ chunkX: 0, chunkY: 0 });
        expect(loaded).toHaveBeenCalledOnce();
        expect(streamer.stats.residentChunks).toBe(1);
        streamer.dispose();
    });

    test("chunks finite maps without losing rich tile data or wrap topology", async () => {
        const map = staticMap(24, 12, true);
        const source = new StaticWorldSource(map, { chunkSize: 12 });
        expect(source.resolveChunk(-1, 0)).toEqual({ x: 1, y: 0 });
        expect(source.chunkDistance(1, 0, 0, 0)).toBe(1);

        const chunk = await source.loadChunk(0, 0);
        expect(chunk.coreTiles).toHaveLength(144);
        expect(source.map.data[1][1]).toBe(map.data[1][1]);
        expect(source.map.data[1][1].city?.name).toBe("Kept");
        source.releaseChunk(chunk);
        expect(source.hasTile(1, 1)).toBe(true);
        source.dispose();
    });

    test("uses the same residency lifecycle for a bounded static source", async () => {
        const source = new StaticWorldSource(staticMap(), { chunkSize: 12 });
        const loaded = vi.fn();
        const unloading = vi.fn();
        const streamer = new WorldStreamer(source, {
            chunkLoaded: loaded,
            chunkUnloading: unloading
        }, { loadRadius: 0, retentionRadius: 0, maxResidentChunks: 1 });

        await streamer.setCenterTile(0, 0);
        await streamer.setCenterTile(12, 0);
        expect(loaded).toHaveBeenCalledTimes(2);
        expect(unloading).toHaveBeenCalledTimes(1);
        expect(source.hasTile(0, 0)).toBe(true);
        expect(streamer.stats.residentChunks).toBe(1);
        streamer.dispose();
    });

    test("retries a transient source failure and reports retry statistics", async () => {
        class FlakySource extends StaticWorldSource {
            attempts = 0;

            public override loadChunk(chunkX: number, chunkY: number, request?: ChunkRequestOptions): Promise<WorldChunk> {
                this.attempts += 1;
                if (this.attempts === 1) return Promise.reject(new Error("temporary source failure"));
                return super.loadChunk(chunkX, chunkY, request);
            }
        }

        const source = new FlakySource(staticMap(12, 12), { chunkSize: 12 });
        const errors = vi.fn();
        const streamer = new WorldStreamer(source, {
            chunkLoaded: vi.fn(),
            chunkUnloading: vi.fn(),
            error: errors
        }, { loadRadius: 0, retentionRadius: 0, maxRetries: 1, retryBaseDelayMs: 0 });

        await expect(streamer.setCenterTile(0, 0)).resolves.toMatchObject({ chunkX: 0, chunkY: 0 });
        expect(source.attempts).toBe(2);
        expect(errors).toHaveBeenCalledOnce();
        expect(streamer.stats.retriedChunkRequests).toBe(1);
        expect(streamer.stats.failedChunks).toBe(0);
        streamer.dispose();
    });

    test("rejects malformed custom-source chunks without retrying contract errors", async () => {
        class InvalidSource extends StaticWorldSource {
            public override async loadChunk(chunkX: number, chunkY: number, request?: ChunkRequestOptions): Promise<WorldChunk> {
                const chunk = await super.loadChunk(chunkX, chunkY, request);
                return { ...chunk, chunkX: chunkX + 1 };
            }
        }

        const source = new InvalidSource(staticMap(12, 12), { chunkSize: 12 });
        const streamer = new WorldStreamer(source, {
            chunkLoaded: vi.fn(),
            chunkUnloading: vi.fn()
        }, { loadRadius: 0, retentionRadius: 0, maxRetries: 3, retryBaseDelayMs: 0 });
        await expect(streamer.setCenterTile(0, 0)).rejects.toThrow(/invalid chunk/);
        expect(streamer.stats.retriedChunkRequests).toBe(0);
        expect(streamer.stats.failedChunks).toBe(1);
        streamer.dispose();
    });
});
