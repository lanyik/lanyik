import {
    AdaptiveStreamingController,
    FogOfWar,
    Land,
    SparseWorldChunkStore,
    BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES,
    createWorldDescriptorV2,
    deriveHydrologyRaster,
    HydrologyRegionGenerator,
    HydrologyRegionSpatialIndex,
    hydrologyRegionVectorBytes,
    createWorldVegetationMapSnapshot,
    generateWorldChunk,
    generateBaseSemanticChunk,
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

function benchmarkSemanticChunkGeneration() {
    const descriptor = createWorldDescriptorV2({ seed: "perf-semantic-v2" });
    const started = performance.now();
    let checksum = 0;
    let chunks = 0;
    for (let chunkX = -3; chunkX <= 3; chunkX += 1) {
        for (let chunkY = -3; chunkY <= 3; chunkY += 1) {
            const chunk = generateBaseSemanticChunk({ descriptor, key: { chunkX, chunkY } });
            for (let index = 0; index < chunk.macroHeight.length; index += 31) {
                checksum = (checksum + chunk.macroHeight[index]) % 0x1fffffffffffff;
            }
            chunks += 1;
        }
    }
    const durationMs = performance.now() - started;
    return {
        operation: "49 semantic chunks (32x32) generator-v6",
        durationMs: round(durationMs),
        averageMs: round(durationMs / chunks),
        chunks,
        payloadBytes: chunks * BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES,
        checksum
    };
}

function benchmarkHydrologyRegions() {
    const descriptor = createWorldDescriptorV2({ seed: "hydrology-order" });
    const generator = new HydrologyRegionGenerator(descriptor);
    const regions = [];
    const started = performance.now();
    for (let regionX = 0; regionX < 4; regionX += 1) {
        for (let regionY = 0; regionY < 4; regionY += 1) {
            regions.push(generator.generate({ regionX, regionY }));
        }
    }
    const generationMs = performance.now() - started;
    const queryRegion = regions.reduce((best, region) => region.rivers.length > best.rivers.length ? region : best);
    const spatialIndex = new HydrologyRegionSpatialIndex(queryRegion);
    const rasterStarted = performance.now();
    const raster = deriveHydrologyRaster(queryRegion, {
        macroHeight: new Uint16Array(128 * 128).fill(65_535),
        spatialIndex
    });
    const rasterMs = performance.now() - rasterStarted;
    return {
        operation: "one 512x512 infinite drainage basin -> 16 regions + one 128x128 derived raster",
        generationMs: round(generationMs),
        rasterMs: round(rasterMs),
        regions: regions.length,
        rivers: regions.reduce((sum, region) => sum + region.rivers.length, 0),
        ports: regions.reduce((sum, region) => sum + region.boundaryPorts.length, 0),
        vectorBytes: regions.reduce((sum, region) => sum + hydrologyRegionVectorBytes(region), 0),
        spatialIndexBytes: spatialIndex.byteLength,
        wetTiles: raster.kind.reduce((sum, kind) => sum + (kind === 0 ? 0 : 1), 0)
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

const results = {
    sparseStore: benchmarkSparseStore(),
    toroidalWindow: benchmarkToroidalWindow(),
    semanticChunkGeneration: benchmarkSemanticChunkGeneration(),
    hydrologyRegions: benchmarkHydrologyRegions(),
    fogFrontier: benchmarkFogFrontier(),
    vegetationPreparation: benchmarkVegetationPreparation(),
    gpuRangeBatching: benchmarkGpuRangeBatching(),
    adaptiveController: benchmarkAdaptiveController(),
    navigationSummaries: benchmarkNavigationSummaries(),
    simulationRuntime: await benchmarkSimulationRuntime()
};

console.log(JSON.stringify(results, null, 2));

if (process.argv.includes("--check")) {
    const failures = [];
    const configuredScale = Number(process.env.FOUNDATION_BENCHMARK_SCALE ?? 1);
    const limitScale = Number.isFinite(configuredScale) && configuredScale > 0 ? configuredScale : 1;
    const under = (name, value, limit) => {
        const scaledLimit = limit * limitScale;
        if (!Number.isFinite(value) || value > scaledLimit) {
            failures.push(`${name}: ${value} > ${scaledLimit}`);
        }
    };
    // These are gross-regression gates rather than machine-comparison scores:
    // each limit leaves substantial shared-runner headroom but still catches
    // accidental quadratic work and multi-order-of-magnitude slowdowns.
    under("sparseStore.durationMs", results.sparseStore.durationMs, 500);
    under("sparseStore.residentPayloadBytes", results.sparseStore.residentPayloadBytes, 16 * 1024 * 1024);
    under("toroidalWindow.durationMs", results.toroidalWindow.durationMs, 750);
    under("semanticChunkGeneration.durationMs", results.semanticChunkGeneration.durationMs, 1_500);
    under("hydrologyRegions.generationMs", results.hydrologyRegions.generationMs, 1_500);
    under("hydrologyRegions.rasterMs", results.hydrologyRegions.rasterMs, 750);
    under("vegetationPreparation.averageMs", results.vegetationPreparation.averageMs, 250);
    under("gpuRangeBatching.durationMs", results.gpuRangeBatching.durationMs, 500);
    under("adaptiveController.durationMs", results.adaptiveController.durationMs, 500);
    under("navigationSummaries.exactDurationMs", results.navigationSummaries.exactDurationMs, 2_500);
    under("simulationRuntime.coldInsertMs", results.simulationRuntime.coldInsertMs, 500);
    under("simulationRuntime.denseNoopTickMs", results.simulationRuntime.denseNoopTickMs, 2_000);
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
