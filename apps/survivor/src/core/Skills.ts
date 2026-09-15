import { GAME_CONFIG } from "./GameConfig";
import type { DerivedStats } from "./CombatStats";
import type { TypedValue } from "./ItemDefinition";

export const SKILL_IDS = ["pulse", "frost", "chain", "dash", "ward"] as const;
export type SkillId = typeof SKILL_IDS[number];
/** Shared gameplay rules consumed by the authority and skill descriptions. */
export const SKILL_RULES = Object.freeze({
    chain: Object.freeze({ firstRange: 7, jumpRange: 4, damageRetention: .8, baseTargets: 3, ranksPerTarget: 2 }),
    dash: Object.freeze({ durationSeconds: .25 }),
    ward: Object.freeze({ durationSeconds: 6, automaticHealthRatio: .6 }),
    frost: Object.freeze({ slowScale: .5 })
});
export function chainTargets(rank: number): number {
    return SKILL_RULES.chain.baseTargets + Math.floor(rank / SKILL_RULES.chain.ranksPerTarget);
}
interface SkillDefinition extends TypedValue<"skill", SkillId> {
    readonly school: string; readonly role: string;
    readonly name: string; readonly description: string; readonly color: string;
    readonly mana: number; readonly cooldown: number; readonly unlock: number; readonly automatic: boolean;
}
export const SKILLS: Readonly<Record<SkillId, SkillDefinition>> = Object.freeze({
    pulse: Object.freeze({ type: "skill", value: "pulse", school: "虚空", role: "范围爆发", name: "裂隙脉冲", description: "释放虚空能量，震击周围的敌人。", color: "#bd93ff", mana: 18, cooldown: 5, unlock: 1, automatic: true }),
    frost: Object.freeze({ type: "skill", value: "frost", school: "冰霜", role: "范围控制", name: "霜环", description: "冰晶向外绽放，对周围敌人造成伤害与减速。", color: "#7bdeff", mana: 22, cooldown: 8, unlock: 1, automatic: true }),
    chain: Object.freeze({ type: "skill", value: "chain", school: "雷霆", role: "连锁打击", name: "连锁闪电", description: "电弧在不同敌人之间跳跃，伤害逐跳衰减。", color: "#ffe29a", mana: 24, cooldown: 7, unlock: 1, automatic: true }),
    dash: Object.freeze({ type: "skill", value: "dash", school: "疾风", role: "位移免伤", name: "疾风步", description: "化为疾风沿朝向穿行，疾行期间免疫伤害。", color: "#80f1ce", mana: 12, cooldown: 6, unlock: 1, automatic: false }),
    ward: Object.freeze({ type: "skill", value: "ward", school: "星辉", role: "护盾防御", name: "守护结界", description: "以星辉结成护罩，先于生命承受伤害。", color: "#8dafef", mana: 26, cooldown: 12, unlock: 2, automatic: true })
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
        slowSeconds: 2.5 + .3 * (rank - 1), targets: chainTargets(rank),
        dashDistance: 3.8 + .35 * (rank - 1), ward: Math.round(stats.maxHealth * (.25 + .04 * (rank - 1))) };
}
export const DEFAULT_LOADOUT: readonly SkillId[] = Object.freeze(SKILL_IDS.slice(0, GAME_CONFIG.skills.slots));
