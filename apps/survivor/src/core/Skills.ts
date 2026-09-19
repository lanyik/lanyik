import type { DerivedStats } from "./CombatStats";
import type { TypedValue } from "./ItemDefinition";

export const SKILL_IDS = ["pulse", "frost", "chain", "dash", "ward", "meteor", "vortex", "blades", "icebolt", "icelance", "icestorm", "blizzard", "shatter", "absolutezero"] as const;
export type SkillId = typeof SKILL_IDS[number];
export const FROST_SKILLS: readonly SkillId[] = ["icebolt", "icelance", "icestorm", "shatter", "frost", "blizzard", "absolutezero"];
export const isFrostSkill = (id: SkillId): boolean => FROST_SKILLS.includes(id);
export const isUltimate = (id: SkillId): boolean => id === "shatter" || id === "absolutezero";
export const mobileCast = (id: SkillId): boolean => id === "pulse" || id === "chain" || id === "icebolt" || id === "ward" || id === "dash";
export interface SkillModifiers { readonly power: number; readonly shape: number; readonly tempo: number;
    readonly damage: number; readonly economy: number; readonly duration: number; readonly shatter: number; readonly winter: number }
export const NO_SKILL_MODIFIERS: SkillModifiers = Object.freeze({ power: 0, shape: 0, tempo: 0, damage: 0, economy: 0, duration: 0, shatter: 0, winter: 0 });
/** Windup and recovery share one actor action, even across different skill slots. */
export const SKILL_TIMINGS: Readonly<Record<SkillId, readonly [number, number]>> = Object.freeze({
    pulse: [.18, .28], frost: [.25, .3], chain: [.2, .3], dash: [0, .25], ward: [.15, .25],
    meteor: [.45, .4], vortex: [.35, .35], blades: [.3, .3], icebolt: [.16, .22], icelance: [.3, .3],
    icestorm: [.45, .4], blizzard: [.4, .35], shatter: [.6, .5], absolutezero: [.6, .5]
});
/** Shared gameplay rules consumed by the authority and skill descriptions. */
export const SKILL_RULES = Object.freeze({
    chain: Object.freeze({ firstRange: 7, jumpRange: 4, damageRetention: .8, baseTargets: 3, ranksPerTarget: 2 }),
    dash: Object.freeze({ durationSeconds: .25 }),
    ward: Object.freeze({ durationSeconds: 6, automaticHealthRatio: .6 }),
    pulse: Object.freeze({ chilledMultiplier: 1.5 }),
    meteor: Object.freeze({ range: 8, delay: .9 }),
    vortex: Object.freeze({ range: 7, duration: 4, interval: .5, pull: .65, bossPullScale: .2 }),
    blades: Object.freeze({ duration: 4, interval: .25, width: .55 })
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
    pulse: Object.freeze({ type: "skill", value: "pulse", school: "虚空", role: "碎冰爆发", name: "裂隙脉冲", description: "撕开周围空间；对减速中的敌人触发额外碎裂伤害。", color: "#bd93ff", mana: 18, cooldown: 5, unlock: 1, automatic: true }),
    frost: Object.freeze({ type: "skill", value: "frost", school: "冰霜", role: "范围控制", name: "霜环", description: "冰晶向外绽放，造成冰伤并积累寒意，满层尝试冻结。", color: "#7bdeff", mana: 22, cooldown: 8, unlock: 8, automatic: true }),
    chain: Object.freeze({ type: "skill", value: "chain", school: "雷霆", role: "连锁打击", name: "连锁闪电", description: "电弧在不同敌人之间跳跃，伤害逐跳衰减。", color: "#ffe29a", mana: 24, cooldown: 7, unlock: 1, automatic: true }),
    dash: Object.freeze({ type: "skill", value: "dash", school: "疾风", role: "位移免伤", name: "疾风步", description: "化为疾风沿朝向穿行，疾行期间免疫伤害。", color: "#80f1ce", mana: 12, cooldown: 6, unlock: 1, automatic: false }),
    ward: Object.freeze({ type: "skill", value: "ward", school: "星辉", role: "护盾防御", name: "守护结界", description: "以星辉结成护罩，先于生命承受伤害。", color: "#8dafef", mana: 26, cooldown: 12, unlock: 2, automatic: true }),
    meteor: Object.freeze({ type: "skill", value: "meteor", school: "烈焰", role: "延迟轰击", name: "陨星坠落", description: "锁定最近可见敌人的位置，短暂蓄势后陨星砸落；可配合聚怪与减速。", color: "#ff9954", mana: 30, cooldown: 9, unlock: 2, automatic: true }),
    vortex: Object.freeze({ type: "skill", value: "vortex", school: "虚空", role: "持续聚怪", name: "引力涡旋", description: "在最近可见敌人脚下打开涡旋，周期伤害并将敌人拖向中心；领主抗拒大部分牵引。", color: "#c17bff", mana: 28, cooldown: 11, unlock: 3, automatic: true }),
    blades: Object.freeze({ type: "skill", value: "blades", school: "星辉", role: "移动刃阵", name: "星环刃阵", description: "召唤随身旋转的飞刃，持续切割外围环带；贴身内圈不受伤害，走位决定覆盖。", color: "#7fffd6", mana: 24, cooldown: 10, unlock: 2, automatic: true }),
    icebolt: Object.freeze({ type: "skill", value: "icebolt", school: "冰霜", role: "寒意积累", name: "冰霜弹", description: "射出冰晶命中最近可见敌人，附加寒意；冰屑侧路增加分散命中的不同目标。", color: "#9deaff", mana: 9, cooldown: 2, unlock: 2, automatic: true }),
    icelance: Object.freeze({ type: "skill", value: "icelance", school: "冰霜", role: "穿刺爆发", name: "冰枪", description: "沿目标方向刺穿一条直线上的敌人，命中附加寒意。", color: "#89caff", mana: 20, cooldown: 5, unlock: 8, automatic: true }),
    icestorm: Object.freeze({ type: "skill", value: "icestorm", school: "冰霜", role: "区域伤害", name: "冰晶风暴", description: "在锁定地点降下冰晶，每半秒打击区域内敌人。", color: "#b6deff", mana: 30, cooldown: 10, unlock: 20, automatic: true }),
    blizzard: Object.freeze({ type: "skill", value: "blizzard", school: "冰霜", role: "持续控场", name: "暴风雪", description: "持续积累寒意；满五层尝试冻结，冻结结束后产生控制抵抗。", color: "#79dcf2", mana: 28, cooldown: 11, unlock: 20, automatic: true }),
    shatter: Object.freeze({ type: "skill", value: "shatter", school: "冰霜", role: "终极碎裂", name: "极寒破碎", description: "引爆周围冰晶，对冻结目标造成额外碎裂伤害并消费冻结。", color: "#dfedff", mana: 45, cooldown: 30, unlock: 45, automatic: true }),
    absolutezero: Object.freeze({ type: "skill", value: "absolutezero", school: "冰霜", role: "终极控制", name: "绝对零度", description: "释放极寒领域，尝试冻结周围敌人并附加寒意；无法绕过控制抵抗或首领免疫。", color: "#b6fff5", mana: 42, cooldown: 32, unlock: 45, automatic: true })
});
export interface SkillSnapshot {
    readonly refundBlocked: boolean;
    readonly points: number;
    readonly loadout: readonly (SkillId | null)[];
    readonly ranks: Readonly<Record<SkillId, number>>;
    readonly remaining: Readonly<Record<SkillId, number>>;
    readonly ward: number;
    readonly wardRemaining: number;
    readonly dashing: boolean;
    readonly recoveryRemaining: number;
    readonly build: { readonly revision: number; readonly ranks: readonly number[] };
    readonly modifiers: Readonly<Partial<Record<SkillId, SkillModifiers>>>;
    readonly action: { readonly skill: SkillId; readonly phase: "windup" | "recovery"; readonly remaining: number; readonly duration: number } | null;
    readonly statuses: readonly { readonly kind: number; readonly name: string; readonly beneficial: boolean; readonly control: boolean; readonly amount: number; readonly remaining: number }[];
}
export function skillIndex(id: SkillId): number {
    const index = SKILL_IDS.indexOf(id);
    if (index < 0) throw new RangeError("Unknown player skill");
    return index;
}
export function skillValues(id: SkillId, rank: number, stats: DerivedStats, m: SkillModifiers = NO_SKILL_MODIFIERS) {
    if (isFrostSkill(id)) {
        const baseDamage = id === "icebolt" ? .9 : id === "icelance" ? 2 : id === "icestorm" ? .5 : id === "blizzard" ? .22 : id === "shatter" ? 4 : id === "absolutezero" ? 1.5 : .8;
        const shape = ["icebolt", "icelance"].includes(id) ? 0 : m.shape;
        const duration = id === "icestorm" ? 4 * (1 + .1 * m.tempo) : 4;
        const reduction = ["icelance", "shatter"].includes(id) ? .02 * m.tempo : 0;
        return { mana: Math.max(1, Math.ceil(SKILLS[id].mana * (1 - Math.min(.5, .02 * m.economy + (id === "icebolt" ? .03 * m.tempo : 0))))),
            cooldown: Math.max(isUltimate(id) ? 10 : .5, SKILLS[id].cooldown * (1 - reduction) / (1 + stats.castSpeed)),
            damage: baseDamage * (1 + (isUltimate(id) ? .12 : .06) * Math.max(0, rank - 1)) * (1 + .04 * m.power + .03 * m.damage) * (m.winter ? .85 : 1),
            radius: (id === "icebolt" || id === "icelance" ? 7 : isUltimate(id) ? 5 : id === "frost" ? 4 : 3.4) * (1 + .05 * shape),
            slowSeconds: 3 * (1 + .05 * m.duration + (id === "absolutezero" ? .1 * m.tempo : 0)), targets: Math.min(id === "icelance" ? 8 : 6, 1 + m.shape),
            dashDistance: 0, ward: 0, duration, chill: (id === "frost" ? 2 : 1) * (1 + .15 * m.winter + (["frost", "blizzard"].includes(id) ? .1 * m.tempo : 0)) * (m.shatter ? .75 : 1),
            freezeSeconds: 1 + .1 * m.winter, frozenDamage: 1 + .1 * m.shatter };
    }
    return { mana: SKILLS[id].mana, cooldown: SKILLS[id].cooldown / (1 + stats.castSpeed),
        damage: id === "pulse" ? 1.3 + .2 * (rank - 1) : id === "frost" ? .8 + .15 * (rank - 1)
            : id === "meteor" ? 2.8 + .35 * (rank - 1) : id === "vortex" ? .3 + .05 * (rank - 1)
                : id === "blades" ? .24 + .04 * (rank - 1) : 1.6 + .2 * (rank - 1),
        radius: id === "pulse" ? 3.2 + .15 * (rank - 1) : id === "meteor" ? 2.6 : id === "vortex" ? 3.4 : id === "blades" ? 2.5 : 4,
        slowSeconds: 2.5 + .3 * (rank - 1), targets: chainTargets(rank),
        dashDistance: 3.8 + .35 * (rank - 1), ward: Math.round(stats.maxHealth * (.25 + .04 * (rank - 1))),
        duration: 4, chill: 0, freezeSeconds: 1, frozenDamage: 1 };
}
export type SkillValues = ReturnType<typeof skillValues>;
export const DEFAULT_LOADOUT: readonly (SkillId | null)[] = Object.freeze(["pulse", "chain", "dash", null, null, null]);
