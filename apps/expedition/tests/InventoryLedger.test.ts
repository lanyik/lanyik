import { describe, expect, it } from "vitest";
import { InventoryLedger } from "../src/core/inventory/InventoryLedger";

describe("InventoryLedger boundaries", () => {
    it("rejects invalid quantities, overcapacity credits and partial material spends without changing snapshots", () => {
        const ledger = new InventoryLedger();
        ledger.setCapacity(10);
        ledger.credit("iron", 8);
        const before = ledger.getSnapshot();
        expect(ledger.spend({ iron: 2, copper: 1, stone: 0 })).toBe(false);
        expect(() => ledger.credit("iron", 3)).toThrow("capacity");
        expect(() => ledger.setCapacity(7)).toThrow("below stored inventory");
        for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() => ledger.credit("iron", amount)).toThrow("safe integers");
            expect(() => ledger.spend({ iron: 1, copper: amount, stone: 0 })).toThrow("safe integers");
        }
        expect(ledger.getSnapshot()).toBe(before);
        expect(ledger.spend({ iron: 3, copper: 0, stone: 0 })).toBe(true);
        expect(ledger.getSnapshot().amounts.iron).toBe(5);
        expect(before.amounts.iron).toBe(8);
        expect(Object.isFrozen(before.amounts)).toBe(true);
    });
});
