import { GAME_CONFIG } from "./GameConfig";
import type { DerivedStats } from "./CombatStats";

export const SKILL_IDS = ["pulse", "frost", "chain", "dash", "ward"] as const;
export type SkillId = typeof SKILL_IDS[number];
export interface SkillDefinition {
    readonly name: string; readonly description: string; readonly color: string;
    readonly mana: number; readonly cooldown: number; readonly unlock: number; readonly automatic: boolean;
}
export const SKILLS: Readonly<Record<SkillId, SkillDefinition>> = Object.freeze({
    pulse: Object.freeze({ name: "裂隙脉冲", description: "震击周围敌人；升级提高伤害与范围。", color: "#bd93ff", mana: 18, cooldown: 5, unlock: 1, automatic: true }),
    frost: Object.freeze({ name: "霜环", description: "冰霜伤害并减速 50%；升级延长减速并提高伤害。", color: "#7bdeff", mana: 22, cooldown: 8, unlock: 1, automatic: true }),
    chain: Object.freeze({ name: "连锁闪电", description: "依次跳向不同敌人，每次跳跃伤害衰减；升级增加目标数。", color: "#ffe29a", mana: 24, cooldown: 7, unlock: 1, automatic: true }),
    dash: Object.freeze({ name: "疾风步", description: "沿移动方向或朝向疾行，期间免伤；升级增加距离。仅手动施放。", color: "#80f1ce", mana: 12, cooldown: 6, unlock: 1, automatic: false }),
    ward: Object.freeze({ name: "守护结界", description: "获得限时护盾，先于生命吸收伤害；升级提高护盾值。", color: "#8dafef", mana: 26, cooldown: 12, unlock: 2, automatic: true })
});
export interface SkillSnapshot {
    readonly points: number;
    readonly loadout: readonly SkillId[];
    readonly ranks: Readonly<Record<SkillId, number>>;
    readonly remaining: Readonly<Record<SkillId, number>>;
    readonly ward: number;
    readonly wardRemaining: number;
    readonly dashing: boolean;
}
export function skillIndex(id: SkillId): number {
    const index = SKILL_IDS.indexOf(id);
    if (index < 0) throw new RangeError("Unknown player skill");
    return index;
}
export function skillValues(id: SkillId, rank: number, stats: DerivedStats) {
    return { mana: SKILLS[id].mana, cooldown: SKILLS[id].cooldown / (1 + stats.castSpeed),
        damage: id === "pulse" ? 1.3 + .2 * (rank - 1) : id === "frost" ? .8 + .15 * (rank - 1) : 1.6 + .2 * (rank - 1),
        radius: id === "pulse" ? 3.2 + .15 * (rank - 1) : 4,
        slowSeconds: 2.5 + .3 * (rank - 1), targets: 3 + Math.floor(rank / 2),
        dashDistance: 3.8 + .35 * (rank - 1), ward: Math.round(stats.maxHealth * (.25 + .04 * (rank - 1))) };
}
export const DEFAULT_LOADOUT: readonly SkillId[] = Object.freeze(SKILL_IDS.slice(0, GAME_CONFIG.skills.slots));
