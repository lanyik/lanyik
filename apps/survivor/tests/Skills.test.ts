import { expect, test, vi } from "vitest";
import { CombatSimulation, experienceForLevel } from "../src/core/CombatSimulation";
import { CombatWorld, ActorAction, MoveIntent, Component } from "../src/core/CombatWorld";
import { SkillSystem } from "../src/core/SkillSystem";
import { SKILLS } from "../src/core/Skills";
import { initialSkillRanks, nodeIndex } from "../src/core/SkillBuild";
import { StatusKind } from "../src/core/StatusSystem";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { GAME_CONFIG, MAX_ENEMIES } from "../src/core/GameConfig";
import { EffectKind } from "../src/core/CombatEffects";
import { RenderFrame } from "../src/worker/RenderFrame";
import { moveEnemies } from "../src/core/CombatSystems";

function arena() {
    const simulation = new CombatSimulation("skill-boundaries");
    const fixture = simulation as unknown as { entities: CombatWorld; skills: SkillSystem; world: RegionalWorld;
        autoCast: boolean; attackCooldown: number; gainExperience(value: number): void };
    const { entities: e, skills, world } = fixture;
    while (e.enemies.count) e.remove(e.enemies.slots[0]);
    fixture.autoCast = false; fixture.attackCooldown = 1000;
    const stats = simulation.getSnapshot().player.stats, random = new DeterministicRandom("skills");
    const spawn = (x: number, z: number) => e.spawnEnemy({ x, z, kind: 0, elite: false, boss: false, level: 1, region: world.regionAt(x, z) }, world.chunks.get("0,0")!);
    const learnFrost = () => {
        for (let level = 1; level < 8; level++) fixture.gainExperience(experienceForLevel(level));
        const ranks = initialSkillRanks(); ranks[nodeIndex("icebolt")] = 3; ranks[nodeIndex("icebolt.power")] = 3; ranks[nodeIndex("frost")] = 1;
        expect(skills.commitBuild(ranks, 0, 8, false, 0)).toBeNull(); expect(skills.equip("frost", 1, 8)).toBe(true);
    };
    const learnMeteor = () => {
        skills.points = 19;
        const ranks = initialSkillRanks();
        for (const [id, rank] of Object.entries({ fireball: 10, "fireball.power": 5, pyroblast: 3, meteor: 1 })) ranks[nodeIndex(id)] = rank;
        expect(skills.commitBuild(ranks, 0, 20, false, 0)).toBeNull();
    };
    const learnChain = () => {
        const ranks = initialSkillRanks(); ranks[nodeIndex("arc")] = 3; ranks[nodeIndex("arc.power")] = 3; ranks[nodeIndex("chain")] = 1;
        skills.points = 7; expect(skills.commitBuild(ranks, 0, 8, false, 0)).toBeNull(); skills.equip("chain", 1, 8);
    };
    const learnStars = () => {
        const snapshot = skills.snapshot(0), ranks = [...snapshot.build.ranks];
        for (const [id, rank] of Object.entries({ starbolt: 10, "starbolt.power": 5, infusion: 3, blades: 1, ward: 1 })) ranks[nodeIndex(id)] = rank;
        skills.points = 99; expect(skills.commitBuild(ranks, snapshot.build.revision, 100, false, 0)).toBeNull();
    };
    const release = (tick: number) => skills.advanceCasting(tick, random, false, () => {});
    return { simulation, fixture, e, skills, stats, random, spawn, learnFrost, learnMeteor, learnChain, learnStars, release };
}

test("automatic casting prioritizes protection and stationary spells ahead of mobile fillers", () => {
    const { skills, e, stats, random, spawn, release, learnStars } = arena(); learnStars();
    skills.equip("vortex", 5, 8); skills.equip("ward", 4, 8); spawn(2, 0);
    e.vitals.mana[e.player] = 1000;
    expect(skills.castAutomatic(0, stats, 8, random, true)).toBe(true);
    expect(skills.snapshot(0).action?.skill).toBe("vortex");
    release(110); e.vitals.health[e.player] = stats.maxHealth * .4;
    expect(skills.castAutomatic(110, stats, 8, random, false)).toBe(true);
    expect(skills.snapshot(110).action?.skill).toBe("ward");
    release(170);
    expect(skills.castAutomatic(170, stats, 8, random, false)).toBe(true);
    expect(skills.snapshot(170).action?.skill).toBe("pulse");
});

test("autopilot stops pursuit to finish a heavy cast while manual movement still takes over", () => {
    const { simulation, fixture, skills, e, spawn } = arena();
    fixture.gainExperience(experienceForLevel(1) + experienceForLevel(2)); skills.equip("vortex", 5, 3);
    const target = spawn(6, 0); e.vitals.health[target] = 10000; e.vitals.mana[e.player] = 1000;
    fixture.autoCast = true; simulation.toggleAutoCombat();
    for (let i = 0; i < 12; i++) simulation.step({ x: 0, z: 0, active: false });
    expect(skills.snapshot(simulation.tick).action?.skill).toBe("vortex");
    const x = e.position.x[e.player], z = e.position.z[e.player];
    for (let i = 0; i < 60; i++) simulation.step({ x: 0, z: 0, active: false });
    expect(e.effects.buffer.kind.slice(0, e.effects.buffer.count)).toContain(EffectKind.Vortex);
    expect(Math.hypot(e.position.x[e.player] - x, e.position.z[e.player] - z)).toBeLessThan(1);
    simulation.step({ x: -1, z: 0, active: true });
    expect(simulation.getSnapshot().autoCombat.activity).toBe("manual");
    simulation.dispose();
});

test("one point per earned level, atomic build revisions, six slots and cooldowns survive rearrangement", () => {
    const { simulation, fixture, skills, stats, random } = arena();
    expect(skills.equip("ward", 0, 1)).toBe(false);
    for (const slot of [-1, 6, .5, NaN]) expect(skills.equip("pulse", slot, 5)).toBe(false);
    expect(skills.loadout).toHaveLength(6);
    fixture.gainExperience(experienceForLevel(1));
    const ranks = [...skills.snapshot(0).build.ranks]; ranks[nodeIndex("pulse")] = 2;
    simulation.commitSkillBuild(ranks, 0);
    expect(simulation.getSnapshot().player.skills.ranks.pulse).toBe(2);
    expect(simulation.getSnapshot().player.skills.points).toBe(0);
    expect(skills.commitBuild(ranks, 0, 2, false, 0)).toContain("变化");
    expect(skills.cast("pulse", 10, stats, 2, random)).toBe(true);
    expect(skills.cast("chain", 10, stats, 2, random)).toBe(false);
    expect(skills.equip("pulse", 5, 2)).toBe(true);
    expect(skills.loadout).toEqual([null, null, "dash", null, null, "pulse"]);
    expect(skills.snapshot(10).remaining.pulse).toBe(SKILLS.pulse.cooldown);
    expect(skills.cast("pulse", 11, stats, 2, random)).toBe(false);
});

test("windup commits exactly once, recovery blocks every other spell, and moving cancels without refunds", () => {
    const { skills, e, stats, random, spawn, release, learnChain } = arena(); learnChain();
    spawn(2, 0); const mana = e.vitals.mana[e.player];
    expect(skills.cast("pulse", 0, stats, 8, random)).toBe(true);
    expect(e.impacts.count).toBe(0); release(21); expect(e.impacts.count).toBe(0);
    release(22); expect(e.impacts.count).toBe(1);
    release(23); expect(e.impacts.count).toBe(1);
    expect(skills.cast("chain", 55, stats, 8, random)).toBe(false);
    expect(skills.cast("chain", 56, stats, 8, random)).toBe(true);
    skills.advanceCasting(57, random, true, () => {});
    release(200);
    expect(e.impacts.count).toBe(1);
    expect(e.vitals.mana[e.player]).toBe(mana - SKILLS.pulse.mana - SKILLS.chain.mana);
    expect(skills.snapshot(57).action).toBeNull();
    expect(skills.snapshot(57).recoveryRemaining).toBeGreaterThan(0);
    expect(skills.snapshot(57).remaining.chain).toBeGreaterThan(6);
});

test("freeze interrupts a pending cast, blocks new casts and cannot turn a zero health actor into a caster", () => {
    const { skills, e, stats, random, spawn, release, learnChain } = arena(); learnChain();
    spawn(2, 0);
    skills.cast("pulse", 0, stats, 8, random);
    const id = e.world.ids[e.player];
    e.status.apply(StatusKind.Frozen, id, id, 1, 121, 1);
    release(22); expect(e.impacts.count).toBe(0);
    expect(skills.cast("chain", 22, stats, 8, random)).toBe(false);
    expect(skills.cast("dash", 22, stats, 8, random)).toBe(false);
    e.status.clear(e.player); e.vitals.health[e.player] = 0;
    expect(skills.cast("chain", 200, stats, 8, random)).toBe(false);
});

test("mobile windup permits movement, heavy windup yields to manual movement, and refunds preserve cooldowns", () => {
    const { simulation, skills, e, spawn, learnFrost, stats, random } = arena();
    spawn(1, 0); simulation.castSkill("pulse");
    for (let i = 0; i < 22; i++) simulation.step({ x: 1, z: 0, active: true });
    expect(e.position.x[e.player]).toBeGreaterThan(0); expect(skills.snapshot(simulation.tick).action?.phase).toBe("recovery");
    for (let i = 0; i < 40; i++) simulation.step({ x: 0, z: 0, active: false });
    learnFrost(); simulation.castSkill("frost"); const mana = e.vitals.mana[e.player];
    simulation.step({ x: 1, z: 0, active: true });
    expect(skills.snapshot(simulation.tick).action).toBeNull(); expect(e.vitals.mana[e.player]).toBeLessThan(mana + 1);
    expect(skills.commitBuild(initialSkillRanks(), 1, 8, true, simulation.tick)).not.toBeNull();
    expect(skills.commitBuild(initialSkillRanks(), 1, 8, true, 1000)).toBeNull(); expect(skills.loadout[1]).toBeNull();
    const ranks = initialSkillRanks(); ranks[nodeIndex("icebolt")] = 3; ranks[nodeIndex("icebolt.power")] = 3; ranks[nodeIndex("frost")] = 1;
    expect(skills.commitBuild(ranks, 2, 8, true, 1000)).toBeNull(); skills.equip("frost", 1, 8);
    expect(skills.cast("frost", 1000, stats, 8, random)).toBe(false); // CD was paid at tick 62, expires 1022.
});

test("learning both frost ultimates permits swapping, but never two equipped ultimates", () => {
    const { skills } = arena(), ranks = initialSkillRanks();
    for (const [id, rank] of Object.entries({ icebolt: 10, "icebolt.power": 5, "icebolt.shape": 5, "icebolt.tempo": 5, icelance: 5, icestorm: 5, frost: 5, blizzard: 5, shatter: 1, absolutezero: 1 })) ranks[nodeIndex(id)] = rank;
    skills.points = 99; expect(skills.commitBuild(ranks, 0, 100, false, 0)).toBeNull();
    expect(skills.equip("shatter", 4, 100)).toBe(true);
    expect(skills.equip("absolutezero", 5, 100)).toBe(false);
    expect(skills.equip("absolutezero", 4, 100)).toBe(true);
});

test("chain lightning picks distinct nearest targets with stable ties and bounded attenuation", () => {
    const { skills, e, stats, random, spawn, release, learnChain } = arena(); learnChain();
    const first = spawn(2, 0), tie = spawn(-2, 0), third = spawn(-5, 0); spawn(30, 0);
    vi.spyOn(random, "next").mockReturnValue(.5);
    expect(skills.cast("chain", 0, { ...stats, criticalChance: 0, excellentChance: 0, lethalChance: 0 }, 8, random)).toBe(true);
    release(24);
    expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[first], e.world.ids[tie], e.world.ids[third]]);
    expect(e.impacts.damage[1]).toBeCloseTo(e.impacts.damage[0] * .8, 4);
    expect(e.effects.buffer.count).toBe(3); expect(e.effects.buffer.endX[0]).toBe(2);
    while (e.enemies.count) e.remove(e.enemies.slots[0]);
    const mana = e.vitals.mana[e.player];
    expect(skills.cast("chain", 1000, stats, 8, random, true)).toBe(false); expect(e.vitals.mana[e.player]).toBe(mana);
});

test("frost applies two chill stacks, projects movement until exact expiry and clears reused slots", () => {
    const { skills, e, stats, random, spawn, learnFrost, release } = arena(); learnFrost();
    const enemy = spawn(3, 0);
    expect(skills.cast("frost", 0, stats, 8, random)).toBe(true); release(30);
    expect(e.status.amount(StatusKind.Chill, enemy, 30)).toBe(2);
    e.enemy.intent[enemy] = MoveIntent.Chase; e.enemy.active[enemy] = 1;
    const initial = e.position.x[enemy]; moveEnemies(e, 31); const slowed = initial - e.position.x[enemy];
    e.status.advance(389); expect(e.status.slowScale[enemy]).toBeCloseTo(.88);
    e.status.advance(390);
    const before = e.position.x[enemy]; moveEnemies(e, 390);
    expect(before - e.position.x[enemy]).toBeCloseTo(slowed / .88);
    e.remove(enemy); const replacement = spawn(3, 0);
    expect(replacement).toBe(enemy); expect(e.status.slowUntil[replacement]).toBe(0);
});

test("dash moves exactly 30 ticks and shield begins only after its windup, then absorbs and expires", () => {
    const { skills, e, stats, random, release, learnStars } = arena(); learnStars();
    e.position.heading[e.player] = 0;
    expect(skills.cast("dash", 0, stats, 1, random, true)).toBe(false);
    expect(skills.cast("dash", 0, stats, 1, random)).toBe(true);
    e.position.heading[e.player] = Math.PI / 2;
    for (let tick = 1; tick <= 30; tick++) expect(skills.advance(tick)).toBe(true);
    expect(e.position.z[e.player]).toBeCloseTo(3.8); expect(e.position.x[e.player]).toBe(0);
    expect(skills.advance(31)).toBe(false);
    skills.equip("ward", 0, 8); e.vitals.mana[e.player] = 100;
    expect(skills.cast("ward", 31, stats, 8, random, true)).toBe(false);
    e.vitals.health[e.player] = stats.maxHealth * .5;
    expect(skills.cast("ward", 31, stats, 8, random, true)).toBe(true);
    expect(skills.ward).toBe(0); release(49);
    const ward = skills.ward; expect(ward).toBeGreaterThan(0);
    expect(e.status.absorb(e.player, 5, 49)).toBe(0); expect(skills.ward).toBe(ward - 5);
    expect(e.status.absorb(e.player, ward, 49)).toBe(5); expect(skills.ward).toBe(0);
    e.vitals.mana[e.player] = 100; expect(skills.cast("ward", 2000, stats, 8, random)).toBe(true); release(2018);
    e.status.advance(2737); expect(skills.ward).toBeGreaterThan(0); e.status.advance(2738); expect(skills.ward).toBe(0);
});

test("full presentation buffers preserve gameplay and transfer without authority array aliases", () => {
    const { simulation, e, spawn, learnFrost } = arena(); learnFrost();
    const enemy = spawn(2, 0); e.vitals.health[enemy] = 10000; e.action.kind[enemy] = ActorAction.Idle;
    for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) e.effects.add(EffectKind.Heal, 0, i, 0, 1, 1);
    simulation.castSkill("frost"); for (let i = 0; i < 30; i++) simulation.step({ x: 0, z: 0, active: false });
    expect(e.effects.buffer.count).toBe(GAME_CONFIG.skills.maxEffects); expect(e.status.slowUntil[enemy]).toBeGreaterThan(0);
    const packet = new RenderFrame().write(simulation.getRenderState()), transfer = structuredClone(packet, { transfer: [packet.buffer] });
    expect(packet.buffer.byteLength).toBe(0);
    const rendered = new RenderFrame(transfer.buffer).read(transfer);
    expect(rendered.effects.count).toBe(GAME_CONFIG.skills.maxEffects);
    rendered.effects.x[0] = -1; rendered.entities.status.slowUntil[enemy] = 0;
    expect(e.effects.buffer.x[0]).toBe(0); expect(e.status.slowUntil[enemy]).toBeGreaterThan(0);
    e.effects.advance(120); expect(e.effects.buffer.count).toBe(0);
});

test("meteor locks the initial location, preserves offensive stats and hits after windup plus flight", () => {
    const { skills, e, stats, random, spawn, release, learnMeteor } = arena();
    learnMeteor();
    const target = spawn(4, 0), bystander = spawn(4, 1);
    skills.equip("meteor", 0, 20); e.vitals.mana[e.player] = 100;
    for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) e.effects.add(EffectKind.Heal, 0, 0, 0, 1, 10);
    const castingStats = { ...stats, damage: 10, criticalChance: 0, excellentChance: 0, lethalChance: 0 };
    vi.spyOn(random, "next").mockReturnValue(.5);
    expect(skills.cast("meteor", 0, castingStats, 20, random)).toBe(true); castingStats.damage = 1000;
    e.position.x[target] = 15; e.updateSpatial(target, Component.Enemy); e.position.x[e.player] = -15;
    release(54);
    skills.advanceOngoing(161, random, () => {}); expect(e.impacts.count).toBe(0);
    skills.advanceOngoing(162, random, () => {});
    expect(e.impacts.count).toBe(1); expect(e.impacts.target[0]).toBe(e.world.ids[bystander]); expect(e.impacts.damage[0]).toBe(28);
    skills.advanceOngoing(163, random, () => {}); expect(e.impacts.count).toBe(1);
    expect(e.effects.buffer.count).toBe(GAME_CONFIG.skills.maxEffects);
});

test("vortex pulls visible targets through terrain, respects boss resistance and stops after eight pulses", () => {
    const { skills, e, stats, random, spawn, release } = arena();
    spawn(4, 0); const normal = spawn(6, 0), boss = spawn(4, 2), covered = spawn(4, -2); e.enemy.boss[boss] = 1;
    skills.equip("vortex", 0, 3); e.vitals.mana[e.player] = 100;
    expect(skills.cast("vortex", 0, stats, 3, random)).toBe(true); release(42);
    vi.spyOn(e.terrain, "traceAttack").mockImplementation((_x, _y, _z, _ex, _ey, ez) => ez < 0 ? 0 : Infinity);
    const settle = vi.fn(() => { e.impacts.count = 0; });
    skills.advanceOngoing(101, random, settle); expect(settle).not.toHaveBeenCalled();
    skills.advanceOngoing(102, random, settle);
    expect(e.position.x[normal]).toBeCloseTo(5.35); expect(e.position.z[boss]).toBeCloseTo(1.87); expect(e.position.z[covered]).toBe(-2);
    for (let tick = 103; tick <= 523; tick++) skills.advanceOngoing(tick, random, settle);
    expect(settle).toHaveBeenCalledTimes(8);
});

test("blade ring follows the player, leaves an inner gap and restore cancels in-flight fields", () => {
    const { skills, e, stats, random, spawn, release, learnStars } = arena(); learnStars();
    const inner = spawn(.5, 0), rim = spawn(2.5, 0);
    skills.equip("blades", 0, 20); e.vitals.mana[e.player] = 100;
    expect(skills.cast("blades", 0, { ...stats, castSpeed: 100 }, 20, random)).toBe(true); release(12);
    skills.advanceOngoing(42, random, () => {});
    expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[rim]]);
    expect(e.impacts.target[0]).not.toBe(e.world.ids[inner]); expect(skills.cast("blades", 43, stats, 2, random)).toBe(false);
    e.impacts.count = 0; e.position.x[e.player] = 10;
    skills.advanceOngoing(72, random, () => {}); expect(e.impacts.count).toBe(0);
    skills.restore(skills.checkpoint(72), 72); expect(e.effects.buffer.count).toBe(0);
    skills.advanceOngoing(102, random, () => {}); expect(e.impacts.count).toBe(0);
});

test("sequential casts can overlap fields at full population without overflowing damage capacity", () => {
    const { skills, e, stats, random, spawn, release, learnMeteor, learnStars } = arena(); learnMeteor(); learnStars();
    for (let i = 0; i < MAX_ENEMIES; i++) spawn(2.5, 0);
    for (const [slot, id] of (["meteor", "vortex", "blades"] as const).entries()) {
        skills.equip(id, slot, 20); e.vitals.mana[e.player] = 100;
        expect(skills.cast(id, slot * 30, { ...stats, castSpeed: 100 }, 20, random)).toBe(true); release(slot * 30 + 12);
    }
    let stages = 0, peak = 0;
    for (let tick = 73; tick <= 552; tick++) skills.advanceOngoing(tick, random, () => {
        if (e.impacts.count) stages++; peak = Math.max(peak, e.impacts.count); e.impacts.count = 0;
    });
    expect(stages).toBe(25); expect(peak).toBe(MAX_ENEMIES);
    e.vitals.mana[e.player] = 100; expect(skills.cast("blades", 553, stats, 20, random)).toBe(true);
});

test("automatic ground skills reject empty casts and pulse independently benefits from chill", () => {
    const { skills, e, stats, random, spawn, learnFrost, release } = arena(); learnFrost();
    skills.equip("vortex", 2, 8); const mana = e.vitals.mana[e.player];
    for (const id of ["frost", "vortex"] as const) expect(skills.cast(id, 0, stats, 8, random, true)).toBe(false);
    expect(e.vitals.mana[e.player]).toBe(mana); skills.equip("pulse", 0, 8);
    spawn(2, 0); vi.spyOn(random, "next").mockReturnValue(.5);
    skills.cast("pulse", 0, stats, 8, random); release(22); const normal = e.impacts.damage[0];
    e.vitals.mana[e.player] = 100; e.impacts.count = 0;
    skills.cast("frost", 600, stats, 8, random); release(630); e.impacts.count = 0;
    skills.cast("pulse", 667, stats, 8, random); release(689);
    expect(e.impacts.damage[0]).toBeCloseTo(normal * 1.5);
    expect(Array.from(e.effects.buffer.kind.slice(0, e.effects.buffer.count))).toContain(EffectKind.Shatter);
});
