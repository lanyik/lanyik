import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo } from "../../src/interfaces";
import {
    MAX_MACRO_DRAINAGE_GRAPH_NODES,
    OCEAN_BODY_ID,
    buildMacroDrainageGraph,
    macroDrainageNodeId,
    macroDrainageNodeTile,
    macroDrainageTerminalBodyId
} from "../../src/world/MacroDrainageGraph";
import { MACRO_DRAINAGE_TERMINAL } from "../../src/world/MacroDrainageTree";
import {
    CORE_WORLD_SEMANTICS_V2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import {
    SemanticChunkPool,
    SemanticWorldSource,
    StaticSemanticWorldSource,
    ToroidalSemanticWorldSource
} from "../../src/world/SemanticWorldSource";
import { SurfaceWorkerPoolStats } from "../../src/world/SurfaceWorkerPool";
import { createWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";

const EMPTY_POOL_STATS: Readonly<SurfaceWorkerPoolStats> = Object.freeze({
    workers: 1,
    busyWorkers: 0,
    queued: 0,
    completed: 0,
    workerFailures: 0,
    retried: 0,
    queuedWeight: 0,
    oldestQueuedMs: 0,
    shedTasks: 0,
    starvationPromotions: 0,
    completedSemanticChunks: 0,
    completedHydrologyRegions: 0,
    averageSemanticChunkMs: 0,
    averageHydrologyRegionMs: 0
});

class LocalSemanticPool implements SemanticChunkPool {
    public readonly stats = EMPTY_POOL_STATS;

    public generateSemanticChunk(options: Parameters<SemanticChunkPool["generateSemanticChunk"]>[0]) {
        return Promise.resolve(generateBaseSemanticChunk({
            descriptor: options.descriptor,
            chunkX: options.key.chunkX,
            chunkY: options.key.chunkY
        }));
    }

    public dispose(): void {}
}

function staticMap(width: number, height: number, oceanColumns = 0): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) {
            data[x][y] = { type: x < oceanColumns ? Land.sea : Land.land };
        }
    }
    return { data, w: width, h: height };
}

function staticSource(width: number, height: number, oceanColumns = 0): StaticSemanticWorldSource {
    return new StaticSemanticWorldSource(staticMap(width, height, oceanColumns), createWorldDescriptorV2({
        ...CORE_WORLD_SEMANTICS_V2,
        sourceKind: "static",
        sourceContentHash: `sha256:${"c".repeat(64)}`,
        width,
        height
    }));
}

function expectSameGraph(first: Awaited<ReturnType<typeof buildMacroDrainageGraph>>, second: typeof first): void {
    expect([...first.groundHeight]).toEqual([...second.groundHeight]);
    expect([...first.ocean]).toEqual([...second.ocean]);
    expect([...first.downstream]).toEqual([...second.downstream]);
    expect([...first.drainageRank]).toEqual([...second.drainageRank]);
    expect([...first.spillLevel]).toEqual([...second.spillLevel]);
    expect([...first.discharge]).toEqual([...second.discharge]);
    expect([...first.dischargeClass]).toEqual([...second.dischargeClass]);
    expect([...first.terminalNode]).toEqual([...second.terminalNode]);
}

function expectAllPathsTerminate(graph: Awaited<ReturnType<typeof buildMacroDrainageGraph>>): void {
    for (let start = 0; start < graph.downstream.length; start += 1) {
        let index = start;
        let steps = 0;
        while (graph.downstream[index] !== MACRO_DRAINAGE_TERMINAL) {
            index = graph.downstream[index];
            steps += 1;
            expect(steps).toBeLessThanOrEqual(graph.maxDrainageRank);
        }
        expect(graph.terminalNode[start]).toBe(index);
    }
}

describe("MacroDrainageGraph", () => {
    test("samples a partial finite world and assigns stable ocean terminals", async () => {
        const source = staticSource(40, 33, 8);
        const first = await buildMacroDrainageGraph(source, { maximumConcurrentChunkLoads: 1 });
        const second = await buildMacroDrainageGraph(source, { maximumConcurrentChunkLoads: 8 });
        expect(first).toMatchObject({
            revision: 0,
            topology: "finite",
            worldWidth: 40,
            worldHeight: 33,
            width: 5,
            height: 5,
            terminalKind: "ocean",
            validNodeCount: 25
        });
        expect(macroDrainageNodeTile(first, 24)).toEqual({ x: 36, y: 32 });
        expect(macroDrainageNodeId(first, 24)).toBe("node:36:32");
        expect(macroDrainageTerminalBodyId(first, 24)).toBe(OCEAN_BODY_ID);
        expect(first.dischargeClass[24]).toBe(Math.floor(Math.log2(first.discharge[24])));
        expectAllPathsTerminate(first);
        expectSameGraph(first, second);
        expect(source.stats.leasedChunks).toBe(0);
        source.dispose();
    });

    test("creates one canonical stable lake body for a landlocked world", async () => {
        const source = staticSource(33, 33);
        const graph = await buildMacroDrainageGraph(source);
        expect(graph.terminalKind).toBe("lake");
        expect([...graph.terminalIndices]).toEqual([0]);
        expect(graph.discharge[0]).toBe(25);
        expect(macroDrainageTerminalBodyId(graph, 24)).toBe("lake:node:4:4");
        source.dispose();
    });

    test("is request-order independent and seam-aware for a toroidal world", async () => {
        const source = new ToroidalSemanticWorldSource({
            descriptor: createCoreToroidalWorldDescriptorV2("macro-graph-torus", 64, 96),
            workerPool: new LocalSemanticPool()
        });
        const first = await buildMacroDrainageGraph(source, { maximumConcurrentChunkLoads: 6 });
        const second = await buildMacroDrainageGraph(source, { maximumConcurrentChunkLoads: 1 });
        expect(first).toMatchObject({ topology: "toroidal", width: 8, height: 12, validNodeCount: 96 });
        expectAllPathsTerminate(first);
        expectSameGraph(first, second);
        expect(source.stats.leasedChunks).toBe(0);
        source.dispose();
    });

    test("rejects aborts, invalid concurrency and worlds beyond the graph budget", async () => {
        const source = staticSource(8, 8);
        const controller = new AbortController();
        controller.abort();
        await expect(buildMacroDrainageGraph(source, { signal: controller.signal })).rejects.toMatchObject({
            name: "AbortError"
        });
        await expect(buildMacroDrainageGraph(source, { maximumConcurrentChunkLoads: 0 })).rejects.toThrow(/concurrency/);
        source.dispose();

        const oversized = {
            bounds: {
                width: (MAX_MACRO_DRAINAGE_GRAPH_NODES + 1) * 8,
                height: 8,
                topology: "finite"
            }
        } as unknown as SemanticWorldSource;
        await expect(buildMacroDrainageGraph(oversized)).rejects.toThrow(/node budget/);
    });
});
