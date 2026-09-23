import { afterEach, expect, test, vi } from "vitest";
import { CombatWorld } from "../src/core/CombatWorld";
import { CombatResolution } from "../src/core/CombatResolution";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { LightningCasting } from "../src/core/LightningCasting";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { deriveStats } from "../src/core/CombatStats";
import { sumEquipment } from "../src/core/Equipment";
import { NO_SKILL_MODIFIERS, skillValues } from "../src/core/Skills";
import { ControlProfile, StatusKind } from "../src/core/StatusSystem";
import { EffectKind } from "../src/core/CombatEffects";
import { MAX_ENEMIES } from "../src/core/GameConfig";
import { SkillSystem } from "../src/core/SkillSystem";
import { initialSkillRanks, nodeIndex } from "../src/core/SkillBuild";
import { RenderFrame } from "../src/worker/RenderFrame";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";

afterEach(() => vi.restoreAllMocks());

function arena() {
    const e = new CombatWorld(0, 0), regions = new RegionalWorld("lightning", { x: 0, z: 0 }), lightning = new LightningCasting(e);
    const resolution = new CombatResolution(e), random = new DeterministicRandom("lightning");
    vi.spyOn(random, "next").mockReturnValue(.5);
    const stats = { ...deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, sumEquipment({})),
        damage: 100, accuracy: 2, criticalChance: 0, excellentChance: 0, lethalChance: 0, lifeExtraction: 0, damageIncrease: 0, normalDamage: 0, eliteDamage: 0, lifesteal: 0 };
    e.vitals.health[e.player] = e.vitals.maxHealth[e.player] = stats.maxHealth; e.vitals.mana[e.player] = 1000;
    const spawn = (x: number, z: number) => {
        const slot = e.spawnEnemy({ x, z, kind: 0, boss: false, elite: false, level: 1, region: regions.regionAt(x, z) }, { resident: true });
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 100000; return slot;
    };
    const settle = (tick: number) => resolution.resolve(tick, stats, random, false, () => {});
    const targets = () => Array.from(e.impacts.target.slice(0, e.impacts.count));
    return { e, lightning, resolution, random, stats, spawn, settle, targets };
}

test("first hop is nearest; subsequent hops prefer conductive targets, break equal-distance ties by handle and never revisit", () => {
    const { e, lightning, stats, random, spawn, targets } = arena();
    const first = spawn(0, 1), tie = spawn(1, 1); spawn(-1, 1); const marked = spawn(0, 4);
    e.status.apply(StatusKind.Conductive, 999, e.world.ids[marked], 1, 480, 0);
    lightning.release("chain", 0, stats, skillValues("chain", 1, stats), 0, 0, 0, random);
    expect(targets()).toEqual([e.world.ids[first], e.world.ids[marked], e.world.ids[tie]]);
    expect(Array.from(e.impacts.damage.slice(0, 3))).toEqual([160, expect.closeTo(128, 6), expect.closeTo(102.4, 6)]);
    e.impacts.clear(); lightning.release("chain", 1, stats, skillValues("chain", 1, stats), 0, 0, 0, random);
    expect(targets()).toEqual([e.world.ids[first], e.world.ids[marked], e.world.ids[tie]]);
});

test("conduction cannot use an occluded marked target as a bridge", () => {
    const { e, lightning, stats, random, spawn, targets } = arena();
    const first = spawn(0, 1), near = spawn(1, 1), blocked = spawn(0, 4); spawn(0, 6);
    e.status.apply(StatusKind.Conductive, 999, e.world.ids[blocked], 1, 480, 0);
    vi.spyOn(e.terrain, "traceAttack").mockImplementation((_x, _y, z, _ex, _ey, ez) => z < 3 && ez >= 3 ? (3 - z) / (ez - z) : Infinity);
    lightning.release("chain", 0, stats, skillValues("chain", 1, stats), 0, 0, 0, random);
    expect(targets()).toEqual([e.world.ids[first], e.world.ids[near]]);
});

test("a branching network has one global target budget, depth attenuation and no dependency on visual capacity", () => {
    const { e, lightning, stats, random, spawn, targets } = arena();
    for (let i = 0; i < 60; i++) spawn((i % 10 - 5) * .5, 2 + Math.floor(i / 10) * .5);
    for (let i = 0; i < 128; i++) e.effects.add(EffectKind.Heal, 0, 0, 0, 1, 10);
    lightning.release("tempest", 0, stats, skillValues("tempest", 1, stats, { ...NO_SKILL_MODIFIERS, shape: 5, conduction: 3 }), 0, 0, 0, random);
    expect(targets()).toHaveLength(20); expect(new Set(targets()).size).toBe(20);
    expect(e.impacts.damage[0]).toBe(170); expect(e.impacts.damage[1]).toBeCloseTo(127.5); expect(e.impacts.damage[2]).toBeCloseTo(127.5);
    expect(e.impacts.damage[3]).toBeCloseTo(95.625); expect(e.effects.buffer.count).toBe(128);
});

test("lance orders bounded piercing by ray intersection and shares its terrain-clipped endpoint with visuals", () => {
    const { e, lightning, stats, random, spawn, targets } = arena();
    const far = spawn(0, 4), second = spawn(0, 2), first = spawn(0, 1); spawn(1, 1);
    vi.spyOn(e.terrain, "traceAttack").mockImplementation((_x, _y, z, _ex, _ey, ez) => z < 3 && ez >= 3 ? (3 - z) / (ez - z) : Infinity);
    lightning.release("thunderlance", 0, stats, skillValues("thunderlance", 1, stats), 0, 0, 0, random);
    expect(targets()).toEqual([e.world.ids[first], e.world.ids[second]]); expect(targets()).not.toContain(e.world.ids[far]);
    expect(e.effects.buffer.endZ[0]).toBe(3);
});

test("field pulses share area and short-chain visits, emitting one chain with a bounded number of new victims", () => {
    const { e, lightning, stats, random, spawn, targets } = arena();
    const inside = [spawn(0, 2), spawn(.5, 2)], outside = [spawn(0, 4), spawn(0, 6), spawn(0, 8)]; spawn(0, 10);
    lightning.release("thunderfield", 0, stats, { ...skillValues("thunderfield", 1, stats), radius: 1 }, 0, 2, 0, random);
    lightning.advance(59, random, () => {}); expect(targets()).toEqual([]);
    const batches: number[][] = [];
    for (let tick = 60; tick <= 480; tick++) lightning.advance(tick, random, () => { batches.push(targets()); e.impacts.clear(); });
    expect(batches).toHaveLength(8);
    for (const batch of batches) { expect(new Set(batch).size).toBe(5); expect(batch).toEqual([...inside, ...outside].map(slot => e.world.ids[slot])); }
    expect(lightning.ongoing).toBe(false);
});

test("repeated strikes focus only successful hits on the same full handle, with a 15 percent ceiling", () => {
    const { e, lightning, stats, random, spawn, settle } = arena(), slot = spawn(0, 2);
    const values = skillValues("thunderstrike", 1, stats, { ...NO_SKILL_MODIFIERS, shape: 5, tempo: 5 });
    lightning.release("thunderstrike", 0, stats, values, 0, 2, 0, random);
    let strikes = 0;
    for (let tick = 1; tick <= 400; tick++) lightning.advance(tick, random, () => {
        if (strikes++ === 0) vi.spyOn(random, "chance").mockReturnValueOnce(false);
        settle(tick);
    });
    expect(strikes).toBe(8); expect(100000 - e.vitals.health[slot]).toBeCloseTo(80 + 6 * 92);
    expect(lightning.ongoing).toBe(false);
    lightning.release("thunderstrike", 500, stats, values, 0, 2, 0, random);
    lightning.advance(554, random, () => settle(554)); e.remove(slot);
    const replacement = spawn(0, 2); lightning.advance(602, random, () => settle(602));
    expect(100000 - e.vitals.health[replacement]).toBe(80);
});

test("judgment selects one fixed-point core victim and never adds outer damage to that core", () => {
    const { e, lightning, stats, random, spawn, settle } = arena(), core = spawn(0, 2), equal = spawn(0, 2), outer = spawn(2, 2);
    lightning.release("judgment", 0, stats, skillValues("judgment", 1, stats), 0, 2, 0, random);
    lightning.advance(101, random, () => settle(101)); expect(e.vitals.health[core]).toBe(100000);
    lightning.advance(102, random, () => settle(102));
    expect(100000 - e.vitals.health[core]).toBe(500); expect(100000 - e.vitals.health[equal]).toBe(250); expect(100000 - e.vitals.health[outer]).toBe(250);
    expect(e.effects.buffer.kind.slice(0, e.effects.buffer.count)).toContain(EffectKind.JudgmentImpact);
});

test("misses apply no status; shielded hits apply conductive and static guard, which neither stacks protection nor controls bosses", () => {
    const { e, stats, spawn, resolution, settle } = arena(), slot = spawn(0, 2), target = e.world.ids[slot], source = e.world.ids[e.player];
    const values = skillValues("arc", 1, stats, { ...NO_SKILL_MODIFIERS, resilience: 5 }).lightning!;
    e.status.controlProfile[slot] = ControlProfile.Boss;
    e.impacts.lightning(source, target, 90, false, { ...stats, accuracy: 0 }, values); settle(0);
    expect(e.status.conductiveUntil[slot]).toBe(0); expect(e.status.staticGuardUntil[e.player]).toBe(0);
    e.status.apply(StatusKind.Barrier, source, target, 1000, 1000, 0);
    e.impacts.lightning(source, target, 90, false, stats, values); settle(10);
    expect(e.vitals.health[slot]).toBe(100000); expect(e.status.conductiveUntil[slot]).toBe(490); expect(e.status.canAct(slot, 10)).toBe(true);
    expect(e.status.staticGuardUntil[e.player]).toBe(370);
    e.status.apply(StatusKind.Protection, source, source, .03, 500, 10); expect(e.status.protection(e.player, 10)).toBe(.05);
    const health = e.vitals.health[e.player]; e.status.burns.apply(999, source, 10, 10, 480);
    resolution.advanceBurns(70, { ...stats, armor: 0, damageReduction: 0 }, () => {});
    expect(e.vitals.health[e.player]).toBeLessThan(health); expect(e.status.staticGuardUntil[e.player]).toBe(370);
    e.status.advance(370); expect(e.status.protection(e.player, 370)).toBe(.03);
});

test("conductive replaces its single provenance and full deadline, survives source removal and clears on target reuse", () => {
    const { e, spawn } = arena(), slot = spawn(0, 2), target = e.world.ids[slot], other = spawn(2, 2), source = e.world.ids[other];
    e.status.apply(StatusKind.Conductive, source, target, 1, 480, 0);
    e.remove(other); expect(e.status.source(StatusKind.Conductive, slot)).toBe(source);
    e.status.apply(StatusKind.Conductive, 999, target, 1, 200, 10);
    expect(e.status.source(StatusKind.Conductive, slot)).toBe(999); expect(e.status.conductiveUntil[slot]).toBe(200);
    expect(e.status.save(slot, 10)).toEqual([{ kind: StatusKind.Conductive, source: 999, amount: 1, remaining: 190 }]);
    e.remove(slot); const reused = spawn(0, 2); expect(e.status.conductiveUntil[reused]).toBe(0);
});

test("lightning fields snapshot casting stats, block refunds until completion and clear on restore with recovery preserved", () => {
    const { e, stats, random, spawn, resolution } = arena(), skills = new SkillSystem(e), ranks = initialSkillRanks(), victim = spawn(0, 2);
    for (const [id, rank] of Object.entries({ arc: 10, "arc.power": 5, thunderlance: 3, thunderstrike: 1 })) ranks[nodeIndex(id)] = rank;
    skills.points = 19; expect(skills.commitBuild(ranks, 0, 20, false, 0)).toBeNull(); skills.equip("thunderstrike", 0, 20);
    const mutable = { ...stats }; expect(skills.cast("thunderstrike", 0, mutable, 20, random)).toBe(true); mutable.damage = 10000;
    skills.advanceCasting(54, random, false, () => {});
    skills.advanceOngoing(108, random, () => resolution.resolve(108, mutable, random, false, () => {}));
    expect(100000 - e.vitals.health[victim]).toBe(80);
    expect(skills.commitBuild(initialSkillRanks(), 1, 20, true, 108)).not.toBeNull();
    const cp = skills.checkpoint(108); skills.restore(cp, 108);
    expect(e.effects.buffer.count).toBe(0); const health = e.vitals.health[victim];
    skills.advanceOngoing(200, random, () => resolution.resolve(200, stats, random, false, () => {})); expect(e.vitals.health[victim]).toBe(health);
    expect(skills.snapshot(108).remaining.thunderstrike).toBeGreaterThan(0);
});

test("refunding static guard removes only its own state and preserves fire and external protection", () => {
    const { e } = arena(), skills = new SkillSystem(e), ranks = initialSkillRanks(), source = e.world.ids[e.player];
    for (const [id, rank] of Object.entries({ arc: 10, "arc.power": 5, "arc.shape": 3, "lightning.resilience": 5 })) ranks[nodeIndex(id)] = rank;
    skills.points = 23; expect(skills.commitBuild(ranks, 0, 24, true, 0)).toBeNull();
    e.status.apply(StatusKind.StaticGuard, source, source, .05, 360, 0);
    e.status.apply(StatusKind.Protection, source, source, .03, 240, 0);
    e.status.apply(StatusKind.Protection, 999, source, .1, 120, 0);
    const remaining = [...ranks]; remaining[nodeIndex("lightning.resilience")] = 0;
    expect(skills.commitBuild(remaining, 1, 24, true, 10)).toBeNull();
    expect(skills.points).toBe(5); expect(e.status.staticGuardUntil[e.player]).toBe(0);
    expect(e.status.protection(e.player, 10)).toBe(.1);
    e.status.advance(120); expect(e.status.protection(e.player, 120)).toBe(.03);
    e.status.advance(240); expect(e.status.protection(e.player, 240)).toBe(0);
});

test("full population area spells, chain overlap and exact status expiry stay inside shared buffers", () => {
    const { e, lightning, stats, random, spawn, settle } = arena();
    for (let i = 0; i < MAX_ENEMIES; i++) spawn(0, 2);
    for (const id of ["thunderfield", "thunderstrike", "judgment"] as const) lightning.release(id, 0, stats, skillValues(id, 1, stats), 0, 2, 0, random);
    let hits = 0;
    for (let tick = 1; tick <= 1000; tick++) {
        e.status.advance(tick); lightning.advance(tick, random, () => { hits += e.impacts.count; settle(tick); });
    }
    expect(hits).toBe(MAX_ENEMIES * 12); expect(e.enemies.count).toBe(MAX_ENEMIES); expect(lightning.ongoing).toBe(false);
    for (const slot of e.enemies.slots.slice(0, e.enemies.count)) expect(e.status.conductiveUntil[slot]).toBe(0);
});

test("save and transferable render state preserve new status deadlines, provenance and isolation", () => {
    const sim = new CombatSimulation("lightning-save"), e = (sim as unknown as { entities: CombatWorld }).entities, source = e.world.ids[e.player];
    e.status.apply(StatusKind.Conductive, 999, source, 1, 480, 0); e.status.apply(StatusKind.StaticGuard, source, source, .05, 360, 0);
    const cp = sim.checkpoint(); expect(cp.version).toBe(9); expect(() => validateCharacterCheckpoint({ ...cp, version: 7 } as never)).toThrow();
    sim.restore(cp); const again = sim.checkpoint(); sim.restore(again); expect(sim.checkpoint()).toEqual(again);
    expect(e.status.source(StatusKind.Conductive, e.player)).toBe(-1); expect(e.status.staticGuardUntil[e.player]).toBe(360);
    const frame = new RenderFrame(), packet = frame.write(sim.getRenderState()), transfer = structuredClone(packet, { transfer: [packet.buffer] });
    const view = new RenderFrame(transfer.buffer).read(transfer);
    expect(view.entities.status.conductiveUntil[e.player]).toBe(480); view.entities.status.conductiveUntil[e.player] = 0;
    expect(e.status.conductiveUntil[e.player]).toBe(480); sim.dispose();
});
