import type { EquipmentBonuses } from "./Equipment";
import type { FindRatings } from "./Loot";
import { GAME_CONFIG } from "./GameConfig";

export const PASSIVE_IDS = ["magnet", "fortune", "stargazer", "abundance", "execution", "bloodpact", "thorns", "cadence", "aegis"] as const;
export type PassiveId = typeof PASSIVE_IDS[number];
export const PASSIVE_UNLOCK_LEVELS = GAME_CONFIG.skills.passiveUnlockLevels;
interface PassiveDefinition {
    readonly name: string; readonly description: string; readonly glyph: string; readonly color: string;
    readonly maximum: number; readonly bonuses: Readonly<Partial<EquipmentBonuses>>;
    readonly find?: Partial<FindRatings>; readonly collectAll?: boolean;
}
/** Permanent, equipped effects. No duration, per-tick tree walk or temporary buff instance. */
export const PASSIVES: Readonly<Record<PassiveId, PassiveDefinition>> = Object.freeze({
    magnet: { name: "万象牵引", glyph: "◎", color: "#8bead4", maximum: 1, bonuses: {}, collectAll: true,
        description: "自动收取当前世界已生成的全部地面物品和经验，不受距离限制；满包保留物品，不自动开宝箱，也不加载远处地图。" },
    fortune: { name: "寻宝直觉", glyph: "✧", color: "#e5c478", maximum: 10, bonuses: { damageIncrease: -.01 }, find: { quality: 12 },
        description: "每级品质寻宝 +12，输出增伤 −1 个百分点。与宝珠相加后计算收益递减，不直接增加 12% 掉率。" },
    stargazer: { name: "鉴星秘术", glyph: "✦", color: "#d1b0ff", maximum: 10, bonuses: { maxHealthBonus: -.015 }, find: { stars: 15 },
        description: "每级星级寻宝 +15，生命加成 −1.5 个百分点。提高二/三星装备概率，不改变品质或既有装备。" },
    abundance: { name: "丰收契约", glyph: "❖", color: "#dfcf89", maximum: 10, bonuses: { goldBonus: .02, eliteDamage: -.02 }, find: { quantity: 10 },
        description: "每级数量寻宝 +10、金币收益 +2%，精英/领主增伤 −2 个百分点。不提高宝珠自身的掉率。" },
    execution: { name: "致命洞察", glyph: "⌖", color: "#e9a984", maximum: 10, bonuses: { lethalChance: .008, lethalDamage: .15, criticalChance: -.003 },
        description: "每级致命概率 +0.8 个百分点、致命附伤 +0.15‰，暴击概率 −0.3 个百分点。概率仍遵守属性上限。" },
    bloodpact: { name: "血之契约", glyph: "◈", color: "#ef8ca6", maximum: 10, bonuses: { lifesteal: .008, lifeExtraction: .015, maxHealthBonus: -.02 },
        description: "每级吸血 +0.8 个百分点、生命抽取 +0.015‰，生命加成 −2 个百分点。灼烧不触发吸血。" },
    thorns: { name: "荆棘壁垒", glyph: "✹", color: "#a6d599", maximum: 10, bonuses: { thorns: .04, thornsPerMille: .02, thornsCap: .05, moveSpeed: -.03 },
        description: "每级反伤 +4%、生命反伤 +0.02‰、反伤上限系数 +0.05，移速 −0.03。沿用反伤上限，不递归触发。" },
    cadence: { name: "超载施法", glyph: "ϟ", color: "#a6caff", maximum: 10, bonuses: { castSpeed: .035, attackSpeed: -.02 },
        description: "每级施法速度 +3.5%、普通攻击速度 −2%。缩短技能冷却和动作，仍保留前后摇下限。" },
    aegis: { name: "护盾回路", glyph: "⬡", color: "#a5e5e8", maximum: 10, bonuses: { shieldRecovery: .3, damageReduction: .008, damageIncrease: -.015 },
        description: "每级免伤盾恢复缩短 0.3 秒、减伤 +0.8 个百分点，输出增伤 −1.5 个百分点。不刷新正在恢复的免伤盾。" }
});
interface PassiveEffects {
    readonly bonuses: Readonly<Partial<EquipmentBonuses>>; readonly find: FindRatings; readonly collectAll: boolean;
}
export const NO_PASSIVE_EFFECTS: PassiveEffects = Object.freeze({ bonuses: Object.freeze({}), find: Object.freeze({ quality: 0, stars: 0, quantity: 0 }), collectAll: false });
export function isPassiveId(value: unknown): value is PassiveId { return typeof value === "string" && PASSIVE_IDS.includes(value as PassiveId); }
export const passiveNodeId = (id: PassiveId): string => `passive.${id}`;
export function compilePassiveEffects(loadout: readonly (PassiveId | null)[], rank: (id: string) => number): PassiveEffects {
    const bonuses: Partial<Record<keyof EquipmentBonuses, number>> = {}, find = { quality: 0, stars: 0, quantity: 0 };
    let collectAll = false;
    for (const id of loadout) {
        if (!id) continue;
        const definition = PASSIVES[id], points = rank(passiveNodeId(id));
        if (!points) continue;
        for (const key of Object.keys(definition.bonuses) as (keyof EquipmentBonuses)[]) bonuses[key] = (bonuses[key] ?? 0) + definition.bonuses[key]! * points;
        for (const key of ["quality", "stars", "quantity"] as const) find[key] += (definition.find?.[key] ?? 0) * points;
        collectAll ||= !!definition.collectAll;
    }
    return Object.freeze({ bonuses: Object.freeze(bonuses), find: Object.freeze(find), collectAll });
}
