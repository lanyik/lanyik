import { describe, expect, test, vi } from "vitest";

import { NavigationMovementProfile } from "../../src/world/NavigationChunkSummary";
import {
    NavigationSummaryService,
    NavigationSummaryLeaseNotCurrentError
} from "../../src/world/NavigationSummaryService";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import { SEMANTIC_DELTA_FIELD_HEIGHT } from "../../src/world/SparseSemanticDelta";
import { SurfaceCompilationService } from "../../src/world/SurfaceCompilationService";
import { MemorySurfaceDeltaStore } from "../../src/world/SurfaceDeltaStore";
import {
    DeferredSurfaceCompilationPool,
    EMPTY_BASE_HYDROLOGY_INDEX,
    EmptyHydrologySource,
    FlatSemanticSource
} from "./surfaceRuntimeFixture";

const WALKER: Readonly<NavigationMovementProfile> = Object.freeze({
    id: "walker/default-v1",
    maximumGroundSlope: 0.75,
    dryCost: 1,
    slopeCostScale: 2,
    oceanCost: null,
    lakeCost: null,
    riverCost: null
});

const BOAT: Readonly<NavigationMovementProfile> = Object.freeze({
    id: "boat/default-v1",
    maximumGroundSlope: 0.75,
    dryCost: 2,
    slopeCostScale: 0,
    oceanCost: 1,
    lakeCost: 1,
    riverCost: 1.5
});

function fixture(seed: string, cacheMaxBytes = 16 * 1024 * 1024) {
    const descriptor = createCoreInfiniteWorldDescriptorV2(seed);
    const store = new MemorySurfaceDeltaStore(descriptor, EMPTY_BASE_HYDROLOGY_INDEX);
    const semanticSource = new FlatSemanticSource(descriptor, 40_000);
    const hydrologySource = new EmptyHydrologySource(descriptor);
    const pool = new DeferredSurfaceCompilationPool();
    const compilation = new SurfaceCompilationService({
        worldIdentity: store.worldIdentity,
        sessionEpoch: 31,
        cacheMaxBytes: 64 * 1024 * 1024,
        pool
    });
    const service = new NavigationSummaryService({
        store,
        semanticSource,
        hydrologySource,
        compilation,
        metrics: { hexSize: 2, heightScale: 10 },
        sessionEpoch: 37,
        cacheMaxBytes
    });
    return { store, pool, compilation, service };
}

function resolveCalls(
    pool: DeferredSurfaceCompilationPool,
    first: number,
    count: number
): void {
    for (let index = first; index < first + count; index += 1) pool.resolve(index);
}

async function editHeight(
    store: MemorySurfaceDeltaStore,
    chunkX: number,
    chunkY: number,
    expectedRevision = 0
): Promise<void> {
    await store.commit({
        worldIdentity: store.worldIdentity,
        semanticMutations: [{
            operation: "upsert",
            key: { chunkX, chunkY },
            expectedRevision,
            payload: {
                tileIndex: new Uint16Array([0]),
                fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
                macroHeight: new Uint16Array([50_000]),
                substrateClass: new Uint8Array(1),
                biomeWeights: new Uint8Array(4),
                vegetationDensity: new Uint8Array(1),
                vegetationProfile: new Uint8Array(1)
            }
        }],
        hydrologyMutations: []
    });
}

describe("NavigationSummaryService", () => {
    test("coalesces four CPU surface inputs across concurrent movement profiles", async () => {
        const state = fixture("navigation-service-profiles");
        const walkerPending = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        const boatPending = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: BOAT });
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(4));
        resolveCalls(state.pool, 0, 4);
        const [walker, boat] = await Promise.all([walkerPending, boatPending]);

        expect(walker.requestToken).not.toEqual(boat.requestToken);
        expect(walker.summary.profile.id).toBe(WALKER.id);
        expect(boat.summary.profile.id).toBe(BOAT.id);
        expect(state.service.isCurrent(walker)).toBe(true);
        expect(state.service.isCurrent(boat)).toBe(true);
        expect(state.service.stats).toMatchObject({
            residentSummaries: 2,
            activeLeases: 2,
            cacheMisses: 2,
            completedCompilations: 2
        });
        walker.release();
        boat.release();
        state.service.dispose();
        state.compilation.dispose();
    });

    test("gives concurrent callers independent holders of one current demand", async () => {
        const state = fixture("navigation-service-holders");
        const firstPending = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        const secondPending = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(4));
        resolveCalls(state.pool, 0, 4);
        const [first, second] = await Promise.all([firstPending, secondPending]);
        expect(first.requestToken).toBe(second.requestToken);
        expect(first.summary).toBe(second.summary);
        first.release();
        expect(state.service.isCurrent(second)).toBe(true);
        second.release();
        expect(state.service.stats.activeLeases).toBe(0);
        state.service.dispose();
        state.compilation.dispose();
    });

    test("cancels one caller without aborting shared navigation inputs", async () => {
        const state = fixture("navigation-service-cancel");
        const controller = new AbortController();
        const cancelled = state.service.requestSummary({
            key: { chunkX: 0, chunkY: 0 },
            profile: WALKER,
            signal: controller.signal
        });
        const required = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(4));
        controller.abort();
        await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
        resolveCalls(state.pool, 0, 4);
        const lease = await required;
        expect(state.service.isCurrent(lease)).toBe(true);
        lease.release();
        state.service.dispose();
        state.compilation.dispose();
    });

    test("retries from the latest snapshot when a target edit commits during surface compilation", async () => {
        const state = fixture("navigation-service-stale");
        const pending = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(4));
        await editHeight(state.store, 0, 0);
        resolveCalls(state.pool, 0, 4);
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(8));
        resolveCalls(state.pool, 4, 4);
        const lease = await pending;

        expect(lease.summary.effectiveRevision).toBe(1);
        expect(state.service.stats).toMatchObject({ revisionRetries: 1, cacheMisses: 1 });
        lease.release();
        state.service.dispose();
        state.compilation.dispose();
    });

    test("rebases an exact cache hit after an unrelated world commit", async () => {
        const state = fixture("navigation-service-cache");
        const firstPending = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(4));
        resolveCalls(state.pool, 0, 4);
        const first = await firstPending;
        const firstCosts = first.summary.traversalCostQ8;
        first.release();

        await editHeight(state.store, 10, 10);
        const second = await state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        expect(state.pool.calls).toHaveLength(4);
        expect(second.summary.effectiveRevision).toBe(1);
        expect(second.summary.traversalCostQ8).toBe(firstCosts);
        expect(state.service.stats).toMatchObject({
            cacheHits: 1,
            cacheMisses: 1,
            completedCompilations: 1
        });
        second.release();
        state.service.dispose();
        state.compilation.dispose();
    });

    test("invalidates held summaries immediately on commit and evicts only after release", async () => {
        const state = fixture("navigation-service-budget", 1);
        const pending = state.service.requestSummary({ key: { chunkX: 0, chunkY: 0 }, profile: WALKER });
        await vi.waitFor(() => expect(state.pool.calls).toHaveLength(4));
        resolveCalls(state.pool, 0, 4);
        const lease = await pending;
        expect(state.service.stats.residentBytes).toBeGreaterThan(1);
        await editHeight(state.store, 5, 5);
        expect(state.service.isCurrent(lease)).toBe(false);
        expect(() => state.service.assertCurrent(lease)).toThrow(NavigationSummaryLeaseNotCurrentError);
        expect(state.service.stats.residentSummaries).toBe(1);
        lease.release();
        expect(state.service.stats).toMatchObject({ residentSummaries: 0, residentBytes: 0, evictions: 1 });
        state.service.dispose();
        state.compilation.dispose();
    });
});
