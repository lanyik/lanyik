import type { InventoryItem } from "./InventoryItem";
import type { ItemType } from "./ItemDefinition";
import { RARITIES, type Rarity } from "./Loot";
import { orbDust } from "./Orbs";
import { compareEquipment, type EquipmentContext } from "./EquipmentEvaluation";

export type RecyclingRules = Readonly<Record<ItemType, Rarity | null>>;
export const EMPTY_RECYCLING: RecyclingRules = Object.freeze({ equipment: null, orb: null, consumable: null, affix: null, scroll: null });
export function shouldRecycle(item: InventoryItem, rules: RecyclingRules, player: EquipmentContext): boolean {
    const maximum = rules[item.type];
    return maximum !== null && RARITIES.indexOf(item.rarity) <= RARITIES.indexOf(maximum)
        && (item.type !== "equipment" || compareEquipment(item, player).canClear);
}
export interface RecycleRef { readonly id: number; readonly rarity: Rarity; readonly size: number; readonly revision?: number }
export function recycleRef(item: InventoryItem): RecycleRef {
    return { id: item.id, rarity: item.rarity, size: item.size, revision: item.type === "equipment" ? item.revision : undefined };
}
export function recycleReward(item: InventoryItem): { gold: number; dust: number } {
    const quality = RARITIES.indexOf(item.rarity) + 1;
    return item.type === "orb" ? { gold: 0, dust: orbDust(item) }
        : { gold: (item.type === "equipment" ? 8 * quality * (item.stars + 1) + item.itemLevel * 2
            : item.type === "affix" ? 20 * quality : 3 * quality) * item.size, dust: 0 };
}
export function recyclingName(type: ItemType): string { return type === "orb" ? "分解" : "售出"; }
