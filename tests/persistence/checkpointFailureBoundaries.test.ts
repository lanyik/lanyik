import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorldDescriptor } from "../../src/world/WorldDescriptor";
import {
    GenerationCheckpointCoordinator, MemoryGenerationCheckpointStore,
    IndexedDbGenerationCheckpointStore, assertGenerationCheckpointManifest,
    type GenerationCheckpointManifest, type GenerationCheckpointStore
} from "../../src/persistence/GenerationCheckpointCoordinator";
import { deferred } from "../helpers/deferred";

const descriptor = createWorldDescriptor({ seed: "checkpoint-boundaries", chunkSize: 24 });
const participant = { id: "state", version: 1, capture: () => ({ value: 7 }), restore: vi.fn() };
function coordinator(store: GenerationCheckpointStore, options: { createSaveId?: () => string; operationTimeoutMs?: number } = {}) {
    return new GenerationCheckpointCoordinator({ worldId: "world", descriptor, store,
        participants: [participant], withWorldState: operation => operation(), ...options });
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); participant.restore.mockClear(); });

describe("checkpoint failure boundaries", () => {
    test("cancellation while waiting for the world boundary prevents a late capture", async () => {
        const entered = deferred(), release = deferred();
        const capture = vi.fn(() => ({}));
        const writer = new GenerationCheckpointCoordinator({
            worldId: "queued-boundary", descriptor, store: new MemoryGenerationCheckpointStore(),
            participants: [{ id: "state", version: 1, capture, restore() {} }],
            withWorldState: async operation => { entered.resolve(); await release.promise; return operation(); }
        });
        const controller = new AbortController();
        const failed = expect(writer.checkpoint(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        await entered.promise;
        controller.abort();
        await failed;
        await writer.settled;
        release.resolve();
        await Promise.resolve();
        expect(capture).not.toHaveBeenCalled();
        writer.dispose();
    });

    test("keeps a committed generation when acknowledgement and subsequent reads fail", async () => {
        class Store extends MemoryGenerationCheckpointStore {
            unavailable = false;
            override loadManifest(worldId: string) {
                return this.unavailable ? Promise.reject(new Error("read unavailable")) : super.loadManifest(worldId);
            }
            override async compareAndSetManifest(worldId: string, revision: number, manifest: GenerationCheckpointManifest) {
                await super.compareAndSetManifest(worldId, revision, manifest);
                this.unavailable = true;
                throw new Error("acknowledgement lost");
            }
        }
        const store = new Store(), writer = coordinator(store);
        await expect(writer.checkpoint()).rejects.toThrow("acknowledgement lost");
        expect(await store.listStages("world")).toHaveLength(1);
        store.unavailable = false;
        await coordinator(store).recover();
        expect(participant.restore).toHaveBeenCalledWith(expect.anything(), { value: 7 });
    });

    test("a delayed failure cannot delete the previous generation of a later writer", async () => {
        const committed = deferred(), release = deferred();
        class Store extends MemoryGenerationCheckpointStore {
            override async compareAndSetManifest(worldId: string, revision: number, manifest: GenerationCheckpointManifest) {
                await super.compareAndSetManifest(worldId, revision, manifest);
                if (manifest.saveId === "first") { committed.resolve(); await release.promise; throw new Error("late failure"); }
            }
        }
        const store = new Store();
        const first = coordinator(store, { createSaveId: () => "first" }).checkpoint();
        const failed = expect(first).rejects.toThrow("late failure");
        await committed.promise;
        await coordinator(store, { createSaveId: () => "second" }).checkpoint();
        release.resolve();
        await failed;
        const manifest = await store.loadManifest("world");
        expect(manifest?.previous?.saveId).toBe("first");
        expect((await store.listStages("world")).map(stage => stage.saveId).sort()).toEqual(["first", "second"]);
    });

    test.each(["abort", "dispose"] as const)("%s during staged reads never publishes later", async action => {
        const entered = deferred(), release = deferred();
        class Store extends MemoryGenerationCheckpointStore {
            override async loadStage(key: string, signal?: AbortSignal) {
                entered.resolve(); await release.promise;
                return super.loadStage(key, signal);
            }
        }
        const store = new Store(), writer = coordinator(store), controller = new AbortController();
        const saving = writer.checkpoint(controller.signal);
        const failed = expect(saving).rejects.toMatchObject({ name: "AbortError" });
        await entered.promise;
        if (action === "abort") controller.abort(); else writer.dispose(false);
        await failed;
        release.resolve();
        await writer.settled;
        expect(await store.loadManifest("world")).toBeUndefined();
    });

    test("the operation deadline includes the initial manifest read", async () => {
        vi.useFakeTimers();
        const entered = deferred(), release = deferred<GenerationCheckpointManifest | undefined>();
        class Store extends MemoryGenerationCheckpointStore {
            override loadManifest() { entered.resolve(); return release.promise; }
        }
        const writer = coordinator(new Store(), { operationTimeoutMs: 20 });
        const failed = expect(writer.checkpoint()).rejects.toMatchObject({ name: "TimeoutError" });
        await entered.promise;
        await vi.advanceTimersByTimeAsync(20);
        await failed;
        release.resolve(undefined);
        expect(writer.stats.running).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    test("cancellation after the manifest commits still returns the committed generation", async () => {
        const controller = new AbortController();
        class Store extends MemoryGenerationCheckpointStore {
            override async compareAndSetManifest(worldId: string, revision: number, manifest: GenerationCheckpointManifest) {
                await super.compareAndSetManifest(worldId, revision, manifest);
                controller.abort();
            }
        }
        await expect(coordinator(new Store()).checkpoint(controller.signal)).resolves.toMatchObject({ generation: 1 });
    });

    test.each(["before", "during"] as const)("cancelling %s IndexedDB publication leaves the old manifest unchanged", async when => {
        const store = new IndexedDbGenerationCheckpointStore({ databaseName: crypto.randomUUID() });
        const writer = coordinator(store);
        const saved = await writer.checkpoint();
        const controller = new AbortController();
        if (when === "before") controller.abort();
        else {
            const put = IDBObjectStore.prototype.put;
            vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
                const request = put.apply(this, args);
                if (this.name === "manifests") controller.abort();
                return request;
            });
        }
        await expect(store.compareAndSetManifest("world", saved.revision,
            { ...saved, revision: saved.revision + 1 }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect((await store.loadManifest("world"))?.revision).toBe(saved.revision);
        writer.dispose(); await writer.settled;
    });

    test("obsolete manifest formats are rejected", async () => {
        const saved = await coordinator(new MemoryGenerationCheckpointStore()).checkpoint();
        expect(() => assertGenerationCheckpointManifest({ ...saved, formatVersion: 1 })).toThrow(/metadata/);
    });
});
