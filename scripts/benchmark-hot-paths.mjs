import {
    AdaptiveStreamingController,
    FogOfWar,
    Land,
    SparseWorldChunkStore,
    createWorldVegetationMapSnapshot,
    generateWorldChunk,
    generateWorldVegetation,
    getWorldChunkCorePoints,
    mergeBufferUpdateRanges,
    worldVegetationTransferables
} from "../dist/hex-map.mjs";
import { buildWorldNavigationSummary } from "../dist/pathfinding.mjs";
import { WorldSimulationRuntime } from "../dist/simulation.mjs";

const round = (value, digits = 2) => {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
};

function benchmarkSparseStore() {
    const chunks = [];
    for (let chunkX = -3; chunkX <= 3; chunkX += 1) {
        for (let chunkY = -3; chunkY <= 3; chunkY += 1) {
            chunks.push(generateWorldChunk({ seed: "perf", chunkX, chunkY, chunkSize: 24 }));
        }
    }

    globalThis.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const store = new SparseWorldChunkStore();
    const started = performance.now();
    for (let pass = 0; pass < 25; pass += 1) {
        for (const chunk of chunks) store.add(chunk);
        for (const chunk of chunks) store.remove(chunk.chunkX, chunk.chunkY);
    }
    const durationMs = performance.now() - started;
    globalThis.gc?.();

    for (const chunk of chunks) store.add(chunk);
    // Force representative lookups so the decoded-variant cache is measured.
    for (let x = -72; x < 96; x += 7) store.map.tileAt?.(x, 0);

    return {
        operation: "49 chunks (24x24) add/remove x25",
        durationMs: round(durationMs),
        heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
        residentChunks: store.residentChunkCount,
        residentPayloadBytes: store.residentPayloadBytes,
        decodedTileVariants: store.decodedTileVariantCount,
        materializedColumns: Object.keys(store.map.data).length
    };
}

function benchmarkToroidalWindow() {
    const width = 512;
    const height = 512;
    const chunkSize = 24;
    const chunks = [];
    const started = performance.now();
    for (let chunkX = 8; chunkX < 13; chunkX += 1) {
        for (let chunkY = 8; chunkY < 13; chunkY += 1) {
            chunks.push(generateWorldChunk({
                seed: "perf-toroidal",
                chunkX,
                chunkY,
                chunkSize,
                world: { width, height, topology: "toroidal" }
            }));
        }
    }
    const store = new SparseWorldChunkStore({ width, height, wrapX: true, wrapY: true });
    for (const chunk of chunks) store.add(chunk);
    return {
        operation: "512x512 toroidal world, 5x5 resident chunk window",
        durationMs: round(performance.now() - started),
        logicalTiles: width * height,
        residentCoreTiles: chunks.length * chunkSize * chunkSize,
        residentChunks: store.residentChunkCount,
        residentPayloadBytes: store.residentPayloadBytes,
        materializedColumns: Object.keys(store.map.data).length
    };
}

function benchmarkFogFrontier() {
    const width = 512;
    const height = 512;
    const data = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) data[x][y] = { type: Land.land };
    }

    const fog = new FogOfWar({ data, w: width, h: height });
    let examinedCandidates = 0;
    const started = performance.now();
    for (let pass = 0; pass < 20; pass += 1) {
        fog.recompute([{ x: 256 + pass % 2, y: 256, viewRange: 3 }]);
        examinedCandidates += fog.lastRecomputeCandidateCount;
    }
    return {
        operation: "512x512 fog recompute x20",
        durationMs: round(performance.now() - started),
        examinedCandidates,
        fullScanCandidates: width * height * 20,
        candidateReductionPercent: round(
            (1 - examinedCandidates / (width * height * 20)) * 100,
            3
        )
    };
}

function benchmarkVegetationPreparation() {
    const chunk = generateWorldChunk({ seed: "perf-vegetation", chunkX: 0, chunkY: 0, chunkSize: 24 });
    const store = new SparseWorldChunkStore();
    store.add(chunk);
    const points = getWorldChunkCorePoints(chunk);
    const map = createWorldVegetationMapSnapshot(store.map, points);
    const options = {
        map,
        points,
        size: 40,
        grassDensity: 60,
        grassBladeWidth: 1.2,
        grassBladeHeight: 7.2,
        grassHeightVariation: 0.4,
        treesPerTile: 20,
        treeScale: 1,
        treeModel: "Assets/models/pinia",
        riverWidth: 0.28,
        riverBankWidth: 0.14,
        riverCurvature: 0.5,
        lakeShoreWidth: 0.18,
        beachWidth: 0.35,
        waterCornerRounding: 0.4,
        coastCurvature: 0.5
    };
    const started = performance.now();
    let layout;
    for (let pass = 0; pass < 5; pass += 1) layout = generateWorldVegetation(options);
    const durationMs = performance.now() - started;
    const grassInstances = layout.grass.reduce(
        (count, prepared) => count + prepared.lods.reduce((sum, lod) => sum + lod.instanceCount, 0),
        0
    );
    const treeInstances = layout.forest.reduce(
        (count, prepared) => count + prepared.lods.reduce((sum, lod) => sum + lod.instanceCount, 0),
        0
    );
    return {
        operation: "24x24 grass/tree three-LOD preparation x5",
        durationMs: round(durationMs),
        averageMs: round(durationMs / 5),
        grassInstances,
        treeInstances,
        transferableBytes: worldVegetationTransferables(layout)
            .reduce((bytes, buffer) => bytes + buffer.byteLength, 0)
    };
}

function benchmarkGpuRangeBatching() {
    const ranges = [];
    for (let group = 0; group < 200; group += 1) {
        for (let index = 0; index < 50; index += 1) {
            ranges.push({ start: group * 80 + index, count: 1 });
        }
    }
    ranges.reverse();
    const started = performance.now();
    let merged;
    for (let pass = 0; pass < 100; pass += 1) merged = mergeBufferUpdateRanges(ranges);
    const durationMs = performance.now() - started;
    return {
        operation: "10,000 GPU dirty ranges merge x100",
        durationMs: round(durationMs),
        averageMs: round(durationMs / 100, 3),
        inputRanges: ranges.length,
        uploadRanges: merged.length,
        rangeReductionPercent: round((1 - merged.length / ranges.length) * 100, 2)
    };
}

function benchmarkAdaptiveController() {
    const adaptive = new AdaptiveStreamingController({
        baseFrameBudgetMs: 3,
        baseMaxTasksPerFrame: 2,
        baseWorkerCount: 4,
        baseLodDistances: { near: 900, far: 1650, vegetation: 1450, hysteresis: 120 }
    });
    const started = performance.now();
    for (let frame = 0; frame < 100000; frame += 1) adaptive.sample(16 + (frame % 5) * 0.2);
    const durationMs = performance.now() - started;
    return {
        operation: "adaptive frame sample x100,000",
        durationMs: round(durationMs),
        nanosecondsPerSample: round(durationMs * 1e6 / 100000),
        transitions: adaptive.stats.transitions,
        qualityLevel: adaptive.stats.qualityLevel
    };
}

function benchmarkNavigationSummaries() {
    const data = {};
    for (let x = 0; x < 36; x += 1) {
        data[x] = {};
        for (let y = 0; y < 36; y += 1) data[x][y] = { type: Land.land };
    }
    const map = { data, w: 36, h: 36 };
    const run = maxPortalsPerEntrance => {
        const started = performance.now();
        let summary;
        for (let pass = 0; pass < 25; pass += 1) {
            summary = buildWorldNavigationSummary(
                map, 1, 1, 12, () => true, { maxPortalsPerEntrance }
            );
        }
        return { durationMs: performance.now() - started, summary };
    };
    const exact = run(1000);
    const compact = run(2);
    return {
        operation: "12x12 open navigation summary x25",
        exactDurationMs: round(exact.durationMs),
        compactDurationMs: round(compact.durationMs),
        exactPortals: exact.summary.portals.length,
        compactPortals: compact.summary.portals.length,
        matrixReductionPercent: round(
            (1 - compact.summary.costs.length ** 2 / exact.summary.costs.length ** 2) * 100,
            2
        )
    };
}

async function benchmarkSimulationRuntime() {
    const cold = new WorldSimulationRuntime({
        chunkSize: 10,
        activeTickIntervalSeconds: 0.1,
        backgroundTickIntervalSeconds: 5
    });
    let started = performance.now();
    for (let index = 0; index < 5000; index += 1) {
        cold.addEntity({ id: `cold-${index}`, x: index * 10, y: 0, state: { value: 0 } });
    }
    const coldInsertMs = performance.now() - started;
    started = performance.now();
    await cold.advance(0.016);
    const coldIdleAdvanceMs = performance.now() - started;
    cold.dispose();

    const dense = new WorldSimulationRuntime({
        chunkSize: 1000,
        activeTickIntervalSeconds: 1,
        backgroundTickIntervalSeconds: 1
    });
    for (let index = 0; index < 100000; index += 1) {
        dense.addEntity({
            id: `dense-${index}`,
            x: index % 1000,
            y: Math.floor(index / 1000),
            state: { value: 0 }
        });
    }
    dense.registerSystem({ id: "noop", update() {} });
    started = performance.now();
    await dense.advance(1);
    const denseTickMs = performance.now() - started;
    dense.dispose();
    return {
        operation: "generic simulation scale probes",
        coldChunks: 5000,
        coldInsertMs: round(coldInsertMs),
        coldIdleAdvanceMs: round(coldIdleAdvanceMs),
        denseEntities: 100000,
        denseNoopTickMs: round(denseTickMs)
    };
}

console.log(JSON.stringify({
    sparseStore: benchmarkSparseStore(),
    toroidalWindow: benchmarkToroidalWindow(),
    fogFrontier: benchmarkFogFrontier(),
    vegetationPreparation: benchmarkVegetationPreparation(),
    gpuRangeBatching: benchmarkGpuRangeBatching(),
    adaptiveController: benchmarkAdaptiveController(),
    navigationSummaries: benchmarkNavigationSummaries(),
    simulationRuntime: await benchmarkSimulationRuntime()
}, null, 2));
