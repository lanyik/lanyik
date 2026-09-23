import { deriveStats } from "./CombatStats";
import { EQUIPMENT_SLOTS, QUALITY_POWER, sumEquipment, type Attributes, type Equipment, type EquippedItems } from "./Equipment";
import { compareEquipment, type EquipmentContext } from "./EquipmentEvaluation";
import { GAME_CONFIG } from "./GameConfig";
import { insertInventoryItem } from "./Inventory";
import type { InventoryItem } from "./InventoryItem";
import { lootProfile, RARITIES, type FindRatings } from "./Loot";
import { ORB_TYPES, ORB_UNLOCK_LEVELS, sumOrbs, type Orb } from "./Orbs";
import { shouldRecycle, type RecyclingRules } from "./Recycling";

/** Expected affix yield per ordinary enemy, using the actual quality/star/drop distributions. */
function orbYield(orbs: readonly (Orb | undefined)[], permanent?: FindRatings): number {
    const profile = lootProfile(sumOrbs(orbs), permanent);
    return profile.normalDropChance * profile.qualities.reduce((total, chance, tier) => total + chance * QUALITY_POWER[tier], 0)
        * profile.stars.reduce((total, chance, index) => total + chance * (index + 2), 0);
}

function bestOrbs(items: readonly InventoryItem[], current: readonly (Orb | undefined)[], level: number, permanent?: FindRatings): (Orb | undefined)[] {
    const slots = ORB_UNLOCK_LEVELS.filter(unlock => level >= unlock).length;
    const installed = new Set(current.filter(orb => !!orb).map(orb => orb.id));
    const pool = [...current.filter(orb => !!orb), ...items.filter(item => item.type === "orb")];
    const groups = ORB_TYPES.map(type => pool.filter(orb => orb.value === type).sort((a, b) =>
        (b.ratings.quality + b.ratings.quantity + b.ratings.stars) - (a.ratings.quality + a.ratings.quantity + a.ratings.stars)
        || Number(installed.has(b.id)) - Number(installed.has(a.id)) || a.id - b.id).slice(0, slots));
    const count = Math.min(slots, pool.length), candidate: Orb[] = [];
    let best = current.filter(orb => !!orb), score = orbYield(current, permanent);
    // Four types and at most six sockets: at most C(9,3)=84 complete compositions, not item subsets.
    const visit = (type: number, remaining: number): void => {
        if (type === ORB_TYPES.length) {
            if (remaining) return;
            const next = orbYield(candidate, permanent);
            if (next > score + 1e-9) { best = [...candidate]; score = next; }
            return;
        }
        const start = candidate.length, group = groups[type];
        for (let take = 0; take <= Math.min(remaining, group.length); take++) {
            if (take) candidate.push(group[take - 1]);
            visit(type + 1, remaining - take);
        }
        candidate.length = start;
    };
    visit(0, count);
    const chosen = new Set(best.map(orb => orb.id));
    const result = current.map(orb => orb && chosen.has(orb.id) ? orb : undefined);
    const replacements = best.filter(orb => !installed.has(orb.id)).sort((a, b) => a.id - b.id);
    for (let slot = 0, next = 0; slot < slots; slot++) if (!result[slot]) result[slot] = replacements[next++];
    return result;
}

function obsolete(item: Equipment, player: EquipmentContext): boolean {
    const current = player.equipment[item.value], quality = RARITIES.indexOf(item.rarity);
    return !item.locked && item.autoEquipped && !!current && quality <= RARITIES.indexOf("rare") && item.score <= current.score * .6
        && (item.itemLevel + 10 <= current.itemLevel || quality + 2 <= RARITIES.indexOf(current.rarity))
        && compareEquipment(item, player).delta < 0;
}

interface LoadoutInput {
    readonly passiveBonuses?: EquipmentContext["passiveBonuses"];
    readonly passiveFind?: FindRatings;
    readonly inventory: readonly InventoryItem[];
    readonly equipment: EquippedItems;
    readonly orbs: readonly (Orb | undefined)[];
    readonly level: number;
    readonly attributes: Attributes;
    readonly recycling: RecyclingRules;
}
type LoadoutPlan = { readonly ok: false; readonly blocked: InventoryItem["type"] } | {
    readonly ok: true; readonly inventory: InventoryItem[]; readonly equipment: EquippedItems;
    readonly orbs: (Orb | undefined)[]; readonly recycled: readonly InventoryItem[];
    readonly equipmentChanges: number; readonly orbChanges: number;
};

/** Plan before committing loot, randomness or IDs. A full category rejects the entire receipt. */
export function planAutomaticLoadout(input: LoadoutInput, incoming: readonly InventoryItem[] = [], protectedId = 0): LoadoutPlan {
    let items = [...input.inventory, ...incoming.filter(item => item.type === "equipment" || item.type === "orb")];
    let equipment = input.equipment, stats = deriveStats(input.level, input.attributes, sumEquipment(equipment), input.passiveBonuses), equipmentChanges = 0;
    // One stable pass over eleven slots. Every committed replacement strictly increases total battle power.
    for (const slot of EQUIPMENT_SLOTS) {
        let selected: Equipment | undefined, gain = 0, nextStats = stats;
        for (const item of items) {
            if (item.type !== "equipment" || item.value !== slot) continue;
            const comparison = compareEquipment(item, { level: input.level, attributes: input.attributes, equipment, stats, passiveBonuses: input.passiveBonuses });
            if (comparison.delta > gain || comparison.delta === gain && gain > 0 && item.id < selected!.id) {
                selected = item; gain = comparison.delta; nextStats = comparison.stats;
            }
        }
        if (!selected) continue;
        items = items.filter(item => item.id !== selected.id);
        if (equipment[slot]) items.push(equipment[slot]!);
        equipment = { ...equipment, [slot]: Object.freeze({ ...selected,
            autoEquipped: selected.autoEquipped || !selected.locked, revision: selected.revision + 1 }) };
        stats = nextStats; equipmentChanges++;
    }
    const orbs = bestOrbs(items, input.orbs, input.level, input.passiveFind), chosen = new Set(orbs.filter(orb => !!orb).map(orb => orb.id));
    items = items.filter(item => !chosen.has(item.id));
    for (const orb of input.orbs) if (orb && !chosen.has(orb.id)) items.push(orb);
    const player = { level: input.level, attributes: input.attributes, equipment, stats, passiveBonuses: input.passiveBonuses }, recycled: InventoryItem[] = [];
    let inventory = items.filter(item => {
        if (item.id === protectedId || !(item.type === "equipment" && obsolete(item, player)) && !shouldRecycle(item, input.recycling, player)) return true;
        recycled.push(item); return false;
    });
    for (const type of ["equipment", "orb"] as const) {
        if (inventory.filter(item => item.type === type).length > GAME_CONFIG.inventory[type].capacity) return { ok: false, blocked: type };
    }
    for (const item of incoming) {
        if (item.type === "equipment" || item.type === "orb") continue;
        if (shouldRecycle(item, input.recycling, player)) { recycled.push(item); continue; }
        const next = insertInventoryItem(inventory, item);
        if (!next) return { ok: false, blocked: item.type };
        inventory = next;
    }
    return { ok: true, inventory, equipment, orbs, recycled, equipmentChanges,
        orbChanges: orbs.reduce((count, orb, slot) => count + Number(orb?.id !== input.orbs[slot]?.id), 0) };
}
