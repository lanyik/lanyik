import { CombatWorld, Component, type StarImpact } from "./CombatWorld";
import { EffectKind } from "./CombatEffects";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { ticksForSeconds } from "./GameConfig";
import { StatusKind } from "./StatusSystem";
import { SKILL_RULES, type SkillId, type SkillValues } from "./Skills";

interface BladeCast { readonly stats: DerivedStats; readonly values: SkillValues; readonly context: StarImpact; readonly endsAt: number; nextAt: number }

/** One moving field and at most six sorted targets. Buffs live in StatusSystem, not the visual pool. */
export class StarCasting {
    private blades: BladeCast | undefined;
    private readonly targets = new Int32Array(6);
    private readonly distances = new Float64Array(6);
    constructor(private readonly e: CombatWorld) {}
    public get ongoing(): boolean { return !!this.blades; }
    public active(id: SkillId): boolean { return id === "blades" && !!this.blades; }
    public clear(): void { this.blades = undefined; }

    public release(id: SkillId, tick: number, stats: DerivedStats, values: SkillValues, heading: number, random: DeterministicRandom): void {
        const e = this.e, { player, world, status, position: p } = e, source = world.ids[player], v = values.star!;
        const x = p.x[player], z = p.z[player], until = tick + ticksForSeconds(values.duration);
        if (id === "infusion" || id === "resonance") {
            const energy = id === "infusion" ? status.amount(StatusKind.StarEnergy, player, tick) : 0;
            if (status.apply(StatusKind.Empowered, source, source, v.empowerment, until, tick, { charges: Math.min(8, v.charges + energy) })) {
                if (id === "infusion") status.consumeStarEnergy(player, tick);
                e.effects.add(id === "resonance" ? EffectKind.Resonance : EffectKind.Infusion, tick, x, z, 2, 1.3, x, z, source);
            }
        } else if (id === "ward" || id === "bastion") {
            if (id === "ward" && status.amount(StatusKind.Barrier, player, tick)) return;
            if (status.apply(StatusKind.Barrier, source, source, values.ward, until, tick, { recovery: v.recovery })) {
                if (v.protection) status.apply(StatusKind.AstralGuard, source, source, v.protection, until, tick);
                e.effects.add(id === "bastion" ? EffectKind.Bastion : EffectKind.Ward, tick, x, z, id === "bastion" ? 2.2 : 1.2, 1.2, x, z, source);
            }
        } else if (id === "shelter") {
            status.apply(StatusKind.AstralGuard, source, source, v.protection, until, tick);
            const cleansed = status.cleanse(player, v.cleanse, tick);
            e.effects.add(cleansed ? EffectKind.Cleanse : EffectKind.Shelter, tick, x, z, 1.8, 1.2, x, z, source);
        } else {
            const context: StarImpact = { values: v, energy: id === "starbolt", gainedEnergy: false };
            if (id === "blades") {
                this.blades = { stats, values, context, endsAt: until, nextAt: tick + ticksForSeconds(SKILL_RULES.blades.interval) };
                e.effects.add(EffectKind.Blades, tick, x, z, values.radius, values.duration, x, z, source);
            } else this.bolts(tick, stats, values, context, heading, random);
        }
    }
    public advance(tick: number, random: DeterministicRandom, settle: () => void): void {
        const cast = this.blades;
        if (!cast) return;
        if (tick > cast.endsAt) { this.blades = undefined; return; }
        if (tick < cast.nextAt) return;
        const e = this.e, p = e.position, x = p.x[e.player], z = p.z[e.player], width = SKILL_RULES.blades.width;
        const nearby = e.queryNearby(Component.Enemy, x, z, cast.values.radius + width, true, true);
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i];
            if (Math.hypot(p.x[slot] - x, p.z[slot] - z) + p.radius[slot] < cast.values.radius - width || !e.canSee(e.player, slot)) continue;
            this.hit(slot, cast.stats, cast.values, cast.context, random);
        }
        cast.nextAt += ticksForSeconds(SKILL_RULES.blades.interval);
        if (tick === cast.endsAt) this.blades = undefined;
        settle();
    }
    private hit(slot: number, stats: DerivedStats, values: SkillValues, context: StarImpact, random: DeterministicRandom): void {
        const hit = rollAttack(stats, random, values.damage), e = this.e;
        e.impacts.star(e.world.ids[e.player], e.world.ids[slot], hit.damage, hit.critical, stats, context);
    }
    private bolts(tick: number, stats: DerivedStats, values: SkillValues, context: StarImpact, heading: number, random: DeterministicRandom): void {
        const e = this.e, p = e.position, x = p.x[e.player], z = p.z[e.player], source = e.world.ids[e.player];
        const nearby = e.queryNearby(Component.Enemy, x, z, values.radius);
        let count = 0;
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i], distance = (p.x[slot] - x) ** 2 + (p.z[slot] - z) ** 2;
            if (distance > values.radius ** 2 || !e.canSee(e.player, slot)) continue;
            let at = count;
            while (at > 0 && (distance < this.distances[at - 1] || distance === this.distances[at - 1] && e.world.ids[slot] < e.world.ids[this.targets[at - 1]])) at--;
            if (at >= values.targets) continue;
            for (let j = Math.min(count, values.targets - 1); j > at; j--) { this.targets[j] = this.targets[j - 1]; this.distances[j] = this.distances[j - 1]; }
            this.targets[at] = slot; this.distances[at] = distance; count = Math.min(count + 1, values.targets);
        }
        for (let i = 0; i < count; i++) {
            const slot = this.targets[i]; this.hit(slot, stats, values, context, random);
            e.effects.add(EffectKind.StarBolt, tick, x, z, .3, .5, p.x[slot], p.z[slot], source);
        }
        if (!count) e.effects.add(EffectKind.StarBolt, tick, x, z, .3, .5, x + Math.sin(heading) * values.radius, z + Math.cos(heading) * values.radius, source);
    }
}
