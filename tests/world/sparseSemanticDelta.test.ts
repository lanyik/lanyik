import { describe, expect, test } from "vitest";

import { BaseSemanticChunkCatalogLimits } from "../../src/world/BaseSemanticChunk";
import {
    SEMANTIC_DELTA_FIELD_BIOME,
    SEMANTIC_DELTA_FIELD_HEIGHT,
    SEMANTIC_DELTA_FIELD_SUBSTRATE,
    SEMANTIC_DELTA_FIELD_VEGETATION,
    SparseSemanticDeltaInput,
    assertSparseSemanticDelta,
    createSparseSemanticDelta,
    deserializeSparseSemanticDelta,
    serializeSparseSemanticDelta,
    sparseSemanticDeltaEntryIndex,
    sparseSemanticDeltaSerializedBytes
} from "../../src/world/SparseSemanticDelta";

const LIMITS: Readonly<BaseSemanticChunkCatalogLimits> = Object.freeze({
    substrateCount: 3,
    vegetationProfileCount: 4
});

function validInput(): SparseSemanticDeltaInput {
    return {
        worldIdentity: "world:语义-delta",
        key: { chunkX: -3, chunkY: 5 },
        revision: 7,
        tileIndex: new Uint16Array([0, 33, 1023]),
        fieldMask: new Uint8Array([
            SEMANTIC_DELTA_FIELD_HEIGHT | SEMANTIC_DELTA_FIELD_BIOME,
            SEMANTIC_DELTA_FIELD_SUBSTRATE,
            SEMANTIC_DELTA_FIELD_VEGETATION
        ]),
        macroHeight: new Uint16Array([40_000, 0, 0]),
        substrateClass: new Uint8Array([0, 2, 0]),
        biomeWeights: new Uint8Array([
            10, 20, 30, 195,
            0, 0, 0, 0,
            0, 0, 0, 0
        ]),
        vegetationDensity: new Uint8Array([0, 0, 180]),
        vegetationProfile: new Uint8Array([0, 0, 3])
    };
}

describe("SparseSemanticDelta", () => {
    test("publishes a canonical sparse SoA overlay and binary-searches tile indices", () => {
        const delta = createSparseSemanticDelta(validInput(), LIMITS);
        assertSparseSemanticDelta(delta, LIMITS);
        expect(Object.isFrozen(delta)).toBe(true);
        expect(Object.isFrozen(delta.key)).toBe(true);
        expect(sparseSemanticDeltaEntryIndex(delta, 0)).toBe(0);
        expect(sparseSemanticDeltaEntryIndex(delta, 33)).toBe(1);
        expect(sparseSemanticDeltaEntryIndex(delta, 34)).toBe(-1);
        expect(sparseSemanticDeltaEntryIndex(delta, 1023)).toBe(2);
    });

    test("round-trips a deterministic little-endian variable-length format", () => {
        const delta = createSparseSemanticDelta(validInput(), LIMITS);
        const encoded = serializeSparseSemanticDelta(delta, LIMITS);
        expect(encoded.byteLength).toBe(sparseSemanticDeltaSerializedBytes(delta));
        const decoded = deserializeSparseSemanticDelta(encoded, LIMITS);
        expect(decoded).toEqual(delta);
        expect(new Uint8Array(serializeSparseSemanticDelta(decoded, LIMITS)))
            .toEqual(new Uint8Array(encoded));
    });

    test("rejects duplicate order, unknown masks and non-canonical unused payload", () => {
        const duplicate = validInput();
        duplicate.tileIndex[1] = 0;
        expect(() => createSparseSemanticDelta(duplicate, LIMITS)).toThrow(/unique ascending/);

        const unknownMask = validInput();
        unknownMask.fieldMask[0] = 0x80;
        expect(() => createSparseSemanticDelta(unknownMask, LIMITS)).toThrow(/mask/);

        const unusedHeight = validInput();
        unusedHeight.macroHeight[1] = 1;
        expect(() => createSparseSemanticDelta(unusedHeight, LIMITS)).toThrow(/unused height/);

        const unusedBiome = validInput();
        unusedBiome.biomeWeights[4] = 1;
        expect(() => createSparseSemanticDelta(unusedBiome, LIMITS)).toThrow(/unused biome/);
    });

    test("rejects catalog overflow and malformed serialized identities", () => {
        const badSubstrate = validInput();
        badSubstrate.substrateClass[1] = 3;
        expect(() => createSparseSemanticDelta(badSubstrate, LIMITS)).toThrow(/substrate/);

        const badProfile = validInput();
        badProfile.vegetationProfile[2] = 4;
        expect(() => createSparseSemanticDelta(badProfile, LIMITS)).toThrow(/vegetation profile/);

        const encoded = serializeSparseSemanticDelta(
            createSparseSemanticDelta(validInput(), LIMITS),
            LIMITS
        );
        new Uint8Array(encoded)[40] = 0xff;
        expect(() => deserializeSparseSemanticDelta(encoded, LIMITS)).toThrow(/UTF-8/);
    });

    test("rejects empty deltas because absence is the canonical empty representation", () => {
        const empty: SparseSemanticDeltaInput = {
            worldIdentity: "world:empty",
            key: { chunkX: 0, chunkY: 0 },
            revision: 1,
            tileIndex: new Uint16Array(0),
            fieldMask: new Uint8Array(0),
            macroHeight: new Uint16Array(0),
            substrateClass: new Uint8Array(0),
            biomeWeights: new Uint8Array(0),
            vegetationDensity: new Uint8Array(0),
            vegetationProfile: new Uint8Array(0)
        };
        expect(() => createSparseSemanticDelta(empty, LIMITS)).toThrow(/layout/);
    });
});
