import "fake-indexeddb/auto";

import { describe, expect, test, vi } from "vitest";

import {
    checksumCheckpointSnapshot,
    GENERATION_CHECKPOINT_FORMAT_VERSION,
    GenerationCheckpointCoordinator,
    GenerationCheckpointManifest,
    GenerationCheckpointStageRecord,
    GenerationCheckpointStore,
    IndexedDbGenerationCheckpointStore,
    MemoryGenerationCheckpointStore
} from "../../src/persistence/GenerationCheckpointCoordinator";
import { createWorldDescriptor } from "../../src/world/WorldDescriptor";
import { deferred } from "../helpers/deferred";

const descriptor = createWorldDescriptor({ seed: "strict-save", chunkSize: 24 });

describe("GenerationCheckpointCoordinator", () => {
    test("captures asynchronous participants at one world-state boundary", async () => {
        let queued = Promise.resolve();
        const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
            const result = queued.then(task);
            queued = result.then(() => undefined, () => undefined);
            return result;
        };
        const entered = deferred<void>();
        const release = deferred<void>();
        const state = { terrain: 0, simulation: 0 };
        const restored: number[] = [];
        const coordinator = new GenerationCheckpointCoordinator({
            worldId: "boundary", descriptor, store: new MemoryGenerationCheckpointStore(),
            withWorldState: exclusive,
            participants: [{
                id: "terrain", version: 1, capture: () => state.terrain,
                restore: (_context, snapshot) => { restored.push(snapshot as number); }
            }, {
                id: "simulation", version: 1,
                capture: async () => { entered.resolve(); await release.promise; return state.simulation; },
                restore: (_context, snapshot) => { restored.push(snapshot as number); }
            }]
        });
        const saving = coordinator.checkpoint();
        await entered.promise;
        const mutation = exclusive(async () => { state.terrain = state.simulation = 1; });
        await Promise.resolve();
        expect(state).toEqual({ terrain: 0, simulation: 0 });
        release.resolve();
        await saving;
        await mutation;
        expect(state).toEqual({ terrain: 1, simulation: 1 });
        await coordinator.recover();
        expect(restored).toEqual([0, 0]);
    });

    test("rejects a missing state boundary instead of assuming domain synchronization", () => {
        expect(() => new GenerationCheckpointCoordinator({
            worldId: "boundary", descriptor, store: new MemoryGenerationCheckpointStore(),
            withWorldState: undefined as never,
            participants: [{ id: "state", version: 1, capture: () => 0, restore: () => {} }]
        })).toThrow("authoritative state boundary");
    });
    test("dispose releases in-memory manifests and stages", async () => {
        const store = new MemoryGenerationCheckpointStore();
        await store.putStage({
            key: "disposed-world:1:simulation",
            worldId: "disposed-world",
            generation: 1,
            saveId: "save-1",
            participantId: "simulation",
            participantVersion: 1,
            createdAt: 1,
            checksum: checksumCheckpointSnapshot({ coins: 1 }),
            snapshot: { coins: 1 }
        });
        expect((store as unknown as { stages: Map<string, unknown> }).stages.size).toBe(1);

        store.dispose();

        expect((store as unknown as { stages: Map<string, unknown> }).stages.size).toBe(0);
        expect((store as unknown as { manifests: Map<string, unknown> }).manifests.size).toBe(0);
        expect(() => store.listStages("disposed-world")).toThrow("disposed");
    });

    test("publishes one atomic manifest and retains a complete previous generation", async () => {
        const store = new MemoryGenerationCheckpointStore();
        let working = { coins: 1 };
        const participant = {
            id: "simulation",
            version: 1,
            capture: () => structuredClone(working),
            restore: vi.fn()
        };
        const coordinator = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "world", descriptor, store, participants: [participant], orphanGraceMs: 0
        });
        const first = await coordinator.checkpoint();
        working = { coins: 2 };
        const second = await coordinator.checkpoint();
        working = { coins: 3 };
        const third = await coordinator.checkpoint();

        expect(second).toMatchObject({ generation: 2, revision: 2 });
        expect(second.previous).toMatchObject({ generation: 1, saveId: first.saveId });
        expect(third).toMatchObject({ generation: 3, revision: 3 });
        expect(third.previous).toMatchObject({ generation: 2, saveId: second.saveId });
        expect("previous" in third.previous!).toBe(false);
        expect(await store.listStages("world")).toHaveLength(2);

        const restored: Array<{ coins: number }> = [];
        const reopened = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "world",
            descriptor,
            store,
            participants: [{
                ...participant,
                restore: (_context: unknown, snapshot: unknown) => { restored.push(snapshot as { coins: number }); }
            }],
            orphanGraceMs: 0
        });
        await reopened.recover();
        expect(restored).toEqual([{ coins: 3 }]);
    });

    test("checksums supported structured snapshots and rejects ambiguous object graphs", () => {
        // Existing JSON-like snapshots keep their v1 checksum representation.
        expect(checksumCheckpointSnapshot({ x: 1 })).toBe("8c5c1250");
        expect(checksumCheckpointSnapshot({ b: 2, a: 1 }))
            .toBe(checksumCheckpointSnapshot({ a: 1, b: 2 }));
        expect(checksumCheckpointSnapshot(new Map([["value", 1]])))
            .not.toBe(checksumCheckpointSnapshot(new Map([["value", 2]])));
        expect(checksumCheckpointSnapshot(new Set([1])))
            .not.toBe(checksumCheckpointSnapshot(new Set([2])));
        expect(checksumCheckpointSnapshot(new Date(1)))
            .not.toBe(checksumCheckpointSnapshot(new Date(2)));
        expect(checksumCheckpointSnapshot(/first/gi))
            .not.toBe(checksumCheckpointSnapshot(/second/gi));

        const cyclic: { self?: unknown } = {};
        cyclic.self = cyclic;
        expect(() => checksumCheckpointSnapshot(cyclic)).toThrow(/cyclic/);
        expect(() => checksumCheckpointSnapshot(new (class Snapshot { value = 1; })()))
            .toThrow(/unsupported Snapshot/);
    });

    test("recovers an already-published structured snapshot with its legacy v1 checksum", async () => {
        const snapshot = new Map([["value", 7]]);
        const stage: GenerationCheckpointStageRecord = {
            key: "legacy-stage",
            worldId: "legacy-checksum",
            generation: 1,
            saveId: "legacy-save",
            participantId: "state",
            participantVersion: 1,
            createdAt: 1,
            checksum: "5246234b",
            snapshot
        };
        const manifest: GenerationCheckpointManifest = {
            formatVersion: GENERATION_CHECKPOINT_FORMAT_VERSION,
            worldId: "legacy-checksum",
            revision: 1,
            generation: 1,
            saveId: "legacy-save",
            descriptor,
            committedAt: 1,
            participants: [{
                id: "state", version: 1, required: true, state: "staged",
                stageKey: stage.key, checksum: stage.checksum
            }]
        };
        const store = {
            loadManifest: async () => structuredClone(manifest),
            putStage: async () => undefined,
            loadStage: async () => structuredClone(stage),
            compareAndSetManifest: async () => undefined,
            listStages: async () => [structuredClone(stage)],
            deleteStages: async () => undefined,
            dispose() {}
        } satisfies GenerationCheckpointStore;
        const restore = vi.fn();
        const coordinator = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "legacy-checksum", descriptor, store,
            participants: [{ id: "state", version: 1, capture: () => ({}), restore }]
        });

        await coordinator.recover();
        expect(restore).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }), snapshot);
    });

    test("never publishes a stage reclaimed between verification and manifest CAS", async () => {
        const publishEntered = deferred();
        const publishReleased = deferred();
        class PausedPublishStore extends MemoryGenerationCheckpointStore {
            override async compareAndSetManifest(
                worldId: string,
                expectedRevision: number,
                manifest: GenerationCheckpointManifest
            ): Promise<void> {
                publishEntered.resolve();
                await publishReleased.promise;
                return super.compareAndSetManifest(worldId, expectedRevision, manifest);
            }
        }
        const store = new PausedPublishStore();
        const participant = { id: "state", version: 1, capture: () => ({ durable: true }), restore() {} };
        const writer = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "publish-race", descriptor, store, participants: [participant],
            now: () => 10, orphanGraceMs: 0
        });
        const collector = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "publish-race", descriptor, store, participants: [participant],
            now: () => 10, orphanGraceMs: 0
        });

        const checkpoint = writer.checkpoint();
        await publishEntered.promise;
        await expect(collector.collectGarbage()).resolves.toBe(1);
        publishReleased.resolve();

        await expect(checkpoint).rejects.toThrow(/missing or corrupt/);
        expect(await store.loadManifest("publish-race")).toBeUndefined();
    });

    test("keeps stages when a manifest commit reports an ambiguous failure", async () => {
        class AmbiguousStore extends MemoryGenerationCheckpointStore {
            override async compareAndSetManifest(
                worldId: string,
                expectedRevision: number,
                manifest: GenerationCheckpointManifest
            ): Promise<void> {
                await super.compareAndSetManifest(worldId, expectedRevision, manifest);
                throw new Error("connection disappeared after commit");
            }
        }
        const store = new AmbiguousStore();
        const coordinator = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "ambiguous",
            descriptor,
            store,
            participants: [{ id: "state", version: 1, capture: () => ({ value: 7 }), restore() {} }]
        });
        await expect(coordinator.checkpoint()).rejects.toThrow(/after commit/);
        expect((await store.loadManifest("ambiguous"))?.generation).toBe(1);
        expect(await store.listStages("ambiguous")).toHaveLength(1);

        const restore = vi.fn();
        const reopened = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "ambiguous", descriptor, store,
            participants: [{ id: "state", version: 1, capture: () => ({}), restore }]
        });
        await reopened.recover();
        expect(restore).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }), { value: 7 });
    });

    test("rejects concurrent writers without mixing their stages", async () => {
        const store = new MemoryGenerationCheckpointStore();
        const participant = (value: string) => ({
            id: "state", version: 1, capture: () => ({ value }), restore() {}
        });
        const first = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "concurrent", descriptor, store, participants: [participant("first")],
            createSaveId: () => "first-save", orphanGraceMs: 0
        });
        const second = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "concurrent", descriptor, store, participants: [participant("second")],
            createSaveId: () => "second-save", orphanGraceMs: 0
        });
        const outcomes = await Promise.allSettled([first.checkpoint(), second.checkpoint()]);
        expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
        const manifest = await store.loadManifest("concurrent");
        const stage = await store.loadStage(manifest!.participants[0].stageKey!);
        expect(stage?.saveId).toBe(manifest?.saveId);
        expect((await store.listStages("concurrent")).every(record => record.saveId === manifest?.saveId)).toBe(true);
    });

    test("migrates through a newly published generation instead of rewriting the old one", async () => {
        const store = new MemoryGenerationCheckpointStore();
        let state: { value: number; label?: string } = { value: 3 };
        const old = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "migration", descriptor, store,
            participants: [{ id: "state", version: 1, capture: () => state, restore() {} }],
            createSaveId: () => "old-save"
        });
        await old.checkpoint();

        const current = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "migration", descriptor, store,
            participants: [{
                id: "state",
                version: 2,
                capture: () => state,
                migrate: snapshot => ({ ...(snapshot as { value: number }), label: "migrated" }),
                restore: (_context, snapshot) => { state = snapshot as typeof state; }
            }],
            createSaveId: () => "new-save"
        });
        const recovered = await current.recover();
        expect(recovered).toMatchObject({ generation: 2, saveId: "new-save" });
        expect(recovered?.previous).toMatchObject({ generation: 1, saveId: "old-save" });
        expect(recovered?.participants[0].version).toBe(2);
        expect(state).toEqual({ value: 3, label: "migrated" });
    });

    test("validates the complete world descriptor before restoring", async () => {
        const store = new MemoryGenerationCheckpointStore();
        const participant = { id: "state", version: 1, capture: () => ({}), restore: vi.fn() };
        await new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "descriptor", descriptor, store, participants: [participant]
        }).checkpoint();
        const wrong = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "descriptor",
            descriptor: createWorldDescriptor({ seed: "different", chunkSize: 24 }),
            store,
            participants: [participant]
        });
        await expect(wrong.recover()).rejects.toThrow(/descriptor does not match/);
        expect(participant.restore).not.toHaveBeenCalled();
    });

    test("reclaims an unreferenced orphan stage after its grace period", async () => {
        const store = new MemoryGenerationCheckpointStore();
        const orphan: GenerationCheckpointStageRecord = {
            key: "orphan", worldId: "garbage", generation: 1, saveId: "dead",
            participantId: "state", participantVersion: 1, createdAt: 10,
            checksum: "deadbeef", snapshot: { abandoned: true }
        };
        await store.putStage(orphan);
        const coordinator = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "garbage", descriptor, store, now: () => 20, orphanGraceMs: 0,
            participants: [{ id: "state", version: 1, capture: () => ({}), restore() {} }]
        });
        await expect(coordinator.collectGarbage()).resolves.toBe(1);
        expect(await store.listStages("garbage")).toEqual([]);
    });

    test("persists staging and the CAS manifest through real IndexedDB transactions", async () => {
        const databaseName = `generation-checkpoint-${Date.now()}-${Math.random()}`;
        const firstStore = new IndexedDbGenerationCheckpointStore({ databaseName });
        const first = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "indexed", descriptor, store: firstStore,
            participants: [{ id: "state", version: 1, capture: () => ({ durable: true }), restore() {} }]
        });
        await first.checkpoint();
        first.dispose();
        await first.settled;

        const restore = vi.fn();
        const reopenedStore = new IndexedDbGenerationCheckpointStore({ databaseName });
        const reopened = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: "indexed", descriptor, store: reopenedStore,
            participants: [{ id: "state", version: 1, capture: () => ({}), restore }]
        });
        await reopened.recover();
        expect(restore).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }), { durable: true });
        reopened.dispose();
    });
});
