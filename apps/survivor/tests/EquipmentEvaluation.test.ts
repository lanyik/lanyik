import { describe, expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { GAME_CONFIG } from "../src/core/GameConfig";
const INVENTORY_CAPACITY = GAME_CONFIG.inventory.equipment.capacity;
import { battlePower, compareEquipment } from "../src/core/EquipmentEvaluation";
import { deriveStats, STAT_LIMITS } from "../src/core/CombatStats";
import { createStarterEquipment, EMPTY_BONUSES, equipmentScore, type Equipment, type EquipmentBonuses } from "../src/core/Equipment";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { generateOrb } from "../src/core/Orbs";
import type { RegionalWorld } from "../src/core/RegionalWorld";

function gear(id: number, bonuses: Partial<EquipmentBonuses>, value: Equipment["value"] = "weapon", itemLevel = 1): Equipment {
    const total = { ...EMPTY_BONUSES, ...bonuses };
    return { ...createStarterEquipment(), id, value, itemLevel, locked: false, bonuses: total, baseBonuses: total, affixes: [], score: equipmentScore(total) };
}

// Arrange precise inventory boundaries; assertions exercise public gameplay transactions.
function withInventory(items: InventoryItem[], level = 10) {
    const combat = new CombatSimulation("equipment-transactions");
    const fixture = combat as unknown as { inventory: InventoryItem[]; level: number; recalculateStats(heal: boolean): void };
    fixture.inventory = [...items]; fixture.level = level; fixture.recalculateStats(false);
    return combat;
}

describe("equipment evaluation and safe cleanup", () => {
    test("counter-stats stop adding power after every current opponent is fully countered", () => {
        const player = new CombatSimulation("counter-stat-caps").getSnapshot().player;
        const capped = { ...EMPTY_BONUSES, accuracy: STAT_LIMITS.accuracy - .95,
            criticalResistance: STAT_LIMITS.criticalResistance, criticalDamageReduction: STAT_LIMITS.criticalDamageReduction };
        const atLimit = deriveStats(player.level, player.attributes, capped);
        const overflow = deriveStats(player.level, player.attributes, { ...capped, accuracy: 3, criticalResistance: 3, criticalDamageReduction: 3 });
        expect(overflow).toEqual(atLimit);
        expect(battlePower(overflow)).toBe(battlePower(atLimit));
    });

    test("automatic cleanup retains damage upgrades that replace useless accuracy overflow", () => {
        const candidate = gear(5, { damage: 1.8 }, "ring");
        const combat = withInventory([gear(2, { accuracy: .1 }, "ring"), gear(3, { accuracy: .1 }, "head"),
            gear(4, { accuracy: .1 }, "chest"), candidate]);
        for (const id of [2, 3, 4]) combat.equip(id);
        const player = combat.getSnapshot().player;
        const comparison = compareEquipment(candidate, player);
        expect(comparison.stats.accuracy).toBe(player.stats.accuracy);
        expect(comparison.stats.damage).toBeGreaterThan(player.stats.damage);
        expect(comparison.delta).toBeGreaterThan(0);
        expect(comparison.scoreDelta).toBeLessThan(0);
        combat.setAutoClearEquipment("rainbow");
        expect(combat.getSnapshot().player.inventory.some(item => item.id === candidate.id)).toBe(true);
        combat.dispose();
    });

    test("temporary recovery equipment cannot shorten an already triggered passive shield cooldown", () => {
        const combat = withInventory([gear(2, { shieldRecovery: .532 }, "charm")]);
        const fixture = combat as unknown as { shieldCooldown: number };
        fixture.shieldCooldown = 11.9;
        combat.equip(2);
        expect(combat.getSnapshot().player.stats.shieldRecovery).toBe(11.468);
        expect(combat.getSnapshot().player.shieldRemaining).toBe(11.9);
        combat.unequip("charm");
        expect(combat.getSnapshot().player.stats.shieldRecovery).toBe(12);
        expect(combat.getSnapshot().player.shieldRemaining).toBe(11.9);
        combat.dispose();
    });

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

    test("automatic cleanup preserves upgrades, ties and empty slots while removing high-score combat downgrades at every item level", () => {
        const upgrade = gear(2, { damage: 30 });
        const inferior = gear(3, { damage: 1 }, "weapon", 99);
        const emptySlot = gear(4, { armor: 1 }, "head");
        const specialist = gear(5, { goldBonus: 2 });
        const tie = { ...createStarterEquipment(), id: 6 };
        const potion = createConsumable(7, "common", "health");
        const orb = generateOrb(new DeterministicRandom("safe-orb"), 8);
        {
            const combat = withInventory([upgrade, inferior, emptySlot, specialist, tie, potion, orb]);
            combat.setAutoClearEquipment("rainbow");
            expect(combat.getSnapshot().player.inventory.map(item => item.id)).toEqual([2, 4, 6, 7, 8]);
            expect(combat.getSnapshot().player.clearedEquipment).toBe(2);
            combat.setAutoClearEquipment("rainbow");
            expect(combat.getSnapshot().player.clearedEquipment).toBe(2);
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
        combat.setAutoClearEquipment("rainbow");
        expect(combat.getSnapshot().player.inventory.map(item => item.id)).toContain(2);
        combat.unequip("weapon");
        expect(combat.getSnapshot().player.inventory.map(item => item.id)).toContain(1);
    });

    test("a full bag supports swaps and rejects unequip without losing equipment", () => {
        const upgrade = gear(2, { damage: 20 });
        const combat = withInventory([upgrade, ...Array.from({ length: INVENTORY_CAPACITY - 1 }, (_, i) => gear(i + 3, { armor: 1 }, "head"))]);
        combat.setAutoClearEquipment("rainbow");
        combat.unequip("weapon");
        expect(combat.getSnapshot().player.equipment.weapon?.id).toBe(1);
        expect(combat.getSnapshot().player.inventory).toHaveLength(INVENTORY_CAPACITY);
        combat.equip(2);
        expect(combat.getSnapshot().player.equipment.weapon?.id).toBe(2);
        expect(combat.getSnapshot().player.inventory).toHaveLength(INVENTORY_CAPACITY);
        expect(combat.getSnapshot().player.clearedEquipment).toBe(0);
        expect(combat.getSnapshot().player.inventory.find(item => item.id === 1)).toMatchObject({ locked: true });
    });

    test("blocked low-level chest upgrades preserve the chest, RNG and IDs until every reward fits", () => {
        const combat = withInventory(Array.from({ length: INVENTORY_CAPACITY }, (_, i) => gear(i + 100, { armor: 1 }, "head")));
        const fixture = combat as unknown as { world: RegionalWorld; playerX: number; playerZ: number;
            random: DeterministicRandom; nextItemId: number; openNearbyChest(): void };
        const chunk = [...fixture.world.chunks.values()].find(chunk => chunk.chest && chunk.band === "near")!;
        fixture.playerX = chunk.chest!.x; fixture.playerZ = chunk.chest!.z;
        combat.setAutoClearEquipment("rainbow");
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
        const combat = withInventory(Array.from({ length: INVENTORY_CAPACITY }, (_, i) => gear(i + 100, { armor: 1 }, "head")));
        const fixture = combat as unknown as { dropItem(item: InventoryItem, x: number, z: number): void; collectEquipment(): void };
        const player = combat.getSnapshot().player;
        const upgrade = gear(2, { damage: 30 });
        const inferior = gear(3, { damage: 1 });
        combat.setAutoClearEquipment("rainbow");
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
