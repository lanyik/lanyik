import { describe, expect, test } from "vitest";

import {
    HYDROLOGY_BOUNDARY_MAX_X,
    HYDROLOGY_BOUNDARY_MAX_Y,
    HYDROLOGY_BOUNDARY_MIN_X,
    HYDROLOGY_BOUNDARY_MIN_Y,
    HydrologyPort,
    assertHydrologyRegion,
    hydrologyPortConnectionSignature
} from "../../src/world/HydrologyRegion";
import {
    MacroDrainageGraph,
    assertMacroDrainageGraph
} from "../../src/world/MacroDrainageGraph";
import {
    MACRO_DRAINAGE_TERMINAL,
    MacroDrainageRaster,
    buildMacroDrainageTree,
    macroDrainageIndex
} from "../../src/world/MacroDrainageTree";
import {
    MIN_RIVER_DISCHARGE,
    MacroDrainageHydrologySource
} from "../../src/world/MacroDrainageHydrologySource";

function terminalAssignments(downstream: Int32Array): Uint32Array {
    const result = new Uint32Array(downstream.length);
    for (let start = 0; start < downstream.length; start += 1) {
        let terminal = start;
        let steps = 0;
        while (downstream[terminal] !== MACRO_DRAINAGE_TERMINAL) {
            terminal = downstream[terminal];
            steps += 1;
            if (steps > downstream.length) throw new Error("test drainage graph contains a cycle");
        }
        result[start] = terminal;
    }
    return result;
}

function finiteLandlockedGraph(worldWidth: number, worldHeight: number): MacroDrainageGraph {
    const width = Math.ceil(worldWidth / 8);
    const height = Math.ceil(worldHeight / 8);
    const length = width * height;
    const groundHeight = new Uint16Array(length);
    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1) {
            groundHeight[macroDrainageIndex(x, y, height)] = 1_000 + x * 16 + y;
        }
    }
    const raster: MacroDrainageRaster = {
        width,
        height,
        valid: new Uint8Array(length).fill(1),
        groundHeight,
        ocean: new Uint8Array(length),
        seaLevel: 500
    };
    const tree = buildMacroDrainageTree(raster);
    const dischargeClass = Uint8Array.from(tree.discharge, value => Math.floor(Math.log2(value)));
    const graph: MacroDrainageGraph = Object.freeze({
        revision: 0,
        worldIdentity: `finite:${worldWidth}:${worldHeight}`,
        topology: "finite",
        worldWidth,
        worldHeight,
        nodeStepTiles: 8,
        width,
        height,
        seaLevel: raster.seaLevel,
        groundHeight,
        ocean: raster.ocean,
        downstream: tree.downstream,
        drainageRank: tree.drainageRank,
        spillLevel: tree.spillLevel,
        discharge: tree.discharge,
        dischargeClass,
        terminalNode: terminalAssignments(tree.downstream),
        terminalKind: tree.terminalKind,
        terminalIndices: tree.terminalIndices,
        validNodeCount: tree.validNodeCount,
        maxDrainageRank: tree.maxDrainageRank
    });
    assertMacroDrainageGraph(graph);
    return graph;
}

function toroidalSeamGraph(): MacroDrainageGraph {
    const width = 4;
    const height = 4;
    const length = width * height;
    const downstream = new Int32Array(length);
    downstream.fill(-2);
    downstream[0] = MACRO_DRAINAGE_TERMINAL;
    const drainageRank = new Uint32Array(length);
    drainageRank.fill(0xffff_ffff);
    drainageRank[0] = 0;
    const visited = new Uint8Array(length);
    visited[0] = 1;
    const root = macroDrainageIndex(3, 3, height);
    visited[root] = 1;
    downstream[root] = 0;
    drainageRank[root] = 1;
    const queue = [root];
    let rank = 2;
    for (let read = 0; read < queue.length; read += 1) {
        const parent = queue[read];
        const parentX = Math.floor(parent / height);
        const parentY = parent - parentX * height;
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                if (dx === 0 && dy === 0) continue;
                const x = (parentX + dx + width) % width;
                const y = (parentY + dy + height) % height;
                const index = macroDrainageIndex(x, y, height);
                if (visited[index] !== 0) continue;
                visited[index] = 1;
                downstream[index] = parent;
                drainageRank[index] = rank++;
                queue.push(index);
            }
        }
    }
    const discharge = new Uint32Array(length).fill(1);
    const nodeAtRank = new Uint32Array(length);
    for (let index = 0; index < length; index += 1) nodeAtRank[drainageRank[index]] = index;
    for (let currentRank = length - 1; currentRank > 0; currentRank -= 1) {
        const index = nodeAtRank[currentRank];
        discharge[downstream[index]] += discharge[index];
    }
    const ocean = new Uint8Array(length);
    ocean[0] = 1;
    const groundHeight = new Uint16Array(length).fill(120);
    groundHeight[0] = 80;
    const spillLevel = new Uint16Array(length).fill(120);
    spillLevel[0] = 100;
    const graph: MacroDrainageGraph = Object.freeze({
        revision: 0,
        worldIdentity: "toroidal:seam",
        topology: "toroidal",
        worldWidth: 32,
        worldHeight: 32,
        nodeStepTiles: 8,
        width,
        height,
        seaLevel: 100,
        groundHeight,
        ocean,
        downstream,
        drainageRank,
        spillLevel,
        discharge,
        dischargeClass: Uint8Array.from(discharge, value => Math.floor(Math.log2(value))),
        terminalNode: new Uint32Array(length),
        terminalKind: "ocean",
        terminalIndices: new Uint32Array([0]),
        validNodeCount: length,
        maxDrainageRank: length - 1
    });
    assertMacroDrainageGraph(graph);
    expect(graph.discharge[root]).toBeGreaterThanOrEqual(MIN_RIVER_DISCHARGE);
    return graph;
}

function portsOn(portList: readonly HydrologyPort[], boundary: number): readonly HydrologyPort[] {
    return portList.filter(port => (port.boundaryMask & boundary) !== 0);
}

describe("MacroDrainageHydrologySource", () => {
    test("clips finite river edges into matching boundary ports", () => {
        const source = new MacroDrainageHydrologySource(finiteLandlockedGraph(256, 128));
        const west = source.buildRegion(0, 0);
        const east = source.buildRegion(1, 0);
        assertHydrologyRegion(west);
        assertHydrologyRegion(east);
        const westPorts = portsOn(west.boundaryPorts, HYDROLOGY_BOUNDARY_MAX_X);
        const eastPorts = portsOn(east.boundaryPorts, HYDROLOGY_BOUNDARY_MIN_X);
        expect(westPorts.length).toBeGreaterThan(0);
        expect(westPorts.map(hydrologyPortConnectionSignature).sort())
            .toEqual(eastPorts.map(hydrologyPortConnectionSignature).sort());
        expect(source.buildRegion(0, 0)).toEqual(west);
        expect(west.lakes).toHaveLength(1);
        expect(west.lakes[0].level).toBeGreaterThan(source.graph.groundHeight[0]);
        expect(east.lakes).toHaveLength(0);
        expect(west.bodies.some(body => body.kind === "river")).toBe(true);
    });

    test("publishes explicit valid bounds for a partial final region", () => {
        const source = new MacroDrainageHydrologySource(finiteLandlockedGraph(160, 96));
        expect(source.regionCountX).toBe(2);
        expect(source.regionCountY).toBe(1);
        expect(source.buildRegion(1, 0).validBounds).toEqual({
            minX: 0,
            minY: 0,
            maxXExclusive: 32,
            maxYExclusive: 96
        });
        expect(source.resolveRegion(2, 0)).toBeUndefined();
        expect(() => source.buildRegion(2, 0)).toThrow(/canonical in-domain/);
    });

    test("splits a four-corner toroidal seam edge into one paired connection", () => {
        const source = new MacroDrainageHydrologySource(toroidalSeamGraph());
        expect(source.resolveRegion(-1, -1)).toEqual({ regionX: 0, regionY: 0 });
        expect(() => source.buildRegion(-1, -1)).toThrow(/canonical/);
        const region = source.buildRegion(0, 0);
        expect(region.validBounds.maxXExclusive).toBe(32);
        const grouped = new Map<string, HydrologyPort[]>();
        for (const port of region.boundaryPorts) {
            const values = grouped.get(port.connectionId) ?? [];
            values.push(port);
            grouped.set(port.connectionId, values);
        }
        const seamPair = [...grouped.values()].find(ports =>
            ports.length === 2
            && ports.some(port => port.endpoint === "entry")
            && ports.some(port => port.endpoint === "exit")
            && ports.some(port => (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_X) !== 0)
            && ports.some(port => (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_X) !== 0)
            && ports.some(port => (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_Y) !== 0)
            && ports.some(port => (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_Y) !== 0)
        );
        expect(seamPair).toBeDefined();
        expect(new Set(seamPair?.map(hydrologyPortConnectionSignature)).size).toBe(1);
        expect(region.mouths.some(mouth => mouth.targetBodyId === "ocean")).toBe(true);
    });

    test("does not materialize remote toroidal lake copies before intersection testing", () => {
        const finite = finiteLandlockedGraph(1_024, 32);
        const graph: MacroDrainageGraph = Object.freeze({ ...finite, topology: "toroidal" });
        assertMacroDrainageGraph(graph);
        const source = new MacroDrainageHydrologySource(graph);
        const remote = source.buildRegion(4, 0);
        expect(remote.lakes).toHaveLength(0);
    });
});
