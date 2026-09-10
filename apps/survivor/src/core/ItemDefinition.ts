import type { Rarity } from "./Loot";
import type { GAME_CONFIG } from "./GameConfig";

export type ItemType = keyof typeof GAME_CONFIG.inventory;
/** type identifies the bag; value identifies its subtype; size is the quantity in this slot. */
export interface ItemDefinition<T extends ItemType, V extends string, S extends number = number> {
    readonly id: number;
    readonly type: T;
    readonly value: V;
    readonly size: S;
    readonly name: string;
    readonly itemLevel: number;
    readonly rarity: Rarity;
}
