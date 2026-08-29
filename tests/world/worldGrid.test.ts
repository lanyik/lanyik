import { describe, expect, test } from "vitest";

import {
    chunkLocation,
    chunkOrigin,
    hydrologyRegionLocation,
    renderChunkLocation,
    semanticChunkLocation
} from "../../src/world/WorldGrid";

describe("v2 world grid", () => {
    test("uses mathematical floor division for positive and negative coordinates", () => {
        expect(chunkLocation(0, 0, 32)).toEqual({ chunkX: 0, chunkY: 0, localX: 0, localY: 0 });
        expect(chunkLocation(31, 31, 32)).toEqual({ chunkX: 0, chunkY: 0, localX: 31, localY: 31 });
        expect(chunkLocation(32, 32, 32)).toEqual({ chunkX: 1, chunkY: 1, localX: 0, localY: 0 });
        expect(chunkLocation(-1, -1, 32)).toEqual({ chunkX: -1, chunkY: -1, localX: 31, localY: 31 });
        expect(chunkLocation(-32, -32, 32)).toEqual({ chunkX: -1, chunkY: -1, localX: 0, localY: 0 });
        expect(chunkLocation(-33, -33, 32)).toEqual({ chunkX: -2, chunkY: -2, localX: 31, localY: 31 });
    });

    test("keeps semantic, hydrology and render ownership aligned", () => {
        const tile = { x: -129, y: 95 };
        expect(semanticChunkLocation(tile.x, tile.y)).toEqual({
            chunkX: -5, chunkY: 2, localX: 31, localY: 31
        });
        expect(hydrologyRegionLocation(tile.x, tile.y)).toEqual({
            chunkX: -2, chunkY: 0, localX: 127, localY: 95
        });
        expect(renderChunkLocation(tile.x, tile.y)).toEqual({
            chunkX: -9, chunkY: 5, localX: 15, localY: 15
        });
    });

    test("rejects unsafe logical bounds instead of truncating them", () => {
        expect(() => chunkLocation(Number.MAX_SAFE_INTEGER + 1, 0, 32)).toThrow(/safe integer/);
        expect(() => chunkLocation(0, 0, 0)).toThrow(/positive/);
        expect(() => chunkOrigin(Number.MAX_SAFE_INTEGER, 0, 32)).toThrow(/safe logical/);
        expect(chunkOrigin(-2, 3, 32)).toEqual({ x: -64, y: 96 });
    });
});
