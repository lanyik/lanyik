import type { EntityWorld } from "./EntityWorld";

export enum StatusKind { Slow, Protection, Barrier }
const KIND_COUNT = 3;

/** One strongest, refreshed instance per actor/kind; only active entries are scanned. */
export class StatusSystem {
    public readonly slowUntil: Float64Array;
    public readonly slowScale: Float32Array;
    public readonly wardUntil: Float64Array;
    private readonly until: Float64Array;
    private readonly strength: Float64Array;
    private readonly sources: Float64Array;
    private readonly active: Uint32Array;
    private readonly indices: Int32Array;
    private count = 0;

    constructor(private readonly world: EntityWorld) {
        const capacity = world.capacity * KIND_COUNT;
        this.until = new Float64Array(capacity);
        this.strength = new Float64Array(capacity);
        this.sources = new Float64Array(capacity);
        this.active = new Uint32Array(capacity);
        this.indices = new Int32Array(capacity).fill(-1);
        this.slowUntil = this.until.subarray(0, world.capacity);
        this.wardUntil = this.until.subarray(world.capacity, world.capacity * 2);
        this.slowScale = new Float32Array(world.capacity).fill(1);
    }

    public apply(kind: StatusKind, source: number, target: number, strength: number, until: number, tick: number): boolean {
        if (!Number.isInteger(kind) || kind < 0 || kind >= KIND_COUNT || !Number.isFinite(strength) || strength <= 0
            || kind !== StatusKind.Barrier && strength > 1 || !Number.isSafeInteger(tick) || tick < 0
            || !Number.isSafeInteger(until) || until <= tick || !Number.isSafeInteger(source) || source <= 0) {
            throw new RangeError("Invalid status application");
        }
        const slot = this.world.resolve(target);
        if (slot < 0) return false;
        const i = kind * this.world.capacity + slot;
        if (this.until[i] <= tick) this.erase(i);
        if (kind === StatusKind.Barrier && this.strength[i] > 0) return false;
        if (this.indices[i] < 0) { this.indices[i] = this.count; this.active[this.count++] = i; }
        if (strength >= this.strength[i]) { this.strength[i] = strength; this.sources[i] = source; }
        this.until[i] = Math.max(this.until[i], until);
        if (kind === StatusKind.Slow) this.slowScale[slot] = 1 - this.strength[i];
        return true;
    }

    public amount(kind: StatusKind, slot: number, tick: number): number {
        const i = kind * this.world.capacity + slot;
        return tick < this.until[i] ? this.strength[i] : 0;
    }
    public deadline(kind: StatusKind, slot: number): number { return this.until[kind * this.world.capacity + slot]; }
    public source(kind: StatusKind, slot: number): number { return this.sources[kind * this.world.capacity + slot]; }
    public absorb(slot: number, damage: number, tick: number): number {
        if (!Number.isFinite(damage) || damage < 0) throw new RangeError("Absorbed damage must be finite and nonnegative");
        const i = StatusKind.Barrier * this.world.capacity + slot;
        const absorbed = Math.min(this.amount(StatusKind.Barrier, slot, tick), damage);
        this.strength[i] -= absorbed;
        if (this.strength[i] === 0 || tick >= this.until[i]) this.erase(i);
        return damage - absorbed;
    }
    public advance(tick: number): void {
        for (let cursor = this.count - 1; cursor >= 0; cursor--) {
            const i = this.active[cursor];
            if (tick >= this.until[i]) this.erase(i);
        }
    }
    public clear(slot: number): void {
        for (let kind = 0; kind < KIND_COUNT; kind++) this.erase(kind * this.world.capacity + slot);
    }
    private erase(i: number): void {
        const cursor = this.indices[i];
        if (cursor >= 0) {
            const last = this.active[--this.count];
            this.active[cursor] = last; this.indices[last] = cursor; this.indices[i] = -1;
        }
        this.until[i] = this.strength[i] = this.sources[i] = 0;
        if (i < this.world.capacity) this.slowScale[i] = 1;
    }
}
