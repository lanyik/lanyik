import { describe, expect, test } from "vitest";
import { Object3D } from "three";

import {
    getWorldChunkBounds,
    getWorldChunkKey,
    getWorldChunkMetadata,
    getWorldChunkOrigin,
    groupTilesByWorldChunk,
    localizeWorldChunkBounds,
    resolveWorldChunkLod,
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
            id: "land:1,2",
            key: "1,2",
            chunkX: 1,
            chunkY: 2,
            kind: "land",
            bounds
        });
    });

    test("keeps GPU-facing chunk coordinates local even at huge logical positions", () => {
        const origin = getWorldChunkOrigin("83333,-83334", 48);
        const logical = getWorldChunkBounds([
            { x: 999996, y: -1000008 },
            { x: 1000007, y: -999997 }
        ], 48, -10, 100);
        const local = localizeWorldChunkBounds(logical, origin);
        expect(Math.max(Math.abs(local.minX), Math.abs(local.maxX))).toBeLessThan(1000);
        expect(Math.max(Math.abs(local.minZ), Math.abs(local.maxZ))).toBeLessThan(1000);
    });

    test("selects stable near, middle and far LOD levels", () => {
        const distances = { near: 900, far: 1650, vegetation: 1450, hysteresis: 120 };
        expect(resolveWorldChunkLod(500, "land", undefined, distances)).toBe(0);
        expect(resolveWorldChunkLod(1200, "land", undefined, distances)).toBe(1);
        expect(resolveWorldChunkLod(2000, "land", undefined, distances)).toBe(2);
        expect(resolveWorldChunkLod(1500, "grass", undefined, distances)).toBeNull();

        //LOD 0 remains active slightly beyond the nominal boundary and only
        //changes once the hysteresis band has been crossed.
        expect(resolveWorldChunkLod(980, "land", 0, distances)).toBe(0);
        expect(resolveWorldChunkLod(1030, "land", 0, distances)).toBe(1);
    });
});
