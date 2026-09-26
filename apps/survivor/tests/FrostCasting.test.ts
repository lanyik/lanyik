import { expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld, ActorAction } from "../src/core/CombatWorld";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { FrostCasting } from "../src/core/FrostCasting";
import { StatusKind } from "../src/core/StatusSystem";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { skillValues } from "../src/core/Skills";
import type { DerivedStats } from "../src/core/CombatStats";
import { EnemyBehavior } from "../src/core/EnemyBehavior";
import { advanceEnemyActions, moveEnemies } from "../src/core/CombatSystems";
import { EnemyKind } from "../src/core/EnemyDefinitions";

function arena() {
    const simulation = new CombatSimulation("frost-effects");
    const f = simulation as unknown as { character: { derivedStats: DerivedStats; }; entities: CombatWorld; world: RegionalWorld; random: DeterministicRandom; resolveImpacts(): void };
    const e = f.entities; while (e.enemies.count) e.remove(e.enemies.slots[0]);
    f.character.derivedStats = { ...f.character.derivedStats, accuracy: 2, lethalChance: 0, criticalChance: 0, excellentChance: 0 };
    const spawn = (x: number, z = 0, kind = EnemyKind.Grunt) => {
        const slot = e.spawnEnemy({ x, z, kind, level: 1, elite: false, boss: false, region: f.world.regionAt(x, z) }, f.world.chunks.get("0,0")!);
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 100000; return slot;
    };
    return { simulation, f, e, spawn, frost: new FrostCasting(e), random: new DeterministicRandom("ice") };
}

test("ice bolts select different nearest targets with stable ties; lance uses its locked corridor", () => {
    const { f, e, spawn, frost, random } = arena();
    const a = spawn(0, 2), b = spawn(0, -2), c = spawn(0, 4); spawn(2, 2); spawn(0, 8);
    frost.release("icebolt", 0, f.character.derivedStats, { ...skillValues("icebolt", 1, f.character.derivedStats), targets: 2 }, 0, 0, 0, random);
    expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[a], e.world.ids[b]]);
    e.impacts.count = 0;
    frost.release("icelance", 0, f.character.derivedStats, { ...skillValues("icelance", 1, f.character.derivedStats), targets: 6 }, 0, 0, 0, random);
    expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[a], e.world.ids[c]]);
});

test("misses never attach on-hit chill or consume freeze, while area control is independent of accuracy", () => {
    const { f, e, spawn, frost, random } = arena(), slot = spawn(0, 2), source = e.world.ids[e.player], target = e.world.ids[slot];
    f.character.derivedStats = { ...f.character.derivedStats, accuracy: 0 }; vi.spyOn(f.random, "next").mockReturnValue(.5);
    frost.release("icebolt", 0, f.character.derivedStats, skillValues("icebolt", 1, f.character.derivedStats), 0, 0, 0, random); f.resolveImpacts();
    expect(e.status.amount(StatusKind.Chill, slot, 0)).toBe(0);
    frost.release("frost", 0, f.character.derivedStats, skillValues("frost", 1, f.character.derivedStats), 0, 0, 0, random); f.resolveImpacts();
    expect(e.status.amount(StatusKind.Chill, slot, 0)).toBe(2);
    e.status.apply(StatusKind.Frozen, source, target, 1, 120, 0);
    e.impacts.ice(source, target, 10, false, 0, 0, 0, 1.5, true); f.resolveImpacts();
    expect(e.status.canAct(slot, 0)).toBe(false);
    f.character.derivedStats = { ...f.character.derivedStats, accuracy: 2 };
    const health = e.vitals.health[slot];
    e.impacts.ice(source, target, 10, false, 0, 0, 0, 1.5, true); f.resolveImpacts();
    expect(health - e.vitals.health[slot]).toBe(15); expect(e.status.canAct(slot, 0)).toBe(true);
    expect(e.status.amount(StatusKind.ControlResistance, slot, 0)).toBe(1);
});

test("ice fields snapshot their center and emit exactly eight pulses including the terminal tick", () => {
    const { f, e, spawn, frost, random } = arena(), slot = spawn(0, 2);
    frost.release("blizzard", 0, f.character.derivedStats, skillValues("blizzard", 1, f.character.derivedStats), 0, 2, 0, random);
    e.position.x[e.player] = 30; let hits = 0;
    for (let tick = 1; tick <= 481; tick++) frost.advance(tick, random, () => {
        expect(e.impacts.target[0]).toBe(e.world.ids[slot]); hits += e.impacts.count; e.impacts.count = 0;
    });
    expect(hits).toBe(8); expect(frost.ongoing).toBe(false);
    frost.release("icestorm", 500, f.character.derivedStats, skillValues("icestorm", 1, f.character.derivedStats), 0, 2, 0, random);
    frost.clear(); frost.advance(1000, random, () => { throw new Error("Cancelled field released"); });
});

test("freeze cancels a caster windup without resetting cooldown and suspends movement", () => {
    const { f, e, spawn } = arena(), caster = spawn(0, 5, EnemyKind.Caster), behavior = new EnemyBehavior(e, f.world);
    behavior.update(1); expect(e.action.kind[caster]).toBe(ActorAction.Cast);
    const ready = e.action.readyAt[caster], x = e.position.x[caster], z = e.position.z[caster];
    e.status.apply(StatusKind.Frozen, e.world.ids[e.player], e.world.ids[caster], 1, 122, 2);
    behavior.update(2); advanceEnemyActions(e, 2); moveEnemies(e, 2);
    expect(e.action.kind[caster]).toBe(ActorAction.Idle); expect(e.action.readyAt[caster]).toBe(ready);
    expect(e.projectiles.count).toBe(0); expect([e.position.x[caster], e.position.z[caster]]).toEqual([x, z]);
});
