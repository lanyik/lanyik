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
    WORLD_GENERATOR_VERSION,
    WorldChunkCache,
    WorldChunkCacheStats,
    createWorldChunkCacheKey,
    createWorldDescriptor,
    serializeWorldDescriptor,
    isMutableWorldSource,
    WorldStreamer
} from "../../src/index";
import { ChunkGeneratorClient, ChunkRequestOptions } from "../../src/world/WorldGeneratorPool";
import {
    MemoryWorldDeltaStore,
    WORLD_DELTA_FORMAT_VERSION,
    WorldChunkDelta,
    WorldDeltaBatchOptions,
    WorldDeltaChange,
    WorldDeltaEntry,
    WorldDeltaStore
} from "../../src/world/WorldDeltaStore";

import {
    WorldVegetationGenerationOptions,
    WorldVegetationLayout
} from "../../src/world/generateVegetation";

const infiniteWorldId = (seed: string, chunkSize = 12): string =>
    serializeWorldDescriptor(createWorldDescriptor({ seed, chunkSize }));

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

    get isDisposed(): boolean {
        return this.disposed;
    }
}

class ImmediateChunkClient implements ChunkGeneratorClient {
    generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk> {
        return Promise.resolve(generateWorldChunk(options));
    }
    dispose(): void {}
}

class DeferredMixedClient implements ChunkGeneratorClient {
    readonly tasks: Array<
        | { kind: "chunk"; options: WorldChunkGenerationOptions; resolve(value: PackedWorldChunk): void }
        | { kind: "vegetation"; options: WorldVegetationGenerationOptions; resolve(value: WorldVegetationLayout): void }
    > = [];
    generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk> {
        return new Promise(resolve => this.tasks.push({ kind: "chunk", options, resolve }));
    }
    generateVegetation(options: WorldVegetationGenerationOptions): Promise<WorldVegetationLayout> {
        return new Promise(resolve => this.tasks.push({ kind: "vegetation", options, resolve }));
    }
    dispose(): void {}
}

class DeferredDeltaStore implements WorldDeltaStore {
    resolveLoad!: (delta: WorldChunkDelta | undefined) => void;
    loadChunk(): Promise<WorldChunkDelta | undefined> {
        return new Promise(resolve => { this.resolveLoad = resolve; });
    }
    putTile(): void {}
    deleteTile(): void {}
    flush(): Promise<void> { return Promise.resolve(); }
    clear(): Promise<void> { return Promise.resolve(); }
    dispose(): void {}
}

class FlakyDeltaStore extends MemoryWorldDeltaStore {
    public attempts = 0;

    constructor(private failuresRemaining: number) {
        super();
    }

    public override putChunkDelta(
        worldId: string,
        chunkX: number,
        chunkY: number,
        changes: readonly WorldDeltaChange[],
        options: WorldDeltaBatchOptions
    ): Promise<WorldChunkDelta | undefined> {
        this.attempts += 1;
        if (this.failuresRemaining > 0) {
            this.failuresRemaining -= 1;
            return Promise.reject(new Error("write failed"));
        }
        return super.putChunkDelta(worldId, chunkX, chunkY, changes, options);
    }
}

class DeferredWriteDeltaStore extends MemoryWorldDeltaStore {
    public readonly writes: Array<{
        worldId: string;
        chunkX: number;
        chunkY: number;
        changes: readonly WorldDeltaChange[];
        options: WorldDeltaBatchOptions;
        resolve(delta: WorldChunkDelta | undefined): void;
        reject(reason: unknown): void;
    }> = [];

    public override putChunkDelta(
        worldId: string,
        chunkX: number,
        chunkY: number,
        changes: readonly WorldDeltaChange[],
        options: WorldDeltaBatchOptions
    ): Promise<WorldChunkDelta | undefined> {
        return new Promise((resolve, reject) => {
            this.writes.push({ worldId, chunkX, chunkY, changes, options, resolve, reject });
        });
    }

    public async completeNext(): Promise<void> {
        const write = this.writes.shift();
        if (!write) throw new Error("no deferred delta write is pending");
        try {
            write.resolve(await super.putChunkDelta(
                write.worldId,
                write.chunkX,
                write.chunkY,
                write.changes,
                write.options
            ));
        } catch (reason) {
            write.reject(reason);
        }
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

    test("partial edge chunks expose only their real core and one-cell seam halo", () => {
        const width = 20;
        const height = 17;
        const chunkSize = 12;
        const store = new SparseWorldChunkStore({ width, height, wrapX: true, wrapY: true });
        const edge = generateWorldChunk({
            seed: "partial-seam",
            chunkX: 1,
            chunkY: 0,
            chunkSize,
            world: { width, height, topology: "toroidal" }
        });
        store.add(edge);

        expect(getMapTile(store.map, 0, 0)).toEqual(decodeWorldChunkTile(edge, 8, 0));
        expect(getMapTile(store.map, 11, 0)).toEqual(decodeWorldChunkTile(edge, -1, 0));
        for (let x = 1; x <= 10; x += 1) {
            expect(getMapTile(store.map, x, 0)).toBeUndefined();
        }
    });

    test("stores mutable per-coordinate overrides without expanding shared base variants", () => {
        const store = new SparseWorldChunkStore();
        const chunk = generateWorldChunk({ seed: 4, chunkX: 0, chunkY: 0, chunkSize: 12 });
        store.add(chunk);
        const base = getMapTile(store.map, 0, 0)!;
        const variants = store.decodedTileVariantCount;

        store.setTileOverride(0, 0, {
            unit: "scout",
            modifiers: ["wood"],
            rivers: [{ riverIndex: 1, riverTileIndex: 2 }],
            city: { name: "Outpost" }
        });
        const overridden = getMapTile(store.map, 0, 0)!;
        expect(overridden).not.toBe(base);
        expect(Object.isFrozen(base)).toBe(true);
        expect(Object.isFrozen(overridden)).toBe(true);
        expect(Object.isFrozen(overridden.modifiers)).toBe(true);
        expect(Object.isFrozen(overridden.rivers)).toBe(true);
        expect(Object.isFrozen(overridden.rivers?.[0])).toBe(true);
        expect(Object.isFrozen(overridden.city)).toBe(true);
        expect(overridden.unit).toBe("scout");
        expect(overridden.city?.name).toBe("Outpost");
        expect(store.tileOverrideCount).toBe(1);
        expect(store.decodedTileVariantCount).toBe(variants);
        expect(getMapTile(store.map, 0, 1)?.unit).toBeUndefined();

        store.remove(0, 0);
        store.add(chunk);
        expect(getMapTile(store.map, 0, 0)?.unit).toBe("scout");

        const exposed = store.getTileOverride(0, 0)!;
        exposed.modifiers?.push("lake");
        exposed.rivers![0].riverIndex = 99;
        exposed.city!.name = "Mutated";
        expect(store.getTileOverride(0, 0)).toMatchObject({
            modifiers: ["wood"],
            rivers: [{ riverIndex: 1, riverTileIndex: 2 }],
            city: { name: "Outpost" }
        });

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
    test("reserves capacity so long vegetation work cannot block a new terrain chunk", async () => {
        const clients: DeferredMixedClient[] = [];
        const pool = new WorldGeneratorPool("unused", {
            size: 2,
            reservedChunkWorkers: 1,
            clientFactory: () => {
                const client = new DeferredMixedClient();
                clients.push(client);
                return client;
            }
        });
        const vegetationOptions = {} as WorldVegetationGenerationOptions;
        const firstVegetation = pool.generateVegetation(vegetationOptions);
        const secondVegetation = pool.generateVegetation(vegetationOptions);
        expect(clients.flatMap(client => client.tasks).filter(task => task.kind === "vegetation")).toHaveLength(1);
        expect(pool.stats).toMatchObject({ busyVegetationWorkers: 1, queuedVegetation: 1 });

        const terrain = pool.generateChunk({ seed: 1, chunkX: 4, chunkY: 5 });
        const terrainTask = clients.flatMap(client => client.tasks).find(task => task.kind === "chunk")!;
        expect(terrainTask).toBeDefined();
        if (terrainTask.kind === "chunk") terrainTask.resolve(generateWorldChunk(terrainTask.options));
        await terrain;
        expect(pool.stats).toMatchObject({ busyVegetationWorkers: 1, queuedVegetation: 1 });

        const runningVegetation = clients.flatMap(client => client.tasks).find(task => task.kind === "vegetation")!;
        if (runningVegetation.kind === "vegetation") runningVegetation.resolve({} as WorldVegetationLayout);
        await firstVegetation;
        await flush();
        const vegetationTasks = clients.flatMap(client => client.tasks).filter(task => task.kind === "vegetation");
        expect(vegetationTasks).toHaveLength(2);
        const queuedVegetation = vegetationTasks[1];
        if (queuedVegetation.kind === "vegetation") queuedVegetation.resolve({} as WorldVegetationLayout);
        await secondVegetation;
        pool.dispose();
    });

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

    test("classifies running and queued work as cancelled when the pool is disposed", async () => {
        const client = new DeferredChunkClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const running = pool.generateChunk({ seed: 1, chunkX: 0, chunkY: 0 });
        const queued = pool.generateChunk({ seed: 1, chunkX: 1, chunkY: 0 });
        const outcomes = Promise.allSettled([running, queued]);

        pool.dispose();

        for (const outcome of await outcomes) {
            expect(outcome).toMatchObject({
                status: "rejected",
                reason: { name: "AbortError" }
            });
        }
    });

    test("shrinks busy worker pools after in-flight tasks settle and grows them again", async () => {
        const clients: DeferredChunkClient[] = [];
        const pool = new WorldGeneratorPool("unused", {
            size: 2,
            maxWorkers: 4,
            clientFactory: () => {
                const client = new DeferredChunkClient();
                clients.push(client);
                return client;
            }
        });
        const first = pool.generateChunk({ seed: 1, chunkX: 0, chunkY: 0 });
        const second = pool.generateChunk({ seed: 1, chunkX: 1, chunkY: 0 });
        pool.configureSize(1);
        expect(pool.stats).toMatchObject({ workers: 2, configuredWorkers: 1, busyWorkers: 2 });
        clients[0].requests[0].resolve(generateWorldChunk(clients[0].requests[0].options));
        await first;
        await flush();
        expect(pool.stats.workers).toBe(1);
        const remaining = clients.find(client => !client.disposed)!;
        remaining.requests[0].resolve(generateWorldChunk(remaining.requests[0].options));
        await second;
        pool.configureSize(3);
        expect(pool.stats).toMatchObject({ workers: 3, configuredWorkers: 3 });
        pool.dispose();
    });

    test("replaces a client that fails while idle before dispatching new work", async () => {
        const clients: DeferredChunkClient[] = [];
        const pool = new WorldGeneratorPool("unused", {
            size: 1,
            clientFactory: () => {
                const client = new DeferredChunkClient();
                clients.push(client);
                return client;
            }
        });
        clients[0].dispose();

        const pending = pool.generateChunk({ seed: 1, chunkX: 4, chunkY: 5 });
        expect(clients).toHaveLength(2);
        expect(clients[1].requests).toHaveLength(1);
        clients[1].requests[0].resolve(generateWorldChunk(clients[1].requests[0].options));
        await expect(pending).resolves.toMatchObject({ chunkX: 4, chunkY: 5 });
        pool.dispose();
    });

    test("rejects admitted work when worker recreation fails and remains recoverable", async () => {
        const clients: DeferredChunkClient[] = [];
        let rejectFactory = false;
        const pool = new WorldGeneratorPool("unused", {
            size: 1,
            clientFactory: () => {
                if (rejectFactory) throw new Error("worker construction failed");
                const client = new DeferredChunkClient();
                clients.push(client);
                return client;
            }
        });
        clients[0].dispose();
        rejectFactory = true;

        await expect(pool.generateChunk({ seed: 1, chunkX: 7, chunkY: 0 }))
            .rejects.toThrow("worker construction failed");
        expect(pool.stats).toMatchObject({ queued: 0, busyWorkers: 0, clientFactoryFailures: 1 });

        rejectFactory = false;
        const recovered = pool.generateChunk({ seed: 1, chunkX: 8, chunkY: 0 });
        expect(clients).toHaveLength(2);
        clients[1].requests[0].resolve(generateWorldChunk(clients[1].requests[0].options));
        await expect(recovered).resolves.toMatchObject({ chunkX: 8, chunkY: 0 });
        pool.dispose();
    });

    test("normalizes a synchronous client failure without stranding the worker slot", async () => {
        class SynchronouslyFlakyClient extends ImmediateChunkClient {
            private fail = true;
            public override generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk> {
                if (this.fail) {
                    this.fail = false;
                    throw new Error("synchronous worker failure");
                }
                return super.generateChunk(options);
            }
        }
        const client = new SynchronouslyFlakyClient();
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });

        await expect(pool.generateChunk({ seed: 1, chunkX: 1, chunkY: 2 }))
            .rejects.toThrow("synchronous worker failure");
        await flush();
        expect(pool.stats).toMatchObject({ queued: 0, busyWorkers: 0 });
        await expect(pool.generateChunk({ seed: 1, chunkX: 3, chunkY: 4 }))
            .resolves.toMatchObject({ chunkX: 3, chunkY: 4 });
        pool.dispose();
    });
});

describe("procedural world source", () => {
    test("rejects generator versions not implemented by this build", () => {
        expect(() => new ProceduralWorldSource({
            seed: "future", workerUrl: "unused", generatorVersion: WORLD_GENERATOR_VERSION + 1
        })).toThrow(/unsupported world generator version/);
    });

    test("persists editor batches once per affected chunk", async () => {
        class CountingDeltaStore extends MemoryWorldDeltaStore {
            readonly batches: Array<{ chunkX: number; chunkY: number; changes: number }> = [];
            public override putChunkDelta(
                worldId: string,
                chunkX: number,
                chunkY: number,
                changes: readonly WorldDeltaChange[],
                options: WorldDeltaBatchOptions
            ): Promise<WorldChunkDelta | undefined> {
                this.batches.push({ chunkX, chunkY, changes: changes.length });
                return super.putChunkDelta(worldId, chunkX, chunkY, changes, options);
            }
        }
        const deltas = new CountingDeltaStore();
        const source = new ProceduralWorldSource(
            { seed: "batch-save", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        source.setTileOverrides([
            ...Array.from({ length: 100 }, (_, index) => ({
                x: index % 10,
                y: Math.floor(index / 10),
                changes: { unit: `first-${index}` }
            })),
            { x: 12, y: 0, changes: { unit: "second-chunk" } }
        ]);

        expect(deltas.batches).toEqual([
            { chunkX: 0, chunkY: 0, changes: 100 },
            { chunkX: 1, chunkY: 0, changes: 1 }
        ]);
        expect((await deltas.loadChunk(infiniteWorldId("batch-save"), 0, 0, { chunkSize: 12 }))?.revision).toBe(1);
        expect(source.getChunkRevision(0, 0)?.deltaRevision).toBe(1);
        expect(source.getChunkRevision(1, 0)?.deltaRevision).toBe(1);
        source.setTileOverride(0, 0, { unit: "first-0" });
        expect(deltas.batches).toHaveLength(2);
        expect(source.getChunkRevision(0, 0)?.deltaRevision).toBe(1);
        await source.clearDeltas();
        expect(source.getChunkRevision(0, 0)?.deltaRevision).toBe(2);
        expect(source.stats).toMatchObject({ trackedDeltaChunks: 0, pendingDeltaTiles: 0 });
        source.dispose();
    });

    test("releases tile-level delta protection after persistence acknowledgement", async () => {
        const deltas = new MemoryWorldDeltaStore();
        const source = new ProceduralWorldSource(
            { seed: "delta-tracking", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        source.setTileOverrides(Array.from({ length: 100 }, (_, index) => ({
            x: index % 10,
            y: Math.floor(index / 10),
            changes: { unit: `unit-${index}` }
        })));
        expect(source.stats).toMatchObject({ trackedDeltaChunks: 1, pendingDeltaTiles: 100 });

        await flush();
        expect(source.stats).toMatchObject({ trackedDeltaChunks: 1, pendingDeltaTiles: 0 });
        source.dispose();
    });

    test("flush reports persistent write failures without acknowledging tiles", async () => {
        const deltas = new FlakyDeltaStore(Number.POSITIVE_INFINITY);
        const source = new ProceduralWorldSource(
            { seed: "failed-delta-write", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        source.setTileOverride(2, 3, { unit: "unsaved" });
        await flush();

        await expect(source.flushDeltas()).rejects.toThrow("write failed");
        expect(source.stats.pendingDeltaTiles).toBe(1);
        expect(deltas.attempts).toBeGreaterThanOrEqual(1);
        source.dispose();
    });

    test("flush retries failed tile epochs and acknowledges only a durable retry", async () => {
        const deltas = new FlakyDeltaStore(1);
        const source = new ProceduralWorldSource(
            { seed: "retried-delta-write", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        source.setTileOverride(2, 3, { unit: "saved-after-retry" });
        await flush();
        expect(source.stats.pendingDeltaTiles).toBe(1);

        await source.flushDeltas();

        expect(source.stats.pendingDeltaTiles).toBe(0);
        expect(deltas.attempts).toBe(2);
        expect((await deltas.loadChunk(
            infiniteWorldId("retried-delta-write"),
            0,
            0,
            { chunkSize: 12 }
        ))?.entries[0]).toMatchObject({ x: 2, y: 3, override: { unit: "saved-after-retry" } });
        source.dispose();
    });

    test("does not let an older write acknowledge a newer edit to the same tile", async () => {
        const deltas = new DeferredWriteDeltaStore();
        const source = new ProceduralWorldSource(
            { seed: "delta-write-epochs", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        source.setTileOverride(2, 3, { unit: "first" });
        source.setTileOverride(2, 3, { unit: "second" });
        expect(deltas.writes).toHaveLength(1);
        expect(deltas.writes[0].changes[0].override).toEqual({ unit: "first" });

        await deltas.completeNext();
        await flush();
        expect(source.stats.pendingDeltaTiles).toBe(1);
        expect(deltas.writes).toHaveLength(1);
        expect(deltas.writes[0].changes[0].override).toEqual({ unit: "second" });

        await deltas.completeNext();
        await source.flushDeltas();
        expect(source.stats.pendingDeltaTiles).toBe(0);
        expect((await deltas.loadChunk(
            infiniteWorldId("delta-write-epochs"),
            0,
            0,
            { chunkSize: 12 }
        ))?.entries[0].override).toEqual({ unit: "second" });
        source.dispose();
    });

    test("bounds revision tombstones during long-running edit churn", async () => {
        const source = new ProceduralWorldSource(
            { seed: "bounded-delta-history", workerUrl: "unused", chunkSize: 12 },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        for (let chunkX = 0; chunkX < 5_000; chunkX += 1) {
            const x = chunkX * 12;
            source.setTileOverride(x, 0, { unit: "temporary" });
            expect(source.clearTileOverride(x, 0)).toBe(true);
        }

        expect(source.stats.trackedDeltaChunks).toBeLessThanOrEqual(4_096);
        expect(source.stats.pendingDeltaTiles).toBe(0);
        await source.clearDeltas();
        expect(source.stats.trackedDeltaChunks).toBe(0);
        source.dispose();
    });

    test("restores sparse deltas after rebuilding a source", async () => {
        const deltas = new MemoryWorldDeltaStore();
        const createSource = () => new ProceduralWorldSource(
            { seed: "saved-world", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        const first = createSource();
        await first.loadChunk(0, 0);
        first.setTileOverrides([
            { x: 2, y: 3, changes: { unit: "scout" } },
            { x: 4, y: 5, changes: { city: { name: "Persistent" } } }
        ]);
        first.dispose();

        const second = createSource();
        await second.loadChunk(0, 0);
        expect(getMapTile(second.map, 2, 3)?.unit).toBe("scout");
        expect(getMapTile(second.map, 4, 5)?.city?.name).toBe("Persistent");
        expect(second.clearTileOverride(2, 3)).toBe(true);
        second.dispose();

        const third = createSource();
        await third.loadChunk(0, 0);
        expect(getMapTile(third.map, 2, 3)?.unit).toBeUndefined();
        expect(getMapTile(third.map, 4, 5)?.city?.name).toBe("Persistent");
        await third.clearDeltas();
        expect(getMapTile(third.map, 4, 5)?.city).toBeUndefined();
        third.dispose();

        const fourth = createSource();
        await fourth.loadChunk(0, 0);
        expect(getMapTile(fourth.map, 4, 5)?.city).toBeUndefined();
        fourth.dispose();
    });

    test("isolates default save slots when chunk size changes", async () => {
        const deltas = new MemoryWorldDeltaStore();
        const source12 = new ProceduralWorldSource(
            { seed: "sized-save", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        await source12.loadChunk(0, 0);
        source12.setTileOverride(2, 3, { unit: "size-12" });
        source12.dispose();

        const source24 = new ProceduralWorldSource(
            { seed: "sized-save", workerUrl: "unused", chunkSize: 24, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        await source24.loadChunk(0, 0);
        expect(getMapTile(source24.map, 2, 3)?.unit).toBeUndefined();
        source24.dispose();
    });

    test("does not let delayed delta restoration overwrite a newer local edit", async () => {
        const deltas = new DeferredDeltaStore();
        const source = new ProceduralWorldSource(
            { seed: "delta-race", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        const loading = source.loadChunk(0, 0);
        await flush();
        source.setTileOverride(2, 3, { unit: "new" });
        deltas.resolveLoad({
            version: WORLD_DELTA_FORMAT_VERSION,
            worldId: infiniteWorldId("delta-race"),
            chunkX: 0,
            chunkY: 0,
            chunkSize: 12,
            revision: 1,
            entries: [{ x: 2, y: 3, override: { unit: "old" } } satisfies WorldDeltaEntry]
        });
        await loading;
        expect(getMapTile(source.map, 2, 3)?.unit).toBe("new");
        source.dispose();
    });

    test("invalidates an older in-flight restore when deltas are cleared", async () => {
        const deltas = new DeferredDeltaStore();
        const source = new ProceduralWorldSource(
            { seed: "delta-clear-race", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        const loading = source.loadChunk(0, 0);
        await flush();
        await source.clearDeltas();
        deltas.resolveLoad({
            version: WORLD_DELTA_FORMAT_VERSION,
            worldId: infiniteWorldId("delta-clear-race"),
            chunkX: 0,
            chunkY: 0,
            chunkSize: 12,
            revision: 1,
            entries: [{ x: 2, y: 3, override: { unit: "stale" } }]
        });

        await loading;
        expect(getMapTile(source.map, 2, 3)?.unit).toBeUndefined();
        expect(source.stats).toMatchObject({ pendingDeltaTiles: 0, restoringDeltaChunks: 0 });
        source.dispose();
    });

    test("rejects a custom delta store that injects coordinates from another chunk", async () => {
        const deltas = new DeferredDeltaStore();
        const source = new ProceduralWorldSource(
            { seed: "invalid-delta", workerUrl: "unused", chunkSize: 12, deltaStore: deltas },
            { pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => new ImmediateChunkClient() }) }
        );
        const loading = source.loadChunk(0, 0);
        await flush();
        deltas.resolveLoad({
            version: WORLD_DELTA_FORMAT_VERSION,
            worldId: infiniteWorldId("invalid-delta"),
            chunkX: 0,
            chunkY: 0,
            chunkSize: 12,
            revision: 1,
            entries: [{ x: 12, y: 0, override: { unit: "foreign" } }]
        });

        await expect(loading).rejects.toThrow(/invalid or incompatible/);
        expect(source.hasChunk(0, 0)).toBe(false);
        source.dispose();
    });
    test("uses the canonical descriptor fingerprint and chunk coordinates for cache keys", () => {
        const base = {
            descriptor: createWorldDescriptor({ seed: "cache-key", chunkSize: 12 }),
            chunkX: 0,
            chunkY: 0
        };
        const infinite = createWorldChunkCacheKey(base);
        expect(createWorldChunkCacheKey({ ...base })).toBe(infinite);
        expect(createWorldChunkCacheKey({
            ...base,
            descriptor: createWorldDescriptor({
                seed: "cache-key",
                chunkSize: 12,
                world: { width: 24, height: 24, topology: "toroidal" }
            })
        })).not.toBe(infinite);
        expect(createWorldChunkCacheKey({
            ...base,
            descriptor: createWorldDescriptor({ seed: "other", chunkSize: 12 })
        })).not.toBe(infinite);
        expect(createWorldChunkCacheKey({ ...base, chunkX: -1 })).not.toBe(infinite);
    });

    test("shares one descriptor fingerprint across world id and terrain revision", () => {
        const pool = new WorldGeneratorPool("unused", {
            size: 1,
            clientFactory: () => new ImmediateChunkClient()
        });
        const source = new ProceduralWorldSource({ seed: "identity", workerUrl: "unused", chunkSize: 12 }, { pool });
        const fingerprint = serializeWorldDescriptor(source.descriptor!);
        expect(source.worldId).toBe(fingerprint);
        expect(source.getChunkRevision(3, -2)?.terrainRevision).toBe(fingerprint);
        source.dispose();
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
        expect(isMutableWorldSource(source)).toBe(true);
        source.setTileOverride(-1, -1, { unit: "wrapped-scout" });
        expect(getMapTile(source.map, 19, 16)?.unit).toBe("wrapped-scout");
        expect(source.clearTileOverride(-1, -1)).toBe(true);
        expect(getMapTile(source.map, 19, 16)?.unit).toBeUndefined();
        expect(() => source.setTileOverride(Number.MAX_SAFE_INTEGER + 1, 0, { unit: "invalid" }))
            .toThrow(/safe integers/);
        source.dispose();
    });

    test("validates an override batch before applying any changes", () => {
        const store = new SparseWorldChunkStore();
        expect(() => store.setTileOverrides([
            { x: 1, y: 2, changes: { unit: "scout" } },
            { x: Number.MAX_SAFE_INTEGER + 1, y: 2, changes: { unit: "invalid" } }
        ])).toThrow(/safe integers/);
        expect(store.tileOverrideCount).toBe(0);

        expect(() => store.setTileOverrides([
            { x: 1, y: 2, changes: { unit: "scout" } },
            { x: 2, y: 2, changes: { rivers: "invalid" } as never }
        ])).toThrow(/rivers/);
        expect(store.tileOverrideCount).toBe(0);
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
        // The returned demand reuses the still-running request for the same
        // immutable chunk; the coordinator never overlaps two source loads
        // whose release hooks could invalidate each other.
        expect(source.completions).toHaveLength(2);
        source.completions[0]();
        source.completions[1]();
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
