import { ATTRIBUTE_IDS, ATTRIBUTE_NAMES, canEquipEquipment, createStarterEquipment, sumEquipment, type AttributeId, type EquippedItems } from "./Equipment";
import { INITIAL_CHARACTER_CLASS, type CharacterClassId } from "./CharacterClass";
import { battlePower } from "./EquipmentEvaluation";
import { planAutomaticLoadout } from "./AutomaticLoadout";
import { deriveStats, type DerivedStats } from "./CombatStats";
import { lootProfile, BASE_LOOT_PROFILE, RARITIES, type Rarity } from "./Loot";
import { ORB_UNLOCK_LEVELS, sumOrbs, orbResonance, type Orb } from "./Orbs";
import { validateSpiritRealm, type SpiritRealm } from "./SpiritRealm";
import { quoteCraft, commitCraft, type CraftOperation } from "./Crafting";
import { compareInventoryItems, canUseConsumable, selectConsumable, potionRecovery, POTIONS, type InventoryItem, type ConsumableEffect } from "./InventoryItem";
import { insertInventoryItem, mergeInventory } from "./Inventory";
import type { ItemType } from "./ItemDefinition";
import { EMPTY_RECYCLING, recycleReward, shouldRecycle, type RecyclingRules } from "./Recycling";
import { GAME_CONFIG } from "./GameConfig";
import type { CombatNotice } from "./CombatState";
import type { CharacterCheckpoint } from "./CharacterCheckpoint";
import type { NO_PASSIVE_EFFECTS } from "./PassiveSkills";

interface CharacterHost {
    readonly tick: number;
    readonly automatic: boolean;
    readonly passiveEffects: typeof NO_PASSIVE_EFFECTS;
    statsChanged(previous: DerivedStats, next: DerivedStats, healGrowth: boolean): void;
    addSkillPoints(points: number): void;
    notify(tone: CombatNotice["tone"], message: string, acquiredEquipmentId?: number): void;
    changed(): void;
}

export function experienceForLevel(level: number): number {
    return Math.round(20 + level * 18 + level * level);
}

/**
 * Owns character progression, economy and inventory transactions.
 * The session admits commands and publishes after synchronous commits.
 * Combat vitals, skill state, world rewards and persistence keep their owners.
 */
export class CharacterState {
    private inventory: InventoryItem[] = [];
    private classIdValue: CharacterClassId = INITIAL_CHARACTER_CLASS;
    private equipped: EquippedItems = { weapon: createStarterEquipment(this.classIdValue) };
    private readonly orbs: (Orb | undefined)[] = new Array(ORB_UNLOCK_LEVELS.length);
    private attributes: Record<AttributeId, number> = { might: 5, vitality: 5, agility: 5, spirit: 5 };
    private levelValue = 1;
    private experience = 0;
    private unspentAttributePoints = 0;
    private gold = 0;
    private orbDust = 0;
    private nextId = 2;
    private realm: SpiritRealm;
    private autoRecycle: RecyclingRules = EMPTY_RECYCLING;
    private recycled: Record<ItemType, number> = { equipment: 0, orb: 0, consumable: 0, affix: 0, scroll: 0 };
    private derivedStats: DerivedStats;
    private findProfile = BASE_LOOT_PROFILE;
    private resonance = orbResonance(this.orbs);
    private inventoryFullNotified = false;
    private readonly failedLoadoutReceipts = new Set<object>();
    private automaticReceiptTick = -1;
    private failedLoadoutContext: { inventory: readonly InventoryItem[]; stats: DerivedStats; loot: typeof BASE_LOOT_PROFILE; rules: RecyclingRules } | undefined;

    constructor(spirit: SpiritRealm, private readonly host: CharacterHost) {
        this.realm = validateSpiritRealm(spirit);
        for (const id of ATTRIBUTE_IDS) this.attributes[id] += this.realm.attributes[id];
        this.derivedStats = this.calculateStats();
    }

    public get level(): number { return this.levelValue; }
    public get classId(): CharacterClassId { return this.classIdValue; }
    public get stats(): DerivedStats { return this.derivedStats; }
    public get lootProfile() { return this.findProfile; }
    public get orbResonance() { return this.resonance; }
    public get spiritRealm(): SpiritRealm { return this.realm; }
    public get nextItemId(): number { return this.nextId; }

    public snapshot() {
        return {
            classId: this.classIdValue,
            spiritRealm: this.realm, orbDust: this.orbDust, orbResonance: this.resonance,
            level: this.levelValue, experience: this.experience, experienceToLevel: experienceForLevel(this.levelValue),
            unspentAttributePoints: this.unspentAttributePoints, gold: this.gold,
            orbs: Object.freeze([...this.orbs]), lootProfile: this.findProfile,
            attributes: Object.freeze({ ...this.attributes }), stats: this.derivedStats,
            battlePower: battlePower(this.derivedStats),
            equipmentPower: battlePower(this.derivedStats) - battlePower(deriveStats(this.levelValue, this.attributes, sumEquipment({}), this.host.passiveEffects.bonuses)),
            equipment: Object.freeze({ ...this.equipped }), inventory: Object.freeze([...this.inventory]),
            autoRecycle: this.autoRecycle, recycled: Object.freeze({ ...this.recycled })
        };
    }

    /** The session validates the complete checkpoint and restores skill effects first. */
    public restore(player: CharacterCheckpoint["player"], nextId: number): void {
        this.classIdValue = player.classId;
        this.inventory = [...player.inventory]; this.equipped = { ...player.equipment };
        this.orbs.splice(0, this.orbs.length, ...player.orbs);
        this.attributes = { ...player.attributes };
        for (const id of ATTRIBUTE_IDS) this.attributes[id] += this.realm.attributes[id] - player.spiritRealm.attributes[id];
        this.levelValue = player.level; this.experience = player.experience; this.unspentAttributePoints = player.unspentAttributePoints;
        this.gold = player.gold; this.orbDust = player.orbDust; this.autoRecycle = player.autoRecycle; this.recycled = { ...player.recycled };
        this.nextId = nextId; this.clearReceipts(); this.automaticReceiptTick = -1;
        this.findProfile = lootProfile(sumOrbs(this.orbs), this.host.passiveEffects.find);
        this.resonance = orbResonance(this.orbs); this.derivedStats = this.calculateStats();
    }

    public clearReceipts(): void { this.failedLoadoutReceipts.clear(); this.failedLoadoutContext = undefined; }
    public resetCapacityNotice(): void { this.inventoryFullNotified = false; }
    public recycledCount(type: ItemType): number { return this.recycled[type]; }
    public retainsEquipment(item: Extract<InventoryItem, { type: "equipment" }>): boolean {
        return this.inventory.some(entry => entry.id === item.id) || this.wearsEquipment(item);
    }
    public wearsEquipment(item: Extract<InventoryItem, { type: "equipment" }>): boolean { return this.equipped[item.value]?.id === item.id; }

    /** Death rewards allocate IDs only when the bounded ground pool admits a drop. */
    public allocateItemId(): number { return this.nextId++; }
    public grantDefeat(gold: number): void {
        this.realm = Object.freeze({ ...this.realm, souls: this.realm.souls + 1, revision: this.realm.revision + 1 });
        this.gold += gold;
    }

    /** A blocked receipt preserves inventory, currency and IDs. RNG stays with the caller. */
    public receiveGenerated(incoming: readonly InventoryItem[], nextId: number, gold: number, protectedId: number, receipt: object): boolean {
        if (!this.receiveItems(incoming, protectedId, receipt)) return false;
        this.nextId = nextId; this.gold += gold;
        return true;
    }

    public refreshPassives(): void {
        this.recalculateStats(false, false);
        this.findProfile = lootProfile(sumOrbs(this.orbs), this.host.passiveEffects.find);
    }

    /** The session owns cooldown and vital writes; rejection leaves the stack intact. */
    public consumePotion(effect: ConsumableEffect, context: Parameters<typeof selectConsumable>[2], itemId?: number) {
        const item = itemId === undefined ? selectConsumable(this.inventory, effect, context) : this.inventory.find(item => item.id === itemId);
        if (!item || item.type !== "consumable" || POTIONS[item.value].resource !== effect || !canUseConsumable(item, context)) return undefined;
        const index = this.inventory.indexOf(item), recovery = potionRecovery(item, this.derivedStats);
        if (item.size === 1) this.inventory.splice(index, 1);
        else this.inventory[index] = Object.freeze({ ...item, size: item.size - 1 });
        this.failedLoadoutReceipts.clear(); this.inventoryFullNotified = false;
        return recovery;
    }

    public allocateAttribute(attribute: AttributeId): { readonly ok: boolean; readonly message: string } {
        if (!ATTRIBUTE_IDS.includes(attribute)) throw new RangeError("Unknown attribute");
        if (this.unspentAttributePoints === 0) return { ok: false, message: "没有可分配的属性点" };
        this.attributes[attribute] += 1;
        this.unspentAttributePoints -= 1;
        this.recalculateStats(false);
        this.host.notify("info", `${ATTRIBUTE_NAMES[attribute]}提高至 ${this.attributes[attribute]}`);
        this.host.changed();
        return { ok: true, message: "属性已提升" };
    }

    public equip(itemId: number): { readonly ok: boolean; readonly message: string } {
        const index = this.inventory.findIndex(item => item.id === itemId);
        if (index < 0) return { ok: false, message: "背包中没有这件装备" };
        const item = this.inventory[index];
        if (item.type !== "equipment") return { ok: false, message: "请选择装备" };
        if (!canEquipEquipment(item, this.classIdValue)) return { ok: false, message: "职业不符，无法装备" };
        const previous = this.equipped[item.value];
        this.inventory.splice(index, 1);
        this.equipped = { ...this.equipped, [item.value]: Object.freeze({ ...item, locked: true, autoEquipped: false, revision: item.revision + 1 }) };
        this.inventoryFullNotified = false;
        this.recalculateStats(false);
        if (previous && !this.storeInventoryItem(previous)) throw new Error("Equipment exchange lost its reserved slot");
        this.host.notify("loot", `已装备 ${item.name}`);
        this.host.changed();
        return { ok: true, message: "装备成功" };
    }

    public sortInventory(): void {
        this.inventory = mergeInventory(this.inventory).sort(compareInventoryItems);
        this.host.changed();
    }

    public setAutoRecycle(type: ItemType, maximum: Rarity | null): void {
        if (!Object.hasOwn(EMPTY_RECYCLING, type)) throw new RangeError("Unknown recycling category");
        if (maximum !== null && !RARITIES.includes(maximum)) throw new RangeError("Unknown cleanup quality");
        if (this.autoRecycle[type] === maximum) return;
        this.autoRecycle = Object.freeze({ ...this.autoRecycle, [type]: maximum });
        this.updateAutomaticLoadout();
        this.recycleInventory();
        this.host.changed();
    }

    public mergeConsumables(): void {
        const before = this.inventory.length;
        this.inventory = mergeInventory(this.inventory);
        this.inventoryFullNotified = false;
        this.host.notify("info", `合并药剂 · 腾出 ${before - this.inventory.length} 格`);
        this.host.changed();
    }

    public setEquipmentLock(itemId: number, locked: boolean): void {
        const index = this.inventory.findIndex(item => item.id === itemId), item = this.inventory[index] ?? Object.values(this.equipped).find(item => item?.id === itemId);
        if (!item || item.type !== "equipment" || item.locked === locked) return;
        const updated = Object.freeze({ ...item, locked, autoEquipped: false, revision: item.revision + 1 });
        if (index >= 0) this.inventory[index] = updated;
        else this.equipped = { ...this.equipped, [item.value]: updated };
        this.recycleInventory(); this.host.changed();
    }

    public craft(operation: CraftOperation): void {
        const context = { inventory: this.inventory, equipment: this.equipped, orbs: this.orbs, gold: this.gold, orbDust: this.orbDust };
        const plan = quoteCraft(context, operation);
        if (!plan.ok) { this.host.notify("info", plan.reason); return; }
        const result = commitCraft(context, plan, this.nextId);
        this.inventory = result.inventory; this.equipped = result.equipment;
        if (result.usedId) this.nextId++;
        this.gold += (plan.goldGain ?? 0) - plan.gold; this.orbDust += plan.dustGain - plan.dust;
        this.inventoryFullNotified = false;
        this.recalculateStats(false);
        this.host.notify("loot", `${plan.title}完成${plan.dustGain ? ` · 获得 ${plan.dustGain} 宝珠粉尘` : plan.goldGain ? ` · 获得 ${plan.goldGain} 金币` : ""}`);
        this.host.changed();
    }

    public cultivateSpirit(attribute: AttributeId): void {
        if (!ATTRIBUTE_IDS.includes(attribute)) throw new RangeError("Unknown spirit attribute");
        if (this.realm.souls < GAME_CONFIG.spiritRealm.soulsPerLevel) { this.host.notify("info", "灵魂不足，需要 1000 灵魂"); return; }
        this.realm = validateSpiritRealm({ souls: this.realm.souls - GAME_CONFIG.spiritRealm.soulsPerLevel,
            revision: this.realm.revision + 1, attributes: { ...this.realm.attributes, [attribute]: this.realm.attributes[attribute] + 1 } });
        this.attributes[attribute]++;
        this.recalculateStats(false); this.host.notify("level", `灵境成长 · ${ATTRIBUTE_NAMES[attribute]}永久 +1`); this.host.changed();
    }

    public equipOrb(itemId: number, socket: number): { readonly ok: boolean; readonly message: string } {
        if (!Number.isInteger(socket) || socket < 0 || socket >= ORB_UNLOCK_LEVELS.length) return { ok: false, message: "无效宝珠槽" };
        if (this.levelValue < ORB_UNLOCK_LEVELS[socket]) return { ok: false, message: "宝珠槽尚未解锁" };
        const source = this.orbs.findIndex(item => item?.id === itemId);
        if (source >= 0) {
            if (source !== socket) {
                [this.orbs[source], this.orbs[socket]] = [this.orbs[socket], this.orbs[source]];
                this.host.changed();
            }
            return { ok: true, message: "宝珠槽位已交换" };
        }
        const index = this.inventory.findIndex(item => item.id === itemId);
        const item = this.inventory[index];
        if (!item || item.type !== "orb") return { ok: false, message: "背包中没有这颗宝珠" };
        const previous = this.orbs[socket];
        this.inventory.splice(index, 1);
        if (previous && !this.storeInventoryItem(previous)) throw new Error("Orb exchange lost its reserved slot");
        this.orbs[socket] = item;
        this.findProfile = lootProfile(sumOrbs(this.orbs), this.host.passiveEffects.find);
        this.resonance = orbResonance(this.orbs);
        this.inventoryFullNotified = false;
        this.host.notify("loot", `已嵌入 ${item.name}`);
        this.host.changed();
        return { ok: true, message: "宝珠已嵌入" };
    }

    public unequip(slot: keyof EquippedItems): void {
        const item = this.equipped[slot];
        if (!item) return;
        const nextInventory = insertInventoryItem(this.inventory, item);
        if (!nextInventory) { this.notifyInventoryFull("equipment"); return; }
        this.inventory = nextInventory;
        const next = { ...this.equipped };
        delete next[slot];
        this.equipped = next;
        this.recalculateStats(false);
        this.host.changed();
    }

    public removeOrb(socket: number): void {
        const orb = this.orbs[socket];
        if (!orb) return;
        if (!this.storeInventoryItem(orb)) { this.notifyInventoryFull("orb"); return; }
        this.inventoryFullNotified = false;
        this.orbs[socket] = undefined;
        this.findProfile = lootProfile(sumOrbs(this.orbs), this.host.passiveEffects.find);
        this.resonance = orbResonance(this.orbs);
        this.host.changed();
    }

    public gainExperience(amount: number): void {
        this.experience += amount * (1 + this.derivedStats.experienceBonus);
        let levels = 0;
        while (this.experience >= experienceForLevel(this.levelValue)) {
            this.experience -= experienceForLevel(this.levelValue);
            this.levelValue += 1;
            this.unspentAttributePoints += 2;
            this.host.addSkillPoints(GAME_CONFIG.skills.pointsPerLevel);
            levels += 1;
        }
        if (levels > 0) {
            this.recalculateStats(true, false);
            this.updateAutomaticLoadout(); this.recycleInventory();
            this.host.notify("level", `等级提升至 ${this.levelValue} · 获得 ${levels * 2} 点属性`);
        }
        this.host.changed();
    }

    public receiveItems(incoming: readonly InventoryItem[], protectedId = 0, receipt?: object): boolean {
        if (this.host.automatic && (!incoming.length || incoming.some(item => item.type === "equipment" || item.type === "orb"))) {
            const previous = this.failedLoadoutContext;
            if (!previous || previous.inventory !== this.inventory || previous.stats !== this.derivedStats || previous.loot !== this.findProfile || previous.rules !== this.autoRecycle) {
                this.failedLoadoutReceipts.clear();
                this.failedLoadoutContext = { inventory: this.inventory, stats: this.derivedStats, loot: this.findProfile, rules: this.autoRecycle };
            }
            if (receipt && this.failedLoadoutReceipts.has(receipt)) return false;
            // Bursts of loot share one planning budget; deferred sources remain intact for the next tick.
            if (receipt) {
                if (this.automaticReceiptTick === this.host.tick) return false;
                this.automaticReceiptTick = this.host.tick;
            }
            const plan = planAutomaticLoadout({ inventory: this.inventory, equipment: this.equipped, orbs: this.orbs,
                classId: this.classIdValue, level: this.levelValue, attributes: this.attributes, recycling: this.autoRecycle, passiveBonuses: this.host.passiveEffects.bonuses, passiveFind: this.host.passiveEffects.find }, incoming, protectedId);
            if (!plan.ok) {
                if (receipt) this.failedLoadoutReceipts.add(receipt);
                this.notifyInventoryFull(plan.blocked); return false;
            }
            this.inventory = plan.inventory; this.equipped = plan.equipment;
            this.orbs.splice(0, this.orbs.length, ...plan.orbs);
            for (const item of plan.recycled) this.applyAutoRecycle(item);
            if (plan.equipmentChanges) this.recalculateStats(false, false);
            if (plan.orbChanges) { this.findProfile = lootProfile(sumOrbs(this.orbs), this.host.passiveEffects.find); this.resonance = orbResonance(this.orbs); }
            if (plan.equipmentChanges || plan.orbChanges) this.host.notify("loot", `自动装配 · 换装 ${plan.equipmentChanges} 件 · 嵌珠 ${plan.orbChanges} 颗`);
        } else {
            let inventory = this.inventory;
            const recycled: InventoryItem[] = [];
            for (const item of incoming) {
                if (item.id !== protectedId && this.shouldAutoRecycle(item)) { recycled.push(item); continue; }
                const next = insertInventoryItem(inventory, item);
                if (!next) { this.notifyInventoryFull(item.type); return false; }
                inventory = next;
            }
            this.inventory = inventory;
            for (const item of recycled) this.applyAutoRecycle(item);
        }
        return true;
    }

    public updateAutomaticLoadout(): void {
        if (this.host.automatic) this.receiveItems([]);
    }

    private notifyInventoryFull(type: ItemType): void {
        if (this.inventoryFullNotified) return;
        this.inventoryFullNotified = true;
        this.host.notify("danger", `${GAME_CONFIG.inventory[type].name}背包空间不足，整理后可拾取物品或开启宝箱`);
    }

    private calculateStats(): DerivedStats {
        return deriveStats(this.levelValue, this.attributes, sumEquipment(this.equipped), this.host.passiveEffects.bonuses);
    }

    private shouldAutoRecycle(item: InventoryItem): boolean {
        return shouldRecycle(item, this.autoRecycle, {
            classId: this.classIdValue, level: this.levelValue, attributes: this.attributes, equipment: this.equipped, stats: this.derivedStats, passiveBonuses: this.host.passiveEffects.bonuses
        });
    }

    private storeInventoryItem(item: InventoryItem): boolean {
        if (this.shouldAutoRecycle(item)) { this.applyAutoRecycle(item); return true; }
        const next = insertInventoryItem(this.inventory, item);
        if (!next) return false;
        this.inventory = next;
        return true;
    }

    private recycleInventory(): void {
        if (!Object.values(this.autoRecycle).some(value => value !== null)) return;
        const before = this.inventory.length;
        this.inventory = this.inventory.filter(item => {
            if (!this.shouldAutoRecycle(item)) return true;
            this.applyAutoRecycle(item); return false;
        });
        if (this.inventory.length < before) this.inventoryFullNotified = false;
    }

    private applyAutoRecycle(item: InventoryItem): void {
        const reward = recycleReward(item);
        this.gold += reward.gold; this.orbDust += reward.dust;
        this.recycled[item.type] += item.size;
    }

    private recalculateStats(healGrowth: boolean, recycle = true): void {
        const previous = this.derivedStats;
        this.derivedStats = this.calculateStats();
        this.host.statsChanged(previous, this.derivedStats, healGrowth);
        if (recycle) this.recycleInventory();
    }
}
