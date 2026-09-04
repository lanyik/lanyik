import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";

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

    test("rejects entries outside their declared chunk and upgrades valid v1 data", async () => {
        const store = new MemoryWorldDeltaStore();
        await expect(store.putChunkDelta("world", 0, 0, [
            { x: 128, y: 0, override: { unit: "foreign" } }
        ], CHUNK)).rejects.toThrow(/declared chunk/);

        const migrated = normalizeWorldChunkDelta({
            version: 1,
            worldId: "world",
            chunkX: 0,
            chunkY: 0,
            revision: 3,
            entries: [{ x: 2, y: 3, override: { unit: "legacy" } }]
        }, "world", 0, 0, CHUNK);
        expect(migrated).toMatchObject({
            version: WORLD_DELTA_FORMAT_VERSION,
            chunkSize: 128,
            revision: 3
        });
    });
});

describe("IndexedDbWorldDeltaStore", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: new IDBFactory() });
    });

    afterEach(() => {
        Reflect.deleteProperty(globalThis, "indexedDB");
    });

    test("persists writes and deletions across store instances", async () => {
        const options = { databaseName: "delta-persistence" };
        const first = new IndexedDbWorldDeltaStore(options);
        first.putTile("world", 0, 0, { x: 2, y: 3, override: { unit: "scout" } }, CHUNK);
        first.putTile("world", 0, 0, { x: 4, y: 5, override: { city: { name: "Port" } } }, CHUNK);
        await first.flush();

        const second = new IndexedDbWorldDeltaStore(options);
        const restored = await second.loadChunk("world", 0, 0, CHUNK);
        expect(restored?.revision).toBe(2);
        expect(restored?.entries).toEqual([
            { x: 2, y: 3, override: { unit: "scout" } },
            { x: 4, y: 5, override: { city: { name: "Port" } } }
        ]);

        second.deleteTile("world", 0, 0, 2, 3, CHUNK);
        await second.flush();
        const third = new IndexedDbWorldDeltaStore(options);
        expect((await third.loadChunk("world", 0, 0, CHUNK))?.entries).toHaveLength(1);

        first.dispose();
        second.dispose();
        third.dispose();
    });

    test("clears one world without deleting another", async () => {
        const store = new IndexedDbWorldDeltaStore({ databaseName: "delta-clear" });
        store.putTile("first", 0, 0, { x: 1, y: 1, override: { unit: "one" } }, CHUNK);
        store.putTile("second", 0, 0, { x: 2, y: 2, override: { unit: "two" } }, CHUNK);
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
        reopened.putTile("world", 0, 0, { x: 3, y: 3, override: { unit: "three" } }, CHUNK);
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
        // The save barrier reports background/legacy write failures too.
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
