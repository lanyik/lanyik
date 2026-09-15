import { BASE_LOOT_PROFILE } from "../src/core/Loot";
import { describe, expect, test } from "vitest";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { BONUS_IDS, EQUIPMENT_SLOTS, RARITIES, generateEquipment, sumEquipment } from "../src/core/Equipment";

describe("equipment generation", () => {
    test("generates stable, finite equipment with valid references", () => {
        const first = new DeterministicRandom("loot-table");
        const second = new DeterministicRandom("loot-table");
        const a = Array.from({ length: 1600 }, (_, index) => generateEquipment(first, index + 2, 1 + index % 12, BASE_LOOT_PROFILE));
        const b = Array.from({ length: 1600 }, (_, index) => generateEquipment(second, index + 2, 1 + index % 12, BASE_LOOT_PROFILE));
        expect(a).toEqual(b);
        expect(new Set(a.map(item => item.id)).size).toBe(a.length);
        for (const item of a) {
            expect(EQUIPMENT_SLOTS).toContain(item.value);
            expect(RARITIES).toContain(item.rarity);
            expect(item.score).toBeGreaterThan(0);
            expect(Object.values(item.bonuses).every(value => Number.isFinite(value) && value >= 0)).toBe(true);
            expect(item.affixes).toHaveLength(item.stars + 1);
            expect(new Set(item.affixes.map(affix => affix.stat)).size).toBe(item.affixes.length);
            expect(item.affixes.every(affix => affix.rarity === item.rarity)).toBe(true);
            for (const id of BONUS_IDS) expect(item.bonuses[id]).toBeCloseTo(item.baseBonuses[id]
                + item.affixes.filter(affix => affix.stat === id).reduce((sum, affix) => sum + affix.value, 0), 3);
        }
        expect(new Set(a.map(item => item.value)).size).toBe(EQUIPMENT_SLOTS.length);
        expect(new Set(a.map(item => item.rarity)).size).toBe(RARITIES.length);
        expect(new Set(a.flatMap(item => item.affixes.map(affix => affix.stat))).size).toBe(BONUS_IDS.length);
    });

    test("aggregates one authoritative value from each equipped slot", () => {
        const random = new DeterministicRandom("aggregation");
        const items = Array.from({ length: 100 }, (_, index) => generateEquipment(random, index + 2, 5, BASE_LOOT_PROFILE));
        const equipped = Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, items.find(item => item.value === slot)!]));
        expect(Object.values(equipped).every(Boolean)).toBe(true);
        const totals = sumEquipment(equipped);
        for (const id of BONUS_IDS) expect(totals[id]).toBeCloseTo(Object.values(equipped).reduce((sum, item) => sum + item.bonuses[id], 0));
    });

    test("chest quality floors do not change level bases or star count rolls", () => {
        for (const rarity of RARITIES) {
            const common = generateEquipment(new DeterministicRandom("independent-axes"), 2, 9, BASE_LOOT_PROFILE);
            const item = generateEquipment(new DeterministicRandom("independent-axes"), 2, 9, BASE_LOOT_PROFILE, rarity);
            expect(RARITIES.indexOf(item.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf(rarity));
            expect(item.baseBonuses).toEqual(common.baseBonuses);
            expect(item.stars).toBe(common.stars);
            expect(item.affixes.map(affix => affix.stat)).toEqual(common.affixes.map(affix => affix.stat));
        }
    });
});
