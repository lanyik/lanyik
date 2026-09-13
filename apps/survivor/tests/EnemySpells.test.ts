import { expect, test } from "vitest";
import { ActorAction, CombatWorld } from "../src/core/CombatWorld";
import { EnemyBehavior } from "../src/core/EnemyBehavior";
import { EnemyKind, ENEMY_SPECIAL } from "../src/core/EnemyDefinitions";
import { advanceEnemyActions } from "../src/core/CombatSystems";
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

test.each([false, true])("eruption locks its telegraphed locations and permits dodging (boss %s)", boss => {
    const { world: e, enemy, behavior } = arena(EnemyKind.Caster, boss);
    e.enemy.attackStep[enemy] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Eruption);
    expect(e.action.targetX[enemy]).toBe(0); expect(e.action.targetZ[enemy]).toBe(5);
    const release = e.action.hitAt[enemy]; advanceEnemyActions(e, release - 1);
    expect(e.effects.buffer.count).toBe(0); expect(e.impacts.count).toBe(0);
    e.position.z[e.player] = 8;
    advanceEnemyActions(e, release); advanceEnemyActions(e, release + 1);
    expect(e.impacts.count).toBe(0); expect(e.projectiles.count).toBe(0);
    const effects = e.effects.buffer;
    expect(effects.count).toBe(boss ? 3 : 1);
    for (let i = 0; i < effects.count; i++) {
        expect(effects.kind[i]).toBe(EffectKind.EnemyEruption); expect(effects.z[i]).toBe(5);
        expect(effects.x[i]).toBeCloseTo((i - (effects.count - 1) / 2) * ENEMY_SPECIAL.eruption.spacing);
    }
});

test("boss overlapping eruption edges commit a single damage event, and lost targets cancel windup", () => {
    const { world: e, enemy, behavior } = arena(EnemyKind.Caster, true);
    e.enemy.attackStep[enemy] = 1; behavior.update(1);
    e.position.x[e.player] = ENEMY_SPECIAL.eruption.spacing / 2;
    advanceEnemyActions(e, e.action.hitAt[enemy]); advanceEnemyActions(e, e.action.hitAt[enemy] + 1);
    expect(e.impacts.count).toBe(1); expect(e.impacts.damage[0]).toBeCloseTo(e.enemy.damage[enemy] * ENEMY_SPECIAL.eruption.damage);
    const second = arena(EnemyKind.Caster); second.world.enemy.attackStep[second.enemy] = 1; second.behavior.update(1);
    second.world.position.z[second.world.player] = 25; second.behavior.update(2);
    advanceEnemyActions(second.world, 200);
    expect(second.world.effects.buffer.count).toBe(0); expect(second.world.action.kind[second.enemy]).toBeLessThan(ActorAction.Melee);
});

test("rock guards follow their normal attack with a warned area slam", () => {
    const { world: e, enemy, behavior } = arena(EnemyKind.Guard, false, 2);
    e.enemy.attackStep[enemy] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Slam);
    advanceEnemyActions(e, e.action.hitAt[enemy] - 1); expect(e.impacts.count).toBe(0);
    advanceEnemyActions(e, e.action.hitAt[enemy]); advanceEnemyActions(e, e.action.hitAt[enemy] + 1);
    expect(e.impacts.count).toBe(1); expect(e.effects.buffer.kind[0]).toBe(EffectKind.EnemySlam);
    expect(e.enemy.specialReadyAt[enemy]).toBeGreaterThan(e.action.endsAt[enemy]);
});

test("healing grants a timed protective blessing and a reused entity slot cannot inherit it", () => {
    const { world: e, enemy, home, region, behavior } = arena(EnemyKind.Healer);
    const ally = e.spawnEnemy({ x: 1, z: 0, kind: EnemyKind.Grunt, elite: false, boss: false, level: 1, region }, home);
    e.enemy.active[ally] = 1; e.vitals.health[ally] = 1; behavior.update(1);
    expect(e.action.kind[enemy]).toBe(ActorAction.Heal);
    const hit = e.action.hitAt[enemy]; advanceEnemyActions(e, hit);
    expect(e.vitals.health[ally]).toBeGreaterThan(1);
    expect(e.status.wardUntil[ally]).toBe(hit + ticksForSeconds(ENEMY_SPECIAL.healingWard.duration));
    e.remove(ally);
    const reused = e.spawnEnemy({ x: 1, z: 0, kind: EnemyKind.Grunt, elite: false, boss: false, level: 1, region }, home);
    expect(e.status.wardUntil[reused]).toBe(0);
});

test("a protective blessing reduces committed damage by 25 percent and expires on its deadline", () => {
    const simulation = new CombatSimulation("blessing-damage");
    const runtime = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; stats: DerivedStats;
        tickValue: number; hitEnemy(slot: number, damage: number): void };
    try {
        const e = runtime.entities, home = runtime.world.chunks.get("0,0")!;
        const slot = e.spawnEnemy({ x: 1, z: 0, kind: EnemyKind.Grunt, boss: false, elite: false, level: 1,
            region: runtime.world.regionAt(1, 0) }, home);
        runtime.stats = { ...runtime.stats, accuracy: 2, lethalChance: 0 };
        e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1000;
        const damage = () => { const before = e.vitals.health[slot]; runtime.hitEnemy(slot, 20); return before - e.vitals.health[slot]; };
        const normal = damage(); expect(normal).toBeGreaterThan(0);
        e.status.wardUntil[slot] = runtime.tickValue + 10;
        expect(damage()).toBeCloseTo(normal * .75);
        runtime.tickValue = e.status.wardUntil[slot];
        expect(damage()).toBeCloseTo(normal);
    } finally { simulation.dispose(); }
});
