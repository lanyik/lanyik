import os from "node:os";

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

const WARMUP_RUNS = integerEnvironment("FOUNDATION_BENCHMARK_WARMUPS", 1, 1, 5, false);
const SAMPLE_RUNS = integerEnvironment("FOUNDATION_BENCHMARK_SAMPLES", 5, 3, 15, true);
const CHECK_MODE = process.argv.includes("--check");
const LIMIT_SCALE = CHECK_MODE ? positiveEnvironment("FOUNDATION_BENCHMARK_SCALE", 1) : 1;

const round = (value, digits = 2) => {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
};

function integerEnvironment(name, fallback, minimum, maximum, requireOdd) {
    const configured = process.env[name];
    if (configured === undefined) return fallback;
    const value = Number(configured);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum || (requireOdd && value % 2 === 0)) {
        const odd = requireOdd ? " odd" : "";
        throw new RangeError(`${name} must be an${odd} integer between ${minimum} and ${maximum}`);
    }
    return value;
}

function positiveEnvironment(name, fallback) {
    const configured = process.env[name];
    if (configured === undefined) return fallback;
    const value = Number(configured);
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive finite number`);
    }
    return value;
}

function summarizeTiming(samples) {
    const sorted = [...samples].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)];
    const minimum = sorted[0];
    const maximum = sorted.at(-1);
    return {
        medianMs: round(median),
        minMs: round(minimum),
        maxMs: round(maximum),
        spreadPercent: round(median === 0 ? 0 : (maximum - minimum) / median * 100, 1),
        samplesMs: samples.map(value => round(value))
    };
}

function collectSync(measure) {
    for (let run = 0; run < WARMUP_RUNS; run += 1) {
        globalThis.gc?.();
        measure();
    }
    const measurements = [];
    for (let run = 0; run < SAMPLE_RUNS; run += 1) {
        globalThis.gc?.();
        measurements.push(measure());
    }
    return {
        timing: summarizeTiming(measurements.map(measurement => measurement.durationMs)),
        observation: measurements.at(-1)
    };
}

async function collectAsync(measure) {
    for (let run = 0; run < WARMUP_RUNS; run += 1) {
        globalThis.gc?.();
        await measure();
    }
    const measurements = [];
    for (let run = 0; run < SAMPLE_RUNS; run += 1) {
        globalThis.gc?.();
        measurements.push(await measure());
    }
    return {
        timing: summarizeTiming(measurements.map(measurement => measurement.durationMs)),
        observation: measurements.at(-1)
    };
}

function benchmarkSparseStore() {
    const chunks = [];
    for (let chunkX = -3; chunkX <= 3; chunkX += 1) {
        for (let chunkY = -3; chunkY <= 3; chunkY += 1) {
            chunks.push(generateWorldChunk({ seed: "perf", chunkX, chunkY, chunkSize: 24 }));
        }
    }
    const sampled = collectSync(() => {
        const store = new SparseWorldChunkStore();
        const started = performance.now();
        for (let pass = 0; pass < 25; pass += 1) {
            for (const chunk of chunks) store.add(chunk);
            for (const chunk of chunks) store.remove(chunk.chunkX, chunk.chunkY);
        }
        return { durationMs: performance.now() - started };
    });

    globalThis.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const store = new SparseWorldChunkStore();
    for (const chunk of chunks) store.add(chunk);
    for (let x = -72; x < 96; x += 7) store.map.tileAt?.(x, 0);
    globalThis.gc?.();

    return {
        operation: "49 chunks (24x24) add/remove x25",
        timing: sampled.timing,
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
    const sampled = collectSync(() => {
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
        return { durationMs: performance.now() - started, chunks, store };
    });
    const { chunks, store } = sampled.observation;
    return {
        operation: "512x512 toroidal world, 5x5 resident chunk window",
        timing: sampled.timing,
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
    const sampled = collectSync(() => {
        const fog = new FogOfWar({ data, w: width, h: height });
        let examinedCandidates = 0;
        const started = performance.now();
        for (let pass = 0; pass < 20; pass += 1) {
            fog.recompute([{ x: 256 + pass % 2, y: 256, viewRange: 3 }]);
            examinedCandidates += fog.lastRecomputeCandidateCount;
        }
        return { durationMs: performance.now() - started, examinedCandidates };
    });
    const examinedCandidates = sampled.observation.examinedCandidates;
    const fullScanCandidates = width * height * 20;
    return {
        operation: "512x512 fog recompute x20",
        timing: sampled.timing,
        examinedCandidates,
        fullScanCandidates,
        candidateReductionPercent: round((1 - examinedCandidates / fullScanCandidates) * 100, 3)
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
    const sampled = collectSync(() => {
        const started = performance.now();
        let layout;
        for (let pass = 0; pass < 5; pass += 1) layout = generateWorldVegetation(options);
        return { durationMs: performance.now() - started, layout };
    });
    const layout = sampled.observation.layout;
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
        timing: sampled.timing,
        averageIterationMs: round(sampled.timing.medianMs / 5),
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
    const sampled = collectSync(() => {
        const started = performance.now();
        let merged;
        for (let pass = 0; pass < 100; pass += 1) merged = mergeBufferUpdateRanges(ranges);
        return { durationMs: performance.now() - started, merged };
    });
    const merged = sampled.observation.merged;
    return {
        operation: "10,000 GPU dirty ranges merge x100",
        timing: sampled.timing,
        averageIterationMs: round(sampled.timing.medianMs / 100, 3),
        inputRanges: ranges.length,
        uploadRanges: merged.length,
        rangeReductionPercent: round((1 - merged.length / ranges.length) * 100, 2)
    };
}

function benchmarkAdaptiveController() {
    const sampled = collectSync(() => {
        const adaptive = new AdaptiveStreamingController({
            baseFrameBudgetMs: 3,
            baseMaxTasksPerFrame: 2,
            baseWorkerCount: 4,
            baseLodDistances: { near: 900, far: 1650, vegetation: 1450, hysteresis: 120 }
        });
        const started = performance.now();
        for (let frame = 0; frame < 100000; frame += 1) adaptive.sample(16 + (frame % 5) * 0.2);
        return {
            durationMs: performance.now() - started,
            transitions: adaptive.stats.transitions,
            qualityLevel: adaptive.stats.qualityLevel
        };
    });
    return {
        operation: "adaptive frame sample x100,000",
        timing: sampled.timing,
        nanosecondsPerSample: round(sampled.timing.medianMs * 1e6 / 100000),
        transitions: sampled.observation.transitions,
        qualityLevel: sampled.observation.qualityLevel
    };
}

function benchmarkNavigationSummaries() {
    const data = {};
    for (let x = 0; x < 36; x += 1) {
        data[x] = {};
        for (let y = 0; y < 36; y += 1) data[x][y] = { type: Land.land };
    }
    const map = { data, w: 36, h: 36 };
    const sample = maxPortalsPerEntrance => collectSync(() => {
        const started = performance.now();
        let summary;
        for (let pass = 0; pass < 25; pass += 1) {
            summary = buildWorldNavigationSummary(
                map, 1, 1, 12, () => true, { maxPortalsPerEntrance }
            );
        }
        return { durationMs: performance.now() - started, summary };
    });
    const exact = sample(1000);
    const compact = sample(2);
    return {
        operation: "12x12 open navigation summary x25",
        exactTiming: exact.timing,
        compactTiming: compact.timing,
        exactPortals: exact.observation.summary.portals.length,
        compactPortals: compact.observation.summary.portals.length,
        matrixReductionPercent: round(
            (1 - compact.observation.summary.costs.length ** 2 / exact.observation.summary.costs.length ** 2) * 100,
            2
        )
    };
}

async function benchmarkSimulationRuntime() {
    const coldInsert = await collectAsync(async () => {
        const runtime = new WorldSimulationRuntime({
            chunkSize: 10,
            activeTickIntervalSeconds: 0.1,
            backgroundTickIntervalSeconds: 5
        });
        globalThis.gc?.();
        const started = performance.now();
        for (let index = 0; index < 5000; index += 1) {
            runtime.addEntity({ id: `cold-${index}`, x: index * 10, y: 0, state: { value: 0 } });
        }
        const durationMs = performance.now() - started;
        runtime.dispose();
        return { durationMs };
    });
    const coldIdle = await collectAsync(async () => {
        const runtime = new WorldSimulationRuntime({
            chunkSize: 10,
            activeTickIntervalSeconds: 0.1,
            backgroundTickIntervalSeconds: 5
        });
        for (let index = 0; index < 5000; index += 1) {
            runtime.addEntity({ id: `cold-${index}`, x: index * 10, y: 0, state: { value: 0 } });
        }
        globalThis.gc?.();
        const started = performance.now();
        await runtime.advance(0.016);
        const durationMs = performance.now() - started;
        runtime.dispose();
        return { durationMs };
    });
    const denseTick = await collectAsync(async () => {
        const runtime = new WorldSimulationRuntime({
            chunkSize: 1000,
            activeTickIntervalSeconds: 1,
            backgroundTickIntervalSeconds: 1
        });
        for (let index = 0; index < 100000; index += 1) {
            runtime.addEntity({
                id: `dense-${index}`,
                x: index % 1000,
                y: Math.floor(index / 1000),
                state: { value: 0 }
            });
        }
        runtime.registerSystem({ id: "noop", update() {} });
        globalThis.gc?.();
        const started = performance.now();
        await runtime.advance(1);
        const durationMs = performance.now() - started;
        runtime.dispose();
        return { durationMs };
    });
    return {
        operation: "generic simulation scale probes",
        coldChunks: 5000,
        coldInsertTiming: coldInsert.timing,
        coldIdleAdvanceTiming: coldIdle.timing,
        denseEntities: 100000,
        denseNoopTickTiming: denseTick.timing
    };
}

const cpu = os.cpus()[0];
const results = {
    environment: {
        node: process.version,
        v8: process.versions.v8,
        platform: process.platform,
        arch: process.arch,
        cpuModel: cpu?.model ?? "unknown",
        logicalCpuCount: os.cpus().length,
        gcExposed: typeof globalThis.gc === "function",
        ci: process.env.CI === "true",
        warmupRuns: WARMUP_RUNS,
        sampleRuns: SAMPLE_RUNS,
        limitScale: LIMIT_SCALE
    },
    sparseStore: benchmarkSparseStore(),
    toroidalWindow: benchmarkToroidalWindow(),
    fogFrontier: benchmarkFogFrontier(),
    vegetationPreparation: benchmarkVegetationPreparation(),
    gpuRangeBatching: benchmarkGpuRangeBatching(),
    adaptiveController: benchmarkAdaptiveController(),
    navigationSummaries: benchmarkNavigationSummaries(),
    simulationRuntime: await benchmarkSimulationRuntime()
};

console.log(JSON.stringify(results, null, 2));

if (CHECK_MODE) {
    const failures = [];
    const under = (name, value, limit) => {
        const scaledLimit = limit * LIMIT_SCALE;
        if (!Number.isFinite(value) || value > scaledLimit) {
            failures.push(`${name}: ${value} > ${scaledLimit}`);
        }
    };
    // Median gates reject sustained gross regressions while warmups and sample
    // ranges expose runner noise. Limits retain shared-runner headroom and are
    // not cross-machine performance scores.
    if (!results.environment.gcExposed) failures.push("benchmark gate requires --expose-gc");
    under("sparseStore.timing.medianMs", results.sparseStore.timing.medianMs, 500);
    under("sparseStore.residentPayloadBytes", results.sparseStore.residentPayloadBytes, 16 * 1024 * 1024);
    under("toroidalWindow.timing.medianMs", results.toroidalWindow.timing.medianMs, 750);
    under("vegetationPreparation.averageIterationMs", results.vegetationPreparation.averageIterationMs, 250);
    under("gpuRangeBatching.timing.medianMs", results.gpuRangeBatching.timing.medianMs, 500);
    under("adaptiveController.timing.medianMs", results.adaptiveController.timing.medianMs, 500);
    under("navigationSummaries.exactTiming.medianMs", results.navigationSummaries.exactTiming.medianMs, 2_500);
    under("simulationRuntime.coldInsertTiming.medianMs", results.simulationRuntime.coldInsertTiming.medianMs, 500);
    under("simulationRuntime.denseNoopTickTiming.medianMs", results.simulationRuntime.denseNoopTickTiming.medianMs, 2_000);
    if (results.toroidalWindow.residentChunks !== 25) {
        failures.push(`toroidalWindow.residentChunks: ${results.toroidalWindow.residentChunks} !== 25`);
    }
    if (results.fogFrontier.candidateReductionPercent < 99) {
        failures.push(`fogFrontier.candidateReductionPercent: ${results.fogFrontier.candidateReductionPercent} < 99`);
    }
    if (failures.length > 0) {
        console.error(`Foundation benchmark gate failed:\n${failures.join("\n")}`);
        process.exitCode = 1;
    } else {
        console.log("Foundation benchmark gate passed.");
    }
}
