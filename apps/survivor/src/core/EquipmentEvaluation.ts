import { deriveStats, type DerivedStats } from "./CombatStats";
import { BONUS_IDS, BONUS_INFO, canEquipEquipment, sumEquipment, type Attributes, type Equipment, type EquippedItems, type EquipmentBonuses } from "./Equipment";
import type { CharacterClassId } from "./CharacterClass";

// These multipliers are already applied to the final values by deriveStats.
// Exploration rewards have no effect on battle power.
const EXCLUDED = new Set(["maxHealthBonus", "damageBonus", "armorBonus", "blockBonus", "regenBonus",
    "experienceBonus", "goldBonus", "pickupRadius", "shieldRecovery"]);

/** A deterministic weighted rating of final combat attributes, including equipment and caps. */
export function battlePower(stats: DerivedStats): number {
    let score = stats.maxMana * 0.35 + stats.manaRegen * 22 + (12 - stats.shieldRecovery) * BONUS_INFO.shieldRecovery.weight;
    for (const id of BONUS_IDS) if (!EXCLUDED.has(id)) score += stats[id] * BONUS_INFO[id].weight;
    return Math.round(score);
}

export interface EquipmentContext {
    readonly classId: CharacterClassId;
    readonly passiveBonuses?: Readonly<Partial<EquipmentBonuses>>;
    readonly level: number;
    readonly attributes: Attributes;
    readonly equipment: EquippedItems;
    readonly stats: DerivedStats;
}

interface EquipmentComparison {
    readonly canEquip: boolean;
    readonly current: Equipment | undefined;
    readonly power: number;
    readonly delta: number;
    readonly scoreDelta: number;
    readonly stats: DerivedStats;
    readonly canClear: boolean;
}

export function compareEquipment(item: Equipment, player: EquipmentContext): EquipmentComparison {
    const current = player.equipment[item.value];
    if (!canEquipEquipment(item, player.classId)) return { current, canEquip: false, power: battlePower(player.stats), delta: 0,
        scoreDelta: item.score - (current?.score ?? 0), stats: player.stats, canClear: false };
    const stats = deriveStats(player.level, player.attributes, sumEquipment({ ...player.equipment, [item.value]: item }), player.passiveBonuses);
    const power = battlePower(stats);
    const delta = power - battlePower(player.stats);
    const scoreDelta = item.score - (current?.score ?? 0);
    return { current, canEquip: true, power, delta, scoreDelta, stats,
        // Effective combat power already includes caps; raw score must not veto cleanup.
        canClear: !item.locked && current !== undefined && delta < 0 };
}
