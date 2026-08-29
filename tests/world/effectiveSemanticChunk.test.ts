import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo } from "../../src/interfaces";
import {
    semanticCatalogLimits,
    semanticTileIndex
} from "../../src/world/BaseSemanticChunk";
import {
    createEffectiveSemanticChunk,
    getEffectiveSemanticTile
} from "../../src/world/EffectiveSemanticChunk";
import {
    CORE_WORLD_SEMANTICS_V2,
    createCoreInfiniteWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import {
    SEMANTIC_DELTA_FIELD_BIOME,
    SEMANTIC_DELTA_FIELD_HEIGHT,
    SEMANTIC_DELTA_FIELD_SUBSTRATE,
    SEMANTIC_DELTA_FIELD_VEGETATION,
    createSparseSemanticDelta
} from "../../src/world/SparseSemanticDelta";
import { createWorldDescriptorV2, serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { compileStaticSemanticChunk } from "../../src/world/compileStaticSemanticChunk";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";

function deltaFor(descriptor: ReturnType<typeof createCoreInfiniteWorldDescriptorV2>) {
    return createSparseSemanticDelta({
        worldIdentity: serializeWorldDescriptorV2(descriptor),
        key: { chunkX: 0, chunkY: 0 },
        revision: 5,
        tileIndex: new Uint16Array([semanticTileIndex(1, 1), semanticTileIndex(1, 2)]),
        fieldMask: new Uint8Array([
            SEMANTIC_DELTA_FIELD_HEIGHT | SEMANTIC_DELTA_FIELD_BIOME,
            SEMANTIC_DELTA_FIELD_SUBSTRATE | SEMANTIC_DELTA_FIELD_VEGETATION
        ]),
        macroHeight: new Uint16Array([50_000, 0]),
        substrateClass: new Uint8Array([0, 2]),
        biomeWeights: new Uint8Array([
            1, 2, 3, 249,
            0, 0, 0, 0
        ]),
        vegetationDensity: new Uint8Array([0, 200]),
        vegetationProfile: new Uint8Array([0, 3])
    }, semanticCatalogLimits(descriptor));
}

function partialStaticMap(): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < 33; x += 1) data[x] = { 0: { type: Land.land } };
    return { data, w: 33, h: 1 };
}

describe("EffectiveSemanticChunk", () => {
    test("keeps base SoA authority and overlays one sparse entry lookup", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("effective-semantic");
        const base = generateBaseSemanticChunk({ descriptor, chunkX: 0, chunkY: 0 });
        const delta = deltaFor(descriptor);
        const snapshot = createEffectiveSemanticChunk({
            descriptor,
            base,
            delta,
            effectiveRevision: 7
        });
        expect(snapshot.base).toBe(base);
        expect(snapshot.delta).toBe(delta);
        expect(snapshot).toMatchObject({ baseRevision: 0, deltaRevision: 5, effectiveRevision: 7 });

        const heightAndBiome = getEffectiveSemanticTile(snapshot, 1, 1);
        expect(heightAndBiome).toMatchObject({
            macroHeight: 50_000,
            biomeWeights: [1, 2, 3, 249]
        });
        expect(heightAndBiome.substrateClass).toBe(base.substrateClass[semanticTileIndex(1, 1)]);

        const materialAndVegetation = getEffectiveSemanticTile(snapshot, 1, 2);
        expect(materialAndVegetation).toMatchObject({
            substrateClass: 2,
            vegetationDensity: 200,
            vegetationProfile: 3
        });
        expect(materialAndVegetation.macroHeight).toBe(base.macroHeight[semanticTileIndex(1, 2)]);

        expect(getEffectiveSemanticTile(snapshot, 2, 2)).toEqual({
            substrateClass: base.substrateClass[semanticTileIndex(2, 2)],
            macroHeight: base.macroHeight[semanticTileIndex(2, 2)],
            biomeWeights: [
                base.biomeWeights[semanticTileIndex(2, 2) * 4],
                base.biomeWeights[semanticTileIndex(2, 2) * 4 + 1],
                base.biomeWeights[semanticTileIndex(2, 2) * 4 + 2],
                base.biomeWeights[semanticTileIndex(2, 2) * 4 + 3]
            ],
            temperature: base.climate[semanticTileIndex(2, 2) * 2],
            moisture: base.climate[semanticTileIndex(2, 2) * 2 + 1],
            vegetationDensity: base.vegetationDensity[semanticTileIndex(2, 2)],
            vegetationProfile: base.vegetationProfile[semanticTileIndex(2, 2)]
        });
    });

    test("uses an absent delta as the only zero-overlay representation", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("effective-base-only");
        const base = generateBaseSemanticChunk({ descriptor, chunkX: -1, chunkY: 2 });
        const snapshot = createEffectiveSemanticChunk({ descriptor, base, effectiveRevision: 0 });
        expect(snapshot.base).toBe(base);
        expect(snapshot.delta).toBeUndefined();
        expect(snapshot.deltaRevision).toBe(0);
    });

    test("rejects identity, key, revision and partial-bound mismatches", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("effective-contract");
        const base = generateBaseSemanticChunk({ descriptor, chunkX: 0, chunkY: 0 });
        const delta = deltaFor(descriptor);
        expect(() => createEffectiveSemanticChunk({
            descriptor,
            base,
            delta: { ...delta, worldIdentity: "wrong" },
            effectiveRevision: 5
        })).toThrow(/identity or key/);
        expect(() => createEffectiveSemanticChunk({
            descriptor,
            base,
            delta: { ...delta, key: { chunkX: 1, chunkY: 0 } },
            effectiveRevision: 5
        })).toThrow(/identity or key/);
        expect(() => createEffectiveSemanticChunk({
            descriptor,
            base,
            delta,
            effectiveRevision: 4
        })).toThrow(/newer/);

        const staticDescriptor = createWorldDescriptorV2({
            ...CORE_WORLD_SEMANTICS_V2,
            sourceKind: "static",
            sourceContentHash: `sha256:${"f".repeat(64)}`,
            width: 33,
            height: 1
        });
        const partial = compileStaticSemanticChunk({
            map: partialStaticMap(),
            descriptor: staticDescriptor,
            chunkX: 1,
            chunkY: 0
        });
        const outside = createSparseSemanticDelta({
            worldIdentity: serializeWorldDescriptorV2(staticDescriptor),
            key: { chunkX: 1, chunkY: 0 },
            revision: 1,
            tileIndex: new Uint16Array([semanticTileIndex(0, 1)]),
            fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
            macroHeight: new Uint16Array([1]),
            substrateClass: new Uint8Array(1),
            biomeWeights: new Uint8Array(4),
            vegetationDensity: new Uint8Array(1),
            vegetationProfile: new Uint8Array(1)
        }, semanticCatalogLimits(staticDescriptor));
        expect(() => createEffectiveSemanticChunk({
            descriptor: staticDescriptor,
            base: partial,
            delta: outside,
            effectiveRevision: 1
        })).toThrow(/valid bounds/);
    });
});
