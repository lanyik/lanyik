import { getHexCenter, getNeighbors } from "three-hex-map";
import { EXPLORER } from "../../content/explorer";
import type { TilePosition } from "../../content/minerals";
import { hexDistance, tileKey } from "../spatial/footprint";

export interface GroundPoint { readonly x: number; readonly z: number }
export interface MovementInput extends GroundPoint { readonly sprint: boolean; readonly active: boolean }
export type ExplorerStatus = "idle" | "walking" | "navigating" | "arrived" | "blocked" | "unreachable";
export interface ExplorerSnapshot extends GroundPoint {
    readonly tile: TilePosition;
    readonly heading: number;
    readonly distance: number;
    readonly status: ExplorerStatus;
    readonly target?: TilePosition;
    readonly remainingSteps: number;
}
export const groundCenter = (tile: TilePosition): GroundPoint => {
    const center = getHexCenter(tile.x, tile.y, 1);
    return { x: center.x, z: center.y };
};

/** Inverse of the map's flat-top, even-q layout, including its half-row origin offset. */
export function groundTile(point: GroundPoint): TilePosition {
    const q = point.x * 2 / 3;
    const r = (point.z - Math.sqrt(3) / 2) / Math.sqrt(3) - q / 2;
    let x = Math.round(q), y = Math.round(r);
    const s = Math.round(-q - r);
    const dx = Math.abs(x - q), dy = Math.abs(y - r), ds = Math.abs(s + q + r);
    if (dx > dy && dx > ds) x = -y - s;
    else if (dy > ds) y = -x - s;
    return { x, y: y + Math.ceil(x / 2) };
}

const corners = Array.from({ length: 6 }, (_, index) => ({ x: Math.cos(index * Math.PI / 3), z: Math.sin(index * Math.PI / 3) }));
/** Exact circle/hex overlap, used by both movement and construction. */
export function touchesTile(point: GroundPoint, tile: TilePosition): boolean {
    const current = groundTile(point);
    if (current.x === tile.x && current.y === tile.y) return true;
    const center = groundCenter(tile);
    const px = point.x - center.x, pz = point.z - center.z;
    for (let edge = 0; edge < 6; edge++) {
        const a = corners[edge], b = corners[(edge + 1) % 6];
        const vx = b.x - a.x, vz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / (vx * vx + vz * vz)));
        if ((px - a.x - t * vx) ** 2 + (pz - a.z - t * vz) ** 2 < EXPLORER.radius ** 2) return true;
    }
    return false;
}

export function explorerSpawn(cells: readonly TilePosition[], walkable: (tile: TilePosition) => boolean): TilePosition | undefined {
    const occupied = new Set(cells.map(tileKey));
    for (const cell of cells) for (const neighbor of getNeighbors(cell.x, cell.y)) {
        if (!occupied.has(tileKey(neighbor)) && walkable(neighbor)) return neighbor;
    }
    return undefined;
}

/** Authoritative continuous position. No DOM, renderer, wall clock, or asynchronous movement jobs. */
export class Explorer {
    private position: GroundPoint;
    private previous: GroundPoint;
    private heading = 0;
    private distance = 0;
    private status: ExplorerStatus = "idle";
    private target: TilePosition | undefined;
    private route: readonly TilePosition[] = [];
    private routeIndex = 0;
    private timestamp: number | undefined;
    private remainder = 0;
    private snapshot: ExplorerSnapshot | undefined;

    constructor(spawn: TilePosition, private readonly walkable: (tile: TilePosition) => boolean) {
        if (!Number.isSafeInteger(spawn.x) || !Number.isSafeInteger(spawn.y) || !walkable(spawn)) throw new Error("Explorer requires a walkable spawn");
        this.position = this.previous = groundCenter(spawn);
    }
    public getSnapshot(): ExplorerSnapshot {
        return this.snapshot ??= Object.freeze({ ...this.position, tile: Object.freeze(groundTile(this.position)), heading: this.heading,
            distance: this.distance, status: this.status, target: this.target, remainingSteps: this.route.length - this.routeIndex });
    }
    public renderPoint(): GroundPoint {
        const alpha = this.remainder / (EXPLORER.stepMs * 1000);
        return { x: this.previous.x + (this.position.x - this.previous.x) * alpha,
            z: this.previous.z + (this.position.z - this.previous.z) * alpha };
    }
    public resetTime(): void { this.timestamp = undefined; this.remainder = 0; this.previous = this.position; }
    public stop(): void {
        this.route = []; this.routeIndex = 0; this.target = undefined; this.status = "idle"; this.snapshot = undefined;
    }

    /** A surveyed window is finite; BFS visits only known walkable tiles, with a hard work bound. */
    public navigate(target: TilePosition): boolean {
        if (!Number.isSafeInteger(target.x) || !Number.isSafeInteger(target.y)) throw new RangeError("Invalid navigation target");
        this.target = Object.freeze({ ...target });
        this.route = []; this.routeIndex = 0;
        const start = groundTile(this.position);
        const queue = [start];
        const visited = new Set([tileKey(start)]);
        const parents = [-1];
        let goal = -1;
        for (let index = 0; index < queue.length && index < 96 * 96; index++) {
            const cell = queue[index];
            // Stop beside the target: ore faces and occupied command centers must remain usable.
            if (hexDistance(cell, target) === 1) { goal = index; break; }
            for (const next of getNeighbors(cell.x, cell.y)) {
                const key = tileKey(next);
                if (visited.has(key) || !this.walkable(next)) continue;
                visited.add(key); queue.push(next); parents.push(index);
            }
        }
        if (goal >= 0) {
            const route: TilePosition[] = [];
            for (let index = goal; index >= 0; index = parents[index]) route.push(queue[index]);
            this.route = route.reverse();
        }
        this.status = goal >= 0 ? "navigating" : "unreachable";
        this.snapshot = undefined;
        return goal >= 0;
    }
    public layoutChanged(): void { if (this.route.length && this.target) this.navigate(this.target); }

    public sample(timestampMs: number, input: MovementInput): boolean {
        const timestamp = Math.round(timestampMs * 1000);
        if (!Number.isSafeInteger(timestamp) || timestamp < 0 || !Number.isFinite(input.x) || !Number.isFinite(input.z)) throw new RangeError("Invalid explorer frame");
        if (!input.active) { this.resetTime(); return false; }
        const previous = this.timestamp;
        if (previous !== undefined && timestamp < previous) throw new RangeError("Explorer time must be monotonic");
        this.timestamp = timestamp;
        if (previous === undefined) return false;
        this.remainder += Math.min(timestamp - previous, 250_000);
        const before = this.getSnapshot();
        while (this.remainder >= EXPLORER.stepMs * 1000) {
            this.remainder -= EXPLORER.stepMs * 1000;
            this.step(input);
        }
        return this.getSnapshot() !== before;
    }
    private canStand(point: GroundPoint): boolean {
        const tile = groundTile(point);
        if (!this.walkable(tile)) return false;
        return getNeighbors(tile.x, tile.y).every(neighbor => this.walkable(neighbor) || !touchesTile(point, neighbor));
    }
    private step(input: MovementInput): void {
        this.previous = this.position;
        let dx = input.x, dz = input.z;
        let length = Math.hypot(dx, dz);
        let budget = (input.sprint ? EXPLORER.sprintSpeed : EXPLORER.speed) * EXPLORER.stepMs / 1000;
        if (length > 0) {
            if (this.target) this.stop();
            dx /= length; dz /= length;
        } else if (this.routeIndex < this.route.length) {
            const point = groundCenter(this.route[this.routeIndex]);
            dx = point.x - this.position.x; dz = point.z - this.position.z;
            length = Math.hypot(dx, dz);
            if (length <= budget) budget = length;
            if (length > 0) { dx /= length; dz /= length; }
        } else {
            if (this.status === "walking" || this.status === "blocked") { this.status = "idle"; this.snapshot = undefined; }
            return;
        }
        const candidate = { x: this.position.x + dx * budget, z: this.position.z + dz * budget };
        let next = candidate;
        if (!this.canStand(next)) {
            const first = Math.abs(dx) >= Math.abs(dz) ? { x: candidate.x, z: this.position.z } : { x: this.position.x, z: candidate.z };
            const second = Math.abs(dx) >= Math.abs(dz) ? { x: this.position.x, z: candidate.z } : { x: candidate.x, z: this.position.z };
            next = this.canStand(first) ? first : this.canStand(second) ? second : this.position;
        }
        const moved = Math.hypot(next.x - this.position.x, next.z - this.position.z);
        if (moved > 0) { this.heading = Math.atan2(next.x - this.position.x, next.z - this.position.z); this.distance += moved; }
        this.position = next;
        this.status = this.target ? "navigating" : moved > 0 ? "walking" : "blocked";
        if (this.target && length <= budget + 1e-9 && Math.hypot(next.x - candidate.x, next.z - candidate.z) < 1e-9) {
            this.routeIndex++;
            if (this.routeIndex === this.route.length) { this.route = []; this.routeIndex = 0; this.status = "arrived"; }
        } else if (this.target && moved === 0) {
            this.route = []; this.routeIndex = 0; this.status = "blocked";
        }
        this.snapshot = undefined;
    }
}
