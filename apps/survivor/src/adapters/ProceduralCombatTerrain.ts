import { createWorldSurfaceResolver, createWorldSurfaceView, generateWorldTreePositions, getHexCenter, Land, type MapInfo, type TileInfo } from "three-hex-map";
import type { CombatTerrain } from "../core/CombatTerrain";
import { SurfaceMotion, type SurfaceContact } from "../core/SurfaceMotion";
import { COMBAT_ENVIRONMENT, COMBAT_WATER_STYLE } from "./CombatEnvironment";
import { segmentCylinderHit } from "../core/AttackGeometry";

import { WORLD_VIEW } from "../core/WorldView";
const CHUNK = WORLD_VIEW.chunkSize, CELL = .5, EDGE = CHUNK / CELL, MAX_CHUNKS = WORLD_VIEW.navigationChunks;
const MAX_SLOPE = Math.tan(40 * Math.PI / 180);
interface TerrainChunk { readonly blocked: Uint8Array; readonly heights: Float64Array; readonly waters: Uint8Array;
    readonly trees: readonly { x: number; z: number; scale: number; baseHeight?: number }[] }
const isWater = (tile: TileInfo) => tile.type === Land.sea || tile.type === Land.coastal || tile.modifiers?.includes("lake") || tile.modifiers?.includes("river");
function interpolateHeight(chunk: TerrainChunk, gx: number, gz: number, ix: number, iz: number): number {
    const fx = gx - ix, fz = gz - iz, a = iz * (EDGE + 1) + ix, h = chunk.heights;
    return (h[a] * (1 - fx) + h[a + 1] * fx) * (1 - fz) + (h[a + EDGE + 1] * (1 - fx) + h[a + EDGE + 2] * fx) * fz;
}

/** Bounded CPU cache. Generation runs once per chunk; movement only reads masks and nearby trunks. */
export class ProceduralCombatTerrain implements CombatTerrain {
    private readonly resolver;
    private readonly chunks = new Map<string, TerrainChunk>();
    private lastChunk: TerrainChunk | undefined;
    private lastChunkX = 0;
    private lastChunkZ = 0;
    private readonly contactResult: SurfaceContact = { x: 0, z: 0, round: false };
    private contactDepth = -Infinity;
    private readonly motion = new SurfaceMotion((x, z, radius) => this.contact(x, z, radius));
    constructor(seed: string | number) { this.resolver = createWorldSurfaceResolver({ seed, waterStyle: COMBAT_WATER_STYLE }); }
    public get cachedChunks(): number { return this.chunks.size; }
    public dispose(): void { this.chunks.clear(); this.lastChunk = undefined; }

    public height(x: number, z: number): number {
        const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), chunk = this.chunk(cx, cz);
        const gx = (x - cx * CHUNK) / CELL, gz = (z - cz * CHUNK) / CELL;
        const ix = Math.min(EDGE - 1, Math.floor(gx)), iz = Math.min(EDGE - 1, Math.floor(gz));
        return interpolateHeight(chunk, gx, gz, ix, iz);
    }

    public traceAttack(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, radius: number): number {
        let first = Infinity;
        // Exact trunk sweep: short per-tick segments cannot tunnel through a thin trunk.
        for (let cx = Math.floor((Math.min(sx, ex) - radius) / CHUNK); cx <= Math.floor((Math.max(sx, ex) + radius) / CHUNK); cx++) {
            for (let cz = Math.floor((Math.min(sz, ez) - radius) / CHUNK); cz <= Math.floor((Math.max(sz, ez) + radius) / CHUNK); cz++) {
                for (const tree of this.chunk(cx, cz).trees) {
                    const reach = radius + .2 * tree.scale;
                    if (tree.x < Math.min(sx, ex) - reach || tree.x > Math.max(sx, ex) + reach
                        || tree.z < Math.min(sz, ez) - reach || tree.z > Math.max(sz, ez) + reach) continue;
                    const bottom = tree.baseHeight ??= this.height(tree.x, tree.z);
                    first = Math.min(first, segmentCylinderHit(sx, sy, sz, ex, ey, ez, tree.x, tree.z, bottom - radius, bottom + 2.5 * tree.scale + radius, reach));
                }
            }
        }
        const steps = Math.max(1, Math.ceil(Math.hypot(ex - sx, ez - sz) / (CELL / 4)));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            if (t > first) break;
            const x = sx + (ex - sx) * t, z = sz + (ez - sz) * t, y = sy + (ey - sy) * t;
            if (this.aboveGround(x, y, z, radius)) continue;
            let low = Math.max(0, (i - 1) / steps), high = t;
            for (let search = 0; search < 8; search++) {
                const mid = (low + high) / 2;
                if (this.aboveGround(sx + (ex - sx) * mid, sy + (ey - sy) * mid, sz + (ez - sz) * mid, radius)) low = mid; else high = mid;
            }
            first = Math.min(first, high); break;
        }
        return first;
    }

    private aboveGround(x: number, y: number, z: number, radius: number): boolean {
        const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), c = this.chunk(cx, cz);
        const gx = (x - cx * CHUNK) / CELL, gz = (z - cz * CHUNK) / CELL;
        const ix = Math.min(EDGE - 1, Math.floor(gx)), iz = Math.min(EDGE - 1, Math.floor(gz));
        const a = iz * (EDGE + 1) + ix;
        const water = c.waters[a] && c.waters[a + 1] && c.waters[a + EDGE + 1] && c.waters[a + EDGE + 2];
        return Boolean(water) || y - radius > interpolateHeight(c, gx, gz, ix, iz);
    }

    public isClear(x: number, z: number, radius: number): boolean {
        return !this.contact(x, z, radius, true);
    }

    private contact(x: number, z: number, radius: number, testOnly = false): SurfaceContact | undefined {
        this.contactDepth = -Infinity;
        const minX = Math.floor((x - radius) / CHUNK), maxX = Math.floor((x + radius) / CHUNK);
        const minZ = Math.floor((z - radius) / CHUNK), maxZ = Math.floor((z + radius) / CHUNK);
        for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) {
            const chunk = this.chunk(cx, cz), ox = cx * CHUNK, oz = cz * CHUNK;
            const sx = Math.max(0, Math.floor((x - radius - ox) / CELL)), ex = Math.min(EDGE - 1, Math.floor((x + radius - ox) / CELL));
            const sz = Math.max(0, Math.floor((z - radius - oz) / CELL)), ez = Math.min(EDGE - 1, Math.floor((z + radius - oz) / CELL));
            for (let ix = sx; ix <= ex; ix++) for (let iz = sz; iz <= ez; iz++) {
                if (!chunk.blocked[iz * EDGE + ix]) continue;
                const dx = x - Math.max(ox + ix * CELL, Math.min(ox + (ix + 1) * CELL, x));
                const dz = z - Math.max(oz + iz * CELL, Math.min(oz + (iz + 1) * CELL, z));
                if (dx * dx + dz * dz > radius * radius) continue;
                const distance = Math.hypot(dx, dz);
                // Clearance needs any contact; movement needs the deepest contact and its normal.
                if (testOnly && distance <= radius) return this.contactResult;
                if (distance > 0) this.recordContact(dx / distance, dz / distance, radius - distance, false);
                else {
                    const lx = x - (ox + ix * CELL), lz = z - (oz + iz * CELL);
                    const edge = Math.min(lx, CELL - lx, lz, CELL - lz);
                    this.recordContact(edge === lx ? -1 : edge === CELL - lx ? 1 : 0,
                        edge === lx || edge === CELL - lx ? 0 : edge === lz ? -1 : 1, radius + edge, false);
                }
            }
            for (const tree of chunk.trees) {
                const dx = x - tree.x, dz = z - tree.z, combined = radius + .2 * tree.scale;
                if (dx * dx + dz * dz > combined * combined) continue;
                const distance = Math.hypot(dx, dz);
                if (testOnly && distance <= combined) return this.contactResult;
                this.recordContact(distance > 0 ? dx / distance : 1, distance > 0 ? dz / distance : 0, combined - distance, true);
            }
        }
        return this.contactDepth >= 0 ? this.contactResult : undefined;
    }

    private recordContact(nx: number, nz: number, penetration: number, round: boolean): void {
        if (penetration < 0 || penetration <= this.contactDepth) return;
        this.contactDepth = penetration;
        this.contactResult.x = nx; this.contactResult.z = nz; this.contactResult.round = round;
    }

    public move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean) {
        return this.motion.move(x, z, dx, dz, radius, slide);
    }

    private chunk(cx: number, cz: number): TerrainChunk {
        // Adjacent height/cover samples usually stay in one chunk. Avoid allocating its
        // string key repeatedly; the single cached reference is cleared on disposal.
        if (this.lastChunk && cx === this.lastChunkX && cz === this.lastChunkZ) return this.lastChunk;
        const key = `${cx},${cz}`;
        this.lastChunkX = cx; this.lastChunkZ = cz; this.lastChunk = this.chunks.get(key);
        if (this.lastChunk) return this.lastChunk;
        const ox = cx * CHUNK, oz = cz * CHUNK, window = this.resolver.createWindow();
        const map: MapInfo = { w: 1, h: 1, infinite: true, data: {} }, points = [];
        try {
            for (let tx = Math.floor(ox / 1.5) - 3; tx <= Math.ceil((ox + CHUNK) / 1.5) + 3; tx++) {
                map.data[tx] = {};
                for (let ty = Math.floor(oz / Math.sqrt(3)) - 3; ty <= Math.ceil((oz + CHUNK) / Math.sqrt(3)) + 3; ty++) {
                    map.data[tx][ty] = window.resolveGeneratedTile(tx, ty);
                    points.push({ x: tx, y: ty });
                }
            }
            const surface = createWorldSurfaceView({ map, resolver: this.resolver, tileSize: 1, mountainHeight: COMBAT_ENVIRONMENT.mountainHeight / COMBAT_ENVIRONMENT.size });
            const sample = surface.createWindow(), heights = new Float64Array((EDGE + 1) ** 2), waters = new Uint8Array(heights.length);
            const waterAt = (x: number, z: number): boolean => {
                const tx = Math.floor(x / 1.5), ty = Math.floor(z / Math.sqrt(3));
                let distance = Infinity, water = false;
                for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
                    const center = getHexCenter(tx + i, ty + j, 1), d = (center.x - x) ** 2 + (center.y - z) ** 2;
                    if (d < distance) { distance = d; water = Boolean(isWater(map.data[tx + i][ty + j])); }
                }
                return water;
            };
            const blocked = new Uint8Array(EDGE * EDGE);
            try {
                for (let z = 0; z <= EDGE; z++) for (let x = 0; x <= EDGE; x++) {
                    const index = z * (EDGE + 1) + x;
                    heights[index] = sample.getWorldHeight(ox + x * CELL, oz + z * CELL);
                    waters[index] = Number(waterAt(ox + x * CELL, oz + z * CELL));
                }
                for (let z = 0; z < EDGE; z++) for (let x = 0; x < EDGE; x++) {
                    const a = z * (EDGE + 1) + x, b = a + 1, c = a + EDGE + 1, d = c + 1;
                    const gx = Math.max(Math.abs(heights[b] - heights[a]), Math.abs(heights[d] - heights[c])) / CELL;
                    const gz = Math.max(Math.abs(heights[c] - heights[a]), Math.abs(heights[d] - heights[b])) / CELL;
                    blocked[z * EDGE + x] = Number(waters[a] || waters[b] || waters[c] || waters[d] || Math.hypot(gx, gz) > MAX_SLOPE);
                }
            } finally { sample.clear(); }
            const trees = generateWorldTreePositions({ ...COMBAT_ENVIRONMENT, map, points, size: 1, grassDensity: 0, grassBladeWidth: 0, grassBladeHeight: 0, treeModel: "Assets/models/oak" }, surface)
                .filter(tree => tree.x >= ox - .25 && tree.x <= ox + CHUNK + .25 && tree.z >= oz - .25 && tree.z <= oz + CHUNK + .25);
            if (this.chunks.size === MAX_CHUNKS) this.chunks.delete(this.chunks.keys().next().value!);
            const chunk = { blocked, trees, heights, waters }; this.chunks.set(key, chunk); this.lastChunk = chunk; return chunk;
        } finally { window.clear(); }
    }
}
