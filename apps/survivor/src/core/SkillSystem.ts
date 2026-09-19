import { StatusKind, type SavedStatus } from "./StatusSystem";
import { SkillBuild, SKILL_NODES, nodeIndex } from "./SkillBuild";
import { FrostCasting } from "./FrostCasting";
import { CombatWorld, Component } from "./CombatWorld";
import { EffectKind } from "./CombatEffects";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";
import { DEFAULT_LOADOUT, SKILLS, SKILL_IDS, SKILL_RULES, chainTargets, skillIndex, skillValues, isFrostSkill, isUltimate, mobileCast, SKILL_TIMINGS, type SkillValues, type SkillId, type SkillSnapshot } from "./Skills";

/** Player skill state lives with the authority; UI and effects never decide hits. */
export interface SkillCheckpoint { readonly points: number; readonly loadout: readonly (SkillId | null)[]; readonly ranks: readonly number[]; readonly revision: number; readonly statuses: readonly SavedStatus[]; readonly recoveryUntil: number; readonly readyAt: readonly number[];
    readonly dashUntil: number; readonly dashX: number; readonly dashZ: number }
interface PendingCast { readonly id: SkillId; readonly stats: DerivedStats; readonly values: SkillValues; readonly started: number; readonly releaseAt: number; readonly endsAt: number; readonly targetX: number; readonly targetZ: number; readonly heading: number; released: boolean }
type OngoingId = "meteor" | "vortex" | "blades";
interface OngoingSkill {
    readonly stats: DerivedStats; readonly damage: number; readonly radius: number;
    readonly x: number; readonly z: number; readonly endsAt: number; nextAt: number;
}
export class SkillSystem {
    private readonly build = new SkillBuild();
    private readonly frost: FrostCasting;
    private pending: PendingCast | undefined;
    private recoveryUntil = 0;
    public get points(): number { return this.build.points; }
    public set points(value: number) { this.build.points = value; }
    public readonly loadout = [...DEFAULT_LOADOUT];
    private readonly readyAt = new Float64Array(SKILL_IDS.length);
    private readonly chainSlots = new Int32Array(chainTargets(SKILL_NODES[nodeIndex("chain")].maximum));
    private dashUntil = 0;
    private dashX = 0;
    private dashZ = 0;
    // One live cast per ongoing skill, independent of the lossy presentation buffer.
    private readonly ongoing = new Map<OngoingId, OngoingSkill>();
    constructor(private readonly entities: CombatWorld) { this.frost = new FrostCasting(entities); }
    public get ward(): number { return this.entities.status.amount(StatusKind.Barrier, this.entities.player, 0); }
    private get wardUntil(): number { return this.entities.status.deadline(StatusKind.Barrier, this.entities.player); }
    public checkpoint(tick = 0): SkillCheckpoint { return { points: this.points, loadout: [...this.loadout], ranks: this.build.snapshot().ranks,
        revision: this.build.revision, statuses: this.entities.status.save(this.entities.player, tick), recoveryUntil: Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0),
        readyAt: Array.from(this.readyAt), dashUntil: this.dashUntil, dashX: this.dashX, dashZ: this.dashZ }; }
    public restore(state: SkillCheckpoint, tick: number): void {
        this.ongoing.clear(); this.frost.clear(); this.pending = undefined; this.recoveryUntil = state.recoveryUntil;
        this.entities.effects.cancelSource(this.entities.world.ids[this.entities.player]);
        this.loadout.splice(0, this.loadout.length, ...state.loadout); this.readyAt.set(state.readyAt);
        this.build.restore(state.ranks, state.points, state.revision);
        this.entities.status.restore(this.entities.player, state.statuses, tick);
        this.entities.status.durationScale[this.entities.player] = 1 - .04 * this.build.rank("frost.resilience");
        this.dashUntil = state.dashUntil; this.dashX = state.dashX; this.dashZ = state.dashZ;
    }
    public snapshot(tick: number): SkillSnapshot {
        const pending = this.pending, winding = pending && tick < pending.releaseAt;
        return Object.freeze({ points: this.points, refundBlocked: this.busy(tick) || this.ongoing.size > 0 || this.frost.ongoing, loadout: Object.freeze([...this.loadout]), build: this.build.snapshot(), modifiers: this.build.modifiers,
            ranks: Object.freeze(Object.fromEntries(SKILL_IDS.map(id => [id, this.build.rank(id)])) as Record<SkillId, number>),
            remaining: Object.freeze(Object.fromEntries(SKILL_IDS.map((id, i) => [id, Math.max(0, this.readyAt[i] - tick) / GAME_CONFIG.timing.simulationHz])) as Record<SkillId, number>),
            ward: this.ward, wardRemaining: Math.max(0, this.wardUntil - tick) / GAME_CONFIG.timing.simulationHz, dashing: this.dashing(tick),
            recoveryRemaining: Math.max(0, Math.max(this.recoveryUntil, pending?.endsAt ?? 0) - tick) / GAME_CONFIG.timing.simulationHz,
            action: pending ? { skill: pending.id, phase: winding ? "windup" as const : "recovery" as const, remaining: Math.max(0, (winding ? pending.releaseAt : pending.endsAt) - tick) / GAME_CONFIG.timing.simulationHz,
                duration: ((winding ? pending.releaseAt - pending.started : pending.endsAt - pending.releaseAt)) / GAME_CONFIG.timing.simulationHz } : null,
            statuses: this.entities.status.snapshot(this.entities.player, tick) });
    }
    public equip(id: SkillId, slot: number, level: number): boolean {
        skillIndex(id);
        if (!Number.isInteger(slot) || slot < 0 || slot >= GAME_CONFIG.skills.slots || level < SKILLS[id].unlock || this.build.rank(id) === 0) return false;
        const previous = this.loadout.indexOf(id);
        if (isUltimate(id) && this.loadout.some((other, index) => other && isUltimate(other) && other !== id && index !== slot)) return false;
        if (previous >= 0) this.loadout[previous] = this.loadout[slot];
        this.loadout[slot] = id; return true;
    }
    public commitBuild(ranks: readonly number[], revision: number, level: number, homestead: boolean, tick: number): string | null {
        const reason = this.build.commit(ranks, revision, level, homestead && !this.busy(tick) && !this.ongoing.size && !this.frost.ongoing);
        if (reason) return reason;
        for (let slot = 0; slot < this.loadout.length; slot++) {
            const id = this.loadout[slot]; if (id && this.build.rank(id) === 0) this.loadout[slot] = null;
        }
        this.entities.status.durationScale[this.entities.player] = 1 - .04 * this.build.rank("frost.resilience");
        return null;
    }
    public busy(tick: number): boolean { return tick < Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0) || this.dashing(tick); }
    public winding(tick: number): boolean { return !!this.pending && !this.pending.released && tick < this.pending.releaseAt; }
    public get mobile(): boolean { return !!this.pending && mobileCast(this.pending.id); }
    public advanceCasting(tick: number, random: DeterministicRandom, interrupt: boolean, settle: () => void): void {
        const cast = this.pending;
        if (!cast) return;
        if (!cast.released && (interrupt || this.entities.vitals.health[this.entities.player] <= 0 || !this.entities.status.canAct(this.entities.player, tick))) {
            this.pending = undefined; this.recoveryUntil = Math.max(this.recoveryUntil, tick + ticksForSeconds(.12)); return;
        }
        if (!cast.released && tick >= cast.releaseAt) { cast.released = true; this.release(cast, tick, random); settle(); }
        if (tick >= cast.endsAt) this.pending = undefined;
    }
    public dashing(tick: number): boolean { return tick < this.dashUntil; }
    public cancelTravel(): void { this.recoveryUntil = Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0); this.dashUntil = 0; this.dashX = this.dashZ = 0; this.pending = undefined; this.ongoing.clear(); this.frost.clear(); }
    public advance(tick: number): boolean {
        if (!this.dashing(tick)) return false;
        if (!this.entities.status.canMove(this.entities.player, tick)) { this.dashUntil = tick; return false; }
        if (!this.entities.moveActor(this.entities.player, this.dashX, this.dashZ, false)) this.dashUntil = tick;
        return true;
    }
    public advanceOngoing(tick: number, random: DeterministicRandom, settle: () => void): void {
        this.frost.advance(tick, random, settle);
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
    public castAutomatic(tick: number, stats: DerivedStats, level: number, random: DeterministicRandom, stationary: boolean): boolean {
        if (this.busy(tick)) return false;
        // Emergency protection, then stationary spells, then mobile fillers. Slot order breaks ties.
        for (let priority = 0; priority < 3; priority++) for (const id of this.loadout) {
            if (!id || (id === "ward" ? 0 : mobileCast(id) ? 2 : 1) !== priority || !stationary && !mobileCast(id)) continue;
            if (this.cast(id, tick, stats, level, random, true)) return true;
        }
        return false;
    }
    public cast(id: SkillId, tick: number, stats: DerivedStats, level: number, random: DeterministicRandom, automatic = false): boolean {
        const i = skillIndex(id), definition = SKILLS[id], { player, position: p, vitals: v, status } = this.entities;
        const values = skillValues(id, this.build.rank(id), stats, this.build.modifiers[id]);
        if (v.health[player] <= 0 || !this.loadout.includes(id) || !this.build.rank(id) || level < definition.unlock || tick < this.readyAt[i]
            || !status.canAct(player, tick) || this.dashing(tick) || this.busy(tick) && id !== "dash"
            || v.mana[player] < values.mana || automatic && !definition.automatic
            || this.ongoing.has(id as OngoingId) || this.frost.active(id)) return false;
        if (id === "ward" && (this.ward > 0 || automatic && v.health[player] / stats.maxHealth > SKILL_RULES.ward.automaticHealthRatio)) return false;
        const field = id === "meteor" || id === "vortex" || id === "icestorm" || id === "blizzard";
        const range = id === "vortex" ? SKILL_RULES.vortex.range : field ? 8 : id === "chain" ? SKILL_RULES.chain.firstRange : values.radius + (id === "blades" ? SKILL_RULES.blades.width : 0);
        const target = id === "dash" || id === "ward" ? -1 : this.nearest(p.x[player], p.z[player], range);
        if (automatic && id !== "ward") {
            const nearby = this.entities.queryNearby(Component.Enemy, p.x[player], p.z[player], range, true);
            let eligible = false;
            for (let cursor = 0; cursor < nearby.count; cursor++) {
                const slot = nearby.slots[cursor];
                if (id === "blades" && Math.hypot(p.x[slot] - p.x[player], p.z[slot] - p.z[player]) + p.radius[slot] < values.radius - SKILL_RULES.blades.width) continue;
                if (this.entities.canSee(player, slot)) { eligible = true; break; }
            }
            if (!eligible || (field || id === "chain" || id === "icebolt" || id === "icelance") && target < 0) return false;
        }
        const heading = target >= 0 ? Math.atan2(p.x[target] - p.x[player], p.z[target] - p.z[player]) : p.heading[player];
        const releaseAt = tick + ticksForSeconds(Math.max(id === "dash" ? 0 : .1, SKILL_TIMINGS[id][0] / (1 + stats.castSpeed)));
        const endsAt = Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0, releaseAt + ticksForSeconds(Math.max(.15, SKILL_TIMINGS[id][1] / (1 + stats.castSpeed))));
        this.pending = { id, stats: { ...stats }, values, started: tick, releaseAt, endsAt, released: false, heading,
            targetX: field ? target < 0 ? p.x[player] + Math.sin(heading) * 4 : p.x[target] : p.x[player],
            targetZ: field ? target < 0 ? p.z[player] + Math.cos(heading) * 4 : p.z[target] : p.z[player] };
        v.mana[player] -= values.mana; this.readyAt[i] = tick + ticksForSeconds(values.cooldown);
        if (releaseAt === tick) { this.pending.released = true; this.release(this.pending, tick, random); }
        return true;
    }
    private release(cast: PendingCast, tick: number, random: DeterministicRandom): void {
        const { id, stats, values } = cast;
        const { position: p, player, impacts, world, effects, status } = this.entities;
        const x = p.x[player], z = p.z[player];
        if (isFrostSkill(id)) { this.frost.release(id, tick, stats, values, cast.targetX, cast.targetZ, cast.heading, random); return; }
        if (id === "meteor" || id === "vortex" || id === "blades") {
            if (this.ongoing.has(id)) return;
            const duration = id === "meteor" ? SKILL_RULES.meteor.delay : SKILL_RULES[id].duration;
            const nextAt = tick + ticksForSeconds(id === "meteor" ? duration : SKILL_RULES[id].interval);
            // Manual ground casts land ahead when no enemy can be targeted; auto casts still require a target.
            const cx = cast.targetX, cz = cast.targetZ;
            this.ongoing.set(id, { stats: { ...stats }, damage: values.damage, radius: values.radius, x: cx, z: cz,
                endsAt: tick + ticksForSeconds(duration), nextAt });
            effects.add(id === "meteor" ? EffectKind.Meteor : id === "vortex" ? EffectKind.Vortex : EffectKind.Blades,
                tick, cx, cz, values.radius, duration, cx, cz, world.ids[player]);
        } else if (id === "ward") {
            if (status.amount(StatusKind.Barrier, player, tick) > 0) return;
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
                effects.add(EffectKind.Lightning, tick, x, z, .45, .55,
                    x + Math.sin(p.heading[player]) * SKILL_RULES.chain.firstRange,
                    z + Math.cos(p.heading[player]) * SKILL_RULES.chain.firstRange);
            }
        } else {
            const enemies = this.entities.queryNearby(Component.Enemy, x, z, values.radius, true, true);
            for (let cursor = 0; cursor < enemies.count; cursor++) {
                const slot = enemies.slots[cursor];
                if (!this.entities.canSee(player, slot)) continue;
                const shatter = id === "pulse" && status.slowUntil[slot] > tick;
                const hit = rollAttack(stats, random, values.damage * (shatter ? SKILL_RULES.pulse.chilledMultiplier : 1));
                impacts.add(world.ids[player], world.ids[slot], hit.damage, 0, 0, Number(hit.critical));
                if (shatter && hit.damage > 0) effects.add(EffectKind.Shatter, tick, p.x[slot], p.z[slot], p.radius[slot] + .6, .6);
            }
            effects.add(EffectKind.Pulse, tick, x, z, values.radius, 1);
        }
    }
}
