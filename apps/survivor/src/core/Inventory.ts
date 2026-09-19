import { GAME_CONFIG } from "./GameConfig";
import type { ItemType } from "./ItemDefinition";
import type { InventoryItem } from "./InventoryItem";

export function inventorySlots(items: readonly InventoryItem[], type: ItemType): number {
    let count = 0;
    for (const item of items) if (item.type === type) count++;
    return count;
}
export function canStack(first: InventoryItem, second: InventoryItem): boolean {
    return first.value === second.value && first.rarity === second.rarity && (
        first.type === "consumable" && second.type === "consumable"
        || first.type === "scroll" && second.type === "scroll"
        || first.type === "affix" && second.type === "affix" && first.amount === second.amount);
}

/** Whole-item transaction: failure changes neither the inventory nor the incoming stack. */
export function insertInventoryItem(items: readonly InventoryItem[], incoming: InventoryItem): InventoryItem[] | undefined {
    const rules = GAME_CONFIG.inventory[incoming.type];
    let available = (rules.capacity - inventorySlots(items, incoming.type)) * rules.stackSize;
    for (const item of items) if (canStack(item, incoming)) available += rules.stackSize - item.size;
    if (incoming.size > available) return undefined;
    const result = [...items];
    let remaining = incoming.size;
    for (let index = 0; index < result.length && remaining > 0; index++) {
        const item = result[index];
        if (!canStack(item, incoming) || item.type !== "consumable" && item.type !== "affix" && item.type !== "scroll") continue;
        const moved = Math.min(remaining, rules.stackSize - item.size);
        if (moved) result[index] = Object.freeze({ ...item, size: item.size + moved });
        remaining -= moved;
    }
    if (remaining > 0) result.push(incoming.type === "consumable" || incoming.type === "affix" || incoming.type === "scroll" ? Object.freeze({ ...incoming, size: remaining }) : incoming);
    return result;
}

/** Compacts stackable slots. First IDs survive; quantities and potency are conserved. */
export function mergeInventory(items: readonly InventoryItem[]): InventoryItem[] {
    let merged: InventoryItem[] = [];
    for (const item of items) {
        const next = insertInventoryItem(merged, item);
        if (!next) throw new Error("Inventory exceeds category capacity");
        merged = next;
    }
    return merged;
}
