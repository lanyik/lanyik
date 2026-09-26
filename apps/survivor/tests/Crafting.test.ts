import { recycleRef } from "../src/core/Recycling";
import { describe, expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { createStarterEquipment, withEquipmentAffixes, type Equipment, type EquipmentAffix } from "../src/core/Equipment";
import { createAffixItem } from "../src/core/AffixItem";
import { quoteCraft, type CraftOperation } from "../src/core/Crafting";
import { createOrb, orbDust, orbResonance, sumOrbs } from "../src/core/Orbs";
import type { InventoryItem } from "../src/core/InventoryItem";
import { GAME_CONFIG } from "../src/core/GameConfig";

const attack: EquipmentAffix = { stat: "damage", value: 40, rarity: "rare" };
const armor: EquipmentAffix = { stat: "armor", value: 20, rarity: "magic" };
function gear(id: number, affixes = [attack, armor]): Equipment {
    return { ...withEquipmentAffixes(createStarterEquipment("ranger"), affixes), id, locked: false, revision: 0 };
}
function fixture(items: InventoryItem[], gold = 100_000, dust = 100_000) {
    const simulation = new CombatSimulation("craft-transactions");
    const state = simulation as unknown as { character: { inventory: InventoryItem[]; orbDust: number; gold: number; nextId: number } };
    state.character.inventory = items; state.character.gold = gold; state.character.orbDust = dust; state.character.nextId = 1000;
    return simulation;
}

describe("crafting transactions", () => {
    test.each([null, "ranger"] as const)("inheritance preserves target armor access (%s), not the source weapon identity", requiredClass => {
        const source = gear(10), target = { ...gear(11), value: "chest" as const, requiredClass };
        const simulation = fixture([source, target]);
        simulation.craft({ kind: "inherit", source, target });
        expect(simulation.getSnapshot().player.inventory).toEqual([expect.objectContaining({
            id: target.id, value: "chest", requiredClass, affixes: source.affixes, revision: 1
        })]);
        simulation.dispose();
    });
    test("extract destroys the entire source, preserves exactly one affix, charges once and stacks by potency", () => {
        const source = gear(10), simulation = fixture([source, createAffixItem(20, attack)]);
        const op: CraftOperation = { kind: "extract", source, affix: 0 };
        const plan = quoteCraft(simulation.getSnapshot().player, op); expect(plan.ok).toBe(true);
        simulation.craft(op);
        const after = simulation.getSnapshot().player;
        expect(after.inventory).toEqual([{ ...createAffixItem(20, attack), size: 2 }]);
        expect(after.gold).toBe(100_000 - (plan.ok ? plan.gold : 0));
        simulation.craft(op); expect(simulation.getSnapshot().player).toEqual(after);
        simulation.dispose();
    });
    test("full affix capacity and insufficient currency leave source, gold and IDs intact", () => {
        for (const full of [false, true]) {
            const source = gear(10), items = full ? Array.from({ length: GAME_CONFIG.inventory.affix.capacity }, (_, i) => createAffixItem(20 + i, { ...armor, value: i + 1 })) : [];
            const simulation = fixture([source, ...items], full ? 100_000 : 0), before = simulation.getSnapshot().player;
            simulation.craft({ kind: "extract", source, affix: 0 });
            expect(simulation.getSnapshot().player).toEqual(before);
            expect((simulation as unknown as { character: { nextId: number } }).character.nextId).toBe(1000);
            simulation.dispose();
        }
    });
    test("imbue replaces only the selected affix, consumes one essence, locks target and rejects stale confirmations", () => {
        const source = gear(10), essence = { ...createAffixItem(20, { stat: "goldBonus", value: .8, rarity: "diamond" }), size: 2 };
        const simulation = fixture([source, essence]), op: CraftOperation = { kind: "imbue", target: source, affixId: essence.id, slot: 1 };
        simulation.craft(op);
        const after = simulation.getSnapshot().player, target = after.inventory[0] as Equipment;
        expect(target.affixes).toEqual([attack, { stat: "goldBonus", value: .8, rarity: "diamond" }]);
        expect(target.baseBonuses).toEqual(source.baseBonuses); expect(target.locked).toBe(true);
        expect(target.bonuses.armor).toBe(source.baseBonuses.armor); expect(target.bonuses.goldBonus).toBe(.8);
        expect(after.inventory[1].size).toBe(1);
        simulation.craft(op); expect(simulation.getSnapshot().player).toEqual(after);
        simulation.dispose();
    });
    test("duplicate affixes, locked sources, equipped sources and same-item inheritance are rejected", () => {
        const source = gear(10), simulation = fixture([source, createAffixItem(20, attack)]);
        const before = simulation.getSnapshot().player;
        simulation.craft({ kind: "imbue", target: source, affixId: 20, slot: 1 });
        simulation.craft({ kind: "inherit", source, target: source });
        simulation.craft({ kind: "extract", source: before.equipment.weapon!, affix: 0 });
        expect(simulation.getSnapshot().player).toEqual(before);
        simulation.setEquipmentLock(10, true);
        const locked = simulation.getSnapshot().player.inventory[0] as Equipment;
        expect(quoteCraft(simulation.getSnapshot().player, { kind: "extract", source: locked, affix: 0 }).ok).toBe(false);
        simulation.craft({ kind: "recycle", item: recycleRef(simulation.getSnapshot().player.inventory.find(item => item.id === 10)!) }); expect(simulation.getSnapshot().player.inventory[0]).toEqual(locked);
        simulation.dispose();
    });
    test("inheritance transfers all source affixes across star counts, preserves target base and recalculates worn gear", () => {
        const source = { ...gear(10), rarity: "diamond" as const, stars: 3 as const }, simulation = fixture([source]);
        const before = simulation.getSnapshot().player, target = before.equipment.weapon!;
        const op: CraftOperation = { kind: "inherit", source, target }, quote = quoteCraft(before, op);
        expect(quote.ok && quote.dust).toBe(4 * 2 * 5 * 3);
        simulation.craft(op);
        const after = simulation.getSnapshot().player, result = after.equipment.weapon!;
        expect(after.inventory).toHaveLength(0); expect(result.affixes).toEqual(source.affixes);
        expect([result.rarity, result.stars, result.itemLevel, result.baseBonuses]).toEqual([target.rarity, target.stars, target.itemLevel, target.baseBonuses]);
        expect(after.stats.damage).toBeGreaterThan(before.stats.damage); expect(after.gold).toBe(before.gold);
        expect(after.orbDust).toBe(before.orbDust - (quote.ok ? quote.dust : 0));
        simulation.craft(op); expect(simulation.getSnapshot().player).toEqual(after);
        simulation.dispose();
    });
    test("deterministic orb refining spends dust, retains type, rejects a repeated command and caps at rainbow", () => {
        const orb = createOrb(10, "common", "fortune"), simulation = fixture([orb, createOrb(11, "rainbow", "harmony")], 0, 12);
        const op: CraftOperation = { kind: "refine-orb", orbId: 10, rarity: "common" };
        simulation.craft(op); const after = simulation.getSnapshot().player;
        expect(after.inventory[0]).toMatchObject({ id: 10, value: "fortune", rarity: "magic" }); expect(after.orbDust).toBe(0);
        simulation.craft(op); expect(simulation.getSnapshot().player).toEqual(after);
        simulation.craft({ kind: "refine-orb", orbId: 11, rarity: "rainbow" }); expect(simulation.getSnapshot().player).toEqual(after);
        simulation.craft({ kind: "recycle", item: recycleRef(after.inventory[1]) });
        expect(simulation.getSnapshot().player.orbDust).toBe(243); expect(simulation.getSnapshot().player.inventory).toHaveLength(1);
        expect(orbDust(after.inventory[0] as ReturnType<typeof createOrb>)).toBe(3);
        simulation.dispose();
    });
    test("orb combinations trade paired find ratings for three-type gold and four-type crafting discounts", () => {
        const a = createOrb(1, "common", "fortune"), b = createOrb(2, "common", "bounty"), c = createOrb(3, "common", "constellation"), d = createOrb(4, "common", "harmony");
        expect(sumOrbs([a, a]).quality).toBe(sumOrbs([a]).quality * 2.5);
        expect(orbResonance([a, b, c])).toMatchObject({ diversity: 3, goldBonus: .25, craftDiscount: 0 });
        expect(orbResonance([a, b, c, d])).toMatchObject({ goldBonus: .25, craftDiscount: .15 });
        expect(orbResonance([a, a, a, a])).toMatchObject({ pairs: ["fortune"], goldBonus: 0, craftDiscount: 0 });
    });
});
