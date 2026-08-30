import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import { OCEAN_BODY_ID } from "../../src/world/semantic/MacroDrainageGraph";
import { createWorldDescriptorV2 } from "../../src/world/semantic/WorldDescriptorV2";
import {
    IndexedDbWorldDeltaStore,
    MemoryWorldDeltaStore,
    WorldDeltaRevisionConflictError
} from "../../src/world/WorldDeltaStore";
import {
    WorldEditor,
    WorldEditAuthority
} from "../../src/world/WorldEditing";

const RIVER_A = `river:${"a".repeat(32)}`;
const RIVER_B = `river:${"b".repeat(32)}`;
const descriptor = createWorldDescriptorV2({ seed: "delta-v3" });

function river(featureId: string, outlet = OCEAN_BODY_ID) {
    return {
        kind: "river" as const,
        featureId,
        source: { kind: "source" as const },
        outlet: { kind: outlet === OCEAN_BODY_ID ? "body" as const : "river" as const, featureId: outlet },
        controlPoints: new Float64Array([0, 0, 8, 8]),
        widthProfile: new Uint8Array([8, 8]),
        levelProfile: new Uint16Array([40_000, 30_000]),
        dischargeClass: 2
    };
}

describe("WorldDeltaStore v3", () => {
    test("publishes semantic and hydrology mutations through one revision and exact dirty domains", async () => {
        const store = new MemoryWorldDeltaStore();
        const first = await store.commit({
            descriptor,
            expectedRevision: 0,
            semanticMutations: [
                { x: 0, y: 0, macroHeight: 20_000 },
                { x: 40, y: 0, vegetationDensity: 200, vegetationProfile: 3 }
            ],
            hydrologyMutations: [{ kind: "upsert", expectedRevision: 0, feature: river(RIVER_A) }]
        });

        expect(first).toMatchObject({ changed: true, snapshot: { effectiveRevision: 1 } });
        expect(first.snapshot.semanticDeltas.map(delta => [delta.key.chunkX, delta.revision])).toEqual([[0, 1], [1, 1]]);
        expect(first.changeSet?.semanticChunks).toHaveLength(2);
        expect(first.changeSet?.hydrologyFeatures.map(feature => feature.featureId)).toEqual([RIVER_A]);
        expect(first.changeSet?.navigationChunks.length).toBeGreaterThan(0);
        expect(first.changeSet?.simulationChunks.length).toBeGreaterThan(0);

        const second = await store.commit({
            descriptor,
            expectedRevision: 1,
            semanticMutations: [{ x: 1, y: 1, macroHeight: 21_000 }]
        });
        expect(second.snapshot.semanticDeltas.map(delta => [delta.key.chunkX, delta.revision])).toEqual([[0, 2], [1, 1]]);
        expect(second.changeSet?.renderChunks.every(chunk => chunk.key.chunkX <= 0)).toBe(true);
    });

    test("rejects world and feature CAS conflicts without partial publication", async () => {
        const store = new MemoryWorldDeltaStore();
        await store.commit({
            descriptor,
            expectedRevision: 0,
            hydrologyMutations: [{ kind: "upsert", expectedRevision: 0, feature: river(RIVER_A) }]
        });

        await expect(store.commit({
            descriptor,
            expectedRevision: 0,
            semanticMutations: [{ x: 4, y: 4, macroHeight: 10 }]
        })).rejects.toBeInstanceOf(WorldDeltaRevisionConflictError);
        await expect(store.commit({
            descriptor,
            expectedRevision: 1,
            semanticMutations: [{ x: 4, y: 4, macroHeight: 10 }],
            hydrologyMutations: [{ kind: "delete", featureId: RIVER_A, targetKind: "river", expectedRevision: 0 }]
        })).rejects.toMatchObject({ scope: "hydrology-feature" });

        const snapshot = await store.load(descriptor);
        expect(snapshot.effectiveRevision).toBe(1);
        expect(snapshot.semanticDeltas).toHaveLength(0);
        expect(snapshot.hydrologyFeatures).toHaveLength(1);
    });

    test("rejects a cyclic edited river graph atomically", async () => {
        const store = new MemoryWorldDeltaStore();
        await expect(store.commit({
            descriptor,
            expectedRevision: 0,
            hydrologyMutations: [
                { kind: "upsert", expectedRevision: 0, feature: river(RIVER_A, RIVER_B) },
                { kind: "upsert", expectedRevision: 0, feature: river(RIVER_B, RIVER_A) }
            ]
        })).rejects.toThrow(/cycle/);
        expect((await store.load(descriptor)).effectiveRevision).toBe(0);
    });

    test("save barrier compacts pending commits only after returning an owned checkpoint", async () => {
        const store = new MemoryWorldDeltaStore();
        await store.commit({
            descriptor,
            expectedRevision: 0,
            semanticMutations: [{ x: -1, y: -1, vegetationDensity: 55, vegetationProfile: 1 }]
        });
        expect(store.stats.pendingCommitBytes).toBeGreaterThan(0);
        const checkpoint = await store.saveBarrier(descriptor);
        expect(checkpoint.revision).toBe(1);
        expect(store.stats.pendingCommitBytes).toBe(0);

        const restored = new MemoryWorldDeltaStore();
        await restored.restoreBarrier(descriptor, checkpoint);
        expect(await restored.load(descriptor)).toMatchObject({ effectiveRevision: 1 });
    });
});

describe("IndexedDbWorldDeltaStore v3", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: new IDBFactory() });
    });

    afterEach(() => { Reflect.deleteProperty(globalThis, "indexedDB"); });

    test("serializes CAS across independent store instances", async () => {
        const options = { databaseName: "world-delta-v3-cas" };
        const first = new IndexedDbWorldDeltaStore(options);
        const second = new IndexedDbWorldDeltaStore(options);
        await first.commit({
            descriptor,
            expectedRevision: 0,
            semanticMutations: [{ x: 0, y: 0, macroHeight: 1 }]
        });
        await expect(second.commit({
            descriptor,
            expectedRevision: 0,
            semanticMutations: [{ x: 1, y: 1, macroHeight: 2 }]
        })).rejects.toBeInstanceOf(WorldDeltaRevisionConflictError);
        await expect(second.flush()).rejects.toBeInstanceOf(WorldDeltaRevisionConflictError);
        expect((await second.load(descriptor)).effectiveRevision).toBe(1);
        first.dispose();
        second.dispose();
    });
});

describe("WorldEditor", () => {
    const baseTile = Object.freeze({
        substrateClass: 1,
        macroHeight: 20_000,
        biomeWeights: Object.freeze([255, 0, 0, 0]) as readonly [number, number, number, number],
        vegetationDensity: 0,
        vegetationProfile: 0
    });

    function authority(maximumGroundHeight = 25_000): WorldEditAuthority {
        return {
            readSemanticTile: () => baseTile,
            hydrologyConstraintsAt: (x, y) => x === 0 && y === 0
                ? [{ featureId: RIVER_A, maximumGroundHeight }]
                : []
        };
    }

    test("applies reject, preserve-channel and coupled policies before the atomic commit", async () => {
        const rejectedStore = new MemoryWorldDeltaStore();
        const rejected = await WorldEditor.create({ descriptor, store: rejectedStore, authority: authority() });
        await expect(rejected.edit(transaction => transaction.raiseTerrain(
            { kind: "rectangle", minX: 0, minY: 0, maxX: 0, maxY: 0 },
            { delta: 0.2, falloff: "none", waterPolicy: "reject" }
        ))).rejects.toThrow(/conflicts/);
        expect(rejected.view.effectiveRevision).toBe(0);

        const preservedStore = new MemoryWorldDeltaStore();
        const preserved = await WorldEditor.create({ descriptor, store: preservedStore, authority: authority() });
        const preservedResult = await preserved.edit(transaction => transaction.raiseTerrain(
            { kind: "rectangle", minX: 0, minY: 0, maxX: 0, maxY: 0 },
            { delta: 0.2, falloff: "none", waterPolicy: "preserve-channel" }
        ));
        expect(preservedResult.snapshot.semanticDeltas[0].macroHeight[0]).toBe(25_000);

        const coupledStore = new MemoryWorldDeltaStore();
        const coupled = await WorldEditor.create({ descriptor, store: coupledStore, authority: authority() });
        const coupledResult = await coupled.edit(transaction => {
            transaction.raiseTerrain(
                { kind: "rectangle", minX: 0, minY: 0, maxX: 0, maxY: 0 },
                { delta: 0.2, falloff: "none", waterPolicy: "coupled" }
            );
            transaction.upsertHydrology(river(RIVER_A), 0);
        });
        expect(coupledResult.snapshot.effectiveRevision).toBe(1);
        expect(coupledResult.snapshot.semanticDeltas[0].macroHeight[0]).toBeGreaterThan(25_000);
        expect(coupledResult.snapshot.hydrologyFeatures).toHaveLength(1);
    });

    test("serializes continuous edits against the latest effective revision and save barrier", async () => {
        const store = new MemoryWorldDeltaStore();
        const editor = await WorldEditor.create({ descriptor, store, authority: authority(65_535) });
        const area = { kind: "rectangle" as const, minX: 2, minY: 2, maxX: 2, maxY: 2 };
        const first = editor.edit(transaction => transaction.raiseTerrain(area, { delta: 0.01, falloff: "none" }));
        const second = editor.edit(transaction => transaction.raiseTerrain(area, { delta: 0.01, falloff: "none" }));
        await Promise.all([first, second]);
        expect(editor.view.effectiveRevision).toBe(2);
        const snapshot = editor.view.captureDeltaSnapshot();
        expect(snapshot.semanticDeltas[0].macroHeight[0]).toBe(21_310);
        expect((await editor.saveBarrier()).revision).toBe(2);
        expect(store.stats.pendingCommitBytes).toBe(0);
    });
});
