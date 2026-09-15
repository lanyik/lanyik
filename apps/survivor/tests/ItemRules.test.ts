import type { CombatRewards } from "../src/core/CombatRewards";
import { expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { compareInventoryItems, createConsumable, generateConsumable, potionRecovery, selectConsumable, POTION_TYPES, type InventoryItem } from "../src/core/InventoryItem";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { generateOrb } from "../src/core/Orbs";
import { createStarterEquipment, EMPTY_BONUSES } from "../src/core/Equipment";
import { canStack } from "../src/core/Inventory";
import { GAME_CONFIG } from "../src/core/GameConfig";
import { RARITIES } from "../src/core/Loot";
import type { CombatWorld } from "../src/core/CombatWorld";
import type { RegionalWorld } from "../src/core/RegionalWorld";

test("fixed recipes bound stack variety; quality scales flat and percent recovery without item levels", () => {
    const random = new DeterministicRandom("fixed-recipes"), variants = new Set<string>();
    for (let id = 0; id < 5000; id++) {
        const item = generateConsumable(random, id);
        expect(item).not.toHaveProperty("itemLevel"); variants.add(`${item.value}:${item.rarity}`);
        expect(canStack(item, createConsumable(id + 10000, item.rarity, item.value))).toBe(true);
    }
    expect(variants.size).toBe(16);
    expect(generateOrb(random, 6000)).not.toHaveProperty("itemLevel");
    const stats = { maxHealth: 1000, maxMana: 400, regenBonus: .25 };
    expect(potionRecovery(createConsumable(1, "common", "health"), stats)).toEqual({ health: 75, mana: 0 });
    expect(potionRecovery(createConsumable(2, "rare", "health-percent"), stats)).toEqual({ health: 562.5, mana: 0 });
    expect(potionRecovery(createConsumable(3, "legendary", "mana-percent"), stats)).toEqual({ health: 187.5, mana: 240 });
    expect(canStack(createConsumable(4, "common", "health"), createConsumable(5, "common", "health-percent"))).toBe(false);
});

test("sorting is transitive across potion recipes and orb types, with IDs only breaking final ties", () => {
    const random = new DeterministicRandom("mixed-order"), items: InventoryItem[] = [
        ...POTION_TYPES.map((type, i) => createConsumable(20 - i, "rare", type)),
        ...Array.from({ length: 6 }, (_, i) => ({ ...generateOrb(random, i), rarity: "rare" as const }))
    ];
    const sorted = [...items].sort(compareInventoryItems);
    expect([...items].reverse().sort(compareInventoryItems)).toEqual(sorted);
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) expect(compareInventoryItems(sorted[i], sorted[j])).toBeLessThan(0);
});

test("gold potions can restore the secondary resource with primary full; full resources consume nothing", () => {
    const simulation = new CombatSimulation("gold-potion");
    const fixture = simulation as unknown as { inventory: InventoryItem[]; health: number; mana: number; potionCooldown: number };
    fixture.inventory = [createConsumable(9, "legendary", "health", 2)]; fixture.mana = 0;
    simulation.useConsumable("health", 9);
    const after = simulation.getSnapshot().player;
    expect(after.mana).toBeCloseTo(after.stats.maxMana * .15); expect(after.inventory[0].size).toBe(1);
    simulation.useConsumable("health", 9); expect(simulation.getSnapshot().player.inventory[0].size).toBe(1);
    fixture.potionCooldown = 0; fixture.mana = after.stats.maxMana;
    simulation.useConsumable("health", 9); expect(simulation.getSnapshot().player.inventory[0].size).toBe(1);
    fixture.health = 1; fixture.inventory = [createConsumable(10, "legendary", "health-percent")];
    simulation.useConsumable("health", 10);
    expect(simulation.getSnapshot().player.health).toBeCloseTo(1 + after.stats.maxHealth * .6 * (1 + after.stats.regenBonus));
    expect(simulation.getSnapshot().player.inventory).toHaveLength(0); simulation.dispose();
});

test("quick slots choose the smallest sufficient dose, then largest available, independent of sorting", () => {
    const items = [createConsumable(1, "rare", "health"), createConsumable(2, "common", "health-percent"), createConsumable(3, "common", "health")];
    const player = { health: 910, mana: 100, stats: { maxHealth: 1000, maxMana: 100, regenBonus: 0 } };
    expect(selectConsumable(items, "health", player)?.id).toBe(2);
    expect(selectConsumable([...items].reverse(), "health", player)?.id).toBe(2);
    expect(selectConsumable(items, "health", { ...player, health: 0 })?.id).toBe(1);
    expect(selectConsumable(items, "mana", player)).toBeUndefined();
});

test("automatic quality threshold is inclusive and preserves locked equipment and other categories", () => {
    const simulation = new CombatSimulation("quality-clear"), random = new DeterministicRandom("orbs");
    const fixture = simulation as unknown as { inventory: InventoryItem[] };
    fixture.inventory = [...RARITIES.map((rarity, index) => ({ ...createStarterEquipment(), id: 100 + index, rarity, locked: index === 1, bonuses: EMPTY_BONUSES })),
        generateOrb(random, 200), ...POTION_TYPES.map((type, i) => createConsumable(300 + i, "common", type))];
    simulation.setAutoRecycle("equipment", "rare");
    const player = simulation.getSnapshot().player;
    expect(player.inventory.map(item => item.id)).toEqual([101, 103, 104, 105, 200, 300, 301, 302, 303]);
    expect(player.recycled.equipment).toBe(2); expect(player.equipment.weapon?.id).toBe(1); expect(player.autoRecycle.equipment).toBe("rare");
    simulation.setAutoRecycle("equipment", "rainbow"); expect(simulation.getSnapshot().player.inventory).toHaveLength(6);
    simulation.setEquipmentLock(101, false); expect(simulation.getSnapshot().player.inventory).toHaveLength(5);
    expect(() => simulation.setAutoRecycle("equipment", "missing" as never)).toThrow(RangeError); simulation.dispose();
});

test("orb swaps are atomic with a full orb bag, preserve ratings and reject locked sockets", () => {
    const simulation = new CombatSimulation("orb-swap"), random = new DeterministicRandom("orbs");
    const fixture = simulation as unknown as { inventory: InventoryItem[] };
    fixture.inventory = Array.from({ length: GAME_CONFIG.inventory.orb.capacity }, (_, i) => generateOrb(random, 100 + i));
    simulation.equipOrb(100, 0); simulation.equipOrb(101, 1);
    fixture.inventory.push(generateOrb(random, 1000), generateOrb(random, 1001));
    const before = simulation.getSnapshot().player;
    expect(simulation.equipOrb(100, 2).ok).toBe(false);
    simulation.equipOrb(100, 1);
    const after = simulation.getSnapshot().player;
    expect(after.orbs.slice(0, 2).map(orb => orb?.id)).toEqual([101, 100]);
    expect(after.lootProfile).toEqual(before.lootProfile); expect(after.inventory).toEqual(before.inventory);
    simulation.equipOrb(102, 1);
    expect(simulation.getSnapshot().player.inventory).toHaveLength(GAME_CONFIG.inventory.orb.capacity);
    expect(simulation.getSnapshot().player.orbs[1]?.id).toBe(102); simulation.dispose();
});

test("unloading permanently removes all ground item categories and XP; revisiting does not resurrect their identities", () => {
    const simulation = new CombatSimulation("ground-expiry"), random = new DeterministicRandom("orb-expiry");
    const fixture = simulation as unknown as { rewards: CombatRewards; world: RegionalWorld; entities: CombatWorld; reconcileRegions(): void };
    const { x, z } = simulation.getSnapshot().player;
    for (const item of [createStarterEquipment(), createConsumable(10, "common", "mana"), generateOrb(random, 11)]) fixture.rewards.drop(item, x, z);
    fixture.entities.spawnExperience(x, z, 5);
    fixture.world.synchronize(x + 12, z); fixture.reconcileRegions();
    expect(fixture.rewards.groundItems.size).toBe(3);
    fixture.world.synchronize(x + 120, z); fixture.reconcileRegions();
    expect(fixture.rewards.groundItems.size).toBe(0); expect(fixture.entities.loot.count).toBe(0); expect(fixture.entities.experience.count).toBe(0);
    fixture.world.synchronize(x, z); fixture.reconcileRegions();
    expect(fixture.rewards.groundItems.size).toBe(0); expect(fixture.entities.loot.count).toBe(0); expect(fixture.entities.experience.count).toBe(0);
    simulation.dispose();
});
