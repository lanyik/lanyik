import { describe, expect, test } from "vitest";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { EQUIPMENT_SLOTS, RARITIES, createStarterEquipment, generateEquipment, sumEquipment } from "../src/core/Equipment";

describe("equipment generation", () => {
    test("generates stable, finite equipment with valid references", () => {
        const first = new DeterministicRandom("loot-table");
        const second = new DeterministicRandom("loot-table");
        const a = Array.from({ length: 80 }, (_, index) => generateEquipment(first, index + 2, 1 + index % 12, 0.08));
        const b = Array.from({ length: 80 }, (_, index) => generateEquipment(second, index + 2, 1 + index % 12, 0.08));
        expect(a).toEqual(b);
        expect(new Set(a.map(item => item.id)).size).toBe(a.length);
        for (const item of a) {
            expect(EQUIPMENT_SLOTS).toContain(item.slot);
            expect(RARITIES).toContain(item.rarity);
            expect(item.score).toBeGreaterThan(0);
            expect(Object.values(item.bonuses).every(value => Number.isFinite(value) && value >= 0)).toBe(true);
        }
    });

    test("aggregates one authoritative value from each equipped slot", () => {
        const random = new DeterministicRandom("aggregation");
        const weapon = createStarterEquipment();
        const armor = Array.from({ length: 20 }, (_, index) => generateEquipment(random, index + 2, 5, 0))
            .find(item => item.slot === "armor");
        const ring = Array.from({ length: 20 }, (_, index) => generateEquipment(random, index + 30, 5, 0))
            .find(item => item.slot === "ring");
        expect(armor).toBeDefined();
        expect(ring).toBeDefined();
        const totals = sumEquipment({ weapon, armor, ring });
        expect(totals.damage).toBeCloseTo(weapon.bonuses.damage + (ring?.bonuses.damage ?? 0));
        expect(totals.maxHealth).toBeCloseTo((armor?.bonuses.maxHealth ?? 0) + (ring?.bonuses.maxHealth ?? 0));
    });
});
