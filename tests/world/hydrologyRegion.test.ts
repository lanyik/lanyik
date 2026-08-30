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
    HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS,
    HYDROLOGY_REGION_SIZE,
    hydrologyRegionCoordinate,
    locateSemanticTile,
    OCEAN_BODY_ID,
    WorldSurfaceWorkerPool
} from "../../src/index";
import type { WorldSurfaceWorker } from "../../src/world/WorldSurfaceWorkerPool";

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

function longestVisibleDrainagePath(graph: ReturnType<typeof buildMacroDrainageGraph>) {
    const nodeById = new Map(graph.nodes.map(node => [node.nodeId, node]));
    const edgeByUpstream = new Map(graph.edges.map(edge => [edge.upstreamNodeId, edge]));
    let longest: Array<(typeof graph.edges)[number]> = [];
    for (const start of graph.nodes) {
        const path: Array<(typeof graph.edges)[number]> = [];
        let node = start;
        while (true) {
            const edge = edgeByUpstream.get(node.nodeId);
            if (!edge || edge.dischargeClass < HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS) break;
            path.push(edge);
            node = nodeById.get(edge.downstreamNodeId)!;
            if (path.length > graph.nodes.length) throw new Error("drainage path did not terminate");
        }
        if (path.length > longest.length) longest = path;
    }
    return longest;
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

    test("keeps an all-ocean graph minimal while preserving its explicit ocean terminal", () => {
        const graph = buildMacroDrainageGraph({
            descriptor: staticDescriptor("c"),
            macroHeightSource: { sampleMacroHeight: () => 0 }
        });
        expect(() => assertMacroDrainageGraph(graph)).not.toThrow();
        expect(graph.nodes).toHaveLength(1);
        expect(graph.edges).toHaveLength(0);
        expect(graph.terminals).toEqual([expect.objectContaining({
            kind: "ocean",
            bodyId: OCEAN_BODY_ID
        })]);
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
        expect(forward.reduce((total, region) => total + region.rivers.length, 0)).toBeGreaterThan(20);
        const riverProfiles = forward.flatMap(region => region.rivers.map(river => river.levelProfile));
        expect(riverProfiles.some(profile => profile[0] > profile[profile.length - 1])).toBe(true);
        for (const profile of riverProfiles) {
            for (let index = 1; index < profile.length; index += 1) {
                expect(profile[index]).toBeLessThanOrEqual(profile[index - 1]);
            }
        }
        const riverSegments = forward.flatMap(region => region.rivers);
        const curvedSegments = riverSegments.filter(river => {
            if (river.controlPoints.length < 8) return false;
            const startX = river.controlPoints[0];
            const startY = river.controlPoints[1];
            const endX = river.controlPoints[river.controlPoints.length - 2];
            const endY = river.controlPoints[river.controlPoints.length - 1];
            for (let index = 2; index < river.controlPoints.length - 2; index += 2) {
                const dx = river.controlPoints[index] - startX;
                const dy = river.controlPoints[index + 1] - startY;
                if (dx * (endY - startY) !== dy * (endX - startX)) return true;
            }
            return false;
        });
        expect(curvedSegments.length).toBeGreaterThan(riverSegments.length * 0.6);
        const axisLocked = riverSegments.filter(river => {
            const dx = river.controlPoints[river.controlPoints.length - 2] - river.controlPoints[0];
            const dy = river.controlPoints[river.controlPoints.length - 1] - river.controlPoints[1];
            return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
        });
        expect(axisLocked.length).toBeLessThan(riverSegments.length * 0.15);
        const visibleSources = riverSegments.filter(river => river.entry.kind === "source");
        expect(visibleSources.length).toBeGreaterThan(0);
        for (const source of visibleSources) {
            expect(source.widthProfile[0]).toBeLessThan(source.widthProfile[source.widthProfile.length - 1]);
        }

        const confluences = new Map<string, string[]>();
        for (const region of forward) for (const river of region.rivers) {
            const originX = region.key.regionX * HYDROLOGY_REGION_SIZE;
            const originY = region.key.regionY * HYDROLOGY_REGION_SIZE;
            for (const [endpoint, pointIndex] of [
                [river.entry, 0],
                [river.exit, river.controlPoints.length - 2]
            ] as const) {
                if (endpoint.kind !== "confluence") continue;
                const coordinate = `${originX + river.controlPoints[pointIndex] / HYDROLOGY_COORDINATE_SCALE},${
                    originY + river.controlPoints[pointIndex + 1] / HYDROLOGY_COORDINATE_SCALE}`;
                confluences.set(endpoint.connectionId, [
                    ...(confluences.get(endpoint.connectionId) ?? []),
                    coordinate
                ]);
            }
        }
        expect([...confluences.values()].some(values => values.length >= 3)).toBe(true);
        for (const values of confluences.values()) expect(new Set(values).size).toBe(1);
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
        expect([...connections.values()].every(count => count === 1 || count === 2)).toBe(true);
        expect([...connections.values()]).toContain(2);
    });

    test("generates long rivers, explicit lakes, confluences, and ocean mouths from procedural terrain", () => {
        const samples = [
            { seed: "hydrology-order", basin: { basinX: 0, basinY: 0 } },
            { seed: "hydrology-worker", basin: { basinX: -1, basinY: 1 } },
            { seed: "gallery-infinite-0", basin: { basinX: 1, basinY: -1 } }
        ] as const;
        for (const sample of samples) {
            const graph = buildMacroDrainageGraph({
                descriptor: createWorldDescriptorV2({ seed: sample.seed }),
                basin: sample.basin
            });
            expect(() => assertMacroDrainageGraph(graph)).not.toThrow();
            const nodeById = new Map(graph.nodes.map(node => [node.nodeId, node]));
            const terminalByNodeId = new Map(graph.terminals.map(terminal => [terminal.nodeId, terminal]));
            const visibleEdges = graph.edges.filter(edge =>
                edge.dischargeClass >= HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS
            );
            const visibleIncoming = new Map<string, number>();
            for (const edge of visibleEdges) {
                visibleIncoming.set(
                    edge.downstreamNodeId,
                    (visibleIncoming.get(edge.downstreamNodeId) ?? 0) + 1
                );
            }
            expect(graph.terminals.some(terminal => terminal.kind === "lake")).toBe(true);
            expect(visibleEdges.some(edge =>
                terminalByNodeId.get(edge.downstreamNodeId)?.kind === "lake"
            )).toBe(true);
            expect(visibleEdges.some(edge =>
                terminalByNodeId.get(edge.downstreamNodeId)?.kind === "ocean"
            )).toBe(true);
            expect(visibleEdges.some(edge =>
                (visibleIncoming.get(edge.upstreamNodeId) ?? 0) >= 2
            )).toBe(true);

            const longest = longestVisibleDrainagePath(graph);
            const crossedRegions = new Set<string>();
            for (const edge of longest) {
                for (const nodeId of [edge.upstreamNodeId, edge.downstreamNodeId]) {
                    const node = nodeById.get(nodeId)!;
                    crossedRegions.add(
                        `${Math.floor(node.x / HYDROLOGY_REGION_SIZE)},${Math.floor(node.y / HYDROLOGY_REGION_SIZE)}`
                    );
                }
            }
            expect(longest.length).toBeGreaterThanOrEqual(64);
            expect(crossedRegions.size).toBeGreaterThanOrEqual(4);
            const terminalNode = nodeById.get(longest[longest.length - 1].downstreamNodeId)!;
            expect(terminalNode.downstreamNodeId).toBeUndefined();
        }
    });

    test("clips a procedural long river across regions without losing segments or port pairs", () => {
        const descriptor = createWorldDescriptorV2({ seed: "hydrology-order" });
        const graph = buildMacroDrainageGraph({ descriptor, basin: { basinX: 0, basinY: 0 } });
        const nodeById = new Map(graph.nodes.map(node => [node.nodeId, node]));
        const path = longestVisibleDrainagePath(graph);
        const pathEdgeIds = new Set(path.map(edge => edge.edgeId));
        const keys = new Map<string, { regionX: number; regionY: number }>();
        for (const edge of path) {
            for (const nodeId of [edge.upstreamNodeId, edge.downstreamNodeId]) {
                const node = nodeById.get(nodeId)!;
                const key = {
                    regionX: Math.floor(node.x / HYDROLOGY_REGION_SIZE),
                    regionY: Math.floor(node.y / HYDROLOGY_REGION_SIZE)
                };
                keys.set(`${key.regionX},${key.regionY}`, key);
            }
        }

        const generator = new HydrologyRegionGenerator(descriptor);
        const pending = [...keys.values()];
        const generated = new Set<string>();
        const regions: HydrologyRegion[] = [];
        while (pending.length > 0) {
            const key = pending.pop()!;
            const serialized = `${key.regionX},${key.regionY}`;
            if (generated.has(serialized)) continue;
            generated.add(serialized);
            const region = generator.generate(key);
            regions.push(region);
            for (const port of region.boundaryPorts) {
                if (!pathEdgeIds.has(port.edgeId)) continue;
                const neighbor = {
                    regionX: key.regionX + (port.side === "west" ? -1 : port.side === "east" ? 1 : 0),
                    regionY: key.regionY + (port.side === "north" ? -1 : port.side === "south" ? 1 : 0)
                };
                const neighborKey = `${neighbor.regionX},${neighbor.regionY}`;
                if (!generated.has(neighborKey)) pending.push(neighbor);
            }
        }
        const serializedEdgeIds = new Set(regions.flatMap(region => region.rivers.map(river => river.edgeId)));
        for (const edge of path) expect(serializedEdgeIds.has(edge.edgeId)).toBe(true);

        const pathPorts = new Map<string, number>();
        for (const region of regions) for (const port of region.boundaryPorts) {
            if (!pathEdgeIds.has(port.edgeId)) continue;
            pathPorts.set(port.connectionId, (pathPorts.get(port.connectionId) ?? 0) + 1);
        }
        expect(pathPorts.size).toBeGreaterThanOrEqual(3);
        expect(new Set(pathPorts.values())).toEqual(new Set([2]));

        const lakeTerminal = graph.terminals.find(terminal => terminal.kind === "lake")!;
        const lakeNode = nodeById.get(lakeTerminal.nodeId)!;
        const lakeRegion = generator.generate({
            regionX: Math.floor(lakeNode.x / HYDROLOGY_REGION_SIZE),
            regionY: Math.floor(lakeNode.y / HYDROLOGY_REGION_SIZE)
        });
        expect(lakeRegion.lakes.some(lake => lake.bodyId === lakeTerminal.bodyId)).toBe(true);

        const terminalByNodeId = new Map(graph.terminals.map(terminal => [terminal.nodeId, terminal]));
        const mouthEdge = graph.edges.find(edge =>
            edge.dischargeClass >= HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS
            && terminalByNodeId.get(edge.downstreamNodeId)?.kind === "ocean"
        )!;
        const mouthNode = nodeById.get(mouthEdge.downstreamNodeId)!;
        const mouthRegion = generator.generate({
            regionX: Math.floor(mouthNode.x / HYDROLOGY_REGION_SIZE),
            regionY: Math.floor(mouthNode.y / HYDROLOGY_REGION_SIZE)
        });
        expect(mouthRegion.mouths.some(mouth =>
            mouth.riverId === mouthEdge.riverId && mouth.targetBodyId === OCEAN_BODY_ID
        )).toBe(true);
    });

    test("handles partial toroidal regions and matches curved wrapped seams", () => {
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
        const wrapped = [...byConnection.values()].filter(pair => pair.length === 2);
        expect(wrapped.length).toBeGreaterThan(0);
        for (const pair of wrapped) {
            expect(pair[0].port.connectionId).toBe(pair[1].port.connectionId);
            expect(pair[0].port.width).toBe(pair[1].port.width);
            expect(pair[0].port.level).toBe(pair[1].port.level);
            expect(pair[0].port.flowX).toBe(pair[1].port.flowX);
            expect(pair[0].port.flowY).toBe(pair[1].port.flowY);
            expect(new Set(pair.map(candidate => candidate.port.flow))).toEqual(new Set(["in", "out"]));
        }
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
        const client: WorldSurfaceWorker = {
            generateSemanticChunk: async () => { throw new Error("unexpected semantic request"); },
            generateHydrologyRegion: generateHydrology,
            compileSurfaceChunk: async () => { throw new Error("unexpected surface request"); },
            dispose: vi.fn(),
            isDisposed: false
        };
        const pool = new WorldSurfaceWorkerPool("unused", { size: 1, clientFactory: () => client });
        const region = await pool.generateHydrologyRegion({ descriptor, key: { regionX: -2, regionY: 3 } });
        await new Promise<void>(resolve => queueMicrotask(resolve));
        expect(regionSnapshot(region)).toEqual(regionSnapshot(direct));
        expect(generateHydrology).toHaveBeenCalledOnce();
        expect(pool.stats).toMatchObject({
            completedTasks: 1,
            queuedHydrologyRegions: 0,
            busyWorkers: 0
        });
        pool.dispose();
    });
});
