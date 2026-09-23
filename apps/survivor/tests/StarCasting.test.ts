import { afterEach, expect, test, vi } from "vitest";
import { CombatWorld } from "../src/core/CombatWorld";
import { CombatResolution } from "../src/core/CombatResolution";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { StarCasting } from "../src/core/StarCasting";
import { SkillSystem } from "../src/core/SkillSystem";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { deriveStats } from "../src/core/CombatStats";
import { sumEquipment } from "../src/core/Equipment";
import { NO_SKILL_MODIFIERS, STAR_SKILLS, skillValues } from "../src/core/Skills";
import { StatusKind as K, ControlProfile } from "../src/core/StatusSystem";
import { EffectKind } from "../src/core/CombatEffects";
import { EffectCause } from "../src/core/CombatEvents";
import { GAME_CONFIG, MAX_ENEMIES, ticksForSeconds } from "../src/core/GameConfig";
import { SKILL_NODES, initialSkillRanks, investedPoints, nodeIndex, validateSkillRanks } from "../src/core/SkillBuild";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import { RenderFrame } from "../src/worker/RenderFrame";

afterEach(() => vi.restoreAllMocks());
function ranks() {
    const result = initialSkillRanks();
    for (const [id, value] of Object.entries({ starbolt: 10, "starbolt.power": 5, "starbolt.shape": 5, "starbolt.tempo": 5,
        infusion: 5, blades: 5, ward: 5, shelter: 5, "shelter.tempo": 3, resonance: 1, bastion: 1 })) result[nodeIndex(id)] = value;
    return result;
}
function arena() {
    const e = new CombatWorld(0, 0), regions = new RegionalWorld("stars", { x: 0, z: 0 }), stars = new StarCasting(e), skills = new SkillSystem(e);
    const resolution = new CombatResolution(e), random = new DeterministicRandom("stars");
    vi.spyOn(random, "next").mockReturnValue(.5);
    const stats = { ...deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, sumEquipment({})),
        damage: 100, accuracy: 2, criticalChance: 0, excellentChance: 0, lethalChance: 0, lifeExtraction: 0,
        damageIncrease: 0, normalDamage: 0, eliteDamage: 0, lifesteal: 0, evasion: 0, blockChance: 0, thorns: 0, thornsPerMille: 0 };
    e.vitals.health[e.player] = e.vitals.maxHealth[e.player] = stats.maxHealth; e.vitals.mana[e.player] = 1000;
    const spawn = (x: number, z: number) => {
        const slot = e.spawnEnemy({ x, z, kind: 0, boss: false, elite: false, level: 1, region: regions.regionAt(x, z) }, { resident: true });
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 100000; return slot;
    };
    const settle = (tick: number) => resolution.resolve(tick, stats, random, false, () => {});
    skills.points = 99; expect(skills.commitBuild(ranks(), 0, 100, false, 0)).toBeNull();
    return { e, stars, skills, resolution, random, stats, spawn, settle, id: e.world.ids[e.player] };
}

test("star tree has reachable branches, meaningful support ranks and mutually exclusive masteries", () => {
    const { stats } = arena(), build = ranks();
    expect(SKILL_NODES.filter(node => node.school === "stars")).toHaveLength(34);
    expect(validateSkillRanks(build, 100)).toBeNull();
    build[nodeIndex("stars.radiance")] = build[nodeIndex("stars.sentinel")] = 1;
    expect(validateSkillRanks(build, 100)).toContain("互斥");
    for (const skill of STAR_SKILLS) {
        const first = skillValues(skill, 1, stats), second = skillValues(skill, 2, stats);
        expect(second.damage + second.ward + second.star!.empowerment + second.star!.protection).toBeGreaterThan(first.damage + first.ward + first.star!.empowerment + first.star!.protection);
    }
    const max = skillValues("infusion", 10, stats, { ...NO_SKILL_MODIFIERS, power: 5, shape: 5, tempo: 5, radiance: 3 });
    expect(max.star).toMatchObject({ charges: 7, empowerment: .54 }); expect(max.duration).toBe(12);
    expect(skillValues("fireball", 1, stats, { ...NO_SKILL_MODIFIERS, sentinel: 3 }).damage).toBeCloseTo(.675);
    expect(skillValues("fireball", 1, stats, { ...NO_SKILL_MODIFIERS, sentinel: 3 }).fire!.burnDamage).toBe(.06);
});

test("star bolts select six stable visible targets, add one energy per successful cast and weaken bosses without controlling them", () => {
    const { e, stars, stats, random, spawn, settle } = arena();
    const near = spawn(1, 0), tie = spawn(-1, 0), boss = spawn(2, 0); e.status.controlProfile[boss] = ControlProfile.Boss;
    spawn(3, 0); spawn(4, 0); spawn(5, 0); const excluded = spawn(6, 0);
    const values = skillValues("starbolt", 1, stats, { ...NO_SKILL_MODIFIERS, shape: 5 });
    for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) e.effects.add(EffectKind.Heal, 0, 0, 0, 1, 20);
    stars.release("starbolt", 0, stats, values, 0, random);
    expect(Array.from(e.impacts.target.slice(0, 2))).toEqual([e.world.ids[near], e.world.ids[tie]]); expect(e.impacts.count).toBe(6);
    settle(0); expect(e.status.starEnergy[e.player]).toBe(1); expect(e.status.amount(K.Weakened, boss, 0)).toBe(.1);
    expect(e.status.canMove(boss, 0)).toBe(true); expect(e.status.weakenedUntil[excluded]).toBe(0);
    for (let at = 1; at < 5; at++) { stars.release("starbolt", at, stats, values, 0, random); settle(at); }
    expect(e.status.starEnergy[e.player]).toBe(3); expect(e.status.deadline(K.StarEnergy, e.player)).toBe(964);
    const dodge = { ...stats, accuracy: 0 };
    e.status.consumeStarEnergy(e.player, 5); stars.release("starbolt", 5, dodge, values, 0, random); settle(5);
    expect(e.status.starEnergy[e.player]).toBe(0);
    e.remove(boss); const reused = spawn(2, 0); expect(reused).toBe(boss); expect(e.status.weakenedUntil[reused]).toBe(0);
});

test("infusion consumes energy only on accepted release; stronger, equal and weaker instances use whole-instance replacement", () => {
    const { e, stars, stats, random, id } = arena();
    for (let i = 0; i < 3; i++) e.status.gainStarEnergy(e.player, 0);
    const infusion = skillValues("infusion", 1, stats);
    stars.release("infusion", 0, stats, infusion, 0, random);
    expect(e.status.starEnergy[e.player]).toBe(0); expect(e.status.empoweredCharges[e.player]).toBe(5);
    expect(e.status.consumeEmpowerment(e.player, 1)).toBe(.2); expect(e.status.empoweredCharges[e.player]).toBe(4);
    expect(e.status.apply(K.Empowered, id, id, .3, 1000, 1, { charges: 1 })).toBe(true);
    e.status.gainStarEnergy(e.player, 2); stars.release("infusion", 2, stats, infusion, 0, random);
    expect(e.status.starEnergy[e.player]).toBe(1); expect(e.status.deadline(K.Empowered, e.player)).toBe(1000);
    expect(e.status.apply(K.Empowered, id, id, .3, 900, 3, { charges: 2 })).toBe(true);
    expect(e.status.apply(K.Empowered, id, id, .3, 1200, 4, { charges: 1 })).toBe(false);
    expect(e.status.consumeEmpowerment(e.player, 5)).toBe(.3); expect(e.status.consumeEmpowerment(e.player, 5)).toBe(.3);
    expect(e.status.consumeEmpowerment(e.player, 5)).toBe(0); expect(e.status.empoweredUntil[e.player]).toBe(0);
});

test("empowerment is spent once at a successful start, survives delayed settlement and does not affect support or ordinary attacks", () => {
    const { e, skills, stats, random, id, spawn, settle } = arena();
    const target = spawn(2, 0); skills.equip("ward", 1, 100);
    e.status.apply(K.Empowered, id, id, .5, 1000, 0, { charges: 2 });
    expect(skills.cast("starbolt", 0, stats, 100, random)).toBe(false); expect(e.status.empoweredCharges[e.player]).toBe(2);
    expect(skills.cast("pulse", 0, stats, 100, random)).toBe(true); expect(e.status.empoweredCharges[e.player]).toBe(1);
    expect(skills.cast("pulse", 1, stats, 100, random)).toBe(false); expect(e.status.empoweredCharges[e.player]).toBe(1);
    skills.advanceCasting(22, random, false, () => {});
    // Settlement's current stats deliberately differ from the cast snapshot.
    const before = e.vitals.health[target];
    new CombatResolution(e).resolve(22, { ...stats, damageIncrease: 100 }, random, false, () => {});
    expect(before - e.vitals.health[target]).toBe(195);
    skills.advanceCasting(60, random, false, () => {});
    expect(skills.cast("ward", 60, stats, 100, random)).toBe(true); expect(e.status.empoweredCharges[e.player]).toBe(1);
    skills.advanceCasting(120, random, false, () => {});
    expect(skills.cast("pulse", 600, stats, 100, random)).toBe(true); expect(e.status.empoweredCharges[e.player]).toBe(0);
    skills.advanceCasting(601, random, true, () => {}); settle(601);
    expect(e.status.amount(K.Empowered, e.player, 601)).toBe(0);
});

test("one empowered fire field snapshots every direct pulse and burn without spending per-hit charges", () => {
    const { e, skills, stats, random, id, spawn } = arena(), build = [...skills.snapshot(0).build.ranks];
    for (const [node, rank] of Object.entries({ fireball: 10, "fireball.power": 5, fireray: 3, firewall: 1 })) build[nodeIndex(node)] = rank;
    expect(skills.commitBuild(build, 1, 100, false, 0)).toBeNull(); skills.equip("firewall", 1, 100);
    const target = spawn(3, 0); e.status.apply(K.Empowered, id, id, .5, 10, 0, { charges: 1 });
    expect(skills.cast("firewall", 0, stats, 100, random)).toBe(true); expect(e.status.empoweredCharges[e.player]).toBe(0);
    e.status.advance(10); skills.advanceCasting(48, random, false, () => {});
    const before = e.vitals.health[target];
    const resolution = new CombatResolution(e);
    for (const tick of [108, 168]) skills.advanceOngoing(tick, random, () => resolution.resolve(tick, { ...stats, damageIncrease: 9 }, random, false, () => {}));
    expect(before - e.vitals.health[target]).toBe(36);
    expect(e.status.burns.save(target, 168).map(layer => layer.amount)).toEqual([12, 12]);
});

test("cleanse budgets remove freeze then entire burn source groups then slow; system resistance and protection remain", () => {
    const { e, id } = arena(), s = e.status, p = e.player;
    s.apply(K.Frozen, 2, id, 1, 120, 0); s.apply(K.Slow, 2, id, .3, 400, 0); s.apply(K.Chill, 3, id, 2, 300, 0);
    s.apply(K.Protection, id, id, .25, 500, 0);
    s.burns.apply(2, id, 5, 0, 180); s.burns.apply(2, id, 5, 0, 240); s.burns.apply(3, id, 5, 0, 300);
    expect(s.cleanse(p, 2, 1)).toBe(2); expect(s.canAct(p, 1)).toBe(true); expect(s.amount(K.ControlResistance, p, 1)).toBe(1);
    expect(s.burns.save(p, 1).map(layer => layer.source)).toEqual([3]); expect(s.protection(p, 1)).toBe(.25);
    expect(s.cleanse(p, 2, 2)).toBe(2); expect(s.amount(K.Chill, p, 2)).toBe(0); expect(s.amount(K.Slow, p, 2)).toBe(.3);
    expect(s.cleanse(p, 5, 3)).toBe(1); expect(s.hasCleansable(p, 3)).toBe(false);
});

test("strong barrier replacement and expiry never heal; damage exhaustion heals once after overflow and never resurrects", () => {
    const { e, id, resolution, stats, random, spawn } = arena(), target = spawn(1, 0), source = e.world.ids[target], p = e.player;
    const strike = (tick: number, damage: number) => {
        resolution.damageImmunity = 0; resolution.shieldCooldown = 100;
        e.impacts.add(source, id, damage); resolution.resolve(tick, { ...stats, armor: 0, damageReduction: 0 }, random, false, () => {});
    };
    e.vitals.health[p] = 100;
    e.status.apply(K.Barrier, id, id, 20, 200, 0, { recovery: 15 });
    expect(e.status.apply(K.Barrier, id, id, 19, 300, 1, { recovery: 100 })).toBe(false);
    e.status.apply(K.Barrier, id, id, 30, 100, 1, { recovery: 10 }); expect(e.vitals.health[p]).toBe(100);
    e.status.advance(100); expect(e.vitals.health[p]).toBe(100);
    e.status.apply(K.Barrier, id, id, 30, 300, 100, { recovery: 10 });
    strike(101, 35); expect(e.vitals.health[p]).toBe(105);
    strike(102, 5); expect(e.vitals.health[p]).toBe(100);
    e.status.apply(K.Barrier, id, id, 1, 400, 103, { recovery: 1000 });
    strike(104, 10000); expect(e.vitals.health[p]).toBe(0);
});

test("burn exhaustion uses the same one-shot barrier recovery and weakness only reduces direct damage", () => {
    const { e, id, resolution, stats, random, spawn } = arena(), slot = spawn(1, 0), source = e.world.ids[slot], p = e.player;
    e.vitals.health[p] = 100; e.status.apply(K.Barrier, id, id, 5, 500, 0, { recovery: 10 });
    e.status.burns.apply(source, id, 10, 0, 60);
    const events: number[] = []; resolution.advanceBurns(60, { ...stats, armor: 0, damageReduction: 0 }, (buffer, index) => events.push(buffer.cause[index]));
    expect(e.vitals.health[p]).toBe(105); expect(events).toContain(EffectCause.BarrierRecovery);
    e.status.apply(K.Weakened, id, source, .1, 300, 60); resolution.shieldCooldown = 100;
    e.impacts.add(source, id, 10); resolution.resolve(61, { ...stats, armor: 0, damageReduction: 0 }, random, false, () => {});
    expect(e.vitals.health[p]).toBe(96);
});

test("automatic support is context-aware; refund removes own star benefits without clearing external statuses or cooldowns", () => {
    const { e, skills, stats, random, spawn, id } = arena();
    for (const [i, skill] of (["infusion", "shelter", "ward", "starbolt"] as const).entries()) skills.equip(skill, i, 100);
    skills.loadout[4] = skills.loadout[5] = null;
    expect(skills.castAutomatic(0, stats, 100, random, false)).toBe(false);
    spawn(2, 0); expect(skills.castAutomatic(0, stats, 100, random, false)).toBe(true); expect(skills.snapshot(0).action?.skill).toBe("infusion");
    skills.advanceCasting(70, random, false, () => {});
    expect(skills.castAutomatic(70, stats, 100, random, false)).toBe(true); expect(skills.snapshot(70).action?.skill).toBe("starbolt");
    skills.advanceCasting(140, random, false, () => {}); e.impacts.clear();
    e.status.burns.apply(2, id, 1, 140, 480);
    expect(skills.castAutomatic(140, stats, 100, random, false)).toBe(true); expect(skills.snapshot(140).action?.skill).toBe("shelter");
    skills.advanceCasting(210, random, false, () => {}); expect(e.status.burnStacks[e.player]).toBe(0);
    e.status.apply(K.Protection, 2, id, .4, 1000, 210); const ready = skills.checkpoint(210).readyAt;
    expect(skills.commitBuild(initialSkillRanks(), 1, 100, true, 210)).toBeNull();
    expect(e.status.amount(K.Empowered, e.player, 210)).toBe(0); expect(e.status.amount(K.AstralGuard, e.player, 210)).toBe(0);
    expect(e.status.protection(e.player, 210)).toBe(.4); expect(skills.checkpoint(210).readyAt).toEqual(ready);
});

test("full-population blade pulses remain bounded and stop cleanly, independent of saturated visuals", () => {
    const { e, stars, stats, random, spawn } = arena();
    for (let i = 0; i < MAX_ENEMIES; i++) spawn(2.5, 0);
    for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) e.effects.add(EffectKind.Heal, 0, 0, 0, 1, 20);
    stars.release("blades", 0, stats, skillValues("blades", 1, stats), 0, random);
    let pulses = 0;
    for (let tick = 1; tick <= 481; tick++) stars.advance(tick, random, () => { expect(e.impacts.count).toBe(MAX_ENEMIES); pulses++; e.impacts.clear(); });
    expect(pulses).toBe(16); expect(stars.ongoing).toBe(false);
    stars.release("blades", 500, stats, skillValues("blades", 1, stats), 0, random); stars.clear();
    stars.advance(530, random, () => { throw new Error("cancelled field dealt damage"); });
});

test("player death cancels blade fields and clears star charges without resetting learned nodes or paid cooldowns", () => {
    const sim = new CombatSimulation("star-death"), cp = sim.checkpoint(), build = ranks();
    sim.restore({ ...cp, player: { ...cp.player, level: 100 }, skills: { ...cp.skills, ranks: build, points: 99 - investedPoints(build) } });
    const fixture = sim as unknown as { entities: CombatWorld; resolution: CombatResolution; random: DeterministicRandom };
    const e = fixture.entities, id = e.world.ids[e.player];
    vi.spyOn(fixture.random, "next").mockReturnValue(.5);
    sim.toggleAutoCast(); sim.equipSkill("blades", 0); sim.castSkill("blades");
    for (let i = 0; i < 100; i++) sim.step({ x: 0, z: 0, active: false });
    expect(sim.getSnapshot().player.skills.refundBlocked).toBe(true);
    e.status.gainStarEnergy(e.player, sim.tick);
    e.status.apply(K.Empowered, id, id, .4, sim.tick + 300, sim.tick, { charges: 3 });
    sim.toggleAutoCombat(); fixture.resolution.damageImmunity = 0; fixture.resolution.shieldCooldown = 1000;
    e.impacts.add(0, id, 1000000); sim.step({ x: 0, z: 0, active: false });
    const snapshot = sim.getSnapshot();
    expect(snapshot.gameOver).toBe(true); expect(snapshot.autoCombat.enabled).toBe(false);
    expect(snapshot.player.skills.statuses).toEqual([]); expect(snapshot.player.skills.refundBlocked).toBe(false);
    expect(snapshot.player.skills.ranks.blades).toBe(5); expect(snapshot.player.skills.remaining.blades).toBeGreaterThan(0);
    sim.dispose();
});

test("star counts, recovery and deadlines survive validated saves and render transfer; malformed payloads reject", () => {
    const sim = new CombatSimulation("star-save"), e = (sim as unknown as { entities: CombatWorld }).entities, id = e.world.ids[e.player];
    const cp = sim.checkpoint(), build = ranks();
    sim.restore({ ...cp, player: { ...cp.player, level: 100 }, skills: { ...cp.skills, ranks: build, points: 99 - investedPoints(build) } });
    e.status.gainStarEnergy(e.player, 0); e.status.apply(K.Empowered, id, id, .4, 600, 0, { charges: 3 });
    e.status.apply(K.Barrier, id, id, 20, 300, 0, { recovery: 10 }); e.status.apply(K.AstralGuard, id, id, .3, 240, 0);
    const saved = sim.checkpoint(); expect(saved.version).toBe(10);
    sim.restore(saved); expect(sim.checkpoint().skills.statuses).toEqual(saved.skills.statuses);
    const frame = new RenderFrame(), packet = frame.write(sim.getRenderState()), transferred = structuredClone(packet, { transfer: [packet.buffer] });
    const state = new RenderFrame(transferred.buffer).read(transferred);
    expect(state.entities.status.empoweredCharges[e.player]).toBe(3); expect(state.entities.status.starEnergy[e.player]).toBe(1);
    state.entities.status.empoweredCharges[e.player] = 0; expect(e.status.empoweredCharges[e.player]).toBe(3);
    for (const invalid of [{ charges: 9 }, { charges: .5 }, { remaining: ticksForSeconds(16) }, { recovery: 1 }]) {
        const statuses = saved.skills.statuses.map(status => status.kind === K.Empowered ? { ...status, ...invalid } : status);
        expect(() => validateCharacterCheckpoint({ ...saved, skills: { ...saved.skills, statuses } })).toThrow();
    }
    expect(() => validateCharacterCheckpoint({ ...saved, version: 8 } as never)).toThrow(/版本/); sim.dispose();
});
