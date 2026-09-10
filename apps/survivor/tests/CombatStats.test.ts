import { skillValues } from "../src/core/Skills";
import { describe, expect, test } from "vitest";
import { EMPTY_BONUSES } from "../src/core/Equipment";
import { deriveStats, incomingDamage, outgoingDamage, reflectedDamage, rollAttack } from "../src/core/CombatStats";
import { DeterministicRandom } from "../src/core/DeterministicRandom";

const attributes = { might: 5, vitality: 5, agility: 5, spirit: 5 };
describe("combat attributes", () => {
    test("applies bonus multipliers after flat bases and transfers only specified overflow", () => {
        const stats = deriveStats(1, attributes, { ...EMPTY_BONUSES, maxHealth: 68, maxHealthBonus: 0.5,
            damage: 5.1, damageBonus: 0.2, armor: 8.4, armorBonus: 0.5, block: 8, blockBonus: 0.25,
            evasion: 0.8, blockChance: 0.1, lifesteal: 0.5, attackSpeed: 2.44, castSpeed: 2.3 });
        expect(stats.maxHealth).toBe(300);
        expect(stats.damage).toBeCloseTo(24);
        expect(stats.baseArmor).toBe(10);
        expect(stats.armor).toBe(15);
        expect(stats.block).toBe(12.5);
        expect(stats.evasion).toBe(0.6);
        expect(stats.blockChance).toBeCloseTo(0.35);
        expect(stats.lifesteal).toBe(0.3);
        expect(stats.attackRate).toBeCloseTo(4.14);
        expect(skillValues("pulse", 1, stats).cooldown).toBeCloseTo(5 / 3);
        expect(stats.criticalDamage).toBeCloseTo(2.54);
    });

    test("critical excludes excellent; excellent uses its own multiplier", () => {
        const base = deriveStats(1, attributes, EMPTY_BONUSES);
        const critical = rollAttack({ ...base, criticalChance: 1, excellentChance: 1, criticalDamage: 2, excellentDamage: 100 }, new DeterministicRandom(1));
        expect(critical.critical).toBe(true);
        expect(critical.damage / base.damage).toBeGreaterThanOrEqual(1.84);
        expect(critical.damage / base.damage).toBeLessThanOrEqual(2.16);
        const excellent = rollAttack({ ...base, criticalChance: 0, excellentChance: 1, excellentDamage: 3 }, new DeterministicRandom(1));
        expect(excellent.critical).toBe(false);
        expect(excellent.damage / base.damage).toBeGreaterThanOrEqual(2.76);
        expect(excellent.damage / base.damage).toBeLessThanOrEqual(3.24);
    });

    test("enemy max-health damage uses per mille and the correct enemy category", () => {
        const stats = deriveStats(1, attributes, { ...EMPTY_BONUSES, lifeExtraction: 2, lethalDamage: 5,
            damageIncrease: 0.2, normalDamage: 0.5, eliteDamage: 1 });
        expect(outgoingDamage(stats, 100, 10_000, false, false)).toBeCloseTo(216);
        expect(outgoingDamage(stats, 100, 10_000, true, true)).toBeCloseTo(528);
    });

    test("defense, critical reduction, elite reduction and flat block compose without negative damage", () => {
        const stats = deriveStats(1, attributes, { ...EMPTY_BONUSES, armor: 8.4, damageReduction: 0.2,
            eliteReduction: 0.25, criticalDamageReduction: 0.4, block: 8 });
        expect(incomingDamage(stats, 170, true, true, true)).toBeCloseTo(62);
        expect(incomingDamage(stats, 1, true, true, true)).toBe(0);
        expect(incomingDamage({ ...stats, criticalDamageReduction: 3 }, 170, false, true, false)).toBeCloseTo(80);
    });

    test("reflection uses base defense before its multiplier and never triggers from zero health loss", () => {
        const stats = deriveStats(1, attributes, { ...EMPTY_BONUSES, armor: 8.4, armorBonus: 2, thorns: 0.5, thornsPerMille: 2, thornsCap: 0.5 });
        expect(reflectedDamage(stats, 100, 100_000)).toBe(25);
        expect(reflectedDamage(stats, 0, 100_000)).toBe(0);
        expect(reflectedDamage(stats, 10, 1000)).toBe(7);
    });
});
