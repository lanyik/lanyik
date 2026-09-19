import { expect, test, vi } from "vitest";
import { CombatSimulation, experienceForLevel } from "../src/core/CombatSimulation";
import { CombatWorld, ActorAction, MoveIntent, Component } from "../src/core/CombatWorld";
import { SkillSystem } from "../src/core/SkillSystem";
import { SKILLS, skillValues } from "../src/core/Skills";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { GAME_CONFIG, MAX_ENEMIES, ticksForSeconds } from "../src/core/GameConfig";
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
    return { simulation, fixture, e, skills, stats, random, spawn };
}

test("skill points, level locks, slot swaps and per-skill cooldowns survive loadout changes", () => {
    const { simulation, fixture, skills, e, stats, random } = arena();
    expect(skills.equip("ward", 0, 1)).toBe(false);
    for (const slot of [-1, 4, .5, NaN]) expect(skills.equip("pulse", slot, 5)).toBe(false);
    expect(skills.upgrade("pulse", 2)).toBe(false);
    fixture.gainExperience(experienceForLevel(1));
    expect(simulation.getSnapshot().player.skills.points).toBe(1);
    simulation.upgradeSkill("pulse");
    expect(simulation.getSnapshot().player.skills.ranks.pulse).toBe(2);
    expect(simulation.getSnapshot().player.skills.points).toBe(0);
    expect(skills.cast("pulse", 10, stats, 2, random)).toBe(true);
    expect(skills.cast("pulse", 10, stats, 2, random)).toBe(false);
    expect(skills.equip("pulse", 3, 2)).toBe(true);
    expect(skills.loadout).toEqual(["dash", "frost", "chain", "pulse"]);
    skills.equip("ward", 3, 2);
    skills.equip("pulse", 1, 2);
    expect(skills.snapshot(10).remaining.pulse).toBe(SKILLS.pulse.cooldown);
    expect(skills.cast("pulse", 11, stats, 2, random)).toBe(false);
    e.vitals.mana[e.player] = 100;
    expect(skills.cast("pulse", 610, stats, 2, random)).toBe(true);
    skills.points = 10;
    expect(skills.upgrade("pulse", 2)).toBe(false);
    for (let level = 3; level <= 5; level++) expect(skills.upgrade("pulse", level)).toBe(true);
    expect(skills.upgrade("pulse", 100)).toBe(false);
});

test("chain lightning picks distinct nearest targets with stable ties and bounded attenuated hits", () => {
    const { skills, e, stats, random, spawn } = arena();
    const first = spawn(2, 0), tie = spawn(-2, 0), third = spawn(-5, 0);
    spawn(30, 0);
    const flat = { ...stats, criticalChance: 0, excellentChance: 0, lethalChance: 0 };
    vi.spyOn(random, "next").mockReturnValue(.5);
    expect(skills.cast("chain", 0, flat, 1, random)).toBe(true);
    expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[first], e.world.ids[tie], e.world.ids[third]]);
    expect(e.impacts.damage[1]).toBeCloseTo(e.impacts.damage[0] * .8, 4);
    expect(e.effects.buffer.count).toBe(3);
    expect(e.effects.buffer.endX[0]).toBe(2);
    while (e.enemies.count) e.remove(e.enemies.slots[0]);
    const mana = e.vitals.mana[e.player];
    expect(skills.cast("chain", 1000, flat, 1, random, true)).toBe(false);
    expect(e.vitals.mana[e.player]).toBe(mana);
});

test("frost halves movement until the exact expiry tick and reused slots lose the slow", () => {
    const { skills, e, stats, random, spawn } = arena();
    const enemy = spawn(3, 0);
    expect(skills.cast("frost", 0, stats, 1, random)).toBe(true);
    const expiry = ticksForSeconds(skillValues("frost", 1, stats).slowSeconds);
    e.enemy.intent[enemy] = MoveIntent.Chase; e.enemy.active[enemy] = 1;
    const start = e.position.x[enemy]; moveEnemies(e, expiry - 1);
    const slowed = start - e.position.x[enemy], before = e.position.x[enemy]; moveEnemies(e, expiry);
    expect(before - e.position.x[enemy]).toBeCloseTo(slowed * 2);
    e.remove(enemy); const replacement = spawn(3, 0);
    expect(replacement).toBe(enemy);
    expect(e.status.slowUntil[replacement]).toBe(0);
});

test("dash advances exactly 30 ticks without steering and ward absorbs then expires", () => {
    const { skills, e, stats, random } = arena();
    e.position.heading[e.player] = 0;
    expect(skills.cast("dash", 0, stats, 1, random, true)).toBe(false);
    expect(skills.cast("dash", 0, stats, 1, random)).toBe(true);
    e.position.heading[e.player] = Math.PI / 2;
    for (let tick = 1; tick <= 30; tick++) { expect(skills.dashing(tick)).toBe(true); expect(skills.advance(tick)).toBe(true); }
    expect(e.position.z[e.player]).toBeCloseTo(3.8);
    expect(e.position.x[e.player]).toBe(0);
    expect(skills.advance(31)).toBe(false);
    skills.equip("ward", 0, 2); e.vitals.mana[e.player] = 100;
    expect(skills.cast("ward", 31, stats, 2, random, true)).toBe(false);
    e.vitals.health[e.player] = stats.maxHealth * .5;
    expect(skills.cast("ward", 31, stats, 2, random, true)).toBe(true);
    const ward = skills.ward;
    expect(e.status.absorb(e.player, 5, 31)).toBe(0); expect(skills.ward).toBe(ward - 5);
    expect(e.status.absorb(e.player, ward, 31)).toBe(5); expect(skills.ward).toBe(0);
    e.vitals.mana[e.player] = 100;
    expect(skills.cast("ward", 2000, stats, 2, random)).toBe(true);
    e.status.advance(2000 + ticksForSeconds(6) - 1); expect(skills.ward).toBeGreaterThan(0);
    e.status.advance(2000 + ticksForSeconds(6)); expect(skills.ward).toBe(0);
});

test("saturated visual buffers preserve gameplay and transfer without exposing authority arrays", () => {
    const { simulation, e, spawn } = arena();
    const enemy = spawn(2, 0); e.vitals.health[enemy] = 10000; e.action.kind[enemy] = ActorAction.Idle;
    for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) e.effects.add(EffectKind.Heal, 0, i, 0, 1, 1);
    simulation.castSkill("frost");
    expect(e.effects.buffer.count).toBe(GAME_CONFIG.skills.maxEffects);
    expect(e.status.slowUntil[enemy]).toBeGreaterThan(0);
    expect(simulation.getSnapshot().player.mana).toBe(simulation.getSnapshot().player.stats.maxMana - SKILLS.frost.mana);
    const packet = new RenderFrame().write(simulation.getRenderState());
    const transfer = structuredClone(packet, { transfer: [packet.buffer] });
    expect(packet.buffer.byteLength).toBe(0);
    const rendered = new RenderFrame(transfer.buffer).read(transfer);
    expect(rendered.effects.count).toBe(GAME_CONFIG.skills.maxEffects);
    rendered.effects.x[0] = -1; rendered.entities.status.slowUntil[enemy] = 0;
    expect(e.effects.buffer.x[0]).toBe(0); expect(e.status.slowUntil[enemy]).toBeGreaterThan(0);
    e.effects.advance(120); expect(e.effects.buffer.count).toBe(0);
});

test("meteor commits at the locked location and exact deadline using cast-time stats despite full visuals", () => {
    const { skills, e, stats, random, spawn } = arena();
    const target = spawn(4, 0), bystander = spawn(4, 1);
    skills.equip("meteor", 0, 2); e.vitals.mana[e.player] = 100;
    for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) e.effects.add(EffectKind.Heal, 0, 0, 0, 1, 10);
    const castingStats = { ...stats, damage: 10, criticalChance: 0, excellentChance: 0, lethalChance: 0 };
    vi.spyOn(random, "next").mockReturnValue(.5);
    expect(skills.cast("meteor", 0, castingStats, 2, random)).toBe(true);
    castingStats.damage = 1000;
    expect(e.impacts.count).toBe(0);
    e.position.x[target] = 15; e.updateSpatial(target, Component.Enemy);
    e.position.x[e.player] = -15;
    skills.advanceOngoing(107, random, () => {}); expect(e.impacts.count).toBe(0);
    skills.advanceOngoing(108, random, () => {});
    expect(e.impacts.count).toBe(1); expect(e.impacts.target[0]).toBe(e.world.ids[bystander]);
    expect(e.impacts.damage[0]).toBe(28);
    skills.advanceOngoing(109, random, () => {}); expect(e.impacts.count).toBe(1);
    expect(e.effects.buffer.count).toBe(GAME_CONFIG.skills.maxEffects);
});

test("vortex pulls only visible targets through terrain, settles each cast and expires after eight pulses", () => {
    const { skills, e, stats, random, spawn } = arena();
    spawn(4, 0); const normal = spawn(6, 0), boss = spawn(4, 2), covered = spawn(4, -2);
    e.enemy.boss[boss] = 1;
    skills.equip("vortex", 0, 3); e.vitals.mana[e.player] = 100;
    expect(skills.cast("vortex", 0, stats, 3, random)).toBe(true);
    const trace = vi.spyOn(e.terrain, "traceAttack").mockImplementation((_x, _y, _z, _ex, _ey, ez) => ez < 0 ? 0 : Infinity);
    const settle = vi.fn(() => { e.impacts.count = 0; });
    skills.advanceOngoing(59, random, settle); expect(settle).not.toHaveBeenCalled();
    skills.advanceOngoing(60, random, settle);
    expect(e.position.x[normal]).toBeCloseTo(5.35);
    expect(e.position.z[boss]).toBeCloseTo(1.87);
    expect(e.position.z[covered]).toBe(-2);
    for (let tick = 61; tick <= 481; tick++) skills.advanceOngoing(tick, random, settle);
    expect(settle).toHaveBeenCalledTimes(8);
    trace.mockRestore();
});

test("blade ring follows the player, leaves an inner gap and cannot overlap itself at high cast speed", () => {
    const { skills, e, stats, random, spawn } = arena();
    const inner = spawn(.5, 0), rim = spawn(2.5, 0);
    skills.equip("blades", 0, 2); e.vitals.mana[e.player] = 100;
    expect(skills.cast("blades", 0, { ...stats, castSpeed: 100 }, 2, random)).toBe(true);
    skills.advanceOngoing(30, random, () => {});
    expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[rim]]);
    expect(e.impacts.target[0]).not.toBe(e.world.ids[inner]);
    expect(skills.cast("blades", 31, stats, 2, random)).toBe(false);
    e.impacts.count = 0; e.position.x[e.player] = 10;
    skills.advanceOngoing(60, random, () => {}); expect(e.impacts.count).toBe(0);
    skills.restore(skills.checkpoint(), 60);
    expect(e.effects.buffer.count).toBe(0);
    skills.advanceOngoing(90, random, () => {}); expect(e.impacts.count).toBe(0);
});

test("all three ongoing skills share a full population without overflowing the per-stage damage capacity", () => {
    const { skills, e, stats, random, spawn } = arena();
    for (let i = 0; i < MAX_ENEMIES; i++) spawn(2.5, 0);
    for (const [slot, id] of (["meteor", "vortex", "blades"] as const).entries()) {
        skills.equip(id, slot, 3); e.vitals.mana[e.player] = 100;
        expect(skills.cast(id, 0, { ...stats, castSpeed: 100 }, 3, random)).toBe(true);
    }
    let stages = 0, peak = 0;
    for (let tick = 1; tick <= 480; tick++) skills.advanceOngoing(tick, random, () => {
        stages++; peak = Math.max(peak, e.impacts.count); e.impacts.count = 0;
    });
    expect(stages).toBe(25); expect(peak).toBe(MAX_ENEMIES);
    e.vitals.mana[e.player] = 100;
    expect(skills.cast("blades", 480, stats, 3, random)).toBe(true);
});

test("automatic targeted skills reject empty casts and pulse gains independent 50 percent damage against chilled enemies", () => {
    const { skills, e, stats, random, spawn } = arena();
    skills.equip("meteor", 0, 3); skills.equip("vortex", 1, 3);
    const mana = e.vitals.mana[e.player];
    for (const id of ["meteor", "vortex"] as const) expect(skills.cast(id, 0, stats, 3, random, true)).toBe(false);
    expect(e.vitals.mana[e.player]).toBe(mana);
    skills.equip("pulse", 0, 3); skills.equip("frost", 1, 3);
    spawn(2, 0); vi.spyOn(random, "next").mockReturnValue(.5);
    skills.cast("pulse", 0, stats, 3, random); const normal = e.impacts.damage[0];
    e.vitals.mana[e.player] = 100; e.impacts.count = 0;
    skills.cast("frost", 600, stats, 3, random); e.impacts.count = 0;
    skills.cast("pulse", 601, stats, 3, random);
    expect(e.impacts.damage[0]).toBeCloseTo(normal * 1.5);
    expect(Array.from(e.effects.buffer.kind.slice(0, e.effects.buffer.count))).toContain(EffectKind.Shatter);
});
