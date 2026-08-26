import { describe, expect, test } from "vitest";
import { Vector3 } from "three";
import { Land, MapInfo, PathFinder, getHexCenter, getMapNeighbors } from "../../src/index";
import { assertWrappableMap } from "../../src/helpers/topology";
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
    test("rejects malformed runtime map topology", () => {
        expect(() => assertWrappableMap({ ...allLandWorld(), wrapX: "yes" as never })).toThrow(/boolean/);
        expect(() => assertWrappableMap({ ...allLandWorld(), w: 7 })).toThrow(/even/);
        expect(() => assertWrappableMap({ ...allLandWorld(), h: 0 })).toThrow(/positive integers/);
    });

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

    test("does not snap points from outside a bounded map onto its edge", () => {
        const size = 40;
        const outside = getHexCenter(8, 3, size);
        expect(pickTile(new Vector3(outside.x, 0, outside.y), size, 8, 8, false, false)).toBeNull();
        expect(pickTile(new Vector3(0, 0, 0), 0, 8, 8)).toBeNull();
    });

    test("picks negative coordinates when map dimensions are unbounded", () => {
        const size = 40;
        const negative = getHexCenter(-9, -6, size);
        expect(pickTile(new Vector3(negative.x, 0, negative.y), size))
            .toMatchObject({ x: -9, y: -6, worldX: negative.x, worldY: negative.y });
    });

    test("pathfinding takes the one-step route across a seam", () => {
        const world = allLandWorld();
        const allowed = Object.fromEntries(Object.values(Land).map(type => [type, true])) as { [key in Land]: boolean };
        const path = new PathFinder(world, allowed).find(0, 3, 7, 3);
        expect(path).toEqual([{ x: 0, y: 3 }, { x: 7, y: 3 }]);
    });

    test("legacy synchronous pathfinding rejects infinite map compatibility dimensions", () => {
        const tile = { type: Land.land };
        const world: MapInfo = {
            data: {}, w: 1, h: 1, infinite: true,
            tileAt: (x, y) => y === 0 && x >= 0 && x <= 2 ? tile : undefined
        };
        const allowed = Object.fromEntries(Object.values(Land).map(type => [type, true])) as { [key in Land]: boolean };

        expect(() => new PathFinder(world, allowed)).toThrow(/finite maps/);
    });

    test("pathfinding normalizes public endpoints and respects tile vetoes", () => {
        const world = allLandWorld();
        const allowed = Object.fromEntries(Object.values(Land).map(type => [type, true])) as { [key in Land]: boolean };
        expect(new PathFinder(world, allowed).find(-1, 3, 0, 3))
            .toEqual([{ x: 7, y: 3 }, { x: 0, y: 3 }]);

        const blocked = new PathFinder(world, allowed, (x, y) => !(x === 7 && y === 3));
        expect(blocked.find(0, 3, 7, 3)).toEqual([]);
        expect(blocked.find(0, 3, 0, 3)).toEqual([]);
    });

    test("A* matches breadth-first shortest paths with obstacles and wrapping", () => {
        const allowed = Object.fromEntries(Object.values(Land).map(type => [type, true])) as { [key in Land]: boolean };
        let randomState = 0x12345678;
        const random = () => {
            randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
            return randomState / 0x100000000;
        };

        for (const [wrapX, wrapY] of [[false, false], [true, false], [false, true], [true, true]]) {
            const map = allLandWorld();
            map.wrapX = wrapX;
            map.wrapY = wrapY;
            for (let run = 0; run < 20; run++) {
                const start = { x: Math.floor(random() * map.w), y: Math.floor(random() * map.h) };
                let end = { x: Math.floor(random() * map.w), y: Math.floor(random() * map.h) };
                if (end.x === start.x && end.y === start.y) end = { x: (end.x + 1) % map.w, y: end.y };
                const blocked = new Set<string>();
                for (let x = 0; x < map.w; x++) {
                    for (let y = 0; y < map.h; y++) {
                        if (random() < 0.22) blocked.add(`${x},${y}`);
                    }
                }
                blocked.delete(`${start.x},${start.y}`);
                blocked.delete(`${end.x},${end.y}`);
                const accessible = (x: number, y: number) => !blocked.has(`${x},${y}`);

                const distances = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
                const queue = [start];
                for (let index = 0; index < queue.length; index++) {
                    const current = queue[index];
                    const distance = distances.get(`${current.x},${current.y}`) ?? 0;
                    for (const neighbor of getMapNeighbors(map, current.x, current.y)) {
                        const key = `${neighbor.x},${neighbor.y}`;
                        if (!accessible(neighbor.x, neighbor.y) || distances.has(key)) continue;
                        distances.set(key, distance + 1);
                        queue.push(neighbor);
                    }
                }

                const path = new PathFinder(map, allowed, accessible).find(start.x, start.y, end.x, end.y);
                const expected = distances.get(`${end.x},${end.y}`);
                expect(path.length === 0 ? undefined : path.length - 1).toBe(expected);
            }
        }
    });
});
