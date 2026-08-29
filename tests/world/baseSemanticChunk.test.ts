import { describe, expect, test } from "vitest";

import {
    BASE_SEMANTIC_CHUNK_HEADER_BYTES,
    BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES,
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BaseSemanticChunkCatalogLimits,
    BaseSemanticChunkInput,
    createBaseSemanticChunk,
    deserializeBaseSemanticChunk,
    getBaseSemanticTile,
    semanticTileIndex,
    serializeBaseSemanticChunk
} from "../../src/world/BaseSemanticChunk";

const limits: BaseSemanticChunkCatalogLimits = {
    substrateCount: 7,
    vegetationProfileCount: 12
};

function fullInput(): BaseSemanticChunkInput {
    const substrateClass = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
    const climate = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const vegetationProfile = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    for (let index = 0; index < BASE_SEMANTIC_CHUNK_TILE_COUNT; index += 1) {
        substrateClass[index] = index % limits.substrateCount;
        macroHeight[index] = (index * 61 + 0x1234) & 0xffff;
        biomeWeights.set([100, 60, 50, 45], index * 4);
        climate.set([index & 0xff, (index * 3) & 0xff], index * 2);
        vegetationDensity[index] = (index * 7) & 0xff;
        vegetationProfile[index] = index % limits.vegetationProfileCount;
    }
    return {
        key: { chunkX: -33, chunkY: 19 },
        revision: 0x1_0000_0001,
        substrateClass,
        macroHeight,
        biomeWeights,
        climate,
        vegetationDensity,
        vegetationProfile
    };
}

function partialInput(): BaseSemanticChunkInput {
    const input = fullInput();
    const bounds = { minX: 2, minY: 3, maxXExclusive: 5, maxYExclusive: 7 };
    input.substrateClass.fill(0);
    input.macroHeight.fill(0);
    input.biomeWeights.fill(0);
    input.climate.fill(0);
    input.vegetationDensity.fill(0);
    input.vegetationProfile.fill(0);
    for (let x = bounds.minX; x < bounds.maxXExclusive; x += 1) {
        for (let y = bounds.minY; y < bounds.maxYExclusive; y += 1) {
            const index = semanticTileIndex(x, y);
            input.biomeWeights.set([255, 0, 0, 0], index * 4);
        }
    }
    return { ...input, validBounds: bounds };
}

describe("BaseSemanticChunk v2", () => {
    test("publishes the frozen X-major SoA layout and creates tile views on demand", () => {
        const chunk = createBaseSemanticChunk(fullInput(), limits);
        expect(chunk.formatVersion).toBe(2);
        expect(Object.isFrozen(chunk)).toBe(true);
        expect(Object.isFrozen(chunk.key)).toBe(true);
        expect(chunk.validBounds).toEqual({ minX: 0, minY: 0, maxXExclusive: 32, maxYExclusive: 32 });
        const index = semanticTileIndex(4, 9);
        expect(index).toBe(137);
        expect(getBaseSemanticTile(chunk, 4, 9)).toEqual({
            substrateClass: index % limits.substrateCount,
            macroHeight: (index * 61 + 0x1234) & 0xffff,
            biomeWeights: [100, 60, 50, 45],
            temperature: index & 0xff,
            moisture: (index * 3) & 0xff,
            vegetationDensity: (index * 7) & 0xff,
            vegetationProfile: index % limits.vegetationProfileCount
        });
    });

    test("round-trips one canonical 11,304-byte little-endian payload", () => {
        const chunk = createBaseSemanticChunk(fullInput(), limits);
        const encoded = serializeBaseSemanticChunk(chunk, limits);
        expect(encoded.byteLength).toBe(BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES);
        expect([...new Uint8Array(encoded, 0, 4)]).toEqual([0x42, 0x53, 0x43, 0x32]);
        expect([...new Uint8Array(
            encoded,
            BASE_SEMANTIC_CHUNK_HEADER_BYTES + BASE_SEMANTIC_CHUNK_TILE_COUNT,
            2
        )]).toEqual([0x34, 0x12]);
        const decoded = deserializeBaseSemanticChunk(encoded, limits);
        expect(decoded.key).toEqual(chunk.key);
        expect(decoded.revision).toBe(chunk.revision);
        expect(decoded.validBounds).toEqual(chunk.validBounds);
        expect(decoded.substrateClass).toEqual(chunk.substrateClass);
        expect(decoded.macroHeight).toEqual(chunk.macroHeight);
        expect(decoded.biomeWeights).toEqual(chunk.biomeWeights);
        expect(decoded.climate).toEqual(chunk.climate);
        expect(decoded.vegetationDensity).toEqual(chunk.vegetationDensity);
        expect(decoded.vegetationProfile).toEqual(chunk.vegetationProfile);
        expect(new Uint8Array(serializeBaseSemanticChunk(decoded, limits))).toEqual(new Uint8Array(encoded));
    });

    test("requires zero-filled bytes outside partial valid bounds", () => {
        const chunk = createBaseSemanticChunk(partialInput(), limits);
        expect(() => getBaseSemanticTile(chunk, 0, 0)).toThrow(/valid bounds/);
        expect(getBaseSemanticTile(chunk, 2, 3).biomeWeights).toEqual([255, 0, 0, 0]);
        const dirty = partialInput();
        dirty.macroHeight[semanticTileIndex(0, 0)] = 1;
        expect(() => createBaseSemanticChunk(dirty, limits)).toThrow(/outside valid bounds/);
    });

    test("rejects invalid catalogs, arrays, weights, bounds and keys", () => {
        const badSubstrate = fullInput();
        badSubstrate.substrateClass[0] = limits.substrateCount;
        expect(() => createBaseSemanticChunk(badSubstrate, limits)).toThrow(/substrate index/);
        const badProfile = fullInput();
        badProfile.vegetationProfile[0] = limits.vegetationProfileCount;
        expect(() => createBaseSemanticChunk(badProfile, limits)).toThrow(/vegetation profile/);
        const badWeights = fullInput();
        badWeights.biomeWeights[0] = 99;
        expect(() => createBaseSemanticChunk(badWeights, limits)).toThrow(/sum to 255/);
        const badLength = { ...fullInput(), climate: new Uint8Array(1) };
        expect(() => createBaseSemanticChunk(badLength, limits)).toThrow(/frozen layout/);
        expect(() => createBaseSemanticChunk({
            ...fullInput(), validBounds: { minX: 2, minY: 0, maxXExclusive: 2, maxYExclusive: 1 }
        }, limits)).toThrow(/valid bounds/);
        expect(() => createBaseSemanticChunk({
            ...fullInput(), key: { chunkX: Number.MAX_SAFE_INTEGER, chunkY: 0 }
        }, limits)).toThrow(/safe logical/);
    });

    test("rejects corrupted or incompatible serialized headers", () => {
        const encoded = serializeBaseSemanticChunk(createBaseSemanticChunk(fullInput(), limits), limits);
        const corrupt = encoded.slice(0);
        new Uint8Array(corrupt)[0] = 0;
        expect(() => deserializeBaseSemanticChunk(corrupt, limits)).toThrow(/header/);
        expect(() => deserializeBaseSemanticChunk(encoded.slice(0, -1), limits)).toThrow(/byte length/);
    });
});
