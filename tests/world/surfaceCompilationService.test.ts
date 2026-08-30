import { describe, expect, test } from "vitest";

import {
    compileSurfaceChunk,
    createTransferableEffectiveWindow,
    createWorldDescriptorV2,
    effectiveSurfaceWindowTransferables,
    EffectiveWorldView,
    generateBaseSemanticChunk,
    generateWorldChunk,
    HydrologyRegion,
    OCEAN_BODY_ID,
    SurfaceCompilationService,
    SurfaceCompilationWorker,
    SurfaceWindowBufferPool,
    surfaceHydrologyRegionRequirements,
    surfaceSemanticChunkRequirements,
    TransferableEffectiveWindow,
    WorldGeneratorPool,
    WORLD_WORKER_PROTOCOL_VERSION
} from "../../src/index";
import type { EffectiveWorldSnapshot } from "../../src/world/semantic/EffectiveWorldView";
import type { RenderChunkKey } from "../../src/world/semantic/SurfaceDependency";
import type {
    SurfaceCompilationWorkerRequestOptions
} from "../../src/world/semantic/SurfaceCompilationService";
import type { SurfaceWorkerCompilation } from "../../src/world/WorldGeneratorClient";
import type { WorldChunkGenerationOptions } from "../../src/world/generateWorldChunk";

const TEST_COMPILED_SURFACE_CACHE_BUDGET = 512 * 1024;

function emptyHydrologyRegion(
    key: Readonly<{ regionX: number; regionY: number }>
): HydrologyRegion {
    return {
        key: Object.freeze({ ...key }),
        revision: 0,
        validBounds: Object.freeze({ minX: 0, minY: 0, maxXExclusive: 64, maxYExclusive: 32 }),
        boundaryPorts: Object.freeze([]),
        rivers: Object.freeze([]),
        lakes: Object.freeze([]),
        mouths: Object.freeze([]),
        bodies: Object.freeze([Object.freeze({
            bodyId: OCEAN_BODY_ID,
            kind: "ocean" as const,
            profileIndex: 0
        })])
    };
}

function fixture() {
    const descriptor = createWorldDescriptorV2({
        seed: "surface-compilation-service",
        topology: { kind: "toroidal", width: 64, height: 32 }
    });
    const view = new EffectiveWorldView(descriptor);
    const snapshotForKeys = (keys: readonly RenderChunkKey[]): EffectiveWorldSnapshot => {
        const semanticKeys = new Map<string, Readonly<{ chunkX: number; chunkY: number }>>();
        const hydrologyKeys = new Map<string, Readonly<{ regionX: number; regionY: number }>>();
        for (const key of keys) {
            for (const chunkKey of surfaceSemanticChunkRequirements(descriptor, key)) {
                semanticKeys.set(`${chunkKey.chunkX},${chunkKey.chunkY}`, chunkKey);
            }
            for (const regionKey of surfaceHydrologyRegionRequirements(descriptor, key)) {
                hydrologyKeys.set(`${regionKey.regionX},${regionKey.regionY}`, regionKey);
            }
        }
        return view.capture({
            semanticChunks: [...semanticKeys.values()].map(key => generateBaseSemanticChunk({ descriptor, key })),
            hydrologyRegions: [...hydrologyKeys.values()].map(emptyHydrologyRegion)
        });
    };
    return {
        descriptor,
        snapshotFor: (key: RenderChunkKey) => snapshotForKeys([key]),
        snapshotForKeys
    };
}

class ImmediateSurfaceWorker implements SurfaceCompilationWorker {
    public calls = 0;

    public async compileSurfaceChunk(
        effectiveWindow: TransferableEffectiveWindow
    ): Promise<SurfaceWorkerCompilation> {
        this.calls += 1;
        return {
            chunk: compileSurfaceChunk(effectiveWindow),
            reclaimedWindowBuffers: effectiveSurfaceWindowTransferables(effectiveWindow)
        };
    }
}

class ImmediateMixedWorker extends ImmediateSurfaceWorker {
    public disposed = false;
    public readonly isDisposed = false;

    public generateChunk(options: WorldChunkGenerationOptions) {
        return Promise.resolve(generateWorldChunk(options));
    }

    public dispose(): void {
        this.disposed = true;
    }
}

interface DeferredRequest {
    readonly window: TransferableEffectiveWindow;
    readonly options: SurfaceCompilationWorkerRequestOptions | undefined;
    resolve(value: SurfaceWorkerCompilation): void;
    reject(error: Error): void;
}

class DeferredSurfaceWorker implements SurfaceCompilationWorker {
    public readonly requests: DeferredRequest[] = [];

    public compileSurfaceChunk(
        window: TransferableEffectiveWindow,
        options?: SurfaceCompilationWorkerRequestOptions
    ): Promise<SurfaceWorkerCompilation> {
        return new Promise((resolve, reject) => {
            const request = { window, options, resolve, reject };
            this.requests.push(request);
            if (options?.signal?.aborted) {
                reject(new DOMException("aborted", "AbortError"));
                return;
            }
            options?.signal?.addEventListener("abort", () => {
                reject(new DOMException("aborted", "AbortError"));
            }, { once: true });
        });
    }

    public complete(index: number): void {
        const request = this.requests[index];
        request.resolve({
            chunk: compileSurfaceChunk(request.window),
            reclaimedWindowBuffers: effectiveSurfaceWindowTransferables(request.window)
        });
    }
}

describe("surface compilation service", () => {
    test("reuses exact-size effective-window buffers under an explicit retained budget", () => {
        const pool = new SurfaceWindowBufferPool(16);
        const first = pool.acquire(8);
        pool.release([first]);
        expect(pool.acquire(8)).toBe(first);
        pool.release([first]);
        const tooLargeToRetain = pool.acquire(16);
        pool.release([tooLargeToRetain]);
        expect(pool.stats).toMatchObject({
            retainedBuffers: 1,
            retainedBytes: 8,
            allocations: 2,
            reuses: 1,
            discardedBuffers: 1
        });
        expect(() => pool.release([first])).toThrow(/invalid or duplicate/);
        pool.dispose();
        expect(pool.stats).toMatchObject({ state: "disposed", retainedBytes: 0 });
        expect(() => pool.acquire(8)).toThrow(/disposed/);
    });

    test("serves exact dependency cache hits through fresh request-token leases", async () => {
        const { descriptor, snapshotFor } = fixture();
        const worker = new ImmediateSurfaceWorker();
        const service = new SurfaceCompilationService({
            descriptor,
            sessionEpoch: 1,
            worker,
            cpuCacheBudgetBytes: TEST_COMPILED_SURFACE_CACHE_BUDGET,
            retainedWindowBufferBudgetBytes: 64 * 1024
        });
        const key = { chunkX: 0, chunkY: 0 };
        const snapshot = snapshotFor(key);
        const first = await service.request(snapshot, key).result;
        expect(first.status).toBe("ready");
        const second = await service.request(snapshot, key).result;
        expect(second.status).toBe("ready");
        if (first.status !== "ready" || second.status !== "ready") throw new Error("unreachable");
        expect(worker.calls).toBe(1);
        expect(first.lease.isCurrent()).toBe(false);
        expect(second.lease.isCurrent()).toBe(true);
        expect(second.lease.chunk).toBe(first.lease.chunk);
        expect(service.stats).toMatchObject({
            activeLeases: 2,
            cacheEntries: 1,
            cacheBytes: second.lease.chunk.byteLength,
            cacheHits: 1,
            cacheMisses: 1,
            workerCompilations: 1,
            acceptedResults: 2
        });
        expect(first.lease.release()).toBe(true);
        expect(second.lease.release()).toBe(true);
        expect(second.lease.release()).toBe(false);
        expect(service.stats).toMatchObject({ activeRequests: 0, activeLeases: 0 });
        service.dispose();
    });

    test("schedules surface compilation as an observable bounded worker-pool lane", async () => {
        const { snapshotFor } = fixture();
        const client = new ImmediateMixedWorker();
        const pool = new WorldGeneratorPool("unused", {
            size: 1,
            clientFactory: () => client
        });
        const key = { chunkX: 0, chunkY: 0 };
        const result = await pool.compileSurfaceChunk(
            createTransferableEffectiveWindow(snapshotFor(key), key)
        );
        await Promise.resolve();
        expect(result.chunk.key).toEqual(key);
        expect(pool.stats).toMatchObject({
            busyWorkers: 0,
            queuedSurfaceChunks: 0,
            busySurfaceChunkWorkers: 0,
            completed: 1
        });
        expect(pool.stats.averageSurfaceChunkMs).toBeGreaterThanOrEqual(0);
        pool.dispose();
        expect(client.disposed).toBe(true);
    });

    test("derives independent exact requests from one shared batch snapshot", async () => {
        const { descriptor, snapshotForKeys } = fixture();
        const worker = new ImmediateSurfaceWorker();
        const service = new SurfaceCompilationService({
            descriptor,
            sessionEpoch: 5,
            worker,
            cpuCacheBudgetBytes: TEST_COMPILED_SURFACE_CACHE_BUDGET,
            retainedWindowBufferBudgetBytes: 64 * 1024
        });
        const keys = [{ chunkX: 0, chunkY: 0 }, { chunkX: 1, chunkY: 0 }];
        const snapshot = snapshotForKeys(keys);
        const requests = service.requestBatch(snapshot, keys);
        const outcomes = await Promise.all(requests.map(request => request.result));
        expect(outcomes.map(outcome => outcome.status)).toEqual(["ready", "ready"]);
        expect(worker.calls).toBe(2);
        expect(requests[0].requestToken.renderChunkGeneration)
            .not.toBe(requests[1].requestToken.renderChunkGeneration);
        for (const outcome of outcomes) if (outcome.status === "ready") outcome.lease.release();
        expect(() => service.requestBatch(snapshot, [keys[0], keys[0]])).toThrow(/duplicate/);
        service.dispose();
    });

    test("never evicts a leased compiled field to hide CPU cache exhaustion", async () => {
        const { descriptor, snapshotFor } = fixture();
        const worker = new ImmediateSurfaceWorker();
        const firstKey = { chunkX: 0, chunkY: 0 };
        const secondKey = { chunkX: 1, chunkY: 0 };
        const firstSnapshot = snapshotFor(firstKey);
        const secondSnapshot = snapshotFor(secondKey);
        const firstBytes = compileSurfaceChunk(
            createTransferableEffectiveWindow(firstSnapshot, firstKey)
        ).byteLength;
        const secondBytes = compileSurfaceChunk(
            createTransferableEffectiveWindow(secondSnapshot, secondKey)
        ).byteLength;
        const service = new SurfaceCompilationService({
            descriptor,
            sessionEpoch: 2,
            worker,
            cpuCacheBudgetBytes: Math.max(firstBytes, secondBytes),
            retainedWindowBufferBudgetBytes: 64 * 1024
        });
        const first = await service.request(firstSnapshot, firstKey).result;
        if (first.status !== "ready") throw new Error("unreachable");
        await expect(service.request(secondSnapshot, secondKey).result)
            .rejects.toThrow(/budget is exhausted by active leases/);
        expect(first.lease.release()).toBe(true);
        const second = await service.request(secondSnapshot, secondKey).result;
        expect(second.status).toBe("ready");
        expect(service.stats).toMatchObject({
            cacheEntries: 1,
            cacheBytes: secondBytes,
            cacheEvictions: 1,
            workerCompilations: 3
        });
        if (second.status === "ready") second.lease.release();
        service.dispose();
    });

    test("coalesces identical work while rejecting the superseded token as stale", async () => {
        const { descriptor, snapshotFor } = fixture();
        const worker = new DeferredSurfaceWorker();
        const service = new SurfaceCompilationService({
            descriptor,
            sessionEpoch: 3,
            worker,
            cpuCacheBudgetBytes: TEST_COMPILED_SURFACE_CACHE_BUDGET,
            retainedWindowBufferBudgetBytes: 64 * 1024
        });
        const key = { chunkX: 0, chunkY: 0 };
        const snapshot = snapshotFor(key);
        const first = service.request(snapshot, key);
        const second = service.request(snapshot, key);
        await Promise.resolve();
        expect(worker.requests).toHaveLength(1);
        worker.complete(0);
        await expect(first.result).resolves.toMatchObject({ status: "stale" });
        const accepted = await second.result;
        expect(accepted.status).toBe("ready");
        expect(second.requestToken.renderChunkGeneration)
            .toBeGreaterThan(first.requestToken.renderChunkGeneration);
        expect(service.stats).toMatchObject({
            coalescedRequests: 1,
            workerCompilations: 1,
            staleResults: 1,
            acceptedResults: 1
        });
        if (accepted.status === "ready") accepted.lease.release();
        service.dispose();
    });

    test("cancels an unowned job and cannot publish its late result", async () => {
        const { descriptor, snapshotFor } = fixture();
        const worker = new DeferredSurfaceWorker();
        const service = new SurfaceCompilationService({
            descriptor,
            sessionEpoch: 4,
            worker,
            cpuCacheBudgetBytes: TEST_COMPILED_SURFACE_CACHE_BUDGET,
            retainedWindowBufferBudgetBytes: 64 * 1024
        });
        const key = { chunkX: 0, chunkY: 0 };
        const request = service.request(snapshotFor(key), key);
        expect(request.cancel()).toBe(true);
        await expect(request.result).resolves.toMatchObject({ status: "stale" });
        expect(service.stats).toMatchObject({
            activeRequests: 0,
            inFlightCompilations: 0,
            cancelledRequests: 1,
            acceptedResults: 0,
            staleResults: 1
        });
        expect(WORLD_WORKER_PROTOCOL_VERSION).toBe(5);
        service.dispose();
    });
});
