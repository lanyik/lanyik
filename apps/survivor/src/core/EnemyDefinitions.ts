import { ticksForSeconds } from "./GameConfig";
export type EnemyKind = 0 | 1 | 2 | 3 | 4 | 5;

export interface EnemyDefinition {
    readonly name: string; readonly model: 0 | 1 | 2 | 3; readonly tint: string; readonly ranged: boolean;
    readonly health: number;
    readonly speed: number;
    readonly damage: number;
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
/** Gameplay archetypes share four baked mesh pools; no extra per-archetype GPU allocation. */
export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
    enemy({ name: "地精仆从", model: 0, tint: "#ffffff", health: 22, speed: 1.18, damage: 7,
        radius: .3, experience: 6, reach: .45, ranged: false, windup: .36, recovery: .64, cooldown: .15 }),
    enemy({ name: "小恶魔斥候", model: 1, tint: "#ffffff", health: 17, speed: 1.72, damage: 6,
        radius: .25, experience: 7, reach: .35, ranged: false, windup: .24, recovery: .46, cooldown: .7 }),
    enemy({ name: "地精重卫", model: 2, tint: "#ffe1aa", health: 70, speed: .72, damage: 15,
        radius: .46, experience: 16, reach: 1, ranged: false, windup: .8, recovery: 1, cooldown: .5 }),
    enemy({ name: "小恶魔术士", model: 3, tint: "#ffffff", health: 44, speed: 1.34, damage: 11,
        radius: .34, experience: 12, reach: 7, ranged: true, windup: .7, recovery: 1.3, cooldown: .6 }),
    enemy({ name: "赤脊冲锋者", model: 2, tint: "#ff9370", health: 52, speed: 1.05, damage: 13,
        radius: .4, experience: 14, reach: .55, ranged: false, windup: .5, recovery: .8, cooldown: .5 }),
    enemy({ name: "幽光祭司", model: 3, tint: "#8bffbb", health: 38, speed: 1.12, damage: 7,
        radius: .31, experience: 16, reach: 6, ranged: true, windup: .9, recovery: 1, cooldown: 1 })
]);
export const ENEMY_SPECIAL = Object.freeze({
    charge: Object.freeze({ windup: .75, duration: .55, recovery: .7, speed: 12, minRange: 3, maxRange: 6.5, cooldown: 5, damage: 1.3 }),
    heal: Object.freeze({ radius: 6, threshold: .65, fraction: .2, windup: .9, recovery: .6, cooldown: 5 }),
    nova: Object.freeze({ radius: 3.4, windup: .9, recovery: .7, cooldown: 5, damage: 1.2 }),
    guardReduction: .4, enrageHealth: .5
});
