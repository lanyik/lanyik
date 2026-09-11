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
    const potion = createConsumable(300, 1, "health", 98);
    const bag = insertInventoryItem(gear, potion)!;
    expect(inventorySlots(bag, "equipment")).toBe(40); expect(inventorySlots(bag, "consumable")).toBe(1);
    for (let id = 1; id < GAME_CONFIG.inventory.consumable.capacity; id++) bag.push(createConsumable(300 + id, id + 1, "mana", 99));
    const merged = insertInventoryItem(bag, createConsumable(400, 1, "health"))!;
    expect(merged.find(item => item.id === 300)?.size).toBe(99);
    expect(merged).toHaveLength(bag.length); expect(potion.size).toBe(98);
    expect(insertInventoryItem(merged, createConsumable(401, 1, "health"))).toBeUndefined();
    expect(insertInventoryItem(merged, generateOrb(new DeterministicRandom("bag"), 500, 1))).toBeDefined();
});

test("merge preserves quantity and potency, stable surviving IDs, and stack limits", () => {
    const potions = [createConsumable(10, 1, "health", 70), createConsumable(11, 1, "health", 50),
        createConsumable(12, 1, "health", 10), createConsumable(13, 2, "health", 7), createConsumable(14, 1, "mana", 3)];
    const merged = mergeInventory(potions);
    expect(merged.map(item => [item.id, item.size])).toEqual([[10, 99], [11, 31], [13, 7], [14, 3]]);
    expect(merged.reduce((sum, item) => sum + item.size, 0)).toBe(140);
    expect(mergeInventory(merged)).toEqual(merged);
    expect(potions[0].size).toBe(70);
});

test("using a stacked potion consumes exactly one dose and retains the stack ID", () => {
    const simulation = new CombatSimulation("potion-stack");
    const fixture = simulation as unknown as { inventory: InventoryItem[] };
    fixture.inventory = [createConsumable(100, 1, "mana", 3)];
    simulation.castSkill("pulse"); simulation.useConsumable("mana", 100);
    expect(simulation.getSnapshot().player.inventory[0]).toMatchObject({ type: "consumable", value: "mana", size: 2, id: 100 });
    simulation.useConsumable("mana", 100);
    expect(simulation.getSnapshot().player.inventory[0].size).toBe(2);
    simulation.dispose();
});

test("a blocked chest leaves potion stacks, RNG, gold and all rewards untouched", () => {
    const simulation = new CombatSimulation("equipment-transactions");
    const fixture = simulation as unknown as { inventory: InventoryItem[]; world: RegionalWorld; playerX: number; playerZ: number;
        random: DeterministicRandom; nextItemId: number; openNearbyChest(): void };
    const random = new DeterministicRandom("full-orbs");
    fixture.inventory = Array.from({ length: GAME_CONFIG.inventory.orb.capacity }, (_, i) => generateOrb(random, 100 + i, 1));
    const chunk = [...fixture.world.chunks.values()].find(chunk => chunk.chest?.hasOrb)!;
    chunk.band = "near"; fixture.playerX = chunk.chest!.x; fixture.playerZ = chunk.chest!.z;
    // A changed region cache must still reach the render buffer when opening is blocked.
    const otherChest = [...fixture.world.chunks.values()].find(other => other !== chunk && other.chest)!;
    otherChest.chestOpened = true;
    const visibleChests = simulation.getRenderState().chests.count;
    const before = simulation.getSnapshot(), nextRandom = fixture.random.clone().nextUint32(), nextId = fixture.nextItemId;
    fixture.openNearbyChest();
    expect(chunk.chestOpened).toBe(false); expect(fixture.nextItemId).toBe(nextId);
    expect(fixture.random.clone().nextUint32()).toBe(nextRandom);
    expect(simulation.getSnapshot().player.inventory).toEqual(before.player.inventory);
    expect(simulation.getSnapshot().player.gold).toBe(before.player.gold);
    expect(simulation.getRenderState().chests.count).toBe(visibleChests - 1);
    simulation.discard(100); fixture.openNearbyChest();
    expect(chunk.chestOpened).toBe(true);
    expect(inventorySlots(simulation.getSnapshot().player.inventory, "orb")).toBe(GAME_CONFIG.inventory.orb.capacity);
    simulation.dispose();
});
