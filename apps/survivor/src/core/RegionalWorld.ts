import { DeterministicRandom } from "./DeterministicRandom";
import type { Rarity } from "./Loot";

export const COMBAT_CHUNK_SIZE = 12;
export const REGION_RADIUS = 24;
export const ACTIVE_CHUNK_RADIUS = 1;
export const LOW_FREQUENCY_CHUNK_RADIUS = 2;
export const RETAINED_CHUNK_RADIUS = 3;
export const MAX_COMBAT_CHUNKS = (RETAINED_CHUNK_RADIUS * 2 + 1) ** 2;
export const LOW_FREQUENCY_TICKS = 10;
export type RegionDifficulty = "normal" | "hard" | "horror";
export type SimulationLod = "active" | "low" | "static" | "unloaded";
export const REGION_RULES = Object.freeze({
    normal: Object.freeze({ name: "常规地域", population: 7, scale: 1, levelOffset: 0, eliteChance: 0.05 }),
    hard: Object.freeze({ name: "困难地域", population: 9, scale: 1.25, levelOffset: 2, eliteChance: 0.2 }),
    horror: Object.freeze({ name: "恐怖地域", population: 10, scale: 1.6, levelOffset: 4, eliteChance: 0.35 })
});
export const CHEST_TIERS = ["bronze", "silver", "gold", "diamond", "rainbow"] as const;
export type ChestTier = typeof CHEST_TIERS[number];
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
export interface RegionalChest {
    readonly x: number;
    readonly z: number;
    readonly tier: ChestTier;
    readonly region: RegionInfo;
    readonly hasOrb: boolean;
}
export interface RegionalSpawn {
    readonly x: number;
    readonly z: number;
    readonly region: RegionInfo;
    readonly level: number;
    readonly kind: 0 | 1 | 2 | 3;
    readonly elite: boolean;
    readonly boss: boolean;
}
export interface RegionalChunk {
    readonly key: string;
    readonly x: number;
    readonly z: number;
    readonly spawns: readonly RegionalSpawn[];
    readonly spawned: Uint8Array;
    readonly chest: RegionalChest | undefined;
    chestOpened: boolean;
    resident: boolean;
    lod: SimulationLod;
}

export function hexDistance(x: number, z: number): number { return Math.max(Math.abs(x), Math.abs(z), Math.abs(x + z)); }
export function regionCenter(q: number, r: number): { x: number; z: number } {
    return { x: REGION_RADIUS * 1.5 * q, z: REGION_RADIUS * Math.sqrt(3) * (r + q / 2) };
}
function regionCoordinates(x: number, z: number): { x: number; z: number } {
    const q = x / (REGION_RADIUS * 1.5);
    const r = z / (REGION_RADIUS * Math.sqrt(3)) - q / 2;
    let rx = Math.round(q);
    let rz = Math.round(r);
    const ry = Math.round(-q - r);
    const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dz > dy) rz = -rx - ry;
    return { x: rx, z: rz };
}

/** Hexagonal content regions and square residency chunks have separate responsibilities. */
export class RegionalWorld {
    public readonly chunks = new Map<string, RegionalChunk>();
    private centerX = Infinity;
    private centerZ = Infinity;

    constructor(private readonly seed: string | number, private readonly origin: { readonly x: number; readonly z: number }) {}
    public chunkX(x: number): number { return this.origin.x - COMBAT_CHUNK_SIZE / 2 + x * COMBAT_CHUNK_SIZE; }
    public chunkZ(z: number): number { return this.origin.z - COMBAT_CHUNK_SIZE / 2 + z * COMBAT_CHUNK_SIZE; }

    public regionAt(x: number, z: number): RegionInfo {
        const hex = regionCoordinates(x - this.origin.x, z - this.origin.z);
        return this.regionAtHex(hex.x, hex.z);
    }
    public regionAtHex(x: number, z: number): RegionInfo {
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
    public lodAt(x: number, z: number): SimulationLod {
        const distance = Math.max(Math.abs(Math.floor((x - this.origin.x + 6) / COMBAT_CHUNK_SIZE) - this.centerX),
            Math.abs(Math.floor((z - this.origin.z + 6) / COMBAT_CHUNK_SIZE) - this.centerZ));
        return distance <= ACTIVE_CHUNK_RADIUS ? "active" : distance <= LOW_FREQUENCY_CHUNK_RADIUS ? "low"
            : distance <= RETAINED_CHUNK_RADIUS ? "static" : "unloaded";
    }
    public synchronize(x: number, z: number): boolean {
        const cx = Math.floor((x - this.origin.x + 6) / COMBAT_CHUNK_SIZE);
        const cz = Math.floor((z - this.origin.z + 6) / COMBAT_CHUNK_SIZE);
        if (cx === this.centerX && cz === this.centerZ) return false;
        this.centerX = cx;
        this.centerZ = cz;
        for (const [key, chunk] of this.chunks) {
            chunk.lod = this.lodAt(this.chunkX(chunk.x) + 6, this.chunkZ(chunk.z) + 6);
            if (chunk.lod === "unloaded") { chunk.resident = false; this.chunks.delete(key); }
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
    private createChunk(x: number, z: number): RegionalChunk {
        const key = `${x},${z}`;
        const random = new DeterministicRandom(`${this.seed}:chunk:${key}`);
        const region = this.regionAt(this.chunkX(x) + 6, this.chunkZ(z) + 6);
        const spawns: RegionalSpawn[] = [];
        for (let slot = 0; slot < REGION_RULES[region.difficulty].population; slot += 1) {
            const px = this.chunkX(x + 0.08 + random.next() * 0.84);
            const pz = this.chunkZ(z + 0.08 + random.next() * 0.84);
            const ownRegion = this.regionAt(px, pz);
            const elite = random.chance(REGION_RULES[ownRegion.difficulty].eliteChance);
            const kind = random.pick(ownRegion.difficulty === "normal" ? [0, 0, 1] as const
                : ownRegion.difficulty === "hard" ? [0, 1, 2] as const : [1, 2, 3] as const);
            spawns.push(Object.freeze({ x: px, z: pz, region: ownRegion, kind, elite, boss: false,
                level: Math.max(1, ownRegion.level + random.integer(3) - 1 + Number(elite)) }));
        }
        for (const candidate of this.nearbyRegions(region, 1)) {
            if (candidate.difficulty !== "horror") continue;
            if (candidate.centerX < this.chunkX(x) || candidate.centerX >= this.chunkX(x + 1)
                || candidate.centerZ < this.chunkZ(z) || candidate.centerZ >= this.chunkZ(z + 1)) continue;
            spawns.push(Object.freeze({ x: candidate.centerX, z: candidate.centerZ, region: candidate,
                kind: 3, elite: true, boss: true, level: candidate.level + 3 }));
        }
        let chest: RegionalChest | undefined;
        if (random.chance(0.5)) {
            const px = this.chunkX(x + 0.2 + random.next() * 0.6);
            const pz = this.chunkZ(z + 0.2 + random.next() * 0.6);
            const ownRegion = this.regionAt(px, pz);
            const danger = ownRegion.difficulty === "horror" ? 2 : ownRegion.difficulty === "hard" ? 1 : 0;
            const roll = random.next();
            const tier = roll < 0.004 + danger * 0.008 ? "rainbow" : roll < 0.025 + danger * 0.025 ? "diamond"
                : roll < 0.14 + danger * 0.08 ? "gold" : roll < 0.45 + danger * 0.1 ? "silver" : "bronze";
            chest = Object.freeze({ x: px, z: pz, region: ownRegion, tier, hasOrb: random.chance(0.35 + CHEST_TIERS.indexOf(tier) * 0.15) });
        }
        return { key, x, z, spawns: Object.freeze(spawns), spawned: new Uint8Array(spawns.length), chest,
            chestOpened: false, resident: true, lod: this.lodAt(this.chunkX(x) + 6, this.chunkZ(z) + 6) };
    }
}
