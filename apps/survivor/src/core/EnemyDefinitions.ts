import { ticksForSeconds } from "./GameConfig";
export enum EnemyKind { Grunt, Scout, Guard, Caster, Charger, Healer, StoneSovereign, StormOracle, EmberChampion }
export const BOSS_KINDS = Object.freeze([EnemyKind.Caster, EnemyKind.StoneSovereign, EnemyKind.StormOracle, EnemyKind.EmberChampion]);
export function enemyName(kind: EnemyKind, boss: boolean): string {
    return boss && kind === EnemyKind.Caster ? "裂爪领主" : ENEMY_DEFINITIONS[kind].name;
}

/** Opponent probabilities also bound the useful range of player counter-stats. */
export const ENEMY_HIT_RULES = Object.freeze({
    evasion: Object.freeze({ normal: .02, elite: .05, boss: .08 }),
    criticalChance: Object.freeze({ normal: .06, elite: .14, boss: .22 }),
    criticalDamageBonus: .6
});

interface EnemyDefinition {
    readonly name: string; readonly model: 0 | 1 | 2 | 3 | 4; readonly tint: string; readonly ranged: boolean;
    readonly health: number;
    readonly healthGrowth: number;
    /** Baked model height before the common radius/.3 presentation scale. */
    readonly height: number;
    readonly speed: number;
    readonly damage: number;
    readonly damageGrowth: number;
    readonly radius: number;
    readonly experience: number;
    readonly reach: number;
    readonly windupTicks: number;
    readonly recoveryTicks: number;
    readonly cooldownTicks: number;
}

type EnemyConfig = Omit<EnemyDefinition, "windupTicks" | "recoveryTicks" | "cooldownTicks"> & {
    readonly windup: number; readonly recovery: number; readonly cooldown: number;
};
function enemy({ windup, recovery, cooldown, ...definition }: EnemyConfig): EnemyDefinition {
    return Object.freeze({ ...definition,
        windupTicks: ticksForSeconds(windup), recoveryTicks: ticksForSeconds(recovery), cooldownTicks: ticksForSeconds(cooldown) });
}
/** Enemy and boss archetypes share the existing baked mesh pools. */
export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
    enemy({ name: "地精仆从", model: 0, tint: "#ffffff", height: 1, health: 28, healthGrowth: .18, speed: 1.18, damage: 20, damageGrowth: .105,
        radius: .3, experience: 6, reach: .45, ranged: false, windup: .36, recovery: .64, cooldown: .15 }),
    enemy({ name: "裂隙蛛兽", model: 3, tint: "#ffffff", height: .6, health: 20, healthGrowth: .16, speed: 1.72, damage: 15, damageGrowth: .10,
        radius: .25, experience: 7, reach: .35, ranged: false, windup: .24, recovery: .46, cooldown: .7 }),
    enemy({ name: "裂岩守卫", model: 4, tint: "#ffffff", height: 1.5, health: 78, healthGrowth: .22, speed: .72, damage: 42, damageGrowth: .115,
        radius: .46, experience: 16, reach: 1, ranged: false, windup: .8, recovery: 1, cooldown: .5 }),
    enemy({ name: "小恶魔术士", model: 2, tint: "#ffffff", height: 1.25, health: 40, healthGrowth: .20, speed: 1.34, damage: 26, damageGrowth: .11,
        radius: .34, experience: 12, reach: 7, ranged: true, windup: .7, recovery: 1.3, cooldown: .6 }),
    enemy({ name: "赤脊冲锋者", model: 1, tint: "#ff9370", height: 1, health: 56, healthGrowth: .20, speed: 1.05, damage: 34, damageGrowth: .11,
        radius: .4, experience: 14, reach: .55, ranged: false, windup: .5, recovery: .8, cooldown: .5 }),
    enemy({ name: "幽光祭司", model: 2, tint: "#8bffbb", height: 1.25, health: 48, healthGrowth: .21, speed: 1.12, damage: 12, damageGrowth: .095,
        radius: .31, experience: 16, reach: 6, ranged: true, windup: .9, recovery: 1, cooldown: 1 }),
    enemy({ name: "断层岩王", model: 4, tint: "#b9ccff", height: 1.5, health: 48, healthGrowth: .20, speed: .65, damage: 28, damageGrowth: .11,
        radius: .46, experience: 18, reach: 1, ranged: false, windup: .9, recovery: 1.1, cooldown: .6 }),
    enemy({ name: "风暴先知", model: 2, tint: "#b3a0ff", height: 1.25, health: 36, healthGrowth: .20, speed: 1.15, damage: 22, damageGrowth: .11,
        radius: .34, experience: 18, reach: 8, ranged: true, windup: .85, recovery: 1.3, cooldown: .6 }),
    enemy({ name: "烬刃斗王", model: 1, tint: "#ffb85f", height: 1, health: 44, healthGrowth: .20, speed: 1.25, damage: 27, damageGrowth: .11,
        radius: .4, experience: 18, reach: .8, ranged: false, windup: .6, recovery: .9, cooldown: .4 })
]);

/** Fixed regional level curves, calibrated against same-level equipment; never read the player's loadout. */
const ENEMY_GROWTH = Object.freeze({ armorPressure: .077, eliteHealth: 4, eliteDamage: 1.4, bossHealth: 16, bossDamage: 1.8 });
export function enemyStats(kind: EnemyKind, level: number, regionScale: number, elite: boolean, boss: boolean) {
    const d = ENEMY_DEFINITIONS[kind], levels = level - 1;
    return {
        health: d.health * (1 + d.healthGrowth * levels) * regionScale * (boss ? ENEMY_GROWTH.bossHealth : elite ? ENEMY_GROWTH.eliteHealth : 1),
        damage: d.damage * (1 + d.damageGrowth * levels) * (1 + ENEMY_GROWTH.armorPressure * levels) * Math.sqrt(regionScale)
            * (boss ? ENEMY_GROWTH.bossDamage : elite ? ENEMY_GROWTH.eliteDamage : 1),
        speed: d.speed * Math.min(1.35, 1 + (regionScale * (1 + levels * .15) - 1) * .08)
    };
}
export const ENEMY_SPECIAL = Object.freeze({
    charge: Object.freeze({ windup: .75, duration: .55, recovery: .7, speed: 12, minRange: 3, maxRange: 6.5, cooldown: 5, damage: 1.3 }),
    heal: Object.freeze({ radius: 6, threshold: .65, fraction: .2, sacrifice: .12, windup: 1.1, recovery: .6, cooldown: 5 }),
    reave: Object.freeze({ radius: 3.4, halfArc: 1.4, width: .3, windup: .9, duration: .55, recovery: .6, cooldown: 5, damage: 1.2 }),
    volley: Object.freeze({ spread: .48, turnRate: .65, turnSeconds: .8, windup: 1.05, recovery: .85, cooldown: 6, damage: .8 }),
    jaws: Object.freeze({ halfLength: 2.8, halfGap: 3.2, width: .35, windup: 1.15, duration: .9, recovery: .7, cooldown: 7, damage: 1.45 }),
    fault: Object.freeze({ length: 6, width: .6, windup: 1.05, duration: .75, recovery: .8, cooldown: 5, damage: 1.5 }),
    quake: Object.freeze({ radius: 6, width: .35, windup: 1.25, duration: 1.1, recovery: .9, cooldown: 6, damage: 1.25 }),
    storm: Object.freeze({ waves: 3, interval: .32, spread: .42, windup: 1.1, recovery: 1.1, cooldown: 5, damage: .65 }),
    healingWard: Object.freeze({ duration: 3, reduction: .25 }),
    guardReduction: .4, enrageHealth: .5
});
