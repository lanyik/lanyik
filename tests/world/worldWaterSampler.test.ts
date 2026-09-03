import { describe, expect, test } from "vitest";

import { getNeighbors, NEIGHBOR_DIRECTIONS } from "../../src/helpers/neighbors";
import { seedToUint32 } from "../../src/world/noise";
import { createWorldWaterSampler } from "../../src/world/WorldWaterSampler";
import { WORLD_STYLE_PROFILE, type WorldStyleProfile } from "../../src/world/WorldStyleProfile";

const pointKey = (x: number, y: number): string => `${x},${y}`;

function sampleWaterKeys(
    seed: string,
    min: number,
    max: number,
    profile: Readonly<WorldStyleProfile> = WORLD_STYLE_PROFILE
): Set<string> {
    const sampler = createWorldWaterSampler(seedToUint32(seed), { topology: "infinite" }, profile);
    const result = new Set<string>();
    for (let x = min; x < max; x += 1) {
        for (let y = min; y < max; y += 1) {
            if (sampler.isWaterTile(x, y)) result.add(pointKey(x, y));
        }
    }
    return result;
}

function maximumWaterComponent(points: ReadonlySet<string>): number {
    const remaining = new Set(points);
    let maximum = 0;
    for (const start of points) {
        if (!remaining.delete(start)) continue;
        const queue = [start];
        let size = 0;
        for (let index = 0; index < queue.length; index += 1) {
            const [x, y] = queue[index].split(",").map(Number);
            size += 1;
            for (const neighbor of getNeighbors(x, y)) {
                const key = pointKey(neighbor.x, neighbor.y);
                if (remaining.delete(key)) queue.push(key);
            }
        }
        maximum = Math.max(maximum, size);
    }
    return maximum;
}

describe("WorldWaterSampler", () => {
    test("is deterministic, sparse, long-range and directionally disordered", () => {
        const first = sampleWaterKeys("rough-water-field", -128, 128);
        const second = sampleWaterKeys("rough-water-field", -128, 128);
        expect(second).toEqual(first);
        expect(first.size).toBeGreaterThan(350);
        expect(first.size).toBeLessThan(5_000);
        expect(maximumWaterComponent(first)).toBeGreaterThan(40);

        const usedDirections = new Set<string>();
        let isolated = 0;
        let turns = 0;
        for (const key of first) {
            const [x, y] = key.split(",").map(Number);
            const connected = getNeighbors(x, y).filter(neighbor => {
                const water = first.has(pointKey(neighbor.x, neighbor.y));
                if (water) usedDirections.add(neighbor.direction);
                return water;
            });
            if (connected.length === 0 && x > -128 && x < 127 && y > -128 && y < 127) isolated += 1;
            if (connected.length === 2) {
                const firstDirection = NEIGHBOR_DIRECTIONS.indexOf(connected[0].direction);
                const secondDirection = NEIGHBOR_DIRECTIONS.indexOf(connected[1].direction);
                if ((firstDirection + 3) % 6 !== secondDirection
                    && (secondDirection + 3) % 6 !== firstDirection) turns += 1;
            }
        }
        expect(isolated).toBe(0);
        expect(usedDirections.size).toBe(6);
        expect(turns).toBeGreaterThan(80);
    });

    test("uses curve radius to widen major water paths", () => {
        const narrow = structuredClone(WORLD_STYLE_PROFILE) as any;
        narrow.rivers.curve.families = narrow.rivers.curve.families.map((family: {
            minimumWidth: number;
            maximumWidth: number;
        }) => ({
            ...family,
            minimumWidth: 0.01,
            maximumWidth: 0.02
        }));
        const narrowTiles = sampleWaterKeys("rough-water-field", -128, 128, narrow);
        const regularTiles = sampleWaterKeys("rough-water-field", -128, 128);
        expect(regularTiles.size).toBeGreaterThan(narrowTiles.size * 1.08);
    });

    test("keeps the infinite page cache bounded while agreeing across page edges", () => {
        const sampler = createWorldWaterSampler(
            seedToUint32("paged-water"),
            { topology: "infinite" },
            WORLD_STYLE_PROFILE
        );
        for (let page = -8; page <= 8; page += 1) {
            sampler.isWaterTile(page * WORLD_STYLE_PROFILE.rivers.pageSize, page * 3);
        }
        expect(sampler.stats.cachedPages).toBe(WORLD_STYLE_PROFILE.rivers.maximumCachedPages);
        expect(sampler.stats.toroidalMaskReady).toBe(false);

        let boundaryWaterTiles = 0;
        let crossPageConnections = 0;
        for (let y = -96; y <= 96; y += 1) {
            for (const x of [-1, 0, 31, 32, 63, 64]) {
                if (!sampler.isWaterTile(x, y)) continue;
                boundaryWaterTiles += 1;
                expect(getNeighbors(x, y).some(neighbor =>
                    sampler.isWaterTile(neighbor.x, neighbor.y))).toBe(true);
            }
            for (const edgeX of [-1, 31, 63]) {
                if (!sampler.isWaterTile(edgeX, y)) continue;
                crossPageConnections += getNeighbors(edgeX, y).filter(neighbor =>
                    neighbor.x === edgeX + 1 && sampler.isWaterTile(neighbor.x, neighbor.y)
                ).length;
            }
        }
        expect(boundaryWaterTiles).toBeGreaterThan(0);
        expect(crossPageConnections).toBeGreaterThan(0);

        const enumerated = new Set<string>();
        sampler.forEachWaterTile(-40, -40, 80, 80, (x, y) => {
            enumerated.add(pointKey(x, y));
        });
        for (let x = -40; x < 40; x += 1) {
            for (let y = -40; y < 40; y += 1) {
                expect(enumerated.has(pointKey(x, y))).toBe(sampler.isWaterTile(x, y));
            }
        }
    });

    test("builds one exactly periodic toroidal mask", () => {
        const width = 128;
        const height = 96;
        const sampler = createWorldWaterSampler(
            seedToUint32("toroidal-water"),
            { topology: "toroidal", width, height },
            WORLD_STYLE_PROFILE
        );
        let waterTiles = 0;
        for (let x = 0; x < width; x += 1) {
            for (let y = 0; y < height; y += 1) {
                const water = sampler.isWaterTile(x, y);
                if (water) waterTiles += 1;
                expect(sampler.isWaterTile(x - width, y + height)).toBe(water);
            }
        }
        expect(waterTiles).toBeGreaterThan(50);
        expect(waterTiles).toBeLessThan(2_500);
        expect(sampler.stats.toroidalMaskReady).toBe(true);
        expect(sampler.stats.toroidalWaterTiles).toBe(waterTiles);
    });
});
