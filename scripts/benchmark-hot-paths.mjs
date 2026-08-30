import {
    BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES,
    createEffectiveDeltaSnapshot,
    createSparseSemanticDelta,
    createTransferableEffectiveWindow,
    createWorldDescriptorV2,
    deriveHydrologyRaster,
    EffectiveWorldView,
    generateBaseSemanticChunk,
    HydrologyRegionGenerator,
    HydrologyRegionSpatialIndex,
    hydrologyRegionVectorBytes,
    LightingStateController,
    MemoryWorldDeltaStore,
    compileSurfaceChunk,
    surfaceHydrologyRegionRequirements,
    surfaceSemanticChunkRequirements,
    sparseSemanticDeltaByteLength,
    SURFACE_FOG_LAYER_BYTES,
    SURFACE_FOG_PAGE_BYTES,
    SURFACE_GPU_PAGE_BYTES,
    SurfaceFogTexturePool,
    SurfacePresentationLayer,
    SurfaceRequestTracker,
    SurfaceTexturePool
} from "../dist/hex-map.mjs";
import { WorldSimulationRuntime } from "../dist/simulation.mjs";

const round = (value, digits = 2) => {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
};

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
        operation: "49 semantic chunks (32x32) generator-v9",
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
    return {
        operation: "one infinite drainage basin -> 16 regions + one derived raster",
        generationMs: round(generationMs),
        rasterMs: round(performance.now() - rasterStarted),
        regions: regions.length,
        rivers: regions.reduce((sum, region) => sum + region.rivers.length, 0),
        vectorBytes: regions.reduce((sum, region) => sum + hydrologyRegionVectorBytes(region), 0),
        spatialIndexBytes: spatialIndex.byteLength,
        wetTiles: raster.kind.reduce((sum, kind) => sum + (kind === 0 ? 0 : 1), 0)
    };
}

function benchmarkEffectiveSnapshots() {
    const descriptor = createWorldDescriptorV2({ seed: "effective-snapshot-benchmark" });
    const semanticChunks = [
        { chunkX: 0, chunkY: 0 }, { chunkX: 0, chunkY: 1 },
        { chunkX: 1, chunkY: 0 }, { chunkX: 1, chunkY: 1 }
    ].map(key => generateBaseSemanticChunk({ descriptor, key }));
    const hydrologyRegion = new HydrologyRegionGenerator(descriptor).generate({ regionX: 0, regionY: 0 });
    const delta = createSparseSemanticDelta({
        key: { chunkX: 0, chunkY: 0 }, revision: 1,
        overrides: [{ localX: 8, localY: 8, macroHeight: 40_000 }]
    });
    const view = new EffectiveWorldView(descriptor, createEffectiveDeltaSnapshot({
        descriptor, effectiveRevision: 1, semanticDeltas: [delta]
    }));
    const tracker = new SurfaceRequestTracker(descriptor, 1);
    const iterations = 5_000;
    let checksum = 0;
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) {
        const snapshot = view.capture({ semanticChunks, hydrologyRegions: [hydrologyRegion] });
        const request = tracker.issueRequest(snapshot, { chunkX: 0, chunkY: 0 });
        checksum = (checksum + Math.round(snapshot.getTile(8, 8).macroHeight * 65_535)
            + request.requestToken.renderChunkGeneration) >>> 0;
    }
    const durationMs = performance.now() - started;
    tracker.dispose();
    return {
        operation: "exact effective snapshot/request x5000",
        durationMs: round(durationMs),
        averageMicros: round(durationMs * 1_000 / iterations),
        checksum
    };
}

function benchmarkSurfaceCompilation() {
    const descriptor = createWorldDescriptorV2({ seed: "surface-compilation-benchmark" });
    const key = { chunkX: 7, chunkY: 4 };
    const semanticChunks = surfaceSemanticChunkRequirements(descriptor, key)
        .map(chunkKey => generateBaseSemanticChunk({ descriptor, key: chunkKey }));
    const generator = new HydrologyRegionGenerator(descriptor);
    const hydrologyRegions = surfaceHydrologyRegionRequirements(descriptor, key)
        .map(regionKey => generator.generate(regionKey));
    const snapshot = new EffectiveWorldView(descriptor).capture({ semanticChunks, hydrologyRegions });
    const windowIterations = 250;
    let window;
    let started = performance.now();
    for (let index = 0; index < windowIterations; index += 1) {
        window = createTransferableEffectiveWindow(snapshot, key);
    }
    const windowMs = performance.now() - started;
    const compileIterations = 25;
    let chunk;
    let checksum = 0;
    started = performance.now();
    for (let index = 0; index < compileIterations; index += 1) {
        chunk = compileSurfaceChunk(window);
        checksum = (checksum + Number.parseInt(chunk.contentChecksum, 16)) >>> 0;
    }
    const compileMs = performance.now() - started;
    return {
        metrics: {
            operation: "20x20 effective window x250 + 66x66 CPU surface compile x25",
            windowMs: round(windowMs),
            compileMs: round(compileMs),
            averageCompileMs: round(compileMs / compileIterations),
            outputBytes: chunk.byteLength,
            checksum
        },
        chunk
    };
}

function benchmarkSurfaceTexturePacking(chunk) {
    const pool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
    const slot = pool.allocate(chunk.key);
    const iterations = 100;
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) pool.upload(slot, chunk);
    const durationMs = performance.now() - started;
    const stats = pool.stats;
    pool.dispose();
    return {
        operation: "66x66 compiled field -> four DataArrayTexture stores x100",
        durationMs: round(durationMs),
        averageMicros: round(durationMs * 1_000 / iterations),
        pageBytes: stats.gpuBytes,
        logicalUploadBytes: stats.logicalUploadBytes
    };
}

function benchmarkSurfacePresentationProfiles(template) {
    const cloneForKey = key => Object.freeze({
        ...template,
        key: Object.freeze({ ...key }),
        dependencyKey: Object.freeze({
            ...template.dependencyKey,
            renderKey: Object.freeze({ ...key })
        })
    });
    const leaseFor = chunk => {
        let released = false;
        return Object.freeze({
            requestToken: Object.freeze({ sessionEpoch: 1, renderChunkGeneration: 1 }),
            effectiveRevision: chunk.effectiveRevision,
            dependencyKey: chunk.dependencyKey,
            chunk,
            get released() { return released; },
            isCurrent: () => !released,
            release: () => !released && (released = true)
        });
    };
    const run = chunkCount => {
        const surfacePool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const fogPool = new SurfaceFogTexturePool({ surfacePool, gpuBudgetBytes: SURFACE_FOG_PAGE_BYTES });
        const lighting = new LightingStateController();
        const presentation = new SurfacePresentationLayer({
            surfaceTexturePool: surfacePool,
            fogTexturePool: fogPool,
            lighting
        });
        const fog = new Uint8Array(SURFACE_FOG_LAYER_BYTES).fill(255);
        const side = Math.ceil(Math.sqrt(chunkCount));
        const started = performance.now();
        for (let index = 0; index < chunkCount; index += 1) {
            const key = { chunkX: index % side, chunkY: Math.floor(index / side) };
            presentation.mount(leaseFor(cloneForKey(key)), index % 3);
            presentation.uploadFog(key, fog);
        }
        const durationMs = performance.now() - started;
        const stats = presentation.stats;
        presentation.dispose();
        fogPool.dispose();
        surfacePool.dispose();
        lighting.dispose();
        return {
            chunks: chunkCount,
            durationMs: round(durationMs),
            sharedGeometryBytes: stats.sharedGeometry.byteLength,
            waterGeometryBytes: stats.water.uniqueGeometryBytes,
            vegetationInstances: stats.vegetation.visibleInstanceCount
        };
    };
    return {
        operation: "v2 Ground/Water/Vegetation mount profiles",
        profile1: run(1), profile9: run(9), profile49: run(49)
    };
}

async function benchmarkAtomicDeltaTransactions() {
    const descriptor = createWorldDescriptorV2({ seed: "delta-transaction-benchmark" });
    const store = new MemoryWorldDeltaStore();
    const iterations = 250;
    const started = performance.now();
    for (let revision = 0; revision < iterations; revision += 1) {
        await store.commit({
            descriptor,
            expectedRevision: revision,
            semanticMutations: [{ x: revision % 32, y: Math.floor(revision / 32), macroHeight: 30_000 + revision }]
        });
    }
    const durationMs = performance.now() - started;
    const snapshot = await store.load(descriptor);
    store.dispose();
    return {
        operation: "WorldDeltaStore v3 atomic CAS transactions x250",
        durationMs: round(durationMs),
        averageMicros: round(durationMs * 1_000 / iterations),
        effectiveRevision: snapshot.effectiveRevision,
        semanticDeltaBytes: snapshot.semanticDeltas.reduce((sum, delta) => sum + sparseSemanticDeltaByteLength(delta), 0)
    };
}

async function benchmarkSimulationRuntime() {
    const runtime = new WorldSimulationRuntime({
        activeTickIntervalSeconds: 1,
        backgroundTickIntervalSeconds: 1
    });
    for (let index = 0; index < 100_000; index += 1) {
        runtime.addEntity({ id: `dense-${index}`, x: index % 1000, y: Math.floor(index / 1000), state: null });
    }
    runtime.registerSystem({ id: "noop", update() {} });
    const started = performance.now();
    await runtime.advance(1);
    const durationMs = performance.now() - started;
    runtime.dispose();
    return { operation: "100,000-entity simulation no-op tick", durationMs: round(durationMs) };
}

const surfaceCompilation = benchmarkSurfaceCompilation();
const results = {
    semanticChunkGeneration: benchmarkSemanticChunkGeneration(),
    hydrologyRegions: benchmarkHydrologyRegions(),
    effectiveSnapshots: benchmarkEffectiveSnapshots(),
    surfaceCompilation: surfaceCompilation.metrics,
    surfaceTexturePacking: benchmarkSurfaceTexturePacking(surfaceCompilation.chunk),
    surfacePresentationProfiles: benchmarkSurfacePresentationProfiles(surfaceCompilation.chunk),
    atomicDeltaTransactions: await benchmarkAtomicDeltaTransactions(),
    simulationRuntime: await benchmarkSimulationRuntime()
};

console.log(JSON.stringify(results, null, 2));

if (process.argv.includes("--check")) {
    const failures = [];
    const configuredScale = Number(process.env.FOUNDATION_BENCHMARK_SCALE ?? 1);
    const limitScale = Number.isFinite(configuredScale) && configuredScale > 0 ? configuredScale : 1;
    const under = (name, value, limit) => {
        const scaledLimit = limit * limitScale;
        if (!Number.isFinite(value) || value > scaledLimit) failures.push(`${name}: ${value} > ${scaledLimit}`);
    };
    under("semanticChunkGeneration.durationMs", results.semanticChunkGeneration.durationMs, 1_500);
    under("hydrologyRegions.generationMs", results.hydrologyRegions.generationMs, 1_500);
    under("hydrologyRegions.rasterMs", results.hydrologyRegions.rasterMs, 750);
    under("effectiveSnapshots.durationMs", results.effectiveSnapshots.durationMs, 750);
    under("surfaceCompilation.windowMs", results.surfaceCompilation.windowMs, 750);
    under("surfaceCompilation.compileMs", results.surfaceCompilation.compileMs, 750);
    under("surfaceTexturePacking.durationMs", results.surfaceTexturePacking.durationMs, 750);
    under("surfacePresentationProfiles.profile49.durationMs", results.surfacePresentationProfiles.profile49.durationMs, 1_500);
    under("atomicDeltaTransactions.durationMs", results.atomicDeltaTransactions.durationMs, 750);
    under("simulationRuntime.durationMs", results.simulationRuntime.durationMs, 2_000);
    if (results.atomicDeltaTransactions.effectiveRevision !== 250) {
        failures.push(`atomicDeltaTransactions.effectiveRevision: ${results.atomicDeltaTransactions.effectiveRevision} !== 250`);
    }
    if (failures.length > 0) {
        console.error(`Surface v2 benchmark gate failed:\n${failures.join("\n")}`);
        process.exitCode = 1;
    } else {
        console.log("Surface v2 benchmark gate passed.");
    }
}
