import { describe, expect, test } from "vitest";
import { CombatSimulation, PULSE_MANA_COST } from "../src/core/CombatSimulation";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { BASE_LOOT_PROFILE, effectiveFind, lootProfile, rollRarity, RARITIES } from "../src/core/Loot";
import { ORB_UNLOCK_LEVELS } from "../src/core/Orbs";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { deriveStats } from "../src/core/CombatStats";
import { ATTRIBUTE_IDS, EMPTY_BONUSES } from "../src/core/Equipment";

function openOrbChest() {
    for (let seed = 0; seed < 100; seed++) {
        const world = new RegionalWorld(`orb-chest-${seed}`, { x: 0, z: 0 }); world.synchronize(0, 0);
        const chest = [...world.chunks.values()].map(chunk => chunk.chest).find(chest => chest?.hasOrb && Math.hypot(chest.x, chest.z) < 7);
        if (!chest) continue;
        const combat = new CombatSimulation(`orb-chest-${seed}`);
        for (let tick = 0; tick < 250 && combat.getSnapshot().openedChests === 0; tick++) {
            const player = combat.getRenderState().player;
            combat.step({ x: chest.x - player.x, z: chest.z - player.z, active: true });
        }
        expect(combat.getSnapshot().openedChests).toBe(1);
        return { combat, chest };
    }
    throw new Error("Orb chest fixture was not found");
}

describe("loot and orb progression", () => {
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
        const orb = before.inventory.find(item => item.kind === "orb")!;
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
            for (const key of ["criticalChance", "criticalDamage", "blockChance", "evasion", "lifesteal", "attackRate", "skillInterval"] as const) expect(next[key]).toBe(baseline[key]);
        }
    });

    test("manual pulse spends mana once, respects cooldown, and regeneration uses half-second ticks", () => {
        const combat = new CombatSimulation("mana-rules"); combat.toggleAutoCast();
        const start = combat.getSnapshot().player;
        combat.castPulse(); const cast = combat.getSnapshot().player;
        expect(cast.mana).toBe(start.mana - PULSE_MANA_COST);
        expect(cast.skillRemaining).toBe(cast.stats.skillInterval);
        combat.castPulse(); expect(combat.getSnapshot().player.mana).toBe(cast.mana);
        for (let tick = 0; tick < 24; tick++) combat.step({ x: 1, z: 0, active: true });
        expect(combat.getSnapshot().player.mana).toBe(cast.mana);
        combat.step({ x: 1, z: 0, active: true });
        expect(combat.getSnapshot().player.mana).toBe(cast.mana + cast.stats.manaRegen);
    });

    test("a chest potion restores its actual resource and consumes one item with shared cooldown", () => {
        const { combat } = openOrbChest();
        const potion = combat.getSnapshot().player.inventory.find(item => item.kind === "consumable")!;
        expect(potion).toBeDefined();
        if (potion.effect === "mana") combat.castPulse();
        else for (let tick = 0; tick < 500 && combat.getSnapshot().player.health === combat.getSnapshot().player.stats.maxHealth; tick++) {
            const { player, enemies } = combat.getRenderState(); let nearest = -1, distance = Infinity;
            for (let index = 0; index < enemies.count; index++) {
                const d = Math.hypot(enemies.x[index] - player.x, enemies.z[index] - player.z);
                if (d < distance) { distance = d; nearest = index; }
            }
            combat.step({ x: enemies.x[nearest] - player.x, z: enemies.z[nearest] - player.z, active: true });
        }
        const before = combat.getSnapshot().player;
        expect(potion.effect === "health" ? before.health < before.stats.maxHealth : before.mana < before.stats.maxMana).toBe(true);
        combat.useConsumable(potion.effect, potion.id);
        const after = combat.getSnapshot().player;
        expect(after.inventory.some(item => item.id === potion.id)).toBe(false);
        expect(potion.effect === "health" ? after.health : after.mana).toBeGreaterThan(potion.effect === "health" ? before.health : before.mana);
        expect(after.potionRemaining).toBe(4);
        combat.useConsumable(potion.effect);
        expect(combat.getSnapshot().player.inventory).toEqual(after.inventory);
    });

    test("staying in place cannot replace defeated enemies on a timer", () => {
        const combat = new CombatSimulation("camping"); const initial = combat.getRenderState().enemies;
        const ids = new Set(initial.ids.slice(0, initial.count));
        for (let tick = 0; tick < 12_000 && !combat.gameOver; tick++) combat.step({ x: 0, z: 0, active: false });
        const result = combat.getRenderState().enemies;
        expect(combat.getSnapshot().kills).toBeGreaterThan(0);
        expect(Array.from(result.ids.slice(0, result.count)).every(id => ids.has(id))).toBe(true);
    });

    test("a minute of normal combat reaches about level six through real XP pickups", () => {
        const combat = new CombatSimulation("rift-ember-1");
        for (let tick = 0; tick < 3000; tick++) {
            const state = combat.getRenderState(); let x = Math.cos(tick / 450) * 13, z = Math.sin(tick / 450) * 13;
            let nearest = 16;
            for (let index = 0; index < state.experience.count; index++) {
                const dx = state.experience.x[index] - state.player.x, dz = state.experience.z[index] - state.player.z;
                if (dx * dx + dz * dz < nearest) { nearest = dx * dx + dz * dz; x = state.experience.x[index]; z = state.experience.z[index]; }
            }
            combat.step({ x: x - state.player.x, z: z - state.player.z, active: true });
        }
        const snapshot = combat.getSnapshot();
        expect(snapshot.elapsedMs).toBe(60_000); expect(snapshot.gameOver).toBe(false);
        expect(snapshot.player.level).toBeGreaterThanOrEqual(6); expect(snapshot.player.level).toBeLessThanOrEqual(7);
        expect(snapshot.kills).toBeGreaterThan(40);
        expect(snapshot.player.unspentAttributePoints).toBe((snapshot.player.level - 1) * 2);
    });
});
