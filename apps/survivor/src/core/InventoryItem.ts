import type { Equipment } from "./Equipment";
import type { Orb } from "./Orbs";
import { RARITIES } from "./Loot";
import type { ItemDefinition } from "./ItemDefinition";
import { GAME_CONFIG } from "./GameConfig";

export type ConsumableEffect = "health" | "mana";
export interface Consumable extends ItemDefinition<"consumable", ConsumableEffect> {
    readonly restore: number;
}
export type InventoryItem = Equipment | Orb | Consumable;

/** Higher quality first, then higher level; stable IDs make ties deterministic. */
export function compareInventoryItems(first: InventoryItem, second: InventoryItem): number {
    return RARITIES.indexOf(second.rarity) - RARITIES.indexOf(first.rarity)
        || second.itemLevel - first.itemLevel || first.id - second.id;
}

export function createConsumable(id: number, itemLevel: number, effect: ConsumableEffect, size = 1): Consumable {
    if (!Number.isSafeInteger(size) || size < 1 || size > GAME_CONFIG.inventory.consumable.stackSize) throw new RangeError("Invalid potion stack size");
    const grade = itemLevel >= 15 ? "浓缩" : itemLevel >= 6 ? "精制" : "微光";
    return Object.freeze({ type: "consumable", value: effect, size, id, itemLevel, rarity: itemLevel >= 15 ? "rare" : itemLevel >= 6 ? "magic" : "common",
        name: `${grade}${effect === "health" ? "生命" : "法力"}药剂`, restore: 30 + itemLevel * 8 });
}
