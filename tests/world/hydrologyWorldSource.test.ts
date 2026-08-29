import { describe, expect, test } from "vitest";

import {
    HydrologyRegion,
    HydrologyRegionKey,
    createHydrologyRegion
} from "../../src/world/HydrologyRegion";
import {
    HydrologyRegionPool,
    ProceduralHydrologyWorldDescriptorV2,
    ProceduralHydrologyWorldSource,
    assertHydrologyWorldSource,
    hydrologyRegionResidentBytes
} from "../../src/world/HydrologyWorldSource";
import {
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import { SurfaceTaskRequestOptions, SurfaceWorkerPoolStats } from "../../src/world/SurfaceWorkerPool";
import { serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

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
    completedSemanticChunks: 0,
    completedHydrologyRegions: 0,
    averageSemanticChunkMs: 0,
    averageHydrologyRegionMs: 0
});

function emptyRegion(
    descriptor: ProceduralHydrologyWorldDescriptorV2,
    key: Readonly<HydrologyRegionKey>
): HydrologyRegion {
    const validWidth = descriptor.sourceKind === "procedural-toroidal"
        ? Math.min(128, descriptor.width - key.regionX * 128) : 128;
    const validHeight = descriptor.sourceKind === "procedural-toroidal"
        ? Math.min(128, descriptor.height - key.regionY * 128) : 128;
    return createHydrologyRegion({
        worldIdentity: serializeWorldDescriptorV2(descriptor),
        topology: descriptor.topology,
        key,
        revision: 0,
        validBounds: { minX: 0, minY: 0, maxXExclusive: validWidth, maxYExclusive: validHeight },
        boundaryPorts: [],
        rivers: [],
        lakes: [],
        mouths: [],
        bodies: []
    });
}

interface DeferredRequest {
    readonly descriptor: ProceduralHydrologyWorldDescriptorV2;
    readonly key: HydrologyRegionKey;
    readonly request?: Readonly<SurfaceTaskRequestOptions>;
    readonly resolve: (region: HydrologyRegion) => void;
    readonly reject: (error: Error) => void;
}

class DeferredHydrologyPool implements HydrologyRegionPool {
    public readonly requests: DeferredRequest[] = [];
    public readonly stats = EMPTY_POOL_STATS;
    public disposed = false;

    public generateHydrologyRegion(
        options: { readonly descriptor: ProceduralHydrologyWorldDescriptorV2; readonly key: HydrologyRegionKey },
        request?: Readonly<SurfaceTaskRequestOptions>
    ): Promise<HydrologyRegion> {
        return new Promise((resolve, reject) => this.requests.push({ ...options, request, resolve, reject }));
    }

    public complete(index = 0): void {
        const request = this.requests[index];
        request.resolve(emptyRegion(request.descriptor, request.key));
    }

    public dispose(): void {
        this.disposed = true;
    }
}

class ImmediateHydrologyPool implements HydrologyRegionPool {
    public readonly stats = EMPTY_POOL_STATS;

    public generateHydrologyRegion(
        options: { readonly descriptor: ProceduralHydrologyWorldDescriptorV2; readonly key: HydrologyRegionKey }
    ): Promise<HydrologyRegion> {
        return Promise.resolve(emptyRegion(options.descriptor, options.key));
    }

    public dispose(): void {}
}

describe("ProceduralHydrologyWorldSource", () => {
    test("coalesces requests, tracks leases and keeps an external pool alive", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("hydrology-source-coalesce");
        const pool = new DeferredHydrologyPool();
        const source = new ProceduralHydrologyWorldSource({ descriptor, workerPool: pool });
        assertHydrologyWorldSource(source);
        const first = source.loadRegion(2, -1);
        const second = source.loadRegion(2, -1);
        expect(pool.requests).toHaveLength(1);
        pool.complete();
        const [firstRegion, secondRegion] = await Promise.all([first, second]);
        expect(firstRegion).toBe(secondRegion);
        expect(source.stats).toMatchObject({ residentRegions: 1, leasedRegions: 1, inFlightRegions: 0 });
        source.releaseRegion(firstRegion);
        source.releaseRegion(secondRegion);
        expect(source.stats.leasedRegions).toBe(0);
        source.dispose();
        expect(pool.disposed).toBe(false);
    });

    test("only aborts shared generation after the final waiter cancels", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("hydrology-source-abort");
        const pool = new DeferredHydrologyPool();
        const source = new ProceduralHydrologyWorldSource({ descriptor, workerPool: pool });
        const firstController = new AbortController();
        const secondController = new AbortController();
        const first = source.loadRegion(0, 0, { signal: firstController.signal });
        const second = source.loadRegion(0, 0, { signal: secondController.signal });
        firstController.abort();
        await expect(first).rejects.toMatchObject({ name: "AbortError" });
        expect(pool.requests[0].request?.signal?.aborted).toBe(false);
        secondController.abort();
        await expect(second).rejects.toMatchObject({ name: "AbortError" });
        expect(pool.requests[0].request?.signal?.aborted).toBe(true);
        pool.complete();
        await Promise.resolve();
        source.dispose();
    });

    test("uses a non-zero resident estimate so empty regions obey LRU byte bounds", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("hydrology-source-budget");
        const emptyRegionBytes = hydrologyRegionResidentBytes(emptyRegion(descriptor, { regionX: 0, regionY: 0 }));
        const source = new ProceduralHydrologyWorldSource({
            descriptor,
            workerPool: new ImmediateHydrologyPool(),
            cacheMaxBytes: emptyRegionBytes
        });
        const first = await source.loadRegion(0, 0);
        source.releaseRegion(first);
        const second = await source.loadRegion(1, 0);
        expect(source.hasRegion(0, 0)).toBe(false);
        expect(source.hasRegion(1, 0)).toBe(true);
        expect(source.stats.residentBytes).toBe(emptyRegionBytes);
        source.releaseRegion(second);
        source.dispose();
    });

    test("canonicalizes toroidal keys and validates partial edge bounds", async () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("hydrology-source-torus", 160, 96);
        const source = new ProceduralHydrologyWorldSource({
            descriptor,
            workerPool: new ImmediateHydrologyPool()
        });
        expect(source.resolveRegion(-1, -1)).toEqual({ regionX: 1, regionY: 0 });
        await expect(source.loadRegion(-1, 0)).rejects.toThrow(/canonical/);
        const region = await source.loadRegion(1, 0);
        expect(region.validBounds).toEqual({ minX: 0, minY: 0, maxXExclusive: 32, maxYExclusive: 96 });
        source.releaseRegion(region);
        source.dispose();
    });
});
