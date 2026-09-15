/** Logical X/Z cells; hash collisions are checked against full cell coordinates. */
const SPATIAL_CELL_SIZE = 4;
function spatialBucket(x: number, z: number, mask: number): number {
    return (Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) & mask;
}
function spatialBucketCount(capacity: number): number { return 2 ** Math.ceil(Math.log2(capacity * 2)); }

export class SpatialQuery {
    public count = 0;
    public visited = 0;
    public readonly slots: Uint32Array;
    constructor(capacity: number) { this.slots = new Uint32Array(capacity); }
}

/** Bounded intrusive hash grid: one centre entry per target, no per-move allocation. */
export class SpatialGrid {
    private readonly heads: Int32Array;
    private readonly next: Int32Array;
    private readonly previous: Int32Array;
    private readonly cellX: Float64Array;
    private readonly cellZ: Float64Array;
    private readonly categories: Uint32Array;
    public maximumRadius = 0;

    constructor(capacity: number) {
        if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 0x10_0000) throw new RangeError("Invalid spatial grid capacity");
        this.heads = new Int32Array(spatialBucketCount(capacity)).fill(-1);
        this.next = new Int32Array(capacity).fill(-1);
        this.previous = new Int32Array(capacity).fill(-1);
        this.cellX = new Float64Array(capacity); this.cellZ = new Float64Array(capacity);
        this.categories = new Uint32Array(capacity);
    }

    public update(slot: number, x: number, z: number, radius: number, category: number): void {
        const cx = Math.floor(x / SPATIAL_CELL_SIZE), cz = Math.floor(z / SPATIAL_CELL_SIZE);
        if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || !Number.isFinite(radius) || radius < 0) {
            throw new RangeError("Spatial entries require finite, supported coordinates and radius");
        }
        this.maximumRadius = Math.max(this.maximumRadius, radius);
        if (this.categories[slot] && this.cellX[slot] === cx && this.cellZ[slot] === cz) {
            this.categories[slot] = category;
            return;
        }
        this.remove(slot);
        const bucket = spatialBucket(cx, cz, this.heads.length - 1), head = this.heads[bucket];
        this.cellX[slot] = cx; this.cellZ[slot] = cz; this.categories[slot] = category;
        this.next[slot] = head;
        if (head >= 0) this.previous[head] = slot;
        this.heads[bucket] = slot;
    }

    public remove(slot: number): void {
        if (!this.categories[slot]) return;
        const previous = this.previous[slot], next = this.next[slot];
        if (previous >= 0) this.next[previous] = next;
        else this.heads[spatialBucket(this.cellX[slot], this.cellZ[slot], this.heads.length - 1)] = next;
        if (next >= 0) this.previous[next] = previous;
        this.next[slot] = this.previous[slot] = -1;
        this.categories[slot] = 0;
    }

    /** Borrowed slot candidates; callers perform their exact shape test before side effects. */
    public query(minX: number, minZ: number, maxX: number, maxZ: number, category: number, output: SpatialQuery): void {
        output.count = output.visited = 0;
        const x0 = Math.floor(minX / SPATIAL_CELL_SIZE), z0 = Math.floor(minZ / SPATIAL_CELL_SIZE);
        const x1 = Math.floor(maxX / SPATIAL_CELL_SIZE), z1 = Math.floor(maxZ / SPATIAL_CELL_SIZE);
        if (!Number.isSafeInteger(x0) || !Number.isSafeInteger(z0) || !Number.isSafeInteger(x1) || !Number.isSafeInteger(z1)
            || minX > maxX || minZ > maxZ) throw new RangeError("Invalid spatial query bounds");
        // Choose a bounded traversal for sweeps whose cell rectangle exceeds the whole table.
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > this.heads.length) {
            for (let slot = 0; slot < this.categories.length; slot++) {
                output.visited++;
                if ((this.categories[slot] & category) && this.cellX[slot] >= x0 && this.cellX[slot] <= x1
                    && this.cellZ[slot] >= z0 && this.cellZ[slot] <= z1) output.slots[output.count++] = slot;
            }
            return;
        }
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
            for (let slot = this.heads[spatialBucket(x, z, this.heads.length - 1)]; slot >= 0; slot = this.next[slot]) {
                output.visited++;
                if (this.cellX[slot] === x && this.cellZ[slot] === z && (this.categories[slot] & category)) {
                    output.slots[output.count++] = slot;
                }
            }
        }
    }
}
