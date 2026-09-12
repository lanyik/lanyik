import { createWorldSurfaceResolver, createWorldSurfaceView, generateWorldTreePositions, getHexCenter, Land, type MapInfo, type TileInfo } from "three-hex-map";
import type { CombatTerrain } from "../core/CombatTerrain";
import { COMBAT_ENVIRONMENT, COMBAT_WATER_STYLE } from "./CombatEnvironment";

const CHUNK = 12, CELL = .5, EDGE = CHUNK / CELL, MAX_CHUNKS = 100;
const MAX_SLOPE = Math.tan(40 * Math.PI / 180);
interface TerrainChunk { readonly blocked: Uint8Array; readonly trees: readonly { x: number; z: number; scale: number }[] }
const isWater = (tile: TileInfo) => tile.type === Land.sea || tile.type === Land.coastal || tile.modifiers?.includes("lake") || tile.modifiers?.includes("river");

/** Bounded CPU cache. Generation runs once per chunk; movement only reads masks and nearby trunks. */
export class ProceduralCombatTerrain implements CombatTerrain {
    private readonly resolver;
    private readonly chunks = new Map<string, TerrainChunk>();
    private readonly result = { x: 0, z: 0 };
    constructor(seed: string | number) { this.resolver = createWorldSurfaceResolver({ seed, waterStyle: COMBAT_WATER_STYLE }); }
    public get cachedChunks(): number { return this.chunks.size; }
    public dispose(): void { this.chunks.clear(); }

    public isClear(x: number, z: number, radius: number): boolean {
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
                if (dx * dx + dz * dz <= radius * radius) return false;
            }
            for (const tree of chunk.trees) if ((tree.x - x) ** 2 + (tree.z - z) ** 2 < (radius + .2 * tree.scale) ** 2) return false;
        }
        return true;
    }

    public move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean) {
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .15)), sx = dx / steps, sz = dz / steps;
        for (let step = 0; step < steps; step++) {
            if (this.isClear(x + sx, z + sz, radius)) { x += sx; z += sz; }
            else if (slide) {
                if (sx !== 0 && this.isClear(x + sx, z, radius)) x += sx;
                if (sz !== 0 && this.isClear(x, z + sz, radius)) z += sz;
            } else break;
        }
        this.result.x = x; this.result.z = z; return this.result;
    }

    private chunk(cx: number, cz: number): TerrainChunk {
        const key = `${cx},${cz}`;
        const existing = this.chunks.get(key);
        if (existing) return existing;
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
            const chunk = { blocked, trees }; this.chunks.set(key, chunk); return chunk;
        } finally { window.clear(); }
    }
}
