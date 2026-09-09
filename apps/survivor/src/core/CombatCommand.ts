import type { AttributeId, EquipmentSlot } from "./Equipment";
import type { ConsumableEffect } from "./InventoryItem";
import type { CombatSimulation } from "./CombatSimulation";

export type CombatCommand =
    | { readonly type: "allocate"; readonly attribute: AttributeId }
    | { readonly type: "equip"; readonly itemId: number }
    | { readonly type: "unequip"; readonly slot: EquipmentSlot }
    | { readonly type: "equip-orb"; readonly itemId: number; readonly socket: number }
    | { readonly type: "remove-orb"; readonly socket: number }
    | { readonly type: "cast-pulse" }
    | { readonly type: "toggle-autocast" }
    | { readonly type: "use-consumable"; readonly effect: ConsumableEffect; readonly itemId?: number }
    | { readonly type: "discard"; readonly itemId: number }
    | { readonly type: "sort-inventory" }
    | { readonly type: "clear-inferior-equipment" }
    | { readonly type: "set-auto-clear-equipment"; readonly enabled: boolean };

/** Commands commit in arrival order before the next batch of fixed ticks. */
export function applyCombatCommand(simulation: CombatSimulation, command: CombatCommand): void {
    switch (command.type) {
        case "allocate": simulation.allocateAttribute(command.attribute); break;
        case "equip": simulation.equip(command.itemId); break;
        case "unequip": simulation.unequip(command.slot); break;
        case "equip-orb": simulation.equipOrb(command.itemId, command.socket); break;
        case "remove-orb": simulation.removeOrb(command.socket); break;
        case "cast-pulse": simulation.castPulse(); break;
        case "toggle-autocast": simulation.toggleAutoCast(); break;
        case "use-consumable": simulation.useConsumable(command.effect, command.itemId); break;
        case "discard": simulation.discard(command.itemId); break;
        case "sort-inventory": simulation.sortInventory(); break;
        case "clear-inferior-equipment": simulation.clearInferiorEquipment(); break;
        case "set-auto-clear-equipment": simulation.setAutoClearLowLevelEquipment(command.enabled); break;
        default:
            command satisfies never;
            throw new Error(`Unknown combat command: ${(command as { type: string }).type}`);
    }
}
