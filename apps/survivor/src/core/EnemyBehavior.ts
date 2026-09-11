import { BehaviorTree, BehaviorStatus, type BehaviorNode } from "./BehaviorTree";
import { ActorAction, CombatWorld, Component, MoveIntent } from "./CombatWorld";
import { ENEMY_DEFINITIONS, ENEMY_SPECIAL } from "./EnemyDefinitions";
import { ENEMY_LEASH_DISTANCE, GAME_CONFIG, ticksPerUpdate, ticksForSeconds } from "./GameConfig";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import type { RegionalWorld } from "./RegionalWorld";
const ACTIVE_AI_TICKS = ticksPerUpdate(GAME_CONFIG.timing.activeAiHz);
const DISTANT_AI_TICKS = ticksPerUpdate(GAME_CONFIG.timing.distantAiHz);
const SUPPORT_SENSE_TICKS = ticksPerUpdate(GAME_CONFIG.timing.supportSenseHz);
const ACTIVITY = GAME_CONFIG.enemies;

type Context = EnemyBehavior;
const condition = (test: (context: Context, slot: number) => boolean): BehaviorNode<Context> => ({ type: "condition", test });
const action = (tick: (context: Context, slot: number) => BehaviorStatus): BehaviorNode<Context> => ({ type: "action", tick, halt: (context, slot) => context.cancel(slot) });
const sequence = (...children: BehaviorNode<Context>[]): BehaviorNode<Context> => ({ type: "sequence", children });
const selector = (...children: BehaviorNode<Context>[]): BehaviorNode<Context> => ({ type: "selector", children });

const TREES = ENEMY_DEFINITIONS.map((definition, kind) => new BehaviorTree<Context>(selector(
    sequence(condition((c, s) => c.entities.enemy.target[s] === 0), action((c, s) => c.idle(s))),
    ...(definition.ranged ? [sequence(condition((c, s) => c.entities.action.kind[s] < ActorAction.Melee
        && c.distance(s) < (kind === 5 ? 4 : 3.5) && !c.canNova(s)), action((c, s) => c.move(s, MoveIntent.Retreat)))] : []),
    ...(kind === 1 ? [sequence(condition((c, s) => c.entities.action.kind[s] < ActorAction.Melee
        && c.tick < c.entities.action.readyAt[s] && c.distance(s) < 3), action((c, s) => c.move(s, MoveIntent.Circle)))] : []),
    sequence(condition((c, s) => c.wantsAction(s)), action((c, s) => c.attack(s))),
    action((c, s) => c.move(s, kind === 1 ? MoveIntent.Flank : MoveIntent.Chase))
)));

/** Sensing and the shared behavior tree only write intents and action requests. */
export class EnemyBehavior {
    public tick = 0;
    constructor(public readonly entities: CombatWorld, private readonly regions: RegionalWorld) {}

    public update(tick: number): void {
        this.tick = tick;
        const { enemies, enemy: e, position: p, action: a, vitals: v, player } = this.entities;
        let cursor = 0;
        while (cursor < enemies.count) {
            const slot = enemies.slots[cursor];
            const tree = TREES[e.kind[slot]];
            p.previousX[slot] = p.x[slot]; p.previousZ[slot] = p.z[slot];
            v.hitFlash[slot] = Math.max(0, v.hitFlash[slot] - COMBAT_STEP_MS / 1000);
            if (this.regions.residencyAt(p.x[slot], p.z[slot]) === "unloaded") { this.entities.remove(slot); continue; }
            const wasActive = e.active[slot], wasAwake = e.awake[slot], previousTarget = e.target[slot];
            const distance = this.distance(slot);
            // Residency is chunk based; behavior is radial and follows the player every tick.
            e.active[slot] = Number(distance <= (wasActive ? ACTIVITY.activeExitDistance : ACTIVITY.activeDistance));
            e.awake[slot] = Number(distance <= (wasAwake ? ACTIVITY.sleepDistance : ACTIVITY.awakeDistance));
            const pursuing = !e.returning[slot] && e.active[slot]
                && distance <= (previousTarget ? ACTIVITY.pursuitDistance : ACTIVITY.aggroDistance)
                && Math.hypot(p.x[player] - e.homeX[slot], p.z[player] - e.homeZ[slot]) <= ENEMY_LEASH_DISTANCE;
            e.target[slot] = pursuing ? this.entities.world.ids[player] : 0;
            if (previousTarget && !pursuing) e.returning[slot] = 1;
            if (e.boss[slot] && v.health[slot] <= v.maxHealth[slot] * ENEMY_SPECIAL.enrageHealth) e.enraged[slot] = 1;
            if (!e.awake[slot]) {
                tree.halt(this, slot, e.runningNode);
                e.intent[slot] = MoveIntent.None;
                e.supportTarget[slot] = 0;
                a.kind[slot] = ActorAction.Idle;
                cursor++;
                continue;
            }
            if (e.active[slot] && e.kind[slot] === 5 && tick >= e.senseAt[slot]) {
                this.senseAlly(slot);
                e.senseAt[slot] = tick + SUPPORT_SENSE_TICKS - (tick - this.entities.world.ids[slot] % SUPPORT_SENSE_TICKS + SUPPORT_SENSE_TICKS) % SUPPORT_SENSE_TICKS;
            }
            // Locomotion and attack release remain 120Hz. Only decisions are staggered.
            // Entering combat, losing a target and finishing an action bypass the decision interval.
            const interval = e.active[slot] ? ACTIVE_AI_TICKS : DISTANT_AI_TICKS;
            if (!wasAwake || wasActive !== e.active[slot] || previousTarget !== e.target[slot]
                || a.kind[slot] >= ActorAction.Melee && tick >= a.endsAt[slot]
                || tick % interval === this.entities.world.ids[slot] % interval) tree.tick(this, slot, e.runningNode);
            cursor++;
        }
    }

    public distance(slot: number): number {
        const p = this.entities.position;
        return Math.hypot(p.x[this.entities.player] - p.x[slot], p.z[this.entities.player] - p.z[slot]);
    }

    public idle(slot: number): BehaviorStatus {
        const { enemy: e, position: p, world } = this.entities;
        if (e.returning[slot]) {
            if (Math.hypot(p.x[slot] - e.homeX[slot], p.z[slot] - e.homeZ[slot]) > .05) return this.move(slot, MoveIntent.Return);
            e.returning[slot] = 0;
            e.patrolX[slot] = p.x[slot]; e.patrolZ[slot] = p.z[slot]; e.patrolWaitUntil[slot] = 0;
        }
        if (Math.hypot(p.x[slot] - e.patrolX[slot], p.z[slot] - e.patrolZ[slot]) < .05) {
            if (e.patrolWaitUntil[slot] === 0 && e.patrolStep[slot] > 0) {
                e.patrolWaitUntil[slot] = this.tick + ticksForSeconds(.7 + (world.ids[slot] % 7) * .15);
            }
            if (this.tick < e.patrolWaitUntil[slot]) return this.move(slot, MoveIntent.None);
            // Stable waypoints do not consume the combat/loot random stream.
            const step = ++e.patrolStep[slot];
            const angle = world.ids[slot] * 2.399963 + step * 2.094395;
            const radius = ACTIVITY.patrolRadius * (e.boss[slot] ? .5 : e.kind[slot] === 1 ? 1.3 : 1);
            e.patrolX[slot] = e.homeX[slot] + Math.sin(angle) * radius;
            e.patrolZ[slot] = e.homeZ[slot] + Math.cos(angle) * radius;
            e.patrolWaitUntil[slot] = 0;
        }
        return this.move(slot, MoveIntent.Patrol);
    }

    public move(slot: number, intent: MoveIntent): BehaviorStatus {
        const { enemy: e, action: a } = this.entities;
        a.kind[slot] = ActorAction.Idle;
        e.intent[slot] = intent;
        return BehaviorStatus.Running;
    }

    public attack(slot: number): BehaviorStatus {
        const { action: a, enemy: e, position: p, player } = this.entities;
        e.intent[slot] = MoveIntent.None;
        if (a.kind[slot] >= ActorAction.Melee) {
            if (this.tick < a.endsAt[slot]) return BehaviorStatus.Running;
            a.kind[slot] = ActorAction.Idle; a.progress[slot] = 0;
            return BehaviorStatus.Success;
        }
        if (this.tick < a.readyAt[slot]) return BehaviorStatus.Running;
        const definition = ENEMY_DEFINITIONS[e.kind[slot]];
        let windup = definition.windupTicks, recovery = definition.recoveryTicks;
        a.kind[slot] = definition.ranged ? ActorAction.Cast : ActorAction.Melee;
        a.target[slot] = e.target[slot];
        if (this.canNova(slot)) {
            a.kind[slot] = ActorAction.Nova;
            windup = ticksForSeconds(ENEMY_SPECIAL.nova.windup); recovery = ticksForSeconds(ENEMY_SPECIAL.nova.recovery);
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(ENEMY_SPECIAL.nova.cooldown);
        } else if (this.canHeal(slot)) {
            a.kind[slot] = ActorAction.Heal; a.target[slot] = e.supportTarget[slot];
            windup = ticksForSeconds(ENEMY_SPECIAL.heal.windup); recovery = ticksForSeconds(ENEMY_SPECIAL.heal.recovery);
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(ENEMY_SPECIAL.heal.cooldown);
        } else if (this.canCharge(slot)) {
            a.kind[slot] = ActorAction.Charge;
            windup = ticksForSeconds(ENEMY_SPECIAL.charge.windup); recovery = ticksForSeconds(ENEMY_SPECIAL.charge.duration + ENEMY_SPECIAL.charge.recovery);
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(ENEMY_SPECIAL.charge.cooldown);
        }
        a.started[slot] = this.tick;
        a.hitAt[slot] = this.tick + windup;
        a.endsAt[slot] = a.hitAt[slot] + recovery;
        a.readyAt[slot] = a.endsAt[slot] + definition.cooldownTicks; a.committed[slot] = 0; a.progress[slot] = 0;
        a.variant[slot] = e.boss[slot] ? (e.enraged[slot] ? 5 : 3) : 1;
        p.heading[slot] = Math.atan2(p.x[player] - p.x[slot], p.z[player] - p.z[slot]);
        return BehaviorStatus.Running;
    }

    public wantsAction(slot: number): boolean {
        const a = this.entities.action;
        return a.kind[slot] >= ActorAction.Melee || this.tick >= a.readyAt[slot]
            && (this.canNova(slot) || this.canHeal(slot) || this.canCharge(slot) || this.distance(slot) <= a.reach[slot]);
    }
    public canNova(slot: number): boolean {
        const e = this.entities.enemy;
        return e.boss[slot] !== 0 && e.enraged[slot] !== 0 && this.tick >= e.specialReadyAt[slot] && this.distance(slot) <= ENEMY_SPECIAL.nova.radius;
    }
    private canCharge(slot: number): boolean {
        const e = this.entities.enemy;
        if (e.kind[slot] !== 4 || this.tick < e.specialReadyAt[slot]) return false;
        const distance = this.distance(slot);
        return distance >= ENEMY_SPECIAL.charge.minRange && distance <= ENEMY_SPECIAL.charge.maxRange;
    }
    private canHeal(slot: number): boolean {
        const { enemy: e, vitals: v, world, position: p } = this.entities;
        if (e.kind[slot] !== 5 || this.tick < e.specialReadyAt[slot]) return false;
        const target = world.resolve(e.supportTarget[slot]);
        return target >= 0 && v.health[target] < v.maxHealth[target] * ENEMY_SPECIAL.heal.threshold
            && Math.hypot(p.x[target] - p.x[slot], p.z[target] - p.z[slot]) <= ENEMY_SPECIAL.heal.radius;
    }
    private senseAlly(slot: number): void {
        const { enemy: e, vitals: v, position: p, world } = this.entities;
        const enemies = this.entities.queryNearby(Component.Enemy, p.x[slot], p.z[slot], ENEMY_SPECIAL.heal.radius);
        let target = -1, lowest: number = ENEMY_SPECIAL.heal.threshold;
        for (let cursor = 0; cursor < enemies.count; cursor++) {
            const ally = enemies.slots[cursor], ratio = v.health[ally] / v.maxHealth[ally];
            if (ally === slot || !e.active[ally] || Math.hypot(p.x[ally] - p.x[slot], p.z[ally] - p.z[slot]) > ENEMY_SPECIAL.heal.radius) continue;
            if (ratio < lowest || ratio === lowest && target >= 0 && world.ids[ally] < world.ids[target]) { target = ally; lowest = ratio; }
        }
        e.supportTarget[slot] = target < 0 ? 0 : world.ids[target];
    }

    public cancel(slot: number): void {
        const { action: a, enemy: e } = this.entities;
        if (a.kind[slot] >= ActorAction.Melee) {
            a.readyAt[slot] = Math.max(a.readyAt[slot], this.tick + ENEMY_DEFINITIONS[e.kind[slot]].recoveryTicks);
        }
        a.kind[slot] = ActorAction.Idle; a.progress[slot] = 0; a.committed[slot] = 0;
        a.target[slot] = 0;
        e.intent[slot] = MoveIntent.None;
    }
}
