import { ticksForSeconds } from "../src/core/GameConfig";
import { enemySamples } from "./helpers/EntitySamples";
import { describe, expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { SKILLS, skillValues } from "../src/core/Skills";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { BASE_LOOT_PROFILE, effectiveFind, lootProfile, rollRarity, RARITIES } from "../src/core/Loot";
import { ORB_UNLOCK_LEVELS } from "../src/core/Orbs";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { deriveStats } from "../src/core/CombatStats";
import { ATTRIBUTE_IDS, EMPTY_BONUSES, generateEquipment } from "../src/core/Equipment";
import { compareInventoryItems, createConsumable } from "../src/core/InventoryItem";
import { compareEquipment } from "../src/core/EquipmentEvaluation";

function openOrbChest() {
    for (let seed = 0; seed < 100; seed++) {
        const world = new RegionalWorld(`orb-chest-${seed}`, { x: 0, z: 0 }); world.synchronize(0, 0);
        const chest = [...world.chunks.values()].map(chunk => chunk.chest).find(chest => chest?.hasOrb && Math.hypot(chest.x, chest.z) < 7);
        if (!chest) continue;
        const combat = new CombatSimulation(`orb-chest-${seed}`);
        for (let tick = 0; tick < ticksForSeconds(5) && combat.getSnapshot().openedChests === 0; tick++) {
            const player = combat.getRenderState().player;
            combat.step({ x: chest.x - player.x, z: chest.z - player.z, active: true });
        }
        expect(combat.getSnapshot().openedChests).toBe(1);
        return { combat, chest };
    }
    throw new Error("Orb chest fixture was not found");
}

function reachNextLevel(combat: CombatSimulation): void {
    const level = combat.getSnapshot().player.level;
    for (let tick = 0; tick < ticksForSeconds(60) && combat.getSnapshot().player.level === level && !combat.gameOver; tick++) {
        const state = combat.getRenderState(); let x = Math.cos(tick / ticksForSeconds(9)) * 13, z = Math.sin(tick / ticksForSeconds(9)) * 13;
        let nearest = Infinity;
        for (let index = 0; index < state.entities.experience.count; index++) {
            const distance = Math.hypot(state.entities.position.x[state.entities.experience.slots[index]] - state.player.x, state.entities.position.z[state.entities.experience.slots[index]] - state.player.z);
            if (distance < nearest) { nearest = distance; x = state.entities.position.x[state.entities.experience.slots[index]]; z = state.entities.position.z[state.entities.experience.slots[index]]; }
        }
        combat.step({ x: x - state.player.x, z: z - state.player.z, active: true });
    }
    expect(combat.gameOver).toBe(false);
    expect(combat.getSnapshot().player.level).toBeGreaterThan(level);
}

describe("loot and orb progression", () => {
    test("sorting puts quality before level with stable ID ties across item types", () => {
        const random = new DeterministicRandom("inventory-order");
        const gear = (id: number, level: number, rarity: typeof RARITIES[number]) => ({ ...generateEquipment(random, id, level, BASE_LOOT_PROFILE), rarity });
        const items = [gear(8, 100, "common"), gear(6, 5, "legendary"), gear(5, 20, "rare"),
            gear(4, 25, "rare"), gear(3, 25, "rare"), createConsumable(2, 30, "mana")];
        expect(items.sort(compareInventoryItems).map(item => item.id)).toEqual([6, 2, 3, 4, 5, 8]);
        const { combat } = openOrbChest(); const before = combat.getSnapshot().player;
        combat.sortInventory(); const after = combat.getSnapshot().player;
        expect(after.inventory).toEqual([...before.inventory].sort(compareInventoryItems));
        expect(after.inventory.map(item => item.id).sort()).toEqual(before.inventory.map(item => item.id).sort());
        expect(after.equipment).toEqual(before.equipment); expect(after.gold).toBe(before.gold);
        combat.sortInventory(); expect(combat.getSnapshot().player.inventory).toEqual(after.inventory);
    });

    test("optional cleanup only removes inferior gear and keeps empty-slot upgrades", () => {
        const { combat } = openOrbChest(); const original = combat.getSnapshot().player;
        expect(original.autoClearEquipment).toBe(false);
        reachNextLevel(combat);
        const before = combat.getSnapshot().player;
        const removed = before.inventory.filter(item => item.type === "equipment" && compareEquipment(item, before).canClear);
        expect(before.inventory.some(item => item.type === "equipment" && item.itemLevel < before.level && !compareEquipment(item, before).canClear)).toBe(true);
        combat.setAutoClearEquipment(true); const after = combat.getSnapshot().player;
        expect(after.inventory).toEqual(before.inventory.filter(item => !removed.includes(item)));
        expect(after.equipment).toEqual(before.equipment); expect(after.stats).toEqual(before.stats);
        expect(after.clearedEquipment).toBe(removed.length);
        expect(after.inventory.some(item => item.type === "orb")).toBe(true);
        expect(after.inventory.some(item => item.type === "consumable")).toBe(true);
        combat.setAutoClearEquipment(true);
        expect(combat.getSnapshot().player.clearedEquipment).toBe(removed.length);
        combat.setAutoClearEquipment(false);
        combat.unequip("weapon");
        expect(combat.getSnapshot().player.inventory.some(item => item.id === 1)).toBe(true);
        combat.setAutoClearEquipment(true);
        expect(combat.getSnapshot().player.inventory.some(item => item.id === 1)).toBe(true);
    });

    test("level-ups and chest pickups preserve upgrades; unequipping never destroys an item", () => {
        const { combat } = openOrbChest();
        combat.setAutoClearEquipment(true);
        const beforeLevel = combat.getSnapshot().player;
        expect(beforeLevel.inventory.some(item => item.type === "equipment" && item.itemLevel === beforeLevel.level)).toBe(true);
        reachNextLevel(combat);
        const leveled = combat.getSnapshot().player;
        expect(leveled.inventory.every(item => item.type !== "equipment" || !compareEquipment(item, leveled).canClear)).toBe(true);
        combat.unequip("weapon");
        expect(combat.getSnapshot().player.clearedEquipment).toBe(leveled.clearedEquipment);
        expect(combat.getSnapshot().player.inventory.some(item => item.id === 1)).toBe(true);

        const initial = combat.getSnapshot(); const chests = combat.getRenderState().chests;
        let nearest = -1, distance = Infinity;
        for (let index = 0; index < chests.count; index++) {
            const d = Math.hypot(chests.x[index] - initial.player.x, chests.z[index] - initial.player.z);
            if (d < distance) { distance = d; nearest = index; }
        }
        expect(nearest).toBeGreaterThanOrEqual(0);
        const x = chests.x[nearest], z = chests.z[nearest];
        for (let tick = 0; tick < ticksForSeconds(12) && combat.getSnapshot().openedChests === initial.openedChests && !combat.gameOver; tick++) {
            const player = combat.getRenderState().player;
            combat.step({ x: x - player.x, z: z - player.z, active: true });
        }
        const opened = combat.getSnapshot();
        expect(opened.gameOver).toBe(false); expect(opened.openedChests).toBe(initial.openedChests + 1);
        expect(opened.player.inventory.every(item => item.type !== "equipment" || !compareEquipment(item, opened.player).canClear)).toBe(true);
        const potionCount = (items: typeof opened.player.inventory) => items.reduce((sum, item) => sum + (item.type === "consumable" ? item.size : 0), 0);
        expect(potionCount(opened.player.inventory)).toBeGreaterThan(potionCount(initial.player.inventory));
    });
    test("keeps quantity, stars and quality independent, normalized and diminishing", () => {
        expect(BASE_LOOT_PROFILE.stars).toEqual([.58, .3, .12]);
        for (const rating of [0, 50, 100, 200, 960, 10_000]) {
            const boosted = lootProfile({ quantity: rating, quality: rating, stars: rating });
            for (const probabilities of [boosted.qualities, boosted.stars]) {
                expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
                expect(probabilities.every(value => value >= 0 && value <= 1)).toBe(true);
            }
            expect(boosted.normalDropChance).toBeLessThanOrEqual(.8);
            expect(boosted.eliteDropChance).toBeLessThanOrEqual(.95);
        }
        expect(effectiveFind(200, 250) - effectiveFind(100, 250)).toBeLessThan(effectiveFind(100, 250));
        const quality = lootProfile({ quantity: 0, quality: 200, stars: 0 });
        expect(quality.stars).toEqual(BASE_LOOT_PROFILE.stars);
        expect(quality.normalDropChance).toBe(BASE_LOOT_PROFILE.normalDropChance);
        expect(quality.qualities[5]).toBeGreaterThan(BASE_LOOT_PROFILE.qualities[5]);
        const quantity = lootProfile({ quantity: 200, quality: 0, stars: 0 });
        expect(quantity.qualities).toEqual(BASE_LOOT_PROFILE.qualities);
        expect(quantity.stars).toEqual(BASE_LOOT_PROFILE.stars);
        const random = new DeterministicRandom("quality-frequency"); const counts = new Array(6).fill(0);
        for (let roll = 0; roll < 50_000; roll++) counts[RARITIES.indexOf(rollRarity(random, quality))]++;
        for (let tier = 0; tier < 6; tier++) expect(Math.abs(counts[tier] / 50_000 - quality.qualities[tier])).toBeLessThan(.006);
        expect(() => lootProfile({ quantity: NaN, quality: 0, stars: 0 })).toThrow("finite");
    });

    test("opens source-level equipment, potion and orb; sockets swap atomically and do not change combat stats", () => {
        const { combat, chest } = openOrbChest(); const before = combat.getSnapshot().player;
        const orb = before.inventory.find(item => item.type === "orb")!;
        expect(orb).toBeDefined();
        expect(before.inventory.filter(item => item.itemLevel === chest.region.level).length).toBeGreaterThanOrEqual(3);
        expect(before.orbs).toHaveLength(6);
        expect(ORB_UNLOCK_LEVELS.filter(level => level <= 1)).toHaveLength(2);
        expect(combat.equipOrb(orb.id, 2).ok).toBe(false);
        expect(combat.equipOrb(orb.id, -1).ok).toBe(false);
        expect(combat.equipOrb(orb.id, 0).ok).toBe(true);
        const equipped = combat.getSnapshot().player;
        expect(equipped.orbs[0]?.id).toBe(orb.id);
        expect(equipped.inventory).toHaveLength(before.inventory.length - 1);
        expect(equipped.stats).toEqual(before.stats);
        expect(equipped.lootProfile).not.toEqual(BASE_LOOT_PROFILE);
        expect(combat.equip(orb.id).ok).toBe(false);
        combat.removeOrb(0);
        expect(combat.getSnapshot().player.lootProfile).toEqual(BASE_LOOT_PROFILE);
        expect(combat.equipOrb(orb.id, 1).ok).toBe(true);
        expect(combat.getSnapshot().player.orbs[1]?.id).toBe(orb.id);
    });

    test("base allocation never changes probability, attack speed or find distributions", () => {
        const attributes = { might: 5, vitality: 5, agility: 5, spirit: 5 };
        const baseline = deriveStats(1, attributes, EMPTY_BONUSES);
        for (const attribute of ATTRIBUTE_IDS) {
            const next = deriveStats(1, { ...attributes, [attribute]: 100 }, EMPTY_BONUSES);
            for (const key of ["criticalChance", "criticalDamage", "blockChance", "evasion", "lifesteal", "attackRate", "castSpeed"] as const) expect(next[key]).toBe(baseline[key]);
        }
    });

    test("manual pulse spends mana once, respects cooldown, and regeneration uses half-second ticks", () => {
        const combat = new CombatSimulation("mana-rules"); combat.toggleAutoCast();
        const start = combat.getSnapshot().player;
        combat.castSkill("pulse"); const cast = combat.getSnapshot().player;
        expect(cast.mana).toBe(start.mana - SKILLS.pulse.mana);
        expect(cast.skills.remaining.pulse).toBe(skillValues("pulse", 1, cast.stats).cooldown);
        combat.castSkill("pulse"); expect(combat.getSnapshot().player.mana).toBe(cast.mana);
        for (let tick = 0; tick < ticksForSeconds(.5) - 1; tick++) combat.step({ x: 1, z: 0, active: true });
        expect(combat.getSnapshot().player.mana).toBe(cast.mana);
        combat.step({ x: 1, z: 0, active: true });
        expect(combat.getSnapshot().player.mana).toBe(cast.mana + cast.stats.manaRegen);
    });

    test("a chest potion restores its actual resource and consumes one item with shared cooldown", () => {
        const { combat } = openOrbChest();
        const potion = combat.getSnapshot().player.inventory.find(item => item.type === "consumable")!;
        expect(potion).toBeDefined();
        if (potion.value === "mana") combat.castSkill("pulse");
        else for (let tick = 0; tick < ticksForSeconds(10) && combat.getSnapshot().player.health === combat.getSnapshot().player.stats.maxHealth; tick++) {
            const state = combat.getRenderState(), player = state.player, enemies = enemySamples(state); let nearest = -1, distance = Infinity;
            for (let index = 0; index < enemies.length; index++) {
                const d = Math.hypot(enemies[index].x - player.x, enemies[index].z - player.z);
                if (d < distance) { distance = d; nearest = index; }
            }
            combat.step({ x: enemies[nearest].x - player.x, z: enemies[nearest].z - player.z, active: true });
        }
        const before = combat.getSnapshot().player;
        expect(potion.value === "health" ? before.health < before.stats.maxHealth : before.mana < before.stats.maxMana).toBe(true);
        combat.useConsumable(potion.value, potion.id);
        const after = combat.getSnapshot().player;
        expect(after.inventory.some(item => item.id === potion.id)).toBe(false);
        expect(potion.value === "health" ? after.health : after.mana).toBeGreaterThan(potion.value === "health" ? before.health : before.mana);
        expect(after.potionRemaining).toBe(4);
        combat.useConsumable(potion.value);
        expect(combat.getSnapshot().player.inventory).toEqual(after.inventory);
    });

    test("staying in place cannot replace defeated enemies on a timer", () => {
        const combat = new CombatSimulation("camping"); const initial = enemySamples(combat.getRenderState());
        const ids = new Set(initial.map(enemy => enemy.id));
        for (let tick = 0; tick < ticksForSeconds(240) && !combat.gameOver; tick++) combat.step({ x: 0, z: 0, active: false });
        const result = enemySamples(combat.getRenderState());
        expect(combat.getSnapshot().kills).toBeGreaterThan(0);
        expect(Array.from(result.map(enemy => enemy.id)).every(id => ids.has(id))).toBe(true);
    });

    test("a minute of normal combat reaches about level six through real XP pickups", () => {
        const combat = new CombatSimulation("rift-ember-1");
        for (let tick = 0; tick < ticksForSeconds(60); tick++) {
            const state = combat.getRenderState(); let x = Math.cos(tick / ticksForSeconds(9)) * 13, z = Math.sin(tick / ticksForSeconds(9)) * 13;
            let nearest = 16;
            for (let index = 0; index < state.entities.experience.count; index++) {
                const dx = state.entities.position.x[state.entities.experience.slots[index]] - state.player.x, dz = state.entities.position.z[state.entities.experience.slots[index]] - state.player.z;
                if (dx * dx + dz * dz < nearest) { nearest = dx * dx + dz * dz; x = state.entities.position.x[state.entities.experience.slots[index]]; z = state.entities.position.z[state.entities.experience.slots[index]]; }
            }
            combat.step({ x: x - state.player.x, z: z - state.player.z, active: true });
        }
        const snapshot = combat.getSnapshot();
        expect(snapshot.elapsedMs).toBe(60_000); expect(snapshot.gameOver).toBe(false);
        expect(snapshot.player.level).toBeGreaterThanOrEqual(6); expect(snapshot.player.level).toBeLessThanOrEqual(7);
        expect(snapshot.kills).toBeGreaterThan(40);
        expect(snapshot.player.unspentAttributePoints).toBe((snapshot.player.level - 1) * 2);
        expect(ORB_UNLOCK_LEVELS.filter(level => level <= snapshot.player.level)).toHaveLength(2);
    });
});
