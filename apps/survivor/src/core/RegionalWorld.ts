import { DeterministicRandom } from "./DeterministicRandom";
import type { Rarity } from "./Equipment";

export const COMBAT_CHUNK_SIZE = 12;
export const ACTIVE_CHUNK_RADIUS = 1;
export const LOW_FREQUENCY_CHUNK_RADIUS = 2;
export const RETAINED_CHUNK_RADIUS = 3;
export const MAX_COMBAT_CHUNKS = (RETAINED_CHUNK_RADIUS * 2 + 1) ** 2;
export const LOW_FREQUENCY_TICKS = 10;
export const WORLD_RENEWAL_TICKS = 9_000;
export type RegionDifficulty = "normal" | "hard" | "horror";
export type SimulationLod = "active" | "low" | "static" | "unloaded";
export const REGION_RULES = Object.freeze({
    normal: Object.freeze({ name: "常规怪物区", population: 6, scale: 1, level: 1, eliteChance: 0.04, respawnTicks: 1_250 }),
    hard: Object.freeze({ name: "困难怪物区", population: 8, scale: 2.1, level: 5, eliteChance: 0.22, respawnTicks: 1_000 }),
    horror: Object.freeze({ name: "恐怖怪物区", population: 10, scale: 3.6, level: 10, eliteChance: 0.4, respawnTicks: 750 })
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
    readonly difficulty: RegionDifficulty;
    readonly level: number;
    readonly minX: number;
    readonly minZ: number;
    readonly bossX: number;
    readonly bossZ: number;
}
export interface RegionalChest {
    readonly x: number;
    readonly z: number;
    readonly tier: ChestTier;
}
export interface RegionalChunk {
    readonly key: string;
    readonly x: number;
    readonly z: number;
    readonly region: RegionInfo;
    readonly random: DeterministicRandom;
    readonly enemyIds: Uint32Array;
    readonly respawnAt: Float64Array;
    readonly hasBoss: boolean;
    readonly chest: RegionalChest | undefined;
    resident: boolean;
    lod: SimulationLod;
}

/** Spatial content uses independent seeds; combat rolls cannot change another region's layout. */
export class RegionalWorld {
    public readonly chunks = new Map<string, RegionalChunk>();
    private centerX = Infinity;
    private centerZ = Infinity;
    private epoch = -1;
    private readonly claimed = new Set<string>();
    private readonly originX: number;
    private readonly originZ: number;

    constructor(private readonly seed: string | number, start: { readonly x: number; readonly z: number }) {
        this.originX = start.x - COMBAT_CHUNK_SIZE * 1.5;
        this.originZ = start.z - COMBAT_CHUNK_SIZE * 1.5;
    }

    public chunkX(x: number): number { return this.originX + x * COMBAT_CHUNK_SIZE; }
    public chunkZ(z: number): number { return this.originZ + z * COMBAT_CHUNK_SIZE; }

    public regionAt(x: number, z: number): RegionInfo {
        const rx = Math.floor((x - this.originX) / (COMBAT_CHUNK_SIZE * 3));
        const rz = Math.floor((z - this.originZ) / (COMBAT_CHUNK_SIZE * 3));
        const random = new DeterministicRandom(`${this.seed}:region:${rx},${rz}`);
        const roll = random.next();
        const distance = Math.max(Math.abs(rx), Math.abs(rz));
        const difficulty = distance === 0 ? "normal" : roll < 0.2 ? "horror" : roll < 0.55 ? "hard" : "normal";
        return Object.freeze({ x: rx, z: rz, difficulty, level: REGION_RULES[difficulty].level + Math.floor(distance / 3),
            minX: this.chunkX(rx * 3), minZ: this.chunkZ(rz * 3),
            bossX: this.chunkX(rx * 3 + 1.5), bossZ: this.chunkZ(rz * 3 + 1.5) });
    }

    public lodAt(x: number, z: number): SimulationLod {
        const distance = Math.max(Math.abs(Math.floor((x - this.originX) / COMBAT_CHUNK_SIZE) - this.centerX), Math.abs(Math.floor((z - this.originZ) / COMBAT_CHUNK_SIZE) - this.centerZ));
        return distance <= ACTIVE_CHUNK_RADIUS ? "active" : distance <= LOW_FREQUENCY_CHUNK_RADIUS ? "low"
            : distance <= RETAINED_CHUNK_RADIUS ? "static" : "unloaded";
    }

    public synchronize(x: number, z: number, tick: number): boolean {
        const epoch = Math.floor(tick / WORLD_RENEWAL_TICKS);
        if (epoch !== this.epoch) {
            this.epoch = epoch;
            this.claimed.clear();
        }
        const cx = Math.floor((x - this.originX) / COMBAT_CHUNK_SIZE);
        const cz = Math.floor((z - this.originZ) / COMBAT_CHUNK_SIZE);
        if (cx === this.centerX && cz === this.centerZ) return false;
        this.centerX = cx;
        this.centerZ = cz;
        for (const [key, chunk] of this.chunks) {
            chunk.lod = this.lodAt(this.chunkX(chunk.x), this.chunkZ(chunk.z));
            if (chunk.lod === "unloaded") {
                chunk.resident = false;
                this.chunks.delete(key);
            }
        }
        // Near-first creation reserves content before filling the retained rings.
        for (let ring = 0; ring <= RETAINED_CHUNK_RADIUS; ring += 1) {
            for (let dx = -ring; dx <= ring; dx += 1) {
                for (let dz = -ring; dz <= ring; dz += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                    const key = `${cx + dx},${cz + dz}`;
                    if (!this.chunks.has(key)) this.chunks.set(key, this.createChunk(cx + dx, cz + dz));
                }
            }
        }
        return true;
    }

    public isClaimed(kind: "chest" | "boss", chunk: RegionalChunk): boolean {
        return this.claimed.has(`${kind}:${chunk.key}`);
    }

    public claim(kind: "chest" | "boss", chunk: RegionalChunk): void {
        this.claimed.add(`${kind}:${chunk.key}`);
    }

    public chestRandom(chunk: RegionalChunk): DeterministicRandom {
        return new DeterministicRandom(`${this.seed}:chest:${chunk.key}:${this.epoch}`);
    }

    private createChunk(x: number, z: number): RegionalChunk {
        const key = `${x},${z}`;
        const random = new DeterministicRandom(`${this.seed}:chunk:${key}`);
        const region = this.regionAt(this.chunkX(x), this.chunkZ(z));
        const hasBoss = region.difficulty === "horror" && x === region.x * 3 + 1 && z === region.z * 3 + 1;
        const count = REGION_RULES[region.difficulty].population + Number(hasBoss);
        let chest: RegionalChest | undefined;
        if (random.chance(0.48)) {
            const roll = random.next();
            const danger = region.difficulty === "horror" ? 2 : region.difficulty === "hard" ? 1 : 0;
            const tier = roll < 0.004 + danger * 0.008 ? "rainbow" : roll < 0.025 + danger * 0.025 ? "diamond"
                : roll < 0.14 + danger * 0.08 ? "gold" : roll < 0.45 + danger * 0.1 ? "silver" : "bronze";
            chest = Object.freeze({ x: this.chunkX(x + 0.2 + random.next() * 0.6),
                z: this.chunkZ(z + 0.2 + random.next() * 0.6), tier });
        }
        return { key, x, z, region, random, hasBoss, chest, enemyIds: new Uint32Array(count), respawnAt: new Float64Array(count),
            resident: true, lod: this.lodAt(this.chunkX(x), this.chunkZ(z)) };
    }
}
