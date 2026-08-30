import { describe, expect, test, vi } from "vitest";

import {
    assertHydrologyRegion,
    assertMatchingHydrologyPorts,
    assertMacroDrainageGraph,
    buildMacroDrainageGraph,
    createWorldDescriptorV2,
    createProceduralMacroHeightSource,
    deriveHydrologyRaster,
    generateHydrologyRegion,
    generateBaseSemanticChunk,
    HydrologyRegion,
    HydrologyRegionGenerator,
    HydrologyRegionSpatialIndex,
    HydrologyWaterKind,
    HYDROLOGY_COORDINATE_SCALE,
    hydrologyRegionCoordinate,
    locateSemanticTile,
    OCEAN_BODY_ID,
    WorldGeneratorPool
} from "../../src/index";
import { generateWorldChunk } from "../../src/world/generateWorldChunk";
import type { ChunkGeneratorClient } from "../../src/world/WorldGeneratorPool";

function staticDescriptor(hash = "a") {
    return createWorldDescriptorV2({
        sourceKind: "static",
        sourceContentHash: hash.repeat(64),
        topology: { kind: "bounded", width: 256, height: 256 }
    });
}

const bowlHeightSource = Object.freeze({
    sampleMacroHeight(x: number, y: number): number {
        return 50_000 + Math.abs(x - 120) + Math.abs(y - 120);
    }
});

function regionSnapshot(region: HydrologyRegion): unknown {
    return {
        key: region.key,
        revision: region.revision,
        validBounds: region.validBounds,
        boundaryPorts: region.boundaryPorts,
        rivers: region.rivers.map(river => ({
            ...river,
            controlPoints: [...river.controlPoints],
            widthProfile: [...river.widthProfile],
            levelProfile: [...river.levelProfile]
        })),
        lakes: region.lakes.map(lake => ({ ...lake, boundaryPoints: [...lake.boundaryPoints] })),
        mouths: region.mouths,
        bodies: region.bodies
    };
}

describe("surface foundation v2 hydrology", () => {
    test("uses exactly the BaseSemanticChunk macro-height quantization domain", () => {
        const descriptor = createWorldDescriptorV2({ seed: "hydrology-height-authority" });
        const source = createProceduralMacroHeightSource(descriptor);
        for (const [x, y] of [[8, 8], [-137, 205], [511, -513]] as const) {
            const location = locateSemanticTile(x, y);
            const chunk = generateBaseSemanticChunk({ descriptor, key: location.key });
            expect(source.sampleMacroHeight(x, y)).toBe(chunk.macroHeight[location.index]);
        }
    });

    test("builds a finite globally terminating drainage graph with stable IDs", () => {
        const descriptor = staticDescriptor();
        const first = buildMacroDrainageGraph({ descriptor, macroHeightSource: bowlHeightSource });
        const second = buildMacroDrainageGraph({ descriptor, macroHeightSource: bowlHeightSource });
        expect(() => assertMacroDrainageGraph(first)).not.toThrow();
        expect(first).toEqual(second);
        expect(first.terminals).toHaveLength(1);
        expect(first.terminals[0]).toMatchObject({ kind: "lake" });
        expect(first.nodes.length).toBe(16 * 16);
        expect(Math.max(...first.nodes.map(node => node.drainageRank))).toBeGreaterThanOrEqual(8);
        expect(Math.max(...first.nodes.map(node => node.accumulatedFlow))).toBe(first.nodes.length);

        const nodes = new Map(first.nodes.map(node => [node.nodeId, node]));
        for (const start of first.nodes) {
            let current = start;
            let steps = 0;
            while (current.downstreamNodeId) {
                const downstream = nodes.get(current.downstreamNodeId)!;
                expect(downstream.drainageRank).toBeLessThan(current.drainageRank);
                expect(downstream.drainageLevel).toBeLessThanOrEqual(current.drainageLevel);
                expect(downstream.dischargeClass).toBeGreaterThanOrEqual(current.dischargeClass);
                current = downstream;
                steps += 1;
                expect(steps).toBeLessThan(first.nodes.length);
            }
            expect(current.terminalBodyId).toBe(start.terminalBodyId);
        }

        const corruptNodes = first.nodes.map(node => ({ ...node }));
        const corrupt = corruptNodes.find(node => node.downstreamNodeId)!;
        corrupt.drainageRank = nodes.get(corrupt.downstreamNodeId!)!.drainageRank;
        expect(() => assertMacroDrainageGraph({ ...first, nodes: corruptNodes })).toThrow(/rank/);
    });

    test("clips one graph into request-order-independent regions with matching ports", () => {
        const descriptor = staticDescriptor();
        const keys = [
            { regionX: 0, regionY: 0 },
            { regionX: 0, regionY: 1 },
            { regionX: 1, regionY: 0 },
            { regionX: 1, regionY: 1 }
        ] as const;
        const forwardGenerator = new HydrologyRegionGenerator(descriptor, { macroHeightSource: bowlHeightSource });
        const reverseGenerator = new HydrologyRegionGenerator(descriptor, { macroHeightSource: bowlHeightSource });
        const forward = keys.map(key => forwardGenerator.generate(key));
        const reverse = [...keys].reverse().map(key => reverseGenerator.generate(key)).reverse();
        expect(forward.map(regionSnapshot)).toEqual(reverse.map(regionSnapshot));
        expect(forward.some(region => region.rivers.length > 40)).toBe(true);
        const lakeSlices = forward.flatMap(region => region.lakes);
        expect(lakeSlices.length).toBeGreaterThan(1);
        expect(new Set(lakeSlices.map(lake => lake.bodyId))).toHaveLength(1);
        expect(forward.flatMap(region => region.mouths).length).toBeGreaterThan(0);

        const ports = new Map<string, typeof forward[number]["boundaryPorts"]>();
        for (const region of forward) {
            expect(() => assertHydrologyRegion(region)).not.toThrow();
            for (const port of region.boundaryPorts) {
                ports.set(port.connectionId, [...(ports.get(port.connectionId) ?? []), port]);
            }
        }
        expect(ports.size).toBeGreaterThan(10);
        for (const matching of ports.values()) {
            expect(matching).toHaveLength(2);
            expect(matching[0]).toMatchObject({
                connectionId: matching[1].connectionId,
                edgeId: matching[1].edgeId,
                riverId: matching[1].riverId,
                bodyId: matching[1].bodyId,
                width: matching[1].width,
                level: matching[1].level,
                dischargeClass: matching[1].dischargeClass,
                flowX: matching[1].flowX,
                flowY: matching[1].flowY
            });
            expect(new Set(matching.map(port => port.flow))).toEqual(new Set(["in", "out"]));
            expect(() => assertMatchingHydrologyPorts(matching[0], matching[1])).not.toThrow();
        }
    });

    test("keeps infinite basin output independent of region request order", () => {
        const descriptor = createWorldDescriptorV2({ seed: "hydrology-order" });
        const keys = Array.from({ length: 16 }, (_, index) => ({
            regionX: Math.floor(index / 4),
            regionY: index % 4
        }));
        const forwardGenerator = new HydrologyRegionGenerator(descriptor);
        const reverseGenerator = new HydrologyRegionGenerator(descriptor);
        const forward = keys.map(key => forwardGenerator.generate(key));
        const reverseByKey = new Map([...keys].reverse().map(key => {
            const region = reverseGenerator.generate(key);
            return [`${key.regionX},${key.regionY}`, region] as const;
        }));
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            expect(regionSnapshot(forward[index]))
                .toEqual(regionSnapshot(reverseByKey.get(`${key.regionX},${key.regionY}`)!));
        }
        const connections = new Map<string, number>();
        for (const region of forward) for (const port of region.boundaryPorts) {
            connections.set(port.connectionId, (connections.get(port.connectionId) ?? 0) + 1);
        }
        expect(connections.size).toBeGreaterThan(0);
        expect(new Set(connections.values())).toEqual(new Set([2]));
    });

    test("handles partial toroidal regions and matches a four-corner seam", () => {
        const descriptor = createWorldDescriptorV2({
            sourceKind: "static",
            sourceContentHash: "b".repeat(64),
            topology: { kind: "toroidal", width: 160, height: 160 }
        });
        const generator = new HydrologyRegionGenerator(descriptor, {
            macroHeightSource: {
                sampleMacroHeight(x, y) {
                    if (x === 8 && y === 8) return 49_000;
                    return 50_000 + Math.abs(x - 152) + Math.abs(y - 152);
                }
            }
        });
        const regions = [
            generator.generate({ regionX: 0, regionY: 0 }),
            generator.generate({ regionX: 0, regionY: 1 }),
            generator.generate({ regionX: 1, regionY: 0 }),
            generator.generate({ regionX: 1, regionY: 1 })
        ];
        expect(regions[3].validBounds).toEqual({ minX: 0, minY: 0, maxXExclusive: 32, maxYExclusive: 32 });
        expect(regionSnapshot(generator.generate({ regionX: -1, regionY: -1 })))
            .toEqual(regionSnapshot(regions[3]));

        const byConnection = new Map<string, Array<{ region: HydrologyRegion; port: HydrologyRegion["boundaryPorts"][number] }>>();
        for (const region of regions) for (const port of region.boundaryPorts) {
            byConnection.set(port.connectionId, [...(byConnection.get(port.connectionId) ?? []), { region, port }]);
        }
        const corner = [...byConnection.values()].find(pair => pair.length === 2
            && pair.every(({ region, port }) => {
                const maxX = region.validBounds.maxXExclusive * HYDROLOGY_COORDINATE_SCALE;
                const maxY = region.validBounds.maxYExclusive * HYDROLOGY_COORDINATE_SCALE;
                return (port.x === 0 || port.x === maxX) && (port.y === 0 || port.y === maxY);
            }));
        expect(corner).toBeDefined();
        expect(corner![0].port.connectionId).toBe(corner![1].port.connectionId);
        expect(corner![0].port.width).toBe(corner![1].port.width);
        expect(corner![0].port.level).toBe(corner![1].port.level);
        expect(new Set(corner!.map(candidate => candidate.port.flow))).toEqual(new Set(["in", "out"]));
    });

    test("derives disposable ocean, lake and river rasters through the spatial index", () => {
        const descriptor = staticDescriptor();
        const generator = new HydrologyRegionGenerator(descriptor, { macroHeightSource: bowlHeightSource });
        const region = generator.generate({ regionX: 0, regionY: 0 });
        const index = new HydrologyRegionSpatialIndex(region);
        const nearby = index.query({ minX: 112, minY: 112, maxXExclusive: 128, maxYExclusive: 128 });
        expect(nearby.length).toBeLessThan(region.rivers.length + region.lakes.length + region.mouths.length);
        const land = new Uint16Array(128 * 128).fill(65_535);
        const water = deriveHydrologyRaster(region, { macroHeight: land, spatialIndex: index });
        expect(water.kind).toContain(HydrologyWaterKind.River);
        expect(water.kind).toContain(HydrologyWaterKind.Lake);
        expect(water.kind).not.toContain(HydrologyWaterKind.Ocean);
        for (let index = 0; index < water.kind.length; index += 1) {
            if (water.kind[index] !== HydrologyWaterKind.River) continue;
            expect(water.coverage[index]).toBeGreaterThan(0);
            expect(water.bodyIndex[index]).toBeGreaterThan(0);
            expect(Math.abs(water.flow[index * 2]) + Math.abs(water.flow[index * 2 + 1])).toBeGreaterThan(0);
        }

        const oceanRegion = generator.generate({ regionX: 1, regionY: 1 });
        const ocean = deriveHydrologyRaster(oceanRegion, { macroHeight: new Uint16Array(128 * 128) });
        expect(ocean.kind).toContain(HydrologyWaterKind.Ocean);
        const oceanPaletteIndex = ocean.bodies.findIndex(body => body.bodyId === OCEAN_BODY_ID) + 1;
        expect(ocean.bodyIndex).toContain(oceanPaletteIndex);
        expect(Object.getOwnPropertyNames(region)).not.toContain("raster");
    });

    test("generates procedural regions directly and through the bounded worker pool lane", async () => {
        const descriptor = createWorldDescriptorV2({ seed: "hydrology-worker" });
        const direct = generateHydrologyRegion({ descriptor, key: { regionX: -2, regionY: 3 } });
        expect(() => assertHydrologyRegion(direct)).not.toThrow();
        const minimumRegion = generateHydrologyRegion({
            descriptor,
            key: { regionX: hydrologyRegionCoordinate(Number.MIN_SAFE_INTEGER), regionY: 0 }
        });
        expect(minimumRegion.validBounds.minX).toBe(1);
        expect(() => assertHydrologyRegion(minimumRegion)).not.toThrow();
        const generateHydrology = vi.fn(async options => generateHydrologyRegion(options));
        const client: ChunkGeneratorClient = {
            generateChunk: async options => generateWorldChunk(options),
            generateHydrologyRegion: generateHydrology,
            dispose: vi.fn()
        };
        const pool = new WorldGeneratorPool("unused", { size: 1, clientFactory: () => client });
        const region = await pool.generateHydrologyRegion({ descriptor, key: { regionX: -2, regionY: 3 } });
        await new Promise<void>(resolve => queueMicrotask(resolve));
        expect(regionSnapshot(region)).toEqual(regionSnapshot(direct));
        expect(generateHydrology).toHaveBeenCalledOnce();
        expect(pool.stats).toMatchObject({
            completed: 1,
            queuedHydrologyRegions: 0,
            busyHydrologyRegionWorkers: 0
        });
        pool.dispose();
    });
});
