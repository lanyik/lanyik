import { EntityWorld } from "./EntityWorld";
import { ProjectileBatch } from "./ProjectileBatch";
import {
    ENTITY_CAPACITY, MAX_ENEMIES, MAX_PROJECTILES, MAX_HOSTILE_PROJECTILES,
    MAX_EXPERIENCE_ORBS, MAX_GROUND_EQUIPMENT, PLAYER_RADIUS
} from "./GameConfig";
import { ENEMY_DEFINITIONS, enemyStats } from "./EnemyDefinitions";
import { RARITIES } from "./Equipment";
import { REGION_RULES, type RegionalChunk, type RegionInfo, type RegionalSpawn } from "./RegionalWorld";
import { groundItemKind, type InventoryItem } from "./InventoryItem";
import { CombatEffects } from "./CombatEffects";
import { CombatEvents } from "./CombatEvents";
import { CombatVitality } from "./CombatVitality";
import { StatusSystem } from "./StatusSystem";
import { CombatText } from "./CombatText";
import { SpatialGrid, SpatialQuery } from "./SpatialGrid";
import { OPEN_TERRAIN, type CombatTerrain } from "./CombatTerrain";

export const Component = Object.freeze({ Position: 1, Vitals: 2, Player: 4, Enemy: 8, Projectile: 16, Experience: 32, GroundItem: 64, Hostile: 128 });
export enum Faction { Player, Enemy }
export enum ActorAction { Idle, Moving, Melee, Cast, Charge, Heal, Reave, Volley, Fault, Jaws }
export enum MoveIntent { None, Chase, Return, Retreat, Circle, Flank, Patrol, Seek }
export interface ProjectileLaunch {
    readonly critical?: boolean; readonly elite?: number; readonly boss?: number;
    readonly height?: number; readonly groundX?: number; readonly groundZ?: number;
    readonly turnRate?: number; readonly velocityY?: number;
}

export class DamageBuffer {
    public count = 0;
    public readonly source = new Float64Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly target = new Float64Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly damage = new Float64Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly elite = new Uint8Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly boss = new Uint8Array(MAX_ENEMIES + MAX_PROJECTILES);
    public readonly critical = new Uint8Array(MAX_ENEMIES + MAX_PROJECTILES);

    public add(source: number, target: number, damage: number, elite = 0, boss = 0, critical = 0): void {
        if (this.count === this.source.length) throw new Error("Damage event capacity exhausted");
        const i = this.count++;
        this.source[i] = source; this.target[i] = target; this.damage[i] = damage;
        this.elite[i] = elite; this.boss[i] = boss;
        this.critical[i] = critical;
    }
}

/** One application-owned ECS. Components are indexed by stable slots, queries by dense cursors. */
export class CombatWorld {
    public readonly combatText = new CombatText();
    public readonly world = new EntityWorld(ENTITY_CAPACITY);
    public readonly enemies = this.world.query(Component.Enemy);
    public readonly projectiles = this.world.query(Component.Projectile);
    public readonly hostileProjectiles = this.world.query(Component.Projectile | Component.Hostile);
    public readonly experience = this.world.query(Component.Experience);
    public readonly loot = this.world.query(Component.GroundItem);
    public readonly player: number;
    public readonly spatial = new SpatialGrid(ENTITY_CAPACITY);
    private readonly nearby = new SpatialQuery(ENTITY_CAPACITY);
    public readonly impacts = new DamageBuffer();
    public readonly effects = new CombatEffects();
    public readonly status = new StatusSystem(this.world);
    public readonly events = new CombatEvents();
    public readonly vitality = new CombatVitality(this);
    public readonly projectileBatch = new ProjectileBatch();
    public readonly projectileBatchIndices = new Uint16Array(ENTITY_CAPACITY);
    public readonly projectileEnemyIndices = new Uint16Array(ENTITY_CAPACITY);
    public readonly projectileCandidates = new SpatialQuery(ENTITY_CAPACITY);
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
        senseAt: new Float64Array(ENTITY_CAPACITY), specialReadyAt: new Float64Array(ENTITY_CAPACITY), enraged: new Uint8Array(ENTITY_CAPACITY), attackStep: new Uint32Array(ENTITY_CAPACITY)
    };
    public readonly action = {
        kind: new Uint8Array(ENTITY_CAPACITY), started: new Float64Array(ENTITY_CAPACITY),
        hitAt: new Float64Array(ENTITY_CAPACITY), endsAt: new Float64Array(ENTITY_CAPACITY),
        readyAt: new Float64Array(ENTITY_CAPACITY), committed: new Uint8Array(ENTITY_CAPACITY),
        reach: new Float32Array(ENTITY_CAPACITY), progress: new Float32Array(ENTITY_CAPACITY),
        target: new Float64Array(ENTITY_CAPACITY), variant: new Uint8Array(ENTITY_CAPACITY), targetX: new Float64Array(ENTITY_CAPACITY), targetZ: new Float64Array(ENTITY_CAPACITY)
    };
    public readonly projectile = {
        turnRate: new Float32Array(ENTITY_CAPACITY),
        source: new Float64Array(ENTITY_CAPACITY), faction: new Uint8Array(ENTITY_CAPACITY),
        y: new Float64Array(ENTITY_CAPACITY), previousY: new Float64Array(ENTITY_CAPACITY), age: new Float32Array(ENTITY_CAPACITY),
        velocityY: new Float32Array(ENTITY_CAPACITY),
        velocityX: new Float32Array(ENTITY_CAPACITY), velocityZ: new Float32Array(ENTITY_CAPACITY),
        damage: new Float64Array(ENTITY_CAPACITY), lifetime: new Float32Array(ENTITY_CAPACITY),
        critical: new Uint8Array(ENTITY_CAPACITY), elite: new Uint8Array(ENTITY_CAPACITY), boss: new Uint8Array(ENTITY_CAPACITY)
    };
    public readonly experienceValue = new Float64Array(ENTITY_CAPACITY);
    public readonly item = {
        id: new Float64Array(ENTITY_CAPACITY), rarity: new Uint8Array(ENTITY_CAPACITY), kind: new Uint8Array(ENTITY_CAPACITY)
    };

    constructor(x: number, z: number, public readonly terrain: CombatTerrain = OPEN_TERRAIN) {
        this.player = this.world.create(Component.Position | Component.Vitals | Component.Player);
        this.place(this.player, x, z, PLAYER_RADIUS);
    }

    public moveActor(slot: number, dx: number, dz: number, slide = true): boolean {
        const p = this.position, x = p.x[slot], z = p.z[slot];
        const next = this.terrain.move(x, z, dx, dz, p.radius[slot], slide);
        p.x[slot] = next.x; p.z[slot] = next.z;
        return next.x !== x || next.z !== z;
    }

    public spawnEnemy(spawn: RegionalSpawn, home: RegionalChunk): number {
        if (this.enemies.count === MAX_ENEMIES) throw new Error("Regional population exceeds the enemy budget");
        const slot = this.world.create(Component.Position | Component.Vitals | Component.Enemy);
        const definition = ENEMY_DEFINITIONS[spawn.kind];
        const stats = enemyStats(spawn.kind, spawn.level, REGION_RULES[spawn.region.difficulty].scale, spawn.elite, spawn.boss);
        const { enemy: e, action: a, vitals: v } = this;
        e.kind[slot] = spawn.kind; e.elite[slot] = Number(spawn.elite); e.boss[slot] = Number(spawn.boss);
        e.level[slot] = spawn.level; e.homes[slot] = home; e.regions[slot] = spawn.region;
        e.homeX[slot] = spawn.x; e.homeZ[slot] = spawn.z;
        e.speed[slot] = stats.speed; e.damage[slot] = stats.damage;
        e.runningNode[slot] = -1; e.target[slot] = 0; e.intent[slot] = MoveIntent.None; e.active[slot] = e.awake[slot] = e.returning[slot] = 0;
        e.patrolX[slot] = spawn.x; e.patrolZ[slot] = spawn.z; e.patrolStep[slot] = e.patrolWaitUntil[slot] = 0;
        e.supportTarget[slot] = e.senseAt[slot] = e.specialReadyAt[slot] = e.enraged[slot] = 0;
        this.status.clear(slot); e.attackStep[slot] = 0;
        a.targetX[slot] = spawn.x; a.targetZ[slot] = spawn.z;
        a.target[slot] = a.variant[slot] = 0;
        a.kind[slot] = ActorAction.Idle; a.started[slot] = a.hitAt[slot] = a.endsAt[slot] = a.readyAt[slot] = a.progress[slot] = a.committed[slot] = 0;
        const radius = definition.radius * (spawn.boss ? 2.5 : spawn.elite ? 1.28 : 1);
        this.place(slot, spawn.x, spawn.z, radius, Component.Enemy);
        a.reach[slot] = definition.ranged ? (spawn.boss ? 9 : definition.reach) : radius + PLAYER_RADIUS + definition.reach;
        v.health[slot] = v.maxHealth[slot] = stats.health;
        v.mana[slot] = v.hitFlash[slot] = 0; v.faction[slot] = Faction.Enemy;
        return slot;
    }

    public spawnProjectile(source: number, faction: Faction, x: number, z: number, vx: number, vz: number,
        damage: number, lifetime: number, launch: ProjectileLaunch = {}): boolean {
        if (this.projectiles.count === MAX_PROJECTILES || (faction === Faction.Enemy && this.hostileProjectiles.count === MAX_HOSTILE_PROJECTILES)) return false;
        const slot = this.world.create(Component.Position | Component.Projectile | (faction === Faction.Enemy ? Component.Hostile : 0));
        this.place(slot, x, z, faction === Faction.Enemy ? .14 : .11);
        const p = this.projectile;
        p.turnRate[slot] = launch.turnRate ?? 0; this.position.heading[slot] = Math.atan2(vx, vz);
        p.y[slot] = p.previousY[slot] = this.terrain.height(launch.groundX ?? x, launch.groundZ ?? z) + (launch.height ?? .42); p.age[slot] = 0;
        p.velocityY[slot] = launch.velocityY ?? 0;
        p.source[slot] = source; p.faction[slot] = faction; p.velocityX[slot] = vx; p.velocityZ[slot] = vz;
        p.damage[slot] = damage; p.lifetime[slot] = lifetime; p.critical[slot] = Number(launch.critical ?? false); p.elite[slot] = launch.elite ?? 0; p.boss[slot] = launch.boss ?? 0;
        return true;
    }

    public bodyHeight(slot: number): number {
        return slot === this.player ? 1.6 : ENEMY_DEFINITIONS[this.enemy.kind[slot]].height * this.position.radius[slot] / .3;
    }
    public aimHeight(slot: number): number {
        return this.terrain.height(this.position.x[slot], this.position.z[slot]) + this.bodyHeight(slot) * .5;
    }
    public canSee(source: number, target: number, radius = .04): boolean {
        const p = this.position;
        return this.terrain.traceAttack(p.x[source], this.aimHeight(source), p.z[source], p.x[target], this.aimHeight(target), p.z[target], radius) === Infinity;
    }

    public spawnExperience(x: number, z: number, value: number): void {
        if (this.experience.count === MAX_EXPERIENCE_ORBS) {
            this.experienceValue[this.experience.slots[0]] += value;
            return;
        }
        const slot = this.world.create(Component.Position | Component.Experience);
        this.place(slot, x, z, 0, Component.Experience);
        this.experienceValue[slot] = value;
    }

    public spawnLoot(item: InventoryItem, x: number, z: number): void {
        if (this.loot.count === MAX_GROUND_EQUIPMENT) throw new Error("Ground loot capacity changed during creation");
        const slot = this.world.create(Component.Position | Component.GroundItem);
        this.place(slot, x, z, 0, Component.GroundItem);
        this.item.id[slot] = item.id; this.item.rarity[slot] = RARITIES.indexOf(item.rarity);
        this.item.kind[slot] = groundItemKind(item);
    }

    public remove(slot: number): void {
        if (this.enemy.homes[slot]) this.effects.cancelSource(this.world.ids[slot]);
        this.spatial.remove(slot);
        this.enemy.homes[slot] = this.enemy.regions[slot] = undefined;
        this.enemy.target[slot] = this.projectile.source[slot] = 0;
        this.enemy.supportTarget[slot] = this.action.target[slot] = 0;
        this.status.clear(slot);
        this.enemy.runningNode[slot] = -1;
        this.world.destroy(this.world.ids[slot]);
    }

    public updateSpatial(slot: number, category: number): void {
        const p = this.position;
        this.spatial.update(slot, p.x[slot], p.z[slot], p.radius[slot], category);
    }

    public queryNearby(category: number, x: number, z: number, radius: number, includeBody = false, ordered = false): SpatialQuery {
        const extent = radius + (includeBody ? this.spatial.maximumRadius : 0), result = this.nearby, p = this.position;
        this.spatial.query(x - extent, z - extent, x + extent, z + extent, category, result);
        let count = 0;
        for (let i = 0; i < result.count; i++) {
            const slot = result.slots[i], reach = radius + (includeBody ? p.radius[slot] : 0);
            if ((p.x[slot] - x) ** 2 + (p.z[slot] - z) ** 2 <= reach * reach) result.slots[count++] = slot;
        }
        result.count = count;
        // Side effects consume RNG/inventory in stable handle order, independent of hash-chain order.
        if (ordered) result.slots.subarray(0, count).sort((a, b) => this.world.ids[a] - this.world.ids[b]);
        return result;
    }

    private place(slot: number, x: number, z: number, radius: number, category = 0): void {
        const p = this.position;
        p.x[slot] = p.previousX[slot] = x; p.z[slot] = p.previousZ[slot] = z;
        p.radius[slot] = radius; p.heading[slot] = 0;
        if (category) this.updateSpatial(slot, category);
    }
}
