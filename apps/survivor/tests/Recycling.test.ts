import { describe, expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { createStarterEquipment, EMPTY_BONUSES, type Equipment } from "../src/core/Equipment";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { createOrb } from "../src/core/Orbs";
import { createAffixItem } from "../src/core/AffixItem";
import { recycleRef, recycleReward } from "../src/core/Recycling";

const weak = (id: number): Equipment => ({ ...createStarterEquipment(), id, locked: false, bonuses: EMPTY_BONUSES });
function setup(items: InventoryItem[]) {
    const simulation = new CombatSimulation("recycling");
    const fixture = simulation as unknown as { inventory: InventoryItem[]; dropItem(item: InventoryItem, x: number, z: number): void; collectEquipment(): void };
    fixture.inventory = items;
    return { simulation, fixture };
}
describe("category recycling", () => {
    test("manual level batch is strict, locked-safe, stale-safe and credits only once", () => {
        const low = { ...weak(10), itemLevel: 4 }, locked = { ...weak(11), itemLevel: 4, locked: true }, boundary = { ...weak(12), itemLevel: 5 };
        const { simulation } = setup([low, locked, boundary]);
        simulation.craft({ kind: "recycle-equipment", belowLevel: 5, items: [low, locked] });
        expect(simulation.getSnapshot().player.inventory).toHaveLength(3);
        simulation.craft({ kind: "recycle-equipment", belowLevel: 5, items: [boundary] });
        expect(simulation.getSnapshot().player.gold).toBe(0);
        simulation.craft({ kind: "recycle-equipment", belowLevel: 5, items: [low] });
        expect(simulation.getSnapshot().player.inventory).toEqual([locked, boundary]);
        expect(simulation.getSnapshot().player.gold).toBe(recycleReward(low).gold);
        simulation.craft({ kind: "recycle-equipment", belowLevel: 5, items: [low] });
        expect(simulation.getSnapshot().player.gold).toBe(recycleReward(low).gold); simulation.dispose();
    });
    test("each category has an independent threshold and grants the correct whole-stack reward", () => {
        const items = [weak(10), createOrb(11, "magic", "fortune"), createConsumable(12, "common", "health", 9), createAffixItem(13, { stat: "damage", value: 5, rarity: "rare" })];
        const { simulation } = setup(items);
        let gold = 0, dust = 0;
        for (const item of items) {
            simulation.setAutoRecycle(item.type, item.rarity);
            const reward = recycleReward(item); gold += reward.gold; dust += reward.dust;
            const state = simulation.getSnapshot().player;
            expect(state.inventory.some(other => other.id === item.id)).toBe(false);
            expect(state.gold).toBe(gold); expect(state.orbDust).toBe(dust); expect(state.recycled[item.type]).toBe(item.size);
        }
        simulation.setAutoRecycle("orb", null);
        expect(simulation.getSnapshot().player.autoRecycle.consumable).toBe("common"); simulation.dispose();
    });
    test("automatic sales protect locked, equal and better gear and empty slots", () => {
        const items: Equipment[] = [weak(10), { ...weak(11), locked: true }, { ...createStarterEquipment(), id: 12, locked: false },
            { ...weak(13), value: "boots" }, { ...createStarterEquipment(), id: 14, locked: false, bonuses: { ...EMPTY_BONUSES, damage: 100 } }];
        const { simulation } = setup(items); simulation.setAutoRecycle("equipment", "rainbow");
        expect(simulation.getSnapshot().player.inventory.map(item => item.id)).toEqual([11, 12, 13, 14]); simulation.dispose();
    });
    test("manual sale rejects locked, changed stacks and repeated operations without granting currency", () => {
        const potion = createConsumable(10, "rare", "mana", 3), locked = createStarterEquipment();
        const { simulation, fixture } = setup([potion, locked]), operation = { kind: "recycle" as const, item: recycleRef(potion) };
        fixture.inventory[0] = { ...potion, size: 2 };
        simulation.craft(operation); simulation.craft({ kind: "recycle", item: recycleRef(locked) });
        expect(simulation.getSnapshot().player.gold).toBe(0);
        const current = fixture.inventory[0]; simulation.craft({ kind: "recycle", item: recycleRef(current) });
        const after = simulation.getSnapshot().player;
        expect(after.gold).toBe(recycleReward(current).gold); expect(after.inventory).toEqual([locked]);
        simulation.craft({ kind: "recycle", item: recycleRef(current) }); expect(simulation.getSnapshot().player).toEqual(after); simulation.dispose();
    });
    test("full bags still process incoming auto-recycled drops and installed orbs are protected", () => {
        const { simulation, fixture } = setup([createOrb(10, "common", "fortune")]);
        simulation.equipOrb(10, 0); simulation.setAutoRecycle("orb", "rainbow");
        fixture.inventory = Array.from({ length: 48 }, (_, i) => createOrb(100 + i, "rainbow", "bounty"));
        fixture.dropItem(createOrb(999, "rare", "fortune"), 0, 0); fixture.collectEquipment();
        const after = simulation.getSnapshot().player;
        expect(after.orbDust).toBe(9); expect(after.orbs[0]?.id).toBe(10); expect(after.inventory).toHaveLength(48);
        simulation.removeOrb(0);
        expect(simulation.getSnapshot().player.orbDust).toBe(10); expect(simulation.getSnapshot().player.orbs[0]).toBeUndefined(); simulation.dispose();
    });
    test("sorting compacts compatible stacks then orders quality without losing quantities", () => {
        const { simulation } = setup([createConsumable(10, "common", "health", 80), createConsumable(11, "common", "health", 40), createOrb(12, "rainbow", "fortune")]);
        simulation.sortInventory(); const items = simulation.getSnapshot().player.inventory;
        expect(items[0].id).toBe(12); expect(items.filter(item => item.type === "consumable").map(item => item.size)).toEqual([99, 21]); simulation.dispose();
    });
});
