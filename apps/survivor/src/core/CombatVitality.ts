import type { CombatWorld } from "./CombatWorld";
import { CombatEventKind, EffectCause } from "./CombatEvents";

/** Commits actual health changes. Formulas, targeting, rewards and visuals live elsewhere. */
export class CombatVitality {
    private playerDefeated = false;
    constructor(private readonly e: CombatWorld) {}

    public damage(source: number, target: number, amount: number, tick: number, cause: EffectCause, critical = false): number {
        this.validate(amount);
        const e = this.e, slot = e.world.resolve(target);
        if (slot < 0 || e.vitals.health[slot] <= 0 || amount === 0) return 0;
        const lost = Math.min(e.vitals.health[slot], amount);
        e.events.assertWritable();
        e.vitals.health[slot] -= lost;
        e.events.add(e, CombatEventKind.Damage, cause, source, slot, lost, tick, critical);
        return lost;
    }

    public heal(source: number, target: number, amount: number, tick: number, cause: EffectCause): number {
        this.validate(amount);
        const e = this.e, slot = e.world.resolve(target);
        if (slot < 0 || e.vitals.health[slot] <= 0) return 0;
        const gained = Math.min(e.vitals.maxHealth[slot] - e.vitals.health[slot], amount);
        if (gained <= 0) return 0;
        e.events.assertWritable();
        e.vitals.health[slot] += gained;
        e.events.add(e, CombatEventKind.Heal, cause, source, slot, gained, tick);
        return gained;
    }

    /** Called after derived effects, so lethal reflection still grants rewards on mutual death. */
    public defeat(source: number, target: number, tick: number, cause: EffectCause): void {
        const e = this.e, slot = e.world.resolve(target);
        if (slot < 0 || e.vitals.health[slot] > 0 || slot === e.player && this.playerDefeated) return;
        e.events.add(e, CombatEventKind.Defeat, cause, source, slot, 0, tick);
        if (slot !== e.player) e.remove(slot);
        else this.playerDefeated = true;
    }
    private validate(amount: number): void {
        if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Health change must be finite and nonnegative");
    }
}
