import { describe, expect, test } from "vitest";
import {
    generateWorld,
    getMapNeighbors,
    getMapTile,
    getNeighbors,
    Land,
    MAX_WORLD_SIZE,
    MIN_WORLD_SIZE
} from "../../src/index";

const landTypes = new Set(Object.values(Land));
const allowedModifiers = new Set(["hill", "wood", "lake", "river"]);
const isWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;

describe("generateWorld", () => {
    test("supports world dimensions up to 512", () => {
        expect(MAX_WORLD_SIZE).toBe(512);
        expect(() => generateWorld({ seed: "limit", width: 512, height: MIN_WORLD_SIZE }))
            .not.toThrow();
    });

    test("repeats exactly for the same seed and dimensions", () => {
        const first = generateWorld({ seed: "atlas", width: 24, height: 18 });
        const second = generateWorld({ seed: "atlas", width: 24, height: 18 });
        expect(second).toEqual(first);
    });

    test("changes terrain when the seed changes", () => {
        const first = generateWorld({ seed: "atlas", width: 24, height: 18 });
        const second = generateWorld({ seed: "meridian", width: 24, height: 18 });
        expect(second.data).not.toEqual(first.data);
    });

    test("fills every requested coordinate with supported data", () => {
        const width = 21;
        const height = 17;
        const world = generateWorld({ seed: 42, width, height });

        expect(world.w).toBe(width);
        expect(world.h).toBe(height);

        for (let x = 0; x < width; x += 1) {
            for (let y = 0; y < height; y += 1) {
                const tile = world.data[x][y];
                expect(tile).toBeDefined();
                expect(landTypes.has(tile.type)).toBe(true);
                expect((tile.modifiers ?? []).every(value => allowedModifiers.has(value))).toBe(true);
            }
        }
    });

    test("marks sea cells touching land as coastal and no other sea cells", () => {
        const world = generateWorld({ seed: "coast-check", width: 32, height: 24 });

        for (let x = 0; x < world.w; x += 1) {
            for (let y = 0; y < world.h; y += 1) {
                const tile = world.data[x][y];
                if (!isWater(tile.type)) continue;

                const touchesLand = getNeighbors(x, y).some(({ x: nx, y: ny }) => {
                    const neighbor = world.data[nx]?.[ny];
                    return neighbor !== undefined && !isWater(neighbor.type);
                });

                expect(tile.type === Land.coastal).toBe(touchesLand);
            }
        }
    });

    test("generates four-way wrapped worlds with seam-aware coasts", () => {
        const world = generateWorld({ seed: "round-world", width: 32, height: 24, topology: "toroidal" });

        expect(world.wrapX).toBe(true);
        expect(world.wrapY).toBe(true);
        expect(getMapTile(world, -1, 0)).toBe(world.data[world.w - 1][0]);
        expect(getMapTile(world, 0, world.h)).toBe(world.data[0][0]);

        for (let x = 0; x < world.w; x += 1) {
            for (let y = 0; y < world.h; y += 1) {
                const tile = world.data[x][y];
                if (!isWater(tile.type)) continue;
                const touchesLand = getMapNeighbors(world, x, y)
                    .some(neighbor => !isWater(world.data[neighbor.x][neighbor.y].type));
                expect(tile.type === Land.coastal).toBe(touchesLand);
            }
        }
    });

    test("rejects odd widths for horizontally wrapped hex grids", () => {
        expect(() => generateWorld({ seed: "x", width: 21, height: 20, topology: "toroidal" }))
            .toThrow(/even width/);
    });

    test.each([
        { seed: "x", width: MIN_WORLD_SIZE - 1, height: 20 },
        { seed: "x", width: 20, height: MAX_WORLD_SIZE + 1 },
        { seed: "x", width: 20.5, height: 20 }
    ])("rejects invalid dimensions: %o", options => {
        expect(() => generateWorld(options)).toThrow(/integer between/);
    });
});
