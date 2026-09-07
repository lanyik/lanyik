import { DeterministicRandom } from "./DeterministicRandom";

export const SLOT_NAMES = Object.freeze({
    weapon: "武器", head: "头盔", chest: "胸甲", legs: "腿甲", boots: "鞋靴",
    arms: "臂甲", hands: "手套", ring: "指环", necklace: "项链", bracelet: "手镯", charm: "饰品"
});
export type EquipmentSlot = keyof typeof SLOT_NAMES;
export const EQUIPMENT_SLOTS = Object.freeze(Object.keys(SLOT_NAMES) as EquipmentSlot[]);
export const RARITIES = ["common", "magic", "rare", "legendary", "diamond", "rainbow"] as const;
export type Rarity = typeof RARITIES[number];
export const RARITY_NAMES: Readonly<Record<Rarity, string>> = Object.freeze({
    common: "白", magic: "蓝", rare: "紫", legendary: "金", diamond: "钻", rainbow: "彩"
});
export const ATTRIBUTE_IDS = ["might", "vitality", "agility", "fortune"] as const;
export type AttributeId = typeof ATTRIBUTE_IDS[number];
export type Attributes = Readonly<Record<AttributeId, number>>;

type StatUnit = "flat" | "percent" | "permille" | "seconds" | "regen";
function stat(name: string, unit: StatUnit, value: number, weight: number, detail: string) {
    return Object.freeze({ name, unit, value, weight, detail });
}

/** Generation and presentation share one catalog, including units and score weights. */
export const BONUS_INFO = Object.freeze({
    maxHealth: stat("血量", "flat", 24, 0.7, "提高最大生命"),
    damage: stat("攻击", "flat", 4, 9, "提高基础攻击"),
    armor: stat("防御", "flat", 3, 5, "降低受到的攻击伤害"),
    block: stat("格挡", "flat", 5, 4, "格挡成功时减去的伤害值"),
    moveSpeed: stat("移速", "flat", 0.12, 100, "每秒移动距离"),
    healthRegen: stat("生命回复", "regen", 0.4, 22, "每 0.5 秒回复量"),
    maxHealthBonus: stat("血量加成", "percent", 0.06, 180, "乘算基础生命与装备生命"),
    damageBonus: stat("攻击加成", "percent", 0.06, 200, "乘算基础攻击与装备攻击"),
    armorBonus: stat("防御加成", "percent", 0.08, 120, "乘算基础防御与装备防御"),
    blockChance: stat("格挡率", "percent", 0.04, 160, "上限 85%"),
    blockBonus: stat("格挡加成", "percent", 0.1, 100, "提高成功格挡的减伤值"),
    criticalChance: stat("暴击率", "percent", 0.03, 190, "先判断暴击，再判断卓越一击"),
    criticalDamage: stat("暴击伤害", "percent", 0.12, 80, "暴击伤害倍率增量"),
    criticalResistance: stat("防暴率", "percent", 0.04, 100, "减去敌方暴击概率"),
    criticalDamageReduction: stat("爆伤减免", "percent", 0.1, 80, "减去敌方暴击的额外倍率"),
    excellentChance: stat("卓越一击率", "percent", 0.04, 150, "未暴击的命中才判定"),
    excellentDamage: stat("卓越一击伤害", "percent", 0.12, 80, "卓越一击伤害倍率增量"),
    evasion: stat("闪避率", "percent", 0.04, 200, "上限 60%，溢出转格挡率"),
    damageIncrease: stat("伤害增加", "percent", 0.04, 220, "提高最终攻击伤害"),
    damageReduction: stat("伤害减免", "percent", 0.03, 230, "降低攻击伤害，上限 75%"),
    lifesteal: stat("吸血", "percent", 0.015, 400, "按实际扣除的敌方生命回复，上限 30%"),
    thorns: stat("反伤", "percent", 0.1, 75, "按实际受到的伤害反弹"),
    thornsPerMille: stat("反伤千分比", "permille", 1, 8, "附加敌方最大生命的千分比反伤"),
    thornsCap: stat("反伤上限", "percent", 0.25, 50, "反伤上限相对玩家基础防御的倍率增量"),
    regenBonus: stat("回复增幅", "percent", 0.08, 80, "提高生命回复、吸血与升级回复"),
    accuracy: stat("命中率", "percent", 0.03, 180, "抵消敌方闪避，最终命中率上限 100%"),
    lifeExtraction: stat("生命抽取", "permille", 1, 25, "命中附加敌方最大生命千分比伤害"),
    lethalChance: stat("致命一击率", "percent", 0.02, 220, "独立于暴击和卓越判断"),
    lethalDamage: stat("致命一击伤害", "permille", 4, 10, "触发时附加敌方最大生命千分比伤害"),
    shieldRecovery: stat("免伤盾回复时间", "seconds", 0.5, 25, "缩短单次免伤盾的恢复时间，最短 2 秒"),
    normalDamage: stat("怪物增伤", "percent", 0.08, 130, "对普通怪增加伤害"),
    eliteDamage: stat("精英增伤", "percent", 0.08, 130, "对经验精英与 Boss 增加伤害"),
    eliteReduction: stat("精英减伤", "percent", 0.05, 160, "降低经验精英与 Boss 伤害，上限 75%"),
    experienceBonus: stat("经验加成", "percent", 0.08, 100, "拾取经验时结算"),
    goldBonus: stat("金币加成", "percent", 0.08, 70, "提高击杀与宝箱金币"),
    attackSpeed: stat("攻击速度", "percent", 0.06, 150, "最高基础攻速 3 倍，溢出转暴伤"),
    castSpeed: stat("技能释放速度", "percent", 0.08, 120, "最高基础施法速度 3 倍，溢出转暴伤"),
    pickupRadius: stat("拾取范围", "flat", 0.3, 8, "扩大经验球吸附范围")
});
export type BonusId = keyof typeof BONUS_INFO;
export const BONUS_IDS = Object.freeze(Object.keys(BONUS_INFO) as BonusId[]);
export type EquipmentBonuses = Readonly<Record<BonusId, number>>;
export const EMPTY_BONUSES: EquipmentBonuses = Object.freeze(Object.fromEntries(BONUS_IDS.map(id => [id, 0])) as Record<BonusId, number>);

export interface EquipmentAffix {
    readonly stat: BonusId;
    readonly value: number;
    readonly rarity: Rarity;
}
export interface Equipment {
    readonly id: number;
    readonly slot: EquipmentSlot;
    readonly rarity: Rarity;
    readonly stars: 1 | 2 | 3;
    readonly itemLevel: number;
    readonly name: string;
    readonly baseBonuses: EquipmentBonuses;
    readonly affixes: readonly EquipmentAffix[];
    readonly bonuses: EquipmentBonuses;
    readonly score: number;
}
export type EquippedItems = Readonly<Partial<Record<EquipmentSlot, Equipment>>>;

const BASES: Readonly<Record<EquipmentSlot, readonly [BonusId, number, number][]>> = {
    weapon: [["damage", 3.5, 1.35]], head: [["maxHealth", 6, 2], ["armor", 0.5, 0.25]],
    chest: [["maxHealth", 9, 3.2], ["armor", 0.8, 0.38]], legs: [["maxHealth", 7, 2.4], ["armor", 0.6, 0.3]],
    boots: [["armor", 0.4, 0.2], ["moveSpeed", 0.05, 0.005]], arms: [["armor", 0.5, 0.25], ["block", 1, 0.35]],
    hands: [["damage", 0.5, 0.35]], ring: [["damage", 0.5, 0.3]],
    necklace: [["maxHealth", 5, 1.8]], bracelet: [["block", 1, 0.4]], charm: [["healthRegen", 0.1, 0.025]]
};
const QUALITY_POWER = [1, 1.3, 1.7, 2.2, 2.9, 3.8] as const;
const PREFIXES = ["狼印", "余烬", "风暴", "冷月", "猩红", "幽影"] as const;

function round(value: number): number { return Math.round(value * 1000) / 1000; }

export function equipmentScore(bonuses: EquipmentBonuses): number {
    return Math.round(BONUS_IDS.reduce((score, id) => score + bonuses[id] * BONUS_INFO[id].weight, 0));
}

export function equipmentBase(slot: EquipmentSlot, itemLevel: number): EquipmentBonuses {
    const bonuses = { ...EMPTY_BONUSES };
    for (const [id, base, growth] of BASES[slot]) bonuses[id] = round(base + itemLevel * growth);
    return Object.freeze(bonuses);
}

function assemble(id: number, slot: EquipmentSlot, rarity: Rarity, stars: 1 | 2 | 3,
    itemLevel: number, name: string, affixes: readonly EquipmentAffix[]): Equipment {
    const baseBonuses = equipmentBase(slot, itemLevel);
    const bonuses = { ...baseBonuses };
    for (const affix of affixes) bonuses[affix.stat] = round(bonuses[affix.stat] + affix.value);
    return Object.freeze({ id, slot, rarity, stars, itemLevel, name, baseBonuses,
        affixes: Object.freeze(affixes), bonuses: Object.freeze(bonuses), score: equipmentScore(bonuses) });
}

export function createStarterEquipment(): Equipment {
    return assemble(1, "weapon", "common", 1, 1, "守夜短弩", [
        Object.freeze({ stat: "damage", value: 1, rarity: "common" }),
        Object.freeze({ stat: "accuracy", value: 0.02, rarity: "common" })
    ]);
}

export function generateEquipment(random: DeterministicRandom, id: number, itemLevel: number,
    qualityBonus: number, minimumRarity: Rarity = "common"): Equipment {
    if (!Number.isSafeInteger(id) || id <= 1) throw new RangeError("Equipment id must be a safe integer above one");
    if (!Number.isSafeInteger(itemLevel) || itemLevel <= 0) throw new RangeError("Item level must be a positive safe integer");
    if (!Number.isFinite(qualityBonus) || qualityBonus < 0) throw new RangeError("Quality bonus must be finite and nonnegative");
    const minimum = RARITIES.indexOf(minimumRarity);
    if (minimum < 0) throw new RangeError("Unknown minimum rarity");
    const slot = random.pick(EQUIPMENT_SLOTS);
    const roll = random.next() / (1 + Math.min(0.35, qualityBonus));
    const rarityIndex = Math.max(minimum, roll < 0.002 ? 5 : roll < 0.012 ? 4 : roll < 0.05 ? 3 : roll < 0.2 ? 2 : roll < 0.5 ? 1 : 0);
    const rarity = RARITIES[rarityIndex];
    const starRoll = random.next();
    const stars = starRoll < 0.12 ? 3 : starRoll < 0.42 ? 2 : 1;
    const candidates = [...BONUS_IDS];
    const affixes: EquipmentAffix[] = [];
    for (let index = 0; index < stars + 1; index += 1) {
        const stat = candidates.splice(random.integer(candidates.length), 1)[0];
        const value = round(BONUS_INFO[stat].value * QUALITY_POWER[rarityIndex] * (0.86 + random.next() * 0.28));
        affixes.push(Object.freeze({ stat, value, rarity }));
    }
    return assemble(id, slot, rarity, stars, itemLevel, `${random.pick(PREFIXES)}${SLOT_NAMES[slot]}`, affixes);
}

export function sumEquipment(items: EquippedItems): EquipmentBonuses {
    const result = { ...EMPTY_BONUSES };
    for (const slot of EQUIPMENT_SLOTS) {
        const item = items[slot];
        if (item) for (const id of BONUS_IDS) result[id] += item.bonuses[id];
    }
    return Object.freeze(result);
}
