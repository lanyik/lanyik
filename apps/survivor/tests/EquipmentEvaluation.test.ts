import { describe, expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { INVENTORY_CAPACITY } from "../src/core/CombatConfig";
import { battlePower, compareEquipment } from "../src/core/EquipmentEvaluation";
import { deriveStats } from "../src/core/CombatStats";
import { createStarterEquipment, EMPTY_BONUSES, equipmentScore, type Equipment, type EquipmentBonuses } from "../src/core/Equipment";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { generateOrb } from "../src/core/Orbs";
import type { RegionalWorld } from "../src/core/RegionalWorld";

function gear(id: number, bonuses: Partial<EquipmentBonuses>, slot: Equipment["slot"] = "weapon", itemLevel = 1): Equipment {
    const total = { ...EMPTY_BONUSES, ...bonuses };
    return { ...createStarterEquipment(), id, slot, itemLevel, bonuses: total, baseBonuses: total, affixes: [], score: equipmentScore(total) };
}

// Arrange precise inventory boundaries; assertions exercise public gameplay transactions.
function withInventory(items: InventoryItem[], level = 10) {
    const combat = new CombatSimulation("equipment-transactions");
    const fixture = combat as unknown as { inventory: InventoryItem[]; level: number; recalculateStats(heal: boolean): void };
    fixture.inventory = [...items]; fixture.level = level; fixture.recalculateStats(false);
    return combat;
}

describe("equipment evaluation and safe cleanup", () => {
    test("uses final equipment bonuses, caps and cooldown direction without scoring multipliers twice", () => {
        const player = new CombatSimulation("rating").getSnapshot().player;
        const naked = deriveStats(player.level, player.attributes, EMPTY_BONUSES);
        expect(player.battlePower - battlePower(naked)).toBe(player.equipmentPower);
        expect(player.equipmentPower).toBeGreaterThan(0);
        const boosted = deriveStats(1, player.attributes, { ...EMPTY_BONUSES, damageBonus: .5 });
        expect(battlePower(boosted) - battlePower(naked)).toBeCloseTo((boosted.damage - naked.damage) * 9, 0);
        const capped = deriveStats(1, player.attributes, { ...EMPTY_BONUSES, lifesteal: .3 });
        expect(battlePower(deriveStats(1, player.attributes, { ...EMPTY_BONUSES, lifesteal: .9 }))).toBe(battlePower(capped));
        expect(battlePower(deriveStats(1, player.attributes, { ...EMPTY_BONUSES, shieldRecovery: 1 })) - battlePower(naked)).toBe(25);
        expect(battlePower(deriveStats(1, player.attributes, { ...EMPTY_BONUSES, goldBonus: 1, experienceBonus: 1, pickupRadius: 9 }))).toBe(battlePower(naked));
    });

    test("one-click and automatic cleanup preserve upgrades, ties, specialist scores and empty slots", () => {
        const upgrade = gear(2, { damage: 30 });
        const inferior = gear(3, { damage: 1 });
        const emptySlot = gear(4, { armor: 1 }, "head");
        const specialist = gear(5, { goldBonus: 2 });
        const tie = { ...createStarterEquipment(), id: 6 };
        const potion = createConsumable(7, 1, "health");
        const orb = generateOrb(new DeterministicRandom("safe-orb"), 8, 1);
        for (const automatic of [false, true]) {
            const combat = withInventory([upgrade, inferior, emptySlot, specialist, tie, potion, orb]);
            if (automatic) combat.setAutoClearLowLevelEquipment(true); else combat.clearInferiorEquipment();
            expect(combat.getSnapshot().player.inventory.map(item => item.id)).toEqual([2, 4, 5, 6, 7, 8]);
            expect(combat.getSnapshot().player.clearedEquipment).toBe(1);
            combat.clearInferiorEquipment();
            expect(combat.getSnapshot().player.clearedEquipment).toBe(1);
        }
    });

    test("projected power equals the equipped result; a downgrade cannot auto-clear the better returned item", () => {
        const upgrade = gear(2, { damage: 30, damageBonus: .2, armor: 9 });
        const combat = withInventory([upgrade]);
        const before = combat.getSnapshot().player;
        const comparison = compareEquipment(upgrade, before);
        combat.equip(upgrade.id);
        const after = combat.getSnapshot().player;
        expect(after.battlePower).toBe(comparison.power);
        expect(after.stats).toEqual(comparison.stats);
        expect(after.battlePower - before.battlePower).toBe(comparison.delta);
        combat.equip(1); // Deliberate downgrade; the returned upgrade must survive cleanup.
        combat.setAutoClearLowLevelEquipment(true);
        expect(combat.getSnapshot().player.inventory.map(item => item.id)).toContain(2);
        combat.unequip("weapon");
        expect(combat.getSnapshot().player.inventory.map(item => item.id)).toContain(1);
    });

    test("a full bag supports swaps and rejects unequip without losing equipment", () => {
        const upgrade = gear(2, { damage: 20 });
        const combat = withInventory([upgrade, ...Array.from({ length: INVENTORY_CAPACITY - 1 }, (_, i) => createConsumable(i + 3, 1, "mana"))]);
        combat.setAutoClearLowLevelEquipment(true);
        combat.unequip("weapon");
        expect(combat.getSnapshot().player.equipment.weapon?.id).toBe(1);
        expect(combat.getSnapshot().player.inventory).toHaveLength(INVENTORY_CAPACITY);
        combat.equip(2);
        expect(combat.getSnapshot().player.equipment.weapon?.id).toBe(2);
        expect(combat.getSnapshot().player.inventory).toHaveLength(INVENTORY_CAPACITY - 1);
        expect(combat.getSnapshot().player.clearedEquipment).toBe(1);
    });

    test("blocked low-level chest upgrades preserve the chest, RNG and IDs until every reward fits", () => {
        const combat = withInventory(Array.from({ length: INVENTORY_CAPACITY }, (_, i) => createConsumable(i + 100, 1, "mana")));
        const fixture = combat as unknown as { world: RegionalWorld; playerX: number; playerZ: number;
            random: DeterministicRandom; nextItemId: number; openNearbyChest(): void };
        const chunk = [...fixture.world.chunks.values()].find(chunk => chunk.chest && chunk.lod === "active")!;
        fixture.playerX = chunk.chest!.x; fixture.playerZ = chunk.chest!.z;
        combat.setAutoClearLowLevelEquipment(true);
        const before = combat.getSnapshot();
        const random = fixture.random.clone();
        const id = fixture.nextItemId;
        fixture.openNearbyChest();
        expect(chunk.chestOpened).toBe(false);
        expect(fixture.nextItemId).toBe(id);
        expect(fixture.random.clone().nextUint32()).toBe(random.clone().nextUint32());
        expect(combat.getSnapshot().player.inventory).toEqual(before.player.inventory);
        expect(combat.getSnapshot().player.gold).toBe(before.player.gold);
        combat.discard(100); combat.discard(101); combat.discard(102);
        fixture.openNearbyChest();
        expect(chunk.chestOpened).toBe(true);
        expect(combat.getSnapshot().player.inventory.length).toBeLessThanOrEqual(INVENTORY_CAPACITY);
        expect(fixture.nextItemId).toBe(id + (chunk.chest!.hasOrb ? 3 : 2));
    });

    test("ground pickups preserve stronger gear even at a lower level and issue acquisition IDs only on success", () => {
        const combat = withInventory(Array.from({ length: INVENTORY_CAPACITY }, (_, i) => createConsumable(i + 100, 1, "mana")));
        const fixture = combat as unknown as { dropItem(item: InventoryItem, x: number, z: number): void; collectEquipment(): void };
        const player = combat.getSnapshot().player;
        const upgrade = gear(2, { damage: 30 });
        const inferior = gear(3, { damage: 1 });
        combat.setAutoClearLowLevelEquipment(true);
        fixture.dropItem(upgrade, player.x, player.z);
        fixture.dropItem(inferior, player.x, player.z);
        fixture.collectEquipment();
        expect(combat.getSnapshot().groundEquipment).toBe(1);
        expect(combat.getSnapshot().player.clearedEquipment).toBe(1);
        expect(combat.drainNotices().some(notice => notice.acquiredEquipmentId !== undefined)).toBe(false);
        combat.discard(100);
        fixture.collectEquipment();
        expect(combat.getSnapshot().groundEquipment).toBe(0);
        expect(combat.getSnapshot().player.inventory.map(item => item.id)).toContain(2);
        expect(combat.drainNotices().filter(notice => notice.acquiredEquipmentId !== undefined).map(notice => notice.acquiredEquipmentId)).toEqual([2]);
    });
});
