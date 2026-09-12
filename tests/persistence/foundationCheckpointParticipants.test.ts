import { afterEach, describe, expect, test, vi } from "vitest";

import {
    createWorldDeltaGenerationParticipant
} from "../../src/persistence/FoundationCheckpointParticipants";
import {
    GenerationCheckpointCoordinator,
    GenerationCheckpointParticipant,
    MemoryGenerationCheckpointStore
} from "../../src/persistence/GenerationCheckpointCoordinator";
import { generateWorldChunk } from "../../src/world/generateWorldChunk";
import { MemoryWorldDeltaStore, WorldChunkDelta } from "../../src/world/WorldDeltaStore";
import { WorldGeneratorPool } from "../../src/world/WorldGeneratorPool";
import { ProceduralWorldSource } from "../../src/world/WorldSource";
import { deferred } from "../helpers/deferred";

interface State { value: string }

class DeferredReplaceWorldDeltaStore extends MemoryWorldDeltaStore {
    private readonly entered = deferred();
    private readonly released = deferred();
    public readonly replaceEntered = this.entered.promise;

    public override async replaceWorld(worldId: string, deltas: readonly WorldChunkDelta[], signal?: AbortSignal): Promise<void> {
        this.entered.resolve();
        await this.released.promise;
        return super.replaceWorld(worldId, deltas, signal);
    }

    public release(): void { this.released.resolve(); }
}

function checkpointSource(deltas: MemoryWorldDeltaStore): ProceduralWorldSource {
    return new ProceduralWorldSource({
        seed: "checkpoint-cancellation", workerUrl: "unused", chunkSize: 12, worldId: "checkpoint-cancellation"
    }, {
        pool: new WorldGeneratorPool("unused", {
            size: 1, clientFactory: () => ({
                generateChunk: options => Promise.resolve(generateWorldChunk(options)),
                dispose() {}, get isDisposed() { return false; }
            })
        }), deltaStore: deltas
    });
}

afterEach(() => { vi.useRealTimers(); });

describe("foundation generation checkpoint participants", () => {
    test.each(["abort", "timeout", "dispose"] as const)("%s waits for an entered restore to settle without a late write", async action => {
        if (action === "timeout") vi.useFakeTimers();
        const deltas = new DeferredReplaceWorldDeltaStore();
        const source = checkpointSource(deltas);
        const afterRestore = vi.fn();
        const coordinator = new GenerationCheckpointCoordinator({
            worldId: source.worldId, descriptor: source.descriptor, store: new MemoryGenerationCheckpointStore(),
            withWorldState: operation => operation(), operationTimeoutMs: 20,
            participants: [createWorldDeltaGenerationParticipant(source, { afterRestore })]
        });
        source.setTileOverride(2, 3, { unit: "saved" });
        await coordinator.checkpoint();
        source.setTileOverride(2, 3, { unit: "current" });
        const controller = new AbortController();
        const recovery = coordinator.recover(controller.signal);
        const failed = expect(recovery).rejects.toMatchObject({ name: action === "timeout" ? "TimeoutError" : "AbortError" });
        await deltas.replaceEntered;
        if (action === "timeout") await vi.advanceTimersByTimeAsync(20);
        else if (action === "dispose") coordinator.dispose(false);
        else controller.abort();
        let settled = false;
        void coordinator.settled.then(() => { settled = true; });
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(coordinator.stats.running).toBe(true);
        deltas.release();
        await failed;
        await coordinator.settled;
        expect(source.store.getTileOverride(2, 3)).toEqual({ unit: "current" });
        expect(afterRestore).not.toHaveBeenCalled();
        expect(coordinator.stats.running).toBe(false);
        coordinator.dispose(); source.dispose();
    });

    test("cancellation after replacement commits finishes memory and view synchronization before success", async () => {
        const controller = new AbortController();
        class CommittedStore extends MemoryWorldDeltaStore {
            override async replaceWorld(worldId: string, deltas: readonly WorldChunkDelta[], signal?: AbortSignal) {
                await super.replaceWorld(worldId, deltas, signal);
                controller.abort();
            }
        }
        const source = checkpointSource(new CommittedStore());
        const syncEntered = deferred(), syncReleased = deferred();
        const coordinator = new GenerationCheckpointCoordinator({
            worldId: source.worldId, descriptor: source.descriptor, store: new MemoryGenerationCheckpointStore(),
            withWorldState: operation => operation(),
            participants: [createWorldDeltaGenerationParticipant(source, { afterRestore: async () => {
                syncEntered.resolve(); await syncReleased.promise;
            } })]
        });
        source.setTileOverride(2, 3, { unit: "saved" });
        await coordinator.checkpoint();
        source.setTileOverride(2, 3, { unit: "current" });
        const recovery = coordinator.recover(controller.signal);
        await syncEntered.promise;
        expect(controller.signal.aborted).toBe(true);
        expect(coordinator.stats.running).toBe(true);
        expect(source.store.getTileOverride(2, 3)).toEqual({ unit: "saved" });
        syncReleased.resolve();
        await expect(recovery).resolves.toMatchObject({ generation: 1 });
        await coordinator.settled;
        expect(coordinator.stats.running).toBe(false);
        coordinator.dispose(); source.dispose();
    });

    test("rejects terrain edits while a checkpoint restore is replacing durable deltas", async () => {
        const deltas = new DeferredReplaceWorldDeltaStore();
        const source = new ProceduralWorldSource({
            seed: "restore-lock",
            workerUrl: "unused",
            chunkSize: 12,
            worldId: "restore-lock"
        }, {
            pool: new WorldGeneratorPool("unused", {
                size: 1,
                clientFactory: () => ({
                    generateChunk: options => Promise.resolve(generateWorldChunk(options)),
                    dispose() {},
                    get isDisposed() { return false; }
                })
            }),
            deltaStore: deltas
        });
        source.setTileOverride(2, 3, { unit: "committed" });
        const snapshot = await source.createDeltaCheckpointSnapshot();
        source.setTileOverride(2, 3, { unit: "newer-local-edit" });

        const restoring = source.restoreDeltaCheckpointSnapshot(snapshot);
        await deltas.replaceEntered;
        expect(() => source.setTileOverride(4, 5, { unit: "must-not-disappear" }))
            .toThrow(/being restored/);
        await expect(source.createDeltaCheckpointSnapshot()).rejects.toThrow(/being restored/);
        await expect(source.clearDeltas()).rejects.toThrow(/being restored/);
        deltas.release();
        await restoring;

        expect(source.store.getTileOverride(2, 3)).toEqual({ unit: "committed" });
        expect(source.store.getTileOverride(4, 5)).toBeUndefined();
        source.dispose();
    });

    test("restores application state and terrain deltas from the same manifest generation", async () => {
        let state: State = { value: "committed" };
        const application: GenerationCheckpointParticipant<State> = {
            id: "application-state",
            version: 1,
            required: true,
            capture: () => ({ ...state }),
            restore: (_context, snapshot) => { state = { ...snapshot }; }
        };

        const pool = new WorldGeneratorPool("unused", {
            size: 1,
            clientFactory: () => ({
                generateChunk: options => Promise.resolve(generateWorldChunk(options)),
                dispose() {},
                get isDisposed() { return false; }
            })
        });
        const source = new ProceduralWorldSource({
            seed: "participant-world",
            workerUrl: "unused",
            chunkSize: 12,
            worldId: "participant-world"
        }, {
            pool,
            deltaStore: new MemoryWorldDeltaStore()
        });
        const chunk = await source.loadChunk(0, 0);
        source.setTileOverride(2, 3, { unit: "committed" });

        const coordinator = new GenerationCheckpointCoordinator({
            withWorldState: operation => operation(),
            worldId: source.worldId,
            descriptor: source.descriptor,
            store: new MemoryGenerationCheckpointStore(),
            participants: [
                application,
                createWorldDeltaGenerationParticipant(source)
            ],
            orphanGraceMs: 0
        });
        await coordinator.checkpoint();

        state.value = "uncommitted";
        source.setTileOverride(2, 3, { unit: "uncommitted" });
        await coordinator.recover();

        expect(state).toEqual({ value: "committed" });
        expect(source.store.getTileOverride(2, 3)).toEqual({ unit: "committed" });
        expect(coordinator.stats.latestGeneration).toBe(1);

        coordinator.dispose();
        source.releaseChunk(chunk);
        source.dispose();
    });
});
