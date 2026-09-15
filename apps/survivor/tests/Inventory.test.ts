import type { CombatRewards } from "../src/core/CombatRewards";
import { recycleRef } from "../src/core/Recycling";
import { expect, test } from "vitest";
import { GAME_CONFIG } from "../src/core/GameConfig";
import { insertInventoryItem, inventorySlots, mergeInventory } from "../src/core/Inventory";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { createStarterEquipment } from "../src/core/Equipment";
import { generateOrb } from "../src/core/Orbs";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { CombatSimulation } from "../src/core/CombatSimulation";
import type { RegionalWorld } from "../src/core/RegionalWorld";

test("category capacities are independent and a full potion bag can accept matching stack space", () => {
    const gear = Array.from({ length: GAME_CONFIG.inventory.equipment.capacity }, (_, id) => ({ ...createStarterEquipment(), id: id + 100 }));
    expect(insertInventoryItem(gear, { ...createStarterEquipment(), id: 200 })).toBeUndefined();
    const potion = createConsumable(300, "common", "health", 98);
    const bag = insertInventoryItem(gear, potion)!;
    expect(inventorySlots(bag, "equipment")).toBe(80); expect(inventorySlots(bag, "consumable")).toBe(1);
    for (let id = 1; id < GAME_CONFIG.inventory.consumable.capacity; id++) bag.push(createConsumable(300 + id, "common", "mana", 99));
    const merged = insertInventoryItem(bag, createConsumable(400, "common", "health"))!;
    expect(merged.find(item => item.id === 300)?.size).toBe(99);
    expect(merged).toHaveLength(bag.length); expect(potion.size).toBe(98);
    expect(insertInventoryItem(merged, createConsumable(401, "common", "health"))).toBeUndefined();
    expect(insertInventoryItem(merged, generateOrb(new DeterministicRandom("bag"), 500))).toBeDefined();
});

test("merge preserves quantity and potency, stable surviving IDs, and stack limits", () => {
    const potions = [createConsumable(10, "common", "health", 70), createConsumable(11, "common", "health", 50),
        createConsumable(12, "common", "health", 10), createConsumable(13, "magic", "health", 7), createConsumable(14, "common", "mana", 3)];
    const merged = mergeInventory(potions);
    expect(merged.map(item => [item.id, item.size])).toEqual([[10, 99], [11, 31], [13, 7], [14, 3]]);
    expect(merged.reduce((sum, item) => sum + item.size, 0)).toBe(140);
    expect(mergeInventory(merged)).toEqual(merged);
    expect(potions[0].size).toBe(70);
});

test("using a stacked potion consumes exactly one dose and retains the stack ID", () => {
    const simulation = new CombatSimulation("potion-stack");
    const fixture = simulation as unknown as { inventory: InventoryItem[] };
    fixture.inventory = [createConsumable(100, "common", "mana", 3)];
    simulation.castSkill("pulse"); simulation.useConsumable("mana", 100);
    expect(simulation.getSnapshot().player.inventory[0]).toMatchObject({ type: "consumable", value: "mana", size: 2, id: 100 });
    simulation.useConsumable("mana", 100);
    expect(simulation.getSnapshot().player.inventory[0].size).toBe(2);
    simulation.dispose();
});

test("a blocked chest leaves potion stacks, RNG, gold and all rewards untouched", () => {
    const simulation = new CombatSimulation("equipment-transactions");
    const fixture = simulation as unknown as { rewards: CombatRewards; inventory: InventoryItem[]; world: RegionalWorld; playerX: number; playerZ: number;
        random: DeterministicRandom; autoCast: boolean; attackCooldown: number; openNearbyChest(): void };
    const random = new DeterministicRandom("full-orbs");
    fixture.inventory = Array.from({ length: GAME_CONFIG.inventory.orb.capacity }, (_, i) => generateOrb(random, 100 + i));
    const chunk = [...fixture.world.chunks.values()].find(chunk => chunk.band !== "near" && chunk.chest?.hasOrb)!;
    fixture.playerX = chunk.chest!.x; fixture.playerZ = chunk.chest!.z;
    fixture.autoCast = false; fixture.attackCooldown = 1000;
    // A real residency shift must publish its chest changes even if the following opening is blocked.
    const before = simulation.getSnapshot(), nextRandom = fixture.random.clone().nextUint32(), nextId = fixture.rewards.nextItemId;
    simulation.step({ x: 0, z: 0, active: false });
    expect(chunk.band).toBe("near");
    expect(chunk.chestOpened).toBe(false); expect(fixture.rewards.nextItemId).toBe(nextId);
    expect(fixture.random.clone().nextUint32()).toBe(nextRandom);
    expect(simulation.getSnapshot().player.inventory).toEqual(before.player.inventory);
    expect(simulation.getSnapshot().player.gold).toBe(before.player.gold);
    expect(simulation.getRenderState().chests.count).toBe([...fixture.world.chunks.values()].filter(value => value.chest && !value.chestOpened).length);
    simulation.craft({ kind: "recycle", item: recycleRef(simulation.getSnapshot().player.inventory.find(item => item.id === 100)!) }); fixture.openNearbyChest();
    expect(chunk.chestOpened).toBe(true);
    expect(inventorySlots(simulation.getSnapshot().player.inventory, "orb")).toBe(GAME_CONFIG.inventory.orb.capacity);
    simulation.dispose();
});
