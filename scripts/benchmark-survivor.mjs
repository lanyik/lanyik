import { build } from "esbuild";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { BenchmarkProbe, latencyOverruns, summarizeLatencies, summarizeLatencyRounds } from "./lib/benchmark-latency.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--check" && arg !== "--profile" && !["--baseline=", "--runtime-ref=", "--scenarios=", "--output="].some(prefix => arg.startsWith(prefix)))) {
    throw new Error("Usage: benchmark-survivor.mjs [--check] [--baseline=module] [--runtime-ref=commit] [--scenarios=name,...] [--profile] [--output=file.json]");
}
for (const prefix of ["--baseline=", "--runtime-ref=", "--scenarios=", "--output="]) {
    const matches = args.filter(arg => arg.startsWith(prefix));
    if (matches.length > 1 || matches.some(arg => arg.length === prefix.length)) throw new Error(`Invalid ${prefix} argument`);
}
if (args.includes("--check")) assert.ok(globalThis.gc, "Use node --expose-gc for benchmark gates");
const baselinePath = args.find(arg => arg.startsWith("--baseline="))?.slice("--baseline=".length);
const runtimeRef = args.find(arg => arg.startsWith("--runtime-ref="))?.slice("--runtime-ref=".length);
if (runtimeRef && !/^[a-f0-9]{7,40}$/.test(runtimeRef)) throw new Error("--runtime-ref requires a commit hash");
const bundle = await build({ stdin: { contents: `
    export { CombatSimulation } from './apps/survivor/src/core/CombatSimulation';
    export { CombatWorld, Faction, ActorAction } from './apps/survivor/src/core/CombatWorld';
    export { FrostCasting } from './apps/survivor/src/core/FrostCasting';
    export { FireCasting } from './apps/survivor/src/core/FireCasting';
    export { LightningCasting } from './apps/survivor/src/core/LightningCasting';
    export { StarCasting } from './apps/survivor/src/core/StarCasting';
    export { compilePassiveEffects } from './apps/survivor/src/core/PassiveSkills';
    export { initialSkillRanks, nodeIndex } from './apps/survivor/src/core/SkillBuild';
    export { createConsumable } from './apps/survivor/src/core/InventoryItem';
    export { CombatResolution } from './apps/survivor/src/core/CombatResolution';
    export { CombatEventKind, EffectCause } from './apps/survivor/src/core/CombatEvents';
    export { StatusKind } from './apps/survivor/src/core/StatusSystem';
    export { skillValues, NO_SKILL_MODIFIERS } from './apps/survivor/src/core/Skills';
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
`, resolveDir: root }, bundle: true, write: false, platform: "node", format: "esm",
    plugins: runtimeRef ? [{ name: "committed-runtime", setup(builder) {
        builder.onLoad({ filter: /\.ts$/ }, ({ path }) => ({ contents: execFileSync("git", ["show", `${runtimeRef}:${relative(root, path).replaceAll("\\", "/")}`],
            { cwd: root, encoding: "utf8", maxBuffer: 8e6 }), loader: "ts" }));
    } }] : [] });
const current = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const baseline = baselinePath ? await import(pathToFileURL(baselinePath).href) : undefined;

function travel(runtime) {
    const simulation = new runtime.CombatSimulation("forward-pressure");
    const input = { x: 1, z: 0, active: true };
    const ticks = runtime.ticksForSeconds(24);
    const timings = new Float64Array(ticks);
    // This scenario measures regional residency and full hit settlement, not survival with starter gear.
    // Restore health between ticks so stronger outer-region enemies cannot turn later samples into no-ops.
    for (let tick = 0; tick < ticks; tick++) {
        simulation.health = simulation.stats.maxHealth;
        const started = performance.now(); simulation.step(input); timings[tick] = performance.now() - started;
    }
    assert.equal(simulation.tick, ticks, "Travel must measure live simulation, not a game-over early return");
    const state = simulation.getSnapshot();
    simulation.dispose();
    return { timings, ticks, enemies: state.livingEnemies, kills: state.kills };
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
    const timings = new Float64Array(ticks);
    for (let tick = 1; tick <= ticks; tick++) {
        const started = performance.now();
        entities.status.advance(tick);
        advanceProjectiles(entities); behavior.update(tick); moveEnemies(entities, tick); advanceEnemyActions(entities, tick);
        entities.impacts.count = 0; entities.events.drain(discardEvents);
        timings[tick - 1] = performance.now() - started;
    }
    assert.equal(entities.enemies.count, current.MAX_ENEMIES); assert.equal(entities.projectiles.count, 128);
    return { timings, ticks, enemies: current.MAX_ENEMIES, projectiles: 128 };
}

function iceEffects() {
    const e = new current.CombatWorld(0, 0), regions = new current.RegionalWorld("ice-budget", { x: 0, z: 0 });
    regions.synchronize(0, 0);
    const home = regions.chunks.get("0,0"), region = regions.regionAt(0, 0), source = e.world.ids[e.player];
    const stats = current.deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, current.sumEquipment({}));
    e.vitals.health[e.player] = stats.maxHealth;
    for (let i = 0; i < current.MAX_ENEMIES; i++) {
        const angle = i * Math.PI * 2 / current.MAX_ENEMIES;
        const slot = e.spawnEnemy({ x: Math.sin(angle) * 2, z: Math.cos(angle) * 2, kind: 0, level: 1, elite: false, boss: false, region }, home);
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1e6;
        // Four independently expiring sources and a synchronized hard-control expiry.
        for (let j = 0; j < 4; j++) e.status.apply(current.StatusKind.Slow, source + j, e.world.ids[slot], .1 + j * .1, 100 + j * 30, 0);
        e.status.apply(current.StatusKind.Frozen, source, e.world.ids[slot], 1, 120, 0);
    }
    const frost = new current.FrostCasting(e), resolution = new current.CombatResolution(e), random = new current.DeterministicRandom("ice-budget");
    for (const id of ["icestorm", "blizzard"]) frost.release(id, 0, stats, current.skillValues(id, 1, stats), 0, 0, 0, random);
    const ticks = 480, timings = new Float64Array(ticks); let hits = 0;
    const consume = () => {};
    const settle = () => { hits += e.impacts.count; resolution.resolve(tick, stats, random, false, consume); };
    let tick = 0;
    for (tick = 1; tick <= ticks; tick++) {
        const before = performance.now(); e.status.advance(tick); frost.advance(tick, random, settle);
        timings[tick - 1] = performance.now() - before;
    }
    assert.equal(hits, current.MAX_ENEMIES * 16); assert.equal(frost.ongoing, false); assert.equal(e.enemies.count, current.MAX_ENEMIES);
    return { timings, ticks, enemies: current.MAX_ENEMIES, initialStatusInstances: current.MAX_ENEMIES * 5, hits };
}

async function measure(run, budgetMs, unit = "Tick", profile = false) {
    run();
    const samples = [], rounds = [], all = [];
    const tickDeadlineMs = 1000 / current.GAME_CONFIG.timing.simulationHz;
    for (let i = 0; i < 5; i++) {
        globalThis.gc?.();
        let probe;
        try {
            const { timings, ...workload } = run(profile ? capacity => (probe = new BenchmarkProbe(capacity)) : undefined);
            assert.equal(timings.length, unit === "Tick" ? workload.ticks : workload.decisions);
            const latency = summarizeLatencies(timings, budgetMs);
            samples.push(latency.meanMs); all.push(timings);
            rounds.push({ round: i + 1, workload, latency, overTickDeadline: latencyOverruns(timings, tickDeadlineMs),
                ...(probe ? { profile: await probe.report(timings, budgetMs) } : {}) });
        } finally { probe?.dispose(); }
    }
    const median = [...samples].sort((a, b) => a - b)[2];
    // Pooled percentiles use all operations, not an average of five percentiles. Consecutive overruns remain per-round.
    return { unit, [`samplesMsPer${unit}`]: samples, [`medianMsPer${unit}`]: median, [`budgetMsPer${unit}`]: budgetMs,
        latency: summarizeLatencyRounds(all, budgetMs), overTickDeadline: summarizeLatencyRounds(all, tickDeadlineMs).overBudget, rounds };
}

function fireEffects(createProbe) {
    const e = new current.CombatWorld(0, 0), regions = new current.RegionalWorld("fire-budget", { x: 0, z: 0 });
    regions.synchronize(0, 0);
    const region = regions.regionAt(0, 0), home = regions.chunks.get("0,0"), source = e.world.ids[e.player];
    const stats = { ...current.deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, current.sumEquipment({})), accuracy: 2, lethalChance: 0 };
    e.vitals.health[e.player] = stats.maxHealth;
    for (let i = 0; i < current.MAX_ENEMIES; i++) {
        const slot = e.spawnEnemy({ x: 0, z: 2, kind: 0, level: 1, elite: false, boss: false, region }, home);
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1e6;
        for (let group = 0; group < 4; group++) for (let layer = 0; layer < 8; layer++) e.status.burns.apply(source + group, e.world.ids[slot], 1, 0, 480, 8);
    }
    const fire = new current.FireCasting(e), resolution = new current.CombatResolution(e), random = new current.DeterministicRandom("fire-budget");
    for (const id of ["firewall", "firedomain", "meteor"]) fire.release(id, 0, stats, current.skillValues(id, 1, stats), 0, 2, 0, random);
    const ticks = 1200, timings = new Float64Array(ticks), probe = createProbe?.(ticks);
    probe?.attach(e.status, "advance", "statusExpiry");
    probe?.attach(resolution, "advanceBurns", "burnSettlement");
    probe?.attach(fire, "advance", "fireAdvance");
    probe?.attach(resolution, "resolve", "directSettlement");
    probe?.attach(e.status.burns, "apply", "burnApply");
    let hits = 0, periodicHits = 0, tick = 0;
    const consume = (events, i) => { if (events.cause[i] === current.EffectCause.Burn && events.kind[i] === current.CombatEventKind.Damage) periodicHits++; };
    const settle = () => { hits += e.impacts.count; resolution.resolve(tick, stats, random, false, consume); };
    for (tick = 1; tick <= ticks; tick++) {
        const before = performance.now(); probe?.begin(tick - 1, before);
        e.status.advance(tick); resolution.advanceBurns(tick, stats, consume); fire.advance(tick, random, settle);
        const ended = performance.now(); timings[tick - 1] = ended - before; probe?.end(ended);
    }
    assert.equal(hits, current.MAX_ENEMIES * 21); assert.equal(fire.ongoing, false); assert.equal(e.enemies.count, current.MAX_ENEMIES);
    assert.ok(periodicHits >= current.MAX_ENEMIES * 35);
    assert.equal(e.status.burnStacks.some(Boolean), false);
    return { timings, ticks, enemies: current.MAX_ENEMIES, initialBurnLayers: current.MAX_ENEMIES * 32, hits, periodicHits };
}

function lightningEffects() {
    const e = new current.CombatWorld(0, 0), regions = new current.RegionalWorld("lightning-budget", { x: 0, z: 0 });
    const region = regions.regionAt(0, 0), source = e.world.ids[e.player];
    const stats = { ...current.deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, current.sumEquipment({})), accuracy: 2, lethalChance: 0, lifeExtraction: 0 };
    e.vitals.health[e.player] = stats.maxHealth;
    for (let i = 0; i < current.MAX_ENEMIES; i++) {
        const slot = e.spawnEnemy({ x: (i % 32 - 16) * .04, z: 2 + Math.floor(i / 32) * .04, kind: 0, level: 1, elite: false, boss: false, region }, { resident: true });
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1e6;
        e.status.apply(current.StatusKind.Conductive, source, e.world.ids[slot], 1, 480, 0);
    }
    const lightning = new current.LightningCasting(e), resolution = new current.CombatResolution(e), random = new current.DeterministicRandom("lightning-budget");
    const modifiers = { ...current.NO_SKILL_MODIFIERS, shape: 5, tempo: 5, conduction: 3 }, network = current.skillValues("tempest", 1, stats, modifiers);
    for (const id of ["thunderfield", "thunderstrike", "judgment"]) lightning.release(id, 0, stats, current.skillValues(id, 1, stats, modifiers), 0, 2, 0, random);
    let queries = 0, candidates = 0, hits = 0, tick = 0;
    const query = e.queryNearby.bind(e);
    e.queryNearby = (...args) => { const result = query(...args); queries++; candidates += result.count; return result; };
    const consume = () => {}, settle = () => { hits += e.impacts.count; resolution.resolve(tick, stats, random, false, consume); };
    const ticks = 1200, timings = new Float64Array(ticks);
    for (tick = 1; tick <= ticks; tick++) {
        const before = performance.now(); e.status.advance(tick); lightning.advance(tick, random, settle);
        if (tick <= 300 && tick % 30 === 1) { lightning.release("tempest", tick, stats, network, 0, 2, 0, random); settle(); }
        timings[tick - 1] = performance.now() - before;
    }
    assert.equal(hits, current.MAX_ENEMIES * 21 + 200); assert.equal(lightning.ongoing, false); assert.equal(e.enemies.count, current.MAX_ENEMIES);
    assert.equal(e.status.conductiveUntil.some(Boolean), false);
    return { timings, ticks, enemies: current.MAX_ENEMIES, initialConductive: current.MAX_ENEMIES, hits, networkCasts: 10, queries, candidates };
}

function terrainCombat(automatic = false, createProbe) {
    const terrain = new current.ProceduralCombatTerrain("rift-ember-1");
    const initializing = performance.now();
    const simulation = new current.CombatSimulation("rift-ember-1", { x: 0, z: 0 }, undefined, terrain);
    const coldStartMs = performance.now() - initializing;
    if (automatic) simulation.toggleAutoCombat();
    const ticks = 600, timings = new Float64Array(ticks), probe = createProbe?.(ticks);
    probe?.attach(simulation, "movePlayer", "playerMovement");
    probe?.attach(simulation.autoCombat, "update", "autoDecision");
    probe?.attach(simulation.world, "synchronize", "worldResidency");
    probe?.attach(simulation.world, "createChunk", "worldChunkConstruction");
    probe?.attach(simulation.world, "updateAccess", "encounterAccess");
    probe?.attach(simulation, "reconcileRegions", "reconcileRegions");
    probe?.attach(simulation, "spawnEnemies", "spawnEnemies");
    probe?.attach(simulation.behavior, "update", "enemyDecisions");
    probe?.attach(simulation, "finishStep", "finishStep");
    probe?.attach(terrain, "traceAttack", "terrainTrace");
    probe?.attach(terrain, "move", "terrainMove");
    const cacheBefore = terrain.cachedChunks, cacheGrowth = [];
    let cached = cacheBefore;
    const input = automatic ? { x: 0, z: 0, active: false } : { x: 1, z: .4, active: true };
    // Automatic equipment changes recompute maximum health; keep this CPU workload alive across upgrades.
    for (let tick = 0; tick < ticks; tick++) {
        simulation.health = simulation.stats.maxHealth;
        const started = performance.now(); probe?.begin(tick, started);
        simulation.step(input);
        const ended = performance.now(); timings[tick] = ended - started; probe?.end(ended);
        if (terrain.cachedChunks !== cached) { cacheGrowth.push({ sample: tick + 1, before: cached, after: terrain.cachedChunks }); cached = terrain.cachedChunks; }
    }
    assert.equal(simulation.tick, ticks);
    const player = simulation.getSnapshot().player;
    assert.ok(terrain.isClear(player.x, player.z, .3));
    if (automatic) assert.ok(Math.hypot(player.x, player.z) > 1, "Automatic terrain workload must actually move the player");
    const chunks = terrain.cachedChunks; simulation.dispose();
    return { timings, coldStartMs, ticks, chunks, cacheBefore, cacheGrowth };
}

function autoAvoidance(createProbe) {
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
    const controller = new current.PlayerAutoCombat(entities, chests, () => {}, undefined), decisions = 120, timings = new Float64Array(decisions);
    const probe = createProbe?.(decisions);
    probe?.attach(controller, "findEnemy", "findEnemy");
    probe?.attach(controller.threats, "sense", "threatSense");
    probe?.attach(controller, "chooseDodge", "chooseDodge");
    probe?.attach(controller.threats, "risk", "candidateRisk");
    probe?.attach(terrain, "traceAttack", "terrainTrace");
    probe?.attach(terrain, "move", "terrainMove");
    // Do not time every chunk-cache hit: millions of tiny probes would dominate the measured decision.
    const cacheBefore = terrain.cachedChunks, cacheGrowth = [];
    let cached = cacheBefore;
    // Repeated identical worst-capacity decisions; these timings are per decision, not amortized ticks.
    for (let index = 0; index < decisions; index++) {
        controller.setEnabled(true);
        const before = performance.now(); probe?.begin(index, before);
        controller.update({ x: 0, z: 0, active: false }, 1, stats);
        const ended = performance.now(); timings[index] = ended - before; probe?.end(ended);
        if (terrain.cachedChunks !== cached) { cacheGrowth.push({ sample: index + 1, before: cached, after: terrain.cachedChunks }); cached = terrain.cachedChunks; }
        assert.equal(controller.activity, "evade");
    }
    const cachedChunks = terrain.cachedChunks; terrain.dispose();
    return { timings, decisions, enemies: 8, liveProjectiles: 64, cachedChunks, cacheBefore, cacheGrowth };
}

function autoLoadout(passives = false) {
    const random = new current.DeterministicRandom("loadout-budget");
    const inventory = Array.from({ length: 80 }, (_, index) => current.generateEquipment(random, index + 2, 50 + index, current.BASE_LOOT_PROFILE));
    for (let index = 0; index < 48; index++) inventory.push(current.createOrb(index + 100, current.RARITIES[Math.floor(index / 4) % 6], current.ORB_TYPES[index % 4]));
    const input = { inventory, equipment: { weapon: current.createStarterEquipment() },
        orbs: Array.from({ length: 6 }, (_, index) => current.createOrb(index + 200, "common", current.ORB_TYPES[index % 4])),
        level: 200, attributes: { might: 5, vitality: 5, agility: 5, spirit: 5 }, recycling: { ...current.EMPTY_RECYCLING, orb: "magic" } };
    const incoming = [current.generateEquipment(random, 300, 200, current.BASE_LOOT_PROFILE, "rainbow"), current.createOrb(301, "rainbow", "harmony")];
    if (passives) {
        const effects = current.compilePassiveEffects(["fortune", "bloodpact", "thorns"], () => 10);
        input.passiveBonuses = effects.bonuses; input.passiveFind = effects.find;
    }
    const timings = new Float64Array(120);
    for (let index = 0; index < 120; index++) {
        const before = performance.now(), plan = current.planAutomaticLoadout(input, incoming);
        timings[index] = performance.now() - before;
        assert.ok(plan.ok && plan.equipmentChanges > 0 && plan.orbChanges > 0, "Loadout workload must actually replace equipment and orbs");
    }
    return { timings, decisions: 120, equipment: 80, orbs: 48, unlockedSockets: 6, passives };
}

function passivePickup() {
    const sim = new current.CombatSimulation("passive-pickup", { x: 0, z: 0 }, undefined, undefined, "homestead"), cp = sim.checkpoint();
    const ranks = current.initialSkillRanks(); ranks[current.nodeIndex("passive.magnet")] = 1;
    const inventory = Array.from({ length: 80 }, (_, i) => ({ ...current.createStarterEquipment(), id: i + 2 }));
    sim.restore({ ...cp, nextItemId: 1000, player: { ...cp.player, level: 150, inventory }, skills: { ...cp.skills, ranks, points: 148, passives: ["magnet", null, null] } });
    const e = sim.entities, timings = new Float64Array(120); let nextId = 1000, pickups = 0;
    for (let i = 0; i < 32; i++) { const item = { ...current.createStarterEquipment(), id: nextId++ }; sim.rewards.groundItems.set(item.id, item); e.spawnLoot(item, 100, i); }
    for (let pulse = 0; pulse < 120; pulse++) {
        while (e.loot.count < current.GAME_CONFIG.combat.maxGroundEquipment) {
            const item = current.createConsumable(nextId++, "common", "health"); sim.rewards.groundItems.set(item.id, item); e.spawnLoot(item, 100, 0);
        }
        while (e.experience.count < current.GAME_CONFIG.combat.maxExperienceOrbs) e.spawnExperience(100, 0, 1);
        sim.tickValue += current.GAME_CONFIG.timing.simulationHz / current.GAME_CONFIG.skills.passivePickupHz;
        const before = performance.now(); sim.advanceExperience(); sim.collectEquipment(); timings[pulse] = performance.now() - before;
        assert.equal(e.experience.count, 752, "Each pulse collects exactly 16 distant XP orbs");
        assert.ok(e.loot.count >= 48, "Pickup attempts remain bounded even when the equipment bag is full");
        pickups += 64 - e.loot.count;
    }
    assert.ok(pickups > 0, "Full equipment category cannot starve distant potions"); sim.dispose();
    return { timings, decisions: 120, groundItems: 64, experienceOrbs: 768, fullEquipmentBag: 80, pickups };
}

function starEffects() {
    const e = new current.CombatWorld(0, 0), region = new current.RegionalWorld("star-budget", { x: 0, z: 0 }).regionAt(0, 0);
    const stats = { ...current.deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, current.sumEquipment({})), accuracy: 2, lethalChance: 0, lifeExtraction: 0, lifesteal: 0 };
    e.vitals.health[e.player] = e.vitals.maxHealth[e.player] = stats.maxHealth;
    for (let i = 0; i < current.MAX_ENEMIES; i++) {
        const angle = i * Math.PI * 2 / current.MAX_ENEMIES;
        const slot = e.spawnEnemy({ x: Math.sin(angle) * 2.5, z: Math.cos(angle) * 2.5, kind: 0, level: 1, elite: false, boss: false, region }, { resident: true });
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1e6;
    }
    const stars = new current.StarCasting(e), resolution = new current.CombatResolution(e), random = new current.DeterministicRandom("star-budget");
    let hits = 0;
    const consume = (events, i) => { if (events.kind[i] === current.CombatEventKind.Damage) hits++; };
    const settle = tick => resolution.resolve(tick, stats, random, false, consume);
    const ticks = current.ticksForSeconds(8), timings = new Float64Array(ticks);
    stars.release("starbolt", 0, stats, current.skillValues("starbolt", 1, stats, { ...current.NO_SKILL_MODIFIERS, shape: 5 }), 0, random); settle(0);
    assert.equal(e.status.starEnergy[e.player], 1);
    stars.release("infusion", 0, stats, current.skillValues("infusion", 1, stats), 0, random);
    const amplified = { ...stats, damageIncrease: (1 + stats.damageIncrease) * (1 + e.status.consumeEmpowerment(e.player, 0)) - 1 };
    stars.release("blades", 0, amplified, current.skillValues("blades", 1, stats), 0, random);
    stars.release("bastion", 0, stats, current.skillValues("bastion", 1, stats), 0, random);
    for (let tick = 1; tick <= ticks; tick++) {
        const before = performance.now(); e.status.advance(tick); stars.advance(tick, random, () => settle(tick));
        timings[tick - 1] = performance.now() - before;
    }
    assert.equal(hits, 6 + current.MAX_ENEMIES * 16); assert.equal(stars.ongoing, false);
    assert.equal(e.status.save(e.player, ticks).length, 0);
    for (let i = 0; i < e.enemies.count; i++) assert.equal(e.status.weakenedUntil[e.enemies.slots[i]], 0);
    return { timings, ticks, enemies: e.enemies.count, directHits: hits };
}

function autoSearch() {
    const entities = new current.CombatWorld(0, 0), regions = new current.RegionalWorld("wide-search-budget", { x: 0, z: 0 });
    const stats = current.deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, current.sumEquipment({}));
    entities.vitals.health[entities.player] = stats.maxHealth;
    for (let i = 0; i < current.MAX_ENEMIES; i++) {
        const angle = i * Math.PI * 2 / current.MAX_ENEMIES, x = Math.sin(angle) * 40, z = Math.cos(angle) * 40;
        entities.spawnEnemy({ x, z, kind: current.EnemyKind.Grunt, level: 1, elite: false, boss: false, region: regions.regionAt(x, z) }, { resident: true });
    }
    const controller = new current.PlayerAutoCombat(entities, { count: 0, x: new Float64Array(0), z: new Float64Array(0), tiers: new Uint8Array(0) }, () => {}, regions);
    const timings = new Float64Array(120);
    // Force reacquisition every sample, including both empty inner rings and the full 896-actor outer ring.
    for (let i = 0; i < 120; i++) {
        controller.setEnabled(true); const before = performance.now();
        const movement = controller.update({ x: 0, z: 0, active: false }, 1, stats);
        timings[i] = performance.now() - before; assert.ok(movement.active); assert.equal(controller.activity, "seek");
    }
    return { timings, decisions: 120, enemies: current.MAX_ENEMIES, searchRadius: 48 };
}

const scenarios = {
    travel: [() => travel(current), .5, "Tick"], crowded: [crowded, 3, "Tick"], iceEffects: [iceEffects, 3, "Tick"],
    fireEffects: [fireEffects, 3, "Tick"], lightningEffects: [lightningEffects, 3, "Tick"], starEffects: [starEffects, 3, "Tick"],
    terrain: [probe => terrainCombat(false, probe), 3, "Tick"], autoCombat: [probe => terrainCombat(true, probe), 3, "Tick"],
    autoAvoidance: [autoAvoidance, 3, "Decision"], autoSearch: [autoSearch, 3, "Decision"], autoLoadout: [() => autoLoadout(), 3, "Decision"],
    passiveLoadout: [() => autoLoadout(true), 3, "Decision"], passivePickup: [passivePickup, 1, "Decision"]
};
const selected = args.find(arg => arg.startsWith("--scenarios="))?.slice("--scenarios=".length).split(",") ?? Object.keys(scenarios);
if (selected.some(name => !Object.hasOwn(scenarios, name)) || new Set(selected).size !== selected.length) throw new Error("Unknown or repeated benchmark scenario");
if (baseline && !selected.includes("travel")) throw new Error("--baseline requires the travel scenario");
const profileNames = selected.filter(name => ["fireEffects", "autoAvoidance", "terrain", "autoCombat"].includes(name));
if (args.includes("--profile") && !profileNames.length) throw new Error("--profile requires fireEffects, autoAvoidance, terrain or autoCombat");
const results = {}, profiles = {};
for (const name of selected) results[name] = await measure(...scenarios[name]);
if (baseline) results.baselineTravel = await measure(() => travel(baseline), .5);
// All ordinary timings finish before replacing any instance methods for diagnosis.
if (args.includes("--profile")) for (const name of profileNames) {
    const profile = await measure(...scenarios[name], true);
    for (let i = 0; i < profile.rounds.length; i++) {
        const expected = { ...results[name].rounds[i].workload }, actual = { ...profile.rounds[i].workload };
        delete expected.coldStartMs; delete actual.coldStartMs;
        assert.deepEqual(actual, expected, `${name}: profiling changed workload counters`);
    }
    profiles[name] = { ...profile, workloadCountersMatch: true };
}
const failures = selected.filter(name => {
    const result = results[name];
    return result[`medianMsPer${result.unit}`] > result[`budgetMsPer${result.unit}`];
});
const report = { schemaVersion: 2, capturedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    runtimeSource: runtimeRef ? { commit: execFileSync("git", ["rev-parse", runtimeRef], { cwd: root, encoding: "utf8" }).trim() } : { worktree: true },
    sourceHashes: Object.fromEntries(["scripts/benchmark-survivor.mjs", "scripts/lib/benchmark-latency.mjs"].map(path =>
        [path, createHash("sha256").update(readFileSync(new URL("../" + path, import.meta.url))).digest("hex")])),
    runtimeBundleHash: createHash("sha256").update(bundle.outputFiles[0].text).digest("hex"),
    context: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model,
        simulationHz: current.GAME_CONFIG.timing.simulationHz, activeAiHz: current.GAME_CONFIG.timing.activeAiHz, gc: Boolean(globalThis.gc),
        timing: "one warmup, five fresh fixtures; operation-only timings exclude setup, resets, assertions and report allocation; cold fixture operations remain included; no browser/GPU claim",
        percentiles: "nearest rank; pooled from all operations, with original per-round sample ordinals retained",
        thresholds: "overBudget observes the existing scenario mean budget per operation; overTickDeadline observes 1000/simulationHz. Neither is a new tail gate.",
        scopes: "travel/terrain replenish health; crowded discards hits; fire starts synchronized full-capacity burn layers, then includes idle ticks; avoidance repeats the same decision with a fresh terrain cache per round",
        profiling: "Separate repeated fixtures; inclusive/self synchronous method timing and GC overlap add overhead and are not throughput or speedup evidence" },
    results, profiles, gates: { checked: args.includes("--check"), failures } };
const json = JSON.stringify(report, null, 2), output = args.find(arg => arg.startsWith("--output="))?.slice("--output=".length);
if (output) { writeFileSync(output, json + "\n"); console.log(`Wrote ${output}`); }
else console.log(json);
if (args.includes("--check")) assert.deepEqual(failures, [], "Survivor simulation exceeded its CPU budget");
