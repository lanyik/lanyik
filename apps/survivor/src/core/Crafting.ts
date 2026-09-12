import { withEquipmentAffixes, type Equipment, type EquipmentAffix, type EquippedItems } from "./Equipment";
import { createAffixItem } from "./AffixItem";
import { insertInventoryItem } from "./Inventory";
import type { InventoryItem } from "./InventoryItem";
import { RARITIES, type Rarity } from "./Loot";
import { createOrb, orbDust, orbRefineCost, orbResonance, type Orb } from "./Orbs";

export interface EquipmentRef { readonly id: number; readonly revision: number }
export type CraftOperation =
    | { readonly kind: "extract"; readonly source: EquipmentRef; readonly affix: number }
    | { readonly kind: "imbue"; readonly target: EquipmentRef; readonly affixId: number; readonly slot: number }
    | { readonly kind: "inherit"; readonly source: EquipmentRef; readonly target: EquipmentRef }
    | { readonly kind: "salvage-orb" | "refine-orb"; readonly orbId: number; readonly rarity: Rarity };
export interface CraftContext {
    readonly inventory: readonly InventoryItem[];
    readonly equipment: EquippedItems;
    readonly orbs: readonly (Orb | undefined)[];
    readonly gold: number;
    readonly orbDust: number;
}
export interface CraftPlan {
    readonly ok: true;
    readonly title: string;
    readonly description: string;
    readonly gold: number;
    readonly dust: number;
    readonly dustGain: number;
    readonly remove: readonly number[];
    readonly replacement?: Equipment | Orb;
    readonly extracted?: EquipmentAffix;
    readonly consumeAffix?: number;
}
export type CraftQuote = CraftPlan | { readonly ok: false; readonly reason: string };
const reject = (reason: string): CraftQuote => ({ ok: false, reason });

function findEquipment(context: CraftContext, ref: EquipmentRef, source: boolean): Equipment | undefined {
    const item = context.inventory.find(item => item.id === ref.id)
        ?? (source ? undefined : Object.values(context.equipment).find(item => item?.id === ref.id));
    return item?.type === "equipment" && item.revision === ref.revision ? item : undefined;
}

/** UI previews and authority use the same deterministic quote. Every failure is mutation-free. */
export function quoteCraft(context: CraftContext, operation: CraftOperation): CraftQuote {
    const discount = 1 - orbResonance(context.orbs).craftDiscount;
    let plan: CraftPlan;
    if (operation.kind === "extract" || operation.kind === "inherit") {
        const source = findEquipment(context, operation.source, true);
        if (!source) return reject("来源装备已变化，请重新选择背包中的装备");
        if (source.locked) return reject("来源装备已锁定，请先在背包解锁");
        if (operation.kind === "extract") {
            const affix = source.affixes[operation.affix];
            if (!Number.isInteger(operation.affix) || !affix) return reject("请选择要提取的词条");
            if (!insertInventoryItem(context.inventory.filter(item => item.id !== source.id), createAffixItem(0, affix))) return reject("词条背包已满");
            plan = { ok: true, title: "提取词条", description: `销毁「${source.name}」，仅保留选中的词条，其余词条消失。`,
                gold: Math.ceil(80 * (RARITIES.indexOf(source.rarity) + 1) * (source.stars + 1) * discount), dust: 0, dustGain: 0,
                remove: [source.id], extracted: affix };
        } else {
            const target = findEquipment(context, operation.target, false);
            if (!target) return reject("目标装备已变化，请重新选择");
            if (target.id === source.id) return reject("来源与目标不能是同一件装备");
            const qualityGap = Math.abs(RARITIES.indexOf(source.rarity) - RARITIES.indexOf(target.rarity));
            const starGap = Math.abs(source.stars - target.stars);
            plan = { ok: true, title: "装备继承", description: `销毁「${source.name}」，覆盖「${target.name}」的全部 ${target.affixes.length} 条附加词条。目标基础属性、品质、等级与星级保留。`,
                gold: 0, dust: Math.ceil(4 * source.affixes.length * (1 + qualityGap) * (1 + starGap) * discount), dustGain: 0,
                remove: [source.id], replacement: withEquipmentAffixes(target, source.affixes) };
        }
    } else if (operation.kind === "imbue") {
        const target = findEquipment(context, operation.target, false), affix = context.inventory.find(item => item.id === operation.affixId);
        if (!target) return reject("目标装备已变化，请重新选择");
        if (!affix || affix.type !== "affix") return reject("词条精粹已不存在");
        if (!Number.isInteger(operation.slot) || !target.affixes[operation.slot]) return reject("请选择被覆盖的词条");
        if (target.affixes.some((entry, index) => index !== operation.slot && entry.stat === affix.value)) return reject("目标装备已有同名词条，不能重复打入");
        const next = target.affixes.map((entry, index) => index === operation.slot ? { stat: affix.value, value: affix.amount, rarity: affix.rarity } : entry);
        plan = { ok: true, title: "打入词条", description: `消耗 1 份「${affix.name}」，永久覆盖「${target.name}」的第 ${operation.slot + 1} 条词条，原词条不返还。`,
            gold: Math.ceil((120 * (RARITIES.indexOf(target.rarity) + 1) * (target.stars + 1) + 60 * (RARITIES.indexOf(affix.rarity) + 1)) * discount),
            dust: 0, dustGain: 0, remove: [], consumeAffix: affix.id, replacement: withEquipmentAffixes(target, next) };
    } else {
        const orb = context.inventory.find(item => item.id === operation.orbId);
        if (!orb || orb.type !== "orb" || orb.rarity !== operation.rarity) return reject("宝珠已变化，请重新选择背包中的宝珠");
        if (operation.kind === "salvage-orb") {
            plan = { ok: true, title: "分解宝珠", description: `销毁「${orb.name}」，获得宝珠粉尘。`, gold: 0, dust: 0, dustGain: orbDust(orb), remove: [orb.id] };
        } else {
            const tier = RARITIES.indexOf(orb.rarity);
            if (tier === RARITIES.length - 1) return reject("已达彩色品质上限");
            plan = { ok: true, title: "精炼宝珠", description: `提升「${orb.name}」的品质，类型保持不变，精炼必定成功。`,
                gold: 0, dust: Math.ceil(orbRefineCost(orb) * discount), dustGain: 0, remove: [], replacement: createOrb(orb.id, RARITIES[tier + 1], orb.value) };
        }
    }
    if (context.gold < plan.gold) return reject(`金币不足，需要 ${plan.gold}，当前 ${context.gold}`);
    if (context.orbDust < plan.dust) return reject(`宝珠粉尘不足，需要 ${plan.dust}，当前 ${context.orbDust}`);
    if (!Number.isSafeInteger(context.orbDust + plan.dustGain)) return reject("宝珠粉尘已达可保存上限");
    return plan;
}

export function commitCraft(context: CraftContext, plan: CraftPlan, nextId: number): { inventory: InventoryItem[]; equipment: EquippedItems; usedId: boolean } {
    let inventory = context.inventory.filter(item => !plan.remove.includes(item.id));
    let equipment = context.equipment;
    if (plan.consumeAffix !== undefined) inventory = inventory.flatMap(item => {
        if (item.id !== plan.consumeAffix || item.type !== "affix") return [item];
        return item.size === 1 ? [] : [Object.freeze({ ...item, size: item.size - 1 })];
    });
    if (plan.replacement) {
        const replacement = plan.replacement, index = inventory.findIndex(item => item.id === replacement.id);
        if (index >= 0) inventory[index] = replacement;
        else if (replacement.type === "equipment") equipment = { ...equipment, [replacement.value]: replacement };
    }
    if (plan.extracted) {
        const next = insertInventoryItem(inventory, createAffixItem(nextId, plan.extracted));
        if (!next) throw new Error("Validated affix transaction exceeded capacity");
        inventory = next;
    }
    return { inventory, equipment, usedId: Boolean(plan.extracted) };
}
