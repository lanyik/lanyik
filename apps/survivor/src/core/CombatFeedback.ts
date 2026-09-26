import { CombatEventKind, EffectCause, Prevention, type CombatEvents } from "./CombatEvents";
import { CombatTextKind } from "./CombatText";
import type { CombatWorld } from "./CombatWorld";

/** Converts completed facts to bounded presentation state; no gameplay reads this output. */
export function combatFeedback(e: CombatWorld, events: CombatEvents, i: number): void {
    let kind: CombatTextKind;
    if (events.kind[i] === CombatEventKind.Prevented) {
        kind = events.prevention[i] === Prevention.Dodge ? CombatTextKind.Dodge
            : events.prevention[i] === Prevention.Block ? CombatTextKind.Block : CombatTextKind.Shield;
    } else if (events.kind[i] === CombatEventKind.Damage && events.cause[i] !== EffectCause.Sacrifice) {
        kind = events.cause[i] === EffectCause.Reflection ? CombatTextKind.Reflection
            : events.player[i] ? events.critical[i] ? CombatTextKind.PlayerCritical : CombatTextKind.PlayerDamage
                : events.critical[i] ? CombatTextKind.EnemyCritical : CombatTextKind.EnemyDamage;
        const slot = e.world.resolve(events.target[i]);
        if (events.amount[i] > 0) {
            if (events.player[i]) e.feedback.hurtTick = events.tick[i];
            else if (Math.hypot(events.x[i] - e.position.x[e.player], events.z[i] - e.position.z[e.player]) < 18) e.feedback.impactTick = events.tick[i];
        }
        if (slot >= 0 && !events.player[i] && events.cause[i] === EffectCause.Attack) e.vitals.hitFlash[slot] = .1;
    } else return;
    e.combatText.add(events.target[i], kind, events.amount[i], events.x[i], events.z[i], events.tick[i]);
}
