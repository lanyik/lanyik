import { expect, test, vi } from "vitest";
import { PlayerAutoCombat } from "../src/core/PlayerAutoCombat";
import { AutoCombatThreats } from "../src/core/AutoCombatThreats";
import { ActorAction, CombatWorld, Faction } from "../src/core/CombatWorld";
import { OPEN_TERRAIN, type CombatTerrain } from "../src/core/CombatTerrain";
import { deriveStats } from "../src/core/CombatStats";
import { sumEquipment } from "../src/core/Equipment";
import { advanceEnemyActions, advanceProjectiles } from "../src/core/CombatSystems";
import { ENEMY_SPECIAL, EnemyKind } from "../src/core/EnemyDefinitions";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { ticksForSeconds } from "../src/core/GameConfig";

const rest = { x: 0, z: 0, active: false };
const stats = deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, sumEquipment({}));
const region = new RegionalWorld("avoidance", { x: 0, z: 0 }).regionAt(0, 0);

test("forecast endpoint reuse retains grazing contact and resets when a projectile slot is reused", () => {
    const e = new CombatWorld(0, 0), threats = new AutoCombatThreats(e);
    const spawn = (z: number) => {
        e.spawnProjectile(0, Faction.Enemy, -4, z, 5, 0, 1, 2, { height: .8 });
        const slot = e.hostileProjectiles.slots[0]; e.position.radius[slot] = .2; return slot;
    };
    const first = spawn(.619); threats.sense(1);
    expect(threats.risk(0, 0, 5, 0, 0, 0)).toBeGreaterThan(0); // .3 body + .2 projectile + .12 margin.
    e.remove(first); spawn(.621); threats.sense(2);
    expect(threats.risk(0, 0, 5, 0, 0, 0)).toBe(0);
});
const attacks = [
    { kind: ActorAction.Melee, distance: 1, windup: .36, duration: .64 },
    { kind: ActorAction.Charge, distance: 5, ...ENEMY_SPECIAL.charge },
    { kind: ActorAction.Reave, distance: 2, ...ENEMY_SPECIAL.reave },
    { kind: ActorAction.Fault, distance: 4, ...ENEMY_SPECIAL.fault },
    { kind: ActorAction.Jaws, distance: 5, ...ENEMY_SPECIAL.jaws },
    { kind: ActorAction.Quake, distance: 3, ...ENEMY_SPECIAL.quake },
    { kind: ActorAction.Cast, distance: 5, windup: .7, duration: 1.3 },
    { kind: ActorAction.Volley, distance: 5, duration: .85, ...ENEMY_SPECIAL.volley },
    { kind: ActorAction.Storm, distance: 5, duration: 1.1, ...ENEMY_SPECIAL.storm }
];
type Attack = typeof attacks[number];
function arena(attack: Attack, enabled: boolean, heading = 0, terrain = OPEN_TERRAIN) {
    const e = new CombatWorld(Math.sin(heading) * attack.distance, Math.cos(heading) * attack.distance, terrain);
    e.vitals.health[e.player] = stats.maxHealth;
    const boss = attack.kind === ActorAction.Jaws || attack.kind === ActorAction.Reave || attack.kind === ActorAction.Quake || attack.kind === ActorAction.Storm;
    const slot = e.spawnEnemy({ x: 0, z: 0, kind: EnemyKind.Caster, boss, elite: false, level: 1, region }, { resident: true });
    const a = e.action;
    e.enemy.active[slot] = 1; e.position.heading[slot] = heading;
    a.kind[slot] = attack.kind; a.started[slot] = 1; a.hitAt[slot] = 1 + ticksForSeconds(attack.windup);
    a.endsAt[slot] = a.hitAt[slot] + ticksForSeconds(attack.duration); a.target[slot] = e.world.ids[e.player];
    a.targetX[slot] = e.position.x[e.player]; a.targetZ[slot] = e.position.z[e.player]; a.variant[slot] = boss ? 5 : 3;
    a.reach[slot] = attack.kind === ActorAction.Melee ? 1.2 : 9;
    const chests = { count: 0, x: new Float64Array(1), z: new Float64Array(1), tiers: new Uint8Array(1) };
    const controller = new PlayerAutoCombat(e, chests, () => {}); controller.setEnabled(enabled);
    let vx = 0, vz = 0, evaded = false, travel = 0;
    const step = (tick: number) => {
        const movement = controller.update(rest, tick, stats, vx, vz), p = e.position, player = e.player;
        evaded ||= controller.activity === "evade";
        expect(Math.hypot(movement.x, movement.z)).toBeLessThanOrEqual(1.000001);
        vx += ((movement.active ? movement.x * stats.moveSpeed : 0) - vx) * (1 - Math.exp(-36 / 120));
        vz += ((movement.active ? movement.z * stats.moveSpeed : 0) - vz) * (1 - Math.exp(-36 / 120));
        const x = p.x[player], z = p.z[player]; p.previousX[player] = x; p.previousZ[player] = z;
        e.moveActor(player, vx / 120, vz / 120); vx = (p.x[player] - x) * 120; vz = (p.z[player] - z) * 120;
        travel += Math.hypot(p.x[player] - x, p.z[player] - z);
        advanceProjectiles(e); advanceEnemyActions(e, tick);
    };
    return { e, slot, controller, chests, step, results: () => ({ hits: e.impacts.count, evaded, travel }) };
}

test.each(attacks)("avoids real $kind contacts through windup, release and recovery", attack => {
    for (const heading of [0, Math.PI * .37]) {
        const stationary = arena(attack, false, heading), automatic = arena(attack, true, heading);
        for (let tick = 1; tick <= 600; tick++) { stationary.step(tick); automatic.step(tick); }
        expect(stationary.results().hits, `standing ${ActorAction[attack.kind]} ${heading}`).toBeGreaterThan(0);
        expect(automatic.results(), `automatic ${ActorAction[attack.kind]} ${heading}`).toMatchObject({ hits: 0, evaded: true });
    }
});

test("jaws escape continues past the old 1.5-unit dodge and takes priority over a chest", () => {
    const a = arena(attacks[4], true);
    a.chests.count = 1; a.chests.x[0] = 1; a.chests.z[0] = 5;
    for (let tick = 1; tick <= 300; tick++) a.step(tick);
    expect(a.results()).toMatchObject({ hits: 0, evaded: true });
    expect(a.results().travel).toBeGreaterThan(3);
});

test("an obstructed escape direction is scored using achieved movement", () => {
    const moved = { x: 0, z: 0 };
    const terrain: CombatTerrain = { ...OPEN_TERRAIN, move(x, z, dx, dz, radius) {
        moved.x = Math.min(.65 - radius, x + dx); moved.z = z + dz; return moved;
    } };
    const a = arena(attacks[3], true, 0, terrain);
    for (let tick = 1; tick <= 400; tick++) a.step(tick);
    expect(a.results()).toMatchObject({ hits: 0, evaded: true });
});

test("a second attack inside 1.8 seconds can trigger another escape", () => {
    const a = arena(attacks[3], true);
    for (let tick = 1; tick <= 90; tick++) a.step(tick);
    const p = a.e.position, target = a.e.player;
    a.e.spawnProjectile(0, Faction.Enemy, p.x[target] - 1.2, p.z[target], 4.5, 0, 10, 1);
    for (let tick = 91; tick <= 400; tick++) a.step(tick);
    expect(a.results().hits).toBe(0);
});

test("forecast work has a fixed movement budget and ignores projectiles behind cover", () => {
    const terrain: CombatTerrain = { ...OPEN_TERRAIN, move: vi.fn(OPEN_TERRAIN.move), traceAttack: () => 0 };
    const a = arena(attacks[0], true, 0, terrain), threats = new AutoCombatThreats(a.e);
    a.e.action.committed[a.slot] = 1;
    a.e.spawnProjectile(0, Faction.Enemy, 0, -1, 0, 5, 10, 2);
    threats.sense(1); expect(threats.risk(0, 0, stats.moveSpeed, 0, 0, 0)).toBe(0);
    a.e.action.committed[a.slot] = 0; vi.mocked(terrain.move).mockClear();
    a.controller.update(rest, 1, stats);
    expect(vi.mocked(terrain.move).mock.calls.length).toBeLessThanOrEqual(18 * 24 + 1);
});

test("forecasts curved live blades, including those whose initial straight line misses", () => {
    const a = arena(attacks[0], true), e = a.e;
    e.action.committed[a.slot] = 1; e.position.z[e.player] = 4.5;
    e.spawnProjectile(0, Faction.Enemy, -1.7, 0, 0, 4.5, 10, 2, { turnRate: .65 });
    const threats = new AutoCombatThreats(e); threats.sense(1);
    expect(threats.risk(0, 0, stats.moveSpeed, 0, 0, 0)).toBeGreaterThan(0);
    for (let tick = 1; tick <= 300; tick++) a.step(tick);
    expect(a.results().hits).toBe(0);
});

test("a safe endpoint cannot conceal a projectile crossing along the route", () => {
    const a = arena(attacks[0], false), e = a.e; e.action.committed[a.slot] = 1; e.position.z[e.player] = 0;
    e.spawnProjectile(0, Faction.Enemy, 2, -2, 0, 4, 10, 2);
    const threats = new AutoCombatThreats(e); threats.sense(1);
    expect(threats.risk(0, 0, 4, 0, 0, 0)).toBe(0);
    expect(threats.risk(1, 0, 4, 6, 0, 0)).toBeGreaterThan(0);
});

test("vertical entry before a short projectile expires still counts as danger", () => {
    const a = arena(attacks[0], false), e = a.e; e.action.committed[a.slot] = 1;
    e.spawnProjectile(0, Faction.Enemy, 0, 1, 0, 0, 10, .08, { height: 1.9, velocityY: -4 });
    const threats = new AutoCombatThreats(e); threats.sense(1);
    expect(threats.risk(0, 0, stats.moveSpeed, 0, 0, 0)).toBeGreaterThan(0);
    for (let tick = 1; tick <= 12; tick++) a.step(tick);
    expect(a.results().hits).toBe(1);
});

test.each([
    { kind: ActorAction.Cast, committed: 1, hitAt: 280 },
    { kind: ActorAction.Volley, committed: 1, hitAt: 280 },
    { kind: ActorAction.Storm, committed: ENEMY_SPECIAL.storm.waves, hitAt: 100 },
    { kind: ActorAction.Charge, committed: 1, hitAt: 280 },
    { kind: ActorAction.Quake, committed: 3, hitAt: 280 },
    { kind: ActorAction.Reave, committed: 3, hitAt: 280 },
    { kind: ActorAction.Fault, committed: 0, hitAt: 1 },
    { kind: ActorAction.Jaws, committed: 0, hitAt: 1 },
    { kind: ActorAction.Cast, committed: 0, hitAt: 1000 }
])("spent or out-of-horizon $kind attacks cannot displace a pending melee threat", ({ kind, committed, hitAt }) => {
    const a = arena(attacks[0], true), e = a.e;
    e.action.hitAt[a.slot] = 340; e.action.endsAt[a.slot] = 600;
    for (let index = 0; index < 8; index++) {
        const slot = e.spawnEnemy({ x: .1, z: 1, kind: EnemyKind.Caster, boss: false, elite: false, level: 1, region }, { resident: true });
        e.enemy.active[slot] = 1; e.action.kind[slot] = kind; e.action.committed[slot] = committed;
        e.action.hitAt[slot] = hitAt; e.action.endsAt[slot] = 1200; e.action.variant[slot] = 1;
    }
    const threats = new AutoCombatThreats(e); threats.sense(300);
    expect(threats.risk(0, 0, stats.moveSpeed, 0, 0, 0)).toBeGreaterThan(0);
});
