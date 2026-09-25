import type { CombatTerrain } from "./CombatTerrain";
import { GAME_CONFIG } from "./GameConfig";
import { WORLD_VIEW } from "./WorldView";

export const ENCOUNTER_CELL = .5;
export const ENCOUNTER_EDGE = WORLD_VIEW.chunkSize / ENCOUNTER_CELL;
const CELLS = ENCOUNTER_EDGE ** 2, PLAYER_RADIUS = GAME_CONFIG.combat.playerRadius, CLEAR_RADIUS = PLAYER_RADIUS + ENCOUNTER_CELL / 2;
interface Occupant { readonly x: number; readonly z: number; readonly radius: number }

/** Conservative walking components owned and retired with a content chunk. No per-actor path search. */
export class EncounterNavigation {
    public readonly labels = new Uint16Array(CELLS);
    public readonly borders: number[][] = [[]];
    public readonly reached: Uint8Array;

    constructor(private readonly terrain: CombatTerrain, public readonly x: number, public readonly z: number) {
        const clear = new Uint8Array(CELLS), queue = new Uint16Array(CELLS);
        // The half-cell margin certifies the entire cardinal edge, not only its two endpoints.
        for (let cell = 0; cell < CELLS; cell++) clear[cell] = Number(terrain.isClear(this.cellX(cell), this.cellZ(cell), CLEAR_RADIUS));
        for (let cell = 0; cell < CELLS; cell++) {
            if (!clear[cell] || this.labels[cell]) continue;
            const component = this.borders.length, border: number[] = [];
            this.borders.push(border);
            let head = 0, tail = 1; queue[0] = cell; this.labels[cell] = component;
            while (head < tail) {
                const current = queue[head++], cx = current % ENCOUNTER_EDGE, cz = Math.floor(current / ENCOUNTER_EDGE);
                if (cx === 0 || cz === 0 || cx === ENCOUNTER_EDGE - 1 || cz === ENCOUNTER_EDGE - 1) border.push(current);
                for (let direction = 0; direction < 4; direction++) {
                    const next = direction === 0 ? (cx > 0 ? current - 1 : -1) : direction === 1 ? (cx < ENCOUNTER_EDGE - 1 ? current + 1 : -1)
                        : direction === 2 ? (cz > 0 ? current - ENCOUNTER_EDGE : -1) : (cz < ENCOUNTER_EDGE - 1 ? current + ENCOUNTER_EDGE : -1);
                    if (next < 0 || !clear[next] || this.labels[next]) continue;
                    this.labels[next] = component; queue[tail++] = next;
                }
            }
        }
        this.reached = new Uint8Array(this.borders.length);
    }

    public cellX(cell: number): number { return this.x + (cell % ENCOUNTER_EDGE + .5) * ENCOUNTER_CELL; }
    public cellZ(cell: number): number { return this.z + (Math.floor(cell / ENCOUNTER_EDGE) + .5) * ENCOUNTER_CELL; }
    public componentAt(x: number, z: number): number {
        const cx = Math.floor((x - this.x) / ENCOUNTER_CELL), cz = Math.floor((z - this.z) / ENCOUNTER_CELL);
        return cx < 0 || cz < 0 || cx >= ENCOUNTER_EDGE || cz >= ENCOUNTER_EDGE ? 0 : this.labels[cz * ENCOUNTER_EDGE + cx];
    }
    public isReached(x: number, z: number): boolean { return this.reached[this.componentAt(x, z)] === 1; }

    /** Connect an arbitrary player position to a nearby certified node with an actual swept walk. */
    public entry(x: number, z: number): number {
        const cx = Math.floor((x - this.x) / ENCOUNTER_CELL), cz = Math.floor((z - this.z) / ENCOUNTER_CELL);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= ENCOUNTER_EDGE || nz >= ENCOUNTER_EDGE) continue;
            const cell = nz * ENCOUNTER_EDGE + nx, component = this.labels[cell];
            if (!component) continue;
            const tx = this.cellX(cell), tz = this.cellZ(cell), moved = this.terrain.move(x, z, tx - x, tz - z, PLAYER_RADIUS, false);
            if (Math.hypot(moved.x - tx, moved.z - tz) < 1e-5) return component;
        }
        return 0;
    }

    /** Stable nearest legal node; only components with an entry on the chunk boundary host encounters. */
    public nearest(x: number, z: number, radius: number, component = 0, occupied: readonly Occupant[] = [],
        accept?: (x: number, z: number) => boolean): { x: number; z: number; component: number } | undefined {
        let best = -1, distance = Infinity;
        const cx = Math.max(0, Math.min(ENCOUNTER_EDGE - 1, Math.floor((x - this.x) / ENCOUNTER_CELL)));
        const cz = Math.max(0, Math.min(ENCOUNTER_EDGE - 1, Math.floor((z - this.z) / ENCOUNTER_CELL)));
        for (let ring = 0; ring < ENCOUNTER_EDGE; ring++) {
            const minX = Math.max(0, cx - ring), maxX = Math.min(ENCOUNTER_EDGE - 1, cx + ring);
            const minZ = Math.max(0, cz - ring), maxZ = Math.min(ENCOUNTER_EDGE - 1, cz + ring);
            for (let iz = minZ; iz <= maxZ; iz++) {
                const fullRow = Math.abs(iz - cz) === ring;
                const firstX = fullRow ? minX : cx >= ring ? cx - ring : cx + ring;
                for (let ix = firstX; ix <= maxX; ix += fullRow ? 1 : Math.max(1, ring * 2)) {
                    const cell = iz * ENCOUNTER_EDGE + ix, label = this.labels[cell];
                    if (!label || !this.borders[label].length || (component && label !== component)) continue;
                    const px = this.cellX(cell), pz = this.cellZ(cell), d = (x - px) ** 2 + (z - pz) ** 2;
                    if (d > distance || (d === distance && cell >= best) || (accept && !accept(px, pz))) continue;
                    if (occupied.some(other => (other.x - px) ** 2 + (other.z - pz) ** 2 < (radius + other.radius) ** 2)) continue;
                    // A labelled node already certifies every smaller body on this static terrain.
                    if (radius > CLEAR_RADIUS && !this.terrain.isClear(px, pz, radius)) continue;
                    distance = d; best = cell;
                }
            }
            // Every unvisited node lies beyond one of these four sides. Strict comparison preserves ties by cell index.
            const outside = Math.min(minX > 0 ? Math.abs(x - (this.x + (minX - .5) * ENCOUNTER_CELL)) : Infinity,
                maxX < ENCOUNTER_EDGE - 1 ? Math.abs(x - (this.x + (maxX + 1.5) * ENCOUNTER_CELL)) : Infinity,
                minZ > 0 ? Math.abs(z - (this.z + (minZ - .5) * ENCOUNTER_CELL)) : Infinity,
                maxZ < ENCOUNTER_EDGE - 1 ? Math.abs(z - (this.z + (maxZ + 1.5) * ENCOUNTER_CELL)) : Infinity);
            if (outside * outside > distance || minX === 0 && maxX === ENCOUNTER_EDGE - 1 && minZ === 0 && maxZ === ENCOUNTER_EDGE - 1) break;
        }
        return best < 0 ? undefined : { x: this.cellX(best), z: this.cellZ(best), component: this.labels[best] };
    }
}
