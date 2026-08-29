import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import { createAuthoredLakeFeature } from "../../src/world/HydrologyFeatureDelta";
import {
    IndexedDbSurfaceDeltaStore,
    SurfaceDeltaCommitBackpressureError,
    SurfaceDeltaSessionConflictError,
    indexedDbSurfaceDeltaCommitBytes
} from "../../src/world/IndexedDbSurfaceDeltaStore";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import { SEMANTIC_DELTA_FIELD_HEIGHT } from "../../src/world/SparseSemanticDelta";
import {
    BaseHydrologyFeatureIndex,
    SurfaceDeltaTransactionInput,
    SurfaceSemanticDeltaPayload
} from "../../src/world/SurfaceDeltaStore";
import { serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

const EMPTY_BASE_INDEX: BaseHydrologyFeatureIndex = {
    resolveFeature: () => undefined,
    referencesTo: () => []
};

let databaseSequence = 0;

function databaseName(label: string): string {
    databaseSequence += 1;
    return `surface-delta-test-${label}-${databaseSequence}`;
}

function heightPayload(height = 40_000): SurfaceSemanticDeltaPayload {
    return {
        tileIndex: new Uint16Array([0]),
        fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
        macroHeight: new Uint16Array([height]),
        substrateClass: new Uint8Array(1),
        biomeWeights: new Uint8Array(4),
        vegetationDensity: new Uint8Array(1),
        vegetationProfile: new Uint8Array(1)
    };
}

function semanticUpsert(
    worldIdentity: string,
    expectedRevision = 0,
    height = 40_000
): SurfaceDeltaTransactionInput {
    return {
        worldIdentity,
        semanticMutations: [{
            operation: "upsert",
            key: { chunkX: -1, chunkY: 2 },
            expectedRevision,
            payload: heightPayload(height)
        }],
        hydrologyMutations: []
    };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error), { once: true });
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
}

function openDatabase(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error), { once: true });
    });
}

beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        writable: true,
        value: new IDBFactory()
    });
});

afterEach(() => {
    Reflect.deleteProperty(globalThis, "indexedDB");
});

describe("IndexedDbSurfaceDeltaStore", () => {
    test("previews after queued durable commits without publishing or persisting the candidate", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("durable-preview");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const name = databaseName("preview");
        const store = await IndexedDbSurfaceDeltaStore.open({
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: name,
            maxPendingCommitBytes: 1024 * 1024
        });
        const committed = store.commit(semanticUpsert(worldIdentity));
        const previewed = store.preview(semanticUpsert(worldIdentity, 1, 42_000));
        await committed;
        const prepared = await previewed;

        expect(prepared.before).toBe(store.snapshot());
        expect(prepared.before.effectiveRevision).toBe(1);
        expect(prepared.snapshot.effectiveRevision).toBe(2);
        expect(prepared.snapshot.getSemanticDelta(-1, 2)?.macroHeight[0]).toBe(42_000);
        expect(store.snapshot().effectiveRevision).toBe(1);
        await store.commitPrepared(prepared);
        expect(store.snapshot()).toBe(prepared.snapshot);
        await store.close();

        const reopened = await IndexedDbSurfaceDeltaStore.open({
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: name,
            maxPendingCommitBytes: 1024 * 1024
        });
        expect(reopened.snapshot().effectiveRevision).toBe(2);
        expect(reopened.snapshot().getSemanticDelta(-1, 2)?.macroHeight[0]).toBe(42_000);
        await reopened.close();
    });

    test("publishes only after one native transaction and restores canonical binary records", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("durable-surface");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const name = databaseName("restore");
        const store = await IndexedDbSurfaceDeltaStore.open({
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: name,
            maxPendingCommitBytes: 1024 * 1024
        });
        const lake = createAuthoredLakeFeature({
            featureId: "lake:durable",
            polygon: new Float64Array([0, 0, 64, 0, 64, 64, 0, 64]),
            level: 35_000,
            profileIndex: 2
        });
        const payload = heightPayload();
        const pending = store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: -1, chunkY: 2 },
                expectedRevision: 0,
                payload
            }],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: lake.featureId,
                featureKind: "lake",
                expectedRevision: 0,
                feature: lake
            }]
        });
        expect(store.snapshot().effectiveRevision).toBe(0);
        payload.macroHeight[0] = 1;
        lake.polygon[0] = -64;
        const commit = await pending;
        expect(commit.revision).toBe(1);
        expect(store.snapshot().getSemanticDelta(-1, 2)?.macroHeight[0]).toBe(40_000);
        expect(store.stats).toMatchObject({
            effectiveRevision: 1,
            persistedRevision: 1,
            pendingCommits: 0,
            pendingCommitBytes: 0
        });
        await store.flush();
        await store.close();

        const reopened = await IndexedDbSurfaceDeltaStore.open({
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: name,
            maxPendingCommitBytes: 1024 * 1024
        });
        expect(reopened.snapshot().effectiveRevision).toBe(1);
        expect(reopened.snapshot().getSemanticDelta(-1, 2)?.macroHeight[0]).toBe(40_000);
        const restoredLake = reopened.snapshot().getHydrologyDelta("lake:durable");
        expect(restoredLake?.operation).toBe("upsert");
        expect(restoredLake?.operation === "upsert" && restoredLake.feature.kind === "lake"
            ? restoredLake.feature.polygon[0] : -1).toBe(0);

        await reopened.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "delete",
                key: { chunkX: -1, chunkY: 2 },
                expectedRevision: 1
            }],
            hydrologyMutations: [{
                operation: "delete",
                featureId: "lake:durable",
                featureKind: "lake",
                expectedRevision: 1
            }]
        });
        await reopened.close();

        const tombstones = await IndexedDbSurfaceDeltaStore.open({
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: name,
            maxPendingCommitBytes: 1024 * 1024
        });
        expect(tombstones.snapshot().effectiveRevision).toBe(2);
        expect(tombstones.snapshot().getSemanticDelta(-1, 2)).toBeUndefined();
        expect(tombstones.snapshot().getSemanticRevision(-1, 2)).toBe(2);
        expect(tombstones.snapshot().getHydrologyDelta("lake:durable"))
            .toMatchObject({ operation: "delete", revision: 2 });
        await tombstones.close();
    });

    test("rejects a stale durable session without publishing its candidate snapshot", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("durable-conflict");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const name = databaseName("conflict");
        const options = {
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: name,
            maxPendingCommitBytes: 1024 * 1024
        };
        const first = await IndexedDbSurfaceDeltaStore.open(options);
        const stale = await IndexedDbSurfaceDeltaStore.open(options);
        await first.commit(semanticUpsert(worldIdentity));

        await expect(stale.commit(semanticUpsert(worldIdentity)))
            .rejects.toBeInstanceOf(SurfaceDeltaSessionConflictError);
        expect(stale.snapshot().effectiveRevision).toBe(0);
        expect(stale.snapshot().getSemanticDelta(-1, 2)).toBeUndefined();
        await expect(stale.flush()).rejects.toBeInstanceOf(SurfaceDeltaSessionConflictError);
        await stale.close();
        await first.close();
    });

    test("bounds queued transaction ownership by explicit bytes and preserves the save barrier", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("durable-budget");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const input = semanticUpsert(worldIdentity);
        const bytes = indexedDbSurfaceDeltaCommitBytes(descriptor, input);
        const store = await IndexedDbSurfaceDeltaStore.open({
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: databaseName("budget"),
            maxPendingCommitBytes: bytes
        });
        const first = store.commit(input);
        expect(store.stats).toMatchObject({ pendingCommits: 1, pendingCommitBytes: bytes });
        await expect(store.commit(input)).rejects.toBeInstanceOf(SurfaceDeltaCommitBackpressureError);
        await store.flush();
        expect((await first).revision).toBe(1);
        expect(store.stats).toMatchObject({
            effectiveRevision: 1,
            pendingCommits: 0,
            pendingCommitBytes: 0,
            maximumPendingCommitBytes: bytes
        });
        await store.close();
    });

    test("fails opening instead of accepting a corrupted persisted binary payload", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("durable-corruption");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const name = databaseName("corruption");
        const options = {
            descriptor,
            baseHydrology: EMPTY_BASE_INDEX,
            databaseName: name,
            maxPendingCommitBytes: 1024 * 1024
        };
        const store = await IndexedDbSurfaceDeltaStore.open(options);
        await store.commit(semanticUpsert(worldIdentity));
        await store.close();

        const database = await openDatabase(name);
        const transaction = database.transaction("surface-semantic", "readwrite");
        const completion = transactionComplete(transaction);
        const objectStore = transaction.objectStore("surface-semantic");
        const records = await requestResult(objectStore.getAll()) as Array<{
            key: string;
            payload: ArrayBuffer;
        }>;
        expect(records).toHaveLength(1);
        const corrupted = records[0].payload.slice(0);
        new DataView(corrupted).setUint32(0, 0, true);
        objectStore.put({ ...records[0], payload: corrupted });
        await completion;
        database.close();

        await expect(IndexedDbSurfaceDeltaStore.open(options)).rejects.toThrow(/header/);
    });
});
