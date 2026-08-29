import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    getBaseSemanticTile,
    semanticTileIndex,
    serializeBaseSemanticChunk
} from "../../src/world/BaseSemanticChunk";
import {
    CORE_WORLD_SEMANTICS_V2,
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import {
    createBaseSemanticChunkGenerator,
    generateBaseSemanticChunk
} from "../../src/world/generateBaseSemanticChunk";
import { createWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { createSemanticWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";

function checksum(values: ArrayLike<number>): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < values.length; index += 1) {
        hash ^= values[index] & 0xff;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("v2 base semantic generation", () => {
    test("freezes one deterministic infinite chunk byte vector", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("semantic-v2-vector");
        const first = generateBaseSemanticChunk({ descriptor, chunkX: -3, chunkY: 2 });
        const second = generateBaseSemanticChunk({ descriptor, chunkX: -3, chunkY: 2 });
        const encoded = new Uint8Array(serializeBaseSemanticChunk(first, {
            substrateCount: descriptor.substrateCatalog.entryCount,
            vegetationProfileCount: descriptor.vegetationCatalog.entryCount
        }));
        expect(serializeBaseSemanticChunk(second, {
            substrateCount: descriptor.substrateCatalog.entryCount,
            vegetationProfileCount: descriptor.vegetationCatalog.entryCount
        })).toEqual(encoded.buffer);
        expect(checksum(encoded)).toBe("92bf5523");
    });

    test("keeps submerged ground continuous and materialized independently of water", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("semantic-v2-water");
        const chunk = generateBaseSemanticChunk({ descriptor, chunkX: 0, chunkY: 0 });
        const resolver = createSemanticWorldSurfaceResolver({ seed: descriptor.seed });
        const submergedHeights = new Set<number>();
        let submergedTiles = 0;
        for (let localX = 0; localX < 32; localX += 1) {
            for (let localY = 0; localY < 32; localY += 1) {
                const sample = resolver.sampleGenerated(localX, localY);
                if (sample.baseTerrain !== Land.sea && sample.baseTerrain !== Land.coastal) continue;
                const tile = getBaseSemanticTile(chunk, localX, localY);
                submergedTiles += 1;
                submergedHeights.add(tile.macroHeight);
                expect(tile.biomeWeights.reduce((sum, value) => sum + value, 0)).toBe(255);
                expect(tile.substrateClass).toBeLessThan(descriptor.substrateCatalog.entryCount);
            }
        }
        expect(submergedTiles).toBeGreaterThan(0);
        expect(submergedHeights.size).toBeGreaterThan(8);
    });

    test("is independent of chunk request order and matches global samples at boundaries", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("semantic-v2-order");
        const coordinates = [{ chunkX: -1, chunkY: 0 }, { chunkX: 0, chunkY: 0 }, { chunkX: 1, chunkY: -1 }];
        const forward = coordinates.map(key => generateBaseSemanticChunk({ descriptor, ...key }));
        const reverse = [...coordinates].reverse().map(key => generateBaseSemanticChunk({ descriptor, ...key })).reverse();
        for (let index = 0; index < forward.length; index += 1) {
            expect(forward[index].macroHeight).toEqual(reverse[index].macroHeight);
            expect(forward[index].biomeWeights).toEqual(reverse[index].biomeWeights);
        }
        const resolver = createSemanticWorldSurfaceResolver({ seed: descriptor.seed });
        const left = forward[0];
        const tileIndex = semanticTileIndex(31, 7);
        expect(left.macroHeight[tileIndex]).toBe(Math.floor(
            resolver.sampleGenerated(-1, 7).landform.elevation * 0xffff + 0.5
        ));
    });

    test("samples the complete safe-integer domain without a 32-bit coordinate period", () => {
        const resolver = createSemanticWorldSurfaceResolver({ seed: "semantic-v2-safe-domain" });
        const origin = resolver.sampleGenerated(0, 0).landform;
        const highWord = resolver.sampleGenerated(0x1_0000_0000, 0).landform;
        const extreme = resolver.sampleGenerated(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER).landform;
        expect(highWord).not.toEqual(origin);
        expect(Object.values(extreme).every(Number.isFinite)).toBe(true);
    });

    test("requires canonical toroidal keys and the exact frozen catalogs", () => {
        const toroidal = createCoreToroidalWorldDescriptorV2("semantic-v2-round", 64, 64);
        const chunk = generateBaseSemanticChunk({ descriptor: toroidal, chunkX: 1, chunkY: 1 });
        expect(chunk.key).toEqual({ chunkX: 1, chunkY: 1 });
        expect(() => generateBaseSemanticChunk({ descriptor: toroidal, chunkX: 2, chunkY: 0 }))
            .toThrow(/canonical/);

        const changed = createWorldDescriptorV2({
            ...CORE_WORLD_SEMANTICS_V2,
            substrateCatalog: {
                ...CORE_WORLD_SEMANTICS_V2.substrateCatalog,
                contentHash: `sha256:${"a".repeat(64)}`
            },
            sourceKind: "procedural-infinite",
            seed: "unsupported-catalog"
        });
        expect(() => generateBaseSemanticChunk({ descriptor: changed, chunkX: 0, chunkY: 0 }))
            .toThrow(/catalogs or sea level/);
    });

    test("is byte-stable at toroidal seams", () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("semantic-v2-seam", 64, 32);
        const resolver = createSemanticWorldSurfaceResolver({
            seed: descriptor.seed,
            domain: { topology: "toroidal", width: descriptor.width, height: descriptor.height }
        });
        expect(resolver.sampleGenerated(-1, -1)).toEqual(
            resolver.sampleGenerated(descriptor.width - 1, descriptor.height - 1)
        );
        expect(resolver.sampleGenerated(descriptor.width, descriptor.height)).toEqual(
            resolver.sampleGenerated(0, 0)
        );
        const first = generateBaseSemanticChunk({ descriptor, chunkX: 0, chunkY: 0 });
        const last = generateBaseSemanticChunk({ descriptor, chunkX: 1, chunkY: 0 });
        expect(first.validBounds).toEqual({ minX: 0, minY: 0, maxXExclusive: 32, maxYExclusive: 32 });
        expect(last.validBounds).toEqual(first.validBounds);
    });

    test("fills every authoritative array without object-per-tile residency", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("semantic-v2-layout");
        const chunk = generateBaseSemanticChunk({ descriptor, chunkX: 4, chunkY: -5 });
        expect(chunk.substrateClass).toHaveLength(BASE_SEMANTIC_CHUNK_TILE_COUNT);
        expect(chunk.macroHeight).toHaveLength(BASE_SEMANTIC_CHUNK_TILE_COUNT);
        expect(chunk.biomeWeights).toHaveLength(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
        expect(chunk.climate).toHaveLength(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2);
        expect(chunk.vegetationDensity).toHaveLength(BASE_SEMANTIC_CHUNK_TILE_COUNT);
        expect(chunk.vegetationProfile).toHaveLength(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    });

    test("samples sparse macro heights through the exact chunk quantizer", () => {
        const infinite = createCoreInfiniteWorldDescriptorV2("semantic-v2-sparse-height");
        const generator = createBaseSemanticChunkGenerator(infinite);
        const chunk = generator.generate(-2, 3);
        for (const [localX, localY] of [[0, 0], [4, 12], [31, 31]] as const) {
            expect(generator.sampleMacroHeight(-64 + localX, 96 + localY))
                .toBe(chunk.macroHeight[semanticTileIndex(localX, localY)]);
        }

        const toroidal = createCoreToroidalWorldDescriptorV2("semantic-v2-sparse-torus", 64, 32);
        const toroidalGenerator = createBaseSemanticChunkGenerator(toroidal);
        expect(toroidalGenerator.sampleMacroHeight(-4, 36))
            .toBe(toroidalGenerator.sampleMacroHeight(60, 4));
    });
});
