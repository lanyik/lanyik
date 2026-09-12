import type { AttributeId, EquipmentSlot } from "./Equipment";
import type { ConsumableEffect } from "./InventoryItem";
import type { CombatSimulation } from "./CombatSimulation";
import type { SkillId } from "./Skills";
import type { Rarity } from "./Loot";

export type CombatCommand =
    | { readonly type: "allocate"; readonly attribute: AttributeId }
    | { readonly type: "equip"; readonly itemId: number }
    | { readonly type: "unequip"; readonly slot: EquipmentSlot }
    | { readonly type: "equip-orb"; readonly itemId: number; readonly socket: number }
    | { readonly type: "remove-orb"; readonly socket: number }
    | { readonly type: "cast-skill"; readonly skill: SkillId }
    | { readonly type: "equip-skill"; readonly skill: SkillId; readonly slot: number }
    | { readonly type: "upgrade-skill"; readonly skill: SkillId }
    | { readonly type: "toggle-autocast" }
    | { readonly type: "use-consumable"; readonly effect: ConsumableEffect; readonly itemId?: number }
    | { readonly type: "discard"; readonly itemId: number }
    | { readonly type: "sort-inventory" }
    | { readonly type: "merge-consumables" }
    | { readonly type: "clear-equipment-quality"; readonly maximum: Rarity }
    | { readonly type: "set-auto-clear-equipment"; readonly enabled: boolean };

/** Commands commit in arrival order before the next batch of fixed ticks. */
export function applyCombatCommand(simulation: CombatSimulation, command: CombatCommand): void {
    switch (command.type) {
        case "allocate": simulation.allocateAttribute(command.attribute); break;
        case "equip": simulation.equip(command.itemId); break;
        case "unequip": simulation.unequip(command.slot); break;
        case "equip-orb": simulation.equipOrb(command.itemId, command.socket); break;
        case "remove-orb": simulation.removeOrb(command.socket); break;
        case "cast-skill": simulation.castSkill(command.skill); break;
        case "equip-skill": simulation.equipSkill(command.skill, command.slot); break;
        case "upgrade-skill": simulation.upgradeSkill(command.skill); break;
        case "toggle-autocast": simulation.toggleAutoCast(); break;
        case "use-consumable": simulation.useConsumable(command.effect, command.itemId); break;
        case "discard": simulation.discard(command.itemId); break;
        case "sort-inventory": simulation.sortInventory(); break;
        case "merge-consumables": simulation.mergeConsumables(); break;
        case "clear-equipment-quality": simulation.clearEquipmentQuality(command.maximum); break;
        case "set-auto-clear-equipment": simulation.setAutoClearEquipment(command.enabled); break;
        default:
            command satisfies never;
            throw new Error(`Unknown combat command: ${(command as { type: string }).type}`);
    }
}
