import { hitEnemy } from "./helpers/settleCombat";
import { StatusKind } from "../src/core/StatusSystem";
import { expect, test } from "vitest";
import { ActorAction, CombatWorld } from "../src/core/CombatWorld";
import { EnemyBehavior } from "../src/core/EnemyBehavior";
import { EnemyKind, ENEMY_SPECIAL } from "../src/core/EnemyDefinitions";
import { advanceEnemyActions, advanceProjectiles } from "../src/core/CombatSystems";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { EffectKind } from "../src/core/CombatEffects";
import { ticksForSeconds } from "../src/core/GameConfig";
import { CombatSimulation } from "../src/core/CombatSimulation";
import type { DerivedStats } from "../src/core/CombatStats";

function arena(kind: EnemyKind, boss = false, distance = 5) {
    const world = new CombatWorld(0, distance), regions = new RegionalWorld("spell-contract", { x: 0, z: 0 }); regions.synchronize(0, 0);
    const home = regions.chunks.get("0,0")!, region = regions.regionAt(0, 0);
    const enemy = world.spawnEnemy({ x: 0, z: 0, kind, boss, elite: boss, level: 1, region }, home);
    return { world, enemy, home, region, behavior: new EnemyBehavior(world, regions) };
}

test("casters release a reserved fan of blades that curve without retargeting", () => {
    const { world: e, enemy, behavior } = arena(EnemyKind.Caster);
    e.enemy.attackStep[enemy] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Volley);
    advanceEnemyActions(e, e.action.hitAt[enemy] - 1); expect(e.projectiles.count).toBe(0);
    advanceEnemyActions(e, e.action.hitAt[enemy]); advanceEnemyActions(e, e.action.hitAt[enemy] + 1);
    expect(e.projectiles.count).toBe(3); expect(e.effects.buffer.count).toBe(0);
    const slots = Array.from(e.projectiles.slots.slice(0, 3)), before = slots.map(slot => e.position.heading[slot]);
    expect(slots.map(slot => Math.sign(e.projectile.turnRate[slot]))).toEqual([1, 0, -1]);
    e.position.x[e.player] = 50;
    for (let tick = 0; tick < 60; tick++) advanceProjectiles(e);
    expect(e.position.heading[slots[0]]).toBeGreaterThan(before[0]);
    expect(e.position.heading[slots[2]]).toBeLessThan(before[2]);
    for (const slot of slots) expect(Math.hypot(e.projectile.velocityX[slot], e.projectile.velocityZ[slot])).toBeCloseTo(4.5, 4);
});

test("boss jaws converge on a locked point and hit only when their moving blades reach the player", () => {
    const { world: e, enemy, behavior } = arena(EnemyKind.Caster, true);
    e.enemy.attackStep[enemy] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Jaws);
    const release = e.action.hitAt[enemy];
    for (let tick = release; tick < release + 50; tick++) advanceEnemyActions(e, tick);
    expect(e.impacts.count).toBe(0); expect(e.effects.buffer.kind[0]).toBe(EffectKind.EnemyJaws);
    for (let tick = release + 50; tick <= e.action.endsAt[enemy]; tick++) advanceEnemyActions(e, tick);
    expect(e.impacts.count).toBe(1); expect(e.impacts.damage[0]).toBeCloseTo(e.enemy.damage[enemy] * ENEMY_SPECIAL.jaws.damage);
    expect(e.action.targetX[enemy]).toBe(0); expect(e.action.targetZ[enemy]).toBe(5);
});

test("jaws leave the ends open for escape; interruption removes the continuing attack", () => {
    const { world: e, enemy, behavior } = arena(EnemyKind.Caster, true);
    e.enemy.attackStep[enemy] = 1; behavior.update(1);
    e.position.z[e.player] = e.position.previousZ[e.player] = 9;
    for (let tick = e.action.hitAt[enemy]; tick <= e.action.endsAt[enemy]; tick++) advanceEnemyActions(e, tick);
    expect(e.impacts.count).toBe(0);
    expect(e.effects.buffer.count).toBe(1); behavior.cancel(enemy);
    expect(e.effects.buffer.count).toBe(0);
});

test.each([0, 2])("the guard's fault travels forward, leaving lateral space to dodge (offset %s)", offset => {
    const { world: e, enemy, behavior } = arena(EnemyKind.Guard, false, 5);
    e.enemy.attackStep[enemy] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Fault);
    e.position.x[e.player] = e.position.previousX[e.player] = offset;
    const release = e.action.hitAt[enemy]; advanceEnemyActions(e, release); expect(e.impacts.count).toBe(0);
    for (let tick = release + 1; tick <= e.action.endsAt[enemy]; tick++) advanceEnemyActions(e, tick);
    expect(e.impacts.count).toBe(offset ? 0 : 1); expect(e.effects.buffer.kind[0]).toBe(EffectKind.EnemyFault);
    expect(e.enemy.specialReadyAt[enemy]).toBeGreaterThan(e.action.endsAt[enemy]);
});

test("a close enraged boss reaves across its front while its back remains safe", () => {
    for (const behind of [false, true]) {
        const { world: e, enemy, behavior } = arena(EnemyKind.Caster, true, 2);
        e.vitals.health[enemy] *= .4; behavior.update(1);
        expect(e.action.kind[enemy]).toBe(ActorAction.Reave);
        if (behind) e.position.z[e.player] = e.position.previousZ[e.player] = -2;
        const release = e.action.hitAt[enemy]; advanceEnemyActions(e, release); expect(e.impacts.count).toBe(0);
        for (let tick = release + 1; tick <= e.action.endsAt[enemy]; tick++) advanceEnemyActions(e, tick);
        expect(e.impacts.count).toBe(behind ? 0 : 1);
    }
});

test("healing grants a timed protective blessing and a reused entity slot cannot inherit it", () => {
    const { world: e, enemy, home, region, behavior } = arena(EnemyKind.Healer);
    const ally = e.spawnEnemy({ x: 1, z: 0, kind: EnemyKind.Grunt, elite: false, boss: false, level: 1, region }, home);
    e.enemy.active[ally] = 1; e.vitals.health[ally] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Heal);
    const healthBefore = e.vitals.health[enemy];
    const hit = e.action.hitAt[enemy]; advanceEnemyActions(e, hit);
    expect(e.vitals.health[enemy]).toBeCloseTo(healthBefore - e.vitals.maxHealth[enemy] * ENEMY_SPECIAL.heal.sacrifice);
    expect(e.vitals.health[ally]).toBeGreaterThan(1);
    expect(e.status.wardUntil[ally]).toBe(hit + ticksForSeconds(ENEMY_SPECIAL.healingWard.duration));
    e.remove(ally);
    const reused = e.spawnEnemy({ x: 1, z: 0, kind: EnemyKind.Grunt, elite: false, boss: false, level: 1, region }, home);
    expect(e.status.wardUntil[reused]).toBe(0);
});

test("a protective blessing reduces committed damage by 25 percent and expires on its deadline", () => {
    const simulation = new CombatSimulation("blessing-damage");
    const runtime = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; stats: DerivedStats;
        tickValue: number };
    try {
        const e = runtime.entities, home = runtime.world.chunks.get("0,0")!;
        const slot = e.spawnEnemy({ x: 1, z: 0, kind: EnemyKind.Grunt, boss: false, elite: false, level: 1,
            region: runtime.world.regionAt(1, 0) }, home);
        runtime.stats = { ...runtime.stats, accuracy: 2, lethalChance: 0 };
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1000;
        const damage = () => { const before = e.vitals.health[slot]; hitEnemy(simulation, slot, 20); return before - e.vitals.health[slot]; };
        const normal = damage(); expect(normal).toBeGreaterThan(0);
        e.status.apply(StatusKind.Protection, e.world.ids[slot], e.world.ids[slot], ENEMY_SPECIAL.healingWard.reduction, runtime.tickValue + 10, runtime.tickValue);
        expect(damage()).toBeCloseTo(normal * .75);
        runtime.tickValue = e.status.wardUntil[slot];
        expect(damage()).toBeCloseTo(normal);
    } finally { simulation.dispose(); }
});

test.each(["cancel", "target-lost", "owner-killed"])("blood pact interruption (%s) transfers no health", reason => {
    const { world: e, enemy, home, region, behavior } = arena(EnemyKind.Healer);
    const ally = e.spawnEnemy({ x: 1, z: 0, kind: EnemyKind.Grunt, elite: false, boss: false, level: 1, region }, home);
    e.enemy.active[ally] = 1; e.vitals.health[ally] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Heal);
    const release = e.action.hitAt[enemy], health = e.vitals.health[enemy];
    if (reason === "cancel") behavior.cancel(enemy);
    else e.remove(reason === "target-lost" ? ally : enemy);
    advanceEnemyActions(e, release);
    if (reason !== "owner-killed") expect(e.vitals.health[enemy]).toBe(health);
    if (reason !== "target-lost") expect(e.vitals.health[ally]).toBe(1);
    expect(e.effects.buffer.count).toBe(0);
});

test("stone sovereign warns then sweeps an expanding wave, hits once and cancels on interruption", () => {
    const { world: e, enemy, behavior } = arena(EnemyKind.StoneSovereign, true, 4);
    behavior.update(1); expect(e.action.kind[enemy]).toBe(ActorAction.Quake);
    const release = e.action.hitAt[enemy];
    advanceEnemyActions(e, release - 1); expect(e.effects.buffer.count).toBe(0);
    for (let tick = release; tick < release + 60; tick++) advanceEnemyActions(e, tick);
    expect(e.impacts.count).toBe(0);
    for (let tick = release + 60; tick <= e.action.endsAt[enemy]; tick++) advanceEnemyActions(e, tick);
    expect(e.impacts.count).toBe(1); expect(e.effects.buffer.kind[0]).toBe(EffectKind.EnemyQuake);
    behavior.cancel(enemy); expect(e.effects.buffer.count).toBe(0);
});

test("storm oracle releases three staggered locked fans and cancellation prevents remaining waves", () => {
    const { world: e, enemy, behavior } = arena(EnemyKind.StormOracle, true);
    behavior.update(1); expect(e.action.kind[enemy]).toBe(ActorAction.Storm);
    const release = e.action.hitAt[enemy];
    advanceEnemyActions(e, release); expect(e.projectiles.count).toBe(3);
    const heading = e.position.heading[e.projectiles.slots[1]];
    e.position.x[e.player] = 3;
    advanceEnemyActions(e, release + 38); expect(e.projectiles.count).toBe(3);
    advanceEnemyActions(e, release + 39); expect(e.projectiles.count).toBe(6);
    expect(e.position.heading[e.projectiles.slots[4]] - heading).toBeCloseTo(.2);
    advanceEnemyActions(e, release + 78); expect(e.projectiles.count).toBe(9);
    advanceEnemyActions(e, release + 100); expect(e.projectiles.count).toBe(9);
    behavior.cancel(enemy); expect(e.projectiles.count).toBe(9);
    e.action.readyAt[enemy] = e.enemy.specialReadyAt[enemy] = 0;
    behavior.tick = 1000; behavior.attack(enemy); const second = e.action.hitAt[enemy];
    advanceEnemyActions(e, second); expect(e.projectiles.count).toBe(12);
    behavior.cancel(enemy); advanceEnemyActions(e, second + 39); expect(e.projectiles.count).toBe(12);
});

test("ember champion chooses a committed charge at range and a directional sweep up close", () => {
    for (const distance of [2, 5]) {
        const { world: e, enemy, behavior } = arena(EnemyKind.EmberChampion, true, distance);
        behavior.update(1);
        expect(e.action.kind[enemy]).toBe(distance === 2 ? ActorAction.Reave : ActorAction.Charge);
        const release = e.action.hitAt[enemy]; behavior.cancel(enemy); advanceEnemyActions(e, release);
        expect(e.impacts.count).toBe(0); expect(e.position.z[enemy]).toBe(0);
    }
});
