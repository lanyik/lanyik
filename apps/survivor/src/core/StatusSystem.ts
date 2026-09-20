import type { EntityWorld } from "./EntityWorld";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";
import { BurnSystem } from "./BurnSystem";

export enum StatusKind { Slow, Protection, Barrier, Chill, Frozen, ControlResistance, Burning }
export enum ControlProfile { Normal, Elite, Boss }
export const STATUS_DEFINITIONS = Object.freeze([
    { name: "减速", beneficial: false, control: true, sources: 4, maximum: .6 },
    { name: "保护", beneficial: true, control: false, sources: 4, maximum: 1 },
    { name: "结界", beneficial: true, control: false, sources: 1, maximum: Infinity },
    { name: "寒意", beneficial: false, control: true, sources: 4, maximum: 5 },
    { name: "冻结", beneficial: false, control: true, sources: 1, maximum: 1 },
    { name: "控制抵抗", beneficial: true, control: false, sources: 1, maximum: 1 },
    { name: "灼烧", beneficial: false, control: false, sources: 4, maximum: 32 }
] as const);
export interface SavedStatus { readonly kind: StatusKind; readonly source: number; readonly amount: number; readonly remaining: number }
const SOURCES = 4;
/** Independent source deadlines, bounded storage, and cheap projections for movement/actions. */
export class StatusSystem {
    public readonly burns: BurnSystem;
    public readonly burnUntil: Float64Array;
    public readonly burnStacks: Uint8Array;
    public readonly slowUntil: Float64Array;
    public readonly slowScale: Float32Array;
    public readonly wardUntil: Float64Array;
    public readonly frozenUntil: Float64Array;
    public readonly controlProfile: Uint8Array;
    public readonly durationScale: Float64Array;
    private readonly until: Float64Array;
    private readonly strength: Float64Array;
    private readonly sources: Float64Array;
    private readonly active: Uint32Array;
    private readonly indices: Int32Array;
    private count = 0;
    private nextExpiry = Infinity;

    constructor(private readonly world: EntityWorld) {
        const capacity = world.capacity * StatusKind.Burning * SOURCES;
        this.burns = new BurnSystem(world); this.burnUntil = this.burns.until; this.burnStacks = this.burns.stacks;
        this.until = new Float64Array(capacity); this.strength = new Float64Array(capacity); this.sources = new Float64Array(capacity);
        this.active = new Uint32Array(capacity); this.indices = new Int32Array(capacity).fill(-1);
        this.slowUntil = new Float64Array(world.capacity); this.wardUntil = new Float64Array(world.capacity);
        this.frozenUntil = new Float64Array(world.capacity); this.slowScale = new Float32Array(world.capacity).fill(1);
        this.controlProfile = new Uint8Array(world.capacity); this.durationScale = new Float64Array(world.capacity).fill(1);
    }
    private base(kind: StatusKind, slot: number): number { return (kind * this.world.capacity + slot) * SOURCES; }
    public canAct(slot: number, tick: number): boolean { return tick >= this.frozenUntil[slot]; }
    public canMove(slot: number, tick: number): boolean { return this.canAct(slot, tick); }
    public apply(kind: StatusKind, source: number, target: number, strength: number, until: number, tick: number): boolean {
        const def = STATUS_DEFINITIONS[kind];
        if (!Number.isInteger(kind) || !def || kind === StatusKind.Burning || !Number.isFinite(strength) || strength <= 0 || strength > def.maximum
            || !Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(until) || until <= tick
            || !Number.isSafeInteger(source) || source === 0) throw new RangeError("Invalid status application");
        const slot = this.world.resolve(target);
        if (slot < 0) return false;
        if (kind === StatusKind.Frozen) {
            if (this.controlProfile[slot] === ControlProfile.Boss || !this.canAct(slot, tick) || this.amount(StatusKind.ControlResistance, slot, tick)) return false;
            until = tick + Math.max(1, Math.ceil(Math.min(ticksForSeconds(2), until - tick)
                * (this.controlProfile[slot] === ControlProfile.Elite ? .5 : 1) * this.durationScale[slot]));
        } else if (kind === StatusKind.Slow || kind === StatusKind.Chill) {
            until = tick + Math.max(1, Math.ceil((until - tick) * this.durationScale[slot]));
        }
        const base = this.base(kind, slot);
        let chosen = -1, weakest = base;
        for (let j = 0; j < def.sources; j++) {
            const i = base + j;
            if (this.until[i] <= tick) { if (chosen < 0) chosen = i; }
            else if (kind === StatusKind.Barrier) return false;
            else if (this.sources[i] === source) { chosen = i; break; }
            if (this.strength[i] < this.strength[weakest] || this.strength[i] === this.strength[weakest] && this.until[i] < this.until[weakest]) weakest = i;
        }
        if (chosen < 0) {
            if (strength <= this.strength[weakest]) return false;
            chosen = weakest;
        }
        if (this.indices[chosen] < 0) { this.indices[chosen] = this.count; this.active[this.count++] = chosen; }
        this.sources[chosen] = source; this.strength[chosen] = strength; this.until[chosen] = until;
        this.nextExpiry = Math.min(this.nextExpiry, until); this.project(slot, tick);
        return true;
    }
    public chill(source: number, target: number, amount: number, until: number, tick: number, freezeTicks: number): boolean {
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(freezeTicks) || freezeTicks <= 0) throw new RangeError("Invalid chill application");
        const slot = this.world.resolve(target);
        if (slot < 0) return false;
        const base = this.base(StatusKind.Chill, slot);
        let existing = 0;
        for (let j = 0; j < SOURCES; j++) if (this.sources[base + j] === source && tick < this.until[base + j]) existing = this.strength[base + j];
        const value = Math.min(5, existing + amount);
        if (!this.apply(StatusKind.Chill, source, target, value, until, tick)) return false;
        if (value >= 5 && this.controlProfile[slot] !== ControlProfile.Boss) {
            for (let j = 0; j < SOURCES; j++) if (this.sources[base + j] === source) this.erase(base + j);
            this.project(slot, tick);
            this.apply(StatusKind.Frozen, source, target, 1, tick + freezeTicks, tick);
        }
        return true;
    }
    public amount(kind: StatusKind, slot: number, tick: number): number {
        if (kind === StatusKind.Burning) return tick < this.burnUntil[slot] ? this.burnStacks[slot] : 0;
        const base = this.base(kind, slot); let amount = 0;
        for (let j = 0; j < STATUS_DEFINITIONS[kind].sources; j++) if (tick < this.until[base + j]) amount = Math.max(amount, this.strength[base + j]);
        return amount;
    }
    public deadline(kind: StatusKind, slot: number): number {
        if (kind === StatusKind.Burning) return this.burnUntil[slot];
        const base = this.base(kind, slot); let until = 0;
        for (let j = 0; j < STATUS_DEFINITIONS[kind].sources; j++) until = Math.max(until, this.until[base + j]);
        return until;
    }
    public source(kind: StatusKind, slot: number): number {
        const base = this.base(kind, slot); let strongest = base;
        for (let j = 1; j < STATUS_DEFINITIONS[kind].sources; j++) if (this.strength[base + j] > this.strength[strongest]) strongest = base + j;
        return this.sources[strongest];
    }
    public absorb(slot: number, damage: number, tick: number): number {
        if (!Number.isFinite(damage) || damage < 0) throw new RangeError("Absorbed damage must be finite and nonnegative");
        const i = this.base(StatusKind.Barrier, slot), absorbed = Math.min(this.amount(StatusKind.Barrier, slot, tick), damage);
        this.strength[i] -= absorbed;
        if (this.strength[i] === 0 || tick >= this.until[i]) this.erase(i);
        return damage - absorbed;
    }
    public consumeFreeze(slot: number, tick: number): void {
        const i = this.base(StatusKind.Frozen, slot), source = this.sources[i];
        if (tick >= this.until[i]) return;
        this.erase(i); this.project(slot, tick);
        this.apply(StatusKind.ControlResistance, source, this.world.ids[slot], 1, tick + ticksForSeconds(3), tick);
    }
    public removeProtection(source: number, slot: number, tick: number): void {
        const base = this.base(StatusKind.Protection, slot);
        for (let i = base; i < base + SOURCES; i++) if (this.sources[i] === source) this.erase(i);
        this.project(slot, tick);
    }
    public advance(tick: number): void {
        if (tick < this.nextExpiry) return;
        this.nextExpiry = Infinity;
        for (let cursor = this.count - 1; cursor >= 0; cursor--) {
            const i = this.active[cursor], slot = Math.floor(i / SOURCES) % this.world.capacity;
            if (tick >= this.until[i]) {
                const frozen = Math.floor(i / SOURCES / this.world.capacity) === StatusKind.Frozen;
                const source = this.sources[i], ended = this.until[i]; this.erase(i);
                if (frozen && ended + ticksForSeconds(3) > tick) this.apply(StatusKind.ControlResistance, source, this.world.ids[slot], 1, ended + ticksForSeconds(3), tick);
                this.project(slot, tick);
            } else this.nextExpiry = Math.min(this.nextExpiry, this.until[i]);
        }
    }
    public save(slot: number, tick: number): SavedStatus[] {
        const entries: SavedStatus[] = [];
        for (let kind = 0; kind < StatusKind.Burning; kind++) {
            const base = this.base(kind, slot);
            for (let j = 0; j < STATUS_DEFINITIONS[kind].sources; j++) if (tick < this.until[base + j]) entries.push({ kind, source: this.sources[base + j], amount: this.strength[base + j], remaining: this.until[base + j] - tick });
        }
        return entries;
    }
    public restore(slot: number, entries: readonly SavedStatus[], tick: number): void {
        this.clear(slot);
        const provenance = new Map<number, number>();
        // Saved remaining time already includes resistance; restore exact values without applying it twice.
        for (const entry of entries) {
            const base = this.base(entry.kind, slot);
            let index = base;
            while (index < base + STATUS_DEFINITIONS[entry.kind].sources && this.strength[index] > 0) index++;
            if (index === base + STATUS_DEFINITIONS[entry.kind].sources) throw new Error("Status save capacity exceeded");
            // External sources become inert negative provenance keys on world reconstruction.
            // They cannot merge with a fresh actor that happens to reuse the old positive handle.
            if (entry.source !== this.world.ids[slot] && !provenance.has(entry.source)) provenance.set(entry.source, -provenance.size - 1);
            this.sources[index] = entry.source === this.world.ids[slot] ? entry.source : provenance.get(entry.source)!;
            this.strength[index] = entry.amount; this.until[index] = tick + entry.remaining;
            this.indices[index] = this.count; this.active[this.count++] = index;
            this.nextExpiry = Math.min(this.nextExpiry, this.until[index]);
        }
        this.project(slot, tick);
    }
    public snapshot(slot: number, tick: number) {
        return STATUS_DEFINITIONS.flatMap((def, kind) => {
            const amount = this.amount(kind, slot, tick);
            return amount ? [{ kind, name: def.name, beneficial: def.beneficial, control: def.control, amount, remaining: (this.deadline(kind, slot) - tick) / GAME_CONFIG.timing.simulationHz }] : [];
        });
    }
    public clear(slot: number): void {
        this.burns.clear(slot);
        for (let kind = 0; kind < StatusKind.Burning; kind++) {
            const base = this.base(kind, slot);
            for (let j = 0; j < SOURCES; j++) this.erase(base + j);
        }
        this.slowUntil[slot] = this.wardUntil[slot] = this.frozenUntil[slot] = 0; this.slowScale[slot] = 1;
        this.controlProfile[slot] = ControlProfile.Normal; this.durationScale[slot] = 1;
    }
    private project(slot: number, tick: number): void {
        this.slowUntil[slot] = Math.max(this.deadline(StatusKind.Slow, slot), this.deadline(StatusKind.Chill, slot));
        const slow = Math.max(this.amount(StatusKind.Slow, slot, tick), this.amount(StatusKind.Chill, slot, tick) * .06);
        this.slowScale[slot] = 1 - Math.min(this.controlProfile[slot] === ControlProfile.Boss ? .2 : .6, slow);
        this.wardUntil[slot] = this.deadline(StatusKind.Protection, slot);
        this.frozenUntil[slot] = this.deadline(StatusKind.Frozen, slot);
    }
    private erase(i: number): void {
        const cursor = this.indices[i];
        if (cursor >= 0) {
            const last = this.active[--this.count]; this.active[cursor] = last; this.indices[last] = cursor; this.indices[i] = -1;
        }
        this.until[i] = this.strength[i] = this.sources[i] = 0;
    }
}
