import { describe, expect, test } from "vitest";

import {
    getNeighbors,
    NEIGHBOR_DIRECTION_BITS,
    NEIGHBOR_DIRECTIONS,
    oppositeNeighborDirection
} from "../../src/helpers/neighbors";
import { seedToUint32 } from "../../src/world/noise";
import { createWorldWaterSampler } from "../../src/world/WorldWaterSampler";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";
import { WORLD_STYLE_PROFILE } from "../../src/world/WorldStyleProfile";

const pointKey = (x: number, y: number): string => `${x},${y}`;

function sampleRiverKeys(seed: string, min: number, max: number): Set<string> {
    const resolver = createWorldSurfaceResolver({ seed, domain: { topology: "infinite" } });
    const sampler = createWorldWaterSampler(
        seedToUint32(seed),
        { topology: "infinite" },
        WORLD_STYLE_PROFILE
    );
    const result = new Set<string>();
    for (let x = min; x < max; x += 1) {
        for (let y = min; y < max; y += 1) {
            if (sampler.isRiverTile(x, y, (sampleX, sampleY) =>
                resolver.sampleGenerated(sampleX, sampleY))) result.add(pointKey(x, y));
        }
    }
    return result;
}

function maximumRiverComponent(points: ReadonlySet<string>): number {
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
        const first = sampleRiverKeys("rough-water-field", -128, 128);
        const second = sampleRiverKeys("rough-water-field", -128, 128);
        expect(second).toEqual(first);
        expect(first.size).toBeGreaterThan(350);
        expect(first.size).toBeLessThan(3_500);
        expect(maximumRiverComponent(first)).toBeGreaterThan(40);

        const sampler = createWorldWaterSampler(
            seedToUint32("rough-water-field"),
            { topology: "infinite" },
            WORLD_STYLE_PROFILE
        );
        const resolver = createWorldSurfaceResolver({
            seed: "rough-water-field", domain: { topology: "infinite" }
        });
        const usedDirections = new Set<string>();
        let isolated = 0;
        let turns = 0;
        for (const key of first) {
            const [x, y] = key.split(",").map(Number);
            const edges = sampler.riverEdgesAt(
                x,
                y,
                (sampleX, sampleY) => resolver.sampleGenerated(sampleX, sampleY)
            );
            expect(edges).toBeDefined();
            expect(edges).toBeGreaterThan(0);
            for (const neighbor of getNeighbors(x, y)) {
                if (!(edges! & 1 << NEIGHBOR_DIRECTION_BITS[neighbor.direction])) continue;
                const adjacent = resolver.sampleGenerated(neighbor.x, neighbor.y);
                const adjacentEdges = sampler.riverEdgesAt(
                    neighbor.x,
                    neighbor.y,
                    (sampleX, sampleY) => resolver.sampleGenerated(sampleX, sampleY)
                );
                if (adjacent.baseTerrain === "sea" || adjacent.baseTerrain === "coastal") continue;
                expect(adjacentEdges).toBeDefined();
                expect(adjacentEdges! & 1 << NEIGHBOR_DIRECTION_BITS[
                    oppositeNeighborDirection(neighbor.direction)
                ]).not.toBe(0);
            }
            const connected = getNeighbors(x, y).filter(neighbor => {
                const connectedEdge = Boolean(
                    edges! & 1 << NEIGHBOR_DIRECTION_BITS[neighbor.direction]
                );
                if (connectedEdge) usedDirections.add(neighbor.direction);
                return connectedEdge;
            });
            if (connected.length === 0) isolated += 1;
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

    test("keeps the infinite page cache bounded while agreeing across page edges", () => {
        const sampler = createWorldWaterSampler(
            seedToUint32("paged-water"),
            { topology: "infinite" },
            WORLD_STYLE_PROFILE
        );
        const resolver = createWorldSurfaceResolver({
            seed: "paged-water", domain: { topology: "infinite" }
        });
        const isRiver = (x: number, y: number) => sampler.isRiverTile(
            x,
            y,
            (sampleX, sampleY) => resolver.sampleGenerated(sampleX, sampleY)
        );
        for (let page = -8; page <= 8; page += 1) {
            isRiver(page * WORLD_STYLE_PROFILE.rivers.pageSize, page * 3);
        }
        expect(sampler.stats.cachedPages).toBe(WORLD_STYLE_PROFILE.rivers.maximumCachedPages);
        expect(sampler.stats.toroidalMaskReady).toBe(false);

        let boundaryRiverTiles = 0;
        let crossPageConnections = 0;
        for (let y = -96; y <= 96; y += 1) {
            for (const x of [-1, 0, 31, 32, 63, 64]) {
                if (!isRiver(x, y)) continue;
                boundaryRiverTiles += 1;
                expect(getNeighbors(x, y).some(neighbor => isRiver(neighbor.x, neighbor.y))).toBe(true);
            }
            for (const edgeX of [-1, 31, 63]) {
                if (!isRiver(edgeX, y)) continue;
                crossPageConnections += getNeighbors(edgeX, y).filter(neighbor =>
                    neighbor.x === edgeX + 1 && isRiver(neighbor.x, neighbor.y)
                ).length;
            }
        }
        expect(boundaryRiverTiles).toBeGreaterThan(0);
        expect(crossPageConnections).toBeGreaterThan(0);
    });

    test("builds one exactly periodic toroidal mask", () => {
        const width = 128;
        const height = 96;
        const sampler = createWorldWaterSampler(
            seedToUint32("toroidal-water"),
            { topology: "toroidal", width, height },
            WORLD_STYLE_PROFILE
        );
        const resolver = createWorldSurfaceResolver({
            seed: "toroidal-water", domain: { topology: "toroidal", width, height }
        });
        const isRiver = (x: number, y: number) => sampler.isRiverTile(
            x,
            y,
            (sampleX, sampleY) => resolver.sampleGenerated(sampleX, sampleY)
        );
        let riverTiles = 0;
        for (let x = 0; x < width; x += 1) {
            for (let y = 0; y < height; y += 1) {
                const river = isRiver(x, y);
                if (river) riverTiles += 1;
                expect(isRiver(x - width, y + height)).toBe(river);
            }
        }
        expect(riverTiles).toBeGreaterThan(50);
        expect(riverTiles).toBeLessThan(1_500);
        expect(sampler.stats.toroidalMaskReady).toBe(true);
        expect(sampler.stats.toroidalRiverTiles).toBe(riverTiles);
    });
});
