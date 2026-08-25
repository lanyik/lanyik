import { describe, expect, test, vi } from "vitest";

import {
    decodeWorldChunkTile,
    generateWorldChunk,
    InfiniteWorldStreamer,
    PackedWorldChunk,
    SparseWorldChunkStore,
    WorldChunkGenerationOptions,
    WorldGeneratorPool
} from "../../src/index";
import { ChunkGeneratorClient } from "../../src/world/WorldGeneratorPool";

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

    test("reference-counts overlapping halo cells and frees all unloaded data", () => {
        const store = new SparseWorldChunkStore();
        const left = generateWorldChunk({ seed: 4, chunkX: 0, chunkY: 0, chunkSize: 12 });
        const right = generateWorldChunk({ seed: 4, chunkX: 1, chunkY: 0, chunkSize: 12 });
        store.add(left);
        store.add(right);
        expect(store.hasCoreTile(12, 0)).toBe(true);
        store.remove(0, 0);
        expect(store.map.data[12]?.[0]).toBeDefined();
        store.remove(1, 0);
        expect(store.residentChunkCount).toBe(0);
        expect(Object.keys(store.map.data)).toHaveLength(0);
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

describe("infinite world streamer", () => {
    test("loads the center and unloads chunks outside retention", async () => {
        const client = new DeferredChunkClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const loaded = vi.fn();
        const unloading = vi.fn();
        const streamer = new InfiniteWorldStreamer(pool, {
            chunkLoaded: loaded,
            chunkUnloading: unloading
        }, { seed: 7, chunkSize: 12, loadRadius: 0, retentionRadius: 0, maxResidentChunks: 1 });

        const first = streamer.setCenterTile(0, 0);
        client.requests[0].resolve(generateWorldChunk(client.requests[0].options));
        await first;
        expect(streamer.stats.residentChunks).toBe(1);
        expect(loaded).toHaveBeenCalledOnce();

        const second = streamer.setCenterTile(24, 0);
        expect(unloading).toHaveBeenCalledOnce();
        await flush();
        client.requests[1].resolve(generateWorldChunk(client.requests[1].options));
        await second;
        expect(streamer.stats.residentChunks).toBe(1);
        expect(streamer.store.hasCoreTile(24, 0)).toBe(true);
        expect(streamer.store.hasCoreTile(0, 0)).toBe(false);
        streamer.dispose();
    });
});
