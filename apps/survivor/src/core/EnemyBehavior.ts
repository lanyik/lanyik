import { BehaviorTree, BehaviorStatus, type BehaviorNode } from "./BehaviorTree";
import { ActorAction, CombatWorld, MoveIntent } from "./CombatWorld";
import { ENEMY_DEFINITIONS } from "./EnemyDefinitions";
import { ENEMY_LEASH_DISTANCE } from "./CombatConfig";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import { LOW_FREQUENCY_TICKS, type RegionalWorld } from "./RegionalWorld";

type Context = EnemyBehavior;
const condition = (test: (context: Context, slot: number) => boolean): BehaviorNode<Context> => ({ type: "condition", test });
const action = (tick: (context: Context, slot: number) => BehaviorStatus): BehaviorNode<Context> => ({ type: "action", tick, halt: (context, slot) => context.cancel(slot) });
const sequence = (...children: BehaviorNode<Context>[]): BehaviorNode<Context> => ({ type: "sequence", children });
const selector = (...children: BehaviorNode<Context>[]): BehaviorNode<Context> => ({ type: "selector", children });

const TREE = new BehaviorTree<Context>(selector(
    sequence(condition((c, s) => c.entities.enemy.target[s] === 0), action((c, s) => c.move(s, MoveIntent.Return))),
    sequence(condition((c, s) => c.entities.enemy.kind[s] === 3 && c.entities.action.kind[s] < ActorAction.Melee && c.distance(s) < 3.5),
        action((c, s) => c.move(s, MoveIntent.Retreat))),
    sequence(condition((c, s) => c.entities.action.kind[s] >= ActorAction.Melee || c.distance(s) <= c.entities.action.reach[s]),
        action((c, s) => c.attack(s))),
    action((c, s) => c.move(s, MoveIntent.Chase))
));

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
            p.previousX[slot] = p.x[slot]; p.previousZ[slot] = p.z[slot];
            v.hitFlash[slot] = Math.max(0, v.hitFlash[slot] - COMBAT_STEP_MS / 1000);
            e.intent[slot] = MoveIntent.None; e.intentSeconds[slot] = 0;
            const lod = this.regions.lodAt(p.x[slot], p.z[slot]);
            e.active[slot] = Number(lod === "active");
            const pursuing = lod === "active" && Math.hypot(p.x[player] - e.homeX[slot], p.z[player] - e.homeZ[slot]) <= ENEMY_LEASH_DISTANCE;
            e.target[slot] = pursuing ? this.entities.world.ids[player] : 0;
            if (lod !== "active") TREE.halt(this, slot, e.runningNode);
            if (lod === "unloaded") { this.entities.remove(slot); continue; }
            if (lod === "static" || (lod === "low" && tick % LOW_FREQUENCY_TICKS !== this.entities.world.ids[slot] % LOW_FREQUENCY_TICKS)) {
                a.kind[slot] = ActorAction.Idle;
                cursor++;
                continue;
            }
            e.intentSeconds[slot] = COMBAT_STEP_MS / 1000 * (lod === "low" ? LOW_FREQUENCY_TICKS : 1);
            TREE.tick(this, slot, e.runningNode);
            cursor++;
        }
    }

    public distance(slot: number): number {
        const p = this.entities.position;
        return Math.hypot(p.x[this.entities.player] - p.x[slot], p.z[this.entities.player] - p.z[slot]);
    }

    public move(slot: number, intent: MoveIntent): BehaviorStatus {
        const { enemy: e, action: a, position: p } = this.entities;
        a.kind[slot] = ActorAction.Idle;
        if (intent === MoveIntent.Return && Math.hypot(p.x[slot] - e.homeX[slot], p.z[slot] - e.homeZ[slot]) < .001) return BehaviorStatus.Success;
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
        a.kind[slot] = e.kind[slot] === 3 ? ActorAction.Cast : ActorAction.Melee;
        a.started[slot] = this.tick;
        a.hitAt[slot] = this.tick + definition.windupTicks;
        a.endsAt[slot] = a.hitAt[slot] + definition.recoveryTicks;
        a.readyAt[slot] = a.endsAt[slot]; a.committed[slot] = 0; a.progress[slot] = 0;
        p.heading[slot] = Math.atan2(p.x[player] - p.x[slot], p.z[player] - p.z[slot]);
        return BehaviorStatus.Running;
    }

    public cancel(slot: number): void {
        const { action: a, enemy: e } = this.entities;
        if (a.kind[slot] >= ActorAction.Melee) {
            a.readyAt[slot] = Math.max(a.readyAt[slot], this.tick + ENEMY_DEFINITIONS[e.kind[slot]].recoveryTicks);
        }
        a.kind[slot] = ActorAction.Idle; a.progress[slot] = 0; a.committed[slot] = 0;
        e.intent[slot] = MoveIntent.None;
    }
}
