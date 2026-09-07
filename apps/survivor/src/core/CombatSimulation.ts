import {
    ATTRIBUTE_IDS,
    RARITIES,
    createStarterEquipment,
    generateEquipment,
    sumEquipment,
    type AttributeId,
    type Attributes,
    type EquippedItems
} from "./Equipment";
import { DeterministicRandom } from "./DeterministicRandom";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import { deriveStats, incomingDamage, outgoingDamage, reflectedDamage, rollAttack, type DerivedStats } from "./CombatStats";
import {
    RegionalWorld, MAX_COMBAT_CHUNKS, LOW_FREQUENCY_TICKS,
    REGION_RULES, CHEST_RULES, CHEST_TIERS, type RegionalChunk, type RegionInfo
} from "./RegionalWorld";
import { lootProfile, BASE_LOOT_PROFILE, type LootProfile } from "./Loot";
import { ORB_UNLOCK_LEVELS, generateOrb, sumOrbs, type Orb } from "./Orbs";
import { compareInventoryItems, createConsumable, isLowLevelEquipment, type InventoryItem, type ConsumableEffect } from "./InventoryItem";

export const MAX_ENEMIES = 640;
export const MAX_PROJECTILES = 128;
export const MAX_EXPERIENCE_ORBS = 768;
export const MAX_GROUND_EQUIPMENT = 64;
export const INVENTORY_CAPACITY = 40;

const STEP_SECONDS = COMBAT_STEP_MS / 1000;
const PLAYER_RADIUS = 0.3;
const ENEMY_LEASH_DISTANCE = 14;
export const PULSE_MANA_COST = 18;
export const CONSUMABLE_COOLDOWN = 4;

export type EnemyKind = 0 | 1 | 2 | 3;

interface EnemyDefinition {
    readonly health: number;
    readonly speed: number;
    readonly damage: number;
    readonly radius: number;
    readonly experience: number;
}

const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
    Object.freeze({ health: 22, speed: 1.18, damage: 7, radius: 0.3, experience: 6 }),
    Object.freeze({ health: 17, speed: 1.72, damage: 6, radius: 0.25, experience: 7 }),
    Object.freeze({ health: 70, speed: 0.72, damage: 15, radius: 0.46, experience: 16 }),
    Object.freeze({ health: 44, speed: 1.34, damage: 11, radius: 0.34, experience: 12 })
]);

export interface MovementInput {
    readonly x: number;
    readonly z: number;
    readonly active: boolean;
}

export interface PlayerSnapshot {
    readonly mana: number;
    readonly x: number;
    readonly z: number;
    readonly health: number;
    readonly level: number;
    readonly experience: number;
    readonly experienceToLevel: number;
    readonly unspentAttributePoints: number;
    readonly gold: number;
    readonly shieldRemaining: number;
    readonly skillRemaining: number;
    readonly potionRemaining: number;
    readonly autoCast: boolean;
    readonly orbs: readonly (Orb | undefined)[];
    readonly lootProfile: LootProfile;
    readonly attributes: Attributes;
    readonly stats: DerivedStats;
    readonly equipment: EquippedItems;
    readonly inventory: readonly InventoryItem[];
    readonly autoClearLowLevelEquipment: boolean;
    readonly clearedEquipment: number;
}

export interface CombatSnapshot {
    readonly revision: number;
    readonly tick: number;
    readonly elapsedMs: number;
    readonly kills: number;
    readonly livingEnemies: number;
    readonly groundEquipment: number;
    readonly region: RegionInfo;
    readonly nearbyRegions: readonly RegionInfo[];
    readonly chunks: Readonly<{ active: number; low: number; static: number; total: number }>;
    readonly openedChests: number;
    readonly boss: Readonly<{ x: number; z: number; health: number; maxHealth: number }> | undefined;
    readonly gameOver: boolean;
    readonly player: PlayerSnapshot;
}

export interface CombatNotice {
    readonly id: number;
    readonly tone: "info" | "loot" | "level" | "danger";
    readonly message: string;
}

export interface PlayerRenderState {
    readonly animationTime: number;
    readonly x: number;
    readonly z: number;
    readonly previousX: number;
    readonly previousZ: number;
    readonly heading: number;
    readonly healthRatio: number;
    readonly invulnerable: boolean;
    readonly shieldReady: boolean;
    readonly pulse: number;
    readonly gameOver: boolean;
}

export interface EnemyRenderBuffer {
    readonly count: number;
    readonly ids: Uint32Array;
    readonly kinds: Uint8Array;
    readonly elite: Uint8Array;
    readonly boss: Uint8Array;
    readonly active: Uint8Array;
    readonly level: Uint32Array;
    readonly health: Float32Array;
    readonly maxHealth: Float32Array;
    readonly x: Float32Array;
    readonly z: Float32Array;
    readonly previousX: Float32Array;
    readonly previousZ: Float32Array;
    readonly radius: Float32Array;
    readonly hitFlash: Float32Array;
}

export interface ProjectileRenderBuffer {
    readonly count: number;
    readonly critical: Uint8Array;
    readonly x: Float32Array;
    readonly z: Float32Array;
    readonly previousX: Float32Array;
    readonly previousZ: Float32Array;
}

export interface ExperienceRenderBuffer {
    readonly count: number;
    readonly x: Float32Array;
    readonly z: Float32Array;
    readonly previousX: Float32Array;
    readonly previousZ: Float32Array;
    readonly value: Float32Array;
}

export interface LootRenderBuffer {
    readonly count: number;
    readonly itemIds: Uint32Array;
    readonly rarities: Uint8Array;
    readonly kinds: Uint8Array;
    readonly x: Float32Array;
    readonly z: Float32Array;
}

export interface CombatRenderState {
    readonly player: PlayerRenderState;
    readonly enemies: EnemyRenderBuffer;
    readonly projectiles: ProjectileRenderBuffer;
    readonly experience: ExperienceRenderBuffer;
    readonly loot: LootRenderBuffer;
    readonly chests: ChestRenderBuffer;
}

export interface ChestRenderBuffer {
    readonly count: number;
    readonly tiers: Uint8Array;
    readonly x: Float32Array;
    readonly z: Float32Array;
}

class ChestPool implements ChestRenderBuffer {
    public count = 0;
    public readonly tiers = new Uint8Array(MAX_COMBAT_CHUNKS);
    public readonly x = new Float32Array(MAX_COMBAT_CHUNKS);
    public readonly z = new Float32Array(MAX_COMBAT_CHUNKS);
}

type MutablePlayerRenderState = { -readonly [Key in keyof PlayerRenderState]: PlayerRenderState[Key] };

class EnemyPool implements EnemyRenderBuffer {
    public count = 0;
    public readonly ids = new Uint32Array(MAX_ENEMIES);
    public readonly kinds = new Uint8Array(MAX_ENEMIES);
    public readonly elite = new Uint8Array(MAX_ENEMIES);
    public readonly boss = new Uint8Array(MAX_ENEMIES);
    public readonly active = new Uint8Array(MAX_ENEMIES);
    public readonly homes: (RegionalChunk | undefined)[] = new Array(MAX_ENEMIES);
    public readonly maxHealth = new Float32Array(MAX_ENEMIES);
    public readonly level = new Uint32Array(MAX_ENEMIES);
    public readonly regions: (RegionInfo | undefined)[] = new Array(MAX_ENEMIES);
    public readonly homeX = new Float32Array(MAX_ENEMIES);
    public readonly homeZ = new Float32Array(MAX_ENEMIES);
    public readonly x = new Float32Array(MAX_ENEMIES);
    public readonly z = new Float32Array(MAX_ENEMIES);
    public readonly previousX = new Float32Array(MAX_ENEMIES);
    public readonly previousZ = new Float32Array(MAX_ENEMIES);
    public readonly health = new Float32Array(MAX_ENEMIES);
    public readonly radius = new Float32Array(MAX_ENEMIES);
    public readonly speed = new Float32Array(MAX_ENEMIES);
    public readonly damage = new Float32Array(MAX_ENEMIES);
    public readonly hitFlash = new Float32Array(MAX_ENEMIES);

    public add(id: number, kind: EnemyKind, elite: boolean, boss: boolean, x: number, z: number,
        definition: EnemyDefinition, scale: number, home: RegionalChunk, region: RegionInfo, level: number): boolean {
        if (this.count === MAX_ENEMIES) return false;
        const index = this.count++;
        this.ids[index] = id;
        this.kinds[index] = kind;
        this.elite[index] = Number(elite);
        this.boss[index] = Number(boss);
        this.active[index] = Number(home.lod === "active");
        this.homes[index] = home;
        this.regions[index] = region;
        this.level[index] = level;
        this.homeX[index] = x;
        this.homeZ[index] = z;
        this.x[index] = this.previousX[index] = x;
        this.z[index] = this.previousZ[index] = z;
        this.health[index] = this.maxHealth[index] = definition.health * scale * (boss ? 16 : elite ? 4 : 1);
        this.radius[index] = definition.radius * (boss ? 2.5 : elite ? 1.28 : 1);
        this.speed[index] = definition.speed * Math.min(1.35, 1 + (scale - 1) * 0.08);
        this.damage[index] = definition.damage * Math.sqrt(scale) * (boss ? 2.5 : elite ? 1.55 : 1);
        this.hitFlash[index] = 0;
        return true;
    }

    public remove(index: number): void {
        const last = --this.count;
        if (index === last) { this.homes[last] = this.regions[last] = undefined; return; }
        this.ids[index] = this.ids[last];
        this.kinds[index] = this.kinds[last];
        this.elite[index] = this.elite[last];
        this.boss[index] = this.boss[last];
        this.active[index] = this.active[last];
        this.maxHealth[index] = this.maxHealth[last];
        this.homes[index] = this.homes[last];
        this.homes[last] = undefined;
        this.regions[index] = this.regions[last];
        this.regions[last] = undefined;
        this.level[index] = this.level[last];
        this.homeX[index] = this.homeX[last];
        this.homeZ[index] = this.homeZ[last];
        this.x[index] = this.x[last];
        this.z[index] = this.z[last];
        this.previousX[index] = this.previousX[last];
        this.previousZ[index] = this.previousZ[last];
        this.health[index] = this.health[last];
        this.radius[index] = this.radius[last];
        this.speed[index] = this.speed[last];
        this.damage[index] = this.damage[last];
        this.hitFlash[index] = this.hitFlash[last];
    }
}

class ProjectilePool implements ProjectileRenderBuffer {
    public count = 0;
    public readonly critical = new Uint8Array(MAX_PROJECTILES);
    public readonly x = new Float32Array(MAX_PROJECTILES);
    public readonly z = new Float32Array(MAX_PROJECTILES);
    public readonly previousX = new Float32Array(MAX_PROJECTILES);
    public readonly previousZ = new Float32Array(MAX_PROJECTILES);
    public readonly velocityX = new Float32Array(MAX_PROJECTILES);
    public readonly velocityZ = new Float32Array(MAX_PROJECTILES);
    public readonly damage = new Float32Array(MAX_PROJECTILES);
    public readonly lifetime = new Float32Array(MAX_PROJECTILES);

    public add(x: number, z: number, velocityX: number, velocityZ: number, damage: number, lifetime: number, critical: boolean): boolean {
        if (this.count === MAX_PROJECTILES) return false;
        const index = this.count++;
        this.x[index] = this.previousX[index] = x;
        this.z[index] = this.previousZ[index] = z;
        this.velocityX[index] = velocityX;
        this.velocityZ[index] = velocityZ;
        this.damage[index] = damage;
        this.lifetime[index] = lifetime;
        this.critical[index] = Number(critical);
        return true;
    }

    public remove(index: number): void {
        const last = --this.count;
        if (index === last) return;
        this.critical[index] = this.critical[last];
        this.x[index] = this.x[last];
        this.z[index] = this.z[last];
        this.previousX[index] = this.previousX[last];
        this.previousZ[index] = this.previousZ[last];
        this.velocityX[index] = this.velocityX[last];
        this.velocityZ[index] = this.velocityZ[last];
        this.damage[index] = this.damage[last];
        this.lifetime[index] = this.lifetime[last];
    }
}

class ExperiencePool implements ExperienceRenderBuffer {
    public count = 0;
    public readonly x = new Float32Array(MAX_EXPERIENCE_ORBS);
    public readonly z = new Float32Array(MAX_EXPERIENCE_ORBS);
    public readonly previousX = new Float32Array(MAX_EXPERIENCE_ORBS);
    public readonly previousZ = new Float32Array(MAX_EXPERIENCE_ORBS);
    public readonly value = new Float32Array(MAX_EXPERIENCE_ORBS);

    public add(x: number, z: number, value: number): void {
        if (this.count === MAX_EXPERIENCE_ORBS) {
            // Capacity never deletes earned XP: overflow coalesces into the first active orb.
            this.value[0] += value;
            return;
        }
        const index = this.count++;
        this.x[index] = this.previousX[index] = x;
        this.z[index] = this.previousZ[index] = z;
        this.value[index] = value;
    }

    public remove(index: number): void {
        const last = --this.count;
        if (index === last) return;
        this.x[index] = this.x[last];
        this.z[index] = this.z[last];
        this.previousX[index] = this.previousX[last];
        this.previousZ[index] = this.previousZ[last];
        this.value[index] = this.value[last];
    }
}

class LootPool implements LootRenderBuffer {
    public count = 0;
    public readonly itemIds = new Uint32Array(MAX_GROUND_EQUIPMENT);
    public readonly rarities = new Uint8Array(MAX_GROUND_EQUIPMENT);
    public readonly kinds = new Uint8Array(MAX_GROUND_EQUIPMENT);
    public readonly x = new Float32Array(MAX_GROUND_EQUIPMENT);
    public readonly z = new Float32Array(MAX_GROUND_EQUIPMENT);

    public add(item: InventoryItem, x: number, z: number): boolean {
        if (this.count === MAX_GROUND_EQUIPMENT) return false;
        const index = this.count++;
        this.itemIds[index] = item.id;
        this.rarities[index] = RARITIES.indexOf(item.rarity);
        this.kinds[index] = item.kind === "orb" ? 1 : item.kind === "consumable" ? 2 : 0;
        this.x[index] = x;
        this.z[index] = z;
        return true;
    }

    public remove(index: number): void {
        const last = --this.count;
        if (index === last) return;
        this.itemIds[index] = this.itemIds[last];
        this.rarities[index] = this.rarities[last];
        this.kinds[index] = this.kinds[last];
        this.x[index] = this.x[last];
        this.z[index] = this.z[last];
    }
}

export function experienceForLevel(level: number): number {
    return Math.round(20 + level * 18 + level * level);
}

function segmentDistanceSquared(
    pointX: number,
    pointZ: number,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number
): number {
    const dx = endX - startX;
    const dz = endZ - startZ;
    const lengthSquared = dx * dx + dz * dz;
    const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        ((pointX - startX) * dx + (pointZ - startZ) * dz) / lengthSquared));
    const x = startX + dx * amount - pointX;
    const z = startZ + dz * amount - pointZ;
    return x * x + z * z;
}

function validatePosition(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Combat position must be finite");
}

/**
 * Authoritative deterministic combat. High-cardinality entities stay in
 * packed typed arrays; equipment remains object data because it changes rarely.
 */
export class CombatSimulation {
    private readonly random: DeterministicRandom;
    private readonly enemies = new EnemyPool();
    private readonly projectiles = new ProjectilePool();
    private readonly experienceOrbs = new ExperiencePool();
    private readonly loot = new LootPool();
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
    private nextEntityId = 1;
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
    private playerX: number;
    private playerZ: number;
    private previousPlayerX: number;
    private previousPlayerZ: number;
    private heading = 0;
    private health: number;
    private mana: number;
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
    private readonly renderState: CombatRenderState = {
        player: this.playerRenderState,
        enemies: this.enemies,
        projectiles: this.projectiles,
        experience: this.experienceOrbs,
        loot: this.loot,
        chests: this.chests
    };

    constructor(seed: string | number, start = { x: 0, z: 0 }) {
        validatePosition(start.x, start.z);
        this.random = new DeterministicRandom(`${String(seed)}:combat`);
        this.world = new RegionalWorld(seed, start);
        this.currentRegion = this.world.regionAt(start.x, start.z);
        this.playerX = this.previousPlayerX = start.x;
        this.playerZ = this.previousPlayerZ = start.z;
        this.stats = this.calculateStats();
        this.health = this.stats.maxHealth;
        this.mana = this.stats.maxMana;
        this.world.synchronize(start.x, start.z);
        this.spawnEnemies();
        this.refreshChests();
    }

    public get tick(): number { return this.tickValue; }
    public get gameOver(): boolean { return this.gameOverValue; }

    public step(input: MovementInput): void {
        if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.z)) {
            throw new RangeError("Movement input must contain finite coordinates");
        }
        if (this.gameOverValue) return;
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
        this.updateCurrentRegion();
        this.fireWeapon();
        this.advanceProjectiles();
        if (this.autoCast) this.castSkill();
        this.advanceEnemies();
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
            equipment,
            inventory: Object.freeze([...this.inventory]),
            autoClearLowLevelEquipment: this.autoClearLowLevelEquipment,
            clearedEquipment: this.clearedEquipment
        });
        const chunks = { active: 0, low: 0, static: 0, total: this.world.chunks.size };
        for (const chunk of this.world.chunks.values()) if (chunk.lod !== "unloaded") chunks[chunk.lod] += 1;
        let boss: CombatSnapshot["boss"];
        const nearbyRegions = this.world.nearbyRegions(this.currentRegion);
        for (let index = 0; index < this.enemies.count; index += 1) {
            const region = this.enemies.regions[index]!;
            if (this.enemies.boss[index] && region.x === this.currentRegion.x && region.z === this.currentRegion.z) {
                boss = Object.freeze({ x: this.enemies.x[index], z: this.enemies.z[index], health: this.enemies.health[index], maxHealth: this.enemies.maxHealth[index] });
                break;
            }
        }
        return this.cachedSnapshot = Object.freeze({
            revision: this.revision,
            tick: this.tickValue,
            elapsedMs: this.tickValue * COMBAT_STEP_MS,
            kills: this.killsValue,
            livingEnemies: this.enemies.count,
            groundEquipment: this.loot.count,
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
        if (previous) this.storeInventoryItem(previous);
        this.equipped = { ...this.equipped, [item.slot]: item };
        this.inventoryFullNotified = false;
        this.recalculateStats(false);
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
        if (!this.shouldAutoClear(item) && this.inventory.length === INVENTORY_CAPACITY) { this.notifyInventoryFull(); return; }
        this.storeInventoryItem(item);
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
                const scale = REGION_RULES[spawn.region.difficulty].scale * (1 + (spawn.level - 1) * 0.15);
                if (!this.enemies.add(this.nextEntityId++, spawn.kind, spawn.elite, spawn.boss, spawn.x, spawn.z,
                    ENEMY_DEFINITIONS[spawn.kind], scale, home, spawn.region, spawn.level)) {
                    throw new Error("Regional population exceeds the enemy pool budget");
                }
            }
        }
    }

    private reconcileRegions(): void {
        let index = 0;
        while (index < this.enemies.count) {
            if (!this.enemies.homes[index]!.resident) this.enemies.remove(index);
            else index += 1;
        }
        index = 0;
        while (index < this.experienceOrbs.count) {
            if (this.world.lodAt(this.experienceOrbs.x[index], this.experienceOrbs.z[index]) === "unloaded") this.experienceOrbs.remove(index);
            else index += 1;
        }
        index = 0;
        while (index < this.loot.count) {
            if (this.world.lodAt(this.loot.x[index], this.loot.z[index]) === "unloaded") {
                this.groundItems.delete(this.loot.itemIds[index]);
                this.loot.remove(index);
            } else index += 1;
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
            if (!chest || chunk.lod !== "active" || chunk.chestOpened) continue;
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
            const clearEquipment = this.autoClearLowLevelEquipment && chest.region.level < this.level;
            const rewardCount = (chest.hasOrb ? 3 : 2) - Number(clearEquipment);
            if (this.inventory.length + rewardCount > INVENTORY_CAPACITY) {
                this.notifyInventoryFull();
                break;
            }
            const rules = CHEST_RULES[chest.tier];
            const item = generateEquipment(this.random, this.nextItemId++, chest.region.level, this.lootProfile, rules.rarity);
            this.storeInventoryItem(item);
            this.inventory.push(createConsumable(this.nextItemId++, chest.region.level, this.random.chance(0.5) ? "health" : "mana"));
            if (chest.hasOrb) this.inventory.push(generateOrb(this.random, this.nextItemId++, chest.region.level, rules.rarity));
            this.gold += Math.round(rules.gold * (1 + this.stats.goldBonus));
            chunk.chestOpened = true;
            this.openedChests += 1;
            this.inventoryFullNotified = false;
            this.pushNotice("loot", rules.name + " · " + (clearEquipment ? "低级装备已清理" : item.name));
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
        if (this.attackCooldown > 0 || this.projectiles.count === MAX_PROJECTILES) return;
        let target = -1;
        let nearest = this.stats.attackRange * this.stats.attackRange;
        for (let index = 0; index < this.enemies.count; index += 1) {
            const dx = this.enemies.x[index] - this.playerX;
            const dz = this.enemies.z[index] - this.playerZ;
            const distance = dx * dx + dz * dz;
            if (distance < nearest) {
                nearest = distance;
                target = index;
            }
        }
        if (target < 0) {
            this.attackCooldown = 0;
            return;
        }
        const distance = Math.sqrt(nearest);
        const directionX = distance > 0 ? (this.enemies.x[target] - this.playerX) / distance : 0;
        const directionZ = distance > 0 ? (this.enemies.z[target] - this.playerZ) / distance : 1;
        const { critical, damage } = rollAttack(this.stats, this.random);
        const projectileSpeed = 10.5;
        if (this.projectiles.add(
            this.playerX + directionX * 0.38,
            this.playerZ + directionZ * 0.38,
            directionX * projectileSpeed,
            directionZ * projectileSpeed,
            damage,
            this.stats.attackRange / projectileSpeed + 0.25,
            critical
        )) this.attackCooldown += 1 / this.stats.attackRate;
    }

    private advanceProjectiles(): void {
        let projectile = 0;
        while (projectile < this.projectiles.count) {
            const startX = this.projectiles.x[projectile];
            const startZ = this.projectiles.z[projectile];
            this.projectiles.previousX[projectile] = startX;
            this.projectiles.previousZ[projectile] = startZ;
            const endX = startX + this.projectiles.velocityX[projectile] * STEP_SECONDS;
            const endZ = startZ + this.projectiles.velocityZ[projectile] * STEP_SECONDS;
            this.projectiles.x[projectile] = endX;
            this.projectiles.z[projectile] = endZ;
            this.projectiles.lifetime[projectile] -= STEP_SECONDS;
            let hit = -1;
            for (let enemy = 0; enemy < this.enemies.count; enemy += 1) {
                const radius = this.enemies.radius[enemy] + 0.11;
                if (segmentDistanceSquared(this.enemies.x[enemy], this.enemies.z[enemy], startX, startZ, endX, endZ) <= radius * radius) {
                    hit = enemy;
                    break;
                }
            }
            if (hit >= 0) {
                this.hitEnemy(hit, this.projectiles.damage[projectile]);
                this.projectiles.remove(projectile);
                continue;
            }
            if (this.projectiles.lifetime[projectile] <= 0) {
                this.projectiles.remove(projectile);
                continue;
            }
            projectile += 1;
        }
    }

    private advanceEnemies(): void {
        const seconds = this.tickValue * STEP_SECONDS;
        let index = 0;
        while (index < this.enemies.count && !this.gameOverValue) {
            const x = this.enemies.x[index];
            const z = this.enemies.z[index];
            this.enemies.previousX[index] = x;
            this.enemies.previousZ[index] = z;
            this.enemies.hitFlash[index] = Math.max(0, this.enemies.hitFlash[index] - STEP_SECONDS);
            const lod = this.world.lodAt(x, z);
            this.enemies.active[index] = Number(lod === "active");
            if (lod === "unloaded") {
                this.retireEnemy(index);
                continue;
            }
            if (lod === "static" || (lod === "low" && this.tickValue % LOW_FREQUENCY_TICKS !== this.enemies.ids[index] % LOW_FREQUENCY_TICKS)) {
                index += 1;
                continue;
            }
            const homeX = this.enemies.homeX[index];
            const homeZ = this.enemies.homeZ[index];
            const pursuing = lod === "active" && Math.hypot(this.playerX - homeX, this.playerZ - homeZ) <= ENEMY_LEASH_DISTANCE;
            let dx = (pursuing ? this.playerX : homeX) - x;
            let dz = (pursuing ? this.playerZ : homeZ) - z;
            const distance = Math.hypot(dx, dz);
            if (distance > 0) {
                dx /= distance;
                dz /= distance;
                const weave = pursuing ? Math.sin(seconds * 1.2 + this.enemies.ids[index] * 0.73) * 0.08 : 0;
                const delta = STEP_SECONDS * (lod === "low" ? LOW_FREQUENCY_TICKS : 1);
                const speed = Math.min(distance, this.enemies.speed[index] * delta);
                this.enemies.x[index] += (dx - dz * weave) * speed;
                this.enemies.z[index] += (dz + dx * weave) * speed;
            }
            if (lod === "low") {
                this.enemies.previousX[index] = this.enemies.x[index];
                this.enemies.previousZ[index] = this.enemies.z[index];
            }
            const contact = this.enemies.radius[index] + PLAYER_RADIUS;
            if (pursuing && Math.hypot(this.playerX - this.enemies.x[index], this.playerZ - this.enemies.z[index]) <= contact) {
                if (this.damageImmunity <= 0 && this.damagePlayer(index)) continue;
                this.enemies.x[index] -= dx * 0.12;
                this.enemies.z[index] -= dz * 0.12;
            }
            index += 1;
        }
    }

    private retireEnemy(index: number): void {
        // A consumed population slot stays empty until its whole chunk is unloaded.
        this.enemies.remove(index);
    }

    private castSkill(force = false): boolean {
        if (this.skillCooldown > 0 || this.mana < PULSE_MANA_COST) return false;
        let hit = false;
        let index = 0;
        while (index < this.enemies.count) {
            const radius = 3.2 + this.enemies.radius[index];
            if (Math.hypot(this.enemies.x[index] - this.playerX, this.enemies.z[index] - this.playerZ) > radius) {
                index += 1;
                continue;
            }
            hit = true;
            if (!this.hitEnemy(index, rollAttack(this.stats, this.random, 1.3).damage)) index += 1;
        }
        if (hit || force) {
            this.mana -= PULSE_MANA_COST;
            this.skillCooldown = this.stats.skillInterval;
            this.pulseRemaining = 0.35;
            return true;
        }
        return false;
    }

    private hitEnemy(index: number, rolledDamage: number): boolean {
        const elite = this.enemies.elite[index] !== 0;
        const evasion = this.enemies.boss[index] ? 0.08 : elite ? 0.05 : 0.02;
        if (!this.random.chance(Math.max(0, Math.min(1, this.stats.accuracy - evasion)))) return false;
        const damage = outgoingDamage(this.stats, rolledDamage, this.enemies.maxHealth[index], elite, this.random.chance(this.stats.lethalChance));
        const healthLost = Math.min(this.enemies.health[index], damage);
        this.enemies.health[index] -= damage;
        this.enemies.hitFlash[index] = 0.1;
        this.health = Math.min(this.stats.maxHealth, this.health + healthLost * this.stats.lifesteal * (1 + this.stats.regenBonus));
        if (this.enemies.health[index] <= 0) {
            this.killEnemy(index);
            return true;
        }
        return false;
    }

    private advanceExperience(): void {
        let index = 0;
        while (index < this.experienceOrbs.count) {
            const x = this.experienceOrbs.x[index];
            const z = this.experienceOrbs.z[index];
            this.experienceOrbs.previousX[index] = x;
            this.experienceOrbs.previousZ[index] = z;
            let dx = this.playerX - x;
            let dz = this.playerZ - z;
            let distance = Math.hypot(dx, dz);
            if (distance <= this.stats.pickupRadius) {
                if (distance > 0) {
                    dx /= distance;
                    dz /= distance;
                    const travel = Math.min(distance, (5 + (this.stats.pickupRadius - distance) * 2.2) * STEP_SECONDS);
                    this.experienceOrbs.x[index] += dx * travel;
                    this.experienceOrbs.z[index] += dz * travel;
                    distance -= travel;
                }
                if (distance <= 0.25) {
                    this.gainExperience(this.experienceOrbs.value[index]);
                    this.experienceOrbs.remove(index);
                    continue;
                }
            }
            index += 1;
        }
    }

    private collectEquipment(): void {
        let index = 0;
        while (index < this.loot.count) {
            const dx = this.playerX - this.loot.x[index];
            const dz = this.playerZ - this.loot.z[index];
            if (dx * dx + dz * dz > 0.75 * 0.75) {
                index += 1;
                continue;
            }
            const id = this.loot.itemIds[index];
            const item = this.groundItems.get(id);
            if (!item) throw new Error(`Ground equipment ${id} is missing`);
            const clear = this.shouldAutoClear(item);
            if (!clear && this.inventory.length === INVENTORY_CAPACITY) {
                this.notifyInventoryFull();
                index += 1;
                continue;
            }
            this.groundItems.delete(id);
            this.storeInventoryItem(item);
            this.loot.remove(index);
            this.inventoryFullNotified = false;
            if (!clear) this.pushNotice("loot", `拾取 ${item.name}`);
            this.markChanged();
        }
    }

    /** Returns true when reflection removes the attacker from the packed pool. */
    private damagePlayer(index: number): boolean {
        this.damageImmunity = 0.55;
        if (this.random.chance(this.stats.evasion)) return false;
        if (this.shieldCooldown === 0) {
            this.shieldCooldown = this.stats.shieldRecovery;
            return false;
        }
        const elite = this.enemies.elite[index] !== 0;
        const criticalChance = this.enemies.boss[index] ? 0.22 : elite ? 0.14 : 0.06;
        const critical = this.random.chance(Math.max(0, criticalChance - this.stats.criticalResistance));
        const damage = incomingDamage(this.stats, this.enemies.damage[index], elite, critical, this.random.chance(this.stats.blockChance));
        const healthLost = Math.min(this.health, damage);
        this.health = Math.max(0, this.health - damage);
        this.markChanged();
        const reflection = reflectedDamage(this.stats, healthLost, this.enemies.maxHealth[index]);
        this.enemies.health[index] -= reflection;
        const killed = this.enemies.health[index] <= 0;
        if (killed) this.killEnemy(index);
        if (this.health === 0) {
            this.gameOverValue = true;
            this.pushNotice("danger", "你倒在了荒原上");
        }
        return killed;
    }

    private killEnemy(index: number): void {
        const x = this.enemies.x[index], z = this.enemies.z[index];
        const kind = this.enemies.kinds[index] as EnemyKind;
        const elite = this.enemies.elite[index] !== 0;
        const boss = this.enemies.boss[index] !== 0;
        const level = this.enemies.level[index];
        const experience = ENEMY_DEFINITIONS[kind].experience * (1 + (level - 1) * 0.15) * (boss ? 15 : elite ? 2 : 1);
        this.retireEnemy(index);
        this.killsValue += 1;
        this.gold += Math.round((boss ? 120 : elite ? 12 : 2) * level * (1 + this.stats.goldBonus));
        this.experienceOrbs.add(x, z, experience);
        if (boss && this.loot.count < MAX_GROUND_EQUIPMENT) {
            this.dropItem(generateOrb(this.random, this.nextItemId++, level, "rare"), x, z);
        }
        const chance = boss ? 1 : elite ? this.lootProfile.eliteDropChance : this.lootProfile.normalDropChance;
        if (this.loot.count < MAX_GROUND_EQUIPMENT && this.random.chance(chance)) {
            this.dropItem(generateEquipment(this.random, this.nextItemId++, level, this.lootProfile, boss ? "legendary" : "common"), x, z);
        }
        if (this.loot.count < MAX_GROUND_EQUIPMENT && this.random.chance(0.14)) {
            this.dropItem(createConsumable(this.nextItemId++, level, this.random.chance(0.6) ? "health" : "mana"), x, z);
        }
        this.markChanged();
    }

    private dropItem(item: InventoryItem, x: number, z: number): void {
        if (!this.loot.add(item, x, z)) throw new Error("Ground loot capacity changed during creation");
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
        return this.autoClearLowLevelEquipment && isLowLevelEquipment(item, this.level);
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
        // Preserve health ratio when switching gear: low-health swaps cannot manufacture healing.
        this.health = Math.min(this.stats.maxHealth, (previousMaximum === this.stats.maxHealth ? this.health : this.health / previousMaximum * this.stats.maxHealth)
            + (healGrowth ? this.stats.maxHealth * 0.12 * (1 + this.stats.regenBonus) : 0));
        this.shieldCooldown = Math.min(this.shieldCooldown, this.stats.shieldRecovery);
        this.skillCooldown = Math.min(this.skillCooldown, this.stats.skillInterval);
        this.mana = this.mana / previousMana * this.stats.maxMana;
    }

    private pushNotice(tone: CombatNotice["tone"], message: string): void {
        this.notices.push(Object.freeze({ id: this.nextNoticeId++, tone, message }));
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
