import { describe, expect, test, vi } from "vitest";

import { Land } from "../../src/enums";
import { getNeighbors } from "../../src/helpers/neighbors";
import { worldAxialToOffset } from "../../src/world/hexRaster";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";
import { createWorldWaterSampler, WorldWaterSampleAt } from "../../src/world/WorldWaterSampler";
import { DEFAULT_WORLD_WATER_STYLE, WORLD_STYLE_PROFILE, WorldStyleProfile } from "../../src/world/WorldStyleProfile";

const isBaseWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;
const key = (x: number, y: number): string => `${x},${y}`;

// A controlled coast and downhill field isolate reach length / mouth width
// from seeded terrain composition. The same sources and routing are retained.
function slopingRiverTiles(overrides: Partial<WorldStyleProfile["rivers"]>): Set<string> {
    const sampleAt: WorldWaterSampleAt = (x, y) => x < 0 || y < 0 || x >= 160 || y >= 160
        ? undefined
        : {
            baseTerrain: x >= 112 ? Land.sea : Land.land,
            landform: { ocean: 1 - x / 256, elevation: 0.6, moisture: 1, valley: 0, continentalness: 0.8 }
        };
    const sampler = createWorldWaterSampler(1, { topology: "bounded", width: 160, height: 160 }, {
        ...WORLD_STYLE_PROFILE,
        rivers: {
            ...WORLD_STYLE_PROFILE.rivers,
            courseWarpAmplitude: 0, sourceCellSize: 8, sourcesPerCell: 1,
            potentialJitter: 0, highFlowThreshold: 32, mouthWidthMultiplier: 1,
            ...overrides
        }
    });
    const tiles = new Set<string>();
    sampler.forEachRiverTile(0, 0, 160, 160, sampleAt, (x, y) => {
        if (x < 112) tiles.add(key(x, y));
    });
    return tiles;
}

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
    test("extends established courses upstream without removing their downstream water", () => {
        const original = slopingRiverTiles({ courseLengthMultiplier: 1 });
        const extended = slopingRiverTiles({ courseLengthMultiplier: 1.5 });
        const longest = slopingRiverTiles({ courseLengthMultiplier: 3 });
        for (const tile of original) expect(extended.has(tile)).toBe(true);
        for (const tile of extended) expect(longest.has(tile)).toBe(true);
        expect(extended.size).toBeGreaterThan(original.size * 1.1);
        expect(longest.size).toBeGreaterThan(extended.size);
        const upstreamArea = (tiles: Set<string>) => [...tiles].filter(tile => Number(tile.split(",")[0]) < 32).length;
        expect(upstreamArea(extended)).toBeGreaterThan(upstreamArea(original));
    });

    test("widens the sea approach without changing the upstream channel", () => {
        const original = slopingRiverTiles({ mouthWidthMultiplier: 1 });
        const estuary = slopingRiverTiles({ mouthWidthMultiplier: 1.6 });
        for (const tile of original) expect(estuary.has(tile)).toBe(true);
        const additions = [...estuary].filter(tile => !original.has(tile));
        expect(additions.length).toBeGreaterThan(20);
        for (const tile of additions) {
            const x = Number(tile.split(",")[0]);
            expect(x).toBeGreaterThan(80);
            expect(x).toBeLessThan(112);
        }
    });

    test("grows through ordinary land along the longest incoming branch, not the highest adjacent dead end", () => {
        // One eligible anchor, one steep but short branch, one long lower-potential
        // branch. Non-anchor land is too low to spawn a source, but can carry water.
        const nodes = new Map<string, { potential: number; anchor: boolean }>();
        for (const [q, r, potential] of [
            [0, 0, -1], [0, 1, 0.1], [0, 2, 0.2], [1, 2, 0.9],
            [-1, 3, 0.3], [-2, 4, 0.4], [-3, 5, 0.5], [-4, 6, 0.6]
        ]) {
            const world = worldAxialToOffset({ x: q * 8, y: r * 8 });
            nodes.set(key(world.x, world.y), { potential, anchor: q === 0 && r === 2 });
        }
        const sampleAt: WorldWaterSampleAt = (x, y) => {
            const node = nodes.get(key(x, y));
            // Unlisted coarse nodes block drainage; the raster between nodes
            // still has a defined base terrain for the land-only river mask.
            return {
                baseTerrain: !node ? Land.mountain : node.potential < 0 ? Land.sea : Land.land,
                landform: {
                    ocean: node?.potential ?? 1, elevation: node?.anchor ? 0.6 : 0.3,
                    moisture: 1, valley: 0, continentalness: 0.8
                }
            };
        };
        const collect = (courseLengthMultiplier: number, blocked = false) => {
            const sampler = createWorldWaterSampler(1, { topology: "infinite" }, {
                ...WORLD_STYLE_PROFILE,
                rivers: {
                    ...WORLD_STYLE_PROFILE.rivers, courseWarpAmplitude: 0,
                    sourceCellSize: 1, sourcesPerCell: 1, maximumCourseLength: 12,
                    baseCourseRadius: 0.5, highFlowCourseRadius: 1, mouthWidthMultiplier: 1,
                    potentialJitter: 0, courseLengthMultiplier
                }
            });
            const tiles = new Set<string>();
            sampler.forEachRiverTile(-64, -16, 128, 96, (x, y) => {
                const sample = sampleAt(x, y);
                return sample && blocked && sample.landform.ocean === 0.4
                    ? { ...sample, baseTerrain: Land.mountain } : sample;
            }, (x, y) => tiles.add(key(x, y)));
            return tiles;
        };
        const baseline = collect(1);
        const longer = collect(3);
        expect(baseline.size).toBeGreaterThan(0);
        for (const tile of baseline) expect(longer.has(tile)).toBe(true);
        expect([...baseline].some(tile => Number(tile.split(",")[0]) < -8)).toBe(false);
        expect([...longer].some(tile => Number(tile.split(",")[0]) < -16)).toBe(true);
        // Choosing the steep branch would put water east of the anchor instead.
        expect([...longer].some(tile => Number(tile.split(",")[0]) > 4)).toBe(false);
        const stopped = collect(3, true);
        expect([...stopped].some(tile => Number(tile.split(",")[0]) < -16)).toBe(false);
    });

    test("changes real seeded river extent across the entire length slider, not just an upstream search cap", () => {
        let previous = new Set<string>();
        const counts: number[] = [];
        for (const riverLength of [10, 50, 100, 150, 200, 250, 300]) {
            const resolver = createWorldSurfaceResolver({
                seed: "new-world", waterStyle: { ...DEFAULT_WORLD_WATER_STYLE, riverLength }
            });
            const cells = new Set<string>();
            resolver.visitGeneratedRiverTiles(-256, -256, 512, 512, (x, y) => cells.add(key(x, y)));
            if (riverLength === 100 || riverLength === 300) {
                let hash = 0x811c9dc5;
                for (const character of [...cells].sort().join(";")) {
                    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
                }
                expect((hash >>> 0).toString(16)).toBe(riverLength === 100 ? "ed375a16" : "65ae1140");
            }
            for (const cell of previous) expect(cells.has(cell)).toBe(true);
            expect(cells.size).toBeGreaterThan(previous.size + 50);
            counts.push(cells.size);
            previous = cells;
        }
        expect(counts[6]).toBeGreaterThan(counts[2] * 1.2);
        // More water alone could mean a width change. Subset checks above and
        // the controlled source/mouth tests below require actual upstream growth.
        expect(counts[6]).toBeGreaterThan(1443); // v18's complete 100% network
    });

    test("shorter courses retain a connected downstream suffix on a controlled coast", () => {
        const short = slopingRiverTiles({ courseLengthMultiplier: 0.25 });
        const half = slopingRiverTiles({ courseLengthMultiplier: 0.5 });
        const full = slopingRiverTiles({ courseLengthMultiplier: 1 });
        for (const tile of short) expect(half.has(tile)).toBe(true);
        for (const tile of half) expect(full.has(tile)).toBe(true);
        // The shortest source can end inside the last coarse reach. Check the
        // actual shoreline contact, not an eight-tile band that includes its head.
        const mouth = (tiles: Set<string>) => new Set([...tiles].filter(tile => Number(tile.split(",")[0]) >= 110));
        expect(mouth(short).size).toBeGreaterThan(0);
        expect(mouth(short)).toEqual(mouth(full));
        expect(short.size).toBeLessThan(full.size * 0.6);
        const remaining = new Set(short);
        while (remaining.size > 0) {
            const start = remaining.values().next().value as string;
            const queue = [start];
            remaining.delete(start);
            let drains = false;
            for (const tile of queue) {
                const [x, y] = tile.split(",").map(Number);
                if (x >= 111 || y === 0 || y === 159) drains = true;
                for (const neighbor of getNeighbors(x, y)) {
                    const next = key(neighbor.x, neighbor.y);
                    if (remaining.delete(next)) queue.push(next);
                }
            }
            expect(drains).toBe(true);
        }
    });

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

    test.each([25, 100, 200, 300])("keeps overview and paged resolution identical at length %i percent", riverLength => {
        const resolver = createWorldSurfaceResolver({
            seed: "new-world", waterStyle: { ...DEFAULT_WORLD_WATER_STYLE, riverLength }
        });
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

    test("bounds large overview batches and skips all terrain sampling on cached pages", () => {
        const sampler = createWorldWaterSampler(1, { topology: "infinite" }, WORLD_STYLE_PROFILE);
        const sampleAt = vi.fn<WorldWaterSampleAt>(() => ({ baseTerrain: Land.sea,
            landform: { ocean: 0, elevation: 0, moisture: 0, valley: 0, continentalness: 0 } }));
        sampler.forEachRiverTile(0, 0, 256, 256, sampleAt, () => undefined);
        const batches = sampler.riverTileBatches(0, 0, 4096, 4096, sampleAt, () => undefined);
        expect([...batches]).toHaveLength(4);
        sampleAt.mockClear();
        sampler.forEachRiverTile(0, 0, 4096, 4096, sampleAt, () => undefined);
        expect(sampleAt).not.toHaveBeenCalled();
        // Mixing mask resolutions must not alias pages at the same origin.
        expect(sampler.stats.cachedOverviewPages).toBe(5);
        sampler.forEachRiverTile(-8192, -8192, 16384, 16384, sampleAt, () => undefined);
        expect(sampler.stats.maximumRasterizedTiles).toBe(2048 * 2048);
        expect(sampler.stats.cachedOverviewPages).toBeLessThanOrEqual(WORLD_STYLE_PROFILE.rivers.maximumCachedPages);
        expect(sampler.stats.cachedRiverBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
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

    test.each([100, 300])("keeps wide fractional mouths identical across real wrap-crossing rivers at %i percent", riverLength => {
        const resolver = createWorldSurfaceResolver({
            seed: "new-world",
            domain: { topology: "toroidal", width: 512, height: 512 },
            // Pin a known coast/river intersection at the seam independently
            // of authoring defaults; an all-sea seam cannot exercise this case.
            waterStyle: {
                ...DEFAULT_WORLD_WATER_STYLE,
                oceanScale: 1, oceanLevel: 0.47, riverSourceCellSize: 12,
                riverWarpScale: 0.03, riverWarpAmplitude: 3.25,
                riverHighFlowRadius: 6, riverHighFlowThreshold: 2, riverLength
            }
        });
        const original = new Set<string>();
        const shifted = new Set<string>();
        let boundaryTiles = 0;
        resolver.visitGeneratedRiverTiles(0, 0, 512, 512, (x, y) => {
            original.add(key(x, y));
            if (x < 8 || x >= 504 || y < 8 || y >= 504) boundaryTiles += 1;
        });
        resolver.visitGeneratedRiverTiles(512, -512, 512, 512, (x, y) => shifted.add(key(x - 512, y + 512)));
        expect(original.size).toBeGreaterThan(1000);
        expect(boundaryTiles).toBeGreaterThan(0);
        expect(shifted).toEqual(original);
    });
});
