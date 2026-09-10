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
import { compareInventoryItems, createConsumable, isLowLevelEquipment, type InventoryItem, type ConsumableEffect } from "./InventoryItem";

import { CombatWorld, Faction } from "./CombatWorld";
import { EnemyBehavior } from "./EnemyBehavior";
import { SimulationTasks } from "./SimulationTasks";
import type { ProjectileExecutor } from "./ProjectileBatch";
import { advanceProjectiles, moveEnemies, advanceEnemyActions } from "./CombatSystems";
import { ENEMY_DEFINITIONS, type EnemyKind } from "./EnemyDefinitions";
import { MAX_PROJECTILES, MAX_GROUND_EQUIPMENT, INVENTORY_CAPACITY, PULSE_MANA_COST, CONSUMABLE_COOLDOWN } from "./CombatConfig";
import type { CombatRenderState, CombatSnapshot, CombatNotice, PlayerSnapshot, PlayerRenderState, MovementInput, ChestRenderBuffer } from "./CombatState";

const STEP_SECONDS = COMBAT_STEP_MS / 1000;
type MutablePlayerRenderState = { -readonly [Key in keyof PlayerRenderState]: PlayerRenderState[Key] };
class ChestPool implements ChestRenderBuffer {
    public count = 0;
    public readonly tiers = new Uint8Array(MAX_COMBAT_CHUNKS);
    public readonly x = new Float32Array(MAX_COMBAT_CHUNKS);
    public readonly z = new Float32Array(MAX_COMBAT_CHUNKS);
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
    public readonly tasks: SimulationTasks;
    private random: DeterministicRandom;
    private readonly entities: CombatWorld;
    private readonly behavior: EnemyBehavior;
    private readonly groundItems = new Map<number, InventoryItem>();
    private readonly world: RegionalWorld;
    private readonly chests = new ChestPool();
    private currentRegion: RegionInfo;
    private inventory: InventoryItem[] = [];
    private autoClearLowLevelEquipment = false;
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
    private skillCooldown = 0;
    private shieldCooldown = 0;
    private pulseRemaining = 0;
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
        pulse: 0,
        gameOver: false
    };
    private readonly renderState: CombatRenderState;

    constructor(seed: string | number, start = { x: 0, z: 0 }) {
        validatePosition(start.x, start.z);
        this.random = new DeterministicRandom(`${String(seed)}:combat`);
        this.world = new RegionalWorld(seed, start);
        this.entities = new CombatWorld(start.x, start.z);
        this.behavior = new EnemyBehavior(this.entities, this.world);
        this.renderState = { player: this.playerRenderState, chests: this.chests,
            entities: { ids: this.entities.world.ids, enemies: this.entities.enemies, projectiles: this.entities.projectiles,
                experience: this.entities.experience, loot: this.entities.loot, position: this.entities.position,
                vitals: this.entities.vitals, enemy: this.entities.enemy, action: this.entities.action,
                projectile: this.entities.projectile, experienceValue: this.entities.experienceValue, item: this.entities.item } };
        this.currentRegion = this.world.regionAt(start.x, start.z);
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
        if (!Number.isSafeInteger((this.tickValue + 1) * COMBAT_STEP_MS)) {
            throw new RangeError("Combat time exceeds the supported range");
        }
        this.tickValue += 1;
        this.cachedSnapshot = undefined;
        this.previousPlayerX = this.playerX;
        this.previousPlayerZ = this.playerZ;
        this.damageImmunity = Math.max(0, this.damageImmunity - STEP_SECONDS);
        this.shieldCooldown = Math.max(0, this.shieldCooldown - STEP_SECONDS);
        this.pulseRemaining = Math.max(0, this.pulseRemaining - STEP_SECONDS);
        this.potionCooldown = Math.max(0, this.potionCooldown - STEP_SECONDS);
        this.skillCooldown = Math.max(0, this.skillCooldown - STEP_SECONDS);
        this.movePlayer(input);
        const shifted = this.world.synchronize(this.playerX, this.playerZ);
        if (shifted) { this.reconcileRegions(); this.spawnEnemies(); }
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
        if (this.autoCast) this.castSkill();
        this.behavior.update(this.tickValue);
        moveEnemies(this.entities, this.tickValue);
        advanceEnemyActions(this.entities, this.tickValue);
        this.resolveImpacts();
        if (this.gameOverValue) return;
        this.advanceExperience();
        this.collectEquipment();
        this.openNearbyChest();
        if (this.tickValue % 25 === 0) this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.manaRegen);
        if (this.tickValue % 25 === 0 && this.stats.healthRegen > 0 && this.health < this.stats.maxHealth) {
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
            skillRemaining: this.skillCooldown,
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
            autoClearLowLevelEquipment: this.autoClearLowLevelEquipment,
            clearedEquipment: this.clearedEquipment
        });
        const chunks = { active: 0, low: 0, static: 0, total: this.world.chunks.size };
        for (const chunk of this.world.chunks.values()) if (chunk.lod !== "unloaded") chunks[chunk.lod] += 1;
        let boss: CombatSnapshot["boss"];
        const nearbyRegions = this.world.nearbyRegions(this.currentRegion);
        for (let cursor = 0; cursor < this.entities.enemies.count; cursor += 1) {
            const index = this.entities.enemies.slots[cursor];
            const region = this.entities.enemy.regions[index]!;
            if (this.entities.enemy.boss[index] && region.x === this.currentRegion.x && region.z === this.currentRegion.z) {
                boss = Object.freeze({ x: this.entities.position.x[index], z: this.entities.position.z[index], health: this.entities.vitals.health[index], maxHealth: this.entities.vitals.maxHealth[index] });
                break;
            }
        }
        return this.cachedSnapshot = Object.freeze({
            revision: this.revision,
            tick: this.tickValue,
            elapsedMs: this.tickValue * COMBAT_STEP_MS,
            kills: this.killsValue,
            livingEnemies: this.entities.enemies.count,
            groundEquipment: this.entities.loot.count,
            region: this.currentRegion,
            nearbyRegions: Object.freeze(nearbyRegions),
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
        state.pulse = this.pulseRemaining / 0.35;
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
        if (item.kind !== "equipment") return { ok: false, message: "请选择装备" };
        const previous = this.equipped[item.slot];
        this.inventory.splice(index, 1);
        this.equipped = { ...this.equipped, [item.slot]: item };
        this.inventoryFullNotified = false;
        this.recalculateStats(false);
        if (previous) this.storeInventoryItem(previous);
        this.clearLowLevelInventory();
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

    public setAutoClearLowLevelEquipment(enabled: boolean): void {
        if (this.gameOverValue || this.autoClearLowLevelEquipment === enabled) return;
        this.autoClearLowLevelEquipment = enabled;
        this.clearLowLevelInventory();
        this.markChanged();
    }

    public clearInferiorEquipment(): void {
        if (this.gameOverValue) return;
        const before = this.inventory.length;
        this.inventory = this.inventory.filter(item => !this.canClearEquipment(item));
        const cleared = before - this.inventory.length;
        this.clearedEquipment += cleared;
        if (cleared > 0) this.inventoryFullNotified = false;
        this.pushNotice("info", `清理 ${cleared} 件较弱装备 · 提升战力与高评分装备已保留`);
        this.markChanged();
    }

    public equipOrb(itemId: number, socket: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        if (!Number.isInteger(socket) || socket < 0 || socket >= ORB_UNLOCK_LEVELS.length) return { ok: false, message: "无效宝珠槽" };
        if (this.level < ORB_UNLOCK_LEVELS[socket]) return { ok: false, message: "宝珠槽尚未解锁" };
        const index = this.inventory.findIndex(item => item.id === itemId);
        const item = this.inventory[index];
        if (!item || item.kind !== "orb") return { ok: false, message: "背包中没有这颗宝珠" };
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
        if (this.inventory.length === INVENTORY_CAPACITY) { this.notifyInventoryFull(); return; }
        this.inventory.push(item);
        const next = { ...this.equipped };
        delete next[slot];
        this.equipped = next;
        this.recalculateStats(false);
        this.markChanged();
    }

    public removeOrb(socket: number): void {
        const orb = this.orbs[socket];
        if (this.gameOverValue || !orb) return;
        if (this.inventory.length === INVENTORY_CAPACITY) { this.notifyInventoryFull(); return; }
        this.inventory.push(orb);
        this.orbs[socket] = undefined;
        this.lootProfile = lootProfile(sumOrbs(this.orbs));
        this.markChanged();
    }

    public toggleAutoCast(): void {
        if (this.gameOverValue) return;
        this.autoCast = !this.autoCast;
        this.markChanged();
    }

    public castPulse(): void {
        if (this.gameOverValue) return;
        if (this.castSkill(true)) this.markChanged();
    }

    public useConsumable(effect: ConsumableEffect, itemId?: number): void {
        if (this.gameOverValue || this.potionCooldown > 0) return;
        if (effect === "health" ? this.health >= this.stats.maxHealth : this.mana >= this.stats.maxMana) return;
        const index = this.inventory.findIndex(item => item.kind === "consumable" && item.effect === effect && (itemId === undefined || item.id === itemId));
        const item = this.inventory[index];
        if (!item || item.kind !== "consumable") return;
        this.inventory.splice(index, 1);
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
            if (this.world.lodAt(position.x[slot], position.z[slot]) === "unloaded") this.entities.remove(slot);
            else cursor++;
        }
        cursor = 0;
        while (cursor < loot.count) {
            const slot = loot.slots[cursor];
            if (this.world.lodAt(position.x[slot], position.z[slot]) === "unloaded") {
                this.groundItems.delete(item.id[slot]); this.entities.remove(slot);
            } else cursor++;
        }
    }

    private updateCurrentRegion(): void {
        const region = this.world.regionAt(this.playerX, this.playerZ);
        if (region.x !== this.currentRegion.x || region.z !== this.currentRegion.z) {
            this.currentRegion = region;
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
        for (const chunk of this.world.chunks.values()) {
            const chest = chunk.chest;
            if (!chest || chunk.lod !== "active" || chunk.chestOpened) continue;
            if (Math.hypot(chest.x - this.playerX, chest.z - this.playerZ) > 0.95) continue;
            const rules = CHEST_RULES[chest.tier];
            // Stage the actual reward before checking capacity: a low-level roll may be an upgrade.
            // A blocked chest must not consume random state or item IDs.
            const random = this.random.clone();
            let nextId = this.nextItemId;
            const item = generateEquipment(random, nextId++, chest.region.level, this.lootProfile, rules.rarity);
            const clearEquipment = this.shouldAutoClear(item);
            const rewards: InventoryItem[] = [createConsumable(nextId++, chest.region.level, random.chance(0.5) ? "health" : "mana")];
            if (chest.hasOrb) rewards.push(generateOrb(random, nextId++, chest.region.level, rules.rarity));
            if (this.inventory.length + rewards.length + Number(!clearEquipment) > INVENTORY_CAPACITY) {
                this.notifyInventoryFull();
                break;
            }
            this.random = random;
            this.nextItemId = nextId;
            this.storeInventoryItem(item);
            this.inventory.push(...rewards);
            this.gold += Math.round(rules.gold * (1 + this.stats.goldBonus));
            chunk.chestOpened = true;
            this.openedChests += 1;
            this.inventoryFullNotified = false;
            this.pushNotice("loot", rules.name + " · " + (clearEquipment ? "较弱低级装备已清理" : item.name), clearEquipment ? undefined : item.id);
            this.markChanged();
            break;
        }
        this.refreshChests();
    }

    private notifyInventoryFull(): void {
        if (this.inventoryFullNotified) return;
        this.inventoryFullNotified = true;
        this.pushNotice("danger", "背包空间不足，清理后可拾取物品或开启宝箱");
    }

    private fireWeapon(): void {
        this.attackCooldown -= STEP_SECONDS;
        if (this.attackCooldown > 0 || this.entities.projectiles.count === MAX_PROJECTILES) return;
        let target = -1;
        let nearest = this.stats.attackRange * this.stats.attackRange;
        for (let cursor = 0; cursor < this.entities.enemies.count; cursor += 1) {
            const index = this.entities.enemies.slots[cursor];
            const dx = this.entities.position.x[index] - this.playerX;
            const dz = this.entities.position.z[index] - this.playerZ;
            const distance = dx * dx + dz * dz;
            if (distance < nearest || (distance === nearest && target >= 0 && this.entities.world.ids[index] < this.entities.world.ids[target])) {
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

    private castSkill(force = false): boolean {
        if (this.skillCooldown > 0 || this.mana < PULSE_MANA_COST) return false;
        const { enemies, position, impacts, world, player } = this.entities;
        let hit = false;
        for (let cursor = 0; cursor < enemies.count; cursor++) {
            const slot = enemies.slots[cursor];
            if (Math.hypot(position.x[slot] - this.playerX, position.z[slot] - this.playerZ) > 3.2 + position.radius[slot]) continue;
            hit = true;
            impacts.add(world.ids[player], world.ids[slot], rollAttack(this.stats, this.random, 1.3).damage);
        }
        this.resolveImpacts();
        if (hit || force) {
            this.mana -= PULSE_MANA_COST;
            this.skillCooldown = this.stats.skillInterval;
            this.pulseRemaining = 0.35;
            return true;
        }
        return false;
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
        const elite = this.entities.enemy.elite[index] !== 0;
        const evasion = this.entities.enemy.boss[index] ? 0.08 : elite ? 0.05 : 0.02;
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
        let cursor = 0;
        while (cursor < this.entities.experience.count) {
            const index = this.entities.experience.slots[cursor];
            const x = this.entities.position.x[index];
            const z = this.entities.position.z[index];
            this.entities.position.previousX[index] = x;
            this.entities.position.previousZ[index] = z;
            let dx = this.playerX - x;
            let dz = this.playerZ - z;
            let distance = Math.hypot(dx, dz);
            if (distance <= this.stats.pickupRadius) {
                if (distance > 0) {
                    dx /= distance;
                    dz /= distance;
                    const travel = Math.min(distance, (5 + (this.stats.pickupRadius - distance) * 2.2) * STEP_SECONDS);
                    this.entities.position.x[index] += dx * travel;
                    this.entities.position.z[index] += dz * travel;
                    distance -= travel;
                }
                if (distance <= 0.25) {
                    this.gainExperience(this.entities.experienceValue[index]);
                    this.entities.remove(index);
                    continue;
                }
            }
            cursor += 1;
        }
    }

    private collectEquipment(): void {
        let cursor = 0;
        while (cursor < this.entities.loot.count) {
            const index = this.entities.loot.slots[cursor];
            const dx = this.playerX - this.entities.position.x[index];
            const dz = this.playerZ - this.entities.position.z[index];
            if (dx * dx + dz * dz > 0.75 * 0.75) {
                cursor += 1;
                continue;
            }
            const id = this.entities.item.id[index];
            const item = this.groundItems.get(id);
            if (!item) throw new Error(`Ground equipment ${id} is missing`);
            const clear = this.shouldAutoClear(item);
            if (!clear && this.inventory.length === INVENTORY_CAPACITY) {
                this.notifyInventoryFull();
                cursor += 1;
                continue;
            }
            this.groundItems.delete(id);
            this.storeInventoryItem(item);
            this.entities.remove(index);
            this.inventoryFullNotified = false;
            if (!clear) this.pushNotice("loot", `拾取 ${item.name}`, item.kind === "equipment" ? item.id : undefined);
            this.markChanged();
        }
    }

    private damagePlayer(source: number, baseDamage: number, elite: boolean, boss: boolean): void {
        this.damageImmunity = .55;
        if (this.random.chance(this.stats.evasion)) return;
        if (this.shieldCooldown === 0) { this.shieldCooldown = this.stats.shieldRecovery; return; }
        const criticalChance = boss ? .22 : elite ? .14 : .06;
        const critical = this.random.chance(Math.max(0, criticalChance - this.stats.criticalResistance));
        const damage = incomingDamage(this.stats, baseDamage, elite, critical, this.random.chance(this.stats.blockChance));
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
            levels += 1;
        }
        if (levels > 0) {
            this.recalculateStats(true);
            this.clearLowLevelInventory();
            this.pushNotice("level", `等级提升至 ${this.level} · 获得 ${levels * 2} 点属性`);
        }
        this.markChanged();
    }

    private calculateStats(): DerivedStats {
        return deriveStats(this.level, this.attributes, sumEquipment(this.equipped));
    }

    private shouldAutoClear(item: InventoryItem): boolean {
        return this.autoClearLowLevelEquipment && isLowLevelEquipment(item, this.level) && this.canClearEquipment(item);
    }

    private canClearEquipment(item: InventoryItem): boolean {
        return item.kind === "equipment" && compareEquipment(item, {
            level: this.level, attributes: this.attributes, equipment: this.equipped, stats: this.stats
        }).canClear;
    }

    /** Callers reserve capacity for kept items before beginning their inventory transaction. */
    private storeInventoryItem(item: InventoryItem): void {
        if (this.shouldAutoClear(item)) this.clearedEquipment += 1;
        else this.inventory.push(item);
    }

    private clearLowLevelInventory(): void {
        if (!this.autoClearLowLevelEquipment) return;
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
        this.shieldCooldown = Math.min(this.shieldCooldown, this.stats.shieldRecovery);
        this.skillCooldown = Math.min(this.skillCooldown, this.stats.skillInterval);
        this.mana = this.mana / previousMana * this.stats.maxMana;
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
