import "fake-indexeddb/auto";

import { describe, expect, test, vi } from "vitest";

import {
    GenerationCheckpointCoordinator,
    GenerationCheckpointManifest,
    GenerationCheckpointStageRecord,
    IndexedDbGenerationCheckpointStore,
    MemoryGenerationCheckpointStore
} from "../../src/persistence/GenerationCheckpointCoordinator";
import { createWorldDescriptor } from "../../src/world/WorldDescriptor";

const descriptor = createWorldDescriptor({ seed: "strict-save", chunkSize: 24 });

describe("GenerationCheckpointCoordinator", () => {
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
            worldId: "world", descriptor, store, participants: [participant], orphanGraceMs: 0
        });
        const first = await coordinator.checkpoint();
        working = { coins: 2 };
        const second = await coordinator.checkpoint();

        expect(second).toMatchObject({ generation: 2, revision: 2 });
        expect(second.previous).toMatchObject({ generation: 1, saveId: first.saveId });
        expect(await store.listStages("world")).toHaveLength(2);

        const restored: Array<{ coins: number }> = [];
        const reopened = new GenerationCheckpointCoordinator({
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
        expect(restored).toEqual([{ coins: 2 }]);
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
            worldId: "concurrent", descriptor, store, participants: [participant("first")],
            createSaveId: () => "first-save", orphanGraceMs: 0
        });
        const second = new GenerationCheckpointCoordinator({
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
            worldId: "migration", descriptor, store,
            participants: [{ id: "state", version: 1, capture: () => state, restore() {} }],
            createSaveId: () => "old-save"
        });
        await old.checkpoint();

        const current = new GenerationCheckpointCoordinator({
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
            worldId: "descriptor", descriptor, store, participants: [participant]
        }).checkpoint();
        const wrong = new GenerationCheckpointCoordinator({
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
            worldId: "indexed", descriptor, store: firstStore,
            participants: [{ id: "state", version: 1, capture: () => ({ durable: true }), restore() {} }]
        });
        await first.checkpoint();
        first.dispose();
        await first.settled;

        const restore = vi.fn();
        const reopenedStore = new IndexedDbGenerationCheckpointStore({ databaseName });
        const reopened = new GenerationCheckpointCoordinator({
            worldId: "indexed", descriptor, store: reopenedStore,
            participants: [{ id: "state", version: 1, capture: () => ({}), restore }]
        });
        await reopened.recover();
        expect(restore).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }), { durable: true });
        reopened.dispose();
    });
});
