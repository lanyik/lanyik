import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { cpus, platform } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { summarizeLatencies } from "./lib/benchmark-latency.mjs";

const output = process.argv[2];
if (!output || process.argv.length !== 3 || !global.gc) throw new Error("Usage: node --expose-gc scripts/benchmark-survivor-streaming.mjs <output.json>");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ stdin: { contents: `
export { CombatSimulation } from './apps/survivor/src/core/CombatSimulation';
export { ProceduralCombatTerrain } from './apps/survivor/src/adapters/ProceduralCombatTerrain';
export { ProjectileWorkerPool } from './apps/survivor/src/worker/ProjectileWorkerPool';`, resolveDir: root },
    bundle: true, write: false, platform: "node", format: "esm" });
const code = bundle.outputFiles[0].text;
const runtime = await import(`data:text/javascript;base64,${Buffer.from(code + "\n//# sourceURL=survivor-streaming.mjs").toString("base64")}`);
const summary = values => summarizeLatencies(values, 1000 / 120);

async function round(automatic) {
    const channel = new MessageChannel(), pool = new runtime.ProjectileWorkerPool([]);
    let resume, segmentStart = 0, waiting = 0, yields = 0, slices = [], sim, immediate;
    channel.port1.onmessage = () => resume();
    const yieldWorld = async () => {
        const at = performance.now(); slices.push(at - segmentStart); yields++;
        await new Promise(resolve => { resume = resolve; channel.port2.postMessage(null); });
        segmentStart = performance.now(); waiting += segmentStart - at;
    };
    const measure = async action => {
        slices = []; waiting = 0; yields = 0;
        const start = segmentStart = performance.now();
        await action();
        const end = performance.now(); slices.push(end - segmentStart);
        return { wallMs: end - start, yieldMs: waiting, yields, maxSliceMs: Math.max(...slices), slicesMs: slices };
    };
    const equivalent = () => {
        assert.deepEqual(sim.checkpoint(), immediate.checkpoint());
        assert.deepEqual(sim.getSnapshot(), immediate.getSnapshot());
        assert.deepEqual([...sim.world.chunks.values()].map(c => [c.key, c.spawns, c.spawned, c.chest, c.chestOpened]),
            [...immediate.world.chunks.values()].map(c => [c.key, c.spawns, c.spawned, c.chest, c.chestOpened]));
        for (const component of ["position", "vitals", "enemy", "action", "projectile", "status"])
            for (const [key, array] of Object.entries(sim.entities[component]))
                if (ArrayBuffer.isView(array)) assert.deepEqual(array, immediate.entities[component][key], `${component}.${key}`);
    };
    try {
        const startup = await measure(async () => {
            sim = new runtime.CombatSimulation("rift-ember-1", { x: 0, z: 0 }, undefined,
                new runtime.ProceduralCombatTerrain("rift-ember-1"), "wilds", "rift-ember-1", yieldWorld);
            await sim.initialize();
        });
        immediate = new runtime.CombatSimulation("rift-ember-1", { x: 0, z: 0 }, undefined, new runtime.ProceduralCombatTerrain("rift-ember-1"));
        equivalent();
        if (automatic) { sim.toggleAutoCombat(); immediate.toggleAutoCombat(); }
        const ticks = [], boundaries = [], input = automatic ? { x: 0, z: 0, active: false } : { x: 1, z: .4, active: true };
        for (let tick = 1; tick <= 600; tick++) {
            sim.health = sim.stats.maxHealth; immediate.health = immediate.stats.maxHealth;
            const before = [...sim.world.chunks.keys()].join(";");
            const measurement = await measure(() => sim.step(input, pool));
            ticks.push(measurement);
            immediate.step(input);
            if (before !== [...sim.world.chunks.keys()].join(";")) boundaries.push({ tick, ...measurement });
            if (tick % 60 === 0) equivalent();
        }
        assert.ok(boundaries.length > 0, "The replay must cross a regional boundary");
        let target;
        for (let x = 360; x < 380 && !target; x++) for (let z = 0; z < 20 && !target; z++)
            if (sim.entities.terrain.isClear(x, z, .3)) target = { x, z };
        assert.ok(target, "Teleport requires a clear destination");
        for (const instance of [sim, immediate]) instance.exploration.discover(target.x, target.z);
        const teleport = await measure(() => sim.teleportAsync(target.x, target.z));
        immediate.teleport(target.x, target.z); equivalent();
        assert.equal(sim.getSnapshot().player.x, target.x);
        assert.equal(teleport.yields, 81);
        return { startup, ticks, boundaries, teleport, teleportTarget: target,
            tickWall: summary(ticks.map(t => t.wallMs)), tickMaxSlice: summary(ticks.map(t => t.maxSliceMs)),
            equivalentTicks: 600, exactCheckpoints: 12, includesRandomAndEntityArrays: true };
    } finally { sim?.dispose(); immediate?.dispose(); pool.dispose(); channel.port1.close(); channel.port2.close(); }
}

const scenarios = {};
for (const automatic of [false, true]) {
    await round(automatic);
    const rounds = [];
    for (let index = 0; index < 5; index++) { global.gc(); rounds.push(await round(automatic)); }
    scenarios[automatic ? "autoCombat" : "terrain"] = rounds;
}
writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, platform: platform(), cpu: cpus()[0].model,
    source: { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
        runtimeSha256: createHash("sha256").update(code).digest("hex") },
    scope: "Node MessageChannel event-loop tasks, one warmup then five rounds. Slice timers are diagnostic instrumentation, not browser FPS. Zero query lanes. Startup includes construction; terrain validation of the teleport target is outside timing. Health restored before travel ticks. Immediate reference/assertions are outside measured operations. Waiting remains in wall time.",
    scenarios }, null, 2) + "\n");
console.log(`Wrote ${output}`);
