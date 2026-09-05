import { describe, expect, test } from "vitest";
import { getHexCenter } from "../../src/helpers/helpers";
import { getWorldChunkOrigin } from "../../src/helpers/chunks";

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
    test("grass fills every edge band and keeps identical roots across independent requests and LODs", () => {
        const map = testMap();
        const tile = { x: 10, y: 10 };
        const selected = [tile, { x: 11, y: 10 }, { x: 12, y: 10 }];
        const request = { ...options(map, selected), grassDensity: 600 };
        const layout = generateWorldVegetation(request);
        const isolated = generateWorldVegetation({ ...request, points: [tile] }).grass[0].lods[0];
        const lods = layout.grass[0].lods;
        const count = lods[0].ranges[1];
        expect(lods[0].offsets.slice(0, count * 2)).toEqual(isolated.offsets);
        const center = getHexCenter(tile.x, tile.y, request.size);
        const origin = getWorldChunkOrigin(layout.grass[0].chunkKey, request.size);
        const edgeCounts = new Array<number>(6).fill(0);
        for (let i = 0; i < isolated.instanceCount; i += 1) {
            const x = isolated.offsets[i * 2] + origin.x - center.x;
            const z = isolated.offsets[i * 2 + 1] + origin.y - center.y;
            for (let edge = 0; edge < 6; edge += 1) {
                const angle = (edge + 0.5) * Math.PI / 3;
                if ((x * Math.cos(angle) + z * Math.sin(angle)) / (40 * Math.sqrt(3) / 2) > 0.92) edgeCounts[edge] += 1;
            }
        }
        expect(Math.min(...edgeCounts)).toBeGreaterThan(5);
        const roots = (lod: typeof isolated) => new Set(Array.from({ length: lod.instanceCount }, (_, i) =>
            `${lod.offsets[i * 2]},${lod.offsets[i * 2 + 1]}`));
        const near = roots(lods[0]), middle = roots(lods[1]);
        expect([...middle].every(root => near.has(root))).toBe(true);
        expect([...roots(lods[2])].every(root => middle.has(root))).toBe(true);
    });

    test("larger trees reduce density and preserve spacing across models, chunks and wrapped seams", () => {
        const map = testMap();
        map.wrapX = map.wrapY = true;
        const points: Point[] = [];
        for (let x = 0; x < 20; x += 1) for (let y = 0; y < 20; y += 1) {
            map.data[x][y] = { type: Land.land, modifiers: ["wood"], treeModel: x % 2 ? "oak" : "pine" };
            points.push({ x, y });
        }
        const request = { ...options(map, points), grassDensity: 0, treesPerTile: 40 };
        const trees = (scale: number) => generateWorldVegetation({ ...request, treeScale: scale }).forest.flatMap(chunk => {
            const origin = getWorldChunkOrigin(chunk.chunkKey, 40);
            const lod = chunk.lods[0];
            return Array.from({ length: lod.instanceCount }, (_, i) => ({
                x: lod.matrices[i * 16 + 12] + origin.x, z: lod.matrices[i * 16 + 14] + origin.y,
                scale: lod.matrices[i * 16 + 5]
            }));
        });
        const small = trees(1), large = trees(2);
        expect(large.length).toBeGreaterThan(100);
        expect(large.length).toBeLessThan(small.length * 0.4);
        expect(large.every(tree => tree.scale >= 1.6 && tree.scale <= 2.4)).toBe(true);
        const periodX = 20 * 40 * 1.5, periodZ = 20 * 40 * Math.sqrt(3);
        let minimumDistance = Infinity;
        for (let i = 0; i < large.length; i += 1) for (let j = i + 1; j < large.length; j += 1) {
            const dx = Math.abs(large[i].x - large[j].x), dz = Math.abs(large[i].z - large[j].z);
            minimumDistance = Math.min(minimumDistance, Math.hypot(Math.min(dx, periodX - dx), Math.min(dz, periodZ - dz)));
        }
        expect(minimumDistance).toBeGreaterThanOrEqual(40 * 2 * 0.28 - 0.001);
    });

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
