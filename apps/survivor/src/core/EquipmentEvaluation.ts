import { deriveStats, type DerivedStats } from "./CombatStats";
import { BONUS_IDS, BONUS_INFO, sumEquipment, type Attributes, type Equipment, type EquippedItems } from "./Equipment";

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
    readonly level: number;
    readonly attributes: Attributes;
    readonly equipment: EquippedItems;
    readonly stats: DerivedStats;
}

export interface EquipmentComparison {
    readonly current: Equipment | undefined;
    readonly power: number;
    readonly delta: number;
    readonly scoreDelta: number;
    readonly stats: DerivedStats;
    readonly canClear: boolean;
}

export function compareEquipment(item: Equipment, player: EquipmentContext): EquipmentComparison {
    const current = player.equipment[item.value];
    const stats = deriveStats(player.level, player.attributes, sumEquipment({ ...player.equipment, [item.value]: item }));
    const power = battlePower(stats);
    const delta = power - battlePower(player.stats);
    const scoreDelta = item.score - (current?.score ?? 0);
    return { current, power, delta, scoreDelta, stats,
        // Keep empty-slot items, ties, combat upgrades and higher-scoring specialist gear.
        canClear: current !== undefined && delta < 0 && scoreDelta <= 0 };
}
