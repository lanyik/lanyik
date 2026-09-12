import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

import {
    IndexedDbWorldDeltaStore,
    MemoryWorldDeltaStore,
    normalizeWorldChunkDelta,
    WORLD_DELTA_FORMAT_VERSION,
    WorldDeltaConflictError
} from "../../src/world/WorldDeltaStore";

const CHUNK = { chunkSize: 128 } as const;

describe("MemoryWorldDeltaStore", () => {
    test("dispose releases in-memory deltas", async () => {
        const store = new MemoryWorldDeltaStore();
        await store.putChunkDelta("disposed-world", 0, 0, [
            { x: 1, y: 1, override: { unit: "stored" } }
        ], CHUNK);
        expect((store as unknown as { chunks: Map<string, unknown> }).chunks.size).toBe(1);

        store.dispose();

        expect((store as unknown as { chunks: Map<string, unknown> }).chunks.size).toBe(0);
        await expect(store.loadChunk("disposed-world", 0, 0, CHUNK)).rejects.toThrow("disposed");
    });

    test("merges a chunk batch with one revision and supports compare-and-swap", async () => {
        const store = new MemoryWorldDeltaStore();
        const changes = Array.from({ length: 1000 }, (_, index) => ({
            x: index % 100,
            y: Math.floor(index / 100),
            override: { unit: `unit-${index}` }
        }));

        const first = await store.putChunkDelta("world", 0, 0, changes, { ...CHUNK, expectedRevision: 0 });
        expect(first?.revision).toBe(1);
        expect(first?.entries).toHaveLength(1000);
        await expect(store.putChunkDelta("world", 0, 0, [
            { x: 0, y: 0, override: { unit: "stale" } }
        ], { ...CHUNK, expectedRevision: 0 })).rejects.toEqual(expect.objectContaining({
            name: "WorldDeltaConflictError",
            expectedRevision: 0,
            actualRevision: 1
        }));

        const second = await store.putChunkDelta("world", 0, 0, [
            { x: 0, y: 0, override: null }
        ], { ...CHUNK, expectedRevision: 1 });
        expect(second?.revision).toBe(2);
        expect(second?.entries).toHaveLength(999);
    });

    test("does not advance revision for a semantically empty batch", async () => {
        const store = new MemoryWorldDeltaStore();
        const first = await store.putChunkDelta("world", 0, 0, [
            { x: 1, y: 1, override: { modifiers: ["wood"], city: { name: "A" } } }
        ], CHUNK);
        const same = await store.putChunkDelta("world", 0, 0, [
            { x: 1, y: 1, override: { modifiers: ["wood"], city: { name: "A" } } },
            { x: 2, y: 2, override: null }
        ], CHUNK);
        const netZero = await store.putChunkDelta("world", 0, 0, [
            { x: 3, y: 3, override: { unit: "temporary" } },
            { x: 3, y: 3, override: null }
        ], CHUNK);

        expect([first?.revision, same?.revision, netZero?.revision]).toEqual([1, 1, 1]);
    });

    test("distinguishes an empty city from an empty override", async () => {
        const store = new MemoryWorldDeltaStore();
        const withCity = await store.putChunkDelta("world", 0, 0, [
            { x: 1, y: 1, override: { city: {} } }
        ], CHUNK);
        const withoutCity = await store.putChunkDelta("world", 0, 0, [
            { x: 1, y: 1, override: {} }
        ], CHUNK);

        expect(withCity).toMatchObject({ revision: 1, entries: [{ override: { city: {} } }] });
        expect(withoutCity).toMatchObject({ revision: 2, entries: [] });
    });

    test("rejects foreign entries and obsolete delta formats", async () => {
        const store = new MemoryWorldDeltaStore();
        await expect(store.putChunkDelta("world", 0, 0, [
            { x: 128, y: 0, override: { unit: "foreign" } }
        ], CHUNK)).rejects.toThrow(/declared chunk/);

        expect(() => normalizeWorldChunkDelta({ version: 1, worldId: "world", chunkX: 0, chunkY: 0,
            revision: 3, entries: [{ x: 2, y: 3, override: { unit: "obsolete" } }]
        }, "world", 0, 0, CHUNK)).toThrow(/incompatible/);
        expect(WORLD_DELTA_FORMAT_VERSION).toBe(2);
    });
});

describe("IndexedDbWorldDeltaStore", () => {
    test.each(["before", "during", "after"] as const)("cancellation %s replacement respects the transaction commit point", async when => {
        const store = new IndexedDbWorldDeltaStore({ databaseName: `replacement-${when}` });
        const original = (await store.putChunkDelta("world", 0, 0, [
            { x: 1, y: 1, override: { unit: "current" } }
        ], CHUNK))!;
        const replacement = { ...original, entries: [{ x: 1, y: 1, override: { unit: "restored" } }] };
        const controller = new AbortController();
        if (when === "before") controller.abort();
        else {
            const put = IDBObjectStore.prototype.put;
            vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
                const request = put.apply(this, args);
                if (when === "during") controller.abort();
                else this.transaction.addEventListener("complete", () => controller.abort(), { once: true });
                return request;
            });
        }
        const replacing = Promise.resolve().then(() => store.replaceWorld("world", [replacement], controller.signal));
        if (when === "after") await expect(replacing).resolves.toBeUndefined();
        else await expect(replacing).rejects.toMatchObject({ name: "AbortError" });
        await store.flush().catch(() => undefined);
        expect((await store.loadChunk("world", 0, 0, CHUNK))?.entries[0].override.unit)
            .toBe(when === "after" ? "restored" : "current");
        store.dispose();
    });

    test("reads peer commits and can retry a conflict using a fresh revision", async () => {
        const options = { databaseName: "delta-coherence" };
        const first = new IndexedDbWorldDeltaStore(options), second = new IndexedDbWorldDeltaStore(options);
        const initial = await first.putChunkDelta("world", 0, 0, [{ x: 1, y: 1, override: { unit: "first" } }], CHUNK);
        await second.putChunkDelta("world", 0, 0, [{ x: 1, y: 1, override: { unit: "second" } }],
            { ...CHUNK, expectedRevision: initial!.revision });
        await expect(first.putChunkDelta("world", 0, 0, [{ x: 2, y: 2, override: { unit: "stale" } }],
            { ...CHUNK, expectedRevision: initial!.revision })).rejects.toBeInstanceOf(WorldDeltaConflictError);
        await expect(first.flush()).rejects.toBeInstanceOf(WorldDeltaConflictError);
        const fresh = await first.loadChunk("world", 0, 0, CHUNK);
        expect(fresh).toMatchObject({ revision: 2, entries: [{ override: { unit: "second" } }] });
        const retried = await first.putChunkDelta("world", 0, 0, [{ x: 2, y: 2, override: { unit: "retried" } }],
            { ...CHUNK, expectedRevision: fresh!.revision });
        expect(retried?.revision).toBe(3);
        expect((await second.loadChunk("world", 0, 0, CHUNK))?.revision).toBe(3);
        await first.clear("world");
        expect(await second.loadChunk("world", 0, 0, CHUNK)).toBeUndefined();
        first.dispose(); second.dispose();
    });

    beforeEach(() => {
        Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: new IDBFactory() });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Reflect.deleteProperty(globalThis, "indexedDB");
    });

    test("persists writes and deletions across store instances", async () => {
        const options = { databaseName: "delta-persistence" };
        const first = new IndexedDbWorldDeltaStore(options);
        await first.putChunkDelta("world", 0, 0, [{ x: 2, y: 3, override: { unit: "scout" } }], CHUNK);
        await first.putChunkDelta("world", 0, 0, [{ x: 4, y: 5, override: { city: { name: "Port" } } }], CHUNK);
        await first.flush();

        const second = new IndexedDbWorldDeltaStore(options);
        const restored = await second.loadChunk("world", 0, 0, CHUNK);
        expect(restored?.revision).toBe(2);
        expect(restored?.entries).toEqual([
            { x: 2, y: 3, override: { unit: "scout" } },
            { x: 4, y: 5, override: { city: { name: "Port" } } }
        ]);

        await second.putChunkDelta("world", 0, 0, [{ x: 2, y: 3, override: null }], CHUNK);
        await second.flush();
        const third = new IndexedDbWorldDeltaStore(options);
        expect((await third.loadChunk("world", 0, 0, CHUNK))?.entries).toHaveLength(1);

        first.dispose();
        second.dispose();
        third.dispose();
    });

    test("clears one world without deleting another", async () => {
        const store = new IndexedDbWorldDeltaStore({ databaseName: "delta-clear" });
        await store.putChunkDelta("first", 0, 0, [{ x: 1, y: 1, override: { unit: "one" } }], CHUNK);
        await store.putChunkDelta("second", 0, 0, [{ x: 2, y: 2, override: { unit: "two" } }], CHUNK);
        await store.flush();
        await store.clear("first");

        const reopened = new IndexedDbWorldDeltaStore({ databaseName: "delta-clear" });
        expect(await reopened.loadChunk("first", 0, 0, CHUNK)).toBeUndefined();
        expect((await reopened.loadChunk("second", 0, 0, CHUNK))?.entries[0].override.unit).toBe("two");
        store.dispose();
        reopened.dispose();
    });

    test("merges a first write after reopening instead of replacing persisted entries", async () => {
        const options = { databaseName: "delta-reopen-merge" };
        const first = new IndexedDbWorldDeltaStore(options);
        await first.putChunkDelta("world", 0, 0, [
            { x: 1, y: 1, override: { unit: "one" } },
            { x: 2, y: 2, override: { unit: "two" } }
        ], CHUNK);
        await first.flush();

        const reopened = new IndexedDbWorldDeltaStore(options);
        await reopened.putChunkDelta("world", 0, 0, [{ x: 3, y: 3, override: { unit: "three" } }], CHUNK);
        await reopened.flush();
        const restored = await reopened.loadChunk("world", 0, 0, CHUNK);
        expect(restored?.revision).toBe(2);
        expect(restored?.entries.map(entry => entry.override.unit)).toEqual(["one", "two", "three"]);
        first.dispose();
        reopened.dispose();
    });

    test("checks expectedRevision atomically across store instances", async () => {
        const options = { databaseName: "delta-cas" };
        const first = new IndexedDbWorldDeltaStore(options);
        const second = new IndexedDbWorldDeltaStore(options);
        await first.putChunkDelta("world", 0, 0, [
            { x: 1, y: 1, override: { unit: "first" } }
        ], { ...CHUNK, expectedRevision: 0 });

        await expect(second.putChunkDelta("world", 0, 0, [
            { x: 2, y: 2, override: { unit: "stale" } }
        ], { ...CHUNK, expectedRevision: 0 })).rejects.toBeInstanceOf(WorldDeltaConflictError);
        // The save barrier reports queued write failures too.
        await expect(second.flush()).rejects.toBeInstanceOf(WorldDeltaConflictError);

        const updated = await second.putChunkDelta("world", 0, 0, [
            { x: 2, y: 2, override: { unit: "second" } }
        ], { ...CHUNK, expectedRevision: 1 });
        expect(updated?.revision).toBe(2);
        expect(updated?.entries).toHaveLength(2);
        first.dispose();
        second.dispose();
    });
});
