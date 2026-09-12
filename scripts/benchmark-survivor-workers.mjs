import { build } from "esbuild";
import { Worker, MessageChannel } from "node:worker_threads";
import { cpus, platform } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

if (process.argv.slice(2).some(arg => arg !== "--check")) throw new Error("Usage: benchmark-survivor-workers.mjs [--check]");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ stdin: { resolveDir: root, contents: `
    export { ProjectileBatch, resolveProjectileRange } from './apps/survivor/src/core/ProjectileBatch';
    export { ProjectileWorkerPool, PARALLEL_COLLISION_PAIRS } from './apps/survivor/src/worker/ProjectileWorkerPool';
    export { RenderFrame } from './apps/survivor/src/worker/RenderFrame';
    export { SpatialGrid, SpatialQuery } from './apps/survivor/src/core/SpatialGrid';
    export { GAME_CONFIG, MAX_ENEMIES } from './apps/survivor/src/core/GameConfig';
` }, bundle: true, write: false, platform: "node", format: "esm" });
const dataURL = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const runtime = await import(dataURL(bundle.outputFiles[0].text));
const query = await build({ entryPoints: [fileURLToPath(new URL("../apps/survivor/src/worker/Projectile.worker.ts", import.meta.url))],
    bundle: true, write: false, platform: "browser", format: "esm" });
const workers = [], ports = [];
for (let i = 0; i < 2; i++) {
    const worker = new Worker(new URL(dataURL(`
        import { parentPort } from 'node:worker_threads';
        globalThis.self = globalThis;
        await import(${JSON.stringify(dataURL(query.outputFiles[0].text))});
        parentPort.on('message', data => globalThis.onmessage({ data }));
    `)));
    const channel = new MessageChannel();
    worker.postMessage({ port: channel.port2 }, [channel.port2]);
    workers.push(worker); ports.push(channel.port1);
}
const pool = new runtime.ProjectileWorkerPool(ports);
const measure = async run => {
    for (let i = 0; i < 100; i++) await run();
    const samples = [];
    for (let sample = 0; sample < 5; sample++) {
        globalThis.gc?.(); const started = performance.now();
        for (let i = 0; i < 200; i++) await run();
        samples.push((performance.now() - started) / 200);
    }
    return { samplesMs: samples, medianMs: [...samples].sort((a, b) => a - b)[2] };
};
try {
    const results = [];
    for (const distribution of ["separated", "dense-near-miss"]) for (const count of [16, 32, 64, 128]) {
        const batch = new runtime.ProjectileBatch(); batch.count = count; batch.enemyCount = runtime.MAX_ENEMIES;
        const grid = new runtime.SpatialGrid(runtime.MAX_ENEMIES), candidates = new runtime.SpatialQuery(runtime.MAX_ENEMIES);
        const indices = Uint16Array.from({ length: runtime.MAX_ENEMIES }, (_, i) => i);
        // Targets stay still in this fixture, so their maintained index is built once outside batch timing.
        for (let i = 0; i < runtime.MAX_ENEMIES; i++) {
            batch.enemyIds[i] = i + 1;
            batch.enemyX[i] = distribution === "separated" ? 10 + i % 20 : .45 + (i % 20) * .001;
            batch.enemyZ[i] = distribution === "separated" ? 10 + Math.floor(i / 20) : .35 + Math.floor(i / 20) * .001;
            batch.enemyRadius[i] = .3;
            grid.update(i, batch.enemyX[i], batch.enemyZ[i], batch.enemyRadius[i], 1);
        }
        batch.endX.fill(.1); batch.radius.fill(.1);
        const serial = await measure(() => { batch.prepare(grid, candidates, 1, indices); runtime.resolveProjectileRange(batch); });
        const beforeParallel = pool.parallelBatches;
        const scheduled = await measure(() => { batch.prepare(grid, candidates, 1, indices); return pool.resolve(batch); });
        assert.ok(batch.targets.every(id => id === 0));
        results.push({ distribution, enemies: batch.enemyCount, projectiles: count, naivePairs: count * batch.enemyCount, candidatePairs: batch.candidateCounts.subarray(0, count).reduce((sum, value) => sum + value, 0), parallelBatches: pool.parallelBatches - beforeParallel, serial, scheduled });
    }
    console.log(JSON.stringify({ context: { node: process.version, platform: platform(), cpu: cpus()[0].model,
        timing: "100 warmup batches, five samples of 200; maintained static target index built before timing; includes candidate preparation and real Node copy/transfer/join, no browser or GPU claim" },
        queryBytesPerLane: runtime.ProjectileBatch.bytes, renderBytesPerFrame: runtime.RenderFrame.bytes,
        productionParallelEnabled: runtime.GAME_CONFIG.workers.parallelCollisionEnabled,
        parallelThreshold: runtime.PARALLEL_COLLISION_PAIRS, results }, null, 2));
    if (process.argv.includes("--check")) {
        assert.ok(globalThis.gc, "Use node --expose-gc for benchmark gates");
        assert.ok(results.at(-1).serial.medianMs < 3, "Full-capacity serial collision batch exceeded 3 ms");
        assert.ok(results.at(-1).scheduled.medianMs < 3, "Full-capacity parallel collision batch exceeded 3 ms");
        if (runtime.GAME_CONFIG.workers.parallelCollisionEnabled) {
            for (const result of results) if (result.parallelBatches > 0) {
                assert.ok(result.scheduled.medianMs < result.serial.medianMs,
                    "Production parallel collision requires a measured improvement over the serial query");
            }
        }
    }
} finally { pool.dispose(); await Promise.all(workers.map(worker => worker.terminate())); }
