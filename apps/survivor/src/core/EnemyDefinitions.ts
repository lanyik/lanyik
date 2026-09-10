import { ticksForSeconds } from "./GameConfig";
export type EnemyKind = 0 | 1 | 2 | 3;

export interface EnemyDefinition {
    readonly health: number;
    readonly speed: number;
    readonly damage: number;
    readonly radius: number;
    readonly experience: number;
    readonly reach: number;
    readonly windupTicks: number;
    readonly recoveryTicks: number;
}

/** Combat timing belongs to simulation ticks; models follow its normalized phase. */
export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
    Object.freeze({ health: 22, speed: 1.18, damage: 7, radius: .3, experience: 6, reach: .45, windupTicks: ticksForSeconds(.36), recoveryTicks: ticksForSeconds(.64) }),
    Object.freeze({ health: 17, speed: 1.72, damage: 6, radius: .25, experience: 7, reach: .35, windupTicks: ticksForSeconds(.24), recoveryTicks: ticksForSeconds(.46) }),
    Object.freeze({ health: 70, speed: .72, damage: 15, radius: .46, experience: 16, reach: 1, windupTicks: ticksForSeconds(.8), recoveryTicks: ticksForSeconds(1) }),
    Object.freeze({ health: 44, speed: 1.34, damage: 11, radius: .34, experience: 12, reach: 7, windupTicks: ticksForSeconds(.7), recoveryTicks: ticksForSeconds(1.3) })
]);
