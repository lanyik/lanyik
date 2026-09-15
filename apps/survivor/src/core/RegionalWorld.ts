import { DeterministicRandom } from "./DeterministicRandom";
import type { Rarity } from "./Loot";
import { ENEMY_DEFINITIONS, EnemyKind } from "./EnemyDefinitions";
import { WORLD_VIEW } from "./WorldView";
import { OPEN_TERRAIN, type CombatTerrain } from "./CombatTerrain";
import { ENCOUNTER_CELL, ENCOUNTER_EDGE, EncounterNavigation } from "./EncounterNavigation";

export const COMBAT_CHUNK_SIZE = WORLD_VIEW.chunkSize;
const COMBAT_CHUNK_HALF_SIZE = COMBAT_CHUNK_SIZE / 2;
export const REGION_RADIUS = 24;
const NEAR_CHUNK_RADIUS = 1;
const BUFFER_CHUNK_RADIUS = 2;
const RETAINED_CHUNK_RADIUS = WORLD_VIEW.residentRadius;
export const MAX_COMBAT_CHUNKS = (RETAINED_CHUNK_RADIUS * 2 + 1) ** 2;
type RegionDifficulty = "normal" | "hard" | "horror";
type ResidencyBand = "near" | "buffer" | "retained" | "unloaded";
/** Explicit ecological groups: wildlife does not randomly share a cult's camp. */
export const SETTLEMENTS = Object.freeze({
    brood: Object.freeze({ name: "蛛兽巢群", members: Object.freeze([EnemyKind.Scout, EnemyKind.Scout, EnemyKind.Scout]) }),
    raiders: Object.freeze({ name: "地精营地", members: Object.freeze([EnemyKind.Charger, EnemyKind.Grunt, EnemyKind.Grunt]) }),
    cult: Object.freeze({ name: "祭司据点", members: Object.freeze([EnemyKind.Caster, EnemyKind.Guard, EnemyKind.Healer, EnemyKind.Guard]) }),
    warband: Object.freeze({ name: "混合掠夺营", members: Object.freeze([EnemyKind.Charger, EnemyKind.Grunt, EnemyKind.Caster, EnemyKind.Grunt, EnemyKind.Healer]) })
});
type SettlementKind = keyof typeof SETTLEMENTS;
interface Settlement { readonly kind: SettlementKind; readonly x: number; readonly z: number }
export const REGION_RULES = Object.freeze({
    normal: Object.freeze({ name: "常规地域", population: 7, scale: 1, levelOffset: 0, eliteChance: 0.05 }),
    hard: Object.freeze({ name: "困难地域", population: 9, scale: 1.25, levelOffset: 2, eliteChance: 0.2 }),
    horror: Object.freeze({ name: "恐怖地域", population: 10, scale: 1.6, levelOffset: 4, eliteChance: 0.35 })
});
export const CHEST_TIERS = ["bronze", "silver", "gold", "diamond", "rainbow"] as const;
type ChestTier = typeof CHEST_TIERS[number];
export const CHEST_RULES: Readonly<Record<ChestTier, { readonly name: string; readonly rarity: Rarity; readonly gold: number }>> = Object.freeze({
    bronze: Object.freeze({ name: "青铜宝箱", rarity: "common", gold: 15 }),
    silver: Object.freeze({ name: "白银宝箱", rarity: "magic", gold: 35 }),
    gold: Object.freeze({ name: "黄金宝箱", rarity: "legendary", gold: 80 }),
    diamond: Object.freeze({ name: "钻石宝箱", rarity: "diamond", gold: 160 }),
    rainbow: Object.freeze({ name: "七彩宝箱", rarity: "rainbow", gold: 360 })
});
export interface RegionInfo {
    readonly x: number;
    readonly z: number;
    readonly ring: number;
    readonly difficulty: RegionDifficulty;
    readonly level: number;
    readonly bandMin: number;
    readonly bandMax: number;
    readonly centerX: number;
    readonly centerZ: number;
}
interface RegionalChest {
    readonly x: number;
    readonly z: number;
    readonly tier: ChestTier;
    readonly region: RegionInfo;
    readonly hasOrb: boolean;
}
export interface RegionalSpawn {
    readonly settlement?: Settlement;
    readonly x: number;
    readonly z: number;
    readonly region: RegionInfo;
    readonly level: number;
    readonly kind: EnemyKind;
    readonly elite: boolean;
    readonly boss: boolean;
}
export interface RegionalChunk {
    readonly key: string;
    readonly x: number;
    readonly z: number;
    readonly spawns: readonly RegionalSpawn[];
    readonly spawned: Uint8Array;
    readonly navigation: EncounterNavigation;
    readonly chest: RegionalChest | undefined;
    chestOpened: boolean;
    resident: boolean;
    band: ResidencyBand;
}

export function hexDistance(x: number, z: number): number { return Math.max(Math.abs(x), Math.abs(z), Math.abs(x + z)); }
function regionCenter(q: number, r: number): { x: number; z: number } {
    return { x: REGION_RADIUS * 1.5 * q, z: REGION_RADIUS * Math.sqrt(3) * (r + q / 2) };
}
/** Hexagonal content regions and square residency chunks have separate responsibilities. */
export class RegionalWorld {
    public readonly chunks = new Map<string, RegionalChunk>();
    private centerX = Infinity;
    private centerZ = Infinity;
    private accessCell = "";
    private topologyChanged = true;

    constructor(private readonly seed: string | number, private readonly origin: { readonly x: number; readonly z: number },
        private readonly terrain: CombatTerrain = OPEN_TERRAIN) {}
    public chunkX(x: number): number { return this.origin.x - COMBAT_CHUNK_HALF_SIZE + x * COMBAT_CHUNK_SIZE; }
    public chunkZ(z: number): number { return this.origin.z - COMBAT_CHUNK_HALF_SIZE + z * COMBAT_CHUNK_SIZE; }

    /** Reuse a region from this world while the position remains inside its hex. */
    public regionAt(x: number, z: number, current?: RegionInfo): RegionInfo {
        const q = (x - this.origin.x) / (REGION_RADIUS * 1.5);
        const r = (z - this.origin.z) / (REGION_RADIUS * Math.sqrt(3)) - q / 2;
        let rx = Math.round(q), rz = Math.round(r);
        const ry = Math.round(-q - r);
        const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
        if (dx > dy && dx > dz) rx = -ry - rz;
        else if (dz > dy) rz = -rx - ry;
        return current && current.x === rx && current.z === rz ? current : this.regionAtHex(rx, rz);
    }
    public regionAtHex(x: number, z: number): RegionInfo {
        x = x === 0 ? 0 : x; z = z === 0 ? 0 : z;
        const random = new DeterministicRandom(`${this.seed}:region:${x},${z}`);
        const roll = random.next();
        const ring = hexDistance(x, z);
        const horrorChance = Math.min(0.3, 0.12 + ring * 0.02);
        const difficulty = ring === 0 ? "normal" : roll < horrorChance ? "horror" : roll < horrorChance + 0.32 ? "hard" : "normal";
        const center = regionCenter(x, z);
        const bandMin = 1 + ring * 5;
        return Object.freeze({ x, z, ring, difficulty, bandMin, bandMax: bandMin + 4,
            level: bandMin + REGION_RULES[difficulty].levelOffset, centerX: this.origin.x + center.x, centerZ: this.origin.z + center.z });
    }
    public nearbyRegions(region: RegionInfo, radius = 2): readonly RegionInfo[] {
        const result: RegionInfo[] = [];
        for (let x = -radius; x <= radius; x += 1) for (let z = -radius; z <= radius; z += 1) {
            if (hexDistance(x, z) <= radius) result.push(this.regionAtHex(region.x + x, region.z + z));
        }
        return Object.freeze(result);
    }
    public residencyAt(x: number, z: number): ResidencyBand {
        const distance = Math.max(Math.abs(Math.floor((x - this.origin.x + COMBAT_CHUNK_HALF_SIZE) / COMBAT_CHUNK_SIZE) - this.centerX),
            Math.abs(Math.floor((z - this.origin.z + COMBAT_CHUNK_HALF_SIZE) / COMBAT_CHUNK_SIZE) - this.centerZ));
        return distance <= NEAR_CHUNK_RADIUS ? "near" : distance <= BUFFER_CHUNK_RADIUS ? "buffer"
            : distance <= RETAINED_CHUNK_RADIUS ? "retained" : "unloaded";
    }
    public synchronize(x: number, z: number): boolean {
        const cx = Math.floor((x - this.origin.x + COMBAT_CHUNK_HALF_SIZE) / COMBAT_CHUNK_SIZE);
        const cz = Math.floor((z - this.origin.z + COMBAT_CHUNK_HALF_SIZE) / COMBAT_CHUNK_SIZE);
        if (cx === this.centerX && cz === this.centerZ) return false;
        this.centerX = cx;
        this.centerZ = cz;
        this.topologyChanged = true;
        for (const [key, chunk] of this.chunks) {
            chunk.band = this.residencyAt(this.chunkX(chunk.x) + COMBAT_CHUNK_HALF_SIZE, this.chunkZ(chunk.z) + COMBAT_CHUNK_HALF_SIZE);
            if (chunk.band === "unloaded") { chunk.resident = false; this.chunks.delete(key); }
        }
        for (let ring = 0; ring <= RETAINED_CHUNK_RADIUS; ring += 1) {
            for (let dx = -ring; dx <= ring; dx += 1) for (let dz = -ring; dz <= ring; dz += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                const key = `${cx + dx},${cz + dz}`;
                if (!this.chunks.has(key)) this.chunks.set(key, this.createChunk(cx + dx, cz + dz));
            }
        }
        return true;
    }

    public resetAccess(): void {
        for (const chunk of this.chunks.values()) chunk.navigation.reached.fill(0);
        this.topologyChanged = true; this.accessCell = "";
    }

    /** Propagate proven access through adjacent chunk portals. Locations never depend on the player's route. */
    public updateAccess(x: number, z: number): boolean {
        const cell = `${Math.floor((x - this.origin.x) / ENCOUNTER_CELL)},${Math.floor((z - this.origin.z) / ENCOUNTER_CELL)}`;
        if (cell === this.accessCell && !this.topologyChanged) return false;
        this.accessCell = cell;
        const queue: { chunk: RegionalChunk; component: number }[] = [];
        if (this.topologyChanged) for (const chunk of this.chunks.values()) {
            for (let component = 1; component < chunk.navigation.reached.length; component++) {
                if (chunk.navigation.reached[component]) queue.push({ chunk, component });
            }
        }
        this.topologyChanged = false;
        const current = this.chunks.get(`${Math.floor((x - this.origin.x + COMBAT_CHUNK_HALF_SIZE) / COMBAT_CHUNK_SIZE)},${Math.floor((z - this.origin.z + COMBAT_CHUNK_HALF_SIZE) / COMBAT_CHUNK_SIZE)}`);
        if (current) {
            const component = current.navigation.entry(x, z);
            if (component && !current.navigation.reached[component]) { current.navigation.reached[component] = 1; queue.push({ chunk: current, component }); }
        }
        for (let head = 0; head < queue.length; head++) {
            const { chunk, component } = queue[head];
            for (const border of chunk.navigation.borders[component]) {
                const cx = border % ENCOUNTER_EDGE, cz = Math.floor(border / ENCOUNTER_EDGE);
                for (let direction = 0; direction < 4; direction++) {
                    const dx = direction === 0 && cx === 0 ? -1 : direction === 1 && cx === ENCOUNTER_EDGE - 1 ? 1 : 0;
                    const dz = direction === 2 && cz === 0 ? -1 : direction === 3 && cz === ENCOUNTER_EDGE - 1 ? 1 : 0;
                    if (!dx && !dz) continue;
                    const neighbor = this.chunks.get(`${chunk.x + dx},${chunk.z + dz}`);
                    if (!neighbor) continue;
                    const next = border - dx * (ENCOUNTER_EDGE - 1) - dz * (ENCOUNTER_EDGE - 1) * ENCOUNTER_EDGE;
                    const label = neighbor.navigation.labels[next];
                    if (!label || neighbor.navigation.reached[label]) continue;
                    neighbor.navigation.reached[label] = 1; queue.push({ chunk: neighbor, component: label });
                }
            }
        }
        return true;
    }
    private createChunk(x: number, z: number): RegionalChunk {
        const key = `${x},${z}`;
        const random = new DeterministicRandom(`${this.seed}:chunk:${key}`);
        const region = this.regionAt(this.chunkX(x) + COMBAT_CHUNK_HALF_SIZE, this.chunkZ(z) + COMBAT_CHUNK_HALF_SIZE);
        const spawns: RegionalSpawn[] = [];
        const bossRegion = this.nearbyRegions(region, 1).find(candidate => candidate.difficulty === "horror"
            && candidate.centerX >= this.chunkX(x) && candidate.centerX < this.chunkX(x + 1)
            && candidate.centerZ >= this.chunkZ(z) && candidate.centerZ < this.chunkZ(z + 1));
        const choices: readonly SettlementKind[] = region.difficulty === "normal" ? ["brood", "raiders"] : ["brood", "raiders", "cult", "warband"];
        const settlement: Settlement = Object.freeze({ kind: bossRegion ? "cult" : random.pick(choices),
            x: bossRegion?.centerX ?? this.chunkX(x + .35 + random.next() * .3),
            z: bossRegion?.centerZ ?? this.chunkZ(z + .35 + random.next() * .3) });
        const members = SETTLEMENTS[settlement.kind].members, orientation = random.next() * Math.PI * 2;
        for (let slot = 0; slot < REGION_RULES[region.difficulty].population; slot += 1) {
            const angle = orientation + slot * 2.399963 + (random.next() - .5) * .35;
            const radius = .9 + Math.sqrt(slot / REGION_RULES[region.difficulty].population) * 2.1;
            const px = Math.max(this.chunkX(x) + .6, Math.min(this.chunkX(x + 1) - .6, settlement.x + Math.sin(angle) * radius));
            const pz = Math.max(this.chunkZ(z) + .6, Math.min(this.chunkZ(z + 1) - .6, settlement.z + Math.cos(angle) * radius));
            const ownRegion = this.regionAt(px, pz);
            const elite = random.chance(REGION_RULES[ownRegion.difficulty].eliteChance);
            const kind = members[slot % members.length];
            spawns.push(Object.freeze({ x: px, z: pz, region: ownRegion, settlement, kind, elite, boss: false,
                level: Math.max(1, ownRegion.level + random.integer(3) - 1 + Number(elite)) }));
        }
        if (bossRegion) {
            spawns.push(Object.freeze({ x: bossRegion.centerX, z: bossRegion.centerZ, region: bossRegion, settlement,
                kind: EnemyKind.Caster, elite: true, boss: true, level: bossRegion.level + 3 }));
        }
        let chest: RegionalChest | undefined;
        const treasure = new DeterministicRandom(`${this.seed}:chest:${key}`);
        if (treasure.chance(0.5)) {
            const px = this.chunkX(x + 0.2 + treasure.next() * 0.6);
            const pz = this.chunkZ(z + 0.2 + treasure.next() * 0.6);
            const ownRegion = this.regionAt(px, pz);
            const danger = ownRegion.difficulty === "horror" ? 2 : ownRegion.difficulty === "hard" ? 1 : 0;
            const roll = treasure.next();
            const tier = roll < 0.004 + danger * 0.008 ? "rainbow" : roll < 0.025 + danger * 0.025 ? "diamond"
                : roll < 0.14 + danger * 0.08 ? "gold" : roll < 0.45 + danger * 0.1 ? "silver" : "bronze";
            chest = Object.freeze({ x: px, z: pz, region: ownRegion, tier, hasOrb: treasure.chance(0.35 + CHEST_TIERS.indexOf(tier) * 0.15) });
        }
        const navigation = new EncounterNavigation(this.terrain, this.chunkX(x), this.chunkZ(z));
        const placed: RegionalSpawn[] = [], occupied: { x: number; z: number; radius: number }[] = [];
        const boss = spawns.find(spawn => spawn.boss);
        const bodyRadius = (spawn: RegionalSpawn) => ENEMY_DEFINITIONS[spawn.kind].radius * (spawn.boss ? 2.5 : spawn.elite ? 1.28 : 1) + .08;
        const anchor = navigation.nearest(settlement.x, settlement.z, boss ? bodyRadius(boss) : .55, 0, [],
            boss ? (px, pz) => this.regionAt(px, pz, boss.region) === boss.region : undefined);
        if (anchor) {
            const camp = Object.freeze({ kind: settlement.kind, x: anchor.x, z: anchor.z });
            // Reserve the boss's full body first, then fit its support within the same connected camp.
            for (const spawn of boss ? [boss, ...spawns.filter(candidate => !candidate.boss)] : spawns) {
                const radius = bodyRadius(spawn), px = anchor.x + spawn.x - settlement.x, pz = anchor.z + spawn.z - settlement.z;
                const point = navigation.nearest(px, pz, radius, anchor.component, occupied,
                    (tx, tz) => Math.hypot(tx - anchor.x, tz - anchor.z) <= 3 && this.regionAt(tx, tz, spawn.region) === spawn.region);
                if (!point) continue;
                placed.push(Object.freeze({ ...spawn, x: point.x, z: point.z, settlement: camp }));
                occupied.push({ x: point.x, z: point.z, radius });
            }
        }
        if (chest) {
            const ownRegion = chest.region;
            const point = navigation.nearest(chest.x, chest.z, .45, 0, occupied, (px, pz) => this.regionAt(px, pz, ownRegion) === ownRegion);
            chest = point ? Object.freeze({ ...chest, x: point.x, z: point.z }) : undefined;
        }
        return { key, x, z, spawns: Object.freeze(placed), spawned: new Uint8Array(placed.length), navigation, chest,
            chestOpened: false, resident: true, band: this.residencyAt(this.chunkX(x) + COMBAT_CHUNK_HALF_SIZE, this.chunkZ(z) + COMBAT_CHUNK_HALF_SIZE) };
    }
}
