import { describe, expect, test } from "vitest";

import {
    SEMANTIC_DELTA_FIELD_HEIGHT
} from "../../src/world/SparseSemanticDelta";
import {
    BaseHydrologyFeatureIndex,
    EffectiveHydrologyGraphNode,
    MemorySurfaceDeltaStore,
    SurfaceDeltaConflictError,
    SurfaceSemanticDeltaPayload
} from "../../src/world/SurfaceDeltaStore";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import { createAuthoredRiverFeature } from "../../src/world/HydrologyFeatureDelta";
import { serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

function heightPayload(tileIndex = 0, height = 40_000): SurfaceSemanticDeltaPayload {
    return {
        tileIndex: new Uint16Array([tileIndex]),
        fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
        macroHeight: new Uint16Array([height]),
        substrateClass: new Uint8Array([0]),
        biomeWeights: new Uint8Array(4),
        vegetationDensity: new Uint8Array([0]),
        vegetationProfile: new Uint8Array([0])
    };
}

function river(
    featureId: string,
    source: { kind: "spring"; sourceId: string } | { kind: "river"; riverId: string },
    outlet: { kind: "ocean"; bodyId: "ocean" } | { kind: "river"; riverId: string },
    sourceLevel: number,
    outletLevel: number
) {
    return createAuthoredRiverFeature({
        featureId,
        source,
        outlet,
        controlPoints: new Float64Array([0, sourceLevel, 64, outletLevel]),
        widthProfile: new Uint8Array([1, 2]),
        levelProfile: new Uint16Array([sourceLevel, outletLevel]),
        dischargeClass: 1,
        profileIndex: 0
    });
}

function baseIndex(nodes: readonly EffectiveHydrologyGraphNode[]): BaseHydrologyFeatureIndex {
    const byId = new Map(nodes.map(node => [node.featureId, node]));
    return {
        resolveFeature: featureId => byId.get(featureId),
        referencesTo: featureId => nodes.filter(node => node.kind === "river"
            && (node.source.kind === "river" && node.source.riverId === featureId
                || node.outlet.kind === "river" && node.outlet.riverId === featureId
                || node.outlet.kind === "lake" && node.outlet.bodyId === featureId))
            .map(node => node.featureId)
            .sort()
    };
}

describe("MemorySurfaceDeltaStore", () => {
    test("previews an immutable candidate without publishing it", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("preview");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([]));
        const before = store.snapshot();
        const payload = heightPayload(17, 41_000);
        const prepared = await store.preview({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: -1, chunkY: 2 },
                expectedRevision: 0,
                payload
            }],
            hydrologyMutations: []
        });

        expect(prepared.before).toBe(before);
        expect(prepared.commit).toMatchObject({ revision: 1, transactionId: 1n });
        expect(prepared.snapshot.getSemanticDelta(-1, 2)?.macroHeight[0]).toBe(41_000);
        expect(store.snapshot()).toBe(before);
        payload.macroHeight[0] = 1;
        expect(prepared.snapshot.getSemanticDelta(-1, 2)?.macroHeight[0]).toBe(41_000);
        await expect(store.commitPrepared(prepared)).resolves.toBe(prepared.commit);
        expect(store.snapshot()).toBe(prepared.snapshot);
        await expect(store.commitPrepared(prepared)).rejects.toThrow(/already consumed/);
    });

    test("rejects a prepared candidate after its exact before snapshot becomes stale", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("stale-preview");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([]));
        const stale = await store.preview({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: heightPayload()
            }],
            hydrologyMutations: []
        });
        await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 1, chunkY: 0 },
                expectedRevision: 0,
                payload: heightPayload(0, 42_000)
            }],
            hydrologyMutations: []
        });

        await expect(store.commitPrepared(stale)).rejects.toThrow(/no longer follows/);
        expect(store.snapshot().effectiveRevision).toBe(1);
        expect(store.snapshot().getSemanticDelta(0, 0)).toBeUndefined();
    });

    test("commits semantic and hydrology mutations under one immutable revision", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("atomic");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([]));
        const before = store.snapshot();
        const payload = heightPayload();
        const feature = river(
            "river:authored:0",
            { kind: "spring", sourceId: "spring:0" },
            { kind: "ocean", bodyId: "ocean" },
            40_000,
            30_000
        );
        const commit = await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: -2, chunkY: 3 },
                expectedRevision: 0,
                payload
            }],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: feature.featureId,
                featureKind: "river",
                expectedRevision: 0,
                feature
            }]
        });
        expect(commit).toMatchObject({ revision: 1, transactionId: 1n });
        expect(commit.semanticChanges[0].operation).toBe("upsert");
        expect(commit.hydrologyChanges[0].delta.revision).toBe(1);
        expect(before.effectiveRevision).toBe(0);
        expect(before.getSemanticDelta(-2, 3)).toBeUndefined();
        expect(store.snapshot().getSemanticDelta(-2, 3)?.revision).toBe(1);
        expect(store.snapshot().getHydrologyRevision(feature.featureId)).toBe(1);
        payload.macroHeight[0] = 1;
        feature.levelProfile[0] = 1;
        expect(store.snapshot().getSemanticDelta(-2, 3)?.macroHeight[0]).toBe(40_000);
        expect(store.snapshot().getHydrologyDelta(feature.featureId)?.operation).toBe("upsert");
        const stored = store.snapshot().getHydrologyDelta(feature.featureId);
        expect(stored?.operation === "upsert" && stored.feature.kind === "river"
            ? stored.feature.levelProfile[0] : 0).toBe(40_000);
    });

    test("rejects one stale entity CAS without publishing any part of the transaction", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("cas");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([]));
        await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: heightPayload()
            }],
            hydrologyMutations: []
        });
        await expect(store.commit({
            worldIdentity,
            semanticMutations: [
                {
                    operation: "upsert",
                    key: { chunkX: 1, chunkY: 0 },
                    expectedRevision: 0,
                    payload: heightPayload(1, 42_000)
                },
                {
                    operation: "delete",
                    key: { chunkX: 0, chunkY: 0 },
                    expectedRevision: 0
                }
            ],
            hydrologyMutations: []
        })).rejects.toBeInstanceOf(SurfaceDeltaConflictError);
        expect(store.snapshot().effectiveRevision).toBe(1);
        expect(store.snapshot().getSemanticDelta(1, 0)).toBeUndefined();
        expect(store.snapshot().getSemanticDelta(0, 0)).toBeDefined();
    });

    test("retains semantic tombstone revisions to prevent ABA after deletion", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("aba");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([]));
        await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: heightPayload()
            }],
            hydrologyMutations: []
        });
        await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "delete",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 1
            }],
            hydrologyMutations: []
        });
        expect(store.snapshot().getSemanticDelta(0, 0)).toBeUndefined();
        expect(store.snapshot().getSemanticRevision(0, 0)).toBe(2);
        await expect(store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: heightPayload()
            }],
            hydrologyMutations: []
        })).rejects.toBeInstanceOf(SurfaceDeltaConflictError);
    });

    test("rejects revision-only semantic upserts with identical authoritative content", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("no-op");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([]));
        await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: heightPayload()
            }],
            hydrologyMutations: []
        });
        await expect(store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 1,
                payload: heightPayload()
            }],
            hydrologyMutations: []
        })).rejects.toThrow(/does not change authoritative content/);
        expect(store.snapshot().effectiveRevision).toBe(1);
    });

    test("rejects revision-only hydrology upserts with identical feature content", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("hydrology-no-op");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([]));
        const feature = river(
            "river:no-op",
            { kind: "spring", sourceId: "spring:no-op" },
            { kind: "ocean", bodyId: "ocean" },
            40_000,
            35_000
        );
        await store.commit({
            worldIdentity,
            semanticMutations: [],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: feature.featureId,
                featureKind: "river",
                expectedRevision: 0,
                feature
            }]
        });
        await expect(store.commit({
            worldIdentity,
            semanticMutations: [],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: feature.featureId,
                featureKind: "river",
                expectedRevision: 1,
                feature
            }]
        })).rejects.toThrow(/does not change authoritative content/);
        expect(store.snapshot().effectiveRevision).toBe(1);
    });

    test("validates the complete candidate hydrology graph before publication", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("graph");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const baseRiver: EffectiveHydrologyGraphNode = {
            kind: "river",
            featureId: "river:base",
            source: { kind: "spring", sourceId: "spring:base" },
            outlet: { kind: "ocean", bodyId: "ocean" },
            sourceLevel: 45_000,
            outletLevel: 35_000
        };
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([baseRiver]));
        const downstream = river(
            "river:downstream",
            { kind: "river", riverId: "river:base" },
            { kind: "ocean", bodyId: "ocean" },
            34_000,
            30_000
        );
        await expect(store.commit({
            worldIdentity,
            semanticMutations: [],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: downstream.featureId,
                featureKind: "river",
                expectedRevision: 0,
                feature: downstream
            }]
        })).rejects.toThrow(/does not outlet/);
        expect(store.snapshot().effectiveRevision).toBe(0);

        const rewiredBase = river(
            "river:base",
            { kind: "spring", sourceId: "spring:base" },
            { kind: "river", riverId: "river:downstream" },
            45_000,
            35_000
        );
        await store.commit({
            worldIdentity,
            semanticMutations: [],
            hydrologyMutations: [rewiredBase, downstream].map(feature => ({
                operation: "upsert" as const,
                featureId: feature.featureId,
                featureKind: "river" as const,
                expectedRevision: 0,
                feature
            }))
        });
        expect(store.snapshot().effectiveRevision).toBe(1);

        const first = river(
            "river:first",
            { kind: "spring", sourceId: "spring:first" },
            { kind: "river", riverId: "river:second" },
            35_000,
            35_000
        );
        const second = river(
            "river:second",
            { kind: "river", riverId: "river:first" },
            { kind: "river", riverId: "river:first" },
            35_000,
            35_000
        );
        await expect(store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 4, chunkY: -1 },
                expectedRevision: 0,
                payload: heightPayload()
            }],
            hydrologyMutations: [first, second].map(feature => ({
                operation: "upsert" as const,
                featureId: feature.featureId,
                featureKind: "river" as const,
                expectedRevision: 0,
                feature
            }))
        })).rejects.toThrow(/cycle/);
        expect(store.snapshot().effectiveRevision).toBe(1);
        expect(store.snapshot().getSemanticDelta(4, -1)).toBeUndefined();
    });

    test("rejects deletion that would strand a base reverse reference", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("delete-reference");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const lake: EffectiveHydrologyGraphNode = {
            kind: "lake", featureId: "lake:base", level: 30_000
        };
        const riverNode: EffectiveHydrologyGraphNode = {
            kind: "river",
            featureId: "river:base",
            source: { kind: "spring", sourceId: "spring:base" },
            outlet: { kind: "lake", bodyId: "lake:base" },
            sourceLevel: 40_000,
            outletLevel: 31_000
        };
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex([lake, riverNode]));
        await expect(store.commit({
            worldIdentity,
            semanticMutations: [],
            hydrologyMutations: [{
                operation: "delete",
                featureId: "lake:base",
                featureKind: "lake",
                expectedRevision: 0
            }]
        })).rejects.toThrow(/missing or mismatched outlet/);
        expect(store.snapshot().getHydrologyDelta("lake:base")).toBeUndefined();
    });
});
