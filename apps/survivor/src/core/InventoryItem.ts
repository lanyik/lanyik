import type { Equipment } from "./Equipment";
import type { Orb } from "./Orbs";
import { RARITIES, type Rarity } from "./Loot";

export type ConsumableEffect = "health" | "mana";
export interface Consumable {
    readonly kind: "consumable";
    readonly id: number;
    readonly name: string;
    readonly itemLevel: number;
    readonly rarity: Rarity;
    readonly effect: ConsumableEffect;
    readonly restore: number;
}
export type InventoryItem = Equipment | Orb | Consumable;

/** Higher quality first, then higher level; stable IDs make ties deterministic. */
export function compareInventoryItems(first: InventoryItem, second: InventoryItem): number {
    return RARITIES.indexOf(second.rarity) - RARITIES.indexOf(first.rarity)
        || second.itemLevel - first.itemLevel || first.id - second.id;
}

export function isLowLevelEquipment(item: InventoryItem, playerLevel: number): boolean {
    return item.kind === "equipment" && item.itemLevel < playerLevel;
}

export function createConsumable(id: number, itemLevel: number, effect: ConsumableEffect): Consumable {
    const grade = itemLevel >= 15 ? "浓缩" : itemLevel >= 6 ? "精制" : "微光";
    return Object.freeze({ kind: "consumable", id, itemLevel, rarity: itemLevel >= 15 ? "rare" : itemLevel >= 6 ? "magic" : "common",
        name: `${grade}${effect === "health" ? "生命" : "法力"}药剂`, effect, restore: 30 + itemLevel * 8 });
}
