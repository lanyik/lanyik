import { CombatWorld, Component } from "./CombatWorld";
import { EffectKind, MAX_FIRE_PROJECTILES, fireShotArrays } from "./CombatEffects";
import { segmentCylinderHit } from "./AttackGeometry";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";
import { SKILL_RULES, type SkillId, type SkillValues } from "./Skills";

interface FireCast { readonly stats: DerivedStats; readonly values: SkillValues; readonly source: number }
interface FireField extends FireCast {
    readonly x: number; readonly z: number; readonly heading: number; readonly length: number; readonly endsAt: number; nextAt: number;
}
interface FireShot extends FireCast {
    readonly dx: number; readonly dy: number; readonly dz: number; remaining: number;
    readonly volley?: Map<number, number>;
}
/** Gameplay projectiles and fields have their own bounded lifetime, independent of visual saturation. */
export class FireCasting {
    public readonly projectiles = { ...fireShotArrays((Type, n) => new Type(n)), count: 0 };
    private readonly shots: FireShot[] = [];
    private readonly fields = new Map<SkillId, FireField>();
    constructor(private readonly e: CombatWorld) {}
    public get ongoing(): boolean { return this.fields.size > 0 || this.projectiles.count > 0; }
    public active(id: SkillId): boolean { return this.fields.has(id); }
    public available(id: SkillId, values: SkillValues): boolean {
        return !this.active(id) && (!(id === "fireball" || id === "pyroblast") || this.projectiles.count + values.targets <= MAX_FIRE_PROJECTILES);
    }
    public clear(): void { this.fields.clear(); this.shots.length = this.projectiles.count = 0; }
    public interruptChannel(): void {
        this.fields.delete("fireray");
        this.e.effects.cancelKind(this.e.world.ids[this.e.player], EffectKind.FireRay);
    }
    public release(id: SkillId, tick: number, stats: DerivedStats, values: SkillValues, x: number, z: number, heading: number, random: DeterministicRandom): void {
        const e = this.e, source = e.world.ids[e.player], cast = { source, stats, values };
        if (id === "fireball" || id === "pyroblast") {
            const b = this.projectiles, p = e.position, volley = id === "pyroblast" ? new Map<number, number>() : undefined;
            const sx = p.x[e.player], sz = p.z[e.player], sy = e.aimHeight(e.player), speed = 14 / GAME_CONFIG.timing.simulationHz;
            const slope = (e.terrain.height(x, z) + .7 - sy) / Math.max(1, Math.hypot(x - sx, z - sz));
            for (let j = 0; j < values.targets; j++) {
                if (b.count === MAX_FIRE_PROJECTILES) throw new Error("Fire projectile capacity changed during cast");
                const i = b.count++, angle = heading + (j - (values.targets - 1) / 2) * .15;
                b.x[i] = b.previousX[i] = sx; b.y[i] = b.previousY[i] = sy; b.z[i] = b.previousZ[i] = sz; b.kind[i] = Number(id === "pyroblast");
                this.shots.push({ ...cast, dx: Math.sin(angle) * speed, dy: slope * speed, dz: Math.cos(angle) * speed,
                    remaining: ticksForSeconds(values.fire!.range / 14), volley });
            }
            return;
        }
        if (id === "doom") {
            e.effects.add(EffectKind.Doom, tick, x, z, values.radius, 1.4, x, z, source);
            this.area(cast, x, z, random); return;
        }
        const delay = id === "meteor" ? SKILL_RULES.meteor.delay : values.fire!.interval;
        const duration = id === "meteor" ? delay : values.duration;
        if (id === "fireray") { x = e.position.x[e.player]; z = e.position.z[e.player]; }
        const effect = id === "meteor" ? EffectKind.Meteor : id === "fireray" ? EffectKind.FireRay : id === "firewall" ? EffectKind.FireWall : EffectKind.FireDomain;
        const length = id === "fireray" ? values.fire!.range : 1;
        const y = e.terrain.height(x, z) + .7;
        const hit = id === "fireray" ? e.terrain.traceAttack(x, y, z, x + Math.sin(heading) * length, y, z + Math.cos(heading) * length, values.radius) : Infinity;
        const visibleLength = length * Math.min(1, hit);
        this.fields.set(id, { ...cast, x, z, heading, length: visibleLength, endsAt: tick + ticksForSeconds(duration), nextAt: tick + ticksForSeconds(delay) });
        e.effects.add(effect, tick, x, z, values.radius, duration, x + Math.sin(heading) * visibleLength, z + Math.cos(heading) * visibleLength, source);
    }

    public advance(tick: number, random: DeterministicRandom, settle: () => void): void {
        const e = this.e, b = this.projectiles, p = e.position;
        for (let i = b.count - 1; i >= 0; i--) {
            const cast = this.shots[i], sx = b.x[i], sy = b.y[i], sz = b.z[i];
            const ex = sx + cast.dx, ey = sy + cast.dy, ez = sz + cast.dz;
            b.previousX[i] = sx; b.previousY[i] = sy; b.previousZ[i] = sz;
            let contact = e.terrain.traceAttack(sx, sy, sz, ex, ey, ez, .14), target = -1;
            const nearby = e.queryNearby(Component.Enemy, (sx + ex) / 2, (sz + ez) / 2, Math.hypot(cast.dx, cast.dz) / 2 + .14, true);
            for (let j = 0; j < nearby.count; j++) {
                const slot = nearby.slots[j], bottom = e.terrain.height(p.x[slot], p.z[slot]);
                const hit = segmentCylinderHit(sx, sy, sz, ex, ey, ez, p.x[slot], p.z[slot], bottom - .14, bottom + e.bodyHeight(slot) + .14, p.radius[slot] + .14);
                if (hit < contact || hit === contact && target >= 0 && e.world.ids[slot] < e.world.ids[target]) { contact = hit; target = slot; }
            }
            const travel = Math.min(1, contact);
            b.x[i] = sx + cast.dx * travel; b.y[i] = sy + cast.dy * travel; b.z[i] = sz + cast.dz * travel;
            if (contact !== Infinity || --cast.remaining <= 0) {
                // Offset a terrain contact toward the incident side so the wall cannot hide the near-side splash.
                const fraction = contact !== Infinity && target < 0 ? Math.max(0, contact - .001) : travel;
                const x = sx + cast.dx * fraction, z = sz + cast.dz * fraction;
                e.effects.add(EffectKind.FireImpact, tick, x, z, cast.values.radius, .8, x, z, cast.source);
                this.area(cast, x, z, random, undefined, cast.volley, b.y[i]);
                this.removeShot(i); settle();
            }
        }
        for (const [id, cast] of this.fields) {
            if (tick > cast.endsAt) { this.fields.delete(id); continue; }
            if (tick < cast.nextAt) continue;
            this.area(cast, cast.x, cast.z, random, id);
            if (id === "meteor") e.effects.add(EffectKind.MeteorImpact, tick, cast.x, cast.z, cast.values.radius, .85, cast.x, cast.z, cast.source);
            if (id === "meteor" || cast.nextAt + ticksForSeconds(cast.values.fire!.interval) > cast.endsAt) this.fields.delete(id);
            else cast.nextAt += ticksForSeconds(cast.values.fire!.interval);
            settle();
        }
    }

    private area(cast: FireCast, x: number, z: number, random: DeterministicRandom, shape?: SkillId, volley?: Map<number, number>, height?: number): void {
        const e = this.e, p = e.position, values = cast.values, ray = shape === "fireray", wall = shape === "firewall";
        const heading = ray || wall ? (cast as FireField).heading : 0, sin = Math.sin(heading), cos = Math.cos(heading);
        const length = ray ? (cast as FireField).length : values.radius, width = ray ? values.radius : .65;
        const centerX = ray ? x + sin * length / 2 : x, centerZ = ray ? z + cos * length / 2 : z;
        const radius = ray ? length / 2 + width : wall ? Math.hypot(length, width) : values.radius;
        const nearby = e.queryNearby(Component.Enemy, centerX, centerZ, radius, true, true), y = height ?? e.terrain.height(x, z) + .7;
        for (let cursor = 0; cursor < nearby.count; cursor++) {
            const slot = nearby.slots[cursor], target = e.world.ids[slot];
            if (volley && (volley.get(target) ?? 0) >= 2) continue;
            if (ray || wall) {
                const dx = p.x[slot] - x, dz = p.z[slot] - z, along = dx * sin + dz * cos, across = dx * cos - dz * sin;
                if (ray ? along < -p.radius[slot] || along > length + p.radius[slot] || Math.abs(across) > width + p.radius[slot]
                    : Math.abs(across) > length + p.radius[slot] || Math.abs(along) > width + p.radius[slot]) continue;
                if (ray) {
                    const bottom = e.terrain.height(p.x[slot], p.z[slot]);
                    if (segmentCylinderHit(x, y, z, x + sin * length, y, z + cos * length,
                        p.x[slot], p.z[slot], bottom - width, bottom + e.bodyHeight(slot) + width, p.radius[slot] + width) === Infinity) continue;
                }
            }
            if (e.terrain.traceAttack(x, y, z, p.x[slot], e.aimHeight(slot), p.z[slot], 0) !== Infinity) continue;
            const hit = rollAttack(cast.stats, random, values.damage);
            e.impacts.fire(cast.source, target, hit.damage, hit.critical, cast.stats, values.fire!, volley);
        }
    }
    private removeShot(i: number): void {
        const b = this.projectiles, last = --b.count;
        this.shots[i] = this.shots[last]; this.shots.pop();
        for (const key of ["x", "y", "z", "previousX", "previousY", "previousZ", "kind"] as const) b[key][i] = b[key][last];
    }
}
