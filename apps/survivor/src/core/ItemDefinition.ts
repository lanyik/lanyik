import type { Rarity } from "./Loot";
import type { GAME_CONFIG } from "./GameConfig";

export type ItemType = keyof typeof GAME_CONFIG.inventory;
/** Shared identity; only inventory objects occupy bags. */
export interface TypedValue<T extends string, V extends string> {
    readonly type: T;
    readonly value: V;
}
/** type identifies the bag; value identifies its subtype; size is the quantity in this slot. */
export interface ItemDefinition<T extends ItemType, V extends string, S extends number = number> extends TypedValue<T, V> {
    readonly id: number;
    readonly size: S;
    readonly name: string;
    readonly rarity: Rarity;
}
