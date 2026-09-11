import { build } from "esbuild";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--check" && !arg.startsWith("--baseline="))) throw new Error("Usage: benchmark-survivor.mjs [--check] [--baseline=module]");
const baselinePath = args.find(arg => arg.startsWith("--baseline="))?.slice("--baseline=".length);
const bundle = await build({ stdin: { contents: `
    export { CombatSimulation } from './apps/survivor/src/core/CombatSimulation';
    export { CombatWorld, Faction } from './apps/survivor/src/core/CombatWorld';
    export { EnemyBehavior } from './apps/survivor/src/core/EnemyBehavior';
    export { RegionalWorld } from './apps/survivor/src/core/RegionalWorld';
    export { advanceProjectiles, moveEnemies, advanceEnemyActions } from './apps/survivor/src/core/CombatSystems';
    export { ticksForSeconds, GAME_CONFIG } from './apps/survivor/src/core/GameConfig';
`, resolveDir: root }, bundle: true, write: false, platform: "node", format: "esm" });
const current = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const baseline = baselinePath ? await import(pathToFileURL(baselinePath).href) : undefined;

function travel(runtime) {
    const simulation = new runtime.CombatSimulation("forward-pressure");
    const input = { x: 1, z: 0, active: true };
    const ticks = runtime.ticksForSeconds(24);
    const started = performance.now();
    for (let tick = 0; tick < ticks; tick++) simulation.step(input);
    const elapsed = performance.now() - started;
    assert.equal(simulation.tick, ticks, "Travel must measure live simulation, not a game-over early return");
    const state = simulation.getSnapshot();
    simulation.dispose();
    return { msPerTick: elapsed / ticks, ticks, enemies: state.livingEnemies, kills: state.kills };
}

function crowded() {
    const { CombatWorld, RegionalWorld, EnemyBehavior, Faction, advanceProjectiles, moveEnemies, advanceEnemyActions } = current;
    const entities = new CombatWorld(0, 0), regions = new RegionalWorld("crowd", { x: 0, z: 0 });
    regions.synchronize(0, 0);
    const home = regions.chunks.get("0,0"), region = regions.regionAt(0, 0);
    for (let index = 0; index < 640; index++) {
        const angle = index * Math.PI * 2 / 640;
        const slot = entities.spawnEnemy({ x: Math.sin(angle) * 8, z: Math.cos(angle) * 8, kind: index % 6,
            level: 1, elite: false, boss: false, region }, home);
        entities.vitals.health[slot] *= .4;
    }
    // Separated misses exercise broad-phase rejection at maximum resident population.
    for (let index = 0; index < 128; index++) entities.spawnProjectile(entities.world.ids[entities.player], Faction.Player, 100, 100, .01, 0, 1, 1000);
    const behavior = new EnemyBehavior(entities, regions), ticks = 300;
    const started = performance.now();
    for (let tick = 1; tick <= ticks; tick++) {
        advanceProjectiles(entities); behavior.update(tick); moveEnemies(entities, tick); advanceEnemyActions(entities, tick);
        entities.impacts.count = 0;
    }
    const elapsed = performance.now() - started;
    assert.equal(entities.enemies.count, 640); assert.equal(entities.projectiles.count, 128);
    return { msPerTick: elapsed / ticks, ticks, enemies: 640, projectiles: 128 };
}

function measure(run, budgetMsPerTick) {
    run();
    const samples = [];
    let workload;
    for (let i = 0; i < 5; i++) { globalThis.gc?.(); workload = run(); samples.push(workload.msPerTick); }
    const median = [...samples].sort((a, b) => a - b)[2];
    return { samplesMsPerTick: samples, medianMsPerTick: median, budgetMsPerTick, workload };
}

const results = { travel: measure(() => travel(current), .5), crowded: measure(crowded, 3) };
if (baseline) results.baselineTravel = measure(() => travel(baseline), .5);
console.log(JSON.stringify({ context: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model,
    simulationHz: current.GAME_CONFIG.timing.simulationHz, activeAiHz: current.GAME_CONFIG.timing.activeAiHz,
    gc: Boolean(globalThis.gc), timing: "one warmup, five samples, simulation only; no browser/GPU claim" }, results }, null, 2));
if (args.includes("--check")) {
    assert.ok(globalThis.gc, "Use node --expose-gc for benchmark gates");
    for (const result of [results.travel, results.crowded]) assert.ok(result.medianMsPerTick <= result.budgetMsPerTick, "Survivor simulation exceeded its CPU budget");
}
