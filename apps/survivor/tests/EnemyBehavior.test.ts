import { expect, test } from "vitest";
import { ActorAction, CombatWorld, Faction } from "../src/core/CombatWorld";
import { EnemyBehavior } from "../src/core/EnemyBehavior";
import { advanceEnemyActions, advanceProjectiles, moveEnemies } from "../src/core/CombatSystems";
import { segmentCircleHit } from "../src/core/ProjectileBatch";
import { ENEMY_DEFINITIONS, type EnemyKind } from "../src/core/EnemyDefinitions";
import { MAX_HOSTILE_PROJECTILES } from "../src/core/CombatConfig";
import { RegionalWorld } from "../src/core/RegionalWorld";

function arena(kind: EnemyKind, distance = .8, boss = false) {
    const entities = new CombatWorld(0, distance);
    const regions = new RegionalWorld("behavior", { x: 0, z: 0 }); regions.synchronize(0, distance);
    const home = regions.chunks.get("0,0")!;
    const spawn = { x: 0, z: 0, kind, elite: boss, boss, level: 1, region: regions.regionAt(0, 0) };
    const enemy = entities.spawnEnemy(spawn, home);
    const behavior = new EnemyBehavior(entities, regions);
    const step = (tick: number) => { behavior.update(tick); moveEnemies(entities, tick); advanceEnemyActions(entities, tick); };
    return { entities, enemy, regions, spawn, home, step };
}

test.each([0, 1, 2] as const)("melee kind %i telegraphs, locks facing and commits one hit before recovery", kind => {
    const { entities: e, enemy, step } = arena(kind);
    const definition = ENEMY_DEFINITIONS[kind];
    step(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Melee);
    expect(e.action.progress[enemy]).toBe(0);
    for (let tick = 2; tick <= definition.windupTicks; tick++) step(tick);
    expect(e.impacts.count).toBe(0);
    step(definition.windupTicks + 1);
    expect(e.impacts.count).toBe(1);
    expect(e.action.progress[enemy]).toBeCloseTo(.5);
    for (let tick = definition.windupTicks + 2; tick <= definition.windupTicks + definition.recoveryTicks; tick++) step(tick);
    expect(e.impacts.count).toBe(1);
});

test("stepping sideways during a melee windup avoids its locked strike", () => {
    const { entities: e, step } = arena(0);
    step(1); e.position.x[e.player] = .8; e.position.z[e.player] = 0;
    for (let tick = 2; tick <= 19; tick++) step(tick);
    expect(e.impacts.count).toBe(0);
});

test("crossing into low frequency cancels an attack immediately and unloading clears references", () => {
    const { entities: e, enemy, regions, step } = arena(3, 5);
    step(1);
    const handle = e.world.ids[enemy];
    e.position.z[e.player] = 24; regions.synchronize(0, 24); step(2);
    expect(e.action.kind[enemy]).toBeLessThan(ActorAction.Melee);
    expect(e.enemy.target[enemy]).toBe(0);
    for (let tick = 3; tick < 60; tick++) step(tick);
    expect(e.projectiles.count).toBe(0);
    e.position.z[e.player] = 100; regions.synchronize(0, 100); step(60);
    expect(e.world.resolve(handle)).toBe(-1);
    expect(e.enemy.homes[enemy]).toBeUndefined();
    expect(e.enemy.regions[enemy]).toBeUndefined();
});

test("casters retreat when crowded and fire independently of the released projectile's owner lifetime", () => {
    const { entities: e, enemy, spawn, home, step } = arena(3, 2);
    step(1);
    expect(e.position.z[enemy]).toBeLessThan(0);
    expect(e.action.kind[enemy]).toBe(ActorAction.Moving);
    e.position.z[e.player] = 5;
    step(2);
    const caster = e.world.ids[enemy];
    for (let tick = 3; tick <= 37; tick++) step(tick);
    expect(e.projectiles.count).toBe(1);
    const bolt = e.projectiles.slots[0];
    expect(e.projectile.faction[bolt]).toBe(Faction.Enemy);
    e.remove(enemy);
    const replacement = e.spawnEnemy(spawn, home);
    expect(e.world.resolve(caster)).toBe(-1);
    expect(e.world.ids[replacement]).not.toBe(caster);
    for (let tick = 0; tick < 80 && e.impacts.count === 0; tick++) advanceProjectiles(e);
    expect(e.impacts.count).toBe(1);
    expect(e.impacts.source[0]).toBe(caster);
    expect(e.impacts.target[0]).toBe(e.world.ids[e.player]);
});

test("boss volleys use a fixed spread and never partially spawn at capacity", () => {
    const { entities: e, enemy, step } = arena(3, 5, true);
    step(1);
    for (let tick = 2; tick <= 36; tick++) step(tick);
    expect(e.projectiles.count).toBe(3);
    const slots = e.projectiles.slots;
    expect(e.projectile.velocityX[slots[0]]).toBeLessThan(0);
    expect(e.projectile.velocityX[slots[1]]).toBe(0);
    expect(e.projectile.velocityX[slots[2]]).toBeGreaterThan(0);
    while (e.hostileProjectiles.count < MAX_HOSTILE_PROJECTILES - 1) e.spawnProjectile(e.world.ids[enemy], Faction.Enemy, 50, 50, 0, 0, 1, 1);
    for (let tick = 37; tick < 150; tick++) step(tick);
    expect(e.hostileProjectiles.count).toBe(MAX_HOSTILE_PROJECTILES - 1);
});

test("projectiles hit the first intersected target and expired targets cannot alias a reused slot", () => {
    const { entities: e, enemy, spawn, home } = arena(0, -5);
    e.position.z[enemy] = 3;
    const nearer = e.spawnEnemy({ ...spawn, z: 0 }, home);
    const nearerId = e.world.ids[nearer];
    e.spawnProjectile(e.world.ids[e.player], Faction.Player, 0, -2, 0, 500, 20, 1);
    advanceProjectiles(e);
    expect(e.impacts.target[0]).toBe(nearerId);
    e.remove(nearer); const replacement = e.spawnEnemy(spawn, home);
    expect(e.world.resolve(e.impacts.target[0])).toBe(-1);
    expect(e.world.resolve(e.world.ids[replacement])).toBe(replacement);
    expect(segmentCircleHit(0, 0, 0, 0, 0, 0, 1)).toBe(0);
    expect(segmentCircleHit(0, 0, 0, 0, 3, 0, 1)).toBe(Infinity);
});
