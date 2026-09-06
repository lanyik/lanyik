import type { MaterialAmounts } from "../../content/buildings";
import { MINERAL_IDS, type MineralId } from "../../content/minerals";

export interface InventorySnapshot {
    readonly amounts: MaterialAmounts;
    readonly total: number;
    readonly capacity: number;
}
const quantity = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Inventory quantities must be non-negative safe integers");
};

/** Single-base ledger. Every multi-material spend validates before it changes any amount. */
export class InventoryLedger {
    private amounts = { iron: 0, copper: 0, stone: 0 };
    private total = 0;
    private capacity = 0;
    private snapshot: InventorySnapshot = this.capture();
    public getSnapshot(): InventorySnapshot { return this.snapshot; }
    public get freeSpace(): number { return this.capacity - this.total; }

    public canSpend(cost: MaterialAmounts): boolean {
        for (const mineral of MINERAL_IDS) quantity(cost[mineral]);
        return MINERAL_IDS.every(mineral => this.amounts[mineral] >= cost[mineral]);
    }
    public spend(cost: MaterialAmounts): boolean {
        if (!this.canSpend(cost)) return false;
        for (const mineral of MINERAL_IDS) { this.amounts[mineral] -= cost[mineral]; this.total -= cost[mineral]; }
        this.snapshot = this.capture();
        return true;
    }
    public credit(mineral: MineralId, amount: number): void {
        if (!MINERAL_IDS.includes(mineral)) throw new TypeError("Unknown inventory material");
        quantity(amount);
        if (amount > this.freeSpace) throw new RangeError("Warehouse capacity exceeded");
        this.amounts[mineral] += amount;
        this.total += amount;
        this.snapshot = this.capture();
    }
    public setCapacity(capacity: number): void {
        quantity(capacity);
        if (capacity < this.total) throw new RangeError("Warehouse capacity is below stored inventory");
        this.capacity = capacity;
        this.snapshot = this.capture();
    }
    private capture(): InventorySnapshot {
        return Object.freeze({ amounts: Object.freeze({ ...this.amounts }), total: this.total, capacity: this.capacity });
    }
}
