import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import { EffectCause } from "../../src/core/CombatEvents";

export function hitEnemy(simulation: CombatSimulation, slot: number, damage: number, critical = false): void {
    const f = simulation as unknown as { entities: CombatWorld; resolveImpacts(): void };
    const e = f.entities;
    e.impacts.add(e.world.ids[e.player], e.world.ids[slot], damage, 0, 0, Number(critical));
    f.resolveImpacts();
}

export function defeatEnemy(simulation: CombatSimulation, slot: number): void {
    const f = simulation as unknown as { entities: CombatWorld; resolveImpacts(): void };
    const e = f.entities, source = e.world.ids[e.player], target = e.world.ids[slot];
    e.vitality.damage(source, target, e.vitals.health[slot], simulation.tick, EffectCause.Attack);
    e.vitality.defeat(source, target, simulation.tick, EffectCause.Attack);
    f.resolveImpacts();
}
