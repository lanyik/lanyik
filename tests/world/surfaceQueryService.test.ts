import { describe, expect, test, vi } from "vitest";

import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BaseSemanticChunk,
    createBaseSemanticChunk,
    semanticCatalogLimits
} from "../../src/world/BaseSemanticChunk";
import { EffectiveWorldView } from "../../src/world/EffectiveWorldView";
import { HydrologyRegion, createHydrologyRegion } from "../../src/world/HydrologyRegion";
import { HydrologyWorldSource, HydrologyWorldSourceStats } from "../../src/world/HydrologyWorldSource";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import { SemanticWorldSource, SemanticWorldSourceStats } from "../../src/world/SemanticWorldSource";
import { SEMANTIC_DELTA_FIELD_HEIGHT } from "../../src/world/SparseSemanticDelta";
import { SurfaceRequestToken } from "../../src/world/SurfaceDependencyKey";
import {
    SurfaceCompilationPool,
    SurfaceCompilationService
} from "../../src/world/SurfaceCompilationService";
import { BaseHydrologyFeatureIndex, MemorySurfaceDeltaStore } from "../../src/world/SurfaceDeltaStore";
import { surfaceToWorld } from "../../src/world/SurfaceLattice";
import { SurfaceQueryService } from "../../src/world/SurfaceQueryService";
import { SurfaceCompileResult } from "../../src/world/SurfaceWorkerClient";
import { TransferableEffectiveWindow } from "../../src/world/TransferableEffectiveWindow";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { compileSurfaceChunk } from "../../src/world/compileSurfaceChunk";

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

class FlatSemanticSource implements SemanticWorldSource {
    public readonly worldIdentity: string;
    public readonly bounds = undefined;
    public readonly stats = SEMANTIC_STATS;
    private readonly chunks = new Map<string, BaseSemanticChunk>();
    private readonly references = new Map<BaseSemanticChunk, number>();

    constructor(public readonly descriptor: WorldDescriptorV2, private readonly height: number) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveChunk(chunkX: number, chunkY: number) {
        return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY)
            ? { chunkX, chunkY } : undefined;
    }

    public chunkDistance(): number { return 0; }

    public loadChunk(chunkX: number, chunkY: number): Promise<BaseSemanticChunk> {
        const identity = `${chunkX}:${chunkY}`;
        let chunk = this.chunks.get(identity);
        if (!chunk) {
            const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
            for (let index = 0; index < BASE_SEMANTIC_CHUNK_TILE_COUNT; index += 1) {
                biomeWeights[index * 4] = 255;
            }
            chunk = createBaseSemanticChunk({
                key: { chunkX, chunkY },
                revision: 0,
                substrateClass: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
                macroHeight: new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT).fill(this.height),
                biomeWeights,
                climate: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2),
                vegetationDensity: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
                vegetationProfile: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT)
            }, semanticCatalogLimits(this.descriptor));
            this.chunks.set(identity, chunk);
        }
        this.references.set(chunk, (this.references.get(chunk) ?? 0) + 1);
        return Promise.resolve(chunk);
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        const owned = chunk as BaseSemanticChunk;
        const count = this.references.get(owned) ?? 0;
        if (count <= 0) throw new Error("semantic query test lease mismatch");
        this.references.set(owned, count - 1);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(`${chunkX}:${chunkY}`);
    }

    public dispose(): void {}
}

class EmptyHydrologySource implements HydrologyWorldSource {
    public readonly worldIdentity: string;
    public readonly stats = HYDROLOGY_STATS;
    private readonly regions = new Map<string, HydrologyRegion>();
    private readonly references = new Map<HydrologyRegion, number>();

    constructor(public readonly descriptor: WorldDescriptorV2) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveRegion(regionX: number, regionY: number) {
        return Number.isSafeInteger(regionX) && Number.isSafeInteger(regionY)
            ? { regionX, regionY } : undefined;
    }

    public regionDistance(): number { return 0; }

    public loadRegion(regionX: number, regionY: number): Promise<HydrologyRegion> {
        const identity = `${regionX}:${regionY}`;
        let region = this.regions.get(identity);
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
            this.regions.set(identity, region);
        }
        this.references.set(region, (this.references.get(region) ?? 0) + 1);
        return Promise.resolve(region);
    }

    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        const owned = region as HydrologyRegion;
        const count = this.references.get(owned) ?? 0;
        if (count <= 0) throw new Error("hydrology query test lease mismatch");
        this.references.set(owned, count - 1);
    }

    public hasRegion(regionX: number, regionY: number): boolean {
        return this.regions.has(`${regionX}:${regionY}`);
    }

    public dispose(): void {}
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

    public resolve(index: number): void {
        const call = this.calls[index];
        call.resolve({
            requestToken: call.requestToken,
            chunk: compileSurfaceChunk(call.effectiveWindow)
        });
    }
}

const BASE_INDEX: BaseHydrologyFeatureIndex = {
    resolveFeature: () => undefined,
    referencesTo: () => []
};

function fixture(seed: string) {
    const descriptor = createCoreInfiniteWorldDescriptorV2(seed);
    const store = new MemorySurfaceDeltaStore(descriptor, BASE_INDEX);
    const semanticSource = new FlatSemanticSource(descriptor, 10_000);
    const hydrologySource = new EmptyHydrologySource(descriptor);
    const pool = new DeferredPool();
    const compilation = new SurfaceCompilationService({
        worldIdentity: store.worldIdentity,
        sessionEpoch: 23,
        cacheMaxBytes: 32 * 1024 * 1024,
        pool
    });
    const query = new SurfaceQueryService({
        store,
        semanticSource,
        hydrologySource,
        compilation,
        metrics: { hexSize: 2, heightScale: 10 }
    });
    return { store, semanticSource, hydrologySource, pool, compilation, query };
}

describe("SurfaceQueryService", () => {
    test("coalesces same-snapshot CPU work and applies the half-open boundary owner", async () => {
        const state = fixture("surface-query-shared");
        const firstPending = state.query.queryLogical(15.5, 2.25);
        const secondPending = state.query.queryWorld(
            surfaceToWorld(15.5, 2.25, 2).x,
            surfaceToWorld(15.5, 2.25, 2).z
        );
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(1));
        expect(state.pool.calls[0].effectiveWindow.renderKey).toEqual({ chunkX: 1, chunkY: 0 });
        state.pool.resolve(0);

        const [first, second] = await Promise.all([firstPending, secondPending]);
        expect(first).toEqual(second);
        expect(first).toMatchObject({
            effectiveRevision: 0,
            logicalU: 15.5,
            logicalV: 2.25,
            renderKey: { chunkX: 1, chunkY: 0 },
            water: { bodyId: "ocean", kind: "ocean" }
        });
        expect(first.materialWeights).toHaveLength(4);
        expect(state.query.stats).toMatchObject({
            pendingChunks: 0,
            completedQueries: 2,
            sharedWaits: 1,
            compilationRequests: 1
        });
        state.query.dispose();
        state.compilation.dispose();
    });

    test("retains a mounted current token instead of replacing the render demand", async () => {
        const state = fixture("surface-query-retain");
        const view = new EffectiveWorldView({
            semanticSource: state.semanticSource,
            hydrologySource: state.hydrologySource,
            deltaSnapshot: state.store.snapshot()
        });
        const renderPending = state.compilation.requestSurface({
            view,
            key: { chunkX: 0, chunkY: 0 },
            metrics: { hexSize: 2, heightScale: 10 }
        });
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(1));
        state.pool.resolve(0);
        const renderLease = await renderPending;

        const result = await state.query.queryLogical(2, 3);
        expect(result.effectiveRevision).toBe(0);
        expect(state.pool.calls).toHaveLength(1);
        expect(state.query.stats.retainedCurrentLeases).toBe(1);
        expect(state.compilation.isCurrent(renderLease)).toBe(true);

        renderLease.release();
        view.dispose();
        state.query.dispose();
        state.compilation.dispose();
    });

    test("rebuilds from the latest immutable snapshot when an edit commits during compile", async () => {
        const state = fixture("surface-query-revision");
        const pending = state.query.queryLogical(0, 0);
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(1));
        await state.store.commit({
            worldIdentity: state.store.worldIdentity,
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
        state.pool.resolve(0);
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(2));
        expect(state.pool.calls[1].effectiveWindow.effectiveRevision).toBe(1);
        state.pool.resolve(1);

        const result = await pending;
        expect(result.effectiveRevision).toBe(1);
        expect(result.groundHeight).toBeGreaterThan(10_000 / 0xffff * 10);
        expect(state.query.stats).toMatchObject({
            completedQueries: 1,
            compilationRequests: 2,
            revisionRetries: 1
        });
        state.query.dispose();
        state.compilation.dispose();
    });

    test("cancels one waiter without aborting shared compilation required by another", async () => {
        const state = fixture("surface-query-cancel");
        const controller = new AbortController();
        const cancelled = state.query.queryLogical(1, 1, { signal: controller.signal });
        const required = state.query.queryLogical(2, 2);
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(1));
        controller.abort();
        await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
        state.pool.resolve(0);
        await expect(required).resolves.toMatchObject({ effectiveRevision: 0 });
        expect(state.query.stats.completedQueries).toBe(1);
        state.query.dispose();
        state.compilation.dispose();
    });
});
