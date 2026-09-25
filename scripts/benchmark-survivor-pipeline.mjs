import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform } from "node:os";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = process.argv[2];
const replayOnly = process.argv[3] === "--replay-only";
if (!baseline || !/^[a-f0-9]{7,40}$/.test(baseline) || process.argv.length !== (replayOnly ? 4 : 3)) throw new Error("Usage: node --expose-gc scripts/benchmark-survivor-pipeline.mjs <baseline-commit> [--replay-only]");
const contents = `
export { EntityWorld } from './apps/survivor/src/core/EntityWorld';
export { StatusSystem, StatusKind } from './apps/survivor/src/core/StatusSystem';
export { BurnSystem } from './apps/survivor/src/core/BurnSystem';
export { CombatSimulation } from './apps/survivor/src/core/CombatSimulation';
export { ProceduralCombatTerrain } from './apps/survivor/src/adapters/ProceduralCombatTerrain';
export { shareSnapshot } from './apps/survivor/src/app/ShareSnapshot';
export { RenderFrame } from './apps/survivor/src/worker/RenderFrame';
export { ENTITY_CAPACITY, MAX_ENEMIES } from './apps/survivor/src/core/GameConfig';`;
async function runtime(ref) {
    const bundle = await build({ stdin: { contents, resolveDir: root }, bundle: true, write: false, platform: "node", format: "esm",
        plugins: ref ? [{ name: "committed-source", setup(builder) {
            builder.onLoad({ filter: /\.ts$/ }, ({ path }) => ({ contents: execFileSync("git", ["show", `${ref}:${relative(root, path).replaceAll("\\", "/")}`], { cwd: root, encoding: "utf8", maxBuffer: 8e6 }), loader: "ts" }));
        } }] : [] });
    return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + `\n//# sourceURL=survivor-pipeline-${ref ?? "current"}.mjs`).toString("base64")}`);
}
const runtimes = { baseline: await runtime(baseline), current: await runtime() };
const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { samplesMs: values, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1) };
};
function statusExpiry(r, population) {
    const world = new r.EntityWorld(r.ENTITY_CAPACITY), status = new r.StatusSystem(world), K = r.StatusKind;
    const slots = Array.from({ length: population }, () => world.create(1)), values = [];
    for (let cycle = 0; cycle < 80; cycle++) {
        const tick = cycle * 600;
        for (const slot of slots) {
            const target = world.ids[slot];
            for (let source = 1; source <= 4; source++) {
                status.apply(K.Slow, source, target, .1 * source, tick + 120, tick);
                status.apply(K.Chill, source, target, source, tick + 120, tick);
                status.apply(K.Protection, source, target, .1 * source, tick + 120, tick);
            }
            status.apply(K.Frozen, 1, target, 1, tick + 120, tick);
            status.apply(K.Conductive, 1, target, 1, tick + 120, tick);
            status.apply(K.StaticGuard, 1, target, .05, tick + 120, tick);
        }
        const started = performance.now(); status.advance(tick + 120); const elapsed = performance.now() - started;
        if (cycle >= 40) values.push(elapsed);
        for (const slot of slots) {
            assert.equal(status.slowScale[slot], 1); assert.equal(status.frozenUntil[slot], 0);
            assert.equal(status.deadline(K.ControlResistance, slot), tick + 480);
        }
        status.advance(tick + 480);
    }
    return { population, expiringSourcesPerTarget: 15, ...summarize(values) };
}
function burns(r, population) {
    const world = new r.EntityWorld(r.ENTITY_CAPACITY), burns = new r.BurnSystem(world);
    const slots = Array.from({ length: population }, () => world.create(1)), values = [];
    let hits = 0; const hit = () => { hits++; };
    const warmup = population === 1 ? 1000 : 20, cycles = warmup + 20;
    for (let cycle = 0; cycle < cycles; cycle++) {
        const tick = cycle * 600;
        for (const slot of slots) for (let source = 1; source <= 4; source++) for (let layer = 0; layer < 8; layer++) burns.apply(source, world.ids[slot], 1, tick, 480, 8);
        for (let at = 60; at <= 480; at += 60) {
            const started = performance.now(); burns.advance(tick + at, hit); const elapsed = performance.now() - started;
            if (cycle >= warmup) values.push(elapsed);
        }
        for (const slot of slots) assert.equal(burns.stacks[slot], 0);
    }
    assert.equal(hits, population * 4 * 8 * cycles);
    return { population, layersPerTarget: 32, warmupCycles: warmup, measuredEvents: values.length, ...summarize(values) };
}
function snapshots(r, changed) {
    const sim = new r.CombatSimulation("snapshot-pipeline"), base = sim.getSnapshot(), item = base.player.equipment.weapon;
    const previous = { ...base, player: { ...base.player, inventory: Array.from({ length: 80 }, (_, i) => ({ ...structuredClone(item), id: i + 100 })) } };
    const next = structuredClone(previous);
    if (changed) next.player.inventory[79].locked = !next.player.inventory[79].locked;
    const copies = Array.from({ length: 64 }, () => structuredClone(next)), values = [];
    for (let cycle = 0; cycle < 9; cycle++) {
        const started = performance.now();
        for (let i = 0; i < 1000; i++) r.shareSnapshot(previous, copies[i % copies.length]);
        if (cycle >= 2) values.push((performance.now() - started) / 1000);
    }
    const shared = r.shareSnapshot(previous, copies[0]);
    assert.deepEqual(shared, next); assert.deepEqual(copies[0], next);
    assert.equal(shared.player.inventory[0], previous.player.inventory[0]);
    assert.equal(shared.player.inventory === previous.player.inventory, !changed);
    sim.dispose(); return { inventory: 80, changedLastItem: changed, cloneExcluded: true, ...summarize(values) };
}
function render(r) {
    const sim = new r.CombatSimulation("render-pipeline"), source = sim.getRenderState();
    let frame = new r.RenderFrame(); const write = [], bind = [], transfer = [];
    for (let cycle = 0; cycle < 8; cycle++) {
        let started = performance.now();
        for (let i = 0; i < 1000; i++) frame.write(source);
        const writeMs = (performance.now() - started) / 1000; started = performance.now();
        for (let i = 0; i < 1000; i++) frame = new r.RenderFrame(frame.buffer);
        const bindMs = (performance.now() - started) / 1000; started = performance.now();
        for (let i = 0; i < 1000; i++) {
            const packet = frame.write(source), received = structuredClone(packet, { transfer: [packet.buffer] });
            assert.equal(packet.buffer.byteLength, 0);
            new r.RenderFrame(received.buffer).read(received);
            const recycled = structuredClone(received.buffer, { transfer: [received.buffer] });
            frame = new r.RenderFrame(recycled);
        }
        if (cycle >= 2) { write.push(writeMs); bind.push(bindMs); transfer.push((performance.now() - started) / 1000); }
    }
    // Isolate copy kernels using the exact component types/lengths, without changing the slot-indexed wire contract.
    const target = frame.read(frame.write(source)).entities, pairs = [];
    for (const name of ["position", "vitals", "enemy", "action", "projectile", "item", "status"]) for (const key of Object.keys(target[name])) pairs.push([target[name][key], source.entities[name][key]]);
    const copies = [];
    for (const population of [32, 256, 896]) {
        const slots = Uint32Array.from({ length: population }, (_, i) => Math.floor(i * r.ENTITY_CAPACITY / population));
        const full = [], sparse = [];
        for (let cycle = 0; cycle < 7; cycle++) {
            let started = performance.now(); for (let i = 0; i < 2000; i++) for (const [to, from] of pairs) to.set(from);
            const fullMs = (performance.now() - started) / 2000; started = performance.now();
            for (let i = 0; i < 2000; i++) for (const [to, from] of pairs) for (const slot of slots) to[slot] = from[slot];
            if (cycle >= 2) { full.push(fullMs); sparse.push((performance.now() - started) / 2000); }
        }
        copies.push({ population, full: summarize(full), sparse: summarize(sparse) });
    }
    sim.dispose(); return { bytes: r.RenderFrame.bytes, write: summarize(write), bind: summarize(bind), simulatedRoundtrip: summarize(transfer), copyKernels: copies };
}
const results = {};
if (!replayOnly) {
for (const [name, scenario] of Object.entries({ status896: r => statusExpiry(r, 896), status32: r => statusExpiry(r, 32), burn896: r => burns(r, 896), burn1: r => burns(r, 1), snapshotEqual: r => snapshots(r, false), snapshotChanged: r => snapshots(r, true) })) {
    results[name] = {};
    for (const [version, r] of Object.entries(runtimes)) { globalThis.gc?.(); results[name][version] = scenario(r); }
}
globalThis.gc?.();
results.render = render(runtimes.current);
}
// Compare independent builds, including RNG checkpoints, entity arrays and regional layouts.
const replay = [];
for (const scenario of ["open", "terrain", "automatic"]) {
    const seed = scenario === "open" ? "pipeline-replay" : "rift-ember-1";
    const ticks = scenario === "open" ? 1200 : 600;
    const simulations = Object.values(runtimes).map(r => new r.CombatSimulation(seed, { x: 0, z: 0 }, undefined,
        scenario === "open" ? undefined : new r.ProceduralCombatTerrain(seed)));
    if (scenario === "automatic") simulations.forEach(sim => sim.toggleAutoCombat());
    const capture = sim => ({ checkpoint: sim.checkpoint(), snapshot: sim.getSnapshot(),
        components: Object.fromEntries(["world", "position", "vitals", "enemy", "action", "projectile", "item", "status"].map(name =>
            [name, Object.fromEntries(Object.entries(sim.entities[name]).filter(([, value]) => ArrayBuffer.isView(value) || typeof value === "number"))])),
        chunks: [...sim.world.chunks.values()].map(c => ({ key: c.key, spawns: c.spawns, spawned: c.spawned, chest: c.chest,
            chestOpened: c.chestOpened, labels: c.navigation.labels, reached: c.navigation.reached })) });
    try {
        assert.deepEqual(capture(simulations[1]), capture(simulations[0]), `${scenario}: initial state differs`);
        for (let tick = 1; tick <= ticks; tick++) {
            for (const sim of simulations) {
                sim.health = sim.stats.maxHealth;
                sim.step(scenario === "automatic" ? { x: 0, z: 0, active: false } : { x: 1, z: scenario === "open" ? 0 : .4, active: true });
            }
            if (tick % 60 === 0) assert.deepEqual(capture(simulations[1]), capture(simulations[0]), `${scenario}: state differs at tick ${tick}`);
        }
        replay.push({ scenario, ticks, comparedEveryTicks: 60, checkpointSnapshotEntitiesAndLayoutEqual: true });
    } finally { simulations.forEach(sim => sim.dispose()); }
}
console.log(JSON.stringify({ capturedAt: new Date().toISOString(), baseline, environment: { cpu: cpus()[0].model, node: process.version, platform: platform() },
    scope: "Node CPU only; expiry setup and snapshot structured clone excluded; render roundtrip uses synchronous structuredClone, not browser scheduling or GPU; copy kernels do not compact the protocol.",
    replay, results }, null, 2));
