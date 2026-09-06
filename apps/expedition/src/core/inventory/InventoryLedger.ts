import { ITEM_IDS, materials, materialTotal, type ItemAmounts, type ItemId, type ItemQuantities } from "../../content/items";

export interface InventorySnapshot {
    readonly amounts: ItemAmounts;
    readonly total: number;
    readonly capacity: number;
}
const quantity = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Inventory quantities must be non-negative safe integers");
};

/** Single-base ledger. Every multi-material spend validates before it changes any amount. */
export class InventoryLedger {
    private amounts = { ...materials({}) };
    private total = 0;
    private capacity = 0;
    private snapshot: InventorySnapshot = this.capture();
    public getSnapshot(): InventorySnapshot { return this.snapshot; }
    public get freeSpace(): number { return this.capacity - this.total; }

    public canSpend(cost: ItemQuantities): boolean {
        materialTotal(cost);
        return ITEM_IDS.every(item => this.amounts[item] >= (cost[item] ?? 0));
    }
    public spend(cost: ItemQuantities): boolean {
        if (!this.canSpend(cost)) return false;
        for (const item of ITEM_IDS) { this.amounts[item] -= cost[item] ?? 0; this.total -= cost[item] ?? 0; }
        this.snapshot = this.capture();
        return true;
    }
    public credit(item: ItemId, amount: number): void { this.creditMany({ [item]: amount }); }
    public creditMany(values: ItemQuantities): void {
        const total = materialTotal(values);
        if (total > this.freeSpace) throw new RangeError("Warehouse capacity exceeded");
        for (const item of ITEM_IDS) this.amounts[item] += values[item] ?? 0;
        this.total += total;
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
