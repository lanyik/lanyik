import { BONUS_INFO, type BonusId, type EquipmentAffix } from "./Equipment";
import type { ItemDefinition } from "./ItemDefinition";
import { RARITY_NAMES } from "./Loot";

export interface AffixItem extends ItemDefinition<"affix", BonusId> { readonly amount: number }
export function createAffixItem(id: number, affix: EquipmentAffix): AffixItem {
    return Object.freeze({ type: "affix", value: affix.stat, amount: affix.value, size: 1, id, rarity: affix.rarity,
        name: `${RARITY_NAMES[affix.rarity]}·${BONUS_INFO[affix.stat].name}精粹` });
}
