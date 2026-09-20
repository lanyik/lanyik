import { afterEach, expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld } from "../src/core/CombatWorld";
import { CombatResolution } from "../src/core/CombatResolution";
import { CombatEventKind, EffectCause } from "../src/core/CombatEvents";
import { EffectKind, MAX_FIRE_PROJECTILES } from "../src/core/CombatEffects";
import { FireCasting } from "../src/core/FireCasting";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { SkillSystem } from "../src/core/SkillSystem";
import { initialSkillRanks, nodeIndex } from "../src/core/SkillBuild";
import { StatusKind } from "../src/core/StatusSystem";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { NO_SKILL_MODIFIERS, skillValues } from "../src/core/Skills";
import { deriveStats } from "../src/core/CombatStats";
import { sumEquipment } from "../src/core/Equipment";
import { MAX_ENEMIES } from "../src/core/GameConfig";
import { RenderFrame } from "../src/worker/RenderFrame";

afterEach(() => vi.restoreAllMocks());

function arena() {
    const e = new CombatWorld(0, 0), regions = new RegionalWorld("fire-tests", { x: 0, z: 0 }); regions.synchronize(0, 0);
    const fire = new FireCasting(e), resolution = new CombatResolution(e), random = new DeterministicRandom("fire");
    vi.spyOn(random, "next").mockReturnValue(.5);
    const stats = { ...deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, sumEquipment({})), damage: 100,
        accuracy: 2, criticalChance: 0, excellentChance: 0, lethalChance: 0, damageIncrease: 0, normalDamage: 0, eliteDamage: 0, lifeExtraction: 0, lifesteal: 0 };
    e.vitals.health[e.player] = e.vitals.maxHealth[e.player] = stats.maxHealth; e.vitals.mana[e.player] = 1000;
    const spawn = (x: number, z: number, boss = false) => {
        const slot = e.spawnEnemy({ x, z, kind: 0, level: 1, elite: boss, boss, region: regions.regionAt(x, z) }, regions.chunks.get("0,0")!);
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 100000; return slot;
    };
    const settle = (tick: number) => resolution.resolve(tick, stats, random, false, () => {});
    return { e, fire, resolution, random, stats, spawn, settle };
}

test("fireball travels, stops at the first physical collision and splashes each nearby victim once", () => {
    const { e, fire, random, stats, spawn, settle } = arena(), first = spawn(0, 3), near = spawn(.5, 3), distant = spawn(0, 6);
    fire.release("fireball", 0, stats, skillValues("fireball", 1, stats), 0, 3, 0, random);
    expect(fire.projectiles.count).toBe(1); expect(e.impacts.count).toBe(0);
    for (let tick = 1; tick <= 70; tick++) fire.advance(tick, random, () => settle(tick));
    expect(fire.projectiles.count).toBe(0);
    expect(100000 - e.vitals.health[first]).toBe(75); expect(100000 - e.vitals.health[near]).toBe(75);
    expect(e.status.burnStacks[first]).toBe(1); expect(e.vitals.health[distant]).toBe(100000);
    expect(e.effects.buffer.kind.slice(0, e.effects.buffer.count)).toContain(EffectKind.FireImpact);
});

test("terrain contact wins ties, blocks the far-side splash and does not turn visual saturation into damage loss", () => {
    const { e, fire, random, stats, spawn, settle } = arena(), target = spawn(0, 3);
    vi.spyOn(e.terrain, "traceAttack").mockImplementation((_sx, _sy, sz, _ex, _ey, ez) => sz < 2 && ez >= 2 ? (2 - sz) / (ez - sz) : Infinity);
    fire.release("fireball", 0, stats, skillValues("fireball", 1, stats), 0, 3, 0, random);
    for (let tick = 1; tick <= 70; tick++) fire.advance(tick, random, () => settle(tick));
    expect(e.vitals.health[target]).toBe(100000); expect(fire.projectiles.count).toBe(0);
    vi.restoreAllMocks(); vi.spyOn(random, "next").mockReturnValue(.5);
    for (let i = 0; i < 128; i++) e.effects.add(EffectKind.Heal, 70, 0, 0, 1, 10);
    fire.release("fireball", 70, stats, skillValues("fireball", 1, stats), 0, 3, 0, random);
    for (let tick = 71; tick <= 140; tick++) fire.advance(tick, random, () => settle(tick));
    expect(e.status.burnStacks[target]).toBe(1);
});

test("a six-shot volley caps a single large victim at two hits and the projectile pool rejects capacity overflow", () => {
    const { e, fire, random, stats, spawn, settle } = arena(), target = spawn(0, 2, true);
    const values = skillValues("pyroblast", 1, stats, { ...NO_SKILL_MODIFIERS, shape: 5 });
    fire.release("pyroblast", 0, stats, values, 0, 2, 0, random);
    for (let tick = 1; tick <= 70; tick++) fire.advance(tick, random, () => settle(tick));
    expect(100000 - e.vitals.health[target]).toBe(140); expect(e.status.burnStacks[target]).toBe(2);
    for (let i = 0; i < MAX_FIRE_PROJECTILES / 6; i++) fire.release("pyroblast", 100, stats, values, 0, 8, 0, random);
    expect(fire.available("fireball", skillValues("fireball", 1, stats))).toBe(false);
    fire.clear(); expect(fire.projectiles.count).toBe(0); expect(fire.ongoing).toBe(false);
});

test("a missed volley hit does not spend the two-hit allowance", () => {
    const { e, random, stats, spawn, resolution } = arena(), target = e.world.ids[spawn(0, 2)], source = e.world.ids[e.player], volley = new Map<number, number>();
    const values = skillValues("pyroblast", 1, stats).fire!;
    for (const accuracy of [0, 2, 2, 2]) {
        e.impacts.fire(source, target, 10, false, { ...stats, accuracy }, values, volley);
        resolution.resolve(0, stats, random, false, () => {});
    }
    expect(100000 - e.vitals.health[e.world.resolve(target)]).toBe(20); expect(volley.get(target)).toBe(2);
});

test("a ray's visible end and damage corridor stop at the same obstruction", () => {
    const { e, fire, stats, random, spawn, settle } = arena(), near = spawn(0, 1), far = spawn(0, 4);
    vi.spyOn(e.terrain, "traceAttack").mockImplementation((_sx, _sy, sz, _ex, _ey, ez) => sz < 2 && ez >= 2 ? (2 - sz) / (ez - sz) : Infinity);
    fire.release("fireray", 0, stats, skillValues("fireray", 1, stats), 0, 4, 0, random);
    expect(e.effects.buffer.endZ[0]).toBe(2); fire.advance(60, random, () => settle(60));
    expect(e.vitals.health[near]).toBeLessThan(100000); expect(e.vitals.health[far]).toBe(100000);
});

test.each(["fireray", "firewall", "firedomain"] as const)("%s uses a fixed footprint and exact integer pulse deadlines", id => {
    const { e, fire, random, stats, spawn } = arena();
    const inside = spawn(0, 2), outside = spawn(id === "firedomain" ? 8 : 2, id === "firewall" ? 4 : 2);
    const values = skillValues(id, 1, stats);
    fire.release(id, 0, stats, values, 0, 2, 0, random); e.position.x[e.player] = 30;
    let hits = 0;
    for (let tick = 1; tick <= values.duration * 120 + 1; tick++) fire.advance(tick, random, () => {
        expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[inside]]);
        expect(e.impacts.target[0]).not.toBe(e.world.ids[outside]); hits += e.impacts.count; e.impacts.clear();
    });
    expect(hits).toBe(id === "fireray" ? 4 : id === "firewall" ? 8 : 12); expect(fire.ongoing).toBe(false);
});

test("burn snapshots exclude critical/lethal/extraction, ignore later gear and settle defense at each tick", () => {
    const { e, random, stats, spawn, resolution } = arena(), slot = spawn(0, 2), target = e.world.ids[slot], source = e.world.ids[e.player];
    const castStats = { ...stats, damageIncrease: 1, normalDamage: .5, criticalChance: 1, lethalChance: 1, lifeExtraction: 100, lifesteal: 1 };
    const fire = skillValues("fireball", 1, castStats).fire!;
    e.impacts.fire(source, target, 0, false, castStats, fire); resolution.resolve(0, stats, random, false, () => {});
    expect(e.status.burns.save(slot, 0)[0].amount).toBe(18); // 100 * .06 * 2 * 1.5, no other offensive triggers.
    e.vitals.health[e.player] = 1; const health = e.vitals.health[slot];
    e.status.apply(StatusKind.Protection, source, target, .5, 100, 0);
    e.status.apply(StatusKind.Barrier, source, target, 4, 200, 0);
    const events: number[] = []; resolution.advanceBurns(60, { ...castStats, damage: 10000 }, (b, i) => events.push(b.cause[i]));
    expect(health - e.vitals.health[slot]).toBe(5); expect(e.vitals.health[e.player]).toBe(1); expect(events).toEqual([EffectCause.Burn]);
    e.status.advance(120); resolution.advanceBurns(120, stats, () => {}); expect(health - e.vitals.health[slot]).toBe(23);
});

test("misses consume no burns; detonation consumes only its source and applies output bonuses once", () => {
    const { e, random, stats, spawn, resolution } = arena(), slot = spawn(0, 2), target = e.world.ids[slot], source = e.world.ids[e.player];
    const boosted = { ...stats, damageIncrease: 1, normalDamage: .5 }, values = skillValues("meteor", 1, boosted).fire!;
    e.status.burns.apply(source, target, 10, 0, 480); e.status.burns.apply(999, target, 20, 0, 480);
    e.impacts.fire(source, target, 100, false, { ...boosted, accuracy: 0 }, values); resolution.resolve(0, stats, random, false, () => {});
    expect(e.status.burnStacks[slot]).toBe(2); expect(e.effects.buffer.count).toBe(0);
    e.status.apply(StatusKind.Protection, source, target, .5, 120, 0);
    e.impacts.fire(source, target, 100, false, boosted, values); resolution.resolve(0, stats, random, false, () => {});
    expect(100000 - e.vitals.health[slot]).toBe(170); // (100 * 2 * 1.5 + 8 * 10 * .5) * .5.
    expect(e.status.burnStacks[slot]).toBe(1); expect(e.status.burns.save(slot, 0)[0].source).toBe(999);
    expect(e.effects.buffer.kind[0]).toBe(EffectKind.Detonation);
});

test("on-hit protection refreshes once, survives a shielded hit, and DoT cannot refresh it or bypass death bookkeeping", () => {
    const { e, random, stats, spawn, resolution } = arena(), slot = spawn(0, 2), target = e.world.ids[slot], source = e.world.ids[e.player];
    const fire = skillValues("fireball", 1, stats, { ...NO_SKILL_MODIFIERS, resilience: 5 }).fire!;
    e.status.apply(StatusKind.Barrier, target, target, 100, 300, 0);
    e.impacts.fire(source, target, 75, false, stats, fire); resolution.resolve(0, stats, random, false, () => {});
    expect(e.vitals.health[slot]).toBe(100000); expect(e.status.burnStacks[slot]).toBe(1);
    expect(e.status.amount(StatusKind.Protection, e.player, 0)).toBe(.05); expect(e.status.wardUntil[e.player]).toBe(240);
    resolution.advanceBurns(60, stats, () => {}); expect(e.status.wardUntil[e.player]).toBe(240);
    e.status.clear(slot); e.status.burns.apply(source, target, 10, 60, 480); e.status.burns.apply(source, target, 10, 60, 480); e.vitals.health[slot] = 5;
    const defeats: number[] = []; resolution.advanceBurns(120, stats, (b, i) => { if (b.kind[i] === CombatEventKind.Defeat) defeats.push(b.target[i]); });
    expect(defeats).toEqual([target]); expect(e.status.burnStacks[slot]).toBe(0); expect(e.world.resolve(target)).toBe(-1);
});

test.each(["move", "freeze", "dash"])("%s interrupts the actual ray channel, preserves costs and leaves other fields intact", mode => {
    const { e, random, stats, spawn } = arena(), skills = new SkillSystem(e), ranks = initialSkillRanks();
    for (const [id, rank] of Object.entries({ fireball: 10, "fireball.power": 5, fireray: 3, firewall: 1 })) ranks[nodeIndex(id)] = rank;
    skills.points = 19; expect(skills.commitBuild(ranks, 0, 20, false, 0)).toBeNull();
    skills.equip("fireray", 0, 20); skills.equip("firewall", 1, 20); skills.equip("pulse", 3, 20); spawn(0, 2);
    skills.cast("firewall", 0, stats, 20, random); skills.advanceCasting(48, random, false, () => e.impacts.clear());
    expect(skills.cast("fireray", 100, stats, 20, random)).toBe(true);
    skills.advanceCasting(136, random, false, () => e.impacts.clear()); const paid = e.vitals.mana[e.player];
    expect(skills.snapshot(136).action?.phase).toBe("channel"); expect(skills.holding(200)).toBe(true);
    expect(skills.cast("pulse", 150, stats, 20, random)).toBe(false);
    if (mode === "freeze") e.status.apply(StatusKind.Frozen, e.world.ids[e.player], e.world.ids[e.player], 1, 280, 160);
    if (mode === "dash") expect(skills.cast("dash", 160, stats, 20, random)).toBe(true);
    else skills.advanceCasting(160, random, mode === "move", () => e.impacts.clear());
    expect(e.effects.buffer.kind.slice(0, e.effects.buffer.count)).not.toContain(EffectKind.FireRay);
    expect(e.effects.buffer.kind.slice(0, e.effects.buffer.count)).toContain(EffectKind.FireWall);
    expect(e.vitals.mana[e.player]).toBe(mode === "dash" ? paid - 12 : paid);
    expect(skills.snapshot(160).remaining.fireray).toBeGreaterThan(6);
});

test("overlapping fire fields and burn layers settle a full population without overflowing shared buffers", () => {
    const { e, fire, random, stats, spawn, resolution } = arena();
    for (let i = 0; i < MAX_ENEMIES; i++) spawn(0, 2, i % 5 === 0);
    for (const id of ["firewall", "firedomain", "meteor"] as const) fire.release(id, 0, stats, skillValues(id, 1, stats), 0, 2, 0, random);
    let hits = 0;
    for (let tick = 1; tick <= 1200; tick++) {
        e.status.advance(tick); resolution.advanceBurns(tick, stats, () => {});
        fire.advance(tick, random, () => { hits += e.impacts.count; resolution.resolve(tick, stats, random, false, () => {}); });
    }
    expect(hits).toBe(MAX_ENEMIES * 21); expect(e.enemies.count).toBe(MAX_ENEMIES);
    for (let i = 0; i < e.enemies.count; i++) expect(e.status.burnStacks[e.enemies.slots[i]]).toBe(0);
});

test("fire projectile and burn render arrays transfer independently of authority and clear across restore", () => {
    const sim = new CombatSimulation("fire-transfer"), f = sim as unknown as { entities: CombatWorld; skills: SkillSystem };
    const cp = sim.checkpoint(), ranks = [...cp.skills.ranks]; ranks[nodeIndex("fireball")] = 1;
    sim.restore({ ...cp, player: { ...cp.player, level: 2 }, skills: { ...cp.skills, ranks } });
    sim.equipSkill("fireball", 0); sim.toggleAutoCast(); sim.castSkill("fireball");
    for (let tick = 0; tick < 25; tick++) sim.step({ x: 0, z: 0, active: false });
    const slot = f.entities.player; f.entities.status.burns.apply(999, f.entities.world.ids[slot], 1, sim.tick, 480);
    const frame = new RenderFrame(), packet = frame.write(sim.getRenderState());
    const transferred = structuredClone(packet, { transfer: [packet.buffer] }), view = new RenderFrame(transferred.buffer).read(transferred);
    expect(view.fireProjectiles.count).toBe(1); expect(view.entities.status.burnStacks[slot]).toBe(1);
    view.fireProjectiles.x[0] = 999; view.entities.status.burnStacks[slot] = 0;
    expect(f.skills.fireProjectiles.x[0]).not.toBe(999); expect(f.entities.status.burnStacks[slot]).toBe(1);
    sim.restore(sim.checkpoint()); expect(sim.getRenderState().fireProjectiles.count).toBe(0); sim.dispose();
});

test("refund removes only the protection supplied by the removed passive", () => {
    const { e } = arena(), skills = new SkillSystem(e), ranks = initialSkillRanks();
    for (const [id, rank] of Object.entries({ fireball: 10, "fireball.power": 5, "fireball.shape": 5, "fire.resilience": 5 })) ranks[nodeIndex(id)] = rank;
    skills.points = 29; expect(skills.commitBuild(ranks, 0, 30, false, 0)).toBeNull();
    const target = e.world.ids[e.player];
    e.status.apply(StatusKind.Protection, target, target, .05, 240, 0); e.status.apply(StatusKind.Protection, 999, target, .02, 300, 0);
    expect(skills.commitBuild(initialSkillRanks(), 1, 30, true, 10)).toBeNull();
    expect(e.status.amount(StatusKind.Protection, e.player, 10)).toBe(.02); expect(e.status.wardUntil[e.player]).toBe(300);
});
