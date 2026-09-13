import { deriveStats, incomingDamage, outgoingDamage } from "../../src/core/CombatStats";
import { DeterministicRandom } from "../../src/core/DeterministicRandom";
import { EQUIPMENT_SLOTS, generateEquipment, sumEquipment, type Equipment, type EquipmentSlot } from "../../src/core/Equipment";
import { BASE_LOOT_PROFILE, type Rarity } from "../../src/core/Loot";
import { ENEMY_DEFINITIONS, ENEMY_HIT_RULES, enemyStats, type EnemyKind } from "../../src/core/EnemyDefinitions";
import { GAME_CONFIG } from "../../src/core/GameConfig";

/** Real generated 11-slot sets, fixed rarity, first item per slot, no best-of-many affix selection. */
export function balanceReference(level: number, sample: number, rarity: Rarity = "magic") {
    const random = new DeterministicRandom(`balance:${sample}`), gear: Partial<Record<EquipmentSlot, Equipment>> = {};
    let count = 0;
    for (let id = 2; id < 10_000 && count < EQUIPMENT_SLOTS.length; id++) {
        const item = generateEquipment(random, id, level, BASE_LOOT_PROFILE, rarity);
        if (item.rarity === rarity && !gear[item.value]) { gear[item.value] = item; count++; }
    }
    if (count !== EQUIPMENT_SLOTS.length) throw new Error("Balance reference did not complete its equipment set");
    const points = (level - 1) * 2, main = Math.floor(points * .4), agility = Math.floor(points * .1);
    return deriveStats(level, { might: 5 + main, vitality: 5 + main, agility: 5 + agility, spirit: 5 + points - main * 2 - agility }, sumEquipment(gear));
}

export function balanceEncounter(level: number, sample: number, kind: EnemyKind, elite = false, boss = false, regionScale = 1) {
    const player = balanceReference(level, sample), enemy = enemyStats(kind, level, regionScale, elite, boss), definition = ENEMY_DEFINITIONS[kind];
    const hit = incomingDamage(player, enemy.damage, elite, false, false);
    const critical = Math.max(0, (boss ? ENEMY_HIT_RULES.criticalChance.boss : elite ? ENEMY_HIT_RULES.criticalChance.elite : ENEMY_HIT_RULES.criticalChance.normal) - player.criticalResistance);
    let expected = 0;
    for (const crit of [false, true]) for (const block of [false, true]) expected += incomingDamage(player, enemy.damage, elite, crit, block)
        * (crit ? critical : 1 - critical) * (block ? player.blockChance : 1 - player.blockChance) * (1 - player.evasion);
    const cycle = (definition.windupTicks + definition.recoveryTicks + definition.cooldownTicks) / GAME_CONFIG.timing.simulationHz;
    const outgoing = outgoingDamage(player, player.damage * (player.criticalChance * player.criticalDamage
        + (1 - player.criticalChance) * (1 + player.excellentChance * (player.excellentDamage - 1))), enemy.health, elite, false);
    const evasion = boss ? ENEMY_HIT_RULES.evasion.boss : elite ? ENEMY_HIT_RULES.evasion.elite : ENEMY_HIT_RULES.evasion.normal;
    const dps = outgoing * player.attackRate * Math.min(1, player.accuracy - evasion);
    return { health: enemy.health, damage: enemy.damage, playerHealth: player.maxHealth, playerArmor: player.armor,
        hitPercent: hit / player.maxHealth * 100, basicTtk: enemy.health / dps,
        netBasicDps: expected / cycle * Math.max(0, 1 - cycle / player.shieldRecovery) - player.healthRegen * 2 };
}
