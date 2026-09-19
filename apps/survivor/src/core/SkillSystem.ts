import { StatusKind } from "./StatusSystem";
import { CombatWorld, Component } from "./CombatWorld";
import { EffectKind } from "./CombatEffects";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";
import { DEFAULT_LOADOUT, SKILLS, SKILL_IDS, SKILL_RULES, chainTargets, skillIndex, skillValues, type SkillId, type SkillSnapshot } from "./Skills";

/** Player skill state lives with the authority; UI and effects never decide hits. */
export interface SkillCheckpoint { readonly points: number; readonly loadout: readonly SkillId[]; readonly ranks: readonly number[]; readonly readyAt: readonly number[];
    readonly ward: number; readonly wardUntil: number; readonly dashUntil: number; readonly dashX: number; readonly dashZ: number }
type OngoingId = "meteor" | "vortex" | "blades";
interface OngoingSkill {
    readonly stats: DerivedStats; readonly damage: number; readonly radius: number;
    readonly x: number; readonly z: number; readonly endsAt: number; nextAt: number;
}
export class SkillSystem {
    public points = 0;
    public readonly loadout = [...DEFAULT_LOADOUT];
    private readonly ranks = new Uint8Array(SKILL_IDS.length).fill(1);
    private readonly readyAt = new Float64Array(SKILL_IDS.length);
    private readonly chainSlots = new Int32Array(chainTargets(GAME_CONFIG.skills.maxRank));
    private dashUntil = 0;
    private dashX = 0;
    private dashZ = 0;
    // One live cast per ongoing skill, independent of the lossy presentation buffer.
    private readonly ongoing = new Map<OngoingId, OngoingSkill>();
    constructor(private readonly entities: CombatWorld) {}
    public get ward(): number { return this.entities.status.amount(StatusKind.Barrier, this.entities.player, 0); }
    private get wardUntil(): number { return this.entities.status.deadline(StatusKind.Barrier, this.entities.player); }
    public checkpoint(): SkillCheckpoint { return { points: this.points, loadout: [...this.loadout], ranks: Array.from(this.ranks), readyAt: Array.from(this.readyAt),
        ward: this.ward, wardUntil: this.wardUntil, dashUntil: this.dashUntil, dashX: this.dashX, dashZ: this.dashZ }; }
    public restore(state: SkillCheckpoint, tick: number): void {
        this.ongoing.clear();
        this.entities.effects.cancelSource(this.entities.world.ids[this.entities.player]);
        this.points = state.points; this.loadout.splice(0, this.loadout.length, ...state.loadout); this.ranks.set(state.ranks); this.readyAt.set(state.readyAt);
        const { status, world, player } = this.entities;
        status.clear(player);
        if (state.ward > 0 && state.wardUntil > tick) status.apply(StatusKind.Barrier, world.ids[player], world.ids[player], state.ward, state.wardUntil, tick);
        this.dashUntil = state.dashUntil; this.dashX = state.dashX; this.dashZ = state.dashZ;
    }

    public snapshot(tick: number): SkillSnapshot {
        return Object.freeze({ points: this.points, loadout: Object.freeze([...this.loadout]),
            ranks: Object.freeze(Object.fromEntries(SKILL_IDS.map((id, i) => [id, this.ranks[i]])) as Record<SkillId, number>),
            remaining: Object.freeze(Object.fromEntries(SKILL_IDS.map((id, i) => [id, Math.max(0, this.readyAt[i] - tick) / GAME_CONFIG.timing.simulationHz])) as Record<SkillId, number>),
            ward: this.ward, wardRemaining: Math.max(0, this.wardUntil - tick) / GAME_CONFIG.timing.simulationHz, dashing: this.dashing(tick) });
    }
    public equip(id: SkillId, slot: number, level: number): boolean {
        skillIndex(id);
        if (!Number.isInteger(slot) || slot < 0 || slot >= GAME_CONFIG.skills.slots || level < SKILLS[id].unlock) return false;
        const previous = this.loadout.indexOf(id);
        if (previous >= 0) this.loadout[previous] = this.loadout[slot];
        this.loadout[slot] = id;
        return true;
    }
    public upgrade(id: SkillId, level: number): boolean {
        const i = skillIndex(id);
        if (this.points < 1 || this.ranks[i] >= GAME_CONFIG.skills.maxRank || level < SKILLS[id].unlock + this.ranks[i]) return false;
        this.points--; this.ranks[i]++;
        return true;
    }
    public dashing(tick: number): boolean { return tick < this.dashUntil; }
    public cancelTravel(): void { this.dashUntil = 0; this.dashX = this.dashZ = 0; }
    public advance(tick: number): boolean {
        if (!this.dashing(tick)) return false;
        if (!this.entities.moveActor(this.entities.player, this.dashX, this.dashZ, false)) this.dashUntil = tick;
        return true;
    }
    public advanceOngoing(tick: number, random: DeterministicRandom, settle: () => void): void {
        const { position: p, player, world, impacts, effects, enemy: e, terrain } = this.entities;
        for (const [id, cast] of this.ongoing) {
            if (tick > cast.endsAt) { this.ongoing.delete(id); continue; }
            if (tick < cast.nextAt) continue;
            const x = id === "blades" ? p.x[player] : cast.x, z = id === "blades" ? p.z[player] : cast.z;
            const centerY = terrain.height(x, z) + .7;
            const enemies = this.entities.queryNearby(Component.Enemy, x, z,
                cast.radius + (id === "blades" ? SKILL_RULES.blades.width : 0), true, true);
            for (let cursor = 0; cursor < enemies.count; cursor++) {
                const slot = enemies.slots[cursor], distance = Math.hypot(p.x[slot] - x, p.z[slot] - z);
                if (id === "blades" && distance + p.radius[slot] < cast.radius - SKILL_RULES.blades.width) continue;
                // Every pulse rechecks cover from the actual field centre, not the moving caster.
                if (terrain.traceAttack(x, centerY, z, p.x[slot], this.entities.aimHeight(slot), p.z[slot], 0) !== Infinity) continue;
                const hit = rollAttack(cast.stats, random, cast.damage);
                impacts.add(world.ids[player], world.ids[slot], hit.damage, 0, 0, Number(hit.critical));
                if (id === "vortex" && distance > .05) {
                    const travel = Math.min(distance, SKILL_RULES.vortex.pull * (e.boss[slot] ? SKILL_RULES.vortex.bossPullScale : 1));
                    this.entities.moveActor(slot, (x - p.x[slot]) / distance * travel, (z - p.z[slot]) / distance * travel, false);
                    this.entities.updateSpatial(slot, Component.Enemy);
                }
            }
            if (id === "meteor") {
                effects.add(EffectKind.MeteorImpact, tick, x, z, cast.radius, .85, x, z, world.ids[player]);
                this.ongoing.delete(id);
            } else if (tick === cast.endsAt) this.ongoing.delete(id);
            else cast.nextAt += ticksForSeconds(SKILL_RULES[id].interval);
            // Each cast can fill the hit buffer; settle before the next spatial query.
            settle();
        }
    }

    private nearest(x: number, z: number, range: number): number {
        const { position: p, world, player } = this.entities;
        const enemies = this.entities.queryNearby(Component.Enemy, x, z, range);
        let target = -1, nearest = range * range;
        for (let cursor = 0; cursor < enemies.count; cursor++) {
            const slot = enemies.slots[cursor], distance = (p.x[slot] - x) ** 2 + (p.z[slot] - z) ** 2;
            if ((distance < nearest || distance === nearest && (target < 0 || world.ids[slot] < world.ids[target])) && this.entities.canSee(player, slot)) {
                nearest = distance; target = slot;
            }
        }
        return target;
    }
    public cast(id: SkillId, tick: number, stats: DerivedStats, level: number, random: DeterministicRandom, automatic = false): boolean {
        const i = skillIndex(id), definition = SKILLS[id];
        const { position: p, vitals: v, player, impacts, world, effects, status } = this.entities;
        if (!this.loadout.includes(id) || level < definition.unlock || tick < this.readyAt[i] || this.dashing(tick)
            || v.mana[player] < definition.mana || automatic && !definition.automatic) return false;
        const values = skillValues(id, this.ranks[i], stats), x = p.x[player], z = p.z[player];
        if (id === "meteor" || id === "vortex" || id === "blades") {
            if (this.ongoing.has(id)) return false;
            const target = id === "blades" ? -1 : this.nearest(x, z, SKILL_RULES[id].range);
            if (id !== "blades" && target < 0 && automatic) return false;
            if (id === "blades" && automatic) {
                const enemies = this.entities.queryNearby(Component.Enemy, x, z, values.radius + SKILL_RULES.blades.width, true);
                let eligible = false;
                for (let cursor = 0; cursor < enemies.count; cursor++) {
                    const slot = enemies.slots[cursor];
                    if (Math.hypot(p.x[slot] - x, p.z[slot] - z) + p.radius[slot] >= values.radius - SKILL_RULES.blades.width
                        && this.entities.canSee(player, slot)) { eligible = true; break; }
                }
                if (!eligible) return false;
            }
            const duration = id === "meteor" ? SKILL_RULES.meteor.delay : SKILL_RULES[id].duration;
            const nextAt = tick + ticksForSeconds(id === "meteor" ? duration : SKILL_RULES[id].interval);
            // Manual ground casts land ahead when no enemy can be targeted; auto casts still require a target.
            const ahead = id === "blades" ? 0 : Math.min(4, SKILL_RULES[id].range);
            const cx = target < 0 ? x + Math.sin(p.heading[player]) * ahead : p.x[target];
            const cz = target < 0 ? z + Math.cos(p.heading[player]) * ahead : p.z[target];
            this.ongoing.set(id, { stats: { ...stats }, damage: values.damage, radius: values.radius, x: cx, z: cz,
                endsAt: tick + ticksForSeconds(duration), nextAt });
            effects.add(id === "meteor" ? EffectKind.Meteor : id === "vortex" ? EffectKind.Vortex : EffectKind.Blades,
                tick, cx, cz, values.radius, duration, cx, cz, world.ids[player]);
        } else if (id === "ward") {
            if (status.amount(StatusKind.Barrier, player, tick) > 0 || automatic && v.health[player] / stats.maxHealth > SKILL_RULES.ward.automaticHealthRatio) return false;
            status.apply(StatusKind.Barrier, world.ids[player], world.ids[player], values.ward, tick + ticksForSeconds(SKILL_RULES.ward.durationSeconds), tick);
            effects.add(EffectKind.Ward, tick, x, z, 1.2, .8);
        } else if (id === "dash") {
            const duration = ticksForSeconds(SKILL_RULES.dash.durationSeconds);
            // Commands apply between ticks: movement occurs on the next `duration` ticks.
            this.dashUntil = tick + duration + 1;
            this.dashX = Math.sin(p.heading[player]) * values.dashDistance / duration;
            this.dashZ = Math.cos(p.heading[player]) * values.dashDistance / duration;
            effects.add(EffectKind.Dash, tick, x, z, .5, .6, x + this.dashX * duration, z + this.dashZ * duration);
        } else if (id === "chain") {
            let fromX = x, fromZ = z, from = player, hits = 0;
            for (; hits < values.targets; hits++) {
                const range = hits === 0 ? SKILL_RULES.chain.firstRange : SKILL_RULES.chain.jumpRange;
                let nearest = range * range, target = -1;
                const enemies = this.entities.queryNearby(Component.Enemy, fromX, fromZ, range);
                for (let cursor = 0; cursor < enemies.count; cursor++) {
                    const slot = enemies.slots[cursor];
                    let visited = false;
                    for (let j = 0; j < hits; j++) if (this.chainSlots[j] === slot) visited = true;
                    if (visited) continue;
                    const distance = (p.x[slot] - fromX) ** 2 + (p.z[slot] - fromZ) ** 2;
                    if ((distance < nearest || distance === nearest && (target < 0 || world.ids[slot] < world.ids[target])) && this.entities.canSee(from, slot)) { nearest = distance; target = slot; }
                }
                if (target < 0) break;
                this.chainSlots[hits] = target;
                const hit = rollAttack(stats, random, values.damage * SKILL_RULES.chain.damageRetention ** hits);
                impacts.add(world.ids[player], world.ids[target], hit.damage, 0, 0, Number(hit.critical));
                effects.add(EffectKind.Lightning, tick, fromX, fromZ, .45, .55, p.x[target], p.z[target]);
                fromX = p.x[target]; fromZ = p.z[target]; from = target;
            }
            if (!hits) {
                if (automatic) return false;
                effects.add(EffectKind.Lightning, tick, x, z, .45, .55,
                    x + Math.sin(p.heading[player]) * SKILL_RULES.chain.firstRange,
                    z + Math.cos(p.heading[player]) * SKILL_RULES.chain.firstRange);
            }
        } else {
            let hits = 0;
            const enemies = this.entities.queryNearby(Component.Enemy, x, z, values.radius, true, true);
            for (let cursor = 0; cursor < enemies.count; cursor++) {
                const slot = enemies.slots[cursor];
                if (!this.entities.canSee(player, slot)) continue;
                const shatter = id === "pulse" && status.slowUntil[slot] > tick;
                const hit = rollAttack(stats, random, values.damage * (shatter ? SKILL_RULES.pulse.chilledMultiplier : 1));
                impacts.add(world.ids[player], world.ids[slot], hit.damage, 0, 0, Number(hit.critical));
                if (shatter && hit.damage > 0) effects.add(EffectKind.Shatter, tick, p.x[slot], p.z[slot], p.radius[slot] + .6, .6);
                if (id === "frost") status.apply(StatusKind.Slow, world.ids[player], world.ids[slot], 1 - SKILL_RULES.frost.slowScale, tick + ticksForSeconds(values.slowSeconds), tick);
                hits++;
            }
            if (!hits && automatic) return false;
            effects.add(id === "pulse" ? EffectKind.Pulse : EffectKind.Frost, tick, x, z, values.radius, 1);
        }
        v.mana[player] -= definition.mana;
        this.readyAt[i] = tick + ticksForSeconds(values.cooldown);
        return true;
    }
}
