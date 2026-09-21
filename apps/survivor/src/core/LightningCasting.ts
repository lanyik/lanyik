import { CombatWorld, Component, type LightningFocus } from "./CombatWorld";
import { EffectKind } from "./CombatEffects";
import { segmentCylinderHit } from "./AttackGeometry";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { ticksForSeconds } from "./GameConfig";
import type { SkillId, SkillValues } from "./Skills";

interface LightningCast { readonly source: number; readonly stats: DerivedStats; readonly values: SkillValues; readonly focus?: LightningFocus }
type FieldId = "thunderstrike" | "thunderfield" | "judgment";
interface LightningField extends LightningCast { readonly x: number; readonly z: number; readonly endsAt: number; nextAt: number; pulses: number }

/** Spatially bounded conduction: one visit stamp and one 24-node work queue per batch, no recursive triggers. */
export class LightningCasting {
    private readonly fields = new Map<FieldId, LightningField>();
    private readonly visited: Uint32Array;
    private epoch = 0;
    private readonly nodes = new Int32Array(24);
    private readonly depths = new Uint8Array(24);
    private readonly distances = new Float64Array(8);
    constructor(private readonly e: CombatWorld) { this.visited = new Uint32Array(e.world.capacity); }
    public get ongoing(): boolean { return this.fields.size > 0; }
    public active(id: SkillId): boolean { return this.fields.has(id as FieldId); }
    public clear(): void { this.fields.clear(); }

    public release(id: SkillId, tick: number, stats: DerivedStats, values: SkillValues, x: number, z: number, heading: number, random: DeterministicRandom): void {
        const e = this.e, source = e.world.ids[e.player], cast: LightningCast = { source, stats, values };
        if (id === "thunderstrike" || id === "thunderfield" || id === "judgment") {
            const v = values.lightning!, delay = ticksForSeconds(v.delay);
            const duration = id === "thunderfield" ? ticksForSeconds(values.duration) : delay + (v.pulses - 1) * ticksForSeconds(v.interval);
            const focus = v.focus > 0 ? { ids: new Float64Array(e.world.capacity), hits: new Uint8Array(e.world.capacity) } : undefined;
            this.fields.set(id, { ...cast, focus, x, z, endsAt: tick + duration, nextAt: tick + delay, pulses: v.pulses });
            e.effects.add(id === "thunderfield" ? EffectKind.ThunderField : id === "judgment" ? EffectKind.JudgmentWarning : EffectKind.ThunderWarning,
                tick, x, z, values.radius, id === "thunderfield" ? values.duration : v.delay, x, z, source);
            return;
        }
        this.begin(); x = e.position.x[e.player]; z = e.position.z[e.player];
        if (id === "thunderlance") { this.lance(cast, x, z, heading, tick, random); return; }
        const before = e.impacts.count;
        if (id === "arc") {
            for (let i = 0; i < values.targets; i++) {
                const slot = this.pick(x, z, e.aimHeight(e.player), values.lightning!.range, tick, false);
                if (slot < 0) break;
                this.hit(cast, slot, 1, random); this.link(cast, x, z, slot, tick, EffectKind.Lightning);
            }
        } else this.network(cast, x, z, tick, random, id === "tempest");
        if (e.impacts.count === before) e.effects.add(id === "tempest" ? EffectKind.Tempest : EffectKind.Lightning,
            tick, x, z, .4, .55, x + Math.sin(heading) * values.lightning!.range, z + Math.cos(heading) * values.lightning!.range, source);
    }

    public advance(tick: number, random: DeterministicRandom, settle: () => void): void {
        for (const [id, cast] of this.fields) {
            if (tick > cast.endsAt) { this.fields.delete(id); continue; }
            if (!cast.pulses || tick < cast.nextAt) continue;
            this.begin(); this.area(cast, id, tick, random);
            cast.pulses--;
            if (id !== "thunderfield") this.e.effects.add(id === "judgment" ? EffectKind.JudgmentImpact : EffectKind.ThunderImpact,
                tick, cast.x, cast.z, cast.values.radius, id === "judgment" ? 1.15 : .6, cast.x, cast.z, cast.source);
            if (cast.pulses) {
                cast.nextAt += ticksForSeconds(cast.values.lightning!.interval);
                if (id === "thunderstrike") this.e.effects.add(EffectKind.ThunderWarning, tick, cast.x, cast.z, cast.values.radius,
                    cast.values.lightning!.interval, cast.x, cast.z, cast.source);
            }
            if (tick === cast.endsAt) this.fields.delete(id);
            settle();
        }
    }

    private begin(): void {
        if (++this.epoch === 0xffffffff) { this.visited.fill(0); this.epoch = 1; }
    }
    private pick(x: number, z: number, y: number, range: number, tick: number, preferConductive: boolean): number {
        const e = this.e, p = e.position, nearby = e.queryNearby(Component.Enemy, x, z, range);
        let target = -1, nearest = range * range, preferred = false;
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i]; if (this.visited[slot] === this.epoch) continue;
            const distance = (p.x[slot] - x) ** 2 + (p.z[slot] - z) ** 2;
            if (distance > range * range) continue;
            const conductive = preferConductive && e.status.conductiveUntil[slot] > tick;
            if (target >= 0 && (preferred && !conductive || preferred === conductive && (distance > nearest || distance === nearest && e.world.ids[slot] > e.world.ids[target]))) continue;
            if (e.terrain.traceAttack(x, y, z, p.x[slot], e.aimHeight(slot), p.z[slot], 0) !== Infinity) continue;
            target = slot; nearest = distance; preferred = conductive;
        }
        return target;
    }
    private hit(cast: LightningCast, slot: number, scale: number, random: DeterministicRandom): void {
        this.visited[slot] = this.epoch;
        const hit = rollAttack(cast.stats, random, cast.values.damage * scale);
        this.e.impacts.lightning(cast.source, this.e.world.ids[slot], hit.damage, hit.critical, cast.stats, cast.values.lightning!, cast.focus);
    }
    private link(cast: LightningCast, x: number, z: number, slot: number, tick: number, kind: EffectKind): void {
        const p = this.e.position;
        this.e.effects.add(kind, tick, x, z, .4, .55, p.x[slot], p.z[slot], cast.source);
    }
    private network(cast: LightningCast, x: number, z: number, tick: number, random: DeterministicRandom, branching: boolean, root = -1): void {
        const e = this.e, p = e.position, v = cast.values.lightning!, kind = branching ? EffectKind.Tempest : EffectKind.Lightning;
        const seeded = root >= 0;
        if (!seeded) {
            root = this.pick(x, z, e.aimHeight(e.player), v.range, tick, false);
            if (root < 0) return;
            this.hit(cast, root, 1, random); this.link(cast, x, z, root, tick, kind);
        }
        this.nodes[0] = root; this.depths[0] = 0;
        const limit = cast.values.targets + Number(seeded);
        let count = 1;
        // The field's seed was already hit by its area pulse. Only new targets spend its short-chain budget.
        for (let cursor = 0; cursor < count && count < limit; cursor++) {
            const from = this.nodes[cursor], depth = this.depths[cursor] + 1;
            for (let branch = 0; branch < (branching ? 2 : 1) && count < limit; branch++) {
                const slot = this.pick(p.x[from], p.z[from], e.aimHeight(from), v.jumpRange, tick, true);
                if (slot < 0) break;
                this.hit(cast, slot, v.retention ** depth, random); this.link(cast, p.x[from], p.z[from], slot, tick, kind);
                this.nodes[count] = slot; this.depths[count++] = depth;
            }
        }
    }
    private area(cast: LightningField, id: FieldId, tick: number, random: DeterministicRandom): void {
        const e = this.e, p = e.position, { x, z, values } = cast, y = e.terrain.height(x, z) + .7;
        const core = id === "judgment" ? this.pick(x, z, y, .8, tick, false) : -1;
        const nearby = e.queryNearby(Component.Enemy, x, z, values.radius, true, true);
        let root = -1, nearest = Infinity;
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i];
            if (e.terrain.traceAttack(x, y, z, p.x[slot], e.aimHeight(slot), p.z[slot], 0) !== Infinity) continue;
            this.hit(cast, slot, id === "judgment" && slot !== core ? .5 : 1, random);
            const distance = (p.x[slot] - x) ** 2 + (p.z[slot] - z) ** 2;
            if (distance < nearest || distance === nearest && (root < 0 || e.world.ids[slot] < e.world.ids[root])) { root = slot; nearest = distance; }
        }
        if (id === "thunderfield" && root >= 0) this.network(cast, x, z, tick, random, false, root);
    }
    private lance(cast: LightningCast, x: number, z: number, heading: number, tick: number, random: DeterministicRandom): void {
        const e = this.e, p = e.position, y = e.aimHeight(e.player), width = cast.values.radius, range = cast.values.lightning!.range;
        const dx = Math.sin(heading) * range, dz = Math.cos(heading) * range;
        const end = Math.min(1, e.terrain.traceAttack(x, y, z, x + dx, y, z + dz, width));
        const ex = x + dx * end, ez = z + dz * end;
        e.effects.add(EffectKind.ThunderLance, tick, x, z, width, .6, ex, ez, cast.source);
        const nearby = e.queryNearby(Component.Enemy, (x + ex) / 2, (z + ez) / 2, range * end / 2 + width, true);
        let count = 0;
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i], bottom = e.terrain.height(p.x[slot], p.z[slot]);
            const distance = segmentCylinderHit(x, y, z, ex, y, ez, p.x[slot], p.z[slot], bottom - width, bottom + e.bodyHeight(slot) + width, p.radius[slot] + width);
            if (distance === Infinity) continue;
            let at = 0;
            while (at < count && (this.distances[at] < distance || this.distances[at] === distance && e.world.ids[this.nodes[at]] < e.world.ids[slot])) at++;
            if (at >= cast.values.targets) continue;
            count = Math.min(count + 1, cast.values.targets);
            for (let j = count - 1; j > at; j--) { this.nodes[j] = this.nodes[j - 1]; this.distances[j] = this.distances[j - 1]; }
            this.nodes[at] = slot; this.distances[at] = distance;
        }
        for (let i = 0; i < count; i++) this.hit(cast, this.nodes[i], 1, random);
    }
}
