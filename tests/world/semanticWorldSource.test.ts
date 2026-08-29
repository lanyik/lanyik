import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo, TileInfo } from "../../src/interfaces";
import {
    BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES,
    getBaseSemanticTile,
    semanticTileIndex
} from "../../src/world/BaseSemanticChunk";
import {
    CORE_WORLD_SEMANTICS_V2,
    CoreSubstrateClass,
    CoreVegetationProfile,
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import {
    InfiniteSemanticWorldSource,
    SemanticChunkPool,
    StaticSemanticWorldSource,
    ToroidalSemanticWorldSource,
    assertSemanticWorldSource
} from "../../src/world/SemanticWorldSource";
import { SurfaceTaskRequestOptions, SurfaceWorkerPoolStats } from "../../src/world/SurfaceWorkerPool";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";
import { createWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

const EMPTY_POOL_STATS: Readonly<SurfaceWorkerPoolStats> = Object.freeze({
    workers: 1,
    busyWorkers: 0,
    queued: 0,
    completed: 0,
    workerFailures: 0,
    retried: 0,
    queuedWeight: 0,
    oldestQueuedMs: 0,
    shedTasks: 0,
    starvationPromotions: 0,
    averageSemanticChunkMs: 0
});

class LocalSemanticPool implements SemanticChunkPool {
    public calls = 0;
    public disposed = false;
    public readonly stats = EMPTY_POOL_STATS;

    public generateSemanticChunk(options: Parameters<SemanticChunkPool["generateSemanticChunk"]>[0]) {
        this.calls += 1;
        return Promise.resolve(generateBaseSemanticChunk({
            descriptor: options.descriptor,
            chunkX: options.key.chunkX,
            chunkY: options.key.chunkY
        }));
    }

    public dispose(): void {
        this.disposed = true;
    }
}

class DeferredSemanticPool implements SemanticChunkPool {
    public calls = 0;
    public aborted = 0;
    public disposed = false;
    public readonly stats = EMPTY_POOL_STATS;
    private pending: {
        options: Parameters<SemanticChunkPool["generateSemanticChunk"]>[0];
        resolve: (chunk: ReturnType<typeof generateBaseSemanticChunk>) => void;
        reject: (error: Error) => void;
    } | undefined;

    public generateSemanticChunk(
        options: Parameters<SemanticChunkPool["generateSemanticChunk"]>[0],
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ) {
        this.calls += 1;
        return new Promise<ReturnType<typeof generateBaseSemanticChunk>>((resolve, reject) => {
            this.pending = { options, resolve, reject };
            request.signal?.addEventListener("abort", () => {
                this.aborted += 1;
                const error = new Error("deferred generation aborted");
                error.name = "AbortError";
                reject(error);
            }, { once: true });
        });
    }

    public complete(): void {
        if (!this.pending) throw new Error("no deferred semantic request");
        const { options, resolve } = this.pending;
        this.pending = undefined;
        resolve(generateBaseSemanticChunk({
            descriptor: options.descriptor,
            chunkX: options.key.chunkX,
            chunkY: options.key.chunkY
        }));
    }

    public dispose(): void {
        this.disposed = true;
    }
}

function staticMap(width = 35, height = 34): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) data[x][y] = { type: Land.land };
    }
    data[0][0] = { type: Land.sea };
    data[1][0] = { type: Land.coastal };
    data[2][0] = { type: Land.mountain };
    data[3][0] = { type: Land.land, modifiers: ["hill"] };
    data[4][0] = { type: Land.land, modifiers: ["wood"], treeModel: "Assets/models/palm" };
    data[5][0] = { type: Land.land, modifiers: ["lake"] };
    return { data, w: width, h: height };
}

function staticDescriptor(width = 35, height = 34) {
    return createWorldDescriptorV2({
        ...CORE_WORLD_SEMANTICS_V2,
        sourceKind: "static",
        sourceContentHash: `sha256:${"b".repeat(64)}`,
        width,
        height
    });
}

describe("v2 semantic world sources", () => {
    test("eagerly converts a static MapInfo into immutable-layout partial chunks", async () => {
        const map = staticMap();
        const source = new StaticSemanticWorldSource(map, staticDescriptor());
        assertSemanticWorldSource(source);
        expect(source.stats).toMatchObject({ residentChunks: 4, leasedChunks: 0, workers: 0 });
        const first = await source.loadChunk(0, 0);
        expect(source.stats.leasedChunks).toBe(1);
        expect(getBaseSemanticTile(first, 0, 0).substrateClass).toBe(CoreSubstrateClass.Sand);
        expect(getBaseSemanticTile(first, 0, 0).macroHeight).toBeLessThan(source.descriptor.seaLevel);
        expect(getBaseSemanticTile(first, 2, 0)).toMatchObject({
            substrateClass: CoreSubstrateClass.Rock,
            vegetationProfile: CoreVegetationProfile.Alpine
        });
        expect(getBaseSemanticTile(first, 4, 0)).toMatchObject({
            vegetationDensity: 140,
            vegetationProfile: CoreVegetationProfile.Tropical
        });
        expect(getBaseSemanticTile(first, 5, 0).macroHeight).toBeGreaterThan(source.descriptor.seaLevel);

        map.data[0][0] = { type: Land.mountain };
        expect(getBaseSemanticTile(first, 0, 0).substrateClass).toBe(CoreSubstrateClass.Sand);
        source.releaseChunk(first);
        expect(source.stats.leasedChunks).toBe(0);

        const partial = await source.loadChunk(1, 1);
        expect(partial.validBounds).toEqual({ minX: 0, minY: 0, maxXExclusive: 3, maxYExclusive: 2 });
        expect(partial.macroHeight[semanticTileIndex(3, 2)]).toBe(0);
        source.releaseChunk(partial);
        source.dispose();
        await expect(source.loadChunk(0, 0)).rejects.toThrow(/disposed/);
    });

    test("rejects missing tiles and unknown legacy modifiers at the static boundary", () => {
        const missing = staticMap(32, 32);
        delete missing.data[7][9];
        expect(() => new StaticSemanticWorldSource(missing, staticDescriptor(32, 32))).toThrow(/missing tile 7,9/);
        const unknown = staticMap(32, 32);
        unknown.data[7][9] = { type: Land.land, modifiers: ["mystery"] } as TileInfo;
        expect(() => new StaticSemanticWorldSource(unknown, staticDescriptor(32, 32)))
            .toThrow(/invalid or duplicate modifiers/);
    });

    test("deduplicates concurrent infinite requests and keeps cache leases balanced", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("source-dedupe");
        const pool = new DeferredSemanticPool();
        expect(() => new InfiniteSemanticWorldSource({ descriptor, workerPool: pool, workerUrl: "ambiguous" }))
            .toThrow(/cannot be combined/);
        const source = new InfiniteSemanticWorldSource({ descriptor, workerPool: pool });
        const first = source.loadChunk(-3, 2);
        const second = source.loadChunk(-3, 2);
        expect(pool.calls).toBe(1);
        expect(source.stats.inFlightChunks).toBe(1);
        pool.complete();
        const [firstChunk, secondChunk] = await Promise.all([first, second]);
        expect(firstChunk).toBe(secondChunk);
        expect(source.stats).toMatchObject({ residentChunks: 1, leasedChunks: 1 });
        source.releaseChunk(firstChunk);
        source.releaseChunk(secondChunk);
        const cached = await source.loadChunk(-3, 2);
        expect(pool.calls).toBe(1);
        expect(source.stats.cacheHits).toBe(1);
        source.releaseChunk(cached);
        source.dispose();
        expect(pool.disposed).toBe(false);
    });

    test("only aborts shared generation after its final waiter leaves", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("source-abort");
        const pool = new DeferredSemanticPool();
        const source = new InfiniteSemanticWorldSource({ descriptor, workerPool: pool });
        const firstController = new AbortController();
        const secondController = new AbortController();
        const first = source.loadChunk(1, 1, { signal: firstController.signal });
        const second = source.loadChunk(1, 1, { signal: secondController.signal });
        firstController.abort();
        await expect(first).rejects.toMatchObject({ name: "AbortError" });
        expect(pool.aborted).toBe(0);
        pool.complete();
        const chunk = await second;
        source.releaseChunk(chunk);

        const thirdController = new AbortController();
        const third = source.loadChunk(2, 2, { signal: thirdController.signal });
        thirdController.abort();
        await expect(third).rejects.toMatchObject({ name: "AbortError" });
        await Promise.resolve();
        expect(pool.aborted).toBe(1);
        source.dispose();
    });

    test("evicts only unleased chunks under the byte budget", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("source-budget");
        const pool = new LocalSemanticPool();
        const source = new InfiniteSemanticWorldSource({
            descriptor,
            workerPool: pool,
            cacheMaxBytes: BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES
        });
        const first = await source.loadChunk(0, 0);
        const second = await source.loadChunk(1, 0);
        expect(source.stats.residentChunks).toBe(2);
        source.releaseChunk(first);
        expect(source.stats.residentChunks).toBe(1);
        expect(source.hasChunk(1, 0)).toBe(true);
        source.releaseChunk(second);
        expect(source.stats.residentChunks).toBe(1);
        source.dispose();
    });

    test("canonicalizes toroidal keys but refuses non-canonical load requests", async () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("source-torus", 64, 96);
        const pool = new LocalSemanticPool();
        const source = new ToroidalSemanticWorldSource({ descriptor, workerPool: pool });
        expect(source.resolveChunk(-1, -1)).toEqual({ chunkX: 1, chunkY: 2 });
        expect(source.chunkDistance(0, 0, 1, 2)).toBe(Math.SQRT2);
        await expect(source.loadChunk(-1, -1)).rejects.toThrow(/canonical/);
        const chunk = await source.loadChunk(1, 2);
        expect(chunk.key).toEqual({ chunkX: 1, chunkY: 2 });
        source.releaseChunk(chunk);
        source.dispose();
    });
});
