import { describe, expect, test } from "vitest";
import { Vector3 } from "three";
import { Land, MapInfo, PathFinder, getHexCenter, getMapNeighbors } from "../../src/index";
import { pickTile } from "../../src/helpers/picking";
import { periodicFractalNoise2D } from "../../src/world/noise";

function allLandWorld(width = 8, height = 8): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) data[x][y] = { type: Land.land };
    }
    return { data, w: width, h: height, wrapX: true, wrapY: true };
}

describe("toroidal topology", () => {
    test("periodic noise repeats exactly on both axes", () => {
        const sample = (x: number, y: number) => periodicFractalNoise2D(1234, x, y, 3, 2, 5);
        expect(sample(0.137, 0.629)).toBeCloseTo(sample(1.137, 0.629), 12);
        expect(sample(0.137, 0.629)).toBeCloseTo(sample(0.137, 1.629), 12);
    });

    test("normalizes neighbors across every map edge", () => {
        const world = allLandWorld();
        const leftEdge = getMapNeighbors(world, 0, 3);
        const topEdge = getMapNeighbors(world, 2, 0);
        expect(leftEdge.some(tile => tile.x === 7)).toBe(true);
        expect(topEdge.some(tile => tile.y === 7)).toBe(true);
    });

    test("picks a repeated visual copy as its canonical tile", () => {
        const size = 40;
        const repeatedCenter = getHexCenter(8, 3, size);
        const picked = pickTile(new Vector3(repeatedCenter.x, 0, repeatedCenter.y), size, 8, 8, true, true);
        expect(picked).toMatchObject({ x: 0, y: 3, worldX: repeatedCenter.x, worldY: repeatedCenter.y });
    });

    test("pathfinding takes the one-step route across a seam", () => {
        const world = allLandWorld();
        const allowed = Object.fromEntries(Object.values(Land).map(type => [type, true])) as { [key in Land]: boolean };
        const path = new PathFinder(world, allowed).find(0, 3, 7, 3);
        expect(path).toEqual([{ x: 0, y: 3 }, { x: 7, y: 3 }]);
    });
});
