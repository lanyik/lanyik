import { describe, expect, test } from "vitest";

import {
    assertWorldVegetationLayout,
    createWorldVegetationMapSnapshot,
    generateWorldVegetation,
    getMapTile,
    Land,
    MapInfo,
    Point,
    worldVegetationTransferables
} from "../../src/index";

function testMap(): MapInfo {
    const map: MapInfo = { data: {}, w: 20, h: 20 };
    for (let x = 0; x < 20; x += 1) {
        map.data[x] = {};
        for (let y = 0; y < 20; y += 1) {
            map.data[x][y] = {
                type: Land.land,
                modifiers: x === 6 && y === 6 ? ["river", "wood"] : (x + y) % 3 === 0 ? ["wood"] : undefined,
                treeModel: x % 2 === 0 ? "trees/oak" : undefined
            };
        }
    }
    map.data[5][4] = { type: Land.coastal };
    map.data[7][7] = { type: Land.land, modifiers: ["lake"] };
    map.data[4][5].city = { name: "worker-free" };
    return map;
}

function options(map: MapInfo, points: readonly Point[]) {
    return {
        map: createWorldVegetationMapSnapshot(map, points),
        points,
        size: 40,
        grassDensity: 12,
        grassBladeWidth: 1.2,
        grassBladeHeight: 7.2,
        grassHeightVariation: 0.4,
        treesPerTile: 6,
        treeScale: 1,
        treeModel: "trees/pine",
        riverWidth: 0.28,
        riverBankWidth: 0.14,
        riverCurvature: 0.5,
        lakeShoreWidth: 0.18,
        beachWidth: 0.35,
        waterCornerRounding: 0.4,
        coastCurvature: 0.5
    };
}

describe("worker vegetation layout", () => {
    test("snapshots only the core plus one-ring neighbor data", () => {
        const map = testMap();
        const snapshot = createWorldVegetationMapSnapshot(map, [{ x: 6, y: 6 }]);
        const entries = Object.values(snapshot.data).reduce((count, column) => count + Object.keys(column).length, 0);
        expect(entries).toBe(7);
        expect(getMapTile(snapshot, 6, 6)?.modifiers).toContain("wood");
        expect(getMapTile(snapshot, 0, 0)).toBeUndefined();
    });

    test("builds deterministic transferable attributes and matrices for all LODs", () => {
        const map = testMap();
        const points = Array.from({ length: 8 * 8 }, (_, index) => ({ x: 3 + index % 8, y: 3 + Math.floor(index / 8) }));
        const first = generateWorldVegetation(options(map, points));
        const second = generateWorldVegetation(options(map, points));
        assertWorldVegetationLayout(first);

        expect(first.grass.length).toBeGreaterThan(0);
        expect(first.forest.length).toBeGreaterThan(0);
        expect(first.grass[0].lods.map(lod => lod.instanceCount)).toEqual(
            [...first.grass[0].lods.map(lod => lod.instanceCount)].sort((a, b) => b - a)
        );
        expect(first.forest[0].lods.map(lod => lod.instanceCount)).toEqual(
            [...first.forest[0].lods.map(lod => lod.instanceCount)].sort((a, b) => b - a)
        );
        expect(first.grass[0].lods[0].offsets).toEqual(second.grass[0].lods[0].offsets);
        expect(first.forest[0].lods[0].matrices).toEqual(second.forest[0].lods[0].matrices);
        expect(worldVegetationTransferables(first).length).toBeGreaterThan(10);
    });

    test("validates density before allocating worker output", () => {
        const map = testMap();
        expect(() => generateWorldVegetation({ ...options(map, [{ x: 6, y: 6 }]), grassDensity: -1 }))
            .toThrow(/grassDensity/);
    });
});
