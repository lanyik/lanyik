import type { DeterministicRandom } from "./DeterministicRandom";
import { GAME_CONFIG } from "./GameConfig";

export const RARITIES = ["common", "magic", "rare", "legendary", "diamond", "rainbow"] as const;
export type Rarity = typeof RARITIES[number];
export const RARITY_NAMES = Object.freeze(Object.fromEntries(RARITIES.map(rarity => [rarity, GAME_CONFIG.quality[rarity].name])) as Record<Rarity, string>);
export interface FindRatings { readonly quantity: number; readonly quality: number; readonly stars: number }
export interface LootProfile {
    readonly ratings: FindRatings;
    readonly normalDropChance: number;
    readonly eliteDropChance: number;
    readonly qualities: readonly number[];
    readonly stars: readonly number[];
}
// High-quality checks have stronger diminishing returns. Every roll still produces exactly one tier.
const QUALITY_CHECKS = [1, 0.46, 0.19, 0.05, 0.012, 0.002] as const;
const QUALITY_FIND_CAPS = [0, 600, 400, 250, 150, 80] as const;
export function effectiveFind(rating: number, cap: number): number { return cap * rating / (rating + cap); }

export function lootProfile(ratings: FindRatings): LootProfile {
    for (const rating of Object.values(ratings)) if (!Number.isFinite(rating) || rating < 0) throw new RangeError("Find ratings must be finite and nonnegative");
    const qualities = Array<number>(RARITIES.length).fill(0);
    let remaining = 1;
    for (let tier = RARITIES.length - 1; tier >= 1; tier -= 1) {
        const chance = Math.min(1, QUALITY_CHECKS[tier] * (1 + effectiveFind(ratings.quality, QUALITY_FIND_CAPS[tier]) / 100));
        qualities[tier] = remaining * chance;
        remaining *= 1 - chance;
    }
    qualities[0] = remaining;
    const starFind = effectiveFind(ratings.stars, 200) / 100;
    const three = 0.12 * (1 + starFind);
    const two = (1 - three) * (0.3 / 0.88) * (1 + starFind * 0.3);
    const quantity = 1 + effectiveFind(ratings.quantity, 150) / 100;
    return Object.freeze({ ratings: Object.freeze({ ...ratings }), normalDropChance: Math.min(0.8, 0.16 * quantity),
        eliteDropChance: Math.min(0.95, 0.55 * quantity), qualities: Object.freeze(qualities), stars: Object.freeze([1 - two - three, two, three]) });
}
export const BASE_LOOT_PROFILE = lootProfile({ quantity: 0, quality: 0, stars: 0 });

function chooseDistribution(random: DeterministicRandom, probabilities: readonly number[]): number {
    const roll = random.next();
    let cumulative = 0;
    for (let index = 0; index < probabilities.length - 1; index += 1) {
        cumulative += probabilities[index];
        if (roll < cumulative) return index;
    }
    return probabilities.length - 1;
}
export function rollRarity(random: DeterministicRandom, profile: LootProfile, minimum: Rarity = "common"): Rarity {
    const minimumIndex = RARITIES.indexOf(minimum);
    if (minimumIndex < 0) throw new RangeError("Unknown minimum rarity");
    return RARITIES[Math.max(minimumIndex, chooseDistribution(random, profile.qualities))];
}
export function rollStars(random: DeterministicRandom, profile: LootProfile): 1 | 2 | 3 {
    return (chooseDistribution(random, profile.stars) + 1) as 1 | 2 | 3;
}
