import { CombatWorld, Component } from "./CombatWorld";
import { EffectKind } from "./CombatEffects";
import { rollAttack, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";
import { DEFAULT_LOADOUT, SKILLS, SKILL_IDS, skillIndex, skillValues, type SkillId, type SkillSnapshot } from "./Skills";

/** Player skill state lives with the authority; UI and effects never decide hits. */
export class SkillSystem {
    public points = 0;
    public readonly loadout = [...DEFAULT_LOADOUT];
    private readonly ranks = new Uint8Array(SKILL_IDS.length).fill(1);
    private readonly readyAt = new Float64Array(SKILL_IDS.length);
    private readonly chainSlots = new Int32Array(3 + Math.floor(GAME_CONFIG.skills.maxRank / 2));
    private wardValue = 0;
    private wardUntil = 0;
    private dashUntil = 0;
    private dashX = 0;
    private dashZ = 0;
    constructor(private readonly entities: CombatWorld) {}
    public get ward(): number { return this.wardValue; }

    public snapshot(tick: number): SkillSnapshot {
        return Object.freeze({ points: this.points, loadout: Object.freeze([...this.loadout]),
            ranks: Object.freeze(Object.fromEntries(SKILL_IDS.map((id, i) => [id, this.ranks[i]])) as Record<SkillId, number>),
            remaining: Object.freeze(Object.fromEntries(SKILL_IDS.map((id, i) => [id, Math.max(0, this.readyAt[i] - tick) / GAME_CONFIG.timing.simulationHz])) as Record<SkillId, number>),
            ward: this.wardValue, wardRemaining: Math.max(0, this.wardUntil - tick) / GAME_CONFIG.timing.simulationHz, dashing: this.dashing(tick) });
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
    public advance(tick: number): boolean {
        if (tick >= this.wardUntil) this.wardValue = 0;
        if (!this.dashing(tick)) return false;
        const { position: p, player } = this.entities;
        p.x[player] += this.dashX; p.z[player] += this.dashZ;
        return true;
    }
    public absorb(damage: number): number {
        const absorbed = Math.min(this.wardValue, damage);
        this.wardValue -= absorbed;
        return damage - absorbed;
    }

    public cast(id: SkillId, tick: number, stats: DerivedStats, level: number, random: DeterministicRandom, automatic = false): boolean {
        const i = skillIndex(id), definition = SKILLS[id];
        const { position: p, vitals: v, player, impacts, world, effects, status } = this.entities;
        if (!this.loadout.includes(id) || level < definition.unlock || tick < this.readyAt[i] || this.dashing(tick)
            || v.mana[player] < definition.mana || automatic && !definition.automatic) return false;
        const values = skillValues(id, this.ranks[i], stats), x = p.x[player], z = p.z[player];
        if (id === "ward") {
            if (this.wardValue > 0 || automatic && v.health[player] / stats.maxHealth > .6) return false;
            this.wardValue = values.ward; this.wardUntil = tick + ticksForSeconds(6);
            effects.add(EffectKind.Ward, tick, x, z, 1.2, .8);
        } else if (id === "dash") {
            const duration = ticksForSeconds(.25);
            // Commands apply between ticks: movement occurs on the next `duration` ticks.
            this.dashUntil = tick + duration + 1;
            this.dashX = Math.sin(p.heading[player]) * values.dashDistance / duration;
            this.dashZ = Math.cos(p.heading[player]) * values.dashDistance / duration;
            effects.add(EffectKind.Dash, tick, x, z, .5, .6, x + this.dashX * duration, z + this.dashZ * duration);
        } else if (id === "chain") {
            let fromX = x, fromZ = z, hits = 0;
            for (; hits < values.targets; hits++) {
                let nearest = hits === 0 ? 7 * 7 : 4 * 4, target = -1;
                const enemies = this.entities.queryNearby(Component.Enemy, fromX, fromZ, Math.sqrt(nearest));
                for (let cursor = 0; cursor < enemies.count; cursor++) {
                    const slot = enemies.slots[cursor];
                    let visited = false;
                    for (let j = 0; j < hits; j++) if (this.chainSlots[j] === slot) visited = true;
                    if (visited) continue;
                    const distance = (p.x[slot] - fromX) ** 2 + (p.z[slot] - fromZ) ** 2;
                    if (distance < nearest || distance === nearest && (target < 0 || world.ids[slot] < world.ids[target])) { nearest = distance; target = slot; }
                }
                if (target < 0) break;
                this.chainSlots[hits] = target;
                impacts.add(world.ids[player], world.ids[target], rollAttack(stats, random, values.damage * .8 ** hits).damage);
                effects.add(EffectKind.Lightning, tick, fromX, fromZ, .45, .55, p.x[target], p.z[target]);
                fromX = p.x[target]; fromZ = p.z[target];
            }
            if (!hits) return false;
        } else {
            let hits = 0;
            const enemies = this.entities.queryNearby(Component.Enemy, x, z, values.radius, true, true);
            for (let cursor = 0; cursor < enemies.count; cursor++) {
                const slot = enemies.slots[cursor];
                impacts.add(world.ids[player], world.ids[slot], rollAttack(stats, random, values.damage).damage);
                if (id === "frost") { status.slowUntil[slot] = Math.max(status.slowUntil[slot], tick + ticksForSeconds(values.slowSeconds)); status.slowScale[slot] = .5; }
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
