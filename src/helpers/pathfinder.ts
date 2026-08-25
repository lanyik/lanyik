import { Land } from "../enums";
import { MapInfo, Point } from "../interfaces";
import { assertWrappableMap, getMapNeighbors, getMapTile, normalizeMapCoordinates } from "./topology";

interface QueueEntry extends Point {
    priority: number;
}

// Small binary min-heap used by A*. Keeping the queue explicit avoids the old
// O(n) scan of a sparse array on every iteration on large generated worlds.
class MinPriorityQueue {
    private entries: QueueEntry[] = [];

    public get size(): number {
        return this.entries.length;
    }

    public push(entry: QueueEntry): void {
        this.entries.push(entry);
        let index = this.entries.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.entries[parent].priority <= entry.priority) break;
            this.entries[index] = this.entries[parent];
            index = parent;
        }
        this.entries[index] = entry;
    }

    public pop(): QueueEntry | undefined {
        const first = this.entries[0];
        const last = this.entries.pop();
        if (!first || !last || this.entries.length === 0) return first;

        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            if (left >= this.entries.length) break;
            const child = right < this.entries.length
                && this.entries[right].priority < this.entries[left].priority ? right : left;
            if (this.entries[child].priority >= last.priority) break;
            this.entries[index] = this.entries[child];
            index = child;
        }
        this.entries[index] = last;
        return first;
    }
}

const pointKey = ({ x, y }: Point): string => `${x},${y}`;

export class PathFinder {
    private readonly wrapX: boolean;
    private readonly wrapY: boolean;

    constructor(
        private readonly map: MapInfo,
        private readonly restricted: Readonly<Record<Land, boolean>>,
        private readonly accessible?: (x: number, y: number) => boolean
    ) {
        assertWrappableMap(map);
        this.wrapX = map.wrapX === true;
        this.wrapY = map.wrapY === true;
    }

    public find(startX: number, startY: number, endX: number, endY: number): Point[] {
        const start = normalizeMapCoordinates(this.map, startX, startY);
        const end = normalizeMapCoordinates(this.map, endX, endY);
        if (!start || !end || !this.isAccessible(start) || !this.isAccessible(end)) return [];
        if (start.x === end.x && start.y === end.y) return [];

        const frontier = new MinPriorityQueue();
        const startKey = pointKey(start);
        const endKey = pointKey(end);
        const costs = new Map<string, number>([[startKey, 0]]);
        const parents = new Map<string, Point>();
        frontier.push({ ...start, priority: 0 });

        while (frontier.size > 0) {
            const current = frontier.pop();
            if (!current) break;
            const currentKey = pointKey(current);
            const currentCost = costs.get(currentKey);
            if (currentCost === undefined) continue;
            if (currentKey === endKey) return this.reconstructPath(start, end, parents);

            for (const neighbor of getMapNeighbors(this.map, current.x, current.y)) {
                if (!this.isAccessible(neighbor)) continue;
                const neighborKey = pointKey(neighbor);
                const nextCost = currentCost + 1;
                if (nextCost >= (costs.get(neighborKey) ?? Infinity)) continue;

                costs.set(neighborKey, nextCost);
                parents.set(neighborKey, { x: current.x, y: current.y });
                frontier.push({
                    x: neighbor.x,
                    y: neighbor.y,
                    priority: nextCost + this.hexDistance(neighbor, end)
                });
            }
        }

        return [];
    }

    private isAccessible(point: Point): boolean {
        const tile = getMapTile(this.map, point.x, point.y);
        return tile !== undefined
            && this.restricted[tile.type] === true
            && (!this.accessible || this.accessible(point.x, point.y));
    }

    private reconstructPath(start: Point, end: Point, parents: ReadonlyMap<string, Point>): Point[] {
        const path: Point[] = [{ ...end }];
        let current = end;
        const maximumLength = Math.max(1, this.map.w * this.map.h);

        while (current.x !== start.x || current.y !== start.y) {
            const parent = parents.get(pointKey(current));
            if (!parent || path.length > maximumLength) return [];
            path.push(parent);
            current = parent;
        }
        return path.reverse();
    }

    // Converts the even-column offset coordinates used by getHexCenter() to
    // axial coordinates. Wrapped worlds compare nearby copies of the target.
    private hexDistance(from: Point, to: Point): number {
        let best = Infinity;
        const xCopies = this.wrapX ? [-1, 0, 1] : [0];
        const yCopies = this.wrapY ? [-1, 0, 1] : [0];

        for (const copyX of xCopies) {
            for (const copyY of yCopies) {
                const targetX = to.x + copyX * this.map.w;
                const targetY = to.y + copyY * this.map.h;
                const dq = from.x - targetX;
                const fromR = from.y - Math.ceil(from.x / 2);
                const targetR = targetY - Math.ceil(targetX / 2);
                const dr = fromR - targetR;
                best = Math.min(best, (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2);
            }
        }
        return best;
    }
}
