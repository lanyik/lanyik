import { distance, mineAt, passable } from "./rules.js";

/** Nine compact source chunks, independent of the render camera and residency. */
export class CombatWorld {
    constructor(source, engine) {
        this.source = source;
        this.engine = engine;
        this.chunks = new Map();
        this.center = undefined;
        this.pathfinder = undefined;
    }
    readyAt(point) {
        return this.center?.x === Math.floor(point.x / this.source.chunkSize)
            && this.center?.y === Math.floor(point.y / this.source.chunkSize);
    }
    async load(point) {
        if (this.readyAt(point)) return;
        const size = this.source.chunkSize;
        const center = { x: Math.floor(point.x / size), y: Math.floor(point.y / size) };
        const chunks = new Map();
        const tasks = [];
        for (let x = center.x - 1; x <= center.x + 1; x++) for (let y = center.y - 1; y <= center.y + 1; y++) {
            const key = `${x},${y}`;
            tasks.push((async () => {
                const chunk = this.chunks.get(key) ?? await this.source.sampleBaseChunk(x, y, { lane: "interactive" });
                chunks.set(key, chunk);
            })());
        }
        const results = await Promise.allSettled(tasks);
        const failed = results.find(result => result.status === "rejected");
        if (failed) throw failed.reason;
        this.chunks = chunks; this.center = center;
        this.origin = { x: (center.x - 1) * size, y: (center.y - 1) * size };
        // The even X origin preserves column parity. This is a bounded combat
        // window; long journeys migrate the window through the infinite world.
        this.pathfinder = new this.engine.PathFinder({
            w: size * 3, h: size * 3, data: {},
            tileAt: (x, y) => this.tile({ x: x + this.origin.x, y: y + this.origin.y })
        }, { land: true, sand: true, tundra: true, snow: true, mountain: true, coastal: true, sea: false },
        (x, y) => passable(this.tile({ x: x + this.origin.x, y: y + this.origin.y })));
    }
    tile(point) {
        const size = this.source.chunkSize;
        const x = Math.floor(point.x / size), y = Math.floor(point.y / size);
        const chunk = this.chunks.get(`${x},${y}`);
        return chunk && this.engine.decodeWorldChunkTile(chunk, point.x - x * size, point.y - y * size);
    }
    path(from, to) {
        return this.pathfinder.find(from.x - this.origin.x, from.y - this.origin.y, to.x - this.origin.x, to.y - this.origin.y)
            .slice(1).map(point => ({ x: point.x + this.origin.x, y: point.y + this.origin.y }));
    }
    nearby(center, radius) {
        const points = [];
        for (let x = center.x - radius; x <= center.x + radius; x++) for (let y = center.y - radius; y <= center.y + radius; y++) {
            const point = { x, y };
            if (distance(center, point) <= radius && passable(this.tile(point))) points.push(point);
        }
        return points;
    }
    mines(state, radius = 9) {
        return this.nearby(state.base, radius).map(point => mineAt(point, this.tile(point)))
            .filter(mine => mine && (state.mined[`${mine.x},${mine.y}`] ?? 0) < mine.total)
            .sort((a, b) => distance(a, state.base) - distance(b, state.base));
    }
    get stats() {
        return { chunks: this.chunks.size, bytes: [...this.chunks.values()].reduce((sum, chunk) => sum + chunk.tiles.byteLength, 0), center: this.center && { ...this.center } };
    }
    dispose() { this.chunks.clear(); this.pathfinder = undefined; }
}
