import { RARITIES, RARITY_NAMES, rollRarity, BASE_LOOT_PROFILE, type Rarity, type FindRatings } from "./Loot";
import type { DeterministicRandom } from "./DeterministicRandom";
import type { ItemDefinition } from "./ItemDefinition";

export const ORB_UNLOCK_LEVELS = [1, 1, 50, 100, 150, 200] as const;
export const ORB_TYPES = ["fortune", "bounty", "constellation", "harmony"] as const;
export type OrbType = typeof ORB_TYPES[number];
export const ORB_NAMES: Readonly<Record<OrbType, string>> = Object.freeze({
    fortune: "流光宝珠", bounty: "丰饶宝珠", constellation: "星辉宝珠", harmony: "万象宝珠"
});
const ORB_POWER = [18, 30, 50, 75, 110, 160] as const;
const ORB_WEIGHTS: Readonly<Record<OrbType, FindRatings>> = {
    fortune: { quality: 1, quantity: 0, stars: 0 }, bounty: { quality: 0, quantity: 1, stars: 0 },
    constellation: { quality: 0, quantity: 0, stars: 1 }, harmony: { quality: 0.45, quantity: 0.45, stars: 0.45 }
};
export interface Orb extends ItemDefinition<"orb", OrbType, 1> {
    readonly ratings: FindRatings;
}
export function orbDust(orb: Orb): number { return 3 ** RARITIES.indexOf(orb.rarity); }
export function orbRefineCost(orb: Orb): number { return orbDust(orb) * 12; }
export function createOrb(id: number, rarity: Rarity, orbType: OrbType): Orb {
    const power = ORB_POWER[RARITIES.indexOf(rarity)], weights = ORB_WEIGHTS[orbType];
    return Object.freeze({ type: "orb", value: orbType, size: 1, id, rarity, name: `${RARITY_NAMES[rarity]}·${ORB_NAMES[orbType]}`,
        ratings: Object.freeze({ quantity: power * weights.quantity, quality: power * weights.quality, stars: power * weights.stars }) });
}
export function generateOrb(random: DeterministicRandom, id: number, minimum: Rarity = "common"): Orb {
    const rarity = rollRarity(random, BASE_LOOT_PROFILE, minimum);
    const orbType = random.pick(ORB_TYPES);
    return createOrb(id, rarity, orbType);
}
export interface OrbResonance {
    readonly pairs: readonly OrbType[];
    readonly diversity: number;
    readonly goldBonus: number;
    readonly craftDiscount: number;
}
/** Two of a kind amplify that school's ratings; variety opens distinct economy benefits. */
export function orbResonance(orbs: readonly (Orb | undefined)[]): OrbResonance {
    const types = orbs.flatMap(orb => orb ? [orb.value] : []), diversity = new Set(types).size;
    return Object.freeze({ pairs: Object.freeze(ORB_TYPES.filter(type => types.filter(value => value === type).length >= 2)),
        diversity, goldBonus: diversity >= 3 ? .25 : 0, craftDiscount: diversity >= 4 ? .15 : 0 });
}
export function sumOrbs(orbs: readonly (Orb | undefined)[]): FindRatings {
    const result = { quantity: 0, quality: 0, stars: 0 };
    const { pairs } = orbResonance(orbs);
    for (const orb of orbs) if (orb) {
        const multiplier = pairs.includes(orb.value) ? 1.25 : 1;
        result.quantity += orb.ratings.quantity * multiplier;
        result.quality += orb.ratings.quality * multiplier;
        result.stars += orb.ratings.stars * multiplier;
    }
    return result;
}
