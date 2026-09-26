import { afterEach, expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld } from "../src/core/CombatWorld";
import type { CombatRewards } from "../src/core/CombatRewards";
import { SkillSystem } from "../src/core/SkillSystem";
import { PASSIVES, PASSIVE_IDS, compilePassiveEffects, passiveNodeId, type PassiveId } from "../src/core/PassiveSkills";
import { SKILL_NODES, initialSkillRanks, investedPoints, nodeIndex, validateSkillRanks } from "../src/core/SkillBuild";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import { deriveStats } from "../src/core/CombatStats";
import { createStarterEquipment, QUALITY_POWER, sumEquipment } from "../src/core/Equipment";
import { compareEquipment } from "../src/core/EquipmentEvaluation";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { BASE_LOOT_PROFILE, lootProfile } from "../src/core/Loot";
import { createOrb, sumOrbs } from "../src/core/Orbs";
import { planAutomaticLoadout } from "../src/core/AutomaticLoadout";
import * as loadout from "../src/core/AutomaticLoadout";
import { EMPTY_RECYCLING } from "../src/core/Recycling";
import { skillValues } from "../src/core/Skills";
import { GAME_CONFIG, ticksPerUpdate } from "../src/core/GameConfig";

afterEach(() => vi.restoreAllMocks());
const attributes = { might: 5, vitality: 5, agility: 5, spirit: 5 };
const stats = deriveStats(150, attributes, sumEquipment({}));
const pulseTicks = ticksPerUpdate(GAME_CONFIG.skills.passivePickupHz);
function build(ids: readonly PassiveId[], rank = 1) {
    const ranks = initialSkillRanks();
    for (const id of ids) ranks[nodeIndex(passiveNodeId(id))] = Math.min(rank, PASSIVES[id].maximum);
    return ranks;
}
function simulation(passives: readonly PassiveId[] = [], inventory: readonly InventoryItem[] = [], location: "wilds" | "homestead" = "homestead") {
    const sim = new CombatSimulation("passives", { x: 0, z: 0 }, undefined, undefined, location), cp = sim.checkpoint();
    const ranks = build(PASSIVE_IDS, 10);
    sim.restore({ ...cp, nextItemId: 10000, player: { ...cp.player, level: 150, health: 30, mana: 20, shieldRemaining: 5, inventory },
        skills: { ...cp.skills, points: 149 - investedPoints(ranks), ranks, passives: [passives[0] ?? null, passives[1] ?? null, passives[2] ?? null] } });
    const internals = sim as unknown as { entities: CombatWorld; rewards: CombatRewards; tickValue: number; collectEquipment(): void; advanceExperience(): void };
    function drop(item: InventoryItem, x = 100) { internals.rewards.groundItems.set(item.id, item); internals.entities.spawnLoot(item, x, 0); }
    return { sim, internals, drop };
}

test("utility has three independent ten-rank actives and nine equip-only passives with bounded meaningful ranks", () => {
    const utility = SKILL_NODES.filter(node => node.school === "utility");
    expect(utility).toHaveLength(12); expect(utility.every(node => !node.parent && !node.investment)).toBe(true);
    for (const id of ["pulse", "dash", "vortex"] as const) {
        expect(SKILL_NODES[nodeIndex(id)].maximum).toBe(10);
        const a = skillValues(id, 1, stats), b = skillValues(id, 10, stats);
        if (id === "dash") { expect(b.dashDistance).toBeCloseTo(5.6); expect(b.cooldown).toBeLessThan(a.cooldown); expect(b.duration).toBe(a.duration); }
        else { expect(b.damage).toBeGreaterThan(a.damage); expect(b.radius).toBeGreaterThan(a.radius); }
    }
    expect(validateSkillRanks(build(["magnet"]), 49)).not.toBeNull();
    expect(validateSkillRanks(build(["magnet"]), 50)).toBeNull();
    expect(validateSkillRanks(build(["fortune"], 10), 58)).not.toBeNull();
    expect(validateSkillRanks(build(["fortune"], 10), 59)).toBeNull();
});

test("passive slots unlock exactly at 50/100/150, swaps are unique, learning alone is inert and refund removes effects", () => {
    const skills = new SkillSystem(new CombatWorld(0, 0)); skills.points = 149;
    expect(skills.commitBuild(build(PASSIVE_IDS), 0, 150, true, 0)).toBeNull();
    expect(skills.passiveEffects).toEqual({ bonuses: {}, find: { quality: 0, quantity: 0, stars: 0 }, collectAll: false });
    for (const [slot, level] of [50, 100, 150].entries()) {
        expect(skills.equipPassive("magnet", slot, level - 1)).toBe(false);
        expect(skills.equipPassive("magnet", slot, level)).toBe(true);
    }
    expect(skills.passives).toEqual([null, null, "magnet"]);
    skills.equipPassive("fortune", 0, 150); skills.equipPassive("magnet", 0, 150);
    expect(skills.passives).toEqual(["magnet", null, "fortune"]);
    for (const slot of [-1, .5, 3, NaN]) expect(skills.equipPassive("aegis", slot, 150)).toBe(false);
    expect(skills.equipPassive("missing" as PassiveId, 0, 150)).toBe(false);
    expect(skills.commitBuild(initialSkillRanks(), 1, 150, true, 0)).toBeNull();
    expect(skills.passives).toEqual([null, null, null]); expect(skills.passiveEffects.collectAll).toBe(false);
    expect(skills.points).toBe(149); expect(skills.equipPassive("magnet", 0, 150)).toBe(false);
});

test("passive benefits and costs use ordinary stat caps and equipment comparisons keep the same permanent context", () => {
    const effects = compilePassiveEffects(["bloodpact", "execution", "aegis"], () => 10);
    const equipment = { weapon: createStarterEquipment() }, base = deriveStats(150, attributes, sumEquipment(equipment));
    const modified = deriveStats(150, attributes, sumEquipment(equipment), effects.bonuses);
    expect(modified.maxHealth).toBe(Math.round(base.maxHealth * .8));
    expect(modified.lifesteal - base.lifesteal).toBeCloseTo(.08);
    expect(modified.criticalChance - base.criticalChance).toBeCloseTo(-.03);
    expect(modified.shieldRecovery).toBe(base.shieldRecovery - 3);
    expect(modified.damageIncrease - base.damageIncrease).toBeCloseTo(-.15);
    expect(compareEquipment(equipment.weapon, { level: 150, attributes, equipment, stats: modified, passiveBonuses: effects.bonuses }).delta).toBe(0);
    const capped = deriveStats(150, attributes, { ...sumEquipment({}), criticalChance: 1, damageReduction: 1, shieldRecovery: 100 }, effects.bonuses);
    expect(capped.criticalChance).toBe(1); expect(capped.damageReduction).toBe(.75); expect(capped.shieldRecovery).toBe(2);
});

test("home equipment changes preserve resource ratios, active cooldowns and shield recharge; field/busy/dead changes reject", () => {
    const { sim } = simulation(); const before = sim.getSnapshot().player;
    sim.equipPassive("bloodpact", 0); let after = sim.getSnapshot().player;
    expect(after.health / after.stats.maxHealth).toBeCloseTo(before.health / before.stats.maxHealth);
    expect(after.mana / after.stats.maxMana).toBeCloseTo(before.mana / before.stats.maxMana);
    expect(after.shieldRemaining).toBe(5);
    sim.castSkill("pulse"); const readyAt = sim.checkpoint().skills.readyAt;
    sim.equipPassive("aegis", 0); expect(sim.getSnapshot().player.skills.passives[0]).toBe("bloodpact");
    expect(sim.checkpoint().skills.readyAt).toEqual(readyAt);
    const cp = sim.checkpoint("wilds"), field = new CombatSimulation(cp.seed, cp.origin); field.restore(cp);
    field.equipPassive(null, 0); expect(field.getSnapshot().player.skills.passives[0]).toBe("bloodpact"); field.dispose();
    (sim as unknown as { gameOverValue: boolean }).gameOverValue = true;
    sim.equipPassive(null, 0); expect(sim.getSnapshot().player.skills.passives[0]).toBe("bloodpact"); sim.dispose();
});

test("equipped ranks recompile, unequipping removes find/bonuses, and version 10 roundtrips without serializing derived effects", () => {
    const { sim } = simulation(["fortune", "stargazer", "aegis"]);
    const before = sim.getSnapshot().player, cp = sim.checkpoint();
    expect(cp.version).toBe(10); expect(cp.player).not.toHaveProperty("passiveBonuses");
    expect(before.lootProfile.ratings).toEqual({ quality: 120, stars: 150, quantity: 0 });
    sim.restore(cp); expect(sim.getSnapshot().player.stats).toEqual(before.stats);
    const ranks = [...cp.skills.ranks]; ranks[nodeIndex("passive.fortune")] = 3;
    sim.commitSkillBuild(ranks, cp.skills.revision); expect(sim.getSnapshot().player.lootProfile.ratings.quality).toBe(36);
    sim.equipPassive(null, 0); expect(sim.getSnapshot().player.lootProfile.ratings.quality).toBe(0);
    sim.equipPassive(null, 1); sim.equipPassive(null, 2);
    expect(sim.getSnapshot().player.passiveBonuses).toEqual({}); sim.dispose();
});

test("saves reject missing/unknown/duplicate/unlearned/locked passives and prior schemas before mutation", () => {
    const { sim } = simulation(["magnet"]), cp = sim.checkpoint();
    for (const passives of [undefined, [], Array(3), [undefined, null, null], ["missing", null, null], ["magnet", "magnet", null], ["pulse", null, null]]) {
        expect(() => validateCharacterCheckpoint({ ...cp, skills: { ...cp.skills, passives } } as never)).toThrow(/技能/);
    }
    const ranks = initialSkillRanks();
    expect(() => validateCharacterCheckpoint({ ...cp, skills: { ...cp.skills, points: 149, ranks } })).toThrow(/技能/);
    expect(() => validateCharacterCheckpoint({ ...cp, player: { ...cp.player, level: 99 }, skills: { ...cp.skills, points: 98 - investedPoints(cp.skills.ranks), passives: [null, "magnet", null] } })).toThrow(/技能/);
    expect(() => sim.restore({ ...cp, version: 9 } as never)).toThrow(/版本/);
    expect(sim.checkpoint()).toEqual(cp); sim.dispose();
});

test("find bonuses enter diminishing returns once; distributions normalize and invalid input cannot cancel against bonuses", () => {
    const ratings = { quality: 120, stars: 150, quantity: 100 }, profile = lootProfile({ quality: 0, stars: 0, quantity: 0 }, ratings);
    expect(profile).toEqual(lootProfile(ratings));
    expect(profile.qualities[0]).toBeLessThan(BASE_LOOT_PROFILE.qualities[0]);
    expect(profile.stars[2]).toBeGreaterThan(BASE_LOOT_PROFILE.stars[2]);
    expect(profile.normalDropChance).toBeCloseTo(.256);
    expect(profile.stars.reduce((a, b) => a + b, 0)).toBeCloseTo(1); expect(profile.qualities.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(() => lootProfile({ ...ratings, quality: -1 }, ratings)).toThrow();
    expect(() => lootProfile(ratings, { ...ratings, stars: NaN })).toThrow();
    expect(() => lootProfile({ ...ratings, stars: Number.MAX_VALUE }, { ...ratings, stars: Number.MAX_VALUE })).toThrow();
});

test("automatic orb search maximizes actual yield with passive find and equipment keeps permanent stats", () => {
    const orbs = [createOrb(11, "rare", "fortune"), createOrb(12, "rare", "bounty"), createOrb(13, "rare", "constellation"), createOrb(14, "rare", "harmony")];
    const passiveFind = { quality: 120, stars: 150, quantity: 100 }, passiveBonuses = { castSpeed: .35, attackSpeed: -.2 };
    const score = (chosen: typeof orbs) => {
        const p = lootProfile(sumOrbs(chosen), passiveFind);
        return p.normalDropChance * p.qualities.reduce((a, c, i) => a + c * QUALITY_POWER[i], 0) * p.stars.reduce((a, c, i) => a + c * (i + 2), 0);
    };
    const plan = planAutomaticLoadout({ level: 50, attributes, equipment: {}, inventory: orbs, orbs: Array(6).fill(undefined), recycling: EMPTY_RECYCLING, passiveFind, passiveBonuses });
    expect(plan.ok).toBe(true); if (!plan.ok) throw new Error("capacity");
    const slots = plan.orbs.filter(orb => !!orb).length, candidates: number[] = [];
    for (let mask = 0; mask < 16; mask++) { const chosen = orbs.filter((_, i) => mask & (1 << i)); if (chosen.length === slots) candidates.push(score(chosen)); }
    expect(score(plan.orbs.filter(orb => !!orb))).toBeCloseTo(Math.max(...candidates));
});

test("magnet drains distant loot/XP in bounded batches without walking or removing chests", () => {
    const { sim, internals: f, drop } = simulation(["magnet"]), e = f.entities;
    for (let i = 0; i < 40; i++) { drop({ ...createStarterEquipment(), id: 100 + i }); e.spawnExperience(100, i, 1); }
    const before = sim.getSnapshot(), chests = sim.getRenderState().chests.count;
    f.tickValue = pulseTicks - 1; f.collectEquipment(); f.advanceExperience(); expect(e.loot.count).toBe(40); expect(e.experience.count).toBe(40);
    f.tickValue++; f.collectEquipment(); f.advanceExperience(); expect(e.loot.count).toBe(24); expect(e.experience.count).toBe(24);
    for (let i = 0; i < 2; i++) { f.tickValue += pulseTicks; f.collectEquipment(); f.advanceExperience(); }
    expect(e.loot.count).toBe(0); expect(e.experience.count).toBe(0); expect(f.rewards.groundItems.size).toBe(0);
    const after = sim.getSnapshot(); expect(after.player.inventory.filter(item => item.type === "equipment")).toHaveLength(40);
    expect(after.player.experience - before.player.experience).toBe(40); expect(after.player.x).toBe(before.player.x); expect(sim.getRenderState().chests.count).toBe(chests);
    sim.equipPassive(null, 0); drop({ ...createStarterEquipment(), id: 201 }); f.tickValue += pulseTicks; f.collectEquipment(); expect(e.loot.count).toBe(1); sim.dispose();
});

test("full category preserves drops, bounds failed transactions and rotating scans still reach other categories", () => {
    const inventory = Array.from({ length: GAME_CONFIG.inventory.equipment.capacity }, (_, i) => ({ ...createStarterEquipment(), id: 100 + i }));
    const { sim, internals: f, drop } = simulation(["magnet"], inventory);
    for (let i = 0; i < 32; i++) drop({ ...createStarterEquipment(), id: 300 + i });
    drop(createConsumable(500, "common", "health"));
    const receive = vi.spyOn((f as unknown as { character: { receiveItems(items: readonly InventoryItem[]): boolean } }).character, "receiveItems");
    for (let i = 1; i <= 3; i++) { receive.mockClear(); f.tickValue = i * pulseTicks; f.collectEquipment(); expect(receive.mock.calls.length).toBeLessThanOrEqual(16); }
    expect(f.entities.loot.count).toBe(32); expect(f.rewards.groundItems.has(500)).toBe(false);
    expect(sim.getSnapshot().player.inventory.some(item => item.id === 500)).toBe(true); sim.dispose();
});

test("magnet respects automatic loadout's single receipt planning budget", () => {
    const { sim, internals: f, drop } = simulation(["magnet"], [], "wilds"); sim.toggleAutoCombat();
    for (let i = 0; i < 20; i++) drop({ ...createStarterEquipment(), id: 400 + i });
    const plan = vi.spyOn(loadout, "planAutomaticLoadout"); f.tickValue = pulseTicks; f.collectEquipment();
    expect(plan).toHaveBeenCalledTimes(1); expect(f.entities.loot.count).toBe(19); sim.dispose();
});
