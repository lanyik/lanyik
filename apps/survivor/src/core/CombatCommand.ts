import type { AttributeId, EquipmentSlot } from "./Equipment";
import type { ConsumableEffect } from "./InventoryItem";
import type { CombatSimulation } from "./CombatSimulation";
import type { SkillId } from "./Skills";
import type { Rarity } from "./Loot";
import type { CraftOperation } from "./Crafting";
import type { ItemType } from "./ItemDefinition";

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
    | { readonly type: "sort-inventory" }
    | { readonly type: "merge-consumables" }
    | { readonly type: "craft"; readonly operation: CraftOperation }
    | { readonly type: "cultivate-spirit"; readonly attribute: AttributeId }
    | { readonly type: "set-equipment-lock"; readonly itemId: number; readonly locked: boolean }
    | { readonly type: "set-auto-recycle"; readonly itemType: ItemType; readonly maximum: Rarity | null };

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
        case "sort-inventory": simulation.sortInventory(); break;
        case "merge-consumables": simulation.mergeConsumables(); break;
        case "craft": simulation.craft(command.operation); break;
        case "cultivate-spirit": simulation.cultivateSpirit(command.attribute); break;
        case "set-equipment-lock": simulation.setEquipmentLock(command.itemId, command.locked); break;
        case "set-auto-recycle": simulation.setAutoRecycle(command.itemType, command.maximum); break;
        default:
            command satisfies never;
            throw new Error(`Unknown combat command: ${(command as { type: string }).type}`);
    }
}
