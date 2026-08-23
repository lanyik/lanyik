import { describe, expect, test } from "vitest";
import { Object3D } from "three";

import {
    getWorldChunkBounds,
    getWorldChunkKey,
    getWorldChunkMetadata,
    groupTilesByWorldChunk,
    tagWorldChunk,
    WORLD_CHUNK_SIZE
} from "../../src/helpers/chunks";

describe("world render chunks", () => {
    test("groups logical tiles at stable 12 by 12 boundaries", () => {
        expect(WORLD_CHUNK_SIZE).toBe(12);
        expect(getWorldChunkKey(0, 0)).toBe("0,0");
        expect(getWorldChunkKey(11, 11)).toBe("0,0");
        expect(getWorldChunkKey(12, 11)).toBe("1,0");
        expect(getWorldChunkKey(23, 24)).toBe("1,2");

        const chunks = groupTilesByWorldChunk([
            { x: 0, y: 0 },
            { x: 11, y: 11 },
            { x: 12, y: 11 },
            { x: 23, y: 24 }
        ]);
        expect([...chunks.keys()]).toEqual(["0,0", "1,0", "1,2"]);
        expect(chunks.get("0,0")).toHaveLength(2);
    });

    test("computes conservative world bounds and preserves metadata on clones", () => {
        const bounds = getWorldChunkBounds([{ x: 0, y: 0 }, { x: 1, y: 0 }], 10, -5, 20);
        expect(bounds.minX).toBe(-10);
        expect(bounds.maxX).toBe(25);
        expect(bounds.minY).toBe(-5);
        expect(bounds.maxY).toBe(20);
        expect(bounds.minZ).toBeCloseTo(-10, 8);
        expect(bounds.maxZ).toBeCloseTo(10 + 5 * Math.sqrt(3), 8);

        const object = new Object3D();
        tagWorldChunk(object, "1,2", "land", bounds);
        expect(getWorldChunkMetadata(object.clone())).toEqual({
            chunkX: 1,
            chunkY: 2,
            kind: "land",
            bounds
        });
    });
});
