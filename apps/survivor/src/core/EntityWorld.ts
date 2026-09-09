/** A bounded sparse-set query. Slots are borrowed until the next structural change. */
export class EntityQuery {
    public count = 0;
    public readonly slots: Uint32Array;
    private readonly indices: Int32Array;

    constructor(public readonly mask: number, capacity: number) {
        this.slots = new Uint32Array(capacity);
        this.indices = new Int32Array(capacity).fill(-1);
    }

    public add(slot: number): void {
        this.indices[slot] = this.count;
        this.slots[this.count++] = slot;
    }

    public remove(slot: number): void {
        const index = this.indices[slot];
        if (index < 0) return;
        const last = this.slots[--this.count];
        this.slots[index] = last;
        this.indices[last] = index;
        this.indices[slot] = -1;
    }
}

/**
 * Entity identity is independent of storage order. Handles encode generation and
 * slot using safe-integer arithmetic, never bitwise truncation or sparse ID arrays.
 * Composition is fixed at creation; action phases are ordinary component data.
 */
export class EntityWorld {
    public readonly ids: Float64Array;
    private readonly masks: Uint32Array;
    private readonly generations: Uint32Array;
    private readonly free: Uint32Array;
    private freeCount: number;
    private readonly queries: EntityQuery[] = [];

    constructor(public readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 0x10_0000) {
            throw new RangeError("Entity capacity must be between 1 and 1048576");
        }
        this.ids = new Float64Array(capacity);
        this.masks = new Uint32Array(capacity);
        this.generations = new Uint32Array(capacity);
        this.free = Uint32Array.from({ length: capacity }, (_, i) => capacity - i - 1);
        this.freeCount = capacity;
    }

    public get count(): number { return this.capacity - this.freeCount; }

    public query(mask: number): EntityQuery {
        this.validateMask(mask);
        const existing = this.queries.find(query => query.mask === mask);
        if (existing) return existing;
        const query = new EntityQuery(mask, this.capacity);
        for (let slot = 0; slot < this.capacity; slot++) {
            if ((this.masks[slot] & mask) === mask) query.add(slot);
        }
        this.queries.push(query);
        return query;
    }

    public create(mask: number): number {
        this.validateMask(mask);
        if (this.freeCount === 0) throw new Error("Entity capacity exhausted");
        const slot = this.free[this.freeCount - 1];
        if (this.generations[slot] === 0xffff_ffff) throw new Error("Entity generation exhausted");
        this.freeCount--;
        const generation = ++this.generations[slot];
        this.ids[slot] = (generation - 1) * this.capacity + slot + 1;
        this.masks[slot] = mask;
        for (const query of this.queries) if ((mask & query.mask) === query.mask) query.add(slot);
        return slot;
    }

    public resolve(handle: number): number {
        if (!Number.isSafeInteger(handle) || handle <= 0) return -1;
        const slot = (handle - 1) % this.capacity;
        return this.ids[slot] === handle ? slot : -1;
    }

    public destroy(handle: number): void {
        const slot = this.resolve(handle);
        if (slot < 0) throw new Error("Cannot destroy an expired entity");
        for (const query of this.queries) query.remove(slot);
        this.ids[slot] = this.masks[slot] = 0;
        this.free[this.freeCount++] = slot;
    }

    private validateMask(mask: number): void {
        if (!Number.isInteger(mask) || mask <= 0 || mask > 0x7fff_ffff) throw new RangeError("Invalid component mask");
    }
}
