import { StatusKind, type SavedStatus } from "./StatusSystem";
import type { PlayerFeedback } from "./PlayerFeedback";
import { SkillBuild, SKILL_NODES } from "./SkillBuild";
import { PASSIVE_UNLOCK_LEVELS, isPassiveId, passiveNodeId, compilePassiveEffects, NO_PASSIVE_EFFECTS, type PassiveId } from "./PassiveSkills";
import { FireCasting } from "./FireCasting";
import { LightningCasting } from "./LightningCasting";
import type { SavedBurn } from "./BurnSystem";
import { FrostCasting } from "./FrostCasting";
import { StarCasting } from "./StarCasting";
import { CombatWorld, Component } from "./CombatWorld";
import { EffectKind } from "./CombatEffects";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";
import { DEFAULT_LOADOUT, SKILLS, SKILL_IDS, SKILL_RULES, skillIndex, skillValues, isFireSkill, isFrostSkill, isLightningSkill, isStarSkill, isSupportSkill, isDamageSkill, isUltimate, mobileCast, SKILL_TIMINGS, type SkillValues, type SkillId, type SkillSnapshot } from "./Skills";

/** Player skill state lives with the authority; UI and effects never decide hits. */
export interface SkillCheckpoint { readonly points: number; readonly loadout: readonly (SkillId | null)[]; readonly passives: readonly (PassiveId | null)[]; readonly ranks: readonly number[]; readonly revision: number; readonly statuses: readonly SavedStatus[]; readonly burns: readonly SavedBurn[]; readonly recoveryUntil: number; readonly readyAt: readonly number[];
    readonly dashUntil: number; readonly dashX: number; readonly dashZ: number }
interface PendingCast { readonly id: SkillId; readonly stats: DerivedStats; readonly values: SkillValues; readonly started: number; readonly releaseAt: number; readonly endsAt: number; readonly channelUntil: number; readonly targetX: number; readonly targetZ: number; readonly heading: number; released: boolean }
type OngoingId = "vortex";
interface OngoingSkill {
    readonly stats: DerivedStats; readonly damage: number; readonly radius: number;
    readonly x: number; readonly z: number; readonly endsAt: number; nextAt: number;
}
export class SkillSystem {
    private readonly build = new SkillBuild();
    private readonly frost: FrostCasting;
    private readonly fire: FireCasting;
    private readonly lightning: LightningCasting;
    private readonly stars: StarCasting;
    private pending: PendingCast | undefined;
    private recoveryUntil = 0;
    public get points(): number { return this.build.points; }
    public set points(value: number) { this.build.points = value; }
    public readonly loadout = [...DEFAULT_LOADOUT];
    public readonly passives: (PassiveId | null)[] = PASSIVE_UNLOCK_LEVELS.map(() => null);
    public passiveEffects = NO_PASSIVE_EFFECTS;
    private readonly readyAt = new Float64Array(SKILL_IDS.length);
    private dashUntil = 0;
    private dashX = 0;
    private dashZ = 0;
    // One live cast per ongoing skill, independent of the lossy presentation buffer.
    private readonly ongoing = new Map<OngoingId, OngoingSkill>();
    constructor(private readonly entities: CombatWorld) { this.frost = new FrostCasting(entities); this.fire = new FireCasting(entities); this.lightning = new LightningCasting(entities); this.stars = new StarCasting(entities); }
    public get fireProjectiles() { return this.fire.projectiles; }
    public get ward(): number { return this.entities.status.amount(StatusKind.Barrier, this.entities.player, 0); }
    private get wardUntil(): number { return this.entities.status.deadline(StatusKind.Barrier, this.entities.player); }
    public checkpoint(tick = 0): SkillCheckpoint { return { points: this.points, loadout: [...this.loadout], passives: [...this.passives], ranks: this.build.snapshot().ranks,
        revision: this.build.revision, statuses: this.entities.status.save(this.entities.player, tick), burns: this.entities.status.burns.save(this.entities.player, tick), recoveryUntil: Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0),
        readyAt: Array.from(this.readyAt), dashUntil: this.dashUntil, dashX: this.dashX, dashZ: this.dashZ }; }
    public restore(state: SkillCheckpoint, tick: number): void {
        this.ongoing.clear(); this.frost.clear(); this.fire.clear(); this.lightning.clear(); this.stars.clear(); this.pending = undefined; this.recoveryUntil = state.recoveryUntil;
        this.entities.effects.cancelSource(this.entities.world.ids[this.entities.player]);
        this.loadout.splice(0, this.loadout.length, ...state.loadout); this.readyAt.set(state.readyAt);
        this.build.restore(state.ranks, state.points, state.revision);
        this.passives.splice(0, this.passives.length, ...state.passives); this.compilePassives();
        this.entities.status.restore(this.entities.player, state.statuses, tick);
        this.entities.status.burns.restore(this.entities.player, state.burns, tick);
        this.updateResilience();
        this.dashUntil = state.dashUntil; this.dashX = state.dashX; this.dashZ = state.dashZ;
    }
    public snapshot(tick: number): SkillSnapshot {
        const pending = this.pending, winding = pending && tick < pending.releaseAt, channeling = pending && !winding && tick < pending.channelUntil;
        return Object.freeze({ points: this.points, refundBlocked: this.busy(tick) || this.ongoing.size > 0 || this.frost.ongoing || this.fire.ongoing || this.lightning.ongoing || this.stars.ongoing, loadout: Object.freeze([...this.loadout]), build: this.build.snapshot(), modifiers: this.build.modifiers,
            passives: Object.freeze([...this.passives]), ranks: Object.freeze(Object.fromEntries(SKILL_IDS.map(id => [id, this.build.rank(id)])) as Record<SkillId, number>),
            remaining: Object.freeze(Object.fromEntries(SKILL_IDS.map((id, i) => [id, Math.max(0, this.readyAt[i] - tick) / GAME_CONFIG.timing.simulationHz])) as Record<SkillId, number>),
            ward: this.ward, wardRemaining: Math.max(0, this.wardUntil - tick) / GAME_CONFIG.timing.simulationHz, dashing: this.dashing(tick),
            recoveryRemaining: Math.max(0, Math.max(this.recoveryUntil, pending?.endsAt ?? 0) - tick) / GAME_CONFIG.timing.simulationHz,
            action: pending ? { skill: pending.id, phase: winding ? "windup" as const : channeling ? "channel" as const : "recovery" as const,
                remaining: Math.max(0, (winding ? pending.releaseAt : channeling ? pending.channelUntil : pending.endsAt) - tick) / GAME_CONFIG.timing.simulationHz,
                duration: (winding ? pending.releaseAt - pending.started : channeling ? pending.channelUntil - pending.releaseAt : pending.endsAt - pending.channelUntil) / GAME_CONFIG.timing.simulationHz } : null,
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
        const protection = this.build.rank("fire.resilience"), staticGuard = this.build.rank("lightning.resilience");
        const starRefund = SKILL_NODES.some((node, i) => node.school === "stars" && ranks[i] < this.build.rank(node.id));
        const reason = this.build.commit(ranks, revision, level, homestead && !this.busy(tick) && !this.ongoing.size && !this.frost.ongoing && !this.fire.ongoing && !this.lightning.ongoing && !this.stars.ongoing);
        if (reason) return reason;
        if (this.build.rank("fire.resilience") < protection) this.entities.status.removeProtection(this.entities.world.ids[this.entities.player], this.entities.player, tick);
        if (this.build.rank("lightning.resilience") < staticGuard) this.entities.status.removeStaticGuard(this.entities.player);
        if (starRefund) this.entities.status.clearStarBenefits(this.entities.player, tick);
        for (let slot = 0; slot < this.loadout.length; slot++) {
            const id = this.loadout[slot]; if (id && this.build.rank(id) === 0) this.loadout[slot] = null;
        }
        this.updateResilience();
        for (let slot = 0; slot < this.passives.length; slot++) {
            const id = this.passives[slot]; if (id && this.build.rank(passiveNodeId(id)) === 0) this.passives[slot] = null;
        }
        this.compilePassives();
        return null;
    }
    public equipPassive(id: PassiveId | null, slot: number, level: number): boolean {
        if (!Number.isInteger(slot) || slot < 0 || slot >= this.passives.length || level < PASSIVE_UNLOCK_LEVELS[slot]
            || id !== null && (!isPassiveId(id) || !this.build.rank(passiveNodeId(id)))) return false;
        const previous = id === null ? -1 : this.passives.indexOf(id);
        if (previous >= 0) this.passives[previous] = this.passives[slot];
        this.passives[slot] = id; this.compilePassives(); return true;
    }
    private compilePassives(): void { this.passiveEffects = compilePassiveEffects(this.passives, id => this.build.rank(id)); }
    private updateResilience(): void {
        this.entities.status.durationScale[this.entities.player] = 1 - .04 * this.build.rank("frost.resilience") - .03 * this.build.rank("stars.resilience");
    }
    public busy(tick: number): boolean { return tick < Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0) || this.dashing(tick); }
    public holding(tick: number): boolean { return !!this.pending && tick < Math.max(this.pending.releaseAt, this.pending.channelUntil); }
    public get mobile(): boolean { return !!this.pending && mobileCast(this.pending.id); }
    public writePresentation(output: PlayerFeedback, tick: number): void {
        const cast = this.pending;
        output.castPhase = 0; output.castProgress = 0; output.castLocksMovement = false;
        if (!cast || cast.id === "dash" || tick >= cast.endsAt) return;
        output.castHeading = cast.heading;
        output.castLocksMovement = this.holding(tick) && !this.mobile;
        const winding = tick < cast.releaseAt, channeling = !winding && tick < cast.channelUntil;
        output.castPhase = winding ? 1 : channeling ? 2 : 3;
        const start = winding ? cast.started : channeling ? cast.releaseAt : cast.channelUntil;
        const end = winding ? cast.releaseAt : channeling ? cast.channelUntil : cast.endsAt;
        output.castProgress = (tick - start) / Math.max(1, end - start);
    }
    public advanceCasting(tick: number, random: DeterministicRandom, interrupt: boolean, settle: () => void): void {
        const cast = this.pending;
        if (!cast) return;
        if ((!cast.released || tick < cast.channelUntil) && (interrupt || this.entities.vitals.health[this.entities.player] <= 0 || !this.entities.status.canAct(this.entities.player, tick))) {
            this.fire.interruptChannel(); this.pending = undefined; this.recoveryUntil = Math.max(this.recoveryUntil, tick + ticksForSeconds(.12)); return;
        }
        if (!cast.released && tick >= cast.releaseAt) { cast.released = true; this.release(cast, tick, random); settle(); }
        if (tick >= cast.endsAt) this.pending = undefined;
    }
    public dashing(tick: number): boolean { return tick < this.dashUntil; }
    public cancelTravel(): void { this.recoveryUntil = Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0); this.dashUntil = 0; this.dashX = this.dashZ = 0; this.pending = undefined; this.ongoing.clear(); this.frost.clear(); this.fire.clear(); this.lightning.clear(); this.stars.clear(); }
    public advance(tick: number): boolean {
        if (!this.dashing(tick)) return false;
        if (!this.entities.status.canMove(this.entities.player, tick)) { this.dashUntil = tick; return false; }
        if (!this.entities.moveActor(this.entities.player, this.dashX, this.dashZ, false)) this.dashUntil = tick;
        return true;
    }
    public advanceOngoing(tick: number, random: DeterministicRandom, settle: () => void): void {
        this.frost.advance(tick, random, settle); this.fire.advance(tick, random, settle); this.lightning.advance(tick, random, settle); this.stars.advance(tick, random, settle);
        const { position: p, player, world, impacts, enemy: e, terrain } = this.entities;
        for (const [id, cast] of this.ongoing) {
            if (tick > cast.endsAt) { this.ongoing.delete(id); continue; }
            if (tick < cast.nextAt) continue;
            const x = cast.x, z = cast.z;
            const centerY = terrain.height(x, z) + .7;
            const enemies = this.entities.queryNearby(Component.Enemy, x, z, cast.radius, true, true);
            for (let cursor = 0; cursor < enemies.count; cursor++) {
                const slot = enemies.slots[cursor], distance = Math.hypot(p.x[slot] - x, p.z[slot] - z);
                // Every pulse rechecks cover from the actual field centre, not the moving caster.
                if (terrain.traceAttack(x, centerY, z, p.x[slot], this.entities.aimHeight(slot), p.z[slot], 0) !== Infinity) continue;
                const hit = rollAttack(cast.stats, random, cast.damage);
                const impact = impacts.count;
                impacts.add(world.ids[player], world.ids[slot], hit.damage, 0, 0, Number(hit.critical)); impacts.castStats[impact] = cast.stats;
                if (distance > .05) {
                    const travel = Math.min(distance, SKILL_RULES.vortex.pull * (e.boss[slot] ? SKILL_RULES.vortex.bossPullScale : 1));
                    this.entities.moveActor(slot, (x - p.x[slot]) / distance * travel, (z - p.z[slot]) / distance * travel, false);
                    this.entities.updateSpatial(slot, Component.Enemy);
                }
            }
            if (tick === cast.endsAt) this.ongoing.delete(id);
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
        // Emergency defense, useful empowerment, stationary spells, then mobile fillers.
        for (let priority = 0; priority < 4; priority++) for (const id of this.loadout) {
            if (!id || (id === "ward" || id === "shelter" || id === "bastion" ? 0 : id === "infusion" || id === "resonance" ? 1 : mobileCast(id) ? 3 : 2) !== priority || !stationary && !mobileCast(id)) continue;
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
            || this.ongoing.has(id as OngoingId) || this.frost.active(id) || !this.fire.available(id, values) || this.lightning.active(id) || this.stars.active(id)) return false;
        if (id === "ward" && (this.ward > 0 || automatic && v.health[player] / stats.maxHealth > SKILL_RULES.ward.automaticHealthRatio)) return false;
        if (id === "bastion" && (this.ward >= values.ward || automatic && (this.ward > 0 || v.health[player] / stats.maxHealth > .65))) return false;
        if (id === "shelter" && automatic && !(values.star!.cleanse > 0 && status.hasCleansable(player, tick))
            && (v.health[player] / stats.maxHealth > .75 || status.protection(player, tick) >= values.star!.protection)) return false;
        if (id === "infusion" || id === "resonance") {
            const charges = Math.min(8, values.star!.charges + (id === "infusion" ? status.amount(StatusKind.StarEnergy, player, tick) : 0));
            if (!status.canEmpower(player, values.star!.empowerment, charges, tick + ticksForSeconds(values.duration), tick)
                || automatic && (status.amount(StatusKind.Empowered, player, tick) > 0 || !this.canUseEmpowerment(tick, stats, level, values.mana))) return false;
        }
        const field = id === "meteor" || id === "vortex" || id === "icestorm" || id === "blizzard" || id === "firewall" || id === "firedomain" || id === "thunderstrike" || id === "thunderfield" || id === "judgment";
        const range = values.lightning ? values.lightning.range : isFireSkill(id) && id !== "doom" ? values.fire!.range : id === "vortex" ? SKILL_RULES.vortex.range : field ? 8 : values.radius + (id === "blades" ? SKILL_RULES.blades.width : 0);
        const target = id === "dash" || isSupportSkill(id) ? -1 : this.nearest(p.x[player], p.z[player], range);
        if (automatic && !isSupportSkill(id)) {
            const nearby = this.entities.queryNearby(Component.Enemy, p.x[player], p.z[player], range, true);
            let eligible = false;
            for (let cursor = 0; cursor < nearby.count; cursor++) {
                const slot = nearby.slots[cursor];
                if (id === "blades" && Math.hypot(p.x[slot] - p.x[player], p.z[slot] - p.z[player]) + p.radius[slot] < values.radius - SKILL_RULES.blades.width) continue;
                if (this.entities.canSee(player, slot)) { eligible = true; break; }
            }
            if (!eligible || (field || isLightningSkill(id) || id === "icebolt" || id === "icelance" || isFireSkill(id) && id !== "doom") && target < 0) return false;
        }
        const heading = target >= 0 ? Math.atan2(p.x[target] - p.x[player], p.z[target] - p.z[player]) : p.heading[player];
        const releaseAt = tick + ticksForSeconds(Math.max(id === "dash" ? 0 : .1, SKILL_TIMINGS[id][0] / (1 + stats.castSpeed)));
        const channelUntil = releaseAt + (id === "fireray" ? ticksForSeconds(values.duration) : 0);
        const endsAt = Math.max(this.recoveryUntil, this.pending?.endsAt ?? 0, channelUntil + ticksForSeconds(Math.max(.15, SKILL_TIMINGS[id][1] / (1 + stats.castSpeed))));
        if (id === "dash") this.fire.interruptChannel();
        const amplification = isDamageSkill(id) ? status.consumeEmpowerment(player, tick) : 0;
        this.pending = { id, stats: { ...stats, damageIncrease: (1 + stats.damageIncrease) * (1 + amplification) - 1 }, values, started: tick, releaseAt, channelUntil, endsAt, released: false, heading,
            targetX: field || isFireSkill(id) && id !== "doom" ? target < 0 ? p.x[player] + Math.sin(heading) * 4 : p.x[target] : p.x[player],
            targetZ: field || isFireSkill(id) && id !== "doom" ? target < 0 ? p.z[player] + Math.cos(heading) * 4 : p.z[target] : p.z[player] };
        v.mana[player] -= values.mana; this.readyAt[i] = tick + ticksForSeconds(values.cooldown);
        if (releaseAt === tick) { this.pending.released = true; this.release(this.pending, tick, random); }
        return true;
    }
    private canUseEmpowerment(tick: number, stats: DerivedStats, level: number, mana: number): boolean {
        const e = this.entities;
        for (const id of this.loadout) {
            if (!id || !isDamageSkill(id) || level < SKILLS[id].unlock || tick < this.readyAt[skillIndex(id)] || this.ongoing.has(id as OngoingId)
                || this.frost.active(id) || this.lightning.active(id) || this.stars.active(id)) continue;
            const values = skillValues(id, this.build.rank(id), stats, this.build.modifiers[id]);
            if (e.vitals.mana[e.player] < mana + values.mana || !this.fire.available(id, values)) continue;
            const range = values.lightning?.range ?? values.fire?.range ?? (id === "vortex" ? SKILL_RULES.vortex.range : id === "icestorm" || id === "blizzard" ? 8 : values.radius);
            if (this.nearest(e.position.x[e.player], e.position.z[e.player], range) >= 0) return true;
        }
        return false;
    }
    private release(cast: PendingCast, tick: number, random: DeterministicRandom): void {
        this.entities.feedback.castTick = tick;
        const { id, stats, values } = cast;
        const { position: p, player, impacts, world, effects, status } = this.entities;
        const x = p.x[player], z = p.z[player];
        if (isFrostSkill(id)) { this.frost.release(id, tick, stats, values, cast.targetX, cast.targetZ, cast.heading, random); return; }
        if (isFireSkill(id)) { this.fire.release(id, tick, stats, values, cast.targetX, cast.targetZ, cast.heading, random); return; }
        if (isLightningSkill(id)) { this.lightning.release(id, tick, stats, values, cast.targetX, cast.targetZ, cast.heading, random); return; }
        if (isStarSkill(id)) { this.stars.release(id, tick, stats, values, cast.heading, random); return; }
        if (id === "vortex") {
            if (this.ongoing.has(id)) return;
            const duration = SKILL_RULES[id].duration;
            const nextAt = tick + ticksForSeconds(SKILL_RULES[id].interval);
            // Manual ground casts land ahead when no enemy can be targeted; auto casts still require a target.
            const cx = cast.targetX, cz = cast.targetZ;
            this.ongoing.set(id, { stats: { ...stats }, damage: values.damage, radius: values.radius, x: cx, z: cz,
                endsAt: tick + ticksForSeconds(duration), nextAt });
            effects.add(EffectKind.Vortex,
                tick, cx, cz, values.radius, duration, cx, cz, world.ids[player]);
        } else if (id === "dash") {
            const duration = ticksForSeconds(SKILL_RULES.dash.durationSeconds);
            // Commands apply between ticks: movement occurs on the next `duration` ticks.
            this.dashUntil = tick + duration + 1;
            this.dashX = Math.sin(p.heading[player]) * values.dashDistance / duration;
            this.dashZ = Math.cos(p.heading[player]) * values.dashDistance / duration;
            effects.add(EffectKind.Dash, tick, x, z, .5, .6, x + this.dashX * duration, z + this.dashZ * duration);
        } else {
            const enemies = this.entities.queryNearby(Component.Enemy, x, z, values.radius, true, true);
            for (let cursor = 0; cursor < enemies.count; cursor++) {
                const slot = enemies.slots[cursor];
                if (!this.entities.canSee(player, slot)) continue;
                const shatter = id === "pulse" && status.slowUntil[slot] > tick;
                const hit = rollAttack(stats, random, values.damage * (shatter ? SKILL_RULES.pulse.chilledMultiplier : 1));
                const impact = impacts.count;
                impacts.add(world.ids[player], world.ids[slot], hit.damage, 0, 0, Number(hit.critical)); impacts.castStats[impact] = stats;
                if (shatter && hit.damage > 0) effects.add(EffectKind.Shatter, tick, p.x[slot], p.z[slot], p.radius[slot] + .6, .6);
            }
            effects.add(EffectKind.Pulse, tick, x, z, values.radius, 1);
        }
    }
}
