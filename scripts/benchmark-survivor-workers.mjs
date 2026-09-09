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
    for (const count of [16, 32, 64, 128]) {
        const batch = new runtime.ProjectileBatch(); batch.count = count; batch.enemyCount = 640;
        for (let i = 0; i < 640; i++) { batch.enemyIds[i] = i + 1; batch.enemyX[i] = 10 + i % 20; batch.enemyZ[i] = 10 + Math.floor(i / 20); batch.enemyRadius[i] = .3; }
        batch.endX.fill(.1); batch.radius.fill(.1);
        const serial = await measure(() => runtime.resolveProjectileRange(batch));
        const scheduled = await measure(() => pool.resolve(batch));
        assert.ok(batch.targets.every(id => id === 0));
        results.push({ enemies: 640, projectiles: count, pairs: count * 640, serial, scheduled });
    }
    console.log(JSON.stringify({ context: { node: process.version, platform: platform(), cpu: cpus()[0].model,
        timing: "100 warmup batches, five samples of 200; real Node threads including copy/transfer/join, no browser or GPU claim" },
        queryBytesPerLane: runtime.ProjectileBatch.bytes, renderBytesPerFrame: runtime.RenderFrame.bytes,
        parallelThreshold: runtime.PARALLEL_COLLISION_PAIRS, results }, null, 2));
    if (process.argv.includes("--check")) {
        assert.ok(globalThis.gc, "Use node --expose-gc for benchmark gates");
        assert.ok(results.at(-1).scheduled.medianMs < 3, "Full-capacity parallel collision batch exceeded 3 ms");
    }
} finally { pool.dispose(); await Promise.all(workers.map(worker => worker.terminate())); }
