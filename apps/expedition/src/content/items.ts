import { MINERALS } from "./minerals";

export const ITEMS = Object.freeze({
    iron: MINERALS.iron, copper: MINERALS.copper, stone: MINERALS.stone,
    "iron-plate": Object.freeze({ name: "铁板", color: "#bed1dd" }),
    "copper-plate": Object.freeze({ name: "铜板", color: "#e6b391" }),
    "stone-brick": Object.freeze({ name: "建材块", color: "#d4cfac" })
});
export type ItemId = keyof typeof ITEMS;
export type ItemAmounts = Readonly<Record<ItemId, number>>;
export type ItemQuantities = Readonly<Partial<Record<ItemId, number>>>;
export const ITEM_IDS = Object.freeze(Object.keys(ITEMS) as ItemId[]);

export function materialTotal(values: ItemQuantities): number {
    let total = 0;
    for (const [id, value] of Object.entries(values)) {
        if (!Object.hasOwn(ITEMS, id)) throw new TypeError("Unknown inventory material");
        if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Inventory quantities must be non-negative safe integers");
        total += value;
    }
    if (!Number.isSafeInteger(total)) throw new RangeError("Material total exceeds safe integers");
    return total;
}
export function materials(values: ItemQuantities): ItemAmounts {
    materialTotal(values);
    return Object.freeze(Object.fromEntries(ITEM_IDS.map(id => [id, values[id] ?? 0])) as Record<ItemId, number>);
}
