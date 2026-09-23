import { CombatWorld, Component } from "./CombatWorld";
import { EffectKind } from "./CombatEffects";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { ticksForSeconds } from "./GameConfig";
import { StatusKind } from "./StatusSystem";
import type { SkillId, SkillValues } from "./Skills";

interface IceField { readonly id: SkillId; readonly x: number; readonly z: number; readonly stats: DerivedStats; readonly values: SkillValues; readonly endsAt: number; nextAt: number }
/** One field per ice skill; direct shots use bounded nearest candidates, never a world scan. */
export class FrostCasting {
    private readonly fields = new Map<SkillId, IceField>();
    private readonly targets = new Int32Array(8);
    private readonly distances = new Float64Array(8);
    constructor(private readonly e: CombatWorld) {}
    public active(id: SkillId): boolean { return this.fields.has(id); }
    public get ongoing(): boolean { return this.fields.size > 0; }
    public clear(): void { this.fields.clear(); }
    public release(id: SkillId, tick: number, stats: DerivedStats, values: SkillValues, x: number, z: number, heading: number, random: DeterministicRandom): void {
        if (id === "icestorm" || id === "blizzard") {
            this.fields.set(id, { id, x, z, stats, values, endsAt: tick + ticksForSeconds(values.duration), nextAt: tick + ticksForSeconds(.5) });
            this.e.effects.add(EffectKind.IceField, tick, x, z, values.radius, values.duration, x, z, this.e.world.ids[this.e.player]);
        } else if (id === "icebolt" || id === "icelance") this.shots(id, tick, stats, values, heading, random);
        else {
            this.area(id, tick, stats, values, x, z, random);
            this.e.effects.add(id === "shatter" ? EffectKind.Shatter : EffectKind.Frost, tick, x, z, values.radius, 1, x, z, this.e.world.ids[this.e.player]);
        }
    }
    public advance(tick: number, random: DeterministicRandom, settle: () => void): void {
        for (const [id, field] of this.fields) {
            if (tick >= field.nextAt && field.nextAt <= field.endsAt) {
                this.area(id, tick, field.stats, field.values, field.x, field.z, random);
                field.nextAt += ticksForSeconds(.5); settle();
            }
            if (tick >= field.endsAt) this.fields.delete(id);
        }
    }
    private hit(id: SkillId, slot: number, tick: number, stats: DerivedStats, values: SkillValues, random: DeterministicRandom, areaControl: boolean): void {
        const { world, player, status, impacts } = this.e, source = world.ids[player], target = world.ids[slot];
        const hit = rollAttack(stats, random, values.damage);
        const impact = impacts.count;
        impacts.ice(source, target, hit.damage, hit.critical, areaControl ? 0 : values.chill, ticksForSeconds(values.slowSeconds), ticksForSeconds(values.freezeSeconds),
            values.frozenDamage * (id === "shatter" ? 1.5 : 1), id === "shatter");
        impacts.castStats[impact] = stats;
        if (areaControl) {
            if (id === "absolutezero") status.apply(StatusKind.Frozen, source, target, 1, tick + ticksForSeconds(values.freezeSeconds), tick);
            status.chill(source, target, values.chill, tick + ticksForSeconds(values.slowSeconds), tick, ticksForSeconds(values.freezeSeconds));
        }
    }
    private area(id: SkillId, tick: number, stats: DerivedStats, values: SkillValues, x: number, z: number, random: DeterministicRandom): void {
        const { position: p, terrain } = this.e;
        const nearby = this.e.queryNearby(Component.Enemy, x, z, values.radius, true, true), y = terrain.height(x, z) + .7;
        for (let cursor = 0; cursor < nearby.count; cursor++) {
            const slot = nearby.slots[cursor];
            if (terrain.traceAttack(x, y, z, p.x[slot], this.e.aimHeight(slot), p.z[slot], 0) !== Infinity) continue;
            this.hit(id, slot, tick, stats, values, random, id === "frost" || id === "absolutezero");
        }
    }
    private shots(id: SkillId, tick: number, stats: DerivedStats, values: SkillValues, heading: number, random: DeterministicRandom): void {
        const { position: p, player, world } = this.e, x = p.x[player], z = p.z[player];
        const nearby = this.e.queryNearby(Component.Enemy, x, z, values.radius);
        let count = 0;
        for (let cursor = 0; cursor < nearby.count; cursor++) {
            const slot = nearby.slots[cursor], dx = p.x[slot] - x, dz = p.z[slot] - z, distance = dx * dx + dz * dz;
            if (distance > values.radius ** 2 || !this.e.canSee(player, slot)) continue;
            if (id === "icelance" && (dx * Math.sin(heading) + dz * Math.cos(heading) < 0 || Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading)) > .4 + p.radius[slot])) continue;
            let at = count;
            while (at > 0 && (distance < this.distances[at - 1] || distance === this.distances[at - 1] && world.ids[slot] < world.ids[this.targets[at - 1]])) at--;
            if (at >= values.targets) continue;
            for (let j = Math.min(count, values.targets - 1); j > at; j--) { this.targets[j] = this.targets[j - 1]; this.distances[j] = this.distances[j - 1]; }
            this.targets[at] = slot; this.distances[at] = distance; count = Math.min(values.targets, count + 1);
        }
        for (let i = 0; i < count; i++) {
            const slot = this.targets[i]; this.hit(id, slot, tick, stats, values, random, false);
            this.e.effects.add(EffectKind.IceBolt, tick, x, z, .35, .4, p.x[slot], p.z[slot], world.ids[player]);
        }
        if (!count) this.e.effects.add(EffectKind.IceBolt, tick, x, z, .35, .4, x + Math.sin(heading) * values.radius, z + Math.cos(heading) * values.radius, world.ids[player]);
    }
}
