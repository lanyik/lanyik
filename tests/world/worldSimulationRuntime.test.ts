import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
    MemorySimulationChunkStore,
    IndexedDbSimulationChunkStore,
    SimulationChunkSnapshot,
    SimulationEntity,
    WorldSimulationRuntime
} from "../../src/simulation/WorldSimulationRuntime";
import { createWorldChangeSet, WorldChangeDomain } from "../../src/world/semantic/WorldChangeSet";
import { createWorldDescriptorV2 } from "../../src/world/semantic/WorldDescriptorV2";
import { deferred } from "../helpers/deferred";

interface State { ticks: number }

const entity = (id: string, x: number, y: number): SimulationEntity<State> => ({ id, x, y, state: { ticks: 0 } });

describe("WorldSimulationRuntime", () => {
    test("does not resurrect a chunk when a pending wake completes after dispose", async () => {
        const load = deferred<undefined>();
        let storeDisposed = false;
        const runtime = new WorldSimulationRuntime<State>({
            store: {
                load: () => load.promise,
                save: () => Promise.resolve(),
                delete: () => Promise.resolve(),
                flush: () => Promise.resolve(),
                dispose: () => { storeDisposed = true; }
            }
        });

        const waking = runtime.wakeChunk(1, 0);
        runtime.dispose();
        expect(storeDisposed).toBe(false);
        load.resolve(undefined);

        await expect(waking).rejects.toThrow("disposed");
        await Promise.resolve();
        expect(runtime.stats).toMatchObject({ residentChunks: 0, activeChunks: 0, backgroundChunks: 0 });
        expect(storeDisposed).toBe(true);
    });

    test("serializes and deduplicates concurrent wakes for the same chunk", async () => {
        let loads = 0;
        const runtime = new WorldSimulationRuntime<State>({
            chunkSize: 10,
            store: {
                async load() {
                    loads += 1;
                    return undefined;
                },
                save: () => Promise.resolve(),
                delete: () => Promise.resolve(),
                flush: () => Promise.resolve(),
                dispose() {}
            }
        });
        runtime.setActivityAnchor({ id: "player", x: 1, y: 1, radiusChunks: 0 });

        const [first, second] = await Promise.all([
            runtime.wakeChunk(0, 0),
            runtime.wakeChunk(0, 0)
        ]);

        expect(loads).toBe(1);
        expect(first).toEqual(second);
        expect(runtime.stats).toMatchObject({ residentChunks: 1, activeChunks: 1, backgroundChunks: 0 });
    });

    test("rejects synchronous structural mutation while an async operation is pending", async () => {
        const load = deferred<undefined>();
        const runtime = new WorldSimulationRuntime<State>({
            store: {
                load: () => load.promise,
                save: () => Promise.resolve(),
                delete: () => Promise.resolve(),
                flush: () => Promise.resolve(),
                dispose() {}
            }
        });

        const waking = runtime.wakeChunk(0, 0);
        expect(() => runtime.addEntity(entity("racy", 0, 0))).toThrow("operation is pending");
        load.resolve(undefined);
        await waking;
        runtime.addEntity(entity("safe", 0, 0));
        expect(runtime.getEntity("safe")).toBeDefined();
    });

    test("reports bounded operation-queue pressure immediately and after drain", async () => {
        const load = deferred<undefined>();
        const runtime = new WorldSimulationRuntime<State>({
            maxQueuedOperations: 1,
            store: {
                load: () => load.promise,
                save: () => Promise.resolve(),
                delete: () => Promise.resolve(),
                flush: () => Promise.resolve(),
                dispose() {}
            }
        });

        const first = runtime.wakeChunk(0, 0);
        expect(runtime.stats.queuedOperations).toBe(1);
        await expect(runtime.wakeChunk(1, 0)).rejects.toMatchObject({ name: "WorkQueueBackpressureError" });
        expect(runtime.stats).toMatchObject({ queuedOperations: 1, shedOperations: 1 });
        load.resolve(undefined);
        await first;
        await Promise.resolve();
        expect(runtime.stats).toMatchObject({ queuedOperations: 0, shedOperations: 1 });
    });

    test("rejects malformed snapshot entities atomically", async () => {
        const base = {
            version: 1 as const,
            chunkX: 0,
            chunkY: 0,
            revision: 1,
            savedAt: 1,
            simulatedSeconds: 0
        };
        const invalid: Array<{ name: string; snapshot: unknown; message: RegExp }> = [
            {
                name: "duplicate ids",
                snapshot: { ...base, entities: [entity("dup", 1, 1), entity("dup", 2, 2)] },
                message: /duplicate entity id/
            },
            {
                name: "empty id",
                snapshot: { ...base, entities: [entity(" ", 1, 1)] },
                message: /non-empty id/
            },
            {
                name: "non-object entity",
                snapshot: { ...base, entities: [null] },
                message: /snapshot entity/
            },
            {
                name: "wrong chunk coordinates",
                snapshot: { ...base, entities: [entity("remote", 100, 0)] },
                message: /chunk coordinates/
            },
            {
                name: "invalid savedAt",
                snapshot: { ...base, savedAt: Number.NaN, entities: [] },
                message: /invalid or incompatible/
            }
        ];

        for (const sample of invalid) {
            const runtime = new WorldSimulationRuntime<State>({
                store: {
                    load: () => Promise.resolve(sample.snapshot as SimulationChunkSnapshot<State>),
                    save: () => Promise.resolve(),
                    delete: () => Promise.resolve(),
                    flush: () => Promise.resolve(),
                    dispose() {}
                }
            });
            await expect(runtime.wakeChunk(0, 0), sample.name).rejects.toThrow(sample.message);
            expect(runtime.stats, sample.name).toMatchObject({ residentChunks: 0, entities: 0 });
            runtime.dispose();
        }
    });

    test("ticks camera-independent active and distant chunks at separate cadences", async () => {
        const runtime = new WorldSimulationRuntime<State>({
            chunkSize: 10,
            activeTickIntervalSeconds: 0.1,
            backgroundTickIntervalSeconds: 1
        });
        runtime.addEntity(entity("near", 1, 1));
        runtime.addEntity(entity("far", 101, 1));
        runtime.setActivityAnchor({ id: "player", x: 1, y: 1, radiusChunks: 0 });
        runtime.registerSystem({
            id: "counter",
            update(context) {
                for (const current of context.entities) {
                    context.setEntityState(current.id, { ticks: current.state.ticks + 1 });
                }
            }
        });

        await runtime.advance(1);
        expect(runtime.getEntity("near")?.state.ticks).toBe(10);
        expect(runtime.getEntity("far")?.state.ticks).toBe(1);
        expect(runtime.stats).toMatchObject({ activeChunks: 1, backgroundChunks: 1, ticksRun: 11 });
    });

    test("stages cross-chunk movement and reindexes the entity", async () => {
        const runtime = new WorldSimulationRuntime<State>({
            chunkSize: 10, activeTickIntervalSeconds: 1, backgroundTickIntervalSeconds: 1
        });
        runtime.addEntity(entity("traveler", 9, 2));
        runtime.registerSystem({
            id: "move",
            update(context) {
                if (context.entities.some(candidate => candidate.id === "traveler")) {
                    context.moveEntity("traveler", 10, 2);
                }
            }
        });
        await runtime.advance(1);
        expect(runtime.getEntity("traveler")).toMatchObject({ x: 10, y: 2 });
        expect(runtime.chunkAt(9, 2)?.entities).toHaveLength(0);
        expect(runtime.chunkAt(10, 2)?.entities[0].id).toBe("traveler");
    });

    test("updates entity state outside a tick without moving the entity", () => {
        const runtime = new WorldSimulationRuntime<State>({ chunkSize: 10 });
        runtime.addEntity(entity("ordered", 9, 2));

        expect(runtime.setEntityState("ordered", { ticks: 7 })).toBe(true);
        expect(runtime.setEntityState("missing", { ticks: 1 })).toBe(false);
        expect(runtime.getEntity("ordered")).toEqual({ id: "ordered", x: 9, y: 2, state: { ticks: 7 } });
        expect(runtime.stats.dirtyChunks).toBe(1);
    });

    test("hibernates to storage and restores without render residency", async () => {
        const store = new MemorySimulationChunkStore<State>();
        const first = new WorldSimulationRuntime<State>({ chunkSize: 10, store });
        first.addEntity(entity("sleeper", 52, 3));
        await first.flush();
        expect(await first.hibernateChunk(5, 0)).toBe(true);
        expect(first.getEntity("sleeper")).toBeUndefined();

        const second = new WorldSimulationRuntime<State>({ chunkSize: 10, store });
        await second.wakeChunk(5, 0);
        expect(second.getEntity("sleeper")).toEqual(entity("sleeper", 52, 3));
    });

    test("keeps restored simulation time monotonic when an entity enters a new chunk", async () => {
        const store = new MemorySimulationChunkStore<State>();
        const first = new WorldSimulationRuntime<State>({
            chunkSize: 10, activeTickIntervalSeconds: 1, backgroundTickIntervalSeconds: 1, store
        });
        first.addEntity(entity("traveler", 9, 2));
        await first.advance(5);
        await first.flush();

        const second = new WorldSimulationRuntime<State>({
            chunkSize: 10, activeTickIntervalSeconds: 1, backgroundTickIntervalSeconds: 1, store
        });
        await second.restoreStoredChunks();
        const elapsedSeconds: number[] = [];
        second.registerSystem({
            id: "move-after-restore",
            update(context) {
                elapsedSeconds.push(context.elapsedSeconds);
                const traveler = context.entities.find(candidate => candidate.id === "traveler");
                if (traveler?.x === 9) context.moveEntity("traveler", 10, 2);
            }
        });

        await second.advance(1);
        await second.advance(1);
        expect(elapsedSeconds).toEqual([6, 7]);
        expect(second.stats.elapsedSeconds).toBe(7);
    });

    test("normalizes toroidal entities and limits catch-up work", async () => {
        const runtime = new WorldSimulationRuntime<State>({
            chunkSize: 10,
            bounds: { width: 20, height: 20, wrapX: true, wrapY: true },
            activeTickIntervalSeconds: 0.1,
            backgroundTickIntervalSeconds: 0.1,
            maxTicksPerAdvance: 3
        });
        runtime.addEntity(entity("wrapped", -1, -1));
        runtime.registerSystem({ id: "noop", update() {} });
        await runtime.advance(1);
        expect(runtime.getEntity("wrapped")).toMatchObject({ x: 19, y: 19 });
        expect(runtime.stats.ticksRun).toBe(3);
        expect(runtime.stats.ticksDropped).toBe(7);
    });
});

describe("IndexedDbSimulationChunkStore", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: new IDBFactory() });
    });
    afterEach(() => { Reflect.deleteProperty(globalThis, "indexedDB"); });

    test("restores simulation snapshots across store and runtime instances", async () => {
        const options = { worldId: "campaign", databaseName: "simulation-persistence" };
        const firstStore = new IndexedDbSimulationChunkStore<State>(options);
        const first = new WorldSimulationRuntime<State>({ chunkSize: 10, store: firstStore });
        first.addEntity(entity("persisted", 12, 3));
        await first.flush();

        const secondStore = new IndexedDbSimulationChunkStore<State>(options);
        const second = new WorldSimulationRuntime<State>({ chunkSize: 10, store: secondStore });
        await second.wakeChunk(1, 0);
        expect(second.getEntity("persisted")).toEqual(entity("persisted", 12, 3));
        first.dispose();
        second.dispose();
    });

    test("enumerates and atomically restores every stored simulation chunk", async () => {
        const options = { worldId: "restore-all", databaseName: "simulation-restore-all" };
        const firstStore = new IndexedDbSimulationChunkStore<State>(options);
        const first = new WorldSimulationRuntime<State>({ chunkSize: 10, store: firstStore });
        first.addEntity(entity("west", -12, 3));
        first.addEntity(entity("east", 27, 3));
        await first.flush();

        const secondStore = new IndexedDbSimulationChunkStore<State>(options);
        expect(await secondStore.listChunks()).toEqual([{ x: -2, y: 0 }, { x: 2, y: 0 }]);
        const second = new WorldSimulationRuntime<State>({ chunkSize: 10, store: secondStore });
        const restored = await second.restoreStoredChunks();

        expect(restored.map(chunk => [chunk.chunkX, chunk.chunkY])).toEqual([[-2, 0], [2, 0]]);
        expect(second.getEntity("west")).toEqual(entity("west", -12, 3));
        expect(second.getEntity("east")).toEqual(entity("east", 27, 3));
        first.dispose();
        second.dispose();
    });

    test("deletes empty simulation snapshots after an entity leaves its chunk", async () => {
        const options = { worldId: "empty-cleanup", databaseName: "simulation-empty-cleanup" };
        const store = new IndexedDbSimulationChunkStore<State>(options);
        const runtime = new WorldSimulationRuntime<State>({
            chunkSize: 10, activeTickIntervalSeconds: 1, backgroundTickIntervalSeconds: 1, store
        });
        runtime.addEntity(entity("traveler", 9, 2));
        runtime.registerSystem({
            id: "move-once",
            update(context) {
                const traveler = context.entities.find(candidate => candidate.id === "traveler");
                if (traveler?.x === 9) context.moveEntity("traveler", 10, 2);
            }
        });

        await runtime.advance(1);
        await runtime.flush();
        expect(await store.listChunks()).toEqual([{ x: 1, y: 0 }]);
        runtime.dispose();
    });

    test("delivers exact 64x64 change-set chunks to terrain-aware systems without render residency", () => {
        const runtime = new WorldSimulationRuntime<State>();
        const received: bigint[] = [];
        runtime.registerSystem({
            id: "terrain-aware",
            update: () => undefined,
            worldChanged: changeSet => {
                received.push(changeSet.transactionId);
                expect(changeSet.simulationChunks).toEqual([
                    { chunkX: 1, chunkY: -1 },
                    { chunkX: 1, chunkY: 0 }
                ]);
            }
        });
        const changeSet = createWorldChangeSet({
            descriptor: createWorldDescriptorV2({ seed: "simulation-change" }),
            transactionId: 9n,
            revision: 1,
            semanticChanges: [{ x: 70, y: -2, domains: WorldChangeDomain.Height }]
        });
        runtime.applyWorldChangeSet(changeSet);
        expect(received).toEqual([9n]);
        runtime.dispose();
    });
});
