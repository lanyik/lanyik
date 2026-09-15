import type { CombatTerrain } from "./CombatTerrain";
import { GAME_CONFIG } from "./GameConfig";
import { WORLD_VIEW } from "./WorldView";

export const ENCOUNTER_CELL = .5;
export const ENCOUNTER_EDGE = WORLD_VIEW.chunkSize / ENCOUNTER_CELL;
const CELLS = ENCOUNTER_EDGE ** 2, PLAYER_RADIUS = GAME_CONFIG.combat.playerRadius;
interface Occupant { readonly x: number; readonly z: number; readonly radius: number }

/** Conservative walking components owned and retired with a content chunk. No per-actor path search. */
export class EncounterNavigation {
    public readonly labels = new Uint16Array(CELLS);
    public readonly borders: number[][] = [[]];
    public readonly reached: Uint8Array;

    constructor(private readonly terrain: CombatTerrain, public readonly x: number, public readonly z: number) {
        const clear = new Uint8Array(CELLS), queue = new Uint16Array(CELLS);
        // The half-cell margin certifies the entire cardinal edge, not only its two endpoints.
        for (let cell = 0; cell < CELLS; cell++) clear[cell] = Number(terrain.isClear(this.cellX(cell), this.cellZ(cell), PLAYER_RADIUS + ENCOUNTER_CELL / 2));
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
        for (let cell = 0; cell < CELLS; cell++) {
            const label = this.labels[cell];
            if (!label || !this.borders[label].length || (component && label !== component)) continue;
            const px = this.cellX(cell), pz = this.cellZ(cell), d = (x - px) ** 2 + (z - pz) ** 2;
            if (d >= distance || (accept && !accept(px, pz))) continue;
            if (occupied.some(other => (other.x - px) ** 2 + (other.z - pz) ** 2 < (radius + other.radius) ** 2)) continue;
            if (!this.terrain.isClear(px, pz, radius)) continue;
            distance = d; best = cell;
        }
        return best < 0 ? undefined : { x: this.cellX(best), z: this.cellZ(best), component: this.labels[best] };
    }
}
