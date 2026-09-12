import {
    ATTRIBUTE_IDS,
    createStarterEquipment,
    generateEquipment,
    sumEquipment,
    type AttributeId,
    type EquippedItems
} from "./Equipment";
import { DeterministicRandom } from "./DeterministicRandom";
import { battlePower, compareEquipment } from "./EquipmentEvaluation";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import { deriveStats, incomingDamage, outgoingDamage, reflectedDamage, rollAttack, type DerivedStats } from "./CombatStats";
import {
    RegionalWorld, MAX_COMBAT_CHUNKS,
    REGION_RULES, CHEST_RULES, CHEST_TIERS, type RegionInfo
} from "./RegionalWorld";
import { lootProfile, BASE_LOOT_PROFILE } from "./Loot";
import { ORB_UNLOCK_LEVELS, generateOrb, sumOrbs, type Orb } from "./Orbs";
import { compareInventoryItems, createConsumable, type InventoryItem, type ConsumableEffect } from "./InventoryItem";
import { insertInventoryItem, mergeInventory } from "./Inventory";
import type { ItemType } from "./ItemDefinition";
import { GAME_CONFIG, ticksPerUpdate } from "./GameConfig";

import { ActorAction, CombatWorld, Component, Faction } from "./CombatWorld";
import { EnemyBehavior } from "./EnemyBehavior";
import { SimulationTasks } from "./SimulationTasks";
import type { ProjectileExecutor } from "./ProjectileBatch";
import { advanceProjectiles, moveEnemies, advanceEnemyActions } from "./CombatSystems";
import { ENEMY_DEFINITIONS, ENEMY_SPECIAL, ENEMY_HIT_RULES, EnemyKind } from "./EnemyDefinitions";
import { SkillSystem } from "./SkillSystem";
import { SKILLS, type SkillId } from "./Skills";
import { MAX_PROJECTILES, MAX_GROUND_EQUIPMENT, CONSUMABLE_COOLDOWN } from "./GameConfig";
import type { CombatRenderState, CombatSnapshot, CombatNotice, PlayerSnapshot, PlayerRenderState, MovementInput, ChestRenderBuffer } from "./CombatState";

const STEP_SECONDS = COMBAT_STEP_MS / 1000;
const REGENERATION_TICKS = ticksPerUpdate(GAME_CONFIG.timing.regenerationHz);
const AUTO_SKILL_TICKS = ticksPerUpdate(GAME_CONFIG.timing.autoSkillHz);
type MutablePlayerRenderState = { -readonly [Key in keyof PlayerRenderState]: PlayerRenderState[Key] };
class ChestPool implements ChestRenderBuffer {
    public count = 0;
    public readonly tiers = new Uint8Array(MAX_COMBAT_CHUNKS);
    public readonly x = new Float64Array(MAX_COMBAT_CHUNKS);
    public readonly z = new Float64Array(MAX_COMBAT_CHUNKS);
}

export function experienceForLevel(level: number): number {
    return Math.round(20 + level * 18 + level * level);
}

function validatePosition(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Combat position must be finite");
}

/**
 * Authoritative session facade and fixed system order. Combat entities live in
 * the ECS; inventory and progression remain low-frequency domain data.
 */
export class CombatSimulation {
    private readonly movingExperience = new Float64Array(GAME_CONFIG.combat.maxExperienceOrbs);
    private movingExperienceCount = 0;
    public readonly tasks: SimulationTasks;
    private random: DeterministicRandom;
    private readonly entities: CombatWorld;
    private readonly behavior: EnemyBehavior;
    private readonly skills: SkillSystem;
    private readonly groundItems = new Map<number, InventoryItem>();
    private readonly world: RegionalWorld;
    private readonly chests = new ChestPool();
    private currentRegion: RegionInfo;
    private nearbyRegions: readonly RegionInfo[];
    private inventory: InventoryItem[] = [];
    private autoClearEquipment = false;
    private clearedEquipment = 0;
    private readonly orbs: (Orb | undefined)[] = new Array(ORB_UNLOCK_LEVELS.length);
    private lootProfile = BASE_LOOT_PROFILE;
    private equipped: EquippedItems = { weapon: createStarterEquipment() };
    private attributes: Record<AttributeId, number> = { might: 5, vitality: 5, agility: 5, spirit: 5 };
    private stats: DerivedStats;
    private tickValue = 0;
    private killsValue = 0;
    private revision = 0;
    private nextItemId = 2;
    private nextNoticeId = 1;
    private notices: CombatNotice[] = [];
    private cachedSnapshot: CombatSnapshot | undefined;
    private attackCooldown = 0;
    private shieldCooldown = 0;
    private potionCooldown = 0;
    private autoCast = true;
    private gold = 0;
    private openedChests = 0;
    private damageImmunity = 0;
    private inventoryFullNotified = false;
    private get playerX(): number { return this.entities.position.x[this.entities.player]; }
    private set playerX(value: number) { this.entities.position.x[this.entities.player] = value; }
    private get playerZ(): number { return this.entities.position.z[this.entities.player]; }
    private set playerZ(value: number) { this.entities.position.z[this.entities.player] = value; }
    private get previousPlayerX(): number { return this.entities.position.previousX[this.entities.player]; }
    private set previousPlayerX(value: number) { this.entities.position.previousX[this.entities.player] = value; }
    private get previousPlayerZ(): number { return this.entities.position.previousZ[this.entities.player]; }
    private set previousPlayerZ(value: number) { this.entities.position.previousZ[this.entities.player] = value; }
    private get heading(): number { return this.entities.position.heading[this.entities.player]; }
    private set heading(value: number) { this.entities.position.heading[this.entities.player] = value; }
    private get health(): number { return this.entities.vitals.health[this.entities.player]; }
    private set health(value: number) { this.entities.vitals.health[this.entities.player] = value; }
    private get mana(): number { return this.entities.vitals.mana[this.entities.player]; }
    private set mana(value: number) { this.entities.vitals.mana[this.entities.player] = value; }
    private level = 1;
    private experience = 0;
    private unspentAttributePoints = 0;
    private gameOverValue = false;
    private readonly playerRenderState: MutablePlayerRenderState = {
        animationTime: 0,
        x: 0,
        z: 0,
        previousX: 0,
        previousZ: 0,
        heading: 0,
        healthRatio: 1,
        invulnerable: false,
        shieldReady: true,
        ward: 0,
        dashing: false,
        gameOver: false
    };
    private readonly renderState: CombatRenderState;

    constructor(seed: string | number, start = { x: 0, z: 0 }) {
        validatePosition(start.x, start.z);
        this.random = new DeterministicRandom(`${String(seed)}:combat`);
        this.world = new RegionalWorld(seed, start);
        this.entities = new CombatWorld(start.x, start.z);
        this.behavior = new EnemyBehavior(this.entities, this.world);
        this.skills = new SkillSystem(this.entities);
        this.renderState = { player: this.playerRenderState, chests: this.chests, effects: this.entities.effects.buffer,
            entities: { ids: this.entities.world.ids, enemies: this.entities.enemies, projectiles: this.entities.projectiles,
                experience: this.entities.experience, loot: this.entities.loot, position: this.entities.position,
                vitals: this.entities.vitals, enemy: this.entities.enemy, action: this.entities.action,
                projectile: this.entities.projectile, status: this.entities.status, experienceValue: this.entities.experienceValue, item: this.entities.item } };
        this.currentRegion = this.world.regionAt(start.x, start.z);
        this.nearbyRegions = this.world.nearbyRegions(this.currentRegion);
        this.playerX = this.previousPlayerX = start.x;
        this.playerZ = this.previousPlayerZ = start.z;
        this.stats = this.calculateStats();
        this.health = this.entities.vitals.maxHealth[this.entities.player] = this.stats.maxHealth;
        this.mana = this.stats.maxMana;
        this.world.synchronize(start.x, start.z);
        this.tasks = new SimulationTasks(entity => this.entities.world.resolve(entity) >= 0);
        this.tasks.commitReady(0, this.world.revision);
        this.spawnEnemies();
        this.refreshChests();
    }

    public get tick(): number { return this.tickValue; }
    public get gameOver(): boolean { return this.gameOverValue; }
    public dispose(): void { this.tasks.dispose(); }

    public step(input: MovementInput): void;
    public step(input: MovementInput, executor: ProjectileExecutor): Promise<void>;
    public step(input: MovementInput, executor?: ProjectileExecutor): void | Promise<void> {
        this.tasks.assertCanStep();
        if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.z)) {
            throw new RangeError("Movement input must contain finite coordinates");
        }
        if (this.gameOverValue) return executor ? Promise.resolve() : undefined;
        if (!Number.isSafeInteger(this.tickValue + 1) || (this.tickValue + 1) * COMBAT_STEP_MS > Number.MAX_SAFE_INTEGER) {
            throw new RangeError("Combat time exceeds the supported range");
        }
        this.tickValue += 1;
        this.cachedSnapshot = undefined;
        this.previousPlayerX = this.playerX;
        this.previousPlayerZ = this.playerZ;
        this.damageImmunity = Math.max(0, this.damageImmunity - STEP_SECONDS);
        this.shieldCooldown = Math.max(0, this.shieldCooldown - STEP_SECONDS);
        this.potionCooldown = Math.max(0, this.potionCooldown - STEP_SECONDS);
        this.entities.effects.advance(this.tickValue);
        if (!this.skills.advance(this.tickValue)) this.movePlayer(input);
        const shifted = this.world.synchronize(this.playerX, this.playerZ);
        if (shifted) { this.reconcileRegions(); this.spawnEnemies(); this.refreshChests(); }
        this.tasks.commitReady(this.tickValue, this.world.revision);
        this.updateCurrentRegion();
        this.fireWeapon();
        if (executor) return this.tasks.require(async () => {
            await advanceProjectiles(this.entities, executor);
            this.finishStep();
        });
        advanceProjectiles(this.entities);
        this.finishStep();
    }

    private finishStep(): void {
        this.resolveImpacts();
        if (this.gameOverValue) return;
        if (this.autoCast && this.tickValue % AUTO_SKILL_TICKS === 0) {
            for (const id of this.skills.loadout) {
                this.skills.cast(id, this.tickValue, this.stats, this.level, this.random, true);
                this.resolveImpacts();
            }
        }
        this.behavior.update(this.tickValue);
        moveEnemies(this.entities, this.tickValue);
        advanceEnemyActions(this.entities, this.tickValue);
        this.resolveImpacts();
        if (this.gameOverValue) return;
        this.advanceExperience();
        this.collectEquipment();
        this.openNearbyChest();
        if (this.tickValue % REGENERATION_TICKS === 0) this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.manaRegen);
        if (this.tickValue % REGENERATION_TICKS === 0 && this.stats.healthRegen > 0 && this.health < this.stats.maxHealth) {
            this.health = Math.min(this.stats.maxHealth, this.health + this.stats.healthRegen);
            this.markChanged();
        }
    }

    public getSnapshot(): CombatSnapshot {
        if (this.cachedSnapshot) return this.cachedSnapshot;
        const equipment = Object.freeze({ ...this.equipped });
        const player: PlayerSnapshot = Object.freeze({
            x: this.playerX,
            z: this.playerZ,
            health: this.health,
            mana: this.mana,
            level: this.level,
            experience: this.experience,
            experienceToLevel: experienceForLevel(this.level),
            unspentAttributePoints: this.unspentAttributePoints,
            gold: this.gold,
            shieldRemaining: this.shieldCooldown,
            skills: this.skills.snapshot(this.tickValue),
            potionRemaining: this.potionCooldown,
            autoCast: this.autoCast,
            orbs: Object.freeze([...this.orbs]),
            lootProfile: this.lootProfile,
            attributes: Object.freeze({ ...this.attributes }),
            stats: this.stats,
            battlePower: battlePower(this.stats),
            equipmentPower: battlePower(this.stats) - battlePower(deriveStats(this.level, this.attributes, sumEquipment({}))),
            equipment,
            inventory: Object.freeze([...this.inventory]),
            autoClearEquipment: this.autoClearEquipment,
            clearedEquipment: this.clearedEquipment
        });
        const chunks = { near: 0, buffer: 0, retained: 0, total: this.world.chunks.size };
        for (const chunk of this.world.chunks.values()) if (chunk.band !== "unloaded") chunks[chunk.band] += 1;
        let boss: CombatSnapshot["boss"];
        for (let cursor = 0; cursor < this.entities.enemies.count; cursor += 1) {
            const index = this.entities.enemies.slots[cursor];
            const region = this.entities.enemy.regions[index]!;
            if (this.entities.enemy.boss[index] && region.x === this.currentRegion.x && region.z === this.currentRegion.z) {
                boss = Object.freeze({ x: this.entities.position.x[index], z: this.entities.position.z[index], health: this.entities.vitals.health[index], maxHealth: this.entities.vitals.maxHealth[index], enraged: this.entities.enemy.enraged[index] !== 0 });
                break;
            }
        }
        return this.cachedSnapshot = Object.freeze({
            revision: this.revision,
            tick: this.tickValue,
            elapsedMs: this.tickValue / GAME_CONFIG.timing.simulationHz * 1000,
            kills: this.killsValue,
            livingEnemies: this.entities.enemies.count,
            groundEquipment: this.entities.loot.count,
            region: this.currentRegion,
            nearbyRegions: this.nearbyRegions,
            chunks: Object.freeze(chunks),
            openedChests: this.openedChests,
            boss,
            gameOver: this.gameOverValue,
            player
        });
    }

    public getRenderState(): CombatRenderState {
        this.playerRenderState.animationTime = this.tick * STEP_SECONDS;
        const state = this.playerRenderState;
        state.x = this.playerX;
        state.z = this.playerZ;
        state.previousX = this.previousPlayerX;
        state.previousZ = this.previousPlayerZ;
        state.heading = this.heading;
        state.healthRatio = this.health / this.stats.maxHealth;
        state.invulnerable = this.damageImmunity > 0;
        state.shieldReady = this.shieldCooldown === 0;
        state.ward = this.skills.ward;
        state.dashing = this.skills.dashing(this.tickValue);
        state.gameOver = this.gameOverValue;
        return this.renderState;
    }

    public drainNotices(): readonly CombatNotice[] {
        if (this.notices.length === 0) return [];
        const notices = this.notices;
        this.notices = [];
        return notices;
    }

    public allocateAttribute(attribute: AttributeId): { readonly ok: boolean; readonly message: string } {
        if (!ATTRIBUTE_IDS.includes(attribute)) throw new RangeError("Unknown attribute");
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        if (this.unspentAttributePoints === 0) return { ok: false, message: "没有可分配的属性点" };
        this.attributes[attribute] += 1;
        this.unspentAttributePoints -= 1;
        this.recalculateStats(false);
        this.pushNotice("info", `${ATTRIBUTE_NAMES[attribute]}提高至 ${this.attributes[attribute]}`);
        this.markChanged();
        return { ok: true, message: "属性已提升" };
    }

    public equip(itemId: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        const index = this.inventory.findIndex(item => item.id === itemId);
        if (index < 0) return { ok: false, message: "背包中没有这件装备" };
        const item = this.inventory[index];
        if (item.type !== "equipment") return { ok: false, message: "请选择装备" };
        const previous = this.equipped[item.value];
        this.inventory.splice(index, 1);
        this.equipped = { ...this.equipped, [item.value]: item };
        this.inventoryFullNotified = false;
        this.recalculateStats(false);
        if (previous && !this.storeInventoryItem(previous)) throw new Error("Equipment exchange lost its reserved slot");
        this.pushNotice("loot", `已装备 ${item.name}`);
        this.markChanged();
        return { ok: true, message: "装备成功" };
    }

    public discard(itemId: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        const index = this.inventory.findIndex(item => item.id === itemId);
        if (index < 0) return { ok: false, message: "背包中没有这件装备" };
        const [item] = this.inventory.splice(index, 1);
        this.inventoryFullNotified = false;
        this.pushNotice("info", `丢弃了 ${item.name}`);
        this.markChanged();
        return { ok: true, message: "装备已丢弃" };
    }

    public sortInventory(): void {
        if (this.gameOverValue) return;
        this.inventory.sort(compareInventoryItems);
        this.markChanged();
    }

    public setAutoClearEquipment(enabled: boolean): void {
        if (this.gameOverValue || this.autoClearEquipment === enabled) return;
        this.autoClearEquipment = enabled;
        this.clearAutoEquipment();
        this.markChanged();
    }

    public mergeConsumables(): void {
        if (this.gameOverValue) return;
        const before = this.inventory.length;
        this.inventory = mergeInventory(this.inventory);
        this.inventoryFullNotified = false;
        this.pushNotice("info", `合并药剂 · 腾出 ${before - this.inventory.length} 格`);
        this.markChanged();
    }

    public equipOrb(itemId: number, socket: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        if (!Number.isInteger(socket) || socket < 0 || socket >= ORB_UNLOCK_LEVELS.length) return { ok: false, message: "无效宝珠槽" };
        if (this.level < ORB_UNLOCK_LEVELS[socket]) return { ok: false, message: "宝珠槽尚未解锁" };
        const index = this.inventory.findIndex(item => item.id === itemId);
        const item = this.inventory[index];
        if (!item || item.type !== "orb") return { ok: false, message: "背包中没有这颗宝珠" };
        const previous = this.orbs[socket];
        this.inventory.splice(index, 1);
        if (previous) this.inventory.push(previous);
        this.orbs[socket] = item;
        this.lootProfile = lootProfile(sumOrbs(this.orbs));
        this.inventoryFullNotified = false;
        this.pushNotice("loot", `已嵌入 ${item.name}`);
        this.markChanged();
        return { ok: true, message: "宝珠已嵌入" };
    }

    public unequip(slot: keyof EquippedItems): void {
        const item = this.equipped[slot];
        if (this.gameOverValue || !item) return;
        const nextInventory = insertInventoryItem(this.inventory, item);
        if (!nextInventory) { this.notifyInventoryFull("equipment"); return; }
        this.inventory = nextInventory;
        const next = { ...this.equipped };
        delete next[slot];
        this.equipped = next;
        this.recalculateStats(false);
        this.markChanged();
    }

    public removeOrb(socket: number): void {
        const orb = this.orbs[socket];
        if (this.gameOverValue || !orb) return;
        const nextInventory = insertInventoryItem(this.inventory, orb);
        if (!nextInventory) { this.notifyInventoryFull("orb"); return; }
        this.inventory = nextInventory;
        this.orbs[socket] = undefined;
        this.lootProfile = lootProfile(sumOrbs(this.orbs));
        this.markChanged();
    }

    public toggleAutoCast(): void {
        if (this.gameOverValue) return;
        this.autoCast = !this.autoCast;
        this.markChanged();
    }

    public castSkill(id: SkillId): void {
        if (this.gameOverValue) return;
        if (this.skills.cast(id, this.tickValue, this.stats, this.level, this.random)) { this.resolveImpacts(); this.markChanged(); }
    }

    public equipSkill(id: SkillId, slot: number): void {
        if (!this.gameOverValue && this.skills.equip(id, slot, this.level)) this.markChanged();
    }

    public upgradeSkill(id: SkillId): void {
        if (!this.gameOverValue && this.skills.upgrade(id, this.level)) {
            this.pushNotice("info", `${SKILLS[id].name}已强化`); this.markChanged();
        }
    }

    public useConsumable(effect: ConsumableEffect, itemId?: number): void {
        if (this.gameOverValue || this.potionCooldown > 0) return;
        if (effect === "health" ? this.health >= this.stats.maxHealth : this.mana >= this.stats.maxMana) return;
        const index = this.inventory.findIndex(item => item.type === "consumable" && item.value === effect && (itemId === undefined || item.id === itemId));
        const item = this.inventory[index];
        if (!item || item.type !== "consumable") return;
        if (item.size === 1) this.inventory.splice(index, 1);
        else this.inventory[index] = Object.freeze({ ...item, size: item.size - 1 });
        if (effect === "health") this.health = Math.min(this.stats.maxHealth, this.health + item.restore * (1 + this.stats.regenBonus));
        else this.mana = Math.min(this.stats.maxMana, this.mana + item.restore);
        this.potionCooldown = CONSUMABLE_COOLDOWN;
        this.inventoryFullNotified = false;
        this.markChanged();
    }

    private movePlayer(input: MovementInput): void {
        if (!input.active) return;
        const length = Math.hypot(input.x, input.z);
        if (length <= 0) return;
        const distance = this.stats.moveSpeed * STEP_SECONDS / Math.max(1, length);
        const dx = input.x * distance;
        const dz = input.z * distance;
        this.playerX += dx;
        this.playerZ += dz;
        this.heading = Math.atan2(dx, dz);
    }

    private spawnEnemies(): void {
        for (const home of this.world.chunks.values()) {
            for (let slot = 0; slot < home.spawns.length; slot += 1) {
                if (home.spawned[slot]) continue;
                home.spawned[slot] = 1;
                const spawn = home.spawns[slot];
                if (Math.hypot(spawn.x - this.playerX, spawn.z - this.playerZ) < 3) continue;
                this.entities.spawnEnemy(spawn, home);
            }
        }
    }

    private reconcileRegions(): void {
        const { enemies, experience, loot, enemy, position, item } = this.entities;
        let cursor = 0;
        while (cursor < enemies.count) {
            const slot = enemies.slots[cursor];
            if (!enemy.homes[slot]!.resident) this.entities.remove(slot);
            else cursor++;
        }
        cursor = 0;
        while (cursor < experience.count) {
            const slot = experience.slots[cursor];
            if (this.world.residencyAt(position.x[slot], position.z[slot]) === "unloaded") this.entities.remove(slot);
            else cursor++;
        }
        cursor = 0;
        while (cursor < loot.count) {
            const slot = loot.slots[cursor];
            if (this.world.residencyAt(position.x[slot], position.z[slot]) === "unloaded") {
                this.groundItems.delete(item.id[slot]); this.entities.remove(slot);
            } else cursor++;
        }
    }

    private updateCurrentRegion(): void {
        const region = this.world.regionAt(this.playerX, this.playerZ, this.currentRegion);
        if (region.x !== this.currentRegion.x || region.z !== this.currentRegion.z) {
            this.currentRegion = region;
            this.nearbyRegions = this.world.nearbyRegions(region);
            this.pushNotice(region.difficulty === "horror" ? "danger" : "info",
                "进入 " + REGION_RULES[region.difficulty].name + " · 地域等级 " + region.level);
        }
    }

    private refreshChests(): void {
        this.chests.count = 0;
        for (const chunk of this.world.chunks.values()) {
            const chest = chunk.chest;
            if (!chest || chunk.chestOpened) continue;
            const index = this.chests.count++;
            this.chests.x[index] = chest.x;
            this.chests.z[index] = chest.z;
            this.chests.tiers[index] = CHEST_TIERS.indexOf(chest.tier);
        }
    }

    private openNearbyChest(): void {
        chestLoop: for (const chunk of this.world.chunks.values()) {
            const chest = chunk.chest;
            if (!chest || chunk.band !== "near" || chunk.chestOpened) continue;
            if (Math.hypot(chest.x - this.playerX, chest.z - this.playerZ) > 0.95) continue;
            const rules = CHEST_RULES[chest.tier];
            // Stage all category/stack changes before consuming chest randomness or IDs.
            // A blocked chest must not consume random state or item IDs.
            const random = this.random.clone();
            let nextId = this.nextItemId;
            const item = generateEquipment(random, nextId++, chest.region.level, this.lootProfile, rules.rarity);
            const clearEquipment = this.shouldAutoClear(item);
            const rewards: InventoryItem[] = [createConsumable(nextId++, chest.region.level, random.chance(0.5) ? "health" : "mana")];
            if (chest.hasOrb) rewards.push(generateOrb(random, nextId++, chest.region.level, rules.rarity));
            if (!clearEquipment) rewards.unshift(item);
            let nextInventory = this.inventory;
            for (const reward of rewards) {
                const next = insertInventoryItem(nextInventory, reward);
                if (!next) { this.notifyInventoryFull(reward.type); break chestLoop; }
                nextInventory = next;
            }
            this.random = random;
            this.nextItemId = nextId;
            this.inventory = nextInventory;
            if (clearEquipment) this.clearedEquipment++;
            this.gold += Math.round(rules.gold * (1 + this.stats.goldBonus));
            chunk.chestOpened = true;
            this.openedChests += 1;
            this.inventoryFullNotified = false;
            this.pushNotice("loot", rules.name + " · " + (clearEquipment ? "较弱装备已清理" : item.name), clearEquipment ? undefined : item.id);
            this.markChanged();
            this.refreshChests();
            break;
        }
    }

    private notifyInventoryFull(type: ItemType): void {
        if (this.inventoryFullNotified) return;
        this.inventoryFullNotified = true;
        this.pushNotice("danger", `${GAME_CONFIG.inventory[type].name}背包空间不足，整理后可拾取物品或开启宝箱`);
    }

    private fireWeapon(): void {
        this.attackCooldown -= STEP_SECONDS;
        if (this.attackCooldown > 0 || this.entities.projectiles.count === MAX_PROJECTILES) return;
        let target = -1;
        let nearest = this.stats.attackRange * this.stats.attackRange;
        const enemies = this.entities.queryNearby(Component.Enemy, this.playerX, this.playerZ, this.stats.attackRange);
        for (let cursor = 0; cursor < enemies.count; cursor += 1) {
            const index = enemies.slots[cursor];
            const dx = this.entities.position.x[index] - this.playerX;
            const dz = this.entities.position.z[index] - this.playerZ;
            const distance = dx * dx + dz * dz;
            if (distance < nearest || (distance === nearest && (target < 0 || this.entities.world.ids[index] < this.entities.world.ids[target]))) {
                nearest = distance;
                target = index;
            }
        }
        if (target < 0) {
            this.attackCooldown = 0;
            return;
        }
        const distance = Math.sqrt(nearest);
        const directionX = distance > 0 ? (this.entities.position.x[target] - this.playerX) / distance : 0;
        const directionZ = distance > 0 ? (this.entities.position.z[target] - this.playerZ) / distance : 1;
        const { critical, damage } = rollAttack(this.stats, this.random);
        const projectileSpeed = 10.5;
        if (this.entities.spawnProjectile(this.entities.world.ids[this.entities.player], Faction.Player,
            this.playerX + directionX * 0.38,
            this.playerZ + directionZ * 0.38,
            directionX * projectileSpeed,
            directionZ * projectileSpeed,
            damage,
            this.stats.attackRange / projectileSpeed + 0.25,
            critical
        )) this.attackCooldown += 1 / this.stats.attackRate;
    }

    private resolveImpacts(): void {
        const { impacts, world, player } = this.entities;
        for (let i = 0; i < impacts.count; i++) {
            if (this.gameOverValue) break;
            const target = world.resolve(impacts.target[i]);
            if (target < 0) continue;
            if (target === player) {
                if (this.damageImmunity <= 0) this.damagePlayer(world.resolve(impacts.source[i]), impacts.damage[i], impacts.elite[i] !== 0, impacts.boss[i] !== 0);
            } else this.hitEnemy(target, impacts.damage[i]);
        }
        impacts.count = 0;
    }

    private hitEnemy(index: number, rolledDamage: number): void {
        const { enemy, action, position } = this.entities;
        if (enemy.kind[index] === EnemyKind.Guard && action.kind[index] < ActorAction.Melee) {
            const dx = this.playerX - position.x[index], dz = this.playerZ - position.z[index], distance = Math.hypot(dx, dz);
            if (distance === 0 || (dx * Math.sin(position.heading[index]) + dz * Math.cos(position.heading[index])) / distance > .5) rolledDamage *= 1 - ENEMY_SPECIAL.guardReduction;
        }
        const elite = this.entities.enemy.elite[index] !== 0;
        const evasion = this.entities.enemy.boss[index] ? ENEMY_HIT_RULES.evasion.boss
            : elite ? ENEMY_HIT_RULES.evasion.elite : ENEMY_HIT_RULES.evasion.normal;
        if (!this.random.chance(Math.max(0, Math.min(1, this.stats.accuracy - evasion)))) return;
        const damage = outgoingDamage(this.stats, rolledDamage, this.entities.vitals.maxHealth[index], elite, this.random.chance(this.stats.lethalChance));
        const healthLost = Math.min(this.entities.vitals.health[index], damage);
        this.entities.vitals.health[index] -= damage;
        this.entities.vitals.hitFlash[index] = 0.1;
        this.health = Math.min(this.stats.maxHealth, this.health + healthLost * this.stats.lifesteal * (1 + this.stats.regenBonus));
        if (this.entities.vitals.health[index] <= 0) {
            this.killEnemy(index);
        }
    }

    private advanceExperience(): void {
        const e = this.entities;
        // Reset only the previous frame's movers, including orbs that just left pickup range.
        for (let i = 0; i < this.movingExperienceCount; i++) {
            const slot = e.world.resolve(this.movingExperience[i]);
            if (slot >= 0) { e.position.previousX[slot] = e.position.x[slot]; e.position.previousZ[slot] = e.position.z[slot]; }
        }
        this.movingExperienceCount = 0;
        const nearby = e.queryNearby(Component.Experience, this.playerX, this.playerZ, this.stats.pickupRadius, false, true);
        for (let cursor = 0; cursor < nearby.count; cursor++) {
            const index = nearby.slots[cursor];
            const x = e.position.x[index], z = e.position.z[index];
            e.position.previousX[index] = x; e.position.previousZ[index] = z;
            const dx = this.playerX - x, dz = this.playerZ - z, distance = Math.hypot(dx, dz);
            const travel = Math.min(distance, (5 + (this.stats.pickupRadius - distance) * 2.2) * STEP_SECONDS);
            if (distance - travel <= .25) {
                this.gainExperience(e.experienceValue[index]); e.remove(index);
            } else {
                e.position.x[index] += dx / distance * travel; e.position.z[index] += dz / distance * travel;
                e.updateSpatial(index, Component.Experience);
                this.movingExperience[this.movingExperienceCount++] = e.world.ids[index];
            }
        }
    }

    private collectEquipment(): void {
        const nearby = this.entities.queryNearby(Component.GroundItem, this.playerX, this.playerZ, .75, false, true);
        for (let cursor = 0; cursor < nearby.count; cursor++) {
            const index = nearby.slots[cursor], id = this.entities.item.id[index];
            const item = this.groundItems.get(id);
            if (!item) throw new Error(`Ground equipment ${id} is missing`);
            const clear = this.shouldAutoClear(item);
            if (!this.storeInventoryItem(item)) { this.notifyInventoryFull(item.type); continue; }
            this.groundItems.delete(id);
            this.entities.remove(index);
            this.inventoryFullNotified = false;
            if (!clear) this.pushNotice("loot", `拾取 ${item.name}`, item.type === "equipment" ? item.id : undefined);
            this.markChanged();
        }
    }

    private damagePlayer(source: number, baseDamage: number, elite: boolean, boss: boolean): void {
        if (this.skills.dashing(this.tickValue)) return;
        this.damageImmunity = .55;
        if (this.random.chance(this.stats.evasion)) return;
        // The current equipment determines the next recovery; later swaps preserve this countdown.
        if (this.shieldCooldown === 0) { this.shieldCooldown = this.stats.shieldRecovery; return; }
        const criticalChance = boss ? ENEMY_HIT_RULES.criticalChance.boss
            : elite ? ENEMY_HIT_RULES.criticalChance.elite : ENEMY_HIT_RULES.criticalChance.normal;
        const critical = this.random.chance(Math.max(0, criticalChance - this.stats.criticalResistance));
        const damage = this.skills.absorb(incomingDamage(this.stats, baseDamage, elite, critical, this.random.chance(this.stats.blockChance)));
        const healthLost = Math.min(this.health, damage);
        this.health = Math.max(0, this.health - damage);
        this.markChanged();
        // A released bolt survives its caster. Reflection requires that same living caster.
        if (source >= 0) {
            const reflection = reflectedDamage(this.stats, healthLost, this.entities.vitals.maxHealth[source]);
            this.entities.vitals.health[source] -= reflection;
            if (this.entities.vitals.health[source] <= 0) this.killEnemy(source);
        }
        if (this.health === 0) { this.gameOverValue = true; this.pushNotice("danger", "你倒在了荒原上"); }
    }

    private killEnemy(index: number): void {
        const x = this.entities.position.x[index], z = this.entities.position.z[index];
        const kind = this.entities.enemy.kind[index] as EnemyKind;
        const elite = this.entities.enemy.elite[index] !== 0;
        const boss = this.entities.enemy.boss[index] !== 0;
        const level = this.entities.enemy.level[index];
        const experience = ENEMY_DEFINITIONS[kind].experience * (1 + (level - 1) * 0.15) * (boss ? 15 : elite ? 2 : 1);
        this.entities.remove(index);
        this.killsValue += 1;
        this.gold += Math.round((boss ? 120 : elite ? 12 : 2) * level * (1 + this.stats.goldBonus));
        this.entities.spawnExperience(x, z, experience);
        if (boss && this.entities.loot.count < MAX_GROUND_EQUIPMENT) {
            this.dropItem(generateOrb(this.random, this.nextItemId++, level, "rare"), x, z);
        }
        const chance = boss ? 1 : elite ? this.lootProfile.eliteDropChance : this.lootProfile.normalDropChance;
        if (this.entities.loot.count < MAX_GROUND_EQUIPMENT && this.random.chance(chance)) {
            this.dropItem(generateEquipment(this.random, this.nextItemId++, level, this.lootProfile, boss ? "legendary" : "common"), x, z);
        }
        if (this.entities.loot.count < MAX_GROUND_EQUIPMENT && this.random.chance(0.14)) {
            this.dropItem(createConsumable(this.nextItemId++, level, this.random.chance(0.6) ? "health" : "mana"), x, z);
        }
        this.markChanged();
    }

    private dropItem(item: InventoryItem, x: number, z: number): void {
        this.entities.spawnLoot(item, x, z);
        this.groundItems.set(item.id, item);
    }

    private gainExperience(amount: number): void {
        this.experience += amount * (1 + this.stats.experienceBonus);
        let levels = 0;
        while (this.experience >= experienceForLevel(this.level)) {
            this.experience -= experienceForLevel(this.level);
            this.level += 1;
            this.unspentAttributePoints += 2;
            this.skills.points += GAME_CONFIG.skills.pointsPerLevel;
            levels += 1;
        }
        if (levels > 0) {
            this.recalculateStats(true);
            this.pushNotice("level", `等级提升至 ${this.level} · 获得 ${levels * 2} 点属性`);
        }
        this.markChanged();
    }

    private calculateStats(): DerivedStats {
        return deriveStats(this.level, this.attributes, sumEquipment(this.equipped));
    }

    private shouldAutoClear(item: InventoryItem): boolean {
        return this.autoClearEquipment && this.canClearEquipment(item);
    }

    private canClearEquipment(item: InventoryItem): boolean {
        return item.type === "equipment" && compareEquipment(item, {
            level: this.level, attributes: this.attributes, equipment: this.equipped, stats: this.stats
        }).canClear;
    }

    private storeInventoryItem(item: InventoryItem): boolean {
        if (this.shouldAutoClear(item)) { this.clearedEquipment++; return true; }
        const next = insertInventoryItem(this.inventory, item);
        if (!next) return false;
        this.inventory = next;
        return true;
    }

    private clearAutoEquipment(): void {
        if (!this.autoClearEquipment) return;
        const before = this.inventory.length;
        this.inventory = this.inventory.filter(item => !this.shouldAutoClear(item));
        this.clearedEquipment += before - this.inventory.length;
        if (this.inventory.length < before) this.inventoryFullNotified = false;
    }

    private recalculateStats(healGrowth: boolean): void {
        const previousMaximum = this.stats.maxHealth;
        const previousMana = this.stats.maxMana;
        this.stats = this.calculateStats();
        this.entities.vitals.maxHealth[this.entities.player] = this.stats.maxHealth;
        // Preserve health ratio when switching gear: low-health swaps cannot manufacture healing.
        this.health = Math.min(this.stats.maxHealth, (previousMaximum === this.stats.maxHealth ? this.health : this.health / previousMaximum * this.stats.maxHealth)
            + (healGrowth ? this.stats.maxHealth * 0.12 * (1 + this.stats.regenBonus) : 0));
        this.mana = this.mana / previousMana * this.stats.maxMana;
        this.clearAutoEquipment();
    }

    private pushNotice(tone: CombatNotice["tone"], message: string, acquiredEquipmentId?: number): void {
        this.notices.push(Object.freeze({ id: this.nextNoticeId++, tone, message, acquiredEquipmentId }));
    }

    private markChanged(): void {
        this.revision += 1;
        this.cachedSnapshot = undefined;
    }
}

const ATTRIBUTE_NAMES: Readonly<Record<AttributeId, string>> = Object.freeze({
    might: "力量",
    vitality: "体魄",
    agility: "敏捷",
    spirit: "精神"
});
