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
    export { CombatWorld, Faction, ActorAction } from './apps/survivor/src/core/CombatWorld';
    export { PlayerAutoCombat } from './apps/survivor/src/core/PlayerAutoCombat';
    export { EnemyKind } from './apps/survivor/src/core/EnemyDefinitions';
    export { deriveStats } from './apps/survivor/src/core/CombatStats';
    export { sumEquipment, createStarterEquipment, generateEquipment } from './apps/survivor/src/core/Equipment';
    export { createOrb, ORB_TYPES } from './apps/survivor/src/core/Orbs';
    export { RARITIES, BASE_LOOT_PROFILE } from './apps/survivor/src/core/Loot';
    export { EMPTY_RECYCLING } from './apps/survivor/src/core/Recycling';
    export { DeterministicRandom } from './apps/survivor/src/core/DeterministicRandom';
    export { planAutomaticLoadout } from './apps/survivor/src/core/AutomaticLoadout';
    export { EnemyBehavior } from './apps/survivor/src/core/EnemyBehavior';
    export { RegionalWorld } from './apps/survivor/src/core/RegionalWorld';
    export { advanceProjectiles, moveEnemies, advanceEnemyActions } from './apps/survivor/src/core/CombatSystems';
    export { ticksForSeconds, GAME_CONFIG, MAX_ENEMIES } from './apps/survivor/src/core/GameConfig';
    export { ProceduralCombatTerrain } from './apps/survivor/src/adapters/ProceduralCombatTerrain';
`, resolveDir: root }, bundle: true, write: false, platform: "node", format: "esm" });
const current = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const baseline = baselinePath ? await import(pathToFileURL(baselinePath).href) : undefined;

function travel(runtime) {
    const simulation = new runtime.CombatSimulation("forward-pressure");
    const input = { x: 1, z: 0, active: true };
    const ticks = runtime.ticksForSeconds(24);
    const started = performance.now();
    // This scenario measures regional residency and full hit settlement, not survival with starter gear.
    // Restore health between ticks so stronger outer-region enemies cannot turn later samples into no-ops.
    for (let tick = 0; tick < ticks; tick++) { simulation.health = simulation.stats.maxHealth; simulation.step(input); }
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
    for (let index = 0; index < current.MAX_ENEMIES; index++) {
        const angle = index * Math.PI * 2 / current.MAX_ENEMIES;
        const slot = entities.spawnEnemy({ x: Math.sin(angle) * 8, z: Math.cos(angle) * 8, kind: index % 6,
            level: 1, elite: false, boss: false, region }, home);
        entities.vitals.health[slot] *= .4;
    }
    // Separated misses exercise broad-phase rejection at maximum resident population.
    for (let index = 0; index < 128; index++) entities.spawnProjectile(entities.world.ids[entities.player], Faction.Player, 100, 100, .01, 0, 1, 1000);
    const behavior = new EnemyBehavior(entities, regions), ticks = 300;
    const discardEvents = () => {};
    const started = performance.now();
    for (let tick = 1; tick <= ticks; tick++) {
        entities.status.advance(tick);
        advanceProjectiles(entities); behavior.update(tick); moveEnemies(entities, tick); advanceEnemyActions(entities, tick);
        entities.impacts.count = 0; entities.events.drain(discardEvents);
    }
    const elapsed = performance.now() - started;
    assert.equal(entities.enemies.count, current.MAX_ENEMIES); assert.equal(entities.projectiles.count, 128);
    return { msPerTick: elapsed / ticks, ticks, enemies: current.MAX_ENEMIES, projectiles: 128 };
}

function measure(run, budgetMs, unit = "Tick") {
    run();
    const samples = [];
    let workload;
    for (let i = 0; i < 5; i++) { globalThis.gc?.(); workload = run(); samples.push(workload[`msPer${unit}`]); }
    const median = [...samples].sort((a, b) => a - b)[2];
    return { [`samplesMsPer${unit}`]: samples, [`medianMsPer${unit}`]: median, [`budgetMsPer${unit}`]: budgetMs, workload };
}

function terrainCombat(automatic = false) {
    const terrain = new current.ProceduralCombatTerrain("rift-ember-1");
    const initializing = performance.now();
    const simulation = new current.CombatSimulation("rift-ember-1", { x: 0, z: 0 }, undefined, terrain);
    const coldStartMs = performance.now() - initializing;
    if (automatic) simulation.toggleAutoCombat();
    const ticks = 600, started = performance.now();
    const input = automatic ? { x: 0, z: 0, active: false } : { x: 1, z: .4, active: true };
    // Automatic equipment changes recompute maximum health; keep this CPU workload alive across upgrades.
    for (let tick = 0; tick < ticks; tick++) { simulation.health = simulation.stats.maxHealth; simulation.step(input); }
    const elapsed = performance.now() - started;
    assert.equal(simulation.tick, ticks);
    const player = simulation.getSnapshot().player;
    assert.ok(terrain.isClear(player.x, player.z, .3));
    if (automatic) assert.ok(Math.hypot(player.x, player.z) > 1, "Automatic terrain workload must actually move the player");
    const chunks = terrain.cachedChunks; simulation.dispose();
    return { msPerTick: elapsed / ticks, coldStartMs, ticks, chunks };
}

function autoAvoidance() {
    const terrain = new current.ProceduralCombatTerrain("rift-ember-1"), entities = new current.CombatWorld(0, 0, terrain);
    const region = new current.RegionalWorld("avoidance-budget", { x: 0, z: 0 }).regionAt(0, 0);
    const stats = current.deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, current.sumEquipment({}));
    entities.vitals.health[entities.player] = stats.maxHealth;
    for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4;
        const slot = entities.spawnEnemy({ x: Math.sin(angle) * 5, z: Math.cos(angle) * 5, kind: current.EnemyKind.StormOracle,
            level: 1, elite: true, boss: true, region }, { resident: true });
        entities.enemy.active[slot] = 1; entities.position.heading[slot] = angle + Math.PI;
        entities.action.kind[slot] = current.ActorAction.Storm; entities.action.variant[slot] = 5;
        entities.action.hitAt[slot] = 60; entities.action.endsAt[slot] = 360;
    }
    for (let index = 0; index < 64; index++) {
        const angle = index * Math.PI / 32;
        entities.spawnProjectile(0, current.Faction.Enemy, Math.sin(angle) * 2, Math.cos(angle) * 2,
            -Math.sin(angle) * 4.5, -Math.cos(angle) * 4.5, 1, 2, { turnRate: index % 2 ? .65 : -.65 });
    }
    const chests = { count: 0, x: new Float64Array(0), z: new Float64Array(0), tiers: new Uint8Array(0) };
    const controller = new current.PlayerAutoCombat(entities, chests, () => {}), timings = [];
    const started = performance.now();
    // Repeated identical worst-capacity decisions; these timings are per decision, not amortized ticks.
    for (let index = 0; index < 120; index++) {
        controller.setEnabled(true);
        const before = performance.now(); controller.update({ x: 0, z: 0, active: false }, 1, stats);
        timings.push(performance.now() - before);
        assert.equal(controller.activity, "evade");
    }
    const elapsed = performance.now() - started; terrain.dispose(); timings.sort((a, b) => a - b);
    return { msPerDecision: elapsed / 120, decisions: 120, enemies: 8, liveProjectiles: 64,
        p95DecisionMs: timings[Math.floor(timings.length * .95)], maxDecisionMs: timings.at(-1) };
}

function autoLoadout() {
    const random = new current.DeterministicRandom("loadout-budget");
    const inventory = Array.from({ length: 80 }, (_, index) => current.generateEquipment(random, index + 2, 50 + index, current.BASE_LOOT_PROFILE));
    for (let index = 0; index < 48; index++) inventory.push(current.createOrb(index + 100, current.RARITIES[Math.floor(index / 4) % 6], current.ORB_TYPES[index % 4]));
    const input = { inventory, equipment: { weapon: current.createStarterEquipment() },
        orbs: Array.from({ length: 6 }, (_, index) => current.createOrb(index + 200, "common", current.ORB_TYPES[index % 4])),
        level: 200, attributes: { might: 5, vitality: 5, agility: 5, spirit: 5 }, recycling: { ...current.EMPTY_RECYCLING, orb: "magic" } };
    const incoming = [current.generateEquipment(random, 300, 200, current.BASE_LOOT_PROFILE, "rainbow"), current.createOrb(301, "rainbow", "harmony")];
    const timings = [], started = performance.now();
    for (let index = 0; index < 120; index++) {
        const before = performance.now(), plan = current.planAutomaticLoadout(input, incoming);
        timings.push(performance.now() - before);
        assert.ok(plan.ok && plan.equipmentChanges > 0 && plan.orbChanges > 0, "Loadout workload must actually replace equipment and orbs");
    }
    const elapsed = performance.now() - started; timings.sort((a, b) => a - b);
    return { msPerDecision: elapsed / 120, decisions: 120, equipment: 80, orbs: 48, unlockedSockets: 6,
        p95DecisionMs: timings[Math.floor(timings.length * .95)], maxDecisionMs: timings.at(-1) };
}

const results = { travel: measure(() => travel(current), .5), crowded: measure(crowded, 3), terrain: measure(terrainCombat, 3),
    autoCombat: measure(() => terrainCombat(true), 3), autoAvoidance: measure(autoAvoidance, 3, "Decision"), autoLoadout: measure(autoLoadout, 3, "Decision") };
if (baseline) results.baselineTravel = measure(() => travel(baseline), .5);
console.log(JSON.stringify({ context: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model,
    simulationHz: current.GAME_CONFIG.timing.simulationHz, activeAiHz: current.GAME_CONFIG.timing.activeAiHz,
    gc: Boolean(globalThis.gc), timing: "one warmup, five samples, simulation only; travel/terrain restore health between ticks while retaining hit settlement; no browser/GPU claim" }, results }, null, 2));
if (args.includes("--check")) {
    assert.ok(globalThis.gc, "Use node --expose-gc for benchmark gates");
    for (const result of [results.travel, results.crowded, results.terrain, results.autoCombat]) assert.ok(result.medianMsPerTick <= result.budgetMsPerTick, "Survivor simulation exceeded its CPU budget");
    assert.ok(results.autoAvoidance.medianMsPerDecision <= results.autoAvoidance.budgetMsPerDecision, "Automatic avoidance exceeded its decision CPU budget");
    assert.ok(results.autoLoadout.medianMsPerDecision <= results.autoLoadout.budgetMsPerDecision, "Automatic loadout exceeded its decision CPU budget");
}
