import { DeterministicRandom } from "./DeterministicRandom";

export const EQUIPMENT_SLOTS = ["weapon", "armor", "ring"] as const;
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];
export const RARITIES = ["common", "magic", "rare", "legendary"] as const;
export type Rarity = typeof RARITIES[number];
export const ATTRIBUTE_IDS = ["might", "vitality", "agility", "fortune"] as const;
export type AttributeId = typeof ATTRIBUTE_IDS[number];

export interface Attributes {
    readonly might: number;
    readonly vitality: number;
    readonly agility: number;
    readonly fortune: number;
}

export interface EquipmentBonuses {
    readonly damage: number;
    readonly maxHealth: number;
    readonly armor: number;
    readonly moveSpeed: number;
    readonly attackSpeed: number;
    readonly criticalChance: number;
    readonly pickupRadius: number;
    readonly healthRegen: number;
}

type MutableEquipmentBonuses = { -readonly [Key in keyof EquipmentBonuses]: EquipmentBonuses[Key] };

export interface Equipment {
    readonly id: number;
    readonly slot: EquipmentSlot;
    readonly rarity: Rarity;
    readonly itemLevel: number;
    readonly name: string;
    readonly bonuses: EquipmentBonuses;
    readonly score: number;
}

export type EquippedItems = Readonly<Record<EquipmentSlot, Equipment | undefined>>;

export const EMPTY_BONUSES: EquipmentBonuses = Object.freeze({
    damage: 0,
    maxHealth: 0,
    armor: 0,
    moveSpeed: 0,
    attackSpeed: 0,
    criticalChance: 0,
    pickupRadius: 0,
    healthRegen: 0
});

const SLOT_BASES: Readonly<Record<EquipmentSlot, readonly string[]>> = Object.freeze({
    weapon: Object.freeze(["短弩", "裂刃", "符文杖", "猎魔枪"]),
    armor: Object.freeze(["锁甲", "猎手衣", "骨铠", "守望胸甲"]),
    ring: Object.freeze(["骨戒", "星银指环", "猎印", "裂隙徽记"])
});

const PREFIXES = Object.freeze(["狼印", "余烬", "风暴", "冷月", "猩红", "幽影"]);
const LEGENDARY_NAMES: Readonly<Record<EquipmentSlot, readonly string[]>> = Object.freeze({
    weapon: Object.freeze(["终夜", "烬火裁决", "荒原挽歌"]),
    armor: Object.freeze(["不落壁垒", "吞星者之壳", "守夜誓约"]),
    ring: Object.freeze(["命运回响", "猎王之眼", "无尽环"])
});

const RARITY_POWER: Readonly<Record<Rarity, number>> = Object.freeze({
    common: 1,
    magic: 1.18,
    rare: 1.42,
    legendary: 1.82
});

type BonusId = keyof EquipmentBonuses;

const AFFIXES: Readonly<Record<EquipmentSlot, readonly BonusId[]>> = Object.freeze({
    weapon: Object.freeze<BonusId[]>(["damage", "attackSpeed", "criticalChance", "moveSpeed", "healthRegen"]),
    armor: Object.freeze<BonusId[]>(["maxHealth", "armor", "moveSpeed", "healthRegen", "pickupRadius"]),
    ring: Object.freeze<BonusId[]>(["damage", "attackSpeed", "criticalChance", "pickupRadius", "healthRegen", "maxHealth"])
});

function round(value: number, digits = 0): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function rollRarity(random: DeterministicRandom, qualityBonus: number): Rarity {
    const roll = random.next();
    const quality = Math.max(0, Math.min(0.35, qualityBonus));
    if (roll < 0.025 + quality * 0.08) return "legendary";
    if (roll < 0.15 + quality * 0.25) return "rare";
    if (roll < 0.43 + quality * 0.4) return "magic";
    return "common";
}

function affixValue(id: BonusId, itemLevel: number, power: number, random: DeterministicRandom): number {
    const variance = 0.86 + random.next() * 0.28;
    switch (id) {
        case "damage": return round((2.2 + itemLevel * 1.05) * power * variance, 1);
        case "maxHealth": return Math.round((10 + itemLevel * 4.4) * power * variance);
        case "armor": return round((1.2 + itemLevel * 0.62) * power * variance, 1);
        case "moveSpeed": return round((0.025 + itemLevel * 0.0012) * power * variance, 3);
        case "attackSpeed": return round((0.045 + itemLevel * 0.002) * power * variance, 3);
        case "criticalChance": return round((0.025 + itemLevel * 0.0011) * power * variance, 3);
        case "pickupRadius": return round((0.25 + itemLevel * 0.025) * power * variance, 2);
        case "healthRegen": return round((0.15 + itemLevel * 0.025) * power * variance, 2);
    }
}

export function equipmentScore(bonuses: EquipmentBonuses): number {
    return Math.round(
        bonuses.damage * 9
        + bonuses.maxHealth * 0.7
        + bonuses.armor * 5
        + bonuses.moveSpeed * 170
        + bonuses.attackSpeed * 150
        + bonuses.criticalChance * 190
        + bonuses.pickupRadius * 8
        + bonuses.healthRegen * 22
    );
}

export function createStarterEquipment(): Equipment {
    const bonuses = Object.freeze({ ...EMPTY_BONUSES, damage: 4 });
    return Object.freeze({
        id: 1,
        slot: "weapon" as const,
        rarity: "common" as const,
        itemLevel: 1,
        name: "磨损的守夜短弩",
        bonuses,
        score: equipmentScore(bonuses)
    });
}

export function generateEquipment(
    random: DeterministicRandom,
    id: number,
    itemLevel: number,
    qualityBonus: number
): Equipment {
    if (!Number.isSafeInteger(id) || id <= 1) throw new RangeError("Equipment id must be a safe integer above one");
    if (!Number.isSafeInteger(itemLevel) || itemLevel <= 0) throw new RangeError("Item level must be a positive safe integer");
    const slot = random.pick(EQUIPMENT_SLOTS);
    const rarity = rollRarity(random, qualityBonus);
    const power = RARITY_POWER[rarity];
    const affixCount = rarity === "common" ? 1 : rarity === "magic" ? 2 : rarity === "rare" ? 3 : 4;
    const bonuses: MutableEquipmentBonuses = { ...EMPTY_BONUSES };

    if (slot === "weapon") bonuses.damage = round((3.5 + itemLevel * 1.35) * power, 1);
    if (slot === "armor") {
        bonuses.maxHealth = Math.round((9 + itemLevel * 3.2) * power);
        bonuses.armor = round((0.8 + itemLevel * 0.38) * power, 1);
    }
    if (slot === "ring") bonuses.pickupRadius = round((0.18 + itemLevel * 0.018) * power, 2);

    const candidates = [...AFFIXES[slot]];
    for (let index = 0; index < affixCount; index += 1) {
        const candidate = random.integer(candidates.length);
        const id = candidates.splice(candidate, 1)[0];
        bonuses[id] = round(bonuses[id] + affixValue(id, itemLevel, power, random), 3);
    }
    const frozenBonuses = Object.freeze(bonuses);
    const base = random.pick(SLOT_BASES[slot]);
    const name = rarity === "legendary"
        ? random.pick(LEGENDARY_NAMES[slot])
        : rarity === "common" ? `旧${base}` : `${random.pick(PREFIXES)}${base}`;
    return Object.freeze({ id, slot, rarity, itemLevel, name, bonuses: frozenBonuses, score: equipmentScore(frozenBonuses) });
}

export function sumEquipment(items: EquippedItems): EquipmentBonuses {
    const result: MutableEquipmentBonuses = { ...EMPTY_BONUSES };
    for (const slot of EQUIPMENT_SLOTS) {
        const item = items[slot];
        if (!item) continue;
        for (const id of Object.keys(result) as BonusId[]) result[id] += item.bonuses[id];
    }
    return Object.freeze(result);
}
