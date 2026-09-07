import type { Attributes, EquipmentBonuses } from "./Equipment";
import type { DeterministicRandom } from "./DeterministicRandom";

export const STAT_LIMITS = Object.freeze({
    evasion: 0.6, blockChance: 0.85, lifesteal: 0.3, speedBonus: 2,
    damageReduction: 0.75, eliteReduction: 0.75, shieldRecovery: 2
});
export interface DerivedStats extends EquipmentBonuses {
    readonly maxMana: number;
    readonly manaRegen: number;
    readonly baseArmor: number;
    readonly attackRate: number;
    readonly skillInterval: number;
    readonly attackRange: number;
}

export function deriveStats(level: number, attributes: Attributes, gear: EquipmentBonuses): DerivedStats {
    const attackSpeed = gear.attackSpeed;
    const speedOverflow = Math.max(0, attackSpeed - STAT_LIMITS.speedBonus) + Math.max(0, gear.castSpeed - STAT_LIMITS.speedBonus);
    const baseArmor = attributes.vitality * 0.32 + gear.armor;
    return Object.freeze({
        ...gear,
        maxMana: 60 + level * 3 + attributes.spirit * 5,
        manaRegen: 1.5 + attributes.spirit * 0.3,
        maxHealth: Math.round((88 + level * 4 + attributes.vitality * 8 + gear.maxHealth) * (1 + gear.maxHealthBonus)),
        damage: (7 + level * 1.15 + attributes.might * 1.35 + gear.damage) * (1 + gear.damageBonus),
        baseArmor, armor: baseArmor * (1 + gear.armorBonus),
        block: (1 + attributes.agility * 0.2 + gear.block) * (1 + gear.blockBonus),
        moveSpeed: 2.7 * (1 + attributes.agility * 0.008) + gear.moveSpeed,
        healthRegen: (0.12 + attributes.vitality * 0.018 + gear.healthRegen) * (1 + gear.regenBonus),
        blockChance: Math.min(STAT_LIMITS.blockChance, 0.05 + gear.blockChance + Math.max(0, gear.evasion - STAT_LIMITS.evasion)),
        evasion: Math.min(STAT_LIMITS.evasion, gear.evasion),
        attackSpeed: Math.min(STAT_LIMITS.speedBonus, attackSpeed),
        castSpeed: Math.min(STAT_LIMITS.speedBonus, gear.castSpeed),
        attackRate: 1.38 * (1 + Math.min(STAT_LIMITS.speedBonus, attackSpeed)),
        skillInterval: 5 / (1 + Math.min(STAT_LIMITS.speedBonus, gear.castSpeed)),
        criticalChance: Math.min(1, 0.06 + gear.criticalChance),
        criticalDamage: 1.8 + gear.criticalDamage + speedOverflow,
        excellentChance: Math.min(1, gear.excellentChance), excellentDamage: 1.35 + gear.excellentDamage,
        lethalChance: Math.min(1, gear.lethalChance), lethalDamage: 5 + gear.lethalDamage,
        lifesteal: Math.min(STAT_LIMITS.lifesteal, gear.lifesteal),
        damageReduction: Math.min(STAT_LIMITS.damageReduction, gear.damageReduction),
        eliteReduction: Math.min(STAT_LIMITS.eliteReduction, gear.eliteReduction),
        thornsCap: 2 + gear.thornsCap,
        shieldRecovery: Math.max(STAT_LIMITS.shieldRecovery, 12 - gear.shieldRecovery),
        accuracy: 0.95 + gear.accuracy,
        pickupRadius: 3 + gear.pickupRadius,
        attackRange: 6.4
    });
}

export function rollAttack(stats: DerivedStats, random: DeterministicRandom, multiplier = 1) {
    const critical = random.chance(stats.criticalChance);
    const excellent = !critical && random.chance(stats.excellentChance);
    return { critical, damage: stats.damage * multiplier * (0.92 + random.next() * 0.16)
        * (critical ? stats.criticalDamage : excellent ? stats.excellentDamage : 1) };
}

export function outgoingDamage(stats: DerivedStats, rolledDamage: number, enemyMaxHealth: number, elite: boolean, lethal: boolean): number {
    return (rolledDamage + enemyMaxHealth * (stats.lifeExtraction + (lethal ? stats.lethalDamage : 0)) / 1000)
        * (1 + stats.damageIncrease) * (1 + (elite ? stats.eliteDamage : stats.normalDamage));
}

export function incomingDamage(stats: DerivedStats, rawDamage: number, elite: boolean, critical: boolean, blocked: boolean): number {
    const criticalMultiplier = critical ? 1 + Math.max(0, 0.6 - stats.criticalDamageReduction) : 1;
    const reduced = rawDamage * criticalMultiplier * 100 / (100 + stats.armor * 7)
        * (1 - stats.damageReduction) * (elite ? 1 - stats.eliteReduction : 1);
    return Math.max(0, reduced - (blocked ? stats.block : 0));
}

export function reflectedDamage(stats: DerivedStats, healthLost: number, enemyMaxHealth: number): number {
    if (healthLost <= 0) return 0;
    return Math.min(stats.baseArmor * stats.thornsCap, healthLost * stats.thorns + enemyMaxHealth * stats.thornsPerMille / 1000);
}
