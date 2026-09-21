import { expect, test } from "vitest";
import { segmentCylinderHit } from "../src/core/AttackGeometry";
import { OPEN_TERRAIN, type CombatTerrain } from "../src/core/CombatTerrain";
import { ActorAction, CombatWorld, Faction, MoveIntent } from "../src/core/CombatWorld";
import { advanceEnemyActions, advanceProjectiles, moveEnemies } from "../src/core/CombatSystems";
import { EnemyBehavior } from "../src/core/EnemyBehavior";
import { EnemyKind } from "../src/core/EnemyDefinitions";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { SkillSystem } from "../src/core/SkillSystem";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { initialSkillRanks, nodeIndex } from "../src/core/SkillBuild";

const regions = new RegionalWorld("attack-cover", { x: 0, z: 0 }); regions.synchronize(0, 0);
// Infinite vertical wall at x=2. Navigation and attack obstruction are deliberately separate contracts.
const wall: CombatTerrain = { ...OPEN_TERRAIN,
    isClear: (x, _z, radius) => Math.abs(x - 2) > radius,
    traceAttack(sx, sy, sz, ex, ey, ez, radius) {
        const ground = OPEN_TERRAIN.traceAttack(sx, sy, sz, ex, ey, ez, radius);
        if (Math.abs(sx - 2) <= radius) return 0;
        if (sx < 2 && ex >= 2 - radius) return Math.min(ground, (2 - radius - sx) / (ex - sx));
        if (sx > 2 && ex <= 2 + radius) return Math.min(ground, (2 + radius - sx) / (ex - sx));
        return ground;
    }
};
function arena(terrain = wall) {
    const e = new CombatWorld(0, 0, terrain), home = regions.chunks.get("0,0")!;
    const spawn = (x: number, z = 0, kind = EnemyKind.Grunt) => e.spawnEnemy({ x, z, kind, level: 1, elite: false, boss: false,
        region: regions.regionAt(x, z) }, home);
    return { e, spawn };
}

test("cylinder sweeps distinguish overhead misses, vertical entry, start-inside and high-speed contact", () => {
    const hit = (sx: number, sy: number, ex: number, ey: number) => segmentCylinderHit(sx, sy, 0, ex, ey, 0, 0, 0, 0, 2, 1);
    expect(hit(-10, 1, 10, 1)).toBeCloseTo(.45);
    expect(hit(-10, 3, 10, 3)).toBe(Infinity);
    expect(hit(0, 3, 0, -1)).toBe(.25);
    expect(hit(-2, 4, 2, 0)).toBe(.5); // radial entry at .25, vertical entry later
    expect(hit(-2, 8, 2, 4)).toBe(Infinity);
    expect(hit(0, 1, 0, 1)).toBe(0);
    expect(hit(2, 1, 3, 1)).toBe(Infinity);
});

test.each([Faction.Player, Faction.Enemy])("fast projectiles stop at cover before hitting faction %s's target", faction => {
    const { e, spawn } = arena();
    const enemy = spawn(4), source = faction === Faction.Player ? e.player : enemy;
    e.spawnProjectile(e.world.ids[source], faction, faction === Faction.Player ? 0 : 4, 0, faction === Faction.Player ? 1000 : -1000, 0, 10, 1, { height: .8 });
    advanceProjectiles(e);
    expect(e.impacts.count).toBe(0); expect(e.projectiles.count).toBe(0);
});

test("an actor in front of cover is hit before the remaining sweep reaches the wall", () => {
    const { e, spawn } = arena(), target = spawn(1);
    e.spawnProjectile(e.world.ids[e.player], Faction.Player, 0, 0, 1000, 0, 10, 1, { height: .8 });
    advanceProjectiles(e);
    expect(e.impacts.count).toBe(1); expect(e.impacts.target[0]).toBe(e.world.ids[target]);
});

test("solid cover wins a contact shared with an actor's body", () => {
    const { e, spawn } = arena(), target = spawn(2.3);
    e.position.x[target] = 2 + e.position.radius[target];
    e.spawnProjectile(e.world.ids[e.player], Faction.Player, 0, 0, 1000, 0, 10, 1, { height: .8 });
    advanceProjectiles(e);
    expect(e.impacts.count).toBe(0); expect(e.projectiles.count).toBe(0);
});

test("shots can pass over a small creature; vertical position advances independently of terrain", () => {
    const { e, spawn } = arena(OPEN_TERRAIN); spawn(4, 0, EnemyKind.Scout);
    e.spawnProjectile(e.world.ids[e.player], Faction.Player, 0, 0, 1000, 0, 10, 1, { height: 2, velocityY: -12 });
    const slot = e.projectiles.slots[0]; advanceProjectiles(e);
    expect(e.impacts.count).toBe(0); expect(e.projectiles.count).toBe(1);
    expect(e.projectile.previousY[slot]).toBe(2); expect(e.projectile.y[slot]).toBeCloseTo(1.9);
});

test.each([2.8, 4])("occluded ranged enemies seek an opening even inside normal attack/retreat range (%s)", distance => {
    const { e, spawn } = arena(), caster = spawn(distance, 0, EnemyKind.Caster), behavior = new EnemyBehavior(e, regions);
    behavior.update(1);
    expect(e.action.kind[caster]).toBeLessThan(ActorAction.Melee);
    expect(e.enemy.intent[caster]).toBe(MoveIntent.Seek);
    const before = e.position.x[caster]; moveEnemies(e, 1);
    expect(e.position.x[caster]).toBeLessThan(before);
});

test("cover acquired during a spell windup cancels its release", () => {
    const { e, spawn } = arena(), caster = spawn(0, 5, EnemyKind.Caster), behavior = new EnemyBehavior(e, regions);
    behavior.update(1); expect(e.action.kind[caster]).toBe(ActorAction.Cast);
    e.position.x[e.player] = 4;
    advanceEnemyActions(e, e.action.hitAt[caster]);
    expect(e.projectiles.count).toBe(0);
});

test("healers cannot select an injured ally through solid cover", () => {
    const { e, spawn } = arena(), healer = spawn(0, 4, EnemyKind.Healer), ally = spawn(4, 4);
    e.enemy.active[ally] = 1; e.vitals.health[ally] = 1;
    new EnemyBehavior(e, regions).update(1);
    expect(e.action.kind[healer]).not.toBe(ActorAction.Heal);
    expect(e.enemy.supportTarget[healer]).toBe(0);
});

test.each(["pulse", "frost", "chain"] as const)("%s excludes occluded targets, including chain jumps", id => {
    const { e, spawn } = arena(), blocked = spawn(2.6), visible = spawn(-2.8), skills = new SkillSystem(e);
    const simulation = new CombatSimulation("skill-reference"), stats = simulation.getSnapshot().player.stats; simulation.dispose();
    e.vitals.mana[e.player] = 100; e.vitals.health[e.player] = stats.maxHealth;
    if (id === "frost") {
        const ranks = initialSkillRanks(); ranks[nodeIndex("icebolt")] = 3; ranks[nodeIndex("icebolt.power")] = 3; ranks[nodeIndex("frost")] = 1;
        skills.points = 7; expect(skills.commitBuild(ranks, 0, 8, false, 0)).toBeNull(); expect(skills.equip(id, 0, 8)).toBe(true);
    }
    if (id === "chain") {
        const ranks = initialSkillRanks(); ranks[nodeIndex("arc")] = 3; ranks[nodeIndex("arc.power")] = 3; ranks[nodeIndex("chain")] = 1;
        skills.points = 7; expect(skills.commitBuild(ranks, 0, 8, false, 0)).toBeNull(); expect(skills.equip(id, 0, 8)).toBe(true);
    }
    const random = new DeterministicRandom(1);
    expect(skills.cast(id, 1, stats, 8, random)).toBe(true);
    skills.advanceCasting(31, random, false, () => {});
    expect(Array.from(e.impacts.target.slice(0, e.impacts.count))).toEqual([e.world.ids[visible]]);
    expect(e.status.slowUntil[blocked]).toBe(0);
});

test("automatic targeting skips a nearer blocked enemy and aims at a visible enemy", () => {
    const simulation = new CombatSimulation("weapon-cover", { x: 0, z: 0 }, undefined, wall);
    const runtime = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; fireWeapon(): void };
    const e = runtime.entities;
    while (e.enemies.count) e.remove(e.enemies.slots[0]);
    const spawn = (x: number) => e.spawnEnemy({ x, z: 0, kind: EnemyKind.Grunt, level: 1, elite: false, boss: false,
        region: runtime.world.regionAt(x, 0) }, runtime.world.chunks.get("0,0")!);
    spawn(3); spawn(-4); runtime.fireWeapon();
    expect(e.projectiles.count).toBe(1); expect(e.projectile.velocityX[e.projectiles.slots[0]]).toBeLessThan(0);
    simulation.dispose();
});
