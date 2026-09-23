import type { DerivedStats } from "./CombatStats";
import type { TypedValue } from "./ItemDefinition";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";

export const SKILL_IDS = ["pulse", "frost", "chain", "dash", "ward", "meteor", "vortex", "blades", "icebolt", "icelance", "icestorm", "blizzard", "shatter", "absolutezero", "fireball", "fireray", "firewall", "firedomain", "pyroblast", "doom", "arc", "thunderlance", "thunderstrike", "judgment", "thunderfield", "tempest", "starbolt", "infusion", "resonance", "shelter", "bastion"] as const;
export type SkillId = typeof SKILL_IDS[number];
export const FROST_SKILLS: readonly SkillId[] = ["icebolt", "icelance", "icestorm", "shatter", "frost", "blizzard", "absolutezero"];
export const isFrostSkill = (id: SkillId): boolean => FROST_SKILLS.includes(id);
export const FIRE_SKILLS: readonly SkillId[] = ["fireball", "fireray", "firewall", "firedomain", "pyroblast", "meteor", "doom"];
export const isFireSkill = (id: SkillId): boolean => FIRE_SKILLS.includes(id);
export const LIGHTNING_SKILLS: readonly SkillId[] = ["arc", "thunderlance", "thunderstrike", "judgment", "chain", "thunderfield", "tempest"];
export const isLightningSkill = (id: SkillId): boolean => LIGHTNING_SKILLS.includes(id);
export const STAR_SKILLS: readonly SkillId[] = ["starbolt", "infusion", "blades", "resonance", "ward", "shelter", "bastion"];
export const isStarSkill = (id: SkillId): boolean => STAR_SKILLS.includes(id);
export const isSupportSkill = (id: SkillId): boolean => id === "ward" || id === "shelter" || id === "bastion" || id === "infusion" || id === "resonance";
export const isDamageSkill = (id: SkillId): boolean => id !== "dash" && !isSupportSkill(id);
export const isUltimate = (id: SkillId): boolean => id === "shatter" || id === "absolutezero" || id === "firedomain" || id === "doom" || id === "judgment" || id === "tempest" || id === "resonance" || id === "bastion";
export const mobileCast = (id: SkillId): boolean => id === "pulse" || id === "arc" || id === "chain" || id === "icebolt" || id === "fireball" || id === "starbolt" || isSupportSkill(id) || id === "dash";
export interface SkillModifiers { readonly power: number; readonly shape: number; readonly tempo: number;
    readonly damage: number; readonly economy: number; readonly duration: number; readonly shatter: number; readonly winter: number;
    readonly wildfire: number; readonly combustion: number; readonly resilience: number; readonly overload: number; readonly conduction: number;
    readonly radiance: number; readonly sentinel: number }
export const NO_SKILL_MODIFIERS: SkillModifiers = Object.freeze({ power: 0, shape: 0, tempo: 0, damage: 0, economy: 0, duration: 0, shatter: 0, winter: 0, wildfire: 0, combustion: 0, resilience: 0, overload: 0, conduction: 0, radiance: 0, sentinel: 0 });
/** Windup and recovery share one actor action, even across different skill slots. */
export const SKILL_TIMINGS: Readonly<Record<SkillId, readonly [number, number]>> = Object.freeze({
    pulse: [.18, .28], frost: [.25, .3], chain: [.2, .3], dash: [0, .25], ward: [.15, .25],
    meteor: [.45, .4], vortex: [.35, .35], blades: [.3, .3], icebolt: [.16, .22], icelance: [.3, .3],
    icestorm: [.45, .4], blizzard: [.4, .35], shatter: [.6, .5], absolutezero: [.6, .5],
    fireball: [.2, .25], fireray: [.3, .3], firewall: [.4, .35], firedomain: [.65, .5], pyroblast: [.35, .35], doom: [.7, .55],
    arc: [.14, .22], thunderlance: [.3, .3], thunderstrike: [.45, .4], judgment: [.65, .5], thunderfield: [.4, .35], tempest: [.6, .5],
    starbolt: [.18, .24], infusion: [.2, .3], resonance: [.55, .45], shelter: [.18, .3], bastion: [.4, .4]
});
/** Shared gameplay rules consumed by the authority and skill descriptions. */
export const SKILL_RULES = Object.freeze({
    dash: Object.freeze({ durationSeconds: .25 }),
    ward: Object.freeze({ automaticHealthRatio: .6 }),
    pulse: Object.freeze({ chilledMultiplier: 1.5 }),
    meteor: Object.freeze({ range: 8, delay: .9 }),
    vortex: Object.freeze({ range: 7, duration: 4, interval: .5, pull: .65, bossPullScale: .2 }),
    blades: Object.freeze({ duration: 4, interval: .25, width: .55 })
});
interface SkillDefinition extends TypedValue<"skill", SkillId> {
    readonly school: string; readonly role: string;
    readonly name: string; readonly description: string; readonly color: string;
    readonly mana: number; readonly cooldown: number; readonly unlock: number; readonly automatic: boolean;
}
export const SKILLS: Readonly<Record<SkillId, SkillDefinition>> = Object.freeze({
    pulse: Object.freeze({ type: "skill", value: "pulse", school: "虚空", role: "碎冰爆发", name: "裂隙脉冲", description: "撕开周围空间；对减速中的敌人触发额外碎裂伤害。", color: "#bd93ff", mana: 18, cooldown: 5, unlock: 1, automatic: true }),
    frost: Object.freeze({ type: "skill", value: "frost", school: "冰霜", role: "范围控制", name: "霜环", description: "冰晶向外绽放，造成冰伤并积累寒意，满层尝试冻结。", color: "#7bdeff", mana: 22, cooldown: 8, unlock: 8, automatic: true }),
    chain: Object.freeze({ type: "skill", value: "chain", school: "雷霆", role: "连锁传导", name: "连锁闪电", description: "首跳寻找最近可见敌人，后续优先导电目标；逐跳衰减，同批不回跳，地形阻断电路。", color: "#ffe29a", mana: 24, cooldown: 7, unlock: 8, automatic: true }),
    dash: Object.freeze({ type: "skill", value: "dash", school: "疾风", role: "位移免伤", name: "疾风步", description: "化为疾风沿朝向穿行，疾行期间免疫直接命中伤害；已有灼烧继续结算。", color: "#80f1ce", mana: 12, cooldown: 6, unlock: 1, automatic: false }),
    ward: Object.freeze({ type: "skill", value: "ward", school: "星辰", role: "护盾防御", name: "守护结界", description: "以星辉结成护罩，先于生命承受伤害；仍有护盾时不重复施放。", color: "#8dafef", mana: 26, cooldown: 12, unlock: 8, automatic: true }),
    meteor: Object.freeze({ type: "skill", value: "meteor", school: "烈焰", role: "延迟引爆", name: "陨星坠落", description: "锁定地点后陨星砸落，命中时消费自己的灼烧，将剩余伤害转为一次爆炸。", color: "#ff9954", mana: 30, cooldown: 9, unlock: 20, automatic: true }),
    vortex: Object.freeze({ type: "skill", value: "vortex", school: "虚空", role: "持续聚怪", name: "引力涡旋", description: "在最近可见敌人脚下打开涡旋，周期伤害并将敌人拖向中心；领主抗拒大部分牵引。", color: "#c17bff", mana: 28, cooldown: 11, unlock: 3, automatic: true }),
    blades: Object.freeze({ type: "skill", value: "blades", school: "星辰", role: "移动削弱", name: "星环刃阵", description: "随身星刃切割外围环带并施加虚弱；贴身内圈不受伤害，走位决定覆盖。", color: "#b9aeff", mana: 24, cooldown: 10, unlock: 20, automatic: true }),
    icebolt: Object.freeze({ type: "skill", value: "icebolt", school: "冰霜", role: "寒意积累", name: "冰霜弹", description: "射出冰晶命中最近可见敌人，附加寒意；冰屑侧路增加分散命中的不同目标。", color: "#9deaff", mana: 9, cooldown: 2, unlock: 2, automatic: true }),
    icelance: Object.freeze({ type: "skill", value: "icelance", school: "冰霜", role: "穿刺爆发", name: "冰枪", description: "沿目标方向刺穿一条直线上的敌人，命中附加寒意。", color: "#89caff", mana: 20, cooldown: 5, unlock: 8, automatic: true }),
    icestorm: Object.freeze({ type: "skill", value: "icestorm", school: "冰霜", role: "区域伤害", name: "冰晶风暴", description: "在锁定地点降下冰晶，每半秒打击区域内敌人。", color: "#b6deff", mana: 30, cooldown: 10, unlock: 20, automatic: true }),
    blizzard: Object.freeze({ type: "skill", value: "blizzard", school: "冰霜", role: "持续控场", name: "暴风雪", description: "持续积累寒意；满五层尝试冻结，冻结结束后产生控制抵抗。", color: "#79dcf2", mana: 28, cooldown: 11, unlock: 20, automatic: true }),
    shatter: Object.freeze({ type: "skill", value: "shatter", school: "冰霜", role: "终极碎裂", name: "极寒破碎", description: "引爆周围冰晶，对冻结目标造成额外碎裂伤害并消费冻结。", color: "#dfedff", mana: 45, cooldown: 30, unlock: 45, automatic: true }),
    absolutezero: Object.freeze({ type: "skill", value: "absolutezero", school: "冰霜", role: "终极控制", name: "绝对零度", description: "释放极寒领域，尝试冻结周围敌人并附加寒意；无法绕过控制抵抗或首领免疫。", color: "#b6fff5", mana: 42, cooldown: 32, unlock: 45, automatic: true }),
    fireball: Object.freeze({ type: "skill", value: "fireball", school: "烈焰", role: "溅射灼烧", name: "火球", description: "火球沿施放方向飞行，碰撞敌人或障碍后爆裂，命中附加一层灼烧。", color: "#ffa653", mana: 10, cooldown: 2.2, unlock: 2, automatic: true }),
    fireray: Object.freeze({ type: "skill", value: "fireray", school: "烈焰", role: "引导灼烧", name: "灼热射线", description: "定向引导两秒，周期灼伤沿线敌人；移动、闪避或冻结会中断引导。", color: "#ffd080", mana: 24, cooldown: 7, unlock: 8, automatic: true }),
    firewall: Object.freeze({ type: "skill", value: "firewall", school: "烈焰", role: "火线封锁", name: "烈焰火墙", description: "在锁定地点竖起横向火墙，周期伤害并逐层施加灼烧。", color: "#ff8344", mana: 28, cooldown: 10, unlock: 20, automatic: true }),
    firedomain: Object.freeze({ type: "skill", value: "firedomain", school: "烈焰", role: "终极灼烧", name: "焚天火域", description: "展开持续焚烧的火域，区域内敌人不断积累灼烧；离开火域后灼烧仍按自身时限结算。", color: "#ffba5a", mana: 44, cooldown: 32, unlock: 45, automatic: true }),
    pyroblast: Object.freeze({ type: "skill", value: "pyroblast", school: "烈焰", role: "多弹爆发", name: "爆裂炎弹", description: "射出扇形炎弹，碰撞产生爆炸并附加灼烧；同轮对单个敌人最多命中两次。", color: "#ff7354", mana: 23, cooldown: 6, unlock: 8, automatic: true }),
    doom: Object.freeze({ type: "skill", value: "doom", school: "烈焰", role: "终极引爆", name: "末日炎爆", description: "引爆周围火焰，命中时消费自己的灼烧并转换剩余伤害；引爆不会再触发灼烧或连锁引爆。", color: "#ffdf9a", mana: 48, cooldown: 30, unlock: 45, automatic: true }),
    arc: Object.freeze({ type: "skill", value: "arc", school: "雷霆", role: "分支电弧", name: "电弧", description: "向附近不同敌人释放短程电弧，命中附加导电；支路增加目标，不重复打击同一敌人。", color: "#b7edff", mana: 9, cooldown: 2, unlock: 2, automatic: true }),
    thunderlance: Object.freeze({ type: "skill", value: "thunderlance", school: "雷霆", role: "高压穿刺", name: "雷枪", description: "沿锁定方向刺穿敌人并附加导电；按射线距离选取目标，地形阻断枪路。", color: "#d8e7ff", mana: 20, cooldown: 5, unlock: 8, automatic: true }),
    thunderstrike: Object.freeze({ type: "skill", value: "thunderstrike", school: "雷霆", role: "连续落雷", name: "雷霆轰击", description: "固定落点连续降下雷柱；聚焦强化同次轰击对同一目标的后续成功命中，离开范围可躲避。", color: "#a5baff", mana: 32, cooldown: 11, unlock: 20, automatic: true }),
    judgment: Object.freeze({ type: "skill", value: "judgment", school: "雷霆", role: "终极天罚", name: "天罚", description: "锁定地点后降下巨型雷柱，核心敌人承受全额伤害，其余范围目标承受一半；核心不重复吃外围伤害。", color: "#f2e9ff", mana: 45, cooldown: 30, unlock: 45, automatic: true }),
    thunderfield: Object.freeze({ type: "skill", value: "thunderfield", school: "雷霆", role: "周期电场", name: "雷暴力场", description: "固定电场周期打击并附加导电；每周期最多从场内一名敌人向外引出一条短链，同周期不重复命中。", color: "#80ddff", mana: 28, cooldown: 11, unlock: 20, automatic: true }),
    tempest: Object.freeze({ type: "skill", value: "tempest", school: "雷霆", role: "终极电网", name: "万雷连锁", description: "释放分叉电网，优先连接导电目标；所有分支共享总目标预算与去重，伤害按传导深度衰减。", color: "#c9b3ff", mana: 46, cooldown: 30, unlock: 45, automatic: true }),
    starbolt: Object.freeze({ type: "skill", value: "starbolt", school: "星辰", role: "蓄星削弱", name: "星辉弹", description: "星芒命中最近可见敌人并施加虚弱；同次施放成功命中至多积累一层星能，最多三层。", color: "#e0ceff", mana: 9, cooldown: 2.2, unlock: 2, automatic: true }),
    infusion: Object.freeze({ type: "skill", value: "infusion", school: "星辰", role: "次数强化", name: "星能灌注", description: "消费星能，强化接下来数次伤害技能；每次起手仅扣一次，整次施放共享强化，纯辅助技能不消耗。", color: "#d6b0ff", mana: 18, cooldown: 12, unlock: 8, automatic: true }),
    resonance: Object.freeze({ type: "skill", value: "resonance", school: "星辰", role: "终极强化", name: "群星共鸣", description: "赋予强力限时技能强化，可作用于冰火雷；与灌注共用一组，较弱效果不能覆盖或延长较强效果。", color: "#fff0bd", mana: 42, cooldown: 32, unlock: 45, automatic: true }),
    shelter: Object.freeze({ type: "skill", value: "shelter", school: "星辰", role: "减伤净化", name: "星辰庇护", description: "获得星辰减伤；净化侧路在出手时驱散负面来源组，优先控制、灼烧、减速。被冻结时无法起手。", color: "#a9e8ec", mana: 24, cooldown: 14, unlock: 20, automatic: true }),
    bastion: Object.freeze({ type: "skill", value: "bastion", school: "星辰", role: "终极壁垒", name: "星穹壁垒", description: "展开强护盾和减伤；只替换剩余量更低的盾。回护仅在护盾被伤害耗尽后治疗，致死伤害不能复活。", color: "#ffe2a2", mana: 44, cooldown: 32, unlock: 45, automatic: true })
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
    readonly action: { readonly skill: SkillId; readonly phase: "windup" | "channel" | "recovery"; readonly remaining: number; readonly duration: number } | null;
    readonly statuses: readonly { readonly kind: number; readonly name: string; readonly beneficial: boolean; readonly control: boolean; readonly amount: number; readonly remaining: number; readonly charges?: number }[];
}
export function skillIndex(id: SkillId): number {
    const index = SKILL_IDS.indexOf(id);
    if (index < 0) throw new RangeError("Unknown player skill");
    return index;
}
export interface FireSkillValues {
    readonly burnDamage: number; readonly burnSeconds: number; readonly stackLimit: number; readonly detonation: number;
    readonly interval: number; readonly range: number; readonly protection: number;
}
export interface LightningSkillValues {
    readonly range: number; readonly jumpRange: number; readonly retention: number; readonly conductiveSeconds: number;
    readonly protection: number; readonly pulses: number; readonly interval: number; readonly delay: number; readonly focus: number;
}
export interface SkillValues {
    readonly mana: number; readonly cooldown: number; readonly damage: number; readonly radius: number; readonly slowSeconds: number;
    readonly targets: number; readonly dashDistance: number; readonly ward: number; readonly duration: number; readonly chill: number;
    readonly freezeSeconds: number; readonly frozenDamage: number; readonly fire?: FireSkillValues; readonly lightning?: LightningSkillValues; readonly star?: StarSkillValues;
}
export interface StarSkillValues {
    readonly empowerment: number; readonly charges: number; readonly protection: number; readonly cleanse: number;
    readonly recovery: number; readonly weakness: number; readonly weaknessSeconds: number;
}
export function skillValues(id: SkillId, rank: number, stats: DerivedStats, m: SkillModifiers = NO_SKILL_MODIFIERS): SkillValues {
    const values = baseSkillValues(id, rank, stats, m);
    return m.sentinel && isDamageSkill(id) ? { ...values, damage: values.damage * .9 } : values;
}
function baseSkillValues(id: SkillId, rank: number, stats: DerivedStats, m: SkillModifiers): SkillValues {
    if (isStarSkill(id)) {
        const ultimate = isUltimate(id), growth = Math.max(0, rank - 1), shield = id === "ward" || id === "bastion";
        const empower = id === "infusion" || id === "resonance";
        const duration = (id === "infusion" ? 8 : id === "resonance" ? 10 : id === "bastion" ? 8 : id === "blades" ? 4 : 6)
            * (1 + .1 * (id === "infusion" || id === "blades" ? m.tempo : shield || id === "shelter" ? m.shape : 0));
        return { mana: Math.max(1, Math.ceil(SKILLS[id].mana * (1 - Math.min(.5, .02 * m.economy + (["starbolt", "ward"].includes(id) ? .03 * m.tempo : 0))))),
            cooldown: Math.max(ultimate ? 10 : .5, SKILLS[id].cooldown * (id === "resonance" ? 1 - .02 * m.tempo : 1) / (1 + stats.castSpeed)),
            damage: (id === "starbolt" ? .8 : id === "blades" ? .24 : 0) * (1 + .06 * growth) * (1 + .04 * m.power + .03 * m.damage),
            radius: id === "starbolt" ? 7 : id === "blades" ? 2.5 * (1 + .05 * m.shape) : 0,
            targets: id === "starbolt" ? Math.min(6, 1 + m.shape) : 1,
            ward: shield ? Math.round(stats.maxHealth * (id === "ward" ? .25 : .5) * (1 + (ultimate ? .12 : .06) * growth)
                * (1 + .04 * m.power + .03 * m.damage + .05 * m.duration) * (1 + .1 * m.sentinel) * (m.radiance ? .85 : 1)) : 0,
            duration: empower ? Math.min(15, duration) : duration, slowSeconds: 0, dashDistance: 0, chill: 0, freezeSeconds: 0, frozenDamage: 1,
            star: { empowerment: empower ? Math.min(.8, (id === "infusion" ? .2 + .01 * growth : .35 + .03 * growth) + .02 * m.power + .05 * m.radiance) : 0,
                charges: empower ? Math.min(8, (id === "infusion" ? 2 : 3) + m.shape) : 0,
                protection: id === "shelter" ? Math.min(.5, .15 + .01 * growth + .02 * m.power + .03 * m.sentinel) : id === "bastion" ? .2 : 0,
                cleanse: id === "shelter" ? m.tempo : 0, recovery: id === "bastion" ? stats.maxHealth * .01 * m.tempo : 0,
                weakness: id === "starbolt" || id === "blades" ? .1 : 0, weaknessSeconds: 3 } };
    }
    if (isLightningSkill(id)) {
        const ultimate = isUltimate(id), base = id === "arc" ? .9 : id === "thunderlance" ? 2 : id === "thunderstrike" ? .8 : id === "judgment" ? 5 : id === "chain" ? 1.6 : id === "thunderfield" ? .25 : 2;
        const duration = id === "thunderfield" ? 4 * (1 + .1 * m.tempo) : 0;
        const pulses = id === "thunderstrike" ? Math.min(8, 3 + m.shape) : id === "thunderfield" ? Math.floor(ticksForSeconds(duration) / ticksForSeconds(.5)) : 1;
        return { mana: Math.max(1, Math.ceil(SKILLS[id].mana * (m.overload ? 1.2 : 1) * (1 - Math.min(.5, .02 * m.economy + (id === "arc" ? .03 * m.tempo : 0))))),
            cooldown: Math.max(ultimate ? 10 : .5, SKILLS[id].cooldown * (1 - (["thunderlance", "judgment"].includes(id) ? .02 * m.tempo : 0)) / (1 + stats.castSpeed)),
            damage: base * (1 + (ultimate ? .12 : .06) * Math.max(0, rank - 1)) * (1 + .04 * m.power + .03 * m.damage) * (1 + .12 * m.overload) * (m.conduction ? .85 : 1),
            radius: (id === "thunderlance" ? .35 : id === "thunderstrike" ? 2.6 : id === "judgment" ? 4.5 : id === "thunderfield" ? 3.4 : 0) * (1 + (["judgment", "thunderfield"].includes(id) ? .05 * m.shape : 0)),
            targets: id === "thunderlance" ? Math.min(8, 3 + m.shape) : id === "tempest" ? Math.min(24, 12 + m.shape + m.conduction)
                : id === "arc" ? Math.min(12, 1 + m.shape + m.conduction) : Math.min(12, 3 + (id === "chain" ? m.shape : 0) + m.conduction),
            duration, slowSeconds: 0, dashDistance: 0, ward: 0, chill: 0, freezeSeconds: 0, frozenDamage: 1,
            lightning: { range: id === "arc" ? 6 : id === "chain" ? 7 : 8,
                jumpRange: 4 * (1 + Math.min(.5, .05 * m.conduction + (id === "chain" ? .05 * m.tempo : 0))),
                retention: id === "tempest" ? Math.min(.95, .75 + .02 * m.tempo) : .8,
                conductiveSeconds: 4 * (1 + .05 * m.duration), protection: .01 * m.resilience, pulses,
                interval: id === "thunderstrike" ? .4 : .5, delay: id === "judgment" ? .85 : id === "thunderstrike" ? .45 : .5,
                focus: id === "thunderstrike" ? .03 * m.tempo : 0 } };
    }
    if (isFireSkill(id)) {
        const rankScale = 1 + (isUltimate(id) ? .12 : .06) * Math.max(0, rank - 1);
        const damageScale = rankScale * (1 + .04 * m.power + .03 * m.damage);
        const base = id === "fireball" ? .75 : id === "fireray" ? .25 : id === "firewall" ? .12 : id === "firedomain" ? .18 : id === "pyroblast" ? .7 : id === "meteor" ? 2.8 : 4.5;
        const burn = id === "firewall" ? .08 : id === "firedomain" ? .12 : ["meteor", "doom"].includes(id) ? 0 : .06;
        const reduction = ["pyroblast", "doom"].includes(id) ? .02 * m.tempo : 0;
        return { mana: Math.max(1, Math.ceil(SKILLS[id].mana * (1 - Math.min(.5, .02 * m.economy + (id === "fireball" ? .03 * m.tempo : 0))))),
            cooldown: Math.max(isUltimate(id) ? 10 : .5, SKILLS[id].cooldown * (1 - reduction) / (1 + stats.castSpeed)),
            damage: base * damageScale * (1 + .1 * m.combustion) * (m.wildfire ? .85 : 1),
            radius: (id === "fireball" ? 1.2 : id === "pyroblast" ? 1.4 : id === "fireray" ? .35 : id === "firewall" ? 3 : id === "meteor" ? 2.6 : 5) * (1 + (id === "pyroblast" ? 0 : .05 * m.shape)),
            slowSeconds: 0, targets: id === "pyroblast" ? Math.min(6, 1 + m.shape) : 1, dashDistance: 0, ward: 0,
            duration: id === "fireray" ? 2 : id === "firewall" ? 4 : id === "firedomain" ? 6 * (1 + .1 * m.tempo) : 0,
            chill: 0, freezeSeconds: 0, frozenDamage: 1,
            fire: { burnDamage: burn * damageScale * (1 + .08 * m.wildfire) * (m.combustion ? .8 : 1),
                burnSeconds: 4 * (1 + .05 * m.duration + (["fireray", "firewall"].includes(id) ? .1 * m.tempo : 0)),
                stackLimit: Math.min(8, 5 + m.wildfire), detonation: ["meteor", "doom"].includes(id) ? Math.min(.8, .5 + .05 * m.combustion + (id === "meteor" ? .04 * m.tempo : 0)) : 0,
                interval: ticksForSeconds(Math.max(.25, .5 * (id === "fireray" ? 1 - .03 * m.tempo : 1))) / GAME_CONFIG.timing.simulationHz,
                range: 8, protection: .01 * m.resilience } };
    }
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
        damage: id === "pulse" ? 1.3 + .2 * (rank - 1) : id === "vortex" ? .3 + .05 * (rank - 1) : 0,
        radius: id === "pulse" ? 3.2 + .15 * (rank - 1) : id === "vortex" ? 3.4 : 0,
        slowSeconds: 2.5 + .3 * (rank - 1), targets: 1,
        dashDistance: 3.8 + .35 * (rank - 1), ward: 0,
        duration: 4, chill: 0, freezeSeconds: 1, frozenDamage: 1 };
}
export const DEFAULT_LOADOUT: readonly (SkillId | null)[] = Object.freeze(["pulse", null, "dash", null, null, null]);
