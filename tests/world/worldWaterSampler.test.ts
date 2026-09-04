import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { getNeighbors } from "../../src/helpers/neighbors";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";

const isBaseWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;
const key = (x: number, y: number): string => `${x},${y}`;

function collectRiverTiles(
    seed: string,
    originX: number,
    originY: number,
    width: number,
    height: number
): Set<string> {
    const resolver = createWorldSurfaceResolver({ seed });
    const tiles = new Set<string>();
    resolver.visitGeneratedRiverTiles(originX, originY, width, height, (x, y) => {
        const tileKey = key(x, y);
        expect(tiles.has(tileKey), `duplicate river tile ${tileKey}`).toBe(false);
        expect(isBaseWater(resolver.sampleGenerated(x, y).baseTerrain)).toBe(false);
        tiles.add(tileKey);
    });
    return tiles;
}

function sampledWaterComponents(mask: Uint8Array, width: number, height: number): number[] {
    const visited = new Uint8Array(mask.length);
    const components: number[] = [];
    const directions = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1]
    ] as const;
    for (let start = 0; start < mask.length; start += 1) {
        if (mask[start] === 0 || visited[start] !== 0) continue;
        let size = 0;
        const queue = [start];
        visited[start] = 1;
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const index = queue[cursor];
            size += 1;
            const x = index % width;
            const y = Math.floor(index / width);
            for (const [dx, dy] of directions) {
                const adjacentX = x + dx;
                const adjacentY = y + dy;
                if (adjacentX < 0 || adjacentX >= width || adjacentY < 0 || adjacentY >= height) continue;
                const adjacent = adjacentY * width + adjacentX;
                if (mask[adjacent] === 0 || visited[adjacent] !== 0) continue;
                visited[adjacent] = 1;
                queue.push(adjacent);
            }
        }
        components.push(size);
    }
    return components.sort((left, right) => right - left);
}

describe("generated water network", () => {
    test("enumerates deterministic contiguous river courses that drain to water or the extent edge", () => {
        const originX = -256;
        const originY = -256;
        const width = 512;
        const height = 512;
        const first = collectRiverTiles("new-world", originX, originY, width, height);
        const second = collectRiverTiles("new-world", originX, originY, width, height);
        expect(second).toEqual(first);
        expect(first.size).toBeGreaterThan(200);

        const resolver = createWorldSurfaceResolver({ seed: "new-world" });
        const remaining = new Set(first);
        while (remaining.size > 0) {
            const start = remaining.values().next().value as string;
            const queue = [start];
            remaining.delete(start);
            let drains = false;
            for (let cursor = 0; cursor < queue.length; cursor += 1) {
                const [x, y] = queue[cursor].split(",").map(Number);
                if (x === originX || x === originX + width - 1
                    || y === originY || y === originY + height - 1) drains = true;
                for (const neighbor of getNeighbors(x, y)) {
                    if (isBaseWater(resolver.sampleGenerated(neighbor.x, neighbor.y).baseTerrain)) drains = true;
                    const neighborKey = key(neighbor.x, neighbor.y);
                    if (!remaining.delete(neighborKey)) continue;
                    queue.push(neighborKey);
                }
            }
            expect(drains, `river component starting at ${start} must drain`).toBe(true);
        }
    });

    test("keeps overview enumeration and paged tile resolution identical", () => {
        const resolver = createWorldSurfaceResolver({ seed: "new-world" });
        const enumerated = new Set<string>();
        resolver.visitGeneratedRiverTiles(-64, -64, 128, 128, (x, y) => enumerated.add(key(x, y)));
        const outer = new Set<string>();
        resolver.visitGeneratedRiverTiles(-128, -128, 256, 256, (x, y) => outer.add(key(x, y)));
        const outerIntersection = new Set([...outer].filter(value => {
            const [x, y] = value.split(",").map(Number);
            return x >= -64 && x < 64 && y >= -64 && y < 64;
        }));
        expect(enumerated.size).toBeGreaterThan(10);
        expect(outerIntersection).toEqual(enumerated);

        for (let x = -64; x < 64; x += 1) {
            for (let y = -64; y < 64; y += 1) {
                const base = resolver.sampleGenerated(x, y).baseTerrain;
                const resolved = resolver.resolveGeneratedTile(x, y).type;
                const generatedRiver = !isBaseWater(base) && isBaseWater(resolved);
                expect(generatedRiver, `river mismatch at ${x},${y}`).toBe(enumerated.has(key(x, y)));
            }
        }
    });

    test("reuses bounded coarse river pages across adjacent overview extents", () => {
        const resolver = createWorldSurfaceResolver({ seed: "overview-river-cache" });
        resolver.visitGeneratedRiverTiles(0, 0, 256, 256, () => undefined);
        expect(resolver.waterStats).toMatchObject({
            cachedOverviewPages: 1,
            overviewPageBuilds: 1,
            overviewPageHits: 0,
            directExtentRasterizations: 0
        });

        resolver.visitGeneratedRiverTiles(256, 0, 256, 256, () => undefined);
        expect(resolver.waterStats).toMatchObject({
            cachedOverviewPages: 1,
            overviewPageBuilds: 1,
            overviewPageHits: 1,
            directExtentRasterizations: 0
        });

        resolver.visitGeneratedRiverTiles(8, 8, 32, 32, () => undefined);
        expect(resolver.waterStats.directExtentRasterizations).toBe(1);
    });

    test("uses a broad ocean field instead of fragmented terrain-detail water", () => {
        const resolver = createWorldSurfaceResolver({ seed: "new-world" });
        const width = 128;
        const height = 128;
        const mask = new Uint8Array(width * height);
        let water = 0;
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const type = resolver.sampleGenerated(-1024 + x * 16, -1024 + y * 16).baseTerrain;
                if (!isBaseWater(type)) continue;
                mask[y * width + x] = 1;
                water += 1;
            }
        }
        const components = sampledWaterComponents(mask, width, height);
        expect(water / mask.length).toBeGreaterThan(0.15);
        expect(water / mask.length).toBeLessThan(0.75);
        expect(components.length).toBeLessThan(40);
        expect(components[0] / water).toBeGreaterThan(0.25);
        expect(components.filter(size => size === 1).length).toBeLessThan(8);
    });

    test("preserves toroidal river identity across full-period shifts", () => {
        const resolver = createWorldSurfaceResolver({
            seed: "river-wrap",
            domain: { topology: "toroidal", width: 48, height: 36 }
        });
        for (let x = 0; x < 48; x += 5) {
            for (let y = 0; y < 36; y += 5) {
                expect(resolver.resolveGeneratedTile(x + 48, y + 36))
                    .toEqual(resolver.resolveGeneratedTile(x, y));
            }
        }
    });
});
