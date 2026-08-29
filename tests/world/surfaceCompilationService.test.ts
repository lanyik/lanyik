import { describe, expect, test, vi } from "vitest";

import { BaseSemanticChunk } from "../../src/world/BaseSemanticChunk";
import { CompiledSurfaceChunk } from "../../src/world/CompiledSurfaceChunk";
import { EffectiveWorldView } from "../../src/world/EffectiveWorldView";
import { HydrologyRegion, createHydrologyRegion } from "../../src/world/HydrologyRegion";
import {
    HydrologyWorldSource,
    HydrologyWorldSourceStats
} from "../../src/world/HydrologyWorldSource";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import {
    SemanticWorldSource,
    SemanticWorldSourceStats
} from "../../src/world/SemanticWorldSource";
import { SEMANTIC_DELTA_FIELD_HEIGHT } from "../../src/world/SparseSemanticDelta";
import {
    SurfaceRequestToken,
    createSurfaceRequestToken
} from "../../src/world/SurfaceDependencyKey";
import {
    ResidentSurfaceLease,
    StaleSurfaceCompilationError,
    SurfaceCompilationPool,
    SurfaceCompilationService,
    SurfaceLeaseNotCurrentError
} from "../../src/world/SurfaceCompilationService";
import { SurfaceCompileResult } from "../../src/world/SurfaceWorkerClient";
import { BaseHydrologyFeatureIndex, MemorySurfaceDeltaStore } from "../../src/world/SurfaceDeltaStore";
import { TransferableEffectiveWindow } from "../../src/world/TransferableEffectiveWindow";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { compileSurfaceChunk } from "../../src/world/compileSurfaceChunk";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";

const SEMANTIC_STATS: Readonly<SemanticWorldSourceStats> = Object.freeze({
    residentChunks: 0,
    residentBytes: 0,
    leasedChunks: 0,
    inFlightChunks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

const HYDROLOGY_STATS: Readonly<HydrologyWorldSourceStats> = Object.freeze({
    residentRegions: 0,
    residentBytes: 0,
    leasedRegions: 0,
    inFlightRegions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

class SemanticSourceStub implements SemanticWorldSource {
    public readonly worldIdentity: string;
    public readonly bounds = undefined;
    public readonly stats = SEMANTIC_STATS;
    private readonly chunks = new Map<string, BaseSemanticChunk>();
    private readonly leases = new Map<BaseSemanticChunk, number>();

    constructor(public readonly descriptor: WorldDescriptorV2) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveChunk(chunkX: number, chunkY: number) {
        return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY)
            ? { chunkX, chunkY } : undefined;
    }

    public chunkDistance(): number { return 0; }

    public loadChunk(chunkX: number, chunkY: number): Promise<BaseSemanticChunk> {
        const key = `${chunkX}:${chunkY}`;
        let chunk = this.chunks.get(key);
        if (!chunk) {
            if (this.descriptor.sourceKind !== "procedural-infinite") {
                throw new Error("surface compilation test requires an infinite descriptor");
            }
            chunk = generateBaseSemanticChunk({ descriptor: this.descriptor, chunkX, chunkY });
            this.chunks.set(key, chunk);
        }
        this.leases.set(chunk, (this.leases.get(chunk) ?? 0) + 1);
        return Promise.resolve(chunk);
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        const count = this.leases.get(chunk as BaseSemanticChunk) ?? 0;
        if (count <= 0) throw new Error("semantic test lease mismatch");
        this.leases.set(chunk as BaseSemanticChunk, count - 1);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(`${chunkX}:${chunkY}`);
    }

    public dispose(): void {}
}

class HydrologySourceStub implements HydrologyWorldSource {
    public readonly worldIdentity: string;
    public readonly stats = HYDROLOGY_STATS;
    private readonly regions = new Map<string, HydrologyRegion>();
    private readonly leases = new Map<HydrologyRegion, number>();

    constructor(public readonly descriptor: WorldDescriptorV2) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveRegion(regionX: number, regionY: number) {
        return Number.isSafeInteger(regionX) && Number.isSafeInteger(regionY)
            ? { regionX, regionY } : undefined;
    }

    public regionDistance(): number { return 0; }

    public loadRegion(regionX: number, regionY: number): Promise<HydrologyRegion> {
        const key = `${regionX}:${regionY}`;
        let region = this.regions.get(key);
        if (!region) {
            region = createHydrologyRegion({
                worldIdentity: this.worldIdentity,
                topology: "infinite",
                key: { regionX, regionY },
                revision: 0,
                validBounds: { minX: 0, minY: 0, maxXExclusive: 128, maxYExclusive: 128 },
                boundaryPorts: [],
                rivers: [],
                lakes: [],
                mouths: [],
                bodies: []
            });
            this.regions.set(key, region);
        }
        this.leases.set(region, (this.leases.get(region) ?? 0) + 1);
        return Promise.resolve(region);
    }

    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        const count = this.leases.get(region as HydrologyRegion) ?? 0;
        if (count <= 0) throw new Error("hydrology test lease mismatch");
        this.leases.set(region as HydrologyRegion, count - 1);
    }

    public hasRegion(regionX: number, regionY: number): boolean {
        return this.regions.has(`${regionX}:${regionY}`);
    }

    public dispose(): void {}
}

class ImmediatePool implements SurfaceCompilationPool {
    public calls = 0;

    public compileSurfaceChunk(options: Readonly<{
        requestToken: SurfaceRequestToken;
        effectiveWindow: TransferableEffectiveWindow;
    }>): Promise<SurfaceCompileResult> {
        this.calls += 1;
        return Promise.resolve({
            requestToken: options.requestToken,
            chunk: compileSurfaceChunk(options.effectiveWindow)
        });
    }
}

interface DeferredCall {
    readonly requestToken: SurfaceRequestToken;
    readonly effectiveWindow: TransferableEffectiveWindow;
    resolve(result: SurfaceCompileResult): void;
}

class DeferredPool implements SurfaceCompilationPool {
    public readonly calls: DeferredCall[] = [];

    public compileSurfaceChunk(options: Readonly<{
        requestToken: SurfaceRequestToken;
        effectiveWindow: TransferableEffectiveWindow;
    }>): Promise<SurfaceCompileResult> {
        return new Promise(resolve => this.calls.push({ ...options, resolve }));
    }

    public resolve(index: number, requestToken = this.calls[index].requestToken): CompiledSurfaceChunk {
        const call = this.calls[index];
        const chunk = compileSurfaceChunk(call.effectiveWindow);
        call.resolve({ requestToken, chunk });
        return chunk;
    }
}

const EMPTY_BASE_INDEX: BaseHydrologyFeatureIndex = {
    resolveFeature: () => undefined,
    referencesTo: () => []
};

function createFixture(seed: string, pool: SurfaceCompilationPool, cacheMaxBytes = 32 * 1024 * 1024) {
    const descriptor = createCoreInfiniteWorldDescriptorV2(seed);
    const semanticSource = new SemanticSourceStub(descriptor);
    const hydrologySource = new HydrologySourceStub(descriptor);
    const store = new MemorySurfaceDeltaStore(descriptor, EMPTY_BASE_INDEX);
    const view = new EffectiveWorldView({
        semanticSource,
        hydrologySource,
        deltaSnapshot: store.snapshot()
    });
    const service = new SurfaceCompilationService({
        worldIdentity: view.worldIdentity,
        sessionEpoch: 7,
        cacheMaxBytes,
        pool
    });
    return { view, service, store, semanticSource, hydrologySource };
}

const REQUEST = Object.freeze({
    key: Object.freeze({ chunkX: 0, chunkY: 0 }),
    metrics: Object.freeze({ hexSize: 1, heightScale: 10 })
});

describe("SurfaceCompilationService", () => {
    test("reuses only an exact dependency key and issues a current-token lease", async () => {
        const pool = new ImmediatePool();
        const { view, service } = createFixture("surface-service-cache", pool);
        const first = await service.requestSurface({ view, ...REQUEST });
        expect(pool.calls).toBe(1);
        expect(first.requestToken).toEqual(createSurfaceRequestToken(7, 1));
        expect(service.isCurrent(first)).toBe(true);

        const second = await service.requestSurface({ view, ...REQUEST });
        expect(pool.calls).toBe(1);
        expect(second.chunk).toBe(first.chunk);
        expect(second.requestToken).toEqual(createSurfaceRequestToken(7, 2));
        expect(service.isCurrent(first)).toBe(false);
        expect(service.assertCurrent(second)).toBe(second.chunk);
        expect(() => service.assertCurrent(first)).toThrow(SurfaceLeaseNotCurrentError);
        expect(service.stats).toMatchObject({
            residentChunks: 1,
            activeLeases: 2,
            cacheHits: 1,
            cacheMisses: 1,
            completedCompilations: 1
        });

        first.release();
        first.release();
        second.release();
        expect(service.stats.activeLeases).toBe(0);
        service.dispose();
        view.dispose();
    });

    test("retains independent holders of the exact current revision without replacing its token", async () => {
        const pool = new ImmediatePool();
        const { view, service } = createFixture("surface-service-retain", pool);
        const renderLease = await service.requestSurface({ view, ...REQUEST });
        const queryLease = service.retainCurrentSurface(REQUEST.key, view.effectiveRevision);
        expect(queryLease).toBeDefined();
        expect(queryLease!.requestToken).toEqual(renderLease.requestToken);
        expect(queryLease!.chunk).toBe(renderLease.chunk);
        expect(service.isCurrent(renderLease)).toBe(true);
        expect(service.isCurrent(queryLease!)).toBe(true);
        expect(service.retainCurrentSurface(REQUEST.key, view.effectiveRevision + 1)).toBeUndefined();

        queryLease!.release();
        expect(service.isCurrent(renderLease)).toBe(true);
        renderLease.release();
        expect(service.stats.activeLeases).toBe(0);
        service.dispose();
        view.dispose();
    });

    test("rejects a superseded Worker result before it can enter the cache", async () => {
        const pool = new DeferredPool();
        const { view, service } = createFixture("surface-service-stale", pool);
        const firstPending = service.requestSurface({ view, ...REQUEST });
        await vi.waitFor(() => expect(pool.calls).toHaveLength(1));
        const firstOutcome = firstPending.then(
            () => undefined,
            reason => reason
        );

        const secondPending = service.requestSurface({ view, ...REQUEST });
        await vi.waitFor(() => expect(pool.calls).toHaveLength(2));
        pool.resolve(0);
        expect(await firstOutcome).toBeInstanceOf(StaleSurfaceCompilationError);
        expect(service.stats.residentChunks).toBe(0);

        pool.resolve(1);
        const second = await secondPending;
        expect(service.isCurrent(second)).toBe(true);
        expect(service.stats).toMatchObject({
            completedCompilations: 1,
            staleResults: 1,
            cacheMisses: 2
        });
        second.release();
        service.dispose();
        view.dispose();
    });

    test("misses the cache when a newer immutable view changes an exact dependency", async () => {
        const pool = new ImmediatePool();
        const fixture = createFixture("surface-service-edit", pool);
        const first = await fixture.service.requestSurface({ view: fixture.view, ...REQUEST });
        first.release();
        await fixture.store.commit({
            worldIdentity: fixture.view.worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: {
                    tileIndex: new Uint16Array([0]),
                    fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
                    macroHeight: new Uint16Array([60_000]),
                    substrateClass: new Uint8Array(1),
                    biomeWeights: new Uint8Array(4),
                    vegetationDensity: new Uint8Array(1),
                    vegetationProfile: new Uint8Array(1)
                }
            }],
            hydrologyMutations: []
        });
        const nextView = new EffectiveWorldView({
            semanticSource: fixture.semanticSource,
            hydrologySource: fixture.hydrologySource,
            deltaSnapshot: fixture.store.snapshot()
        });

        const second = await fixture.service.requestSurface({ view: nextView, ...REQUEST });
        expect(pool.calls).toBe(2);
        expect(second.chunk).not.toBe(first.chunk);
        expect(second.chunk.dependencyKey.semantic).not.toEqual(first.chunk.dependencyKey.semantic);
        expect(fixture.service.stats).toMatchObject({ cacheHits: 0, cacheMisses: 2 });

        second.release();
        fixture.service.dispose();
        fixture.view.dispose();
        nextView.dispose();
    });

    test("rejects mismatched response tokens and externally aborted requests", async () => {
        const pool = new DeferredPool();
        const { view, service } = createFixture("surface-service-token", pool);
        const mismatchedPending = service.requestSurface({ view, ...REQUEST });
        await vi.waitFor(() => expect(pool.calls).toHaveLength(1));
        pool.resolve(0, createSurfaceRequestToken(7, 999));
        await expect(mismatchedPending).rejects.toThrow(/mismatched request token/);
        expect(service.stats.residentChunks).toBe(0);

        const controller = new AbortController();
        const abortedPending = service.requestSurface({
            view,
            ...REQUEST,
            task: { signal: controller.signal }
        });
        await vi.waitFor(() => expect(pool.calls).toHaveLength(2));
        controller.abort();
        pool.resolve(1);
        await expect(abortedPending).rejects.toMatchObject({ name: "AbortError" });
        expect(service.stats.residentChunks).toBe(0);
        service.dispose();
        view.dispose();
    });

    test("keeps leased chunks over budget and evicts them immediately after release", async () => {
        const pool = new ImmediatePool();
        const { view, service } = createFixture("surface-service-budget", pool, 1);
        const lease: ResidentSurfaceLease = await service.requestSurface({ view, ...REQUEST });
        expect(service.stats.residentBytes).toBeGreaterThan(1);
        expect(service.stats.residentChunks).toBe(1);

        lease.release();
        expect(service.stats).toMatchObject({
            residentChunks: 0,
            residentBytes: 0,
            activeLeases: 0,
            evictions: 1
        });
        service.dispose();
        view.dispose();
    });
});
