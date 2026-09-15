import type { CombatResolution } from "../src/core/CombatResolution";
import { ENEMY_DEFINITIONS } from "../src/core/EnemyDefinitions";
import { expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { ActorAction, CombatWorld, Faction } from "../src/core/CombatWorld";
import type { RegionalWorld } from "../src/core/RegionalWorld";
import type { DerivedStats } from "../src/core/CombatStats";

function encounter() {
    const combat = new CombatSimulation("damage-boundary");
    const fixture = combat as unknown as { resolution: CombatResolution; entities: CombatWorld; world: RegionalWorld; stats: DerivedStats;
        autoCast: boolean; attackCooldown: number; health: number };
    const e = fixture.entities;
    for (const chunk of fixture.world.chunks.values()) chunk.chestOpened = true;
    while (e.enemies.count) e.remove(e.enemies.slots[0]);
    fixture.autoCast = false; fixture.attackCooldown = 1000; fixture.resolution.shieldCooldown = 1000;
    fixture.stats = { ...fixture.stats, evasion: 0, blockChance: 0, accuracy: 1.1, thorns: 1, thornsCap: 2 };
    const home = fixture.world.chunks.get("0,0")!;
    const spawn = { x: 0, z: .8, kind: 0 as const, level: 1, elite: false, boss: false, region: fixture.world.regionAt(0, .8) };
    return { combat, fixture, e, home, spawn };
}

test("multiple impacts commit one death and cannot damage a pickup reusing the victim's slot", () => {
    const { combat, e, home, spawn } = encounter();
    const enemy = e.spawnEnemy(spawn, home), id = e.world.ids[enemy];
    e.vitals.health[enemy] = 1;
    for (let shot = 0; shot < 3; shot++) e.spawnProjectile(e.world.ids[e.player], Faction.Player, 0, .5, 0, 20, 100, 1);
    combat.step({ x: 0, z: 0, active: false });
    expect(combat.getSnapshot().kills).toBe(1);
    expect(e.world.resolve(id)).toBe(-1);
    expect(e.experience.count).toBe(1);
    expect(e.experienceValue[e.experience.slots[0]]).toBe(6);
    expect(e.impacts.count).toBe(0);
});

test("automatic attacks include the exact range boundary and exclude targets beyond it", () => {
    for (const beyond of [0, .0001]) {
        const { combat, fixture, e, home, spawn } = encounter();
        e.spawnEnemy({ ...spawn, x: fixture.stats.attackRange + beyond, z: 0 }, home);
        fixture.attackCooldown = 0;
        combat.step({ x: 0, z: 0, active: false });
        expect(e.projectiles.count).toBe(beyond === 0 ? 1 : 0);
        combat.dispose();
    }
});

test("a released hostile bolt damages the player without reflecting into a recycled caster slot", () => {
    const { combat, fixture, e, home, spawn } = encounter();
    const caster = e.spawnEnemy({ ...spawn, x: 20, z: 0 }, home), source = e.world.ids[caster];
    e.spawnProjectile(source, Faction.Enemy, 0, -.5, 0, 30, 15, 1);
    e.remove(caster);
    const replacement = e.spawnEnemy({ ...spawn, x: 20, z: 0 }, home);
    const health = e.vitals.health[replacement], playerHealth = fixture.health;
    combat.step({ x: 0, z: 0, active: false });
    expect(fixture.health).toBeLessThan(playerHealth);
    expect(e.vitals.health[replacement]).toBe(health);
    expect(combat.getSnapshot().kills).toBe(0);
});

test("a lethal melee hit and lethal reflection award the kill while preserving game over", () => {
    const { combat, fixture, e, home, spawn } = encounter();
    const enemy = e.spawnEnemy(spawn, home);
    e.vitals.health[enemy] = 1; e.enemy.damage[enemy] = 10000; fixture.health = 1;
    for (let tick = 0; tick <= ENEMY_DEFINITIONS[0].windupTicks; tick++) combat.step({ x: 0, z: 0, active: false });
    const snapshot = combat.getSnapshot();
    expect(snapshot.gameOver).toBe(true);
    expect(snapshot.player.health).toBe(0);
    expect(snapshot.kills).toBe(1);
    expect(snapshot.player.gold).toBe(2);
    expect(e.enemies.count).toBe(0);
    expect(e.experience.count).toBe(1);
});

test("dash immunity rejects real impacts without consuming the passive shield", () => {
    const { combat, fixture, e, home, spawn } = encounter();
    const source = e.spawnEnemy({ ...spawn, x: 10 }, home);
    const health = fixture.health; fixture.resolution.shieldCooldown = 0;
    combat.castSkill("dash");
    for (let tick = 1; tick <= 30; tick++) {
        e.impacts.add(e.world.ids[source], e.world.ids[e.player], 100);
        combat.step({ x: 0, z: 0, active: false });
    }
    expect(fixture.health).toBe(health); expect(fixture.resolution.shieldCooldown).toBe(0);
    e.impacts.add(e.world.ids[source], e.world.ids[e.player], 100);
    combat.step({ x: 0, z: 0, active: false });
    expect(fixture.resolution.shieldCooldown).toBeGreaterThan(0);
});

test("heavy guard reduces frontal damage only outside its committed attack", () => {
    const damage = (heading: number, action: ActorAction) => {
        const { combat, e, home, spawn } = encounter();
        const enemy = e.spawnEnemy({ ...spawn, kind: 2 }, home);
        e.position.heading[enemy] = heading; e.action.kind[enemy] = action;
        e.impacts.add(e.world.ids[e.player], e.world.ids[enemy], 10);
        const before = e.vitals.health[enemy];
        combat.step({ x: 0, z: 0, active: false });
        return before - e.vitals.health[enemy];
    };
    const unguarded = damage(0, ActorAction.Idle);
    expect(damage(Math.PI, ActorAction.Idle)).toBeCloseTo(unguarded * .6);
    expect(damage(Math.PI, ActorAction.Melee)).toBeCloseTo(unguarded);
});
