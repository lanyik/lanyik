import type { EntityWorld } from "./EntityWorld";
import { MAX_ENEMIES, ticksForSeconds } from "./GameConfig";

export const BURN_INTERVAL = ticksForSeconds(.5);
export const BURN_SOURCES = 4, BURN_LAYERS = 8;
export interface SavedBurn { readonly source: number; readonly amount: number; readonly remaining: number; readonly nextIn: number }
export type BurnHit = (source: number, target: number, damage: number, tick: number) => void;

/** Independent layers retain their source and damage snapshot. Only populated records are scanned. */
export class BurnSystem {
    public readonly until: Float64Array;
    public readonly stacks: Uint8Array;
    private readonly head: Int32Array;
    private readonly next: Int32Array;
    private readonly target: Float64Array;
    private readonly source: Float64Array;
    private readonly damage: Float64Array;
    private readonly expires: Float64Array;
    private readonly nextAt: Float64Array;
    private readonly active: Uint32Array;
    private readonly index: Int32Array;
    private readonly free: Uint32Array;
    private readonly due: Uint32Array;
    private readonly dueSource: Float64Array;
    private readonly dueTarget: Float64Array;
    private readonly dueDamage: Float64Array;
    private readonly dueGroups: Uint8Array;
    private readonly dirty: Uint8Array;
    private readonly dirtySlots: Uint32Array;
    private count = 0;
    private freeCount: number;
    private nextEvent = Infinity;
    private advancing = false;

    constructor(private readonly world: EntityWorld) {
        const capacity = Math.min(world.capacity, MAX_ENEMIES + 1) * BURN_SOURCES * BURN_LAYERS;
        this.until = new Float64Array(world.capacity); this.stacks = new Uint8Array(world.capacity);
        this.head = new Int32Array(world.capacity).fill(-1); this.dirty = new Uint8Array(world.capacity);
        this.dirtySlots = new Uint32Array(world.capacity);
        this.next = new Int32Array(capacity).fill(-1); this.index = new Int32Array(capacity).fill(-1);
        this.target = new Float64Array(capacity); this.source = new Float64Array(capacity);
        this.damage = new Float64Array(capacity); this.expires = new Float64Array(capacity); this.nextAt = new Float64Array(capacity);
        this.active = new Uint32Array(capacity); this.free = new Uint32Array(capacity); this.freeCount = capacity;
        for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
        const groups = world.capacity * BURN_SOURCES;
        this.due = new Uint32Array(groups); this.dueSource = new Float64Array(groups);
        this.dueTarget = new Float64Array(groups); this.dueDamage = new Float64Array(groups); this.dueGroups = new Uint8Array(world.capacity);
    }

    public apply(source: number, target: number, damage: number, tick: number, duration: number, limit = 5): boolean {
        if (!Number.isSafeInteger(source) || source === 0 || !Number.isFinite(damage) || damage <= 0
            || !Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(duration) || duration < BURN_INTERVAL
            || !Number.isSafeInteger(tick + duration) || !Number.isFinite(damage * Math.ceil(duration / BURN_INTERVAL) * BURN_LAYERS)
            || !Number.isInteger(limit) || limit < 1 || limit > BURN_LAYERS) throw new RangeError("Invalid burn application");
        const slot = this.world.resolve(target);
        if (slot < 0) return false;
        let own = 0, weakest = -1, groups = 0;
        for (let i = this.head[slot]; i >= 0; i = this.next[i]) {
            if (this.source[i] === source) {
                own++;
                if (weakest < 0 || this.remaining(i) < this.remaining(weakest)
                    || this.remaining(i) === this.remaining(weakest) && (this.expires[i] < this.expires[weakest]
                        || this.expires[i] === this.expires[weakest] && i < weakest)) weakest = i;
            }
            let first = true;
            for (let j = this.head[slot]; j !== i; j = this.next[j]) if (this.source[j] === this.source[i]) { first = false; break; }
            if (first) groups++;
        }
        if (own === 0 && groups >= BURN_SOURCES) return false;
        if (own >= limit) {
            if (damage * Math.floor(duration / BURN_INTERVAL) < this.remaining(weakest)) return false;
            this.erase(weakest, slot);
        }
        if (this.freeCount === 0) return false;
        this.insert(slot, source, target, damage, tick + duration, tick + BURN_INTERVAL);
        this.project(slot);
        return true;
    }

    /** Consume only this source's not-yet-settled damage; no expiry or replacement invokes this path. */
    public consume(source: number, target: number): number {
        const slot = this.world.resolve(target);
        if (slot < 0) return 0;
        let total = 0;
        for (let i = this.head[slot]; i >= 0;) {
            const next = this.next[i];
            if (this.source[i] === source) { total += this.remaining(i); this.erase(i, slot); }
            i = next;
        }
        this.project(slot);
        return total;
    }

    public isDue(tick: number): boolean { return tick >= this.nextEvent; }
    public advance(tick: number, hit: BurnHit): void {
        if (this.advancing) throw new Error("Burn settlement cannot reenter");
        if (tick < this.nextEvent) return;
        this.advancing = true;
        try {
            while (this.nextEvent <= tick) {
                const at = this.nextEvent;
                let dueCount = 0, dirtyCount = 0;
                this.nextEvent = Infinity;
                this.dueGroups.fill(0);
                // Capture due hits before expiry/death mutates the active set. Last tick at expiry is included.
                for (let cursor = this.count - 1; cursor >= 0; cursor--) {
                    const i = this.active[cursor], slot = this.world.resolve(this.target[i]);
                    if (slot < 0) throw new Error("Burn target removed without clearing statuses");
                    if (this.nextAt[i] === at && at <= this.expires[i]) {
                        // This damage has no per-hit triggers; equal-time layers from one source are additive.
                        // Aggregate before sorting/submitting, while retaining every layer's independent clock.
                        const base = slot * BURN_SOURCES, end = base + this.dueGroups[slot];
                        let group = base;
                        while (group < end && this.dueSource[group] !== this.source[i]) group++;
                        if (group === end) {
                            this.dueGroups[slot]++; this.due[dueCount++] = group;
                            this.dueSource[group] = this.source[i]; this.dueTarget[group] = this.target[i]; this.dueDamage[group] = 0;
                        }
                        this.dueDamage[group] += this.damage[i];
                        this.nextAt[i] += BURN_INTERVAL;
                    }
                    if (this.expires[i] <= at) {
                        this.erase(i, slot);
                        if (!this.dirty[slot]) { this.dirty[slot] = 1; this.dirtySlots[dirtyCount++] = slot; }
                    }
                    else this.nextEvent = Math.min(this.nextEvent, this.nextAt[i], this.expires[i]);
                }
                for (let i = 0; i < dirtyCount; i++) {
                    const slot = this.dirtySlots[i]; this.project(slot); this.dirty[slot] = 0;
                }
                this.due.subarray(0, dueCount).sort((a, b) => this.dueTarget[a] - this.dueTarget[b] || this.dueSource[a] - this.dueSource[b]);
                for (let j = 0; j < dueCount; j++) {
                    const i = this.due[j]; hit(this.dueSource[i], this.dueTarget[i], this.dueDamage[i], at);
                }
            }
        } finally { this.advancing = false; }
    }

    public clear(slot: number): void {
        while (this.head[slot] >= 0) this.erase(this.head[slot], slot);
        this.until[slot] = this.stacks[slot] = 0;
    }
    public save(slot: number, tick: number): SavedBurn[] {
        const entries: SavedBurn[] = [];
        for (let i = this.head[slot]; i >= 0; i = this.next[i]) if (this.expires[i] > tick) entries.push({ source: this.source[i], amount: this.damage[i], remaining: this.expires[i] - tick, nextIn: this.nextAt[i] - tick });
        return entries;
    }
    public restore(slot: number, entries: readonly SavedBurn[], tick: number): void {
        this.clear(slot);
        const provenance = new Map<number, number>(), target = this.world.ids[slot];
        for (const entry of entries) if (entry.source !== target && !provenance.has(entry.source)) provenance.set(entry.source, -provenance.size - 1);
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            this.insert(slot, entry.source === target ? target : provenance.get(entry.source)!, target, entry.amount, tick + entry.remaining, tick + entry.nextIn);
        }
        this.project(slot);
    }
    private insert(slot: number, source: number, target: number, damage: number, expires: number, nextAt: number): void {
        if (!this.freeCount) throw new Error("Burn capacity exceeded");
        const i = this.free[--this.freeCount];
        this.source[i] = source; this.target[i] = target; this.damage[i] = damage; this.expires[i] = expires; this.nextAt[i] = nextAt;
        this.next[i] = this.head[slot]; this.head[slot] = i; this.index[i] = this.count; this.active[this.count++] = i;
        this.nextEvent = Math.min(this.nextEvent, expires, nextAt);
    }
    private erase(i: number, slot: number): void {
        if (this.head[slot] === i) this.head[slot] = this.next[i];
        else for (let prev = this.head[slot]; prev >= 0; prev = this.next[prev]) if (this.next[prev] === i) { this.next[prev] = this.next[i]; break; }
        const cursor = this.index[i], last = this.active[--this.count];
        this.active[cursor] = last; this.index[last] = cursor; this.index[i] = -1;
        this.free[this.freeCount++] = i; this.next[i] = -1;
    }
    private remaining(i: number): number { return this.damage[i] * Math.max(0, 1 + Math.floor((this.expires[i] - this.nextAt[i]) / BURN_INTERVAL)); }
    private project(slot: number): void {
        let until = 0, stacks = 0;
        for (let i = this.head[slot]; i >= 0; i = this.next[i]) { until = Math.max(until, this.expires[i]); stacks++; }
        this.until[slot] = until; this.stacks[slot] = stacks;
    }
}
