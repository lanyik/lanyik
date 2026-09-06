import {
    ATTRIBUTE_IDS,
    createStarterEquipment,
    generateEquipment,
    sumEquipment,
    type AttributeId,
    type Attributes,
    type Equipment,
    type EquipmentSlot,
    type EquippedItems,
    type Rarity
} from "./Equipment";
import { DeterministicRandom } from "./DeterministicRandom";
import { COMBAT_STEP_MS } from "./FixedStepClock";

export const MAX_ENEMIES = 640;
export const MAX_PROJECTILES = 128;
export const MAX_EXPERIENCE_ORBS = 768;
export const MAX_GROUND_EQUIPMENT = 64;
export const INVENTORY_CAPACITY = 20;

const STEP_SECONDS = COMBAT_STEP_MS / 1000;
const PLAYER_RADIUS = 0.3;
const ENEMY_DESPAWN_DISTANCE = 26;

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

export interface DerivedStats {
    readonly damage: number;
    readonly maxHealth: number;
    readonly armor: number;
    readonly moveSpeed: number;
    readonly attackRate: number;
    readonly criticalChance: number;
    readonly pickupRadius: number;
    readonly healthRegen: number;
    readonly attackRange: number;
}

export interface PlayerSnapshot {
    readonly x: number;
    readonly z: number;
    readonly health: number;
    readonly level: number;
    readonly experience: number;
    readonly experienceToLevel: number;
    readonly unspentAttributePoints: number;
    readonly attributes: Attributes;
    readonly stats: DerivedStats;
    readonly equipment: EquippedItems;
    readonly inventory: readonly Equipment[];
}

export interface CombatSnapshot {
    readonly revision: number;
    readonly tick: number;
    readonly elapsedMs: number;
    readonly kills: number;
    readonly livingEnemies: number;
    readonly groundEquipment: number;
    readonly gameOver: boolean;
    readonly player: PlayerSnapshot;
}

export interface CombatNotice {
    readonly id: number;
    readonly tone: "info" | "loot" | "level" | "danger";
    readonly message: string;
}

export interface PlayerRenderState {
    readonly x: number;
    readonly z: number;
    readonly previousX: number;
    readonly previousZ: number;
    readonly heading: number;
    readonly healthRatio: number;
    readonly invulnerable: boolean;
    readonly gameOver: boolean;
}

export interface EnemyRenderBuffer {
    readonly count: number;
    readonly ids: Uint32Array;
    readonly kinds: Uint8Array;
    readonly elite: Uint8Array;
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
    readonly x: Float32Array;
    readonly z: Float32Array;
}

export interface CombatRenderState {
    readonly player: PlayerRenderState;
    readonly enemies: EnemyRenderBuffer;
    readonly projectiles: ProjectileRenderBuffer;
    readonly experience: ExperienceRenderBuffer;
    readonly loot: LootRenderBuffer;
}

type MutablePlayerRenderState = { -readonly [Key in keyof PlayerRenderState]: PlayerRenderState[Key] };

class EnemyPool implements EnemyRenderBuffer {
    public count = 0;
    public readonly ids = new Uint32Array(MAX_ENEMIES);
    public readonly kinds = new Uint8Array(MAX_ENEMIES);
    public readonly elite = new Uint8Array(MAX_ENEMIES);
    public readonly x = new Float32Array(MAX_ENEMIES);
    public readonly z = new Float32Array(MAX_ENEMIES);
    public readonly previousX = new Float32Array(MAX_ENEMIES);
    public readonly previousZ = new Float32Array(MAX_ENEMIES);
    public readonly health = new Float32Array(MAX_ENEMIES);
    public readonly radius = new Float32Array(MAX_ENEMIES);
    public readonly speed = new Float32Array(MAX_ENEMIES);
    public readonly damage = new Float32Array(MAX_ENEMIES);
    public readonly hitFlash = new Float32Array(MAX_ENEMIES);

    public add(id: number, kind: EnemyKind, elite: boolean, x: number, z: number, definition: EnemyDefinition, scale: number): boolean {
        if (this.count === MAX_ENEMIES) return false;
        const index = this.count++;
        this.ids[index] = id;
        this.kinds[index] = kind;
        this.elite[index] = Number(elite);
        this.x[index] = this.previousX[index] = x;
        this.z[index] = this.previousZ[index] = z;
        this.health[index] = definition.health * scale * (elite ? 4 : 1);
        this.radius[index] = definition.radius * (elite ? 1.28 : 1);
        this.speed[index] = definition.speed * Math.min(1.35, 1 + (scale - 1) * 0.08);
        this.damage[index] = definition.damage * Math.sqrt(scale) * (elite ? 1.55 : 1);
        this.hitFlash[index] = 0;
        return true;
    }

    public remove(index: number): void {
        const last = --this.count;
        if (index === last) return;
        this.ids[index] = this.ids[last];
        this.kinds[index] = this.kinds[last];
        this.elite[index] = this.elite[last];
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
            // Capacity never deletes earned XP: overflow coalesces into the oldest orb.
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
    public readonly x = new Float32Array(MAX_GROUND_EQUIPMENT);
    public readonly z = new Float32Array(MAX_GROUND_EQUIPMENT);

    public add(item: Equipment, x: number, z: number): boolean {
        if (this.count === MAX_GROUND_EQUIPMENT) return false;
        const index = this.count++;
        this.itemIds[index] = item.id;
        this.rarities[index] = RARITIES_BY_INDEX.indexOf(item.rarity);
        this.x[index] = x;
        this.z[index] = z;
        return true;
    }

    public remove(index: number): void {
        const last = --this.count;
        if (index === last) return;
        this.itemIds[index] = this.itemIds[last];
        this.rarities[index] = this.rarities[last];
        this.x[index] = this.x[last];
        this.z[index] = this.z[last];
    }
}

const RARITIES_BY_INDEX: readonly Rarity[] = ["common", "magic", "rare", "legendary"];

function experienceForLevel(level: number): number {
    return Math.round(24 + level * 13 + level * level * 1.8);
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
    private readonly groundItems = new Map<number, Equipment>();
    private inventory: Equipment[] = [];
    private equipped: Record<EquipmentSlot, Equipment | undefined> = {
        weapon: createStarterEquipment(),
        armor: undefined,
        ring: undefined
    };
    private attributes: Record<AttributeId, number> = { might: 5, vitality: 5, agility: 5, fortune: 5 };
    private stats: DerivedStats;
    private tickValue = 0;
    private killsValue = 0;
    private revision = 0;
    private nextEntityId = 1;
    private nextItemId = 2;
    private nextNoticeId = 1;
    private notices: CombatNotice[] = [];
    private cachedSnapshot: CombatSnapshot | undefined;
    private spawnBudget = 0;
    private attackCooldown = 0;
    private damageImmunity = 0;
    private inventoryFullNotified = false;
    private playerX: number;
    private playerZ: number;
    private previousPlayerX: number;
    private previousPlayerZ: number;
    private heading = 0;
    private health: number;
    private level = 1;
    private experience = 0;
    private unspentAttributePoints = 0;
    private gameOverValue = false;
    private readonly playerRenderState: MutablePlayerRenderState = {
        x: 0,
        z: 0,
        previousX: 0,
        previousZ: 0,
        heading: 0,
        healthRatio: 1,
        invulnerable: false,
        gameOver: false
    };
    private readonly renderState: CombatRenderState = {
        player: this.playerRenderState,
        enemies: this.enemies,
        projectiles: this.projectiles,
        experience: this.experienceOrbs,
        loot: this.loot
    };

    constructor(seed: string | number, start = { x: 0, z: 0 }) {
        validatePosition(start.x, start.z);
        this.random = new DeterministicRandom(`${String(seed)}:combat`);
        this.playerX = this.previousPlayerX = start.x;
        this.playerZ = this.previousPlayerZ = start.z;
        this.stats = this.calculateStats();
        this.health = this.stats.maxHealth;
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
        this.movePlayer(input);
        this.spawnEnemies();
        this.fireWeapon();
        this.advanceProjectiles();
        this.advanceEnemies();
        if (this.gameOverValue) return;
        this.advanceExperience();
        this.collectEquipment();
        if (this.stats.healthRegen > 0 && this.health < this.stats.maxHealth) {
            this.health = Math.min(this.stats.maxHealth, this.health + this.stats.healthRegen * STEP_SECONDS);
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
            level: this.level,
            experience: this.experience,
            experienceToLevel: experienceForLevel(this.level),
            unspentAttributePoints: this.unspentAttributePoints,
            attributes: Object.freeze({ ...this.attributes }),
            stats: this.stats,
            equipment,
            inventory: Object.freeze([...this.inventory])
        });
        return this.cachedSnapshot = Object.freeze({
            revision: this.revision,
            tick: this.tickValue,
            elapsedMs: this.tickValue * COMBAT_STEP_MS,
            kills: this.killsValue,
            livingEnemies: this.enemies.count,
            groundEquipment: this.loot.count,
            gameOver: this.gameOverValue,
            player
        });
    }

    public getRenderState(): CombatRenderState {
        const state = this.playerRenderState;
        state.x = this.playerX;
        state.z = this.playerZ;
        state.previousX = this.previousPlayerX;
        state.previousZ = this.previousPlayerZ;
        state.heading = this.heading;
        state.healthRatio = this.health / this.stats.maxHealth;
        state.invulnerable = this.damageImmunity > 0;
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
        const previous = this.equipped[item.slot];
        const nextInventory = [...this.inventory];
        nextInventory.splice(index, 1);
        if (previous) nextInventory.push(previous);
        this.inventory = nextInventory;
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
        const seconds = this.tickValue * STEP_SECONDS;
        const spawnRate = Math.min(13, 1.45 + seconds * 0.048);
        const livingLimit = Math.min(MAX_ENEMIES, 96 + Math.floor(seconds * 2.4));
        this.spawnBudget = Math.min(4, this.spawnBudget + spawnRate * STEP_SECONDS);
        while (this.spawnBudget >= 1 && this.enemies.count < livingLimit) {
            this.spawnBudget -= 1;
            const kind = this.rollEnemyKind(seconds);
            const elite = seconds >= 35 && this.random.chance(Math.min(0.11, 0.018 + seconds / 1800));
            const angle = this.random.next() * Math.PI * 2;
            const radius = 8.5 + this.random.next() * 3.5;
            const scale = 1 + seconds / 115 + Math.max(0, this.level - 1) * 0.045;
            this.enemies.add(
                this.nextEntityId++,
                kind,
                elite,
                this.playerX + Math.cos(angle) * radius,
                this.playerZ + Math.sin(angle) * radius,
                ENEMY_DEFINITIONS[kind],
                scale
            );
        }
    }

    private rollEnemyKind(seconds: number): EnemyKind {
        const roll = this.random.next();
        if (seconds >= 90 && roll < 0.16) return 3;
        if (seconds >= 45 && roll < 0.3) return 2;
        if (seconds >= 20 && roll < 0.5) return 1;
        return 0;
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
        const critical = this.random.chance(this.stats.criticalChance);
        const variance = 0.92 + this.random.next() * 0.16;
        const damage = this.stats.damage * variance * (critical ? 1.8 : 1);
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
                this.enemies.health[hit] -= this.projectiles.damage[projectile];
                this.enemies.hitFlash[hit] = 0.1;
                if (this.enemies.health[hit] <= 0) this.killEnemy(hit);
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
        for (let index = 0; index < this.enemies.count; index += 1) {
            const x = this.enemies.x[index];
            const z = this.enemies.z[index];
            this.enemies.previousX[index] = x;
            this.enemies.previousZ[index] = z;
            this.enemies.hitFlash[index] = Math.max(0, this.enemies.hitFlash[index] - STEP_SECONDS);
            let dx = this.playerX - x;
            let dz = this.playerZ - z;
            let distance = Math.hypot(dx, dz);
            if (distance > ENEMY_DESPAWN_DISTANCE) {
                const angle = this.random.next() * Math.PI * 2;
                const radius = 10 + this.random.next() * 2;
                this.enemies.x[index] = this.enemies.previousX[index] = this.playerX + Math.cos(angle) * radius;
                this.enemies.z[index] = this.enemies.previousZ[index] = this.playerZ + Math.sin(angle) * radius;
                continue;
            }
            if (distance > 0) {
                dx /= distance;
                dz /= distance;
                const weave = Math.sin(seconds * 1.2 + this.enemies.ids[index] * 0.73) * 0.08;
                const speed = this.enemies.speed[index] * STEP_SECONDS;
                this.enemies.x[index] += (dx - dz * weave) * speed;
                this.enemies.z[index] += (dz + dx * weave) * speed;
                distance -= speed;
            }
            const contactDistance = this.enemies.radius[index] + PLAYER_RADIUS;
            if (distance <= contactDistance) {
                if (this.damageImmunity <= 0) this.damagePlayer(this.enemies.damage[index]);
                this.enemies.x[index] -= dx * 0.12;
                this.enemies.z[index] -= dz * 0.12;
            }
        }
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
            if (this.inventory.length === INVENTORY_CAPACITY) {
                if (!this.inventoryFullNotified) {
                    this.inventoryFullNotified = true;
                    this.pushNotice("danger", "背包已满，地上的装备暂时无法拾取");
                }
                index += 1;
                continue;
            }
            const id = this.loot.itemIds[index];
            const item = this.groundItems.get(id);
            if (!item) throw new Error(`Ground equipment ${id} is missing`);
            this.groundItems.delete(id);
            this.inventory.push(item);
            this.loot.remove(index);
            this.inventoryFullNotified = false;
            this.pushNotice("loot", `拾取 ${item.name}`);
            this.markChanged();
        }
    }

    private damagePlayer(rawDamage: number): void {
        const damage = Math.max(1, rawDamage * 100 / (100 + this.stats.armor * 7));
        this.health = Math.max(0, this.health - damage);
        this.damageImmunity = 0.55;
        this.markChanged();
        if (this.health === 0) {
            this.gameOverValue = true;
            this.pushNotice("danger", "你倒在了荒原上");
        }
    }

    private killEnemy(index: number): void {
        const x = this.enemies.x[index];
        const z = this.enemies.z[index];
        const kind = this.enemies.kinds[index] as EnemyKind;
        const elite = this.enemies.elite[index] === 1;
        const experience = ENEMY_DEFINITIONS[kind].experience * (elite ? 3 : 1);
        this.enemies.remove(index);
        this.killsValue += 1;
        this.experienceOrbs.add(x, z, experience);

        const dropChance = Math.min(0.72, (elite ? 0.62 : 0.075) * (1 + this.attributes.fortune * 0.025));
        if (this.loot.count < MAX_GROUND_EQUIPMENT && this.random.chance(dropChance)) {
            const seconds = this.tickValue * STEP_SECONDS;
            const itemLevel = Math.max(1, this.level + Math.floor(seconds / 55) + this.random.integer(3) - 1);
            const item = generateEquipment(this.random, this.nextItemId++, itemLevel, this.attributes.fortune * 0.006);
            if (!this.loot.add(item, x, z)) throw new Error("Ground equipment capacity changed during drop creation");
            this.groundItems.set(item.id, item);
        }
        this.markChanged();
    }

    private gainExperience(amount: number): void {
        this.experience += amount;
        let levels = 0;
        while (this.experience >= experienceForLevel(this.level)) {
            this.experience -= experienceForLevel(this.level);
            this.level += 1;
            this.unspentAttributePoints += 2;
            levels += 1;
        }
        if (levels > 0) {
            this.recalculateStats(true);
            this.pushNotice("level", `等级提升至 ${this.level} · 获得 ${levels * 2} 点属性`);
        }
        this.markChanged();
    }

    private calculateStats(): DerivedStats {
        const gear = sumEquipment(this.equipped);
        return Object.freeze({
            damage: 7 + this.level * 1.15 + this.attributes.might * 1.35 + gear.damage,
            maxHealth: Math.round(88 + this.level * 4 + this.attributes.vitality * 8 + gear.maxHealth),
            armor: this.attributes.vitality * 0.32 + gear.armor,
            moveSpeed: 2.7 * (1 + this.attributes.agility * 0.008 + gear.moveSpeed),
            attackRate: 1.38 * (1 + this.attributes.agility * 0.012 + gear.attackSpeed),
            criticalChance: Math.min(0.75, 0.045 + this.attributes.agility * 0.0035 + gear.criticalChance),
            pickupRadius: 1.65 + this.attributes.fortune * 0.035 + gear.pickupRadius,
            healthRegen: 0.12 + this.attributes.vitality * 0.018 + gear.healthRegen,
            attackRange: 6.4
        });
    }

    private recalculateStats(healGrowth: boolean): void {
        const previousMaximum = this.stats.maxHealth;
        this.stats = this.calculateStats();
        const maximumChange = this.stats.maxHealth - previousMaximum;
        this.health = Math.min(this.stats.maxHealth, Math.max(1,
            this.health + maximumChange + (healGrowth ? this.stats.maxHealth * 0.12 : 0)));
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
    fortune: "寻宝"
});
