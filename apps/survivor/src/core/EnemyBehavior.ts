import { BehaviorTree, BehaviorStatus, type BehaviorNode } from "./BehaviorTree";
import { ActorAction, CombatWorld, Component, MoveIntent } from "./CombatWorld";
import { ENEMY_DEFINITIONS, ENEMY_SPECIAL, EnemyKind } from "./EnemyDefinitions";
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
        && c.distance(s) < (kind === EnemyKind.Healer ? 4 : 3.5) + (c.entities.enemy.intent[s] === MoveIntent.Retreat ? .8 : 0)
        && c.entities.canSee(s, c.entities.player)
        && !c.canReave(s) && !(c.tick >= c.entities.action.readyAt[s] && c.canHeal(s))), action((c, s) => c.move(s, MoveIntent.Retreat)))] : []),
    ...(kind === EnemyKind.Scout ? [sequence(condition((c, s) => c.entities.action.kind[s] < ActorAction.Melee
        && c.tick < c.entities.action.readyAt[s] && c.distance(s) < 3), action((c, s) => c.move(s, MoveIntent.Circle)))] : []),
    sequence(condition((c, s) => c.wantsAction(s)), action((c, s) => c.attack(s))),
    ...(definition.ranged ? [sequence(condition((c, s) => c.distance(s) <= c.entities.action.reach[s] && c.entities.canSee(s, c.entities.player)), action((c, s) => c.move(s, MoveIntent.Circle)))] : []),
    action((c, s) => c.move(s, kind === EnemyKind.Scout ? MoveIntent.Flank : definition.ranged ? MoveIntent.Seek : MoveIntent.Chase))
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
            if (e.active[slot] && e.kind[slot] === EnemyKind.Healer && tick >= e.senseAt[slot]) {
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
        const { enemy: e, position: p, action: a, world, terrain } = this.entities;
        if (e.returning[slot]) {
            if (Math.hypot(p.x[slot] - e.homeX[slot], p.z[slot] - e.homeZ[slot]) > .05) return this.move(slot, MoveIntent.Return);
            e.returning[slot] = 0;
            e.patrolX[slot] = p.x[slot]; e.patrolZ[slot] = p.z[slot]; e.patrolWaitUntil[slot] = 0;
        }
        const blocked = e.intent[slot] === MoveIntent.Patrol && a.kind[slot] === ActorAction.Idle;
        if (blocked || Math.hypot(p.x[slot] - e.patrolX[slot], p.z[slot] - e.patrolZ[slot]) < .05) {
            if (!blocked && e.patrolWaitUntil[slot] === 0 && e.patrolStep[slot] > 0) {
                e.patrolWaitUntil[slot] = this.tick + ticksForSeconds(.7 + (world.ids[slot] % 7) * .15);
            }
            if (!blocked && this.tick < e.patrolWaitUntil[slot]) return this.move(slot, MoveIntent.None);
            // Stable waypoints do not consume the combat/loot random stream.
            const radius = ACTIVITY.patrolRadius * (e.boss[slot] ? .5 : e.kind[slot] === EnemyKind.Scout ? 1.3 : 1);
            for (let attempt = 0; attempt < 3; attempt++) {
                const step = ++e.patrolStep[slot];
                const angle = world.ids[slot] * 2.399963 + step * 2.094395;
                const x = e.homeX[slot] + Math.sin(angle) * radius, z = e.homeZ[slot] + Math.cos(angle) * radius;
                if (!terrain.isClear(x, z, p.radius[slot])) continue;
                e.patrolX[slot] = x; e.patrolZ[slot] = z; e.patrolWaitUntil[slot] = 0;
                return this.move(slot, MoveIntent.Patrol);
            }
            // A closed patch rests and tries the next bounded set; it never walks into a wall forever.
            e.patrolX[slot] = p.x[slot]; e.patrolZ[slot] = p.z[slot];
            e.patrolWaitUntil[slot] = this.tick + ticksForSeconds(1.5);
            return this.move(slot, MoveIntent.None);
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
        const { action: a, enemy: e, position: p, world } = this.entities;
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
        if (this.canBossSpell(slot)) {
            const stone = e.kind[slot] === EnemyKind.StoneSovereign;
            a.kind[slot] = stone ? ActorAction.Quake : ActorAction.Storm;
            const rule = stone ? ENEMY_SPECIAL.quake : ENEMY_SPECIAL.storm;
            windup = ticksForSeconds(rule.windup);
            recovery = ticksForSeconds(rule.recovery + (stone ? ENEMY_SPECIAL.quake.duration : (ENEMY_SPECIAL.storm.waves - 1) * ENEMY_SPECIAL.storm.interval));
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(rule.cooldown);
        } else if (this.canReave(slot)) {
            a.kind[slot] = ActorAction.Reave;
            windup = ticksForSeconds(ENEMY_SPECIAL.reave.windup); recovery = ticksForSeconds(ENEMY_SPECIAL.reave.duration + ENEMY_SPECIAL.reave.recovery);
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(ENEMY_SPECIAL.reave.cooldown);
        } else if (this.canHeal(slot)) {
            a.kind[slot] = ActorAction.Heal; a.target[slot] = e.supportTarget[slot];
            windup = ticksForSeconds(ENEMY_SPECIAL.heal.windup); recovery = ticksForSeconds(ENEMY_SPECIAL.heal.recovery);
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(ENEMY_SPECIAL.heal.cooldown);
        } else if (this.canCharge(slot)) {
            a.kind[slot] = ActorAction.Charge;
            windup = ticksForSeconds(ENEMY_SPECIAL.charge.windup); recovery = ticksForSeconds(ENEMY_SPECIAL.charge.duration + ENEMY_SPECIAL.charge.recovery);
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(ENEMY_SPECIAL.charge.cooldown);
        } else if (this.canVolley(slot)) {
            a.kind[slot] = e.boss[slot] ? ActorAction.Jaws : ActorAction.Volley;
            const rule = e.boss[slot] ? ENEMY_SPECIAL.jaws : ENEMY_SPECIAL.volley;
            windup = ticksForSeconds(rule.windup);
            recovery = ticksForSeconds(rule.recovery + (e.boss[slot] ? ENEMY_SPECIAL.jaws.duration : 0));
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(rule.cooldown);
        } else if (this.canFault(slot)) {
            a.kind[slot] = ActorAction.Fault;
            windup = ticksForSeconds(ENEMY_SPECIAL.fault.windup); recovery = ticksForSeconds(ENEMY_SPECIAL.fault.duration + ENEMY_SPECIAL.fault.recovery);
            e.specialReadyAt[slot] = this.tick + windup + recovery + ticksForSeconds(ENEMY_SPECIAL.fault.cooldown);
        }
        e.attackStep[slot]++;
        a.started[slot] = this.tick;
        a.hitAt[slot] = this.tick + windup;
        a.endsAt[slot] = a.hitAt[slot] + recovery;
        a.readyAt[slot] = a.endsAt[slot] + definition.cooldownTicks; a.committed[slot] = 0; a.progress[slot] = 0;
        a.variant[slot] = e.boss[slot] ? (e.enraged[slot] ? 5 : 3) : 1;
        const target = world.resolve(a.target[slot]);
        if (target >= 0) {
            p.heading[slot] = Math.atan2(p.x[target] - p.x[slot], p.z[target] - p.z[slot]);
            a.targetX[slot] = p.x[target]; a.targetZ[slot] = p.z[target];
        }
        return BehaviorStatus.Running;
    }

    public wantsAction(slot: number): boolean {
        const a = this.entities.action;
        return a.kind[slot] >= ActorAction.Melee || this.tick >= a.readyAt[slot]
            && (this.canHeal(slot) || (this.canBossSpell(slot) || this.canReave(slot) || this.canCharge(slot) || this.canFault(slot) || this.distance(slot) <= a.reach[slot])
                && this.entities.canSee(slot, this.entities.player));
    }
    private canVolley(slot: number): boolean {
        const e = this.entities.enemy;
        return e.kind[slot] === EnemyKind.Caster && e.attackStep[slot] % 2 === 1
            && this.tick >= e.specialReadyAt[slot] && this.distance(slot) <= this.entities.action.reach[slot];
    }
    private canBossSpell(slot: number): boolean {
        const e = this.entities.enemy;
        return e.boss[slot] !== 0 && this.tick >= e.specialReadyAt[slot]
            && (e.kind[slot] === EnemyKind.StoneSovereign && this.distance(slot) <= ENEMY_SPECIAL.quake.radius
                || e.kind[slot] === EnemyKind.StormOracle && this.distance(slot) <= this.entities.action.reach[slot]);
    }
    private canFault(slot: number): boolean {
        const e = this.entities.enemy;
        return e.kind[slot] === EnemyKind.Guard && e.attackStep[slot] > 0
            && this.tick >= e.specialReadyAt[slot] && this.distance(slot) <= ENEMY_SPECIAL.fault.length;
    }
    public canReave(slot: number): boolean {
        const e = this.entities.enemy;
        return e.boss[slot] !== 0 && (e.enraged[slot] !== 0 || e.kind[slot] === EnemyKind.EmberChampion)
            && this.tick >= e.specialReadyAt[slot] && this.distance(slot) <= ENEMY_SPECIAL.reave.radius;
    }
    private canCharge(slot: number): boolean {
        const e = this.entities.enemy;
        if (e.kind[slot] !== EnemyKind.Charger && e.kind[slot] !== EnemyKind.EmberChampion || this.tick < e.specialReadyAt[slot]) return false;
        const distance = this.distance(slot);
        return distance >= ENEMY_SPECIAL.charge.minRange && distance <= ENEMY_SPECIAL.charge.maxRange;
    }
    public canHeal(slot: number): boolean {
        const { enemy: e, vitals: v, world, position: p } = this.entities;
        if (e.kind[slot] !== EnemyKind.Healer || this.tick < e.specialReadyAt[slot]
            || v.health[slot] <= v.maxHealth[slot] * ENEMY_SPECIAL.heal.sacrifice + 1) return false;
        const target = world.resolve(e.supportTarget[slot]);
        return target >= 0 && v.health[target] < v.maxHealth[target] * ENEMY_SPECIAL.heal.threshold
            && Math.hypot(p.x[target] - p.x[slot], p.z[target] - p.z[slot]) <= ENEMY_SPECIAL.heal.radius && this.entities.canSee(slot, target);
    }
    private senseAlly(slot: number): void {
        const { enemy: e, vitals: v, position: p, world } = this.entities;
        const enemies = this.entities.queryNearby(Component.Enemy, p.x[slot], p.z[slot], ENEMY_SPECIAL.heal.radius);
        let target = -1, lowest: number = ENEMY_SPECIAL.heal.threshold;
        for (let cursor = 0; cursor < enemies.count; cursor++) {
            const ally = enemies.slots[cursor], ratio = v.health[ally] / v.maxHealth[ally];
            if (ally === slot || !e.active[ally] || e.homes[ally] !== e.homes[slot]) continue;
            if ((ratio < lowest || ratio === lowest && target >= 0 && world.ids[ally] < world.ids[target]) && this.entities.canSee(slot, ally)) { target = ally; lowest = ratio; }
        }
        e.supportTarget[slot] = target < 0 ? 0 : world.ids[target];
    }

    public cancel(slot: number): void {
        if (this.entities.action.kind[slot] >= ActorAction.Melee) this.entities.effects.cancelSource(this.entities.world.ids[slot]);
        const { action: a, enemy: e } = this.entities;
        if (a.kind[slot] >= ActorAction.Melee) {
            a.readyAt[slot] = Math.max(a.readyAt[slot], this.tick + ENEMY_DEFINITIONS[e.kind[slot]].recoveryTicks);
        }
        a.kind[slot] = ActorAction.Idle; a.progress[slot] = 0; a.committed[slot] = 0;
        a.target[slot] = 0;
        e.intent[slot] = MoveIntent.None;
    }
}
