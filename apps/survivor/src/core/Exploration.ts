import type { RegionalWorld } from "./RegionalWorld";
import { WORLD_VIEW } from "./WorldView";

export const EXPLORATION = Object.freeze({ cellSize: 4, pageEdge: 16, radius: WORLD_VIEW.terrainFogEnd, maxPages: 4096 });
interface ExplorationPage { readonly x: number; readonly z: number; readonly rows: readonly number[] }
export interface ExplorationSnapshot { readonly revision: number; readonly pages: readonly ExplorationPage[] }

export function validateExploration(value: ExplorationSnapshot): void {
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.pages)
        || value.pages.length > EXPLORATION.maxPages) throw new Error("探索记录无效");
    const keys = new Set<string>();
    for (const page of value.pages) {
        const key = `${page.x},${page.z}`;
        if (!Number.isSafeInteger(page.x) || !Number.isSafeInteger(page.z) || keys.has(key)
            || !Array.isArray(page.rows) || page.rows.length !== EXPLORATION.pageEdge
            || page.rows.some((row: number) => !Number.isInteger(row) || row < 0 || row > 0xffff)) throw new Error("探索分页无效");
        keys.add(key);
    }
}

/** Sparse permanent discovery; level-based visibility is queried, never materialized across an infinite world. */
export class Exploration {
    private readonly pages = new Map<string, ExplorationPage>();
    private revision = 0;
    private cached: ExplorationSnapshot | undefined;
    private lastX = Infinity;
    private lastZ = Infinity;

    constructor(state?: ExplorationSnapshot) {
        if (!state) return;
        validateExploration(state);
        for (const page of state.pages) this.pages.set(`${page.x},${page.z}`, Object.freeze({ ...page, rows: Object.freeze([...page.rows]) }));
        this.revision = state.revision;
    }
    public get snapshot(): ExplorationSnapshot {
        return this.cached ??= Object.freeze({ revision: this.revision, pages: Object.freeze([...this.pages.values()]) });
    }
    public has(x: number, z: number): boolean {
        const cx = Math.floor(x / EXPLORATION.cellSize), cz = Math.floor(z / EXPLORATION.cellSize);
        const px = Math.floor(cx / EXPLORATION.pageEdge), pz = Math.floor(cz / EXPLORATION.pageEdge);
        return Boolean((this.pages.get(`${px},${pz}`)?.rows[cz - pz * EXPLORATION.pageEdge] ?? 0) & (1 << (cx - px * EXPLORATION.pageEdge)));
    }
    public allows(x: number, z: number, level: number, world: RegionalWorld): boolean {
        return this.has(x, z) || world.regionAt(x, z).level < level;
    }
    /** Reveal everything the 3D view can show; exploration never controls 3D rendering. */
    public discover(x: number, z: number): void {
        const size = EXPLORATION.cellSize, edge = EXPLORATION.pageEdge;
        const cx = Math.floor(x / size), cz = Math.floor(z / size);
        if (cx === this.lastX && cz === this.lastZ) return;
        const changes = new Map<string, { x: number; z: number; rows: number[] }>();
        // Quantized centres can differ from the actual viewer and target by one cell diagonal.
        const radius = EXPLORATION.radius + Math.SQRT2 * size, reach = Math.ceil(radius / size);
        for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
            if (Math.hypot(dx * size, dz * size) > radius) continue;
            const gx = cx + dx, gz = cz + dz, px = Math.floor(gx / edge), pz = Math.floor(gz / edge), key = `${px},${pz}`;
            const row = gz - pz * edge, bit = 1 << (gx - px * edge);
            const original = changes.get(key) ?? this.pages.get(key);
            if (original && (original.rows[row] & bit)) continue;
            const page = changes.get(key) ?? { x: px, z: pz, rows: original ? [...original.rows] : new Array<number>(edge).fill(0) };
            page.rows[row] |= bit; changes.set(key, page);
        }
        if (this.pages.size + [...changes.keys()].filter(key => !this.pages.has(key)).length > EXPLORATION.maxPages) throw new Error("探索分页容量已满");
        for (const [key, page] of changes) this.pages.set(key, Object.freeze({ ...page, rows: Object.freeze(page.rows) }));
        this.lastX = cx; this.lastZ = cz;
        if (changes.size) { this.revision++; this.cached = undefined; }
    }
}
