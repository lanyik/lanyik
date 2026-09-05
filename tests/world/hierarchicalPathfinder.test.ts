import { describe, expect, test, vi } from "vitest";

import { Land } from "../../src/enums";
import { getMapNeighbors } from "../../src/helpers/topology";
import { MapInfo } from "../../src/interfaces";
import {
    buildWorldNavigationSummary,
    HierarchicalPathfinder,
    MemoryWorldNavigationIndex,
    ProceduralWorldNavigationIndex
} from "../../src/world/HierarchicalPathfinder";
import { ProceduralWorldSource, StaticWorldSource, WorldChunk } from "../../src/world/WorldSource";
import { WorldGeneratorPool } from "../../src/world/WorldGeneratorPool";
import { generateWorldChunk } from "../../src/world/generateWorldChunk";
import { deferred } from "../helpers/deferred";
import { getChunkResidencyCoordinator } from "../../src/world/ChunkResidencyCoordinator";
import { createWorldDescriptor, serializeWorldDescriptor } from "../../src/world/WorldDescriptor";
import { DEFAULT_WORLD_WATER_STYLE } from "../../src/world/WorldStyleProfile";

function world(width: number, height: number, wrapped = false): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) data[x][y] = { type: Land.land };
    }
    return { data, w: width, h: height, wrapX: wrapped, wrapY: wrapped };
}

class CountingStaticSource extends StaticWorldSource {
    readonly loads: string[] = [];
    readonly releases: string[] = [];
    readonly residents = new Set<string>();
    public override async loadChunk(chunkX: number, chunkY: number): Promise<WorldChunk> {
        this.loads.push(`${chunkX},${chunkY}`);
        const chunk = await super.loadChunk(chunkX, chunkY);
        this.residents.add(`${chunkX},${chunkY}`);
        return chunk;
    }
    public override releaseChunk(chunk: WorldChunk): void {
        this.releases.push(`${chunk.chunkX},${chunk.chunkY}`);
        this.residents.delete(`${chunk.chunkX},${chunk.chunkY}`);
        super.releaseChunk(chunk);
    }
    public override hasChunk(chunkX: number, chunkY: number): boolean {
        return this.residents.has(`${chunkX},${chunkY}`);
    }
}

function indexMap(map: MapInfo, chunkSize: number): MemoryWorldNavigationIndex {
    const bounds = { width: map.w, height: map.h, wrapX: map.wrapX === true, wrapY: map.wrapY === true };
    const index = new MemoryWorldNavigationIndex(chunkSize, bounds);
    for (let chunkX = 0; chunkX < Math.ceil(map.w / chunkSize); chunkX += 1) {
        for (let chunkY = 0; chunkY < Math.ceil(map.h / chunkSize); chunkY += 1) {
            index.setSummary(buildWorldNavigationSummary(
                map, chunkX, chunkY, chunkSize,
                tile => tile.type === Land.land
            ));
        }
    }
    return index;
}

describe("HierarchicalPathfinder", () => {
    test("compacts continuous entrances symmetrically and carries cache revisions", () => {
        const map = world(36, 36);
        const options = {
            movementType: "walker",
            terrainRevision: "terrain-7",
            deltaRevision: 3
        } as const;
        const summary = buildWorldNavigationSummary(
            map, 1, 1, 12, tile => tile.type === Land.land, options
        );

        // The uncompressed open chunk has 94 directed crossings and an 8,836
        // cell matrix. Two representatives per continuous entrance need 10.
        expect(summary.portals).toHaveLength(10);
        expect(summary.costs).toHaveLength(10);
        expect(summary).toMatchObject({
            version: 2,
            movementType: "walker",
            terrainRevision: "terrain-7",
            deltaRevision: 3
        });
        const neighbors = new Map<string, ReturnType<typeof buildWorldNavigationSummary>>();
        for (const portal of summary.portals) {
            const key = `${portal.targetChunkX},${portal.targetChunkY}`;
            let neighbor = neighbors.get(key);
            if (!neighbor) {
                neighbor = buildWorldNavigationSummary(
                    map,
                    portal.targetChunkX,
                    portal.targetChunkY,
                    12,
                    tile => tile.type === Land.land,
                    options
                );
                neighbors.set(key, neighbor);
            }
            expect(neighbor.portals).toContainEqual(expect.objectContaining({
                inside: portal.outside,
                outside: portal.inside,
                entranceId: portal.entranceId
            }));
        }
    });

    test("searches summaries first and loads detail only for the resulting corridor", async () => {
        const map = world(60, 36); // 15 source chunks; the route needs one five-chunk row.
        const source = new CountingStaticSource(map, { chunkSize: 12 });
        const index = indexMap(map, 12);
        const finder = new HierarchicalPathfinder(source, index, tile => tile.type === Land.land);

        const result = await finder.find({ x: 1, y: 18 }, { x: 58, y: 18 });
        expect(result.path[0]).toEqual({ x: 1, y: 18 });
        expect(result.path[result.path.length - 1]).toEqual({ x: 58, y: 18 });
        expect(result.chunks).toHaveLength(5);
        expect(new Set(source.loads)).toEqual(new Set(result.chunks.map(chunk => `${chunk.x},${chunk.y}`)));
        expect(source.loads.length).toBeLessThan(15);
        for (let index = 1; index < result.path.length; index += 1) {
            expect(getMapNeighbors(map, result.path[index - 1].x, result.path[index - 1].y))
                .toContainEqual(expect.objectContaining(result.path[index]));
        }

        result.release();
        result.release();
        expect(source.releases).toHaveLength(result.loadedChunks.length);
    });

    test("returns no route when the portal graph is split by an unloaded barrier", async () => {
        const map = world(60, 36);
        for (let x = 24; x < 36; x += 1) {
            for (let y = 0; y < map.h; y += 1) map.data[x][y] = { type: Land.sea };
        }
        const source = new CountingStaticSource(map, { chunkSize: 12 });
        const finder = new HierarchicalPathfinder(source, indexMap(map, 12), tile => tile.type === Land.land);
        const result = await finder.find({ x: 1, y: 18 }, { x: 58, y: 18 });
        expect(result.path).toEqual([]);
        // Only endpoint detail is loaded; high-level exploration uses summaries.
        expect(source.loads).toHaveLength(2);
        result.release();
    });

    test("cancels without leaking path-owned detail chunks", async () => {
        const map = world(60, 36);
        const source = new CountingStaticSource(map, { chunkSize: 12 });
        const finder = new HierarchicalPathfinder(source, indexMap(map, 12), tile => tile.type === Land.land);
        const controller = new AbortController();
        controller.abort();
        await expect(finder.find({ x: 1, y: 18 }, { x: 58, y: 18 }, { signal: controller.signal }))
            .rejects.toMatchObject({ name: "AbortError" });
        expect(source.loads).toHaveLength(0);
    });

    test("routes through canonical portals across a toroidal seam", async () => {
        const map = world(24, 24, true);
        const source = new CountingStaticSource(map, { chunkSize: 12 });
        const finder = new HierarchicalPathfinder(source, indexMap(map, 12), tile => tile.type === Land.land);
        const result = await finder.find({ x: 0, y: 10 }, { x: 23, y: 10 });
        expect(result.path).toHaveLength(2);
        expect(result.path[1]).toEqual({ x: 23, y: 10 });
        expect(result.chunks).toHaveLength(2);
        result.release();
    });

    test("releasing a route preserves a render-owned chunk lease", async () => {
        const map = world(36, 12);
        const source = new CountingStaticSource(map, { chunkSize: 12 });
        const residency = getChunkResidencyCoordinator(source);
        const renderLease = await residency.acquireChunk(0, 0, { owner: "render" });
        const finder = new HierarchicalPathfinder(
            source,
            indexMap(map, 12),
            tile => tile.type === Land.land
        );

        const route = await finder.find({ x: 1, y: 5 }, { x: 34, y: 5 });
        expect(source.loads.filter(key => key === "0,0")).toHaveLength(1);
        route.release();
        expect(source.releases).not.toContain("0,0");
        expect(source.hasChunk(0, 0)).toBe(true);

        renderLease.release();
        expect(source.releases).toContain("0,0");
        expect(source.hasChunk(0, 0)).toBe(false);
    });

    test("uses weighted costs across summaries and detailed refinement", async () => {
        const map = world(36, 12);
        const movementCost = (_tile: MapInfo["data"][number][number], x: number, y: number) =>
            y === 5 && x > 0 && x < 35 ? 50 : 1;
        const source = new CountingStaticSource(map, { chunkSize: 12 });
        const index = new MemoryWorldNavigationIndex(12, {
            width: map.w, height: map.h, wrapX: false, wrapY: false
        }, "walker");
        for (let chunkX = 0; chunkX < 3; chunkX += 1) {
            index.setSummary(buildWorldNavigationSummary(
                map,
                chunkX,
                0,
                12,
                tile => tile.type === Land.land,
                { movementType: "walker", movementCost }
            ));
        }
        const finder = new HierarchicalPathfinder(
            source,
            index,
            tile => tile.type === Land.land,
            { movementType: "walker", movementCost }
        );

        const result = await finder.find({ x: 0, y: 5 }, { x: 35, y: 5 });
        const cost = result.path.slice(1).reduce((total, point) =>
            total + movementCost(map.data[point.x][point.y], point.x, point.y), 0);
        expect(result.path.some(point => point.y !== 5)).toBe(true);
        expect(cost).toBeLessThan(200);
        result.release();
    });

    test("invalidates and rejects a navigation summary with a stale delta revision", async () => {
        const map = world(24, 12);
        class RevisedSource extends CountingStaticSource {
            public getChunkRevision(): { terrainRevision: number; deltaRevision: number } {
                return { terrainRevision: 0, deltaRevision: 1 };
            }
        }
        const source = new RevisedSource(map, { chunkSize: 12 });
        const index = indexMap(map, 12);
        const finder = new HierarchicalPathfinder(
            source,
            index,
            tile => tile.type === Land.land
        );

        await expect(finder.find({ x: 1, y: 5 }, { x: 22, y: 5 }))
            .rejects.toMatchObject({ name: "StaleWorldNavigationSummaryError", chunkX: 0, chunkY: 0 });
        expect(await index.getSummary(0, 0)).toBeUndefined();
        expect(source.releases).toEqual(["0,0", "1,0"]);
    });
});

describe("ProceduralWorldNavigationIndex", () => {
    const createSource = (seed: string, waterStyle = DEFAULT_WORLD_WATER_STYLE) => new ProceduralWorldSource({
        seed, chunkSize: 12, waterStyle, workerUrl: "unused"
    }, {
        pool: new WorldGeneratorPool("unused", { size: 1, clientFactory: () => ({
            generateChunk: options => Promise.resolve(generateWorldChunk(options)), dispose() {}
        }) })
    });

    test("generates deterministic summaries without a WorldSource detail load and bounds its cache", async () => {
        const waterStyle = { ...DEFAULT_WORLD_WATER_STYLE, oceanLevel: 0.52 };
        const source = createSource("navigation", waterStyle);
        const index = new ProceduralWorldNavigationIndex({
            source, maxCachedSummaries: 2,
            passable: () => true
        });
        let yielded = false;
        setTimeout(() => { yielded = true; }, 0);
        const first = await index.getSummary(0, 0);
        expect(yielded).toBe(true);
        expect(source.hasChunk(0, 0)).toBe(false);
        expect(first?.portals.length).toBeGreaterThan(0);
        expect(first?.terrainRevision).toBe(serializeWorldDescriptor(
            createWorldDescriptor({ seed: "navigation", chunkSize: 12, waterStyle })
        ));
        expect(await index.getSummary(0, 0)).toEqual(first);
        await index.getSummary(1, 0);
        await index.getSummary(2, 0);
        expect(index.cachedSummaries).toBe(2);
        index.dispose();
        source.dispose();
    });

    test("clear and dispose release cached summaries", async () => {
        const source = createSource("navigation-lifecycle");
        const index = new ProceduralWorldNavigationIndex({
            source, maxCachedSummaries: 2, passable: () => true
        });
        await index.getSummary(0, 0);
        expect(index.cachedSummaries).toBe(1);

        index.clear();
        expect(index.cachedSummaries).toBe(0);
        await index.getSummary(1, 0);
        index.dispose();

        expect(index.cachedSummaries).toBe(0);
        await expect(index.getSummary(0, 0)).rejects.toThrow("disposed");
        // The navigation index borrows the source's pool and cannot close it.
        expect(await source.sampleBaseChunk(0, 0)).toBeDefined();
        source.dispose();
    });

    test.each(["abort", "clear", "invalidate", "dispose"])("rejects a late summary after %s", async action => {
        const source = createSource("navigation-cancel");
        const packed = generateWorldChunk({ seed: "navigation-cancel", chunkSize: 12, chunkX: 0, chunkY: 0 });
        const pending = deferred<typeof packed>();
        const sample = vi.spyOn(source, "sampleBaseChunk").mockReturnValue(pending.promise);
        const index = new ProceduralWorldNavigationIndex({ source });
        const controller = new AbortController();
        const summary = index.getSummary(0, 0, controller.signal);
        const rejected = expect(summary).rejects.toMatchObject({ name: "AbortError" });
        if (action === "abort") controller.abort();
        else if (action === "invalidate") index.invalidateChunk(0, 0);
        else if (action === "clear") index.clear();
        else index.dispose();
        expect(sample.mock.calls[0][2]?.signal?.aborted).toBe(true);
        pending.resolve(packed);
        await rejected;
        expect(index.cachedSummaries).toBe(0);
        index.dispose();
        source.dispose();
    });
});
