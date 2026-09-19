import type { Equipment } from "./Equipment";
import type { Orb } from "./Orbs";
import type { AffixItem } from "./AffixItem";
import type { ChallengeScroll } from "./BossChallenge";
import { RARITIES, RARITY_NAMES, rollRarity, BASE_LOOT_PROFILE, type Rarity } from "./Loot";
import type { ItemDefinition } from "./ItemDefinition";
import { GAME_CONFIG } from "./GameConfig";
import type { DeterministicRandom } from "./DeterministicRandom";

export type ConsumableEffect = "health" | "mana";
export const POTION_RARITIES = ["common", "magic", "rare", "legendary"] as const;
type PotionRarity = typeof POTION_RARITIES[number];
export const POTION_TYPES = ["health", "mana", "health-percent", "mana-percent"] as const;
type PotionType = typeof POTION_TYPES[number];
export const POTIONS = Object.freeze({
    health: Object.freeze({ name: "生命药剂", resource: "health", percent: false, amounts: [60, 140, 300, 600] as const }),
    mana: Object.freeze({ name: "法力药剂", resource: "mana", percent: false, amounts: [40, 90, 180, 360] as const }),
    "health-percent": Object.freeze({ name: "生命精华", resource: "health", percent: true, amounts: [.2, .3, .45, .6] as const }),
    "mana-percent": Object.freeze({ name: "法力精华", resource: "mana", percent: true, amounts: [.2, .3, .45, .6] as const })
});
export interface Consumable extends ItemDefinition<"consumable", PotionType> {
    readonly rarity: PotionRarity;
}
export type InventoryItem = Equipment | Orb | Consumable | AffixItem | ChallengeScroll;

export enum GroundItemKind { Weapon, Orb, Health, Mana, HealthEssence, ManaEssence, Armor, Jewel }
export function groundItemKind(item: InventoryItem): GroundItemKind {
    if (item.type === "orb") return GroundItemKind.Orb;
    if (item.type === "affix" || item.type === "scroll") return GroundItemKind.Jewel;
    if (item.type === "consumable") return GroundItemKind.Health + POTION_TYPES.indexOf(item.value);
    if (item.value === "weapon") return GroundItemKind.Weapon;
    return ["ring", "necklace", "bracelet", "charm"].includes(item.value) ? GroundItemKind.Jewel : GroundItemKind.Armor;
}

/** Higher quality first, then higher level; stable IDs make ties deterministic. */
export function compareInventoryItems(first: InventoryItem, second: InventoryItem): number {
    return RARITIES.indexOf(second.rarity) - RARITIES.indexOf(first.rarity)
        || (second.type === "equipment" ? second.itemLevel : 0) - (first.type === "equipment" ? first.itemLevel : 0)
        || (first.type < second.type ? -1 : first.type > second.type ? 1 : 0)
        || (first.type !== "equipment" && first.type === second.type ? (first.value < second.value ? -1 : first.value > second.value ? 1 : 0) : 0) || first.id - second.id;
}

export function createConsumable(id: number, rarity: PotionRarity, value: PotionType, size = 1): Consumable {
    if (!Number.isSafeInteger(size) || size < 1 || size > GAME_CONFIG.inventory.consumable.stackSize) throw new RangeError("Invalid potion stack size");
    if (!POTION_RARITIES.includes(rarity) || !POTION_TYPES.includes(value)) throw new RangeError("Invalid potion recipe");
    return Object.freeze({ type: "consumable", value, size, id, rarity, name: `${RARITY_NAMES[rarity]}·${POTIONS[value].name}` });
}

export function generateConsumable(random: DeterministicRandom, id: number, minimum: Rarity = "common"): Consumable {
    const rarity = rollRarity(random, BASE_LOOT_PROFILE, minimum);
    return createConsumable(id, POTION_RARITIES[Math.min(3, RARITIES.indexOf(rarity))], random.pick(POTION_TYPES));
}

export function potionAmount(item: Consumable): number {
    return POTIONS[item.value].amounts[POTION_RARITIES.indexOf(item.rarity)];
}

export function potionRecovery(item: Consumable, stats: { readonly maxHealth: number; readonly maxMana: number; readonly regenBonus: number }): { health: number; mana: number } {
    const recipe = POTIONS[item.value], amount = potionAmount(item);
    const health = recipe.resource === "health" ? amount * (recipe.percent ? stats.maxHealth : 1) : item.rarity === "legendary" ? stats.maxHealth * .15 : 0;
    const mana = recipe.resource === "mana" ? amount * (recipe.percent ? stats.maxMana : 1) : item.rarity === "legendary" ? stats.maxMana * .15 : 0;
    return { health: health * (1 + stats.regenBonus), mana };
}

export function canUseConsumable(item: Consumable, player: { readonly health: number; readonly mana: number; readonly stats: { readonly maxHealth: number; readonly maxMana: number } }): boolean {
    const resource = POTIONS[item.value].resource;
    return (resource === "health" || item.rarity === "legendary") && player.health < player.stats.maxHealth
        || (resource === "mana" || item.rarity === "legendary") && player.mana < player.stats.maxMana;
}

/** Quick slots consume the lowest sufficient dose, otherwise the largest effective heal. */
export function selectConsumable(items: readonly InventoryItem[], effect: ConsumableEffect,
    player: { readonly health: number; readonly mana: number; readonly stats: { readonly maxHealth: number; readonly maxMana: number; readonly regenBonus: number } }): Consumable | undefined {
    const missing = (effect === "health" ? player.stats.maxHealth : player.stats.maxMana) - player[effect];
    let best: Consumable | undefined, bestAmount = 0;
    for (const item of items) {
        if (item.type !== "consumable" || POTIONS[item.value].resource !== effect) continue;
        const amount = potionRecovery(item, player.stats)[effect];
        if (!best || (amount >= missing ? bestAmount < missing || amount < bestAmount : bestAmount < missing && amount > bestAmount)
            || amount === bestAmount && (POTION_RARITIES.indexOf(item.rarity) < POTION_RARITIES.indexOf(best.rarity) || item.rarity === best.rarity && item.id < best.id)) {
            best = item; bestAmount = amount;
        }
    }
    return best;
}
