import { expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import type { CombatWorld } from "../src/core/CombatWorld";
import { CombatEventKind as Kind, EffectCause as Cause, type CombatEventConsumer } from "../src/core/CombatEvents";
import type { DerivedStats } from "../src/core/CombatStats";
import type { CombatResolution } from "../src/core/CombatResolution";
import type { DeterministicRandom } from "../src/core/DeterministicRandom";
import type { SkillSystem } from "../src/core/SkillSystem";
import { StatusKind } from "../src/core/StatusSystem";

function arena() {
    const simulation = new CombatSimulation("settlement-events");
    const f = simulation as unknown as { entities: CombatWorld; resolution: CombatResolution; random: DeterministicRandom;
        stats: DerivedStats; skills: SkillSystem; consumeCombatEvent: CombatEventConsumer; resolveImpacts(): void };
    f.stats = { ...f.stats, accuracy: 2, lethalChance: 0, lifesteal: .5, evasion: 0, criticalResistance: 1, blockChance: 0, thorns: 1 };
    const e = f.entities, slot = e.enemies.slots[0], target = e.world.ids[slot], player = e.world.ids[e.player];
    const facts: { kind: Kind; cause: Cause; amount: number; source: number; target: number; x: number }[] = [];
    const consume = f.consumeCombatEvent;
    f.consumeCombatEvent = (events, i) => {
        facts.push({ kind: events.kind[i], cause: events.cause[i], amount: events.amount[i], source: events.source[i], target: events.target[i], x: events.x[i] });
        consume(events, i);
    };
    return { simulation, f, e, slot, target, player, facts };
}

test("overkill and lifesteal emit actual amounts; duplicate targets grant one defeat after slot reuse", () => {
    const { simulation, f, e, slot, target, player, facts } = arena();
    e.vitals.health[e.player] -= 10; e.vitals.health[slot] = 2;
    const x = e.position.x[slot], health = e.vitals.health[e.player];
    e.impacts.add(player, target, 10000); e.impacts.add(player, target, 10000);
    f.resolveImpacts();
    expect(facts.map(fact => [fact.kind, fact.cause, fact.amount])).toEqual([[Kind.Damage, Cause.Attack, 2], [Kind.Heal, Cause.Lifesteal, 1], [Kind.Defeat, Cause.Attack, 0]]);
    expect(facts[2]).toMatchObject({ source: player, target, x });
    expect(e.vitals.health[e.player]).toBe(health + 1);
    expect(e.world.resolve(target)).toBe(-1);
    expect(simulation.getSnapshot().kills).toBe(1);
    simulation.dispose();
});

test("mutual death orders reflection and enemy rewards before player defeat, with no recursive lifesteal", () => {
    const { simulation, f, e, slot, target, player, facts } = arena();
    e.vitals.health[e.player] = 10; e.vitals.health[slot] = 2; f.resolution.shieldCooldown = 1;
    e.impacts.add(target, player, 10000); f.resolveImpacts();
    expect(facts.map(fact => [fact.kind, fact.cause, fact.amount])).toEqual([
        [Kind.Damage, Cause.Attack, 10], [Kind.Damage, Cause.Reflection, 2], [Kind.Defeat, Cause.Reflection, 0], [Kind.Defeat, Cause.Attack, 0]
    ]);
    expect(simulation.gameOver).toBe(true); expect(simulation.getSnapshot().kills).toBe(1);
    e.vitality.defeat(target, player, 0, Cause.Attack); f.resolveImpacts();
    expect(facts).toHaveLength(4);
    simulation.dispose();
});

test("healing is clamped, cannot resurrect, and source provenance survives destruction", () => {
    const { simulation, f, e, slot, target, player, facts } = arena();
    e.vitals.health[e.player] -= 3;
    expect(e.vitality.heal(target, player, 100, 0, Cause.ShamanHeal)).toBe(3);
    e.remove(slot); f.resolveImpacts();
    expect(facts[0]).toMatchObject({ kind: Kind.Heal, cause: Cause.ShamanHeal, source: target, target: player, amount: 3 });
    e.vitals.health[e.player] = 0;
    expect(e.vitality.heal(target, player, 100, 0, Cause.ShamanHeal)).toBe(0);
    expect(e.vitality.damage(player, target, 100, 0, Cause.Attack)).toBe(0);
    expect(() => e.vitality.damage(player, player, Infinity, 0, Cause.Attack)).toThrow();
    simulation.dispose();
});

test("event consumers cannot mutate health or recursively settle a hit", () => {
    const { simulation, f, e, slot, target, player } = arena();
    e.vitals.health[slot] = 1000; e.impacts.add(player, target, 1);
    f.consumeCombatEvent = () => {
        const health = e.vitals.health[slot];
        expect(() => e.vitality.damage(player, target, 100, 0, Cause.Attack)).toThrow(/reenter/);
        expect(e.vitals.health[slot]).toBe(health);
        expect(() => f.resolveImpacts()).toThrow(/reenter/);
    };
    f.resolveImpacts(); simulation.dispose();
});

test("shared protection applies before barrier absorption and an active barrier roundtrips through character save", () => {
    const { simulation, f, e, player, target } = arena();
    f.resolution.shieldCooldown = 1;
    e.status.apply(StatusKind.Protection, player, player, 1, 10, 0);
    e.status.apply(StatusKind.Barrier, player, player, 20, 100, 0);
    const health = e.vitals.health[e.player];
    e.impacts.add(target, player, 1000); f.resolveImpacts();
    expect(e.vitals.health[e.player]).toBe(health); expect(f.skills.ward).toBe(20);
    e.status.absorb(e.player, 7, 0);
    const saved = simulation.checkpoint(), restored = new CombatSimulation("settlement-events");
    restored.restore(saved);
    expect(restored.getSnapshot().player.skills.ward).toBe(13);
    expect(restored.checkpoint().skills.wardUntil).toBe(100);
    simulation.dispose(); restored.dispose();
});
