import { describe, expect, test } from "vitest";

import { createAuthoredLakeFeature } from "../../src/world/HydrologyFeatureDelta";
import { HydrologyFeatureBoundsQ64 } from "../../src/world/HydrologyFeatureSpatialIndex";
import {
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import {
    SEMANTIC_DELTA_FIELD_BIOME,
    SEMANTIC_DELTA_FIELD_HEIGHT,
    SEMANTIC_DELTA_FIELD_VEGETATION
} from "../../src/world/SparseSemanticDelta";
import {
    EffectiveHydrologyGraphNode,
    MemorySurfaceDeltaStore,
    SurfaceSemanticDeltaPayload
} from "../../src/world/SurfaceDeltaStore";
import {
    BaseHydrologyChangeIndex,
    WORLD_CHANGE_DOMAIN_HEIGHT,
    WORLD_CHANGE_DOMAIN_HYDROLOGY,
    WORLD_CHANGE_DOMAIN_MATERIAL,
    WORLD_CHANGE_DOMAIN_VEGETATION,
    createWorldChangeSet
} from "../../src/world/WorldChangeSet";
import { serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

function semanticPayload(): SurfaceSemanticDeltaPayload {
    return {
        tileIndex: new Uint16Array([0, 15 * 32 + 15, 31 * 32]),
        fieldMask: new Uint8Array([
            SEMANTIC_DELTA_FIELD_BIOME,
            SEMANTIC_DELTA_FIELD_HEIGHT,
            SEMANTIC_DELTA_FIELD_VEGETATION
        ]),
        macroHeight: new Uint16Array([0, 40_000, 0]),
        substrateClass: new Uint8Array(3),
        biomeWeights: new Uint8Array([
            255, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0
        ]),
        vegetationDensity: new Uint8Array([0, 0, 255]),
        vegetationProfile: new Uint8Array([0, 0, 2])
    };
}

function emptyChangeIndex(): BaseHydrologyChangeIndex {
    return {
        resolveFeature: () => undefined,
        referencesTo: () => [],
        resolveBoundsQ64: () => undefined
    };
}

function baseChangeIndex(
    nodes: readonly EffectiveHydrologyGraphNode[],
    bounds: ReadonlyMap<string, HydrologyFeatureBoundsQ64>
): BaseHydrologyChangeIndex {
    const byId = new Map(nodes.map(node => [node.featureId, node]));
    return {
        resolveFeature: featureId => byId.get(featureId),
        referencesTo: featureId => nodes.filter(node => node.kind === "river"
            && (node.source.kind === "river" && node.source.riverId === featureId
                || node.outlet.kind === "river" && node.outlet.riverId === featureId
                || node.outlet.kind === "lake" && node.outlet.bodyId === featureId))
            .map(node => node.featureId)
            .sort(),
        resolveBoundsQ64: featureId => bounds.get(featureId)
    };
}

describe("WorldChangeSet", () => {
    test("keeps exact semantic domains and filters render invalidation through the two-tile halo", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("change-semantic");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const base = emptyChangeIndex();
        const store = new MemorySurfaceDeltaStore(descriptor, base);
        const before = store.snapshot();
        const commit = await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: semanticPayload()
            }],
            hydrologyMutations: []
        });
        const changeSet = createWorldChangeSet({
            descriptor,
            baseHydrology: base,
            before,
            commit,
            residency: {
                hydrologyRegions: [],
                renderChunks: [
                    { chunkX: 2, chunkY: 0 },
                    { chunkX: 0, chunkY: 0 },
                    { chunkX: -1, chunkY: 0 },
                    { chunkX: 1, chunkY: 0 }
                ]
            }
        });
        expect(changeSet.domains).toBe(
            WORLD_CHANGE_DOMAIN_HEIGHT
            | WORLD_CHANGE_DOMAIN_MATERIAL
            | WORLD_CHANGE_DOMAIN_VEGETATION
        );
        expect(changeSet.semanticChunks).toEqual([{
            key: { chunkX: 0, chunkY: 0 },
            domains: WORLD_CHANGE_DOMAIN_HEIGHT
                | WORLD_CHANGE_DOMAIN_MATERIAL
                | WORLD_CHANGE_DOMAIN_VEGETATION,
            localBounds: { minX: 0, minY: 0, maxXExclusive: 32, maxYExclusive: 16 },
            domainBounds: [
                {
                    domain: WORLD_CHANGE_DOMAIN_HEIGHT,
                    localBounds: { minX: 15, minY: 15, maxXExclusive: 16, maxYExclusive: 16 }
                },
                {
                    domain: WORLD_CHANGE_DOMAIN_MATERIAL,
                    localBounds: { minX: 0, minY: 0, maxXExclusive: 1, maxYExclusive: 1 }
                },
                {
                    domain: WORLD_CHANGE_DOMAIN_VEGETATION,
                    localBounds: { minX: 31, minY: 0, maxXExclusive: 32, maxYExclusive: 1 }
                }
            ]
        }]);
        expect(changeSet.renderChunks).toEqual([
            {
                key: { chunkX: -1, chunkY: 0 },
                domains: WORLD_CHANGE_DOMAIN_MATERIAL
            },
            {
                key: { chunkX: 0, chunkY: 0 },
                domains: WORLD_CHANGE_DOMAIN_HEIGHT | WORLD_CHANGE_DOMAIN_MATERIAL
            },
            {
                key: { chunkX: 1, chunkY: 0 },
                domains: WORLD_CHANGE_DOMAIN_HEIGHT | WORLD_CHANGE_DOMAIN_VEGETATION
            },
            {
                key: { chunkX: 2, chunkY: 0 },
                domains: WORLD_CHANGE_DOMAIN_VEGETATION
            }
        ]);
    });

    test("propagates a water-body edit through base reverse references without enumerating nonresident space", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("change-hydrology");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const lakeNode: EffectiveHydrologyGraphNode = {
            kind: "lake",
            featureId: "lake:base",
            level: 30_000
        };
        const riverNode: EffectiveHydrologyGraphNode = {
            kind: "river",
            featureId: "river:base",
            source: { kind: "spring", sourceId: "spring:base" },
            outlet: { kind: "lake", bodyId: "lake:base" },
            sourceLevel: 40_000,
            outletLevel: 35_000
        };
        const base = baseChangeIndex([lakeNode, riverNode], new Map([
            ["lake:base", { minX: 0, minY: 0, maxX: 128, maxY: 128 }],
            ["river:base", { minX: 20_000, minY: 0, maxX: 21_000, maxY: 512 }]
        ]));
        const store = new MemorySurfaceDeltaStore(descriptor, base);
        const before = store.snapshot();
        const lake = createAuthoredLakeFeature({
            featureId: "lake:base",
            polygon: new Float64Array([0, 0, 128, 0, 128, 128, 0, 128]),
            level: 31_000,
            profileIndex: 1
        });
        const commit = await store.commit({
            worldIdentity,
            semanticMutations: [],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: lake.featureId,
                featureKind: "lake",
                expectedRevision: 0,
                feature: lake
            }]
        });
        const changeSet = createWorldChangeSet({
            descriptor,
            baseHydrology: base,
            before,
            commit,
            residency: {
                hydrologyRegions: [
                    { regionX: 0, regionY: 0 },
                    { regionX: 1, regionY: 0 },
                    { regionX: 2, regionY: 0 }
                ],
                renderChunks: [
                    { chunkX: 0, chunkY: 0 },
                    { chunkX: 10, chunkY: 0 },
                    { chunkX: 19, chunkY: 0 }
                ]
            }
        });
        expect(changeSet.domains).toBe(WORLD_CHANGE_DOMAIN_HYDROLOGY);
        expect(changeSet.hydrologyFeatures).toEqual([{
            featureId: "lake:base",
            featureKind: "lake",
            operation: "upsert",
            previousBounds: [{ minX: 0, minY: 0, maxX: 128, maxY: 128 }],
            nextBounds: [{ minX: 0, minY: 0, maxX: 128, maxY: 128 }]
        }]);
        expect(changeSet.hydrologyRegions.map(value => value.key)).toEqual([
            { regionX: 0, regionY: 0 },
            { regionX: 2, regionY: 0 }
        ]);
        expect(changeSet.renderChunks).toEqual([
            { key: { chunkX: 0, chunkY: 0 }, domains: WORLD_CHANGE_DOMAIN_HYDROLOGY },
            { key: { chunkX: 19, chunkY: 0 }, domains: WORLD_CHANGE_DOMAIN_HYDROLOGY }
        ]);
    });

    test("projects semantic dirtiness across a toroidal seam", async () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("change-wrap", 32, 32);
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const base = emptyChangeIndex();
        const store = new MemorySurfaceDeltaStore(descriptor, base);
        const before = store.snapshot();
        const payload = semanticPayload();
        const commit = await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: {
                    ...payload,
                    tileIndex: new Uint16Array([0]),
                    fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
                    macroHeight: new Uint16Array([40_000]),
                    substrateClass: new Uint8Array(1),
                    biomeWeights: new Uint8Array(4),
                    vegetationDensity: new Uint8Array(1),
                    vegetationProfile: new Uint8Array(1)
                }
            }],
            hydrologyMutations: []
        });
        const changeSet = createWorldChangeSet({
            descriptor,
            baseHydrology: base,
            before,
            commit,
            residency: {
                hydrologyRegions: [],
                renderChunks: [{ chunkX: 1, chunkY: 0 }]
            }
        });
        expect(changeSet.renderChunks).toEqual([{
            key: { chunkX: 1, chunkY: 0 },
            domains: WORLD_CHANGE_DOMAIN_HEIGHT
        }]);
    });
});
