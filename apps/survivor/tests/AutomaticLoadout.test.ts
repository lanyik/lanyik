import { expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { experienceForLevel } from "../src/core/CharacterState";
import { planAutomaticLoadout } from "../src/core/AutomaticLoadout";
import { createStarterEquipment, EMPTY_BONUSES, equipmentScore, type Equipment, type EquippedItems } from "../src/core/Equipment";
import { createOrb, type Orb } from "../src/core/Orbs";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { EMPTY_RECYCLING } from "../src/core/Recycling";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import type { CharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import type { CombatWorld } from "../src/core/CombatWorld";
import type { CombatRewards } from "../src/core/CombatRewards";
import * as evaluation from "../src/core/EquipmentEvaluation";
import * as loadout from "../src/core/AutomaticLoadout";
import type { RegionalWorld } from "../src/core/RegionalWorld";

const attributes = { might: 5, vitality: 5, agility: 5, spirit: 5 };
function gear(id: number, damage: number, itemLevel = 1, extra: Partial<Equipment> = {}): Equipment {
    const bonuses = { ...EMPTY_BONUSES, damage };
    return Object.freeze({ ...createStarterEquipment(), id, itemLevel, locked: false, autoEquipped: false,
        baseBonuses: EMPTY_BONUSES, bonuses, affixes: [{ stat: "damage", value: damage, rarity: "common" }] as const, score: equipmentScore(bonuses), ...extra });
}
const old = () => gear(2, 10, 1, { locked: false, autoEquipped: true });
function input(inventory: InventoryItem[], equipment: EquippedItems = { weapon: old() }, orbs: (Orb | undefined)[] = Array(6).fill(undefined), level = 1) {
    return { inventory, equipment, orbs, attributes, level, recycling: EMPTY_RECYCLING };
}
function simulation(inventory: InventoryItem[], equipment: EquippedItems = { weapon: old() }, level = 1) {
    const sim = new CombatSimulation("automatic-loadout");
    const saved = sim.checkpoint();
    sim.restore({ ...saved, nextItemId: 10000, skills: { ...saved.skills, points: level - 1 }, player: { ...saved.player, inventory, equipment, level } });
    const fixture = sim as unknown as { character: { receiveItems(items: readonly InventoryItem[], protectedId?: number, receipt?: object): boolean; gainExperience(amount: number): void; }; entities: CombatWorld; rewards: CombatRewards; world: RegionalWorld; chests: { count: number }; };
    return { sim, fixture };
}

test("Z equips upgrades and unlocked orb sockets; stopping and manual replacement retain control", () => {
    const { sim, fixture } = simulation([gear(3, 30), createOrb(4, "rare", "harmony"), createOrb(5, "rare", "harmony")]);
    expect(sim.getSnapshot().player.equipment.weapon?.id).toBe(2);
    sim.toggleAutoCombat();
    expect(sim.getSnapshot().player.equipment.weapon).toMatchObject({ id: 3, locked: false, autoEquipped: true });
    expect(sim.getSnapshot().player.orbs.map(orb => orb?.id)).toEqual([4, 5, undefined, undefined, undefined, undefined]);
    expect(sim.equip(2).ok).toBe(true);
    expect(sim.getSnapshot().player.equipment.weapon).toMatchObject({ id: 2, autoEquipped: false });
    sim.step({ x: 0, z: 0, active: false });
    expect(sim.getSnapshot().player.equipment.weapon?.id).toBe(2);
    sim.toggleAutoCombat(); fixture.character.receiveItems([gear(6, 100, 30)]);
    expect(sim.getSnapshot().player.equipment.weapon?.id).toBe(2);
    sim.dispose();
});

test("battle power wins over raw exploration score, ties keep worn gear, and input order is stable", () => {
    const exploration = gear(3, 1, 1, { bonuses: { ...EMPTY_BONUSES, goldBonus: 1000 }, score: 100000 });
    const stronger = gear(4, 30), equivalent = gear(5, 30);
    for (const inventory of [[exploration, equivalent, stronger], [stronger, equivalent, exploration]]) {
        const plan = planAutomaticLoadout(input(inventory)); expect(plan.ok).toBe(true);
        if (!plan.ok) throw new Error("capacity");
        expect(plan.equipment.weapon?.id).toBe(4);
        const again = planAutomaticLoadout(input(plan.inventory, plan.equipment, plan.orbs));
        expect(again.ok && again.equipmentChanges).toBe(0);
    }
});

test.each([
    ["automatic low quality", { locked: false, autoEquipped: true }, true],
    ["manual protection", { locked: true, autoEquipped: false }, false],
    ["locked automatic history", { locked: true, autoEquipped: true }, false],
    ["legendary retention", { rarity: "legendary", locked: false, autoEquipped: true }, false],
    ["ordinary backpack reserve", { locked: false, autoEquipped: false }, false]
] as const)("obsolete cleanup respects %s", (_name, extra, sold) => {
    const previous = gear(2, 10, 1, extra), { sim } = simulation([gear(3, 100, 30)], { weapon: previous });
    const gold = sim.getSnapshot().player.gold; sim.toggleAutoCombat();
    const player = sim.getSnapshot().player;
    expect(player.equipment.weapon?.id).toBe(3);
    expect(player.inventory.some(item => item.id === 2)).toBe(!sold);
    expect(player.recycled.equipment).toBe(sold ? 1 : 0);
    expect(player.gold - gold).toBe(sold ? 18 : 0);
    sim.dispose();
});

test("small upgrades retain the old equipment, and manual locking permanently removes automatic retirement", () => {
    const { sim } = simulation([gear(3, 12, 2)]); sim.toggleAutoCombat();
    expect(sim.getSnapshot().player.inventory.find(item => item.id === 2)).toMatchObject({ autoEquipped: true });
    sim.setEquipmentLock(2, true);
    expect(sim.getSnapshot().player.inventory.find(item => item.id === 2)).toMatchObject({ locked: true, autoEquipped: false });
    const checkpoint = sim.checkpoint(); expect(checkpoint.version).toBe(10); sim.restore(checkpoint);
    expect(sim.getSnapshot().autoCombat.enabled).toBe(false);
    expect(sim.getSnapshot().player.equipment.weapon?.autoEquipped).toBe(true);
    expect(sim.getSnapshot().player.inventory.find(item => item.id === 2)).toMatchObject({ autoEquipped: false });
    const invalid = structuredClone(checkpoint); delete (invalid.player.equipment.weapon as { autoEquipped?: boolean }).autoEquipped;
    expect(() => validateCharacterCheckpoint(invalid)).toThrow(/装备/);
    expect(() => validateCharacterCheckpoint({ ...checkpoint, version: 4 } as unknown as CharacterCheckpoint)).toThrow(/版本/);
    sim.dispose();
});

test("orb optimization considers paired replacements instead of getting trapped in single-socket choices", () => {
    const current = [createOrb(10, "magic", "bounty"), createOrb(11, "magic", "bounty"), undefined, undefined, undefined, undefined];
    const plan = planAutomaticLoadout(input([createOrb(12, "rare", "harmony"), createOrb(13, "rare", "harmony")], {}, current));
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("capacity");
    expect(plan.orbs.slice(0, 2).map(orb => orb?.id)).toEqual([12, 13]);
    expect(plan.inventory.map(item => item.id)).toEqual([10, 11]);
});

test("orb selection precedes quality recycling and level unlocks trigger another selection", () => {
    const { sim, fixture } = simulation([createOrb(10, "rare", "harmony"), createOrb(11, "rare", "harmony"), createOrb(12, "magic", "bounty")], {}, 49);
    sim.toggleAutoCombat(); expect(sim.getSnapshot().player.orbs.filter(Boolean)).toHaveLength(2);
    fixture.character.gainExperience(experienceForLevel(49));
    expect(sim.getSnapshot().player.orbs.filter(Boolean)).toHaveLength(3);
    sim.setAutoRecycle("orb", "rainbow");
    expect(fixture.character.receiveItems([createOrb(13, "rainbow", "harmony")])).toBe(true);
    expect(sim.getSnapshot().player.orbs.some(orb => orb?.id === 13)).toBe(true);
    expect(sim.getSnapshot().player.recycled.orb).toBeGreaterThan(0);
    sim.dispose();
});

test("full equipment bags accept an upgrade when retiring the old item frees its return slot", () => {
    const { sim, fixture } = simulation(Array.from({ length: 80 }, (_, i) => gear(100 + i, 1)));
    sim.toggleAutoCombat();
    const better = gear(500, 100, 30), player = sim.getSnapshot().player;
    fixture.rewards.drop(better, player.x, player.z);
    sim.step({ x: 0, z: 0, active: false });
    expect(sim.getSnapshot().player.equipment.weapon?.id).toBe(500);
    expect(sim.getSnapshot().player.inventory).toHaveLength(80);
    expect(fixture.rewards.groundItems.has(500)).toBe(false);
    sim.dispose();
});

test("a blocked multi-item receipt changes no equipment, sockets, recycling, resources or inventory", () => {
    const { sim, fixture } = simulation(Array.from({ length: 32 }, (_, i) => createConsumable(100 + i, "common", "health", 99)));
    sim.toggleAutoCombat(); const before = sim.checkpoint();
    expect(fixture.character.receiveItems([gear(500, 100, 30), createOrb(501, "rainbow", "harmony"), createConsumable(502, "rare", "mana")])).toBe(false);
    expect(sim.checkpoint()).toEqual(before);
    sim.dispose();
});

test("a protected challenge reward is retained despite recycling rules", () => {
    const plan = planAutomaticLoadout({ ...input([], { weapon: gear(2, 1000, 100) }), recycling: { ...EMPTY_RECYCLING, equipment: "rainbow" } },
        [gear(500, 10, 30, { rarity: "rainbow" })], 500);
    expect(plan.ok && plan.inventory.map(item => item.id)).toEqual([500]);
});

test("a full-bag failure is cached until an inventory change, including consuming a potion in place", () => {
    const { sim, fixture } = simulation(Array.from({ length: 32 }, (_, i) => createConsumable(100 + i, "common", "health", 99)));
    sim.toggleAutoCombat();
    const rewards = [gear(500, 100, 30), createConsumable(501, "common", "health", 1)], receipt = {};
    expect(fixture.character.receiveItems(rewards, 0, receipt)).toBe(false);
    const compare = vi.spyOn(evaluation, "compareEquipment");
    for (let attempt = 0; attempt < 120; attempt++) expect(fixture.character.receiveItems(rewards, 0, receipt)).toBe(false);
    expect(compare.mock.calls.length).toBe(0);
    Object.assign(sim, { health: 1 }); sim.useConsumable("health");
    sim.step({ x: 0, z: 0, active: false });
    expect(fixture.character.receiveItems(rewards, 0, receipt)).toBe(true);
    expect(compare.mock.calls.length).toBeGreaterThan(0); compare.mockRestore(); sim.dispose();
});

test("idle ticks do not rescan equipment", () => {
    const { sim, fixture } = simulation([gear(3, 20)]); sim.toggleAutoCombat();
    while (fixture.entities.enemies.count) fixture.entities.remove(fixture.entities.enemies.slots[0]);
    for (const chunk of fixture.world.chunks.values()) chunk.chestOpened = true;
    fixture.chests.count = 0;
    const compare = vi.spyOn(evaluation, "compareEquipment");
    for (let tick = 0; tick < 120; tick++) sim.step({ x: 0, z: 0, active: false });
    expect(compare).not.toHaveBeenCalled(); compare.mockRestore(); sim.dispose();
});

test("simultaneous pickups plan at most one receipt per tick and retain every deferred item", () => {
    const { sim, fixture } = simulation([]);
    while (fixture.entities.enemies.count) fixture.entities.remove(fixture.entities.enemies.slots[0]);
    for (const chunk of fixture.world.chunks.values()) chunk.chestOpened = true;
    fixture.chests.count = 0; sim.toggleAutoCombat();
    const player = sim.getSnapshot().player;
    for (let i = 0; i < 6; i++) fixture.rewards.drop(gear(100 + i, 20 + i, 2), player.x, player.z);
    const plan = vi.spyOn(loadout, "planAutomaticLoadout");
    for (let tick = 1; tick <= 6; tick++) {
        sim.step({ x: 0, z: 0, active: false });
        expect(plan).toHaveBeenCalledTimes(tick);
        expect(fixture.rewards.groundItems.size).toBe(6 - tick);
    }
    const after = sim.getSnapshot().player;
    expect([...after.inventory, ...Object.values(after.equipment)].filter(item => item && item.id >= 100).map(item => item!.id).sort()).toEqual([100, 101, 102, 103, 104, 105]);
    expect(sim.drainNotices().some(notice => notice.message.includes("空间不足"))).toBe(false);
    plan.mockRestore(); sim.dispose();
});
