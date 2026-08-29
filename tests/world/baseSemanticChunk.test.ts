import { describe, expect, test, vi } from "vitest";

import {
    assertBaseSemanticChunk,
    BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES,
    BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES,
    BaseSemanticChunkView,
    createWorldDescriptorV2,
    deserializeBaseSemanticChunk,
    generateBaseSemanticChunk,
    locateSemanticTile,
    semanticChunkLocalIndex,
    serializeBaseSemanticChunk,
    SubstrateClass,
    WORLD_SEMANTIC_CHUNK_SIZE,
    WORLD_SEMANTIC_CHUNK_TILE_COUNT,
    WorldGeneratorPool
} from "../../src/index";
import { generateWorldChunk } from "../../src/world/generateWorldChunk";
import type { ChunkGeneratorClient } from "../../src/world/WorldGeneratorPool";

function checksum(buffer: ArrayBuffer): string {
    let hash = 0x811c9dc5;
    for (const value of new Uint8Array(buffer)) {
        hash ^= value;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("BaseSemanticChunk v2", () => {
    test("uses mathematical floor and X-major indexing for negative coordinates", () => {
        expect(locateSemanticTile(-1, -33)).toEqual({
            key: { chunkX: -1, chunkY: -2 },
            localX: 31,
            localY: 31,
            index: 1023
        });
        expect(semanticChunkLocalIndex(1, 2)).toBe(34);
    });

    test("keeps the complete safe-integer tile domain addressable", () => {
        const location = locateSemanticTile(Number.MIN_SAFE_INTEGER, 0);
        expect(location).toMatchObject({ localX: 1, localY: 0 });
        const chunk = generateBaseSemanticChunk({
            descriptor: createWorldDescriptorV2({ seed: "semantic-safe-limit" }),
            key: location.key
        });
        expect(chunk.validBounds).toEqual({ minX: 1, minY: 0, maxXExclusive: 32, maxYExclusive: 32 });
        const view = new BaseSemanticChunkView(chunk);
        expect(view.getTile(location.localX, location.localY).x).toBe(Number.MIN_SAFE_INTEGER);
        expect(() => view.getTile(0, 0)).toThrow(/validBounds/);
    });

    test("generates complete validated SoA fields with normalized biome weights", () => {
        const chunk = generateBaseSemanticChunk({
            descriptor: createWorldDescriptorV2({ seed: "semantic-fields" }),
            key: { chunkX: -2, chunkY: 3 }
        });
        expect(() => assertBaseSemanticChunk(chunk)).not.toThrow();
        expect(chunk.key).toEqual({ chunkX: -2, chunkY: 3 });
        expect(chunk.substrateClass).toHaveLength(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
        expect(chunk.macroHeight).toHaveLength(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
        expect(chunk.biomeWeights).toHaveLength(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 4);
        expect(chunk.climate).toHaveLength(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 2);
        expect(new Set(chunk.substrateClass).size).toBeGreaterThan(1);
        for (let index = 0; index < WORLD_SEMANTIC_CHUNK_TILE_COUNT; index += 1) {
            const offset = index * 4;
            expect(chunk.biomeWeights[offset] + chunk.biomeWeights[offset + 1]
                + chunk.biomeWeights[offset + 2] + chunk.biomeWeights[offset + 3]).toBe(255);
        }
    });

    test("serializes deterministically and round-trips without sharing authority buffers", () => {
        const chunk = generateBaseSemanticChunk({
            descriptor: createWorldDescriptorV2({ seed: "semantic-golden" }),
            key: { chunkX: -3, chunkY: 2 }
        });
        const first = serializeBaseSemanticChunk(chunk);
        const second = serializeBaseSemanticChunk(generateBaseSemanticChunk({
            descriptor: createWorldDescriptorV2({ seed: "semantic-golden" }),
            key: { chunkX: -3, chunkY: 2 }
        }));
        expect(first.byteLength).toBe(BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES);
        expect(BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES).toBe(11 * 1024);
        expect(new Uint8Array(second)).toEqual(new Uint8Array(first));
        expect(checksum(first)).toBe("1cecec48");

        const restored = deserializeBaseSemanticChunk(first);
        expect(serializeBaseSemanticChunk(restored)).toEqual(second);
        expect(restored.substrateClass.buffer).not.toBe(chunk.substrateClass.buffer);
        expect(restored.macroHeight.buffer).not.toBe(chunk.macroHeight.buffer);
    });

    test("provides an allocation-on-demand read-only tile view", () => {
        const chunk = generateBaseSemanticChunk({
            descriptor: createWorldDescriptorV2({ seed: "semantic-view" }),
            key: { chunkX: 1, chunkY: -1 }
        });
        const tile = new BaseSemanticChunkView(chunk).getTile(2, 3);
        expect(tile).toMatchObject({ x: WORLD_SEMANTIC_CHUNK_SIZE + 2, y: -29 });
        expect(Object.values(SubstrateClass)).toContain(tile.substrateClass);
        expect(tile.macroHeight).toBeGreaterThanOrEqual(0);
        expect(tile.macroHeight).toBeLessThanOrEqual(1);
        expect(tile.biomeWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
    });

    test("rejects malformed weights and corrupted serialized headers", () => {
        const chunk = generateBaseSemanticChunk({
            descriptor: createWorldDescriptorV2({ seed: "semantic-invalid" }),
            key: { chunkX: 0, chunkY: 0 }
        });
        const invalid = { ...chunk, biomeWeights: chunk.biomeWeights.slice() };
        invalid.biomeWeights[0] = 0;
        expect(() => assertBaseSemanticChunk(invalid)).toThrow(/sum to 255/);
        expect(() => assertBaseSemanticChunk({ ...chunk, waterDepth: new Uint16Array(1024) }))
            .toThrow(/outside the v2 authority format/);
        expect(() => assertBaseSemanticChunk({ ...chunk, navigation: new Uint8Array(1024) }))
            .toThrow(/outside the v2 authority format/);

        const corrupted = serializeBaseSemanticChunk(chunk);
        new DataView(corrupted).setUint16(4, 999, true);
        expect(() => deserializeBaseSemanticChunk(corrupted)).toThrow(/header/);
    });

    test("canonicalizes toroidal requests independently of request order", () => {
        const descriptor = createWorldDescriptorV2({
            seed: "semantic-wrap",
            topology: { kind: "toroidal", width: 64, height: 64 }
        });
        const wrapped = generateBaseSemanticChunk({ descriptor, key: { chunkX: -1, chunkY: 2 } });
        const canonical = generateBaseSemanticChunk({ descriptor, key: { chunkX: 1, chunkY: 0 } });
        expect(wrapped.key).toEqual(canonical.key);
        expect(serializeBaseSemanticChunk(wrapped)).toEqual(serializeBaseSemanticChunk(canonical));
    });

    test("is byte-identical across chunk boundaries and request orders", () => {
        const descriptor = createWorldDescriptorV2({ seed: "semantic-order" });
        const keys = [{ chunkX: -1, chunkY: 0 }, { chunkX: 0, chunkY: 0 }] as const;
        const forward = keys.map(key => generateBaseSemanticChunk({ descriptor, key }));
        const reverse = [...keys].reverse().map(key => generateBaseSemanticChunk({ descriptor, key })).reverse();
        expect(serializeBaseSemanticChunk(forward[0])).toEqual(serializeBaseSemanticChunk(reverse[0]));
        expect(serializeBaseSemanticChunk(forward[1])).toEqual(serializeBaseSemanticChunk(reverse[1]));
        expect(new BaseSemanticChunkView(forward[0]).getTile(31, 7)).toMatchObject({ x: -1, y: 7 });
        expect(new BaseSemanticChunkView(forward[1]).getTile(0, 7)).toMatchObject({ x: 0, y: 7 });
    });

    test("runs semantic work through the bounded worker pool lane", async () => {
        const descriptor = createWorldDescriptorV2({ seed: "semantic-pool" });
        const generateSemanticChunk = vi.fn(async options => generateBaseSemanticChunk(options));
        const client: ChunkGeneratorClient = {
            generateChunk: async options => generateWorldChunk(options),
            generateSemanticChunk,
            dispose: vi.fn()
        };
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const chunk = await pool.generateSemanticChunk({ descriptor, key: { chunkX: 4, chunkY: -2 } });
        await new Promise<void>(resolve => queueMicrotask(resolve));
        expect(chunk.key).toEqual({ chunkX: 4, chunkY: -2 });
        expect(generateSemanticChunk).toHaveBeenCalledOnce();
        expect(pool.stats).toMatchObject({
            completed: 1,
            queuedSemanticChunks: 0,
            busySemanticChunkWorkers: 0
        });
        pool.dispose();
    });
});
