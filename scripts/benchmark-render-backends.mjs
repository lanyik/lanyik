import {
    Box3,
    Frustum,
    Matrix4,
    PerspectiveCamera,
    Vector3
} from "three";

const CASES = [10_000, 50_000, 100_000];
const TILES_PER_RENDER_CHUNK = 12;
const INSTANCE_SPACING = 4;
const ITERATIONS = 80;
let sink = 0;

function round(value, digits = 3) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function createCase(instanceCount) {
    const side = Math.ceil(Math.sqrt(instanceCount));
    const positions = new Float32Array(instanceCount * 3);
    for (let index = 0; index < instanceCount; index += 1) {
        const x = index % side;
        const z = Math.floor(index / side);
        positions[index * 3] = (x - side / 2) * INSTANCE_SPACING;
        positions[index * 3 + 1] = ((index * 17) % 9) - 4;
        positions[index * 3 + 2] = (z - side / 2) * INSTANCE_SPACING;
    }

    const chunksPerSide = Math.ceil(side / TILES_PER_RENDER_CHUNK);
    const halfChunk = TILES_PER_RENDER_CHUNK * INSTANCE_SPACING / 2;
    const bounds = new Float32Array(chunksPerSide * chunksPerSide * 6);
    let boundIndex = 0;
    for (let chunkZ = 0; chunkZ < chunksPerSide; chunkZ += 1) {
        for (let chunkX = 0; chunkX < chunksPerSide; chunkX += 1) {
            const centerX = (chunkX * TILES_PER_RENDER_CHUNK - side / 2) * INSTANCE_SPACING + halfChunk;
            const centerZ = (chunkZ * TILES_PER_RENDER_CHUNK - side / 2) * INSTANCE_SPACING + halfChunk;
            bounds[boundIndex++] = centerX - halfChunk;
            bounds[boundIndex++] = -8;
            bounds[boundIndex++] = centerZ - halfChunk;
            bounds[boundIndex++] = centerX + halfChunk;
            bounds[boundIndex++] = 32;
            bounds[boundIndex++] = centerZ + halfChunk;
        }
    }
    return { positions, bounds, renderChunks: bounds.length / 6 };
}

function createFrustum() {
    const camera = new PerspectiveCamera(55, 16 / 9, 1, 1_800);
    camera.position.set(0, 480, 720);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return new Frustum().setFromProjectionMatrix(matrix);
}

function measure(operation) {
    for (let warmup = 0; warmup < 10; warmup += 1) sink += operation();
    const started = performance.now();
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) sink += operation();
    return (performance.now() - started) / ITERATIONS;
}

function benchmark(instanceCount) {
    const { positions, bounds, renderChunks } = createCase(instanceCount);
    const frustum = createFrustum();
    const box = new Box3();
    const point = new Vector3();
    const visibleIndices = new Uint32Array(instanceCount);
    const renderDistanceSquared = 1_400 ** 2;

    const chunkCull = () => {
        let visible = 0;
        for (let offset = 0; offset < bounds.length; offset += 6) {
            box.min.set(bounds[offset], bounds[offset + 1], bounds[offset + 2]);
            box.max.set(bounds[offset + 3], bounds[offset + 4], bounds[offset + 5]);
            const dx = Math.max(0, box.min.x, -box.max.x);
            const dz = Math.max(0, box.min.z, -box.max.z);
            if (dx * dx + dz * dz <= renderDistanceSquared && frustum.intersectsBox(box)) visible += 1;
        }
        return visible;
    };
    const instanceCullAndCompact = () => {
        let visible = 0;
        for (let offset = 0, index = 0; index < instanceCount; index += 1, offset += 3) {
            const x = positions[offset];
            const y = positions[offset + 1];
            const z = positions[offset + 2];
            if (x * x + z * z > renderDistanceSquared) continue;
            point.set(x, y, z);
            if (frustum.containsPoint(point)) visibleIndices[visible++] = index;
        }
        return visible;
    };

    const visibleChunks = chunkCull();
    const visibleInstances = instanceCullAndCompact();
    const chunkCullMs = measure(chunkCull);
    const instanceCullCompactMs = measure(instanceCullAndCompact);
    return {
        instanceCount,
        renderChunks,
        visibleChunks,
        visibleInstances,
        chunkCullMs: round(chunkCullMs),
        instanceCullCompactMs: round(instanceCullCompactMs),
        instanceToChunkCpuRatio: round(instanceCullCompactMs / Math.max(chunkCullMs, Number.EPSILON), 1),
        gpuCandidateStorageMiB: round(instanceCount * 16 / 1_048_576),
        worstCaseCompactedIndexMiB: round(instanceCount * 4 / 1_048_576)
    };
}

const results = CASES.map(benchmark);
const largest = results.at(-1);
const evaluation = {
    methodology: {
        iterations: ITERATIONS,
        renderChunkTiles: `${TILES_PER_RENDER_CHUNK}x${TILES_PER_RENDER_CHUNK}`,
        chunkPath: "distance + Three.Frustum.intersectsBox per render chunk",
        instancePath: "distance + Three.Frustum.containsPoint + Uint32 visibility compaction per instance",
        limitation: "The instance path is a CPU cost proxy; it does not claim to measure a GPU compute shader."
    },
    environment: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        cpu: process.env.PROCESSOR_IDENTIFIER ?? "unknown"
    },
    results,
    decision: largest.chunkCullMs < 0.5
        ? "Keep chunk-level WebGL culling as the default; prototype GPU culling only after measured draw-call or overdraw pressure, not instance count alone."
        : "Chunk culling exceeds its 0.5ms CPU target on this machine; profile the browser renderer before choosing a GPU-culling prototype."
};

console.log(JSON.stringify(evaluation, null, 2));

// Prevent an optimizer from proving the measured loops unused.
if (!Number.isFinite(sink)) process.exitCode = 1;
