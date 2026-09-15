import type { CombatRewards } from "../src/core/CombatRewards";
import { expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld } from "../src/core/CombatWorld";
import { createStarterEquipment } from "../src/core/Equipment";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { GAME_CONFIG } from "../src/core/GameConfig";

function fixture() {
    const simulation = new CombatSimulation("pickup-attraction");
    const runtime = simulation as unknown as { rewards: CombatRewards; entities: CombatWorld; inventory: InventoryItem[];
        advanceExperience(): void; collectEquipment(): void };
    return { simulation, runtime, world: runtime.entities };
}

test("equipment and consumables follow the same attraction trajectory and arrival as experience", () => {
    const { simulation, runtime, world } = fixture();
    try {
        const radius = simulation.getSnapshot().player.stats.pickupRadius, x = radius * .9;
        world.spawnExperience(x, 0, 1); runtime.rewards.drop({ ...createStarterEquipment(), id: 900 }, x, 0);
        runtime.rewards.drop(createConsumable(901, "common", "mana", 2), x, 0);
        const orb = world.experience.slots[0], loot = world.loot.slots[0];
        runtime.advanceExperience(); runtime.collectEquipment();
        expect(world.position.x[loot]).toBeLessThan(x); expect(world.position.x[loot]).toBeCloseTo(world.position.x[orb], 10);
        expect(world.position.previousX[loot]).toBe(x);
        for (let i = 0; i < 120; i++) { runtime.advanceExperience(); runtime.collectEquipment(); }
        expect(world.experience.count).toBe(0); expect(world.loot.count).toBe(0);
        expect(simulation.getSnapshot().player.inventory.map(item => item.id)).toEqual([900, 901]);
    } finally { simulation.dispose(); }
});

test("out-of-range loot stays put; full bags preserve attracted drops and collect once space returns", () => {
    const { simulation, runtime, world } = fixture();
    try {
        const radius = simulation.getSnapshot().player.stats.pickupRadius;
        runtime.rewards.drop({ ...createStarterEquipment(), id: 900 }, radius + 1, 0);
        runtime.collectEquipment(); expect(world.position.x[world.loot.slots[0]]).toBe(radius + 1);
        runtime.inventory = Array.from({ length: GAME_CONFIG.inventory.equipment.capacity }, (_, i) => ({ ...createStarterEquipment(), id: 1000 + i }));
        runtime.rewards.drop({ ...createStarterEquipment(), id: 901 }, radius * .8, 0);
        for (let i = 0; i < 120; i++) runtime.collectEquipment();
        expect(world.loot.count).toBe(2); const slot = world.loot.slots[1];
        expect(world.position.x[slot]).toBeLessThan(.4);
        runtime.collectEquipment(); expect(world.position.previousX[slot]).toBe(world.position.x[slot]);
        runtime.inventory.pop(); runtime.collectEquipment();
        expect(world.loot.count).toBe(1); expect(world.item.id[world.loot.slots[0]]).toBe(900);
        expect(runtime.inventory.filter(item => item.id === 901)).toHaveLength(1);
    } finally { simulation.dispose(); }
});
