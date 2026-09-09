import { expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld, Faction } from "../src/core/CombatWorld";
import type { RegionalWorld } from "../src/core/RegionalWorld";
import type { DerivedStats } from "../src/core/CombatStats";

function encounter() {
    const combat = new CombatSimulation("damage-boundary");
    const fixture = combat as unknown as { entities: CombatWorld; world: RegionalWorld; stats: DerivedStats;
        autoCast: boolean; attackCooldown: number; shieldCooldown: number; health: number };
    const e = fixture.entities;
    while (e.enemies.count) e.remove(e.enemies.slots[0]);
    fixture.autoCast = false; fixture.attackCooldown = 1000; fixture.shieldCooldown = 1000;
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
    for (let tick = 0; tick < 19; tick++) combat.step({ x: 0, z: 0, active: false });
    const snapshot = combat.getSnapshot();
    expect(snapshot.gameOver).toBe(true);
    expect(snapshot.player.health).toBe(0);
    expect(snapshot.kills).toBe(1);
    expect(snapshot.player.gold).toBe(2);
    expect(e.enemies.count).toBe(0);
    expect(e.experience.count).toBe(1);
});
