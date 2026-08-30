import { Group } from "three";
import { describe, expect, test, vi } from "vitest";

import { WorldRenderSession } from "../../src/rendering/WorldRenderSession";
import { createWorldDescriptorV2 } from "../../src/world/semantic/WorldDescriptorV2";

function fixture(chunkBytes = 128) {
    const descriptor = createWorldDescriptorV2({ seed: "render-session-v2" });
    const calls: string[] = [];
    let generation = 0;
    let deferCompilation = false;
    const pendingCompilations: Array<() => void> = [];
    const authority = {
        retain: async (key: { chunkX: number; chunkY: number }) => ({
            key,
            snapshot: {},
            released: false,
            release: () => true
        }),
        dispose: vi.fn()
    };
    const compilation = {
        request: (_snapshot: unknown, key: { chunkX: number; chunkY: number }) => {
            generation += 1;
            let released = false;
            const lease = {
                requestToken: { sessionEpoch: 1, renderChunkGeneration: generation },
                effectiveRevision: 0,
                dependencyKey: {},
                chunk: { key, byteLength: chunkBytes },
                get released() { return released; },
                isCurrent: () => !released,
                release: () => {
                    if (released) return false;
                    released = true;
                    return true;
                }
            };
            const outcome = { status: "ready" as const, requestToken: lease.requestToken, lease };
            return {
                key,
                requestToken: lease.requestToken,
                result: deferCompilation
                    ? new Promise(resolve => pendingCompilations.push(() => resolve(outcome)))
                    : Promise.resolve(outcome),
                cancel: () => lease.release()
            };
        },
        invalidate: vi.fn(() => 0),
        dispose: vi.fn()
    };
    const presentation = {
        root: new Group(),
        mountGround: (_lease: unknown, _lod: number) => { calls.push("mount-ground"); return {}; },
        mountWater: () => { calls.push("mount-water"); return {}; },
        mountVegetation: () => { calls.push("mount-vegetation"); return {}; },
        unmountVegetation: () => { calls.push("unmount-vegetation"); return true; },
        unmountWater: () => { calls.push("unmount-water"); return true; },
        unmountGround: () => { calls.push("unmount-ground"); return true; },
        setLod: vi.fn(() => true),
        uploadFog: vi.fn(() => true),
        setTime: vi.fn(),
        setFloatingOrigin: vi.fn(),
        handleContextLost: vi.fn(),
        handleContextRestored: vi.fn(),
        dispose: vi.fn()
    };
    const queries = {
        bindLease: vi.fn(),
        unbindLease: vi.fn(() => true),
        invalidate: vi.fn(() => 0),
        dispose: vi.fn()
    };
    const session = new WorldRenderSession({
        descriptor,
        authority: authority as never,
        compilation: compilation as never,
        presentation: presentation as never,
        queries: queries as never,
        compiledWorkingSetBudgetBytes: 1024
    });
    return {
        session,
        calls,
        compilation,
        presentation,
        queries,
        deferCompilation: () => { deferCompilation = true; },
        resolveCompilations: () => {
            for (const resolve of pendingCompilations.splice(0)) resolve();
        },
        pendingCompilationCount: () => pendingCompilations.length
    };
}

describe("WorldRenderSession", () => {
    test("mounts the exact demand through the dependency graph and unmounts in reverse", async () => {
        const { session, calls } = fixture();
        await session.initialize();
        await session.updateDemand([{ key: { chunkX: 0, chunkY: 0 }, lod: 0 }]);
        expect(session.stats).toMatchObject({ demandedChunks: 1, pendingChunks: 0, mountedChunks: 1, mountedCompiledBytes: 128 });
        expect(session.stats.layerOrder).toEqual(["ground", "water", "vegetation", "fog"]);
        await session.updateDemand([]);
        expect(calls).toEqual([
            "mount-ground", "mount-water", "mount-vegetation",
            "unmount-vegetation", "unmount-water", "unmount-ground"
        ]);
        expect(session.stats).toMatchObject({ demandedChunks: 0, mountedChunks: 0, mountedCompiledBytes: 0 });
    });

    test("updates LOD without recompilation and rejects duplicate canonical demand", async () => {
        const { session, presentation } = fixture();
        await session.initialize();
        await session.updateDemand([{ key: { chunkX: 1, chunkY: 2 }, lod: 0 }]);
        await session.updateDemand([{ key: { chunkX: 1, chunkY: 2 }, lod: 2 }]);
        expect(presentation.setLod).toHaveBeenCalledTimes(1);
        await expect(session.updateDemand([
            { key: { chunkX: 1, chunkY: 2 }, lod: 0 },
            { key: { chunkX: 1, chunkY: 2 }, lod: 1 }
        ])).rejects.toThrow(/duplicate canonical/);
    });

    test("keeps the previous coverage mounted until replacement chunks are compiled", async () => {
        const fixtureValue = fixture();
        const { session, calls } = fixtureValue;
        await session.initialize();
        await session.updateDemand([{ key: { chunkX: 0, chunkY: 0 }, lod: 0 }]);
        calls.length = 0;
        fixtureValue.deferCompilation();

        const transition = session.updateDemand([{ key: { chunkX: 1, chunkY: 0 }, lod: 0 }]);
        await vi.waitFor(() => expect(fixtureValue.pendingCompilationCount()).toBe(1));
        expect(calls).toEqual([]);
        expect(session.stats).toMatchObject({ mountedChunks: 1, mountedCompiledBytes: 128 });

        fixtureValue.resolveCompilations();
        await transition;
        expect(calls).toEqual([
            "unmount-vegetation", "unmount-water", "unmount-ground",
            "mount-ground", "mount-water", "mount-vegetation"
        ]);
        expect(session.stats).toMatchObject({ demandedChunks: 1, mountedChunks: 1, mountedCompiledBytes: 128 });
    });

    test("fails deterministically when the exact visible working set exceeds its byte budget", async () => {
        const { session } = fixture(800);
        await session.initialize();
        await expect(session.updateDemand([
            { key: { chunkX: 0, chunkY: 0 }, lod: 0 },
            { key: { chunkX: 1, chunkY: 0 }, lod: 0 }
        ])).rejects.toThrow(/working-set budget/);
        expect(session.stats.failedChunks).toBe(1);
        expect(session.stats).toMatchObject({ demandedChunks: 0, mountedChunks: 0, mountedCompiledBytes: 0 });
    });
});
