import type { CombatTerrain } from "./CombatTerrain";
import { PLAYER_RADIUS } from "./GameConfig";

const CELL = .75, EDGE = 49, CENTER = (EDGE - 1) / 2, CAPACITY = EDGE * EDGE;
const EXPANSIONS_PER_TICK = 16;

/** One bounded, incremental local A* search. Buffers live with the player controller. */
export class AutoCombatPath {
    private readonly costs = new Uint16Array(CAPACITY);
    private readonly parents = new Int16Array(CAPACITY);
    private readonly states = new Uint8Array(CAPACITY);
    private readonly heap = new Uint16Array(CAPACITY);
    private readonly heapPositions = new Int16Array(CAPACITY);
    private readonly route = new Uint16Array(CAPACITY);
    private heapSize = 0;
    private routeSize = 0;
    private originX = 0;
    private originZ = 0;
    private goal = 0;
    public status: "idle" | "searching" | "ready" | "failed" = "idle";
    public x = 0;
    public z = 0;

    constructor(private readonly terrain: CombatTerrain) {}

    public cancel(): void { this.status = "idle"; this.heapSize = this.routeSize = 0; }

    public begin(x: number, z: number, targetX: number, targetZ: number): void {
        this.cancel();
        this.originX = x - CENTER * CELL; this.originZ = z - CENTER * CELL;
        const gx = Math.round((targetX - this.originX) / CELL), gz = Math.round((targetZ - this.originZ) / CELL);
        if (gx < 0 || gz < 0 || gx >= EDGE || gz >= EDGE) { this.status = "failed"; return; }
        this.goal = gz * EDGE + gx;
        this.costs.fill(65535); this.parents.fill(-1); this.states.fill(0); this.heapPositions.fill(-1);
        const start = CENTER * EDGE + CENTER;
        this.costs[start] = 0; this.states[start] = 1; this.push(start); this.status = "searching";
    }

    public advance(): void {
        for (let work = 0; work < EXPANSIONS_PER_TICK && this.status === "searching"; work++) {
            if (!this.heapSize) { this.status = "failed"; break; }
            const cell = this.pop();
            this.states[cell] = 2;
            if (cell === this.goal) {
                for (let node = cell; this.parents[node] >= 0; node = this.parents[node]) this.route[this.routeSize++] = node;
                this.status = "ready"; break;
            }
            const cx = cell % EDGE, cz = Math.floor(cell / EDGE);
            for (let direction = 0; direction < 4; direction++) {
                const next = direction === 0 ? (cx > 0 ? cell - 1 : -1) : direction === 1 ? (cx + 1 < EDGE ? cell + 1 : -1)
                    : direction === 2 ? (cz > 0 ? cell - EDGE : -1) : (cz + 1 < EDGE ? cell + EDGE : -1);
                if (next < 0 || this.states[next] >= 2 || this.costs[cell] + 1 >= this.costs[next]) continue;
                if (!this.states[next]) {
                    // Same conservative cardinal-edge clearance as EncounterNavigation.
                    if (!this.terrain.isClear(this.cellX(next), this.cellZ(next), PLAYER_RADIUS + CELL / 2)) {
                        this.states[next] = 3; continue;
                    }
                }
                if (this.parents[cell] < 0) {
                    const moved = this.terrain.move(this.cellX(cell), this.cellZ(cell), this.cellX(next) - this.cellX(cell),
                        this.cellZ(next) - this.cellZ(cell), PLAYER_RADIUS, false);
                    if (Math.hypot(moved.x - this.cellX(next), moved.z - this.cellZ(next)) > 1e-5) continue;
                }
                this.parents[next] = cell; this.costs[next] = this.costs[cell] + 1;
                if (this.states[next] === 1) this.up(this.heapPositions[next]);
                else { this.states[next] = 1; this.push(next); }
            }
        }
    }

    public waypoint(x: number, z: number): boolean {
        if (this.status !== "ready") return false;
        while (this.routeSize) {
            const cell = this.route[this.routeSize - 1];
            this.x = this.cellX(cell); this.z = this.cellZ(cell);
            if (Math.hypot(this.x - x, this.z - z) > .12) return true;
            this.routeSize--;
        }
        return false;
    }

    private cellX(cell: number): number { return this.originX + cell % EDGE * CELL; }
    private cellZ(cell: number): number { return this.originZ + Math.floor(cell / EDGE) * CELL; }
    private score(cell: number): number {
        return this.costs[cell] + Math.abs(cell % EDGE - this.goal % EDGE) + Math.abs(Math.floor(cell / EDGE) - Math.floor(this.goal / EDGE));
    }
    private less(a: number, b: number): boolean { const d = this.score(a) - this.score(b); return d < 0 || (d === 0 && a < b); }
    private swap(a: number, b: number): void {
        const cell = this.heap[a]; this.heap[a] = this.heap[b]; this.heap[b] = cell;
        this.heapPositions[this.heap[a]] = a; this.heapPositions[this.heap[b]] = b;
    }
    private up(index: number): void {
        while (index > 0) { const parent = (index - 1) >> 1; if (!this.less(this.heap[index], this.heap[parent])) break; this.swap(index, parent); index = parent; }
    }
    private push(cell: number): void { const index = this.heapSize++; this.heap[index] = cell; this.heapPositions[cell] = index; this.up(index); }
    private pop(): number {
        const result = this.heap[0]; this.heapPositions[result] = -1;
        if (--this.heapSize) {
            this.heap[0] = this.heap[this.heapSize]; this.heapPositions[this.heap[0]] = 0;
            let index = 0;
            while (index * 2 + 1 < this.heapSize) {
                let next = index * 2 + 1;
                if (next + 1 < this.heapSize && this.less(this.heap[next + 1], this.heap[next])) next++;
                if (!this.less(this.heap[next], this.heap[index])) break;
                this.swap(index, next); index = next;
            }
        }
        return result;
    }
}
