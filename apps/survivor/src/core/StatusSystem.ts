import type { EntityWorld } from "./EntityWorld";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";
import { BurnSystem } from "./BurnSystem";

export enum StatusKind { Slow, Protection, Barrier, Chill, Frozen, ControlResistance, Conductive, StaticGuard, StarEnergy, Empowered, AstralGuard, Weakened, Burning }
export enum ControlProfile { Normal, Elite, Boss }
export const STATUS_DEFINITIONS = Object.freeze([
    { name: "减速", beneficial: false, control: true, sources: 4, maximum: .6 },
    { name: "保护", beneficial: true, control: false, sources: 4, maximum: 1 },
    { name: "结界", beneficial: true, control: false, sources: 1, maximum: Infinity },
    { name: "寒意", beneficial: false, control: true, sources: 4, maximum: 5 },
    { name: "冻结", beneficial: false, control: true, sources: 1, maximum: 1 },
    { name: "控制抵抗", beneficial: true, control: false, sources: 1, maximum: 1 },
    { name: "导电", beneficial: false, control: false, sources: 1, maximum: 1 },
    { name: "静电防护", beneficial: true, control: false, sources: 1, maximum: .05 },
    { name: "星能", beneficial: true, control: false, sources: 1, maximum: 3 },
    { name: "星辰强化", beneficial: true, control: false, sources: 1, maximum: .8 },
    { name: "星辰庇护", beneficial: true, control: false, sources: 1, maximum: .5 },
    { name: "虚弱", beneficial: false, control: false, sources: 4, maximum: .3 },
    { name: "灼烧", beneficial: false, control: false, sources: 4, maximum: 32 }
] as const);
export const MAX_SAVED_STATUSES = STATUS_DEFINITIONS.slice(0, StatusKind.Burning).reduce((sum, def) => sum + def.sources, 0);
export interface SavedStatus { readonly kind: StatusKind; readonly source: number; readonly amount: number; readonly remaining: number; readonly charges?: number; readonly recovery?: number }
interface StatusData { readonly charges?: number; readonly recovery?: number }
const NO_DATA: StatusData = Object.freeze({});
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
    public readonly conductiveUntil: Float64Array;
    public readonly staticGuardUntil: Float64Array;
    public readonly starEnergy: Uint8Array;
    public readonly empoweredUntil: Float64Array;
    public readonly empoweredCharges: Uint8Array;
    public readonly astralGuardUntil: Float64Array;
    public readonly weakenedUntil: Float64Array;
    private readonly barrierRecovery: Float64Array;
    public readonly controlProfile: Uint8Array;
    public readonly durationScale: Float64Array;
    private readonly until: Float64Array;
    private readonly strength: Float64Array;
    private readonly sources: Float64Array;
    private readonly active: Uint32Array;
    private readonly indices: Int32Array;
    private readonly dirty: Uint8Array;
    private readonly dirtySlots: Uint32Array;
    private count = 0;
    private nextExpiry = Infinity;

    constructor(private readonly world: EntityWorld) {
        const capacity = world.capacity * StatusKind.Burning * SOURCES;
        this.burns = new BurnSystem(world); this.burnUntil = this.burns.until; this.burnStacks = this.burns.stacks;
        this.until = new Float64Array(capacity); this.strength = new Float64Array(capacity); this.sources = new Float64Array(capacity);
        this.active = new Uint32Array(capacity); this.indices = new Int32Array(capacity).fill(-1);
        this.dirty = new Uint8Array(world.capacity); this.dirtySlots = new Uint32Array(world.capacity);
        this.slowUntil = new Float64Array(world.capacity); this.wardUntil = new Float64Array(world.capacity);
        this.frozenUntil = new Float64Array(world.capacity); this.slowScale = new Float32Array(world.capacity).fill(1);
        this.conductiveUntil = new Float64Array(world.capacity); this.staticGuardUntil = new Float64Array(world.capacity);
        this.starEnergy = new Uint8Array(world.capacity); this.empoweredUntil = new Float64Array(world.capacity); this.empoweredCharges = new Uint8Array(world.capacity);
        this.astralGuardUntil = new Float64Array(world.capacity); this.weakenedUntil = new Float64Array(world.capacity); this.barrierRecovery = new Float64Array(world.capacity);
        this.controlProfile = new Uint8Array(world.capacity); this.durationScale = new Float64Array(world.capacity).fill(1);
    }
    private base(kind: StatusKind, slot: number): number { return (kind * this.world.capacity + slot) * SOURCES; }
    public canAct(slot: number, tick: number): boolean { return tick >= this.frozenUntil[slot]; }
    public canMove(slot: number, tick: number): boolean { return this.canAct(slot, tick); }
    public protection(slot: number, tick: number): number { return Math.max(this.amount(StatusKind.Protection, slot, tick), this.amount(StatusKind.StaticGuard, slot, tick), this.amount(StatusKind.AstralGuard, slot, tick)); }
    public apply(kind: StatusKind, source: number, target: number, strength: number, until: number, tick: number, data: StatusData = NO_DATA): boolean {
        const def = STATUS_DEFINITIONS[kind];
        if (!Number.isInteger(kind) || !def || kind === StatusKind.Burning || !Number.isFinite(strength) || strength <= 0 || strength > def.maximum
            || !Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(until) || until <= tick
            || !Number.isSafeInteger(source) || source === 0
            || (kind === StatusKind.Empowered ? !Number.isInteger(data.charges) || data.charges! < 1 || data.charges! > 8 || until - tick > ticksForSeconds(15) : data.charges !== undefined)
            || (data.recovery !== undefined && (kind !== StatusKind.Barrier || !Number.isFinite(data.recovery) || data.recovery < 0))
            || kind === StatusKind.StarEnergy && (!Number.isInteger(strength) || until - tick > ticksForSeconds(8))) throw new RangeError("Invalid status application");
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
            if (kind === StatusKind.Conductive || kind === StatusKind.StaticGuard) { chosen = i; break; }
            if (this.until[i] <= tick) { if (chosen < 0) chosen = i; }
            else if (kind === StatusKind.Barrier) { if (strength <= this.strength[i]) return false; chosen = i; break; }
            else if (kind === StatusKind.Empowered) {
                if (!this.canEmpower(slot, strength, data.charges!, until, tick)) return false;
                chosen = i; break;
            } else if (kind === StatusKind.AstralGuard) {
                if (strength < this.strength[i]) return false;
                chosen = i; break;
            }
            else if (this.sources[i] === source) { chosen = i; break; }
            if (this.strength[i] < this.strength[weakest] || this.strength[i] === this.strength[weakest] && this.until[i] < this.until[weakest]) weakest = i;
        }
        if (chosen < 0) {
            if (strength <= this.strength[weakest]) return false;
            chosen = weakest;
        }
        if (this.indices[chosen] < 0) { this.indices[chosen] = this.count; this.active[this.count++] = chosen; }
        this.sources[chosen] = source; this.strength[chosen] = strength; this.until[chosen] = until;
        if (kind === StatusKind.Empowered) this.empoweredCharges[slot] = data.charges!;
        if (kind === StatusKind.Barrier) this.barrierRecovery[slot] = data.recovery ?? 0;
        this.nextExpiry = Math.min(this.nextExpiry, until);
        // These two kinds have no movement/render projection; their consumers read the source records.
        if (kind !== StatusKind.Barrier && kind !== StatusKind.ControlResistance) this.project(slot, tick);
        return true;
    }
    /** Compare the entire charge instance; a weaker buff cannot refresh a stronger one. */
    public canEmpower(slot: number, strength: number, charges: number, until: number, tick: number): boolean {
        const current = this.amount(StatusKind.Empowered, slot, tick);
        return strength > current || strength === current && (charges > this.empoweredCharges[slot]
            || charges === this.empoweredCharges[slot] && until > this.deadline(StatusKind.Empowered, slot));
    }
    public consumeEmpowerment(slot: number, tick: number): number {
        const amount = this.amount(StatusKind.Empowered, slot, tick);
        if (amount && --this.empoweredCharges[slot] === 0) { this.erase(this.base(StatusKind.Empowered, slot)); this.project(slot, tick); }
        return amount;
    }
    public gainStarEnergy(slot: number, tick: number): void {
        const actor = this.world.ids[slot];
        this.apply(StatusKind.StarEnergy, actor, actor, Math.min(3, this.amount(StatusKind.StarEnergy, slot, tick) + 1), tick + ticksForSeconds(8), tick);
    }
    public consumeStarEnergy(slot: number, tick: number): number {
        const amount = this.amount(StatusKind.StarEnergy, slot, tick);
        this.erase(this.base(StatusKind.StarEnergy, slot)); this.starEnergy[slot] = 0; return amount;
    }
    /** Read before absorb, then heal after health damage; lethal overflow must not resurrect. */
    public barrierBreakRecovery(slot: number, damage: number, tick: number): number {
        const amount = this.amount(StatusKind.Barrier, slot, tick);
        return amount > 0 && damage >= amount ? this.barrierRecovery[slot] : 0;
    }
    public clearStarBenefits(slot: number, tick: number): void {
        for (const kind of [StatusKind.StarEnergy, StatusKind.Empowered, StatusKind.AstralGuard, StatusKind.Barrier]) {
            const i = this.base(kind, slot);
            if (this.sources[i] === this.world.ids[slot]) this.erase(i);
        }
        this.project(slot, tick);
    }
    public hasCleansable(slot: number, tick: number): boolean {
        return this.burnUntil[slot] > tick || [StatusKind.Frozen, StatusKind.Slow, StatusKind.Chill, StatusKind.Weakened, StatusKind.Conductive].some(kind => this.amount(kind, slot, tick) > 0);
    }
    /** Each scalar source or entire burn source group costs one dispel. No expiry/explosion callbacks. */
    public cleanse(slot: number, limit: number, tick: number): number {
        if (!Number.isInteger(limit) || limit < 0 || limit > 5) throw new RangeError("Invalid cleanse budget");
        let removed = 0;
        if (limit && this.amount(StatusKind.Frozen, slot, tick)) { this.consumeFreeze(slot, tick); removed++; }
        while (removed < limit && this.burns.cleanseOne(slot, tick)) removed++;
        while (removed < limit) {
            let chosen = -1, chosenKind = -1, priority = Infinity;
            for (const kind of [StatusKind.Slow, StatusKind.Chill, StatusKind.Weakened, StatusKind.Conductive]) {
                const base = this.base(kind, slot), order = kind === StatusKind.Slow || kind === StatusKind.Chill ? 0 : 1;
                for (let j = 0; j < STATUS_DEFINITIONS[kind].sources; j++) {
                    const i = base + j;
                    if (tick >= this.until[i]) continue;
                    if (chosen < 0 || order < priority || order === priority && (this.until[i] < this.until[chosen]
                        || this.until[i] === this.until[chosen] && (kind < chosenKind
                            || kind === chosenKind && this.sources[i] < this.sources[chosen]))) { chosen = i; chosenKind = kind; priority = order; }
                }
            }
            if (chosen < 0) break;
            this.erase(chosen); removed++;
        }
        this.project(slot, tick); return removed;
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
    public removeStaticGuard(slot: number): void { this.erase(this.base(StatusKind.StaticGuard, slot)); this.staticGuardUntil[slot] = 0; }
    public advance(tick: number): void {
        if (tick < this.nextExpiry) return;
        this.nextExpiry = Infinity;
        let dirtyCount = 0;
        for (let cursor = this.count - 1; cursor >= 0; cursor--) {
            const i = this.active[cursor], slot = Math.floor(i / SOURCES) % this.world.capacity;
            if (tick >= this.until[i]) {
                const frozen = Math.floor(i / SOURCES / this.world.capacity) === StatusKind.Frozen;
                const source = this.sources[i], ended = this.until[i]; this.erase(i);
                if (frozen && ended + ticksForSeconds(3) > tick) this.apply(StatusKind.ControlResistance, source, this.world.ids[slot], 1, ended + ticksForSeconds(3), tick);
                if (!this.dirty[slot]) { this.dirty[slot] = 1; this.dirtySlots[dirtyCount++] = slot; }
            } else this.nextExpiry = Math.min(this.nextExpiry, this.until[i]);
        }
        // No external callbacks run during expiry. Publish once per target before the next simulation stage.
        for (let i = 0; i < dirtyCount; i++) {
            const slot = this.dirtySlots[i]; this.project(slot, tick); this.dirty[slot] = 0;
        }
    }
    public save(slot: number, tick: number): SavedStatus[] {
        const entries: SavedStatus[] = [];
        for (let kind = 0; kind < StatusKind.Burning; kind++) {
            const base = this.base(kind, slot);
            for (let j = 0; j < STATUS_DEFINITIONS[kind].sources; j++) if (tick < this.until[base + j]) entries.push({ kind, source: this.sources[base + j], amount: this.strength[base + j], remaining: this.until[base + j] - tick,
                ...(kind === StatusKind.Empowered ? { charges: this.empoweredCharges[slot] } : kind === StatusKind.Barrier ? { recovery: this.barrierRecovery[slot] } : {}) });
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
            if (entry.kind === StatusKind.Empowered) this.empoweredCharges[slot] = entry.charges!;
            if (entry.kind === StatusKind.Barrier) this.barrierRecovery[slot] = entry.recovery ?? 0;
            this.indices[index] = this.count; this.active[this.count++] = index;
            this.nextExpiry = Math.min(this.nextExpiry, this.until[index]);
        }
        this.project(slot, tick);
    }
    public snapshot(slot: number, tick: number) {
        return STATUS_DEFINITIONS.flatMap((def, kind) => {
            const amount = this.amount(kind, slot, tick);
            return amount ? [{ kind, name: def.name, beneficial: def.beneficial, control: def.control, amount, remaining: (this.deadline(kind, slot) - tick) / GAME_CONFIG.timing.simulationHz,
                ...(kind === StatusKind.Empowered ? { charges: this.empoweredCharges[slot] } : {}) }] : [];
        });
    }
    public clear(slot: number): void {
        this.burns.clear(slot);
        for (let kind = 0; kind < StatusKind.Burning; kind++) {
            const base = this.base(kind, slot);
            for (let j = 0; j < SOURCES; j++) this.erase(base + j);
        }
        this.slowUntil[slot] = this.wardUntil[slot] = this.frozenUntil[slot] = this.conductiveUntil[slot] = this.staticGuardUntil[slot] = 0; this.slowScale[slot] = 1;
        this.starEnergy[slot] = this.empoweredUntil[slot] = this.empoweredCharges[slot] = this.astralGuardUntil[slot] = this.weakenedUntil[slot] = this.barrierRecovery[slot] = 0;
        this.controlProfile[slot] = ControlProfile.Normal; this.durationScale[slot] = 1;
    }
    private project(slot: number, tick: number): void {
        this.slowUntil[slot] = Math.max(this.deadline(StatusKind.Slow, slot), this.deadline(StatusKind.Chill, slot));
        const slow = Math.max(this.amount(StatusKind.Slow, slot, tick), this.amount(StatusKind.Chill, slot, tick) * .06);
        this.slowScale[slot] = 1 - Math.min(this.controlProfile[slot] === ControlProfile.Boss ? .2 : .6, slow);
        this.wardUntil[slot] = this.deadline(StatusKind.Protection, slot);
        this.frozenUntil[slot] = this.deadline(StatusKind.Frozen, slot);
        this.conductiveUntil[slot] = this.deadline(StatusKind.Conductive, slot);
        this.staticGuardUntil[slot] = this.deadline(StatusKind.StaticGuard, slot);
        this.starEnergy[slot] = this.amount(StatusKind.StarEnergy, slot, tick);
        this.empoweredUntil[slot] = this.deadline(StatusKind.Empowered, slot);
        if (!this.empoweredUntil[slot]) this.empoweredCharges[slot] = 0;
        this.astralGuardUntil[slot] = this.deadline(StatusKind.AstralGuard, slot);
        this.weakenedUntil[slot] = this.deadline(StatusKind.Weakened, slot);
    }
    private erase(i: number): void {
        const cursor = this.indices[i];
        if (cursor >= 0) {
            const last = this.active[--this.count]; this.active[cursor] = last; this.indices[last] = cursor; this.indices[i] = -1;
        }
        this.until[i] = this.strength[i] = this.sources[i] = 0;
    }
}
