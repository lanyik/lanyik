import {
    FogOfWar,
    Land,
    SparseWorldChunkStore,
    generateWorldChunk
} from "../dist/hex-map.mjs";

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

console.log(JSON.stringify({
    sparseStore: benchmarkSparseStore(),
    toroidalWindow: benchmarkToroidalWindow(),
    fogFrontier: benchmarkFogFrontier()
}, null, 2));
