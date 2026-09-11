import { EntityWorld } from "./EntityWorld";
import { ProjectileBatch } from "./ProjectileBatch";
import {
    ENTITY_CAPACITY, MAX_ENEMIES, MAX_PROJECTILES, MAX_HOSTILE_PROJECTILES,
    MAX_EXPERIENCE_ORBS, MAX_GROUND_EQUIPMENT, PLAYER_RADIUS
} from "./GameConfig";
import { ENEMY_DEFINITIONS } from "./EnemyDefinitions";
import { RARITIES } from "./Equipment";
import { REGION_RULES, type RegionalChunk, type RegionInfo, type RegionalSpawn } from "./RegionalWorld";
import type { InventoryItem } from "./InventoryItem";
import { CombatEffects } from "./CombatEffects";

export const Component = Object.freeze({ Position: 1, Vitals: 2, Player: 4, Enemy: 8, Projectile: 16, Experience: 32, GroundItem: 64, Hostile: 128 });
export enum Faction { Player, Enemy }
export enum ActorAction { Idle, Moving, Melee, Cast, Charge, Heal, Nova }
export enum MoveIntent { None, Chase, Return, Retreat, Circle, Flank, Patrol }

export class DamageBuffer {
    public count = 0;
    public readonly source = new Float64Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly target = new Float64Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly damage = new Float64Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly elite = new Uint8Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly boss = new Uint8Array(MAX_ENEMIES + MAX_PROJECTILES);

    public add(source: number, target: number, damage: number, elite = 0, boss = 0): void {
        if (this.count === this.source.length) throw new Error("Damage event capacity exhausted");
        const i = this.count++;
        this.source[i] = source; this.target[i] = target; this.damage[i] = damage;
        this.elite[i] = elite; this.boss[i] = boss;
    }
}

/** One application-owned ECS. Components are indexed by stable slots, queries by dense cursors. */
export class CombatWorld {
    public readonly world = new EntityWorld(ENTITY_CAPACITY);
    public readonly enemies = this.world.query(Component.Enemy);
    public readonly projectiles = this.world.query(Component.Projectile);
    public readonly hostileProjectiles = this.world.query(Component.Projectile | Component.Hostile);
    public readonly experience = this.world.query(Component.Experience);
    public readonly loot = this.world.query(Component.GroundItem);
    public readonly player: number;
    public readonly impacts = new DamageBuffer();
    public readonly effects = new CombatEffects();
    public readonly status = { slowUntil: new Float64Array(ENTITY_CAPACITY), slowScale: new Float32Array(ENTITY_CAPACITY) };
    public readonly projectileBatch = new ProjectileBatch();
    public readonly projectileBatchIndices = new Uint16Array(ENTITY_CAPACITY);
    public readonly position = {
        x: new Float64Array(ENTITY_CAPACITY), z: new Float64Array(ENTITY_CAPACITY),
        previousX: new Float64Array(ENTITY_CAPACITY), previousZ: new Float64Array(ENTITY_CAPACITY),
        heading: new Float32Array(ENTITY_CAPACITY), radius: new Float32Array(ENTITY_CAPACITY)
    };
    public readonly vitals = {
        health: new Float64Array(ENTITY_CAPACITY), maxHealth: new Float64Array(ENTITY_CAPACITY),
        mana: new Float64Array(ENTITY_CAPACITY), faction: new Uint8Array(ENTITY_CAPACITY),
        hitFlash: new Float32Array(ENTITY_CAPACITY)
    };
    public readonly enemy = {
        kind: new Uint8Array(ENTITY_CAPACITY), elite: new Uint8Array(ENTITY_CAPACITY), boss: new Uint8Array(ENTITY_CAPACITY),
        level: new Uint32Array(ENTITY_CAPACITY), homeX: new Float64Array(ENTITY_CAPACITY), homeZ: new Float64Array(ENTITY_CAPACITY),
        speed: new Float32Array(ENTITY_CAPACITY), damage: new Float32Array(ENTITY_CAPACITY),
        homes: new Array<RegionalChunk | undefined>(ENTITY_CAPACITY), regions: new Array<RegionInfo | undefined>(ENTITY_CAPACITY),
        runningNode: new Int16Array(ENTITY_CAPACITY).fill(-1), target: new Float64Array(ENTITY_CAPACITY),
        intent: new Uint8Array(ENTITY_CAPACITY), awake: new Uint8Array(ENTITY_CAPACITY), returning: new Uint8Array(ENTITY_CAPACITY),
        patrolX: new Float64Array(ENTITY_CAPACITY), patrolZ: new Float64Array(ENTITY_CAPACITY),
        patrolStep: new Uint32Array(ENTITY_CAPACITY), patrolWaitUntil: new Float64Array(ENTITY_CAPACITY),
        active: new Uint8Array(ENTITY_CAPACITY), supportTarget: new Float64Array(ENTITY_CAPACITY),
        senseAt: new Float64Array(ENTITY_CAPACITY), specialReadyAt: new Float64Array(ENTITY_CAPACITY), enraged: new Uint8Array(ENTITY_CAPACITY)
    };
    public readonly action = {
        kind: new Uint8Array(ENTITY_CAPACITY), started: new Float64Array(ENTITY_CAPACITY),
        hitAt: new Float64Array(ENTITY_CAPACITY), endsAt: new Float64Array(ENTITY_CAPACITY),
        readyAt: new Float64Array(ENTITY_CAPACITY), committed: new Uint8Array(ENTITY_CAPACITY),
        reach: new Float32Array(ENTITY_CAPACITY), progress: new Float32Array(ENTITY_CAPACITY),
        target: new Float64Array(ENTITY_CAPACITY), variant: new Uint8Array(ENTITY_CAPACITY)
    };
    public readonly projectile = {
        source: new Float64Array(ENTITY_CAPACITY), faction: new Uint8Array(ENTITY_CAPACITY),
        velocityX: new Float32Array(ENTITY_CAPACITY), velocityZ: new Float32Array(ENTITY_CAPACITY),
        damage: new Float64Array(ENTITY_CAPACITY), lifetime: new Float32Array(ENTITY_CAPACITY),
        critical: new Uint8Array(ENTITY_CAPACITY), elite: new Uint8Array(ENTITY_CAPACITY), boss: new Uint8Array(ENTITY_CAPACITY)
    };
    public readonly experienceValue = new Float64Array(ENTITY_CAPACITY);
    public readonly item = {
        id: new Float64Array(ENTITY_CAPACITY), rarity: new Uint8Array(ENTITY_CAPACITY), kind: new Uint8Array(ENTITY_CAPACITY)
    };

    constructor(x: number, z: number) {
        this.player = this.world.create(Component.Position | Component.Vitals | Component.Player);
        this.place(this.player, x, z, PLAYER_RADIUS);
    }

    public spawnEnemy(spawn: RegionalSpawn, home: RegionalChunk): number {
        if (this.enemies.count === MAX_ENEMIES) throw new Error("Regional population exceeds the enemy budget");
        const slot = this.world.create(Component.Position | Component.Vitals | Component.Enemy);
        const definition = ENEMY_DEFINITIONS[spawn.kind];
        const scale = REGION_RULES[spawn.region.difficulty].scale * (1 + (spawn.level - 1) * .15);
        const { enemy: e, action: a, vitals: v } = this;
        e.kind[slot] = spawn.kind; e.elite[slot] = Number(spawn.elite); e.boss[slot] = Number(spawn.boss);
        e.level[slot] = spawn.level; e.homes[slot] = home; e.regions[slot] = spawn.region;
        e.homeX[slot] = spawn.x; e.homeZ[slot] = spawn.z;
        e.speed[slot] = definition.speed * Math.min(1.35, 1 + (scale - 1) * .08);
        e.damage[slot] = definition.damage * Math.sqrt(scale) * (spawn.boss ? 2.5 : spawn.elite ? 1.55 : 1);
        e.runningNode[slot] = -1; e.target[slot] = 0; e.intent[slot] = MoveIntent.None; e.active[slot] = e.awake[slot] = e.returning[slot] = 0;
        e.patrolX[slot] = spawn.x; e.patrolZ[slot] = spawn.z; e.patrolStep[slot] = e.patrolWaitUntil[slot] = 0;
        e.supportTarget[slot] = e.senseAt[slot] = e.specialReadyAt[slot] = e.enraged[slot] = 0;
        this.status.slowUntil[slot] = 0; this.status.slowScale[slot] = 1;
        a.target[slot] = a.variant[slot] = 0;
        a.kind[slot] = ActorAction.Idle; a.started[slot] = a.hitAt[slot] = a.endsAt[slot] = a.readyAt[slot] = a.progress[slot] = a.committed[slot] = 0;
        const radius = definition.radius * (spawn.boss ? 2.5 : spawn.elite ? 1.28 : 1);
        this.place(slot, spawn.x, spawn.z, radius);
        a.reach[slot] = definition.ranged ? (spawn.boss ? 9 : definition.reach) : radius + PLAYER_RADIUS + definition.reach;
        v.health[slot] = v.maxHealth[slot] = definition.health * scale * (spawn.boss ? 16 : spawn.elite ? 4 : 1);
        v.mana[slot] = v.hitFlash[slot] = 0; v.faction[slot] = Faction.Enemy;
        return slot;
    }

    public spawnProjectile(source: number, faction: Faction, x: number, z: number, vx: number, vz: number,
        damage: number, lifetime: number, critical = false, elite = 0, boss = 0): boolean {
        if (this.projectiles.count === MAX_PROJECTILES || (faction === Faction.Enemy && this.hostileProjectiles.count === MAX_HOSTILE_PROJECTILES)) return false;
        const slot = this.world.create(Component.Position | Component.Projectile | (faction === Faction.Enemy ? Component.Hostile : 0));
        this.place(slot, x, z, faction === Faction.Enemy ? .14 : .11);
        const p = this.projectile;
        p.source[slot] = source; p.faction[slot] = faction; p.velocityX[slot] = vx; p.velocityZ[slot] = vz;
        p.damage[slot] = damage; p.lifetime[slot] = lifetime; p.critical[slot] = Number(critical); p.elite[slot] = elite; p.boss[slot] = boss;
        return true;
    }

    public spawnExperience(x: number, z: number, value: number): void {
        if (this.experience.count === MAX_EXPERIENCE_ORBS) {
            this.experienceValue[this.experience.slots[0]] += value;
            return;
        }
        const slot = this.world.create(Component.Position | Component.Experience);
        this.place(slot, x, z, 0);
        this.experienceValue[slot] = value;
    }

    public spawnLoot(item: InventoryItem, x: number, z: number): void {
        if (this.loot.count === MAX_GROUND_EQUIPMENT) throw new Error("Ground loot capacity changed during creation");
        const slot = this.world.create(Component.Position | Component.GroundItem);
        this.place(slot, x, z, 0);
        this.item.id[slot] = item.id; this.item.rarity[slot] = RARITIES.indexOf(item.rarity);
        this.item.kind[slot] = item.type === "orb" ? 1 : item.type === "consumable" ? 2 : 0;
    }

    public remove(slot: number): void {
        this.enemy.homes[slot] = this.enemy.regions[slot] = undefined;
        this.enemy.target[slot] = this.projectile.source[slot] = 0;
        this.enemy.supportTarget[slot] = this.action.target[slot] = 0;
        this.status.slowUntil[slot] = 0;
        this.enemy.runningNode[slot] = -1;
        this.world.destroy(this.world.ids[slot]);
    }

    private place(slot: number, x: number, z: number, radius: number): void {
        const p = this.position;
        p.x[slot] = p.previousX[slot] = x; p.z[slot] = p.previousZ[slot] = z;
        p.radius[slot] = radius; p.heading[slot] = 0;
    }
}
