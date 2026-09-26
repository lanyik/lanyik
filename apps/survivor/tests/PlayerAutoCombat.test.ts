import { describe, expect, test, vi } from "vitest";
import { PlayerAutoCombat } from "../src/core/PlayerAutoCombat";
import { LocalNavigationPath } from "../src/core/LocalNavigationPath";
import { AutoCombatThreats } from "../src/core/AutoCombatThreats";
import { ActorAction, CombatWorld, Component, Faction } from "../src/core/CombatWorld";
import { OPEN_TERRAIN, type CombatTerrain } from "../src/core/CombatTerrain";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { applyCombatCommand } from "../src/core/CombatCommand";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { EnemyKind } from "../src/core/EnemyDefinitions";
import { deriveStats } from "../src/core/CombatStats";
import { sumEquipment } from "../src/core/Equipment";
import { createConsumable } from "../src/core/InventoryItem";

const rest = { x: 0, z: 0, active: false };
const stats = deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, sumEquipment({}));
const region = new RegionalWorld("auto-arena", { x: 0, z: 0 }).regionAt(0, 0);
function arena(terrain = OPEN_TERRAIN, regions?: Pick<RegionalWorld, "regionAt">) {
    const e = new CombatWorld(0, 0, terrain), heal = vi.fn();
    e.vitals.health[e.player] = e.vitals.maxHealth[e.player] = stats.maxHealth;
    const chests = { count: 0, x: new Float64Array(3), z: new Float64Array(3), tiers: new Uint8Array(3) };
    const controller = new PlayerAutoCombat(e, chests, heal, regions);
    const spawn = (x: number, z: number) => e.spawnEnemy({ x, z, kind: EnemyKind.Grunt, level: 1, elite: false, boss: false, region }, { resident: true });
    const update = (tick: number, input = rest) => controller.update(input, tick, stats);
    return { e, chests, controller, spawn, update, heal };
}

describe("player auto combat", () => {
    test("wide search weights higher-level regions, keeps targets stable and yields to local combat", () => {
        const a = arena(); a.spawn(-24, 0); const high = a.spawn(28, 0);
        a.e.enemy.regions[high] = { ...region, level: 11 };
        const query = vi.spyOn(a.e, "queryNearby"); a.controller.setEnabled(true);
        expect(a.update(1).x).toBe(1);
        expect(query.mock.calls.filter(call => call[3] > 16).map(call => call[3])).toEqual([32]);
        query.mockClear(); expect(a.update(13).x).toBe(1);
        expect(query.mock.calls.filter(call => call[3] > 16)).toHaveLength(0);
        a.spawn(-2, 0); a.update(25); expect(a.controller.activity).toBe("fight");
    });
    test("empty searches expand at most twice a second and stay inside the resident search bound", () => {
        const a = arena(); a.spawn(49, 0); const query = vi.spyOn(a.e, "queryNearby"); a.controller.setEnabled(true);
        for (let tick = 1; tick <= 120; tick++) expect(a.update(tick).active).toBe(false);
        expect(query.mock.calls.filter(call => call[3] > 16).map(call => call[3])).toEqual([32, 48, 32, 48]);
        const distant = arena(); distant.spawn(40, 0); distant.controller.setEnabled(true);
        expect(distant.update(1)).toMatchObject({ active: true, x: 1 });
    });
    test("empty wilds explore toward higher region levels without creating resident chunks; arenas remain idle", () => {
        const regions = { regionAt: vi.fn((x: number, _z: number) => ({ ...region, level: x > 20 ? 11 : 1 })) };
        const a = arena(OPEN_TERRAIN, regions); a.controller.setEnabled(true);
        const move = a.update(1); expect(move.x).toBeGreaterThan(.5); expect(a.controller.activity).toBe("seek");
        const calls = regions.regionAt.mock.calls.length; a.update(13); expect(regions.regionAt).toHaveBeenCalledTimes(calls);
        const arenaOnly = arena(); arenaOnly.controller.setEnabled(true); expect(arenaOnly.update(1).active).toBe(false);
    });
    test("a safe stationary cast suspends pursuit, but an incoming bolt still preempts it", () => {
        const a = arena(); a.spawn(12, 0); a.controller.setEnabled(true);
        expect(a.update(1).active).toBe(true); expect(a.controller.canStopToCast).toBe(true);
        expect(a.controller.update(rest, 13, stats, 0, 0, true).active).toBe(false);
        a.e.spawnProjectile(0, Faction.Enemy, -3, 0, 5, 0, 1, 2, { height: .8 });
        expect(a.controller.update(rest, 25, stats, 0, 0, true).active).toBe(true);
        expect(a.controller.activity).toBe("evade"); expect(a.controller.canStopToCast).toBe(false);
        const manual = { x: 1, z: 0, active: true };
        expect(a.controller.update(manual, 26, stats, 0, 0, true)).toBe(manual);
    });
    test("shared tree definitions keep controllers' movement and running state independent", () => {
        const first = arena(), second = arena(); first.spawn(12, 0); second.spawn(-12, 0);
        first.controller.setEnabled(true); second.controller.setEnabled(true);
        const forward = first.update(1), backward = second.update(1);
        expect(forward.x).toBe(1); expect(backward.x).toBe(-1);
        first.controller.setEnabled(false);
        expect(second.controller.enabled).toBe(true); expect(second.update(13).x).toBe(-1);
    });
    test("disabled is inert; Z command and autocast are independent and runtime-only", () => {
        const a = arena(); a.spawn(12, 0);
        const query = vi.spyOn(a.e, "queryNearby");
        expect(a.update(1)).toBe(rest); expect(query).not.toHaveBeenCalled();
        const simulation = new CombatSimulation("auto-command");
        expect(simulation.getSnapshot().autoCombat.enabled).toBe(false);
        applyCombatCommand(simulation, { type: "toggle-autocast" });
        applyCombatCommand(simulation, { type: "toggle-auto-combat" });
        expect(simulation.getSnapshot().autoCombat.enabled).toBe(true);
        expect(simulation.getSnapshot().player.autoCast).toBe(false);
        const beforeCast = simulation.getSnapshot().player;
        applyCombatCommand(simulation, { type: "cast-skill", skill: beforeCast.skills.loadout[0]! });
        expect(simulation.getSnapshot().player.mana).toBeLessThan(beforeCast.mana);
        expect(simulation.getSnapshot().autoCombat.enabled).toBe(true);
        const saved = simulation.checkpoint();
        expect(saved).not.toHaveProperty("autoCombat"); expect(saved.player).not.toHaveProperty("autoCombat");
        simulation.restore(saved);
        expect(simulation.getSnapshot().autoCombat.enabled).toBe(false);
        applyCombatCommand(simulation, { type: "toggle-auto-combat" });
        simulation.teleport(0, 0);
        expect(simulation.getSnapshot().autoCombat.enabled).toBe(false);
        simulation.dispose();
        expect(() => simulation.toggleAutoCombat()).toThrow(/closed/);
        const home = new CombatSimulation("home-auto", { x: 0, z: 0 }, undefined, OPEN_TERRAIN, "homestead");
        home.toggleAutoCombat(); expect(home.getSnapshot().autoCombat.enabled).toBe(false); home.dispose();
    });

    test("manual movement takes priority immediately and resumes after the release grace period", () => {
        const a = arena(); a.spawn(12, 0); a.controller.setEnabled(true);
        expect(a.update(1)).toMatchObject({ active: true, x: 1, z: 0 });
        const manual = { active: true, x: -1, z: 0 };
        expect(a.update(2, manual)).toBe(manual); expect(a.controller.activity).toBe("manual");
        expect(a.update(20)).toMatchObject({ active: false });
        expect(a.update(60)).toMatchObject({ active: true, x: 1 });
        a.controller.setEnabled(false); expect(a.update(61)).toBe(rest);
    });

    test("nearby chests precede searching, combat preempts chests, and empty local search expands", () => {
        const a = arena(); a.controller.setEnabled(true); a.spawn(12, 0);
        a.chests.count = 2; a.chests.x[0] = -4; a.chests.z[1] = 7;
        expect(a.update(1)).toMatchObject({ x: -1, active: true }); expect(a.controller.activity).toBe("chest");
        a.spawn(2, 0);
        // A new hostile in attack range must take precedence over a previously selected distant target.
        a.update(13); expect(a.controller.activity).toBe("fight");
        while (a.e.enemies.count) a.e.remove(a.e.enemies.slots[0]);
        a.chests.count = 0; a.spawn(17, 0);
        expect(a.update(25)).toMatchObject({ active: true, x: 1 }); expect(a.controller.activity).toBe("seek");
    });

    test("target handles cannot follow a recycled enemy slot and equal distances use stable identities", () => {
        const a = arena(); const first = a.spawn(12, 0); a.spawn(-12, 0); a.controller.setEnabled(true);
        expect(a.update(1).x).toBe(1);
        a.e.remove(first);
        const item = a.e.world.create(Component.Position | Component.GroundItem);
        expect(item).toBe(first); a.e.position.x[item] = 100;
        expect(a.update(13).x).toBe(-1);
    });

    test("an occluded nearest enemy cannot hide an attackable enemy behind chest priority", () => {
        const a = arena({ ...OPEN_TERRAIN, traceAttack: (_x, _y, _z, x) => x > .5 ? .5 : Infinity });
        a.spawn(1, 0); a.spawn(-2, 0);
        a.chests.count = 1; a.chests.z[0] = 3; a.controller.setEnabled(true);
        expect(a.update(1)).toMatchObject({ active: false });
        expect(a.controller.activity).toBe("fight");
    });

    test("health checks remain low frequency during held manual input", () => {
        const a = arena(); a.controller.setEnabled(true); a.e.vitals.health[a.e.player] = stats.maxHealth * .4;
        for (let tick = 1; tick <= 120; tick++) a.update(tick, { x: 1, z: 0, active: true });
        expect(a.heal).toHaveBeenCalledTimes(10);
        a.e.vitals.health[a.e.player] = stats.maxHealth; a.update(121);
        expect(a.heal).toHaveBeenCalledTimes(10);
    });

    test("failed or full chests are abandoned instead of holding the player indefinitely", () => {
        const a = arena(); a.controller.setEnabled(true); a.chests.count = 1; a.chests.x[0] = .5;
        a.spawn(12, 0);
        for (let tick = 1; tick <= 205; tick++) a.update(tick);
        expect(a.controller.activity).toBe("seek");
        expect(a.update(206).x).toBe(1);
    });

    test("telegraphed charges immediately preempt combat; manual input interrupts avoidance", () => {
        const a = arena(); const slot = a.spawn(0, -4), e = a.e;
        e.enemy.active[slot] = 1; e.action.kind[slot] = ActorAction.Charge; e.action.hitAt[slot] = 40; e.action.endsAt[slot] = 240;
        a.controller.setEnabled(true);
        const dodge = a.update(1); expect(a.controller.activity).toBe("evade"); expect(Math.abs(dodge.x)).toBeGreaterThan(.1);
        expect(Math.hypot(dodge.x, dodge.z)).toBeCloseTo(1);
        const manual = { x: 0, z: -1, active: true };
        expect(a.update(2, manual)).toBe(manual); expect(a.controller.activity).toBe("manual");
    });

    test("medicine shares manual cooldown/inventory rules and lethal settlement disables automation", () => {
        const simulation = new CombatSimulation("auto-heal");
        const saved = simulation.checkpoint(), potion = createConsumable(1000, "common", "health", 3);
        simulation.restore({ ...saved, player: { ...saved.player, health: 1, inventory: [potion] }, nextItemId: 1001 });
        simulation.toggleAutoCombat(); simulation.step(rest);
        let player = simulation.getSnapshot().player;
        expect(player.health).toBeGreaterThan(1); expect(player.inventory.find(item => item.id === 1000)?.size).toBe(2);
        simulation.useConsumable("health");
        expect(simulation.getSnapshot().player.inventory.find(item => item.id === 1000)?.size).toBe(2);
        const fixture = simulation as unknown as { entities: CombatWorld; resolution: { damageImmunity: number; shieldCooldown: number }; health: number };
        fixture.health = 1; fixture.resolution.damageImmunity = 0; fixture.resolution.shieldCooldown = 1000;
        fixture.entities.impacts.add(0, fixture.entities.world.ids[fixture.entities.player], 1_000_000);
        simulation.step(rest);
        expect(simulation.gameOver).toBe(true); expect(simulation.getSnapshot().autoCombat).toEqual({ enabled: false, activity: "off" });
        simulation.toggleAutoCombat(); expect(simulation.getSnapshot().autoCombat.enabled).toBe(false); simulation.dispose();
    });
});

describe("bounded local paths and threat observation", () => {
    function wall(closed = false) {
        const position = { x: 0, z: 0 };
        const clear = (x: number, z: number, radius: number) => x + radius < 2 || x - radius > 3 || (!closed && Math.abs(z) - radius > 3);
        const terrain: CombatTerrain = { ...OPEN_TERRAIN, isClear: vi.fn(clear), move(x, z, dx, dz, radius) {
            position.x = x; position.z = z;
            const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .05));
            for (let i = 1; i <= count; i++) {
                if (!clear(x + dx * i / count, z + dz * i / count, radius)) break;
                position.x = x + dx * i / count; position.z = z + dz * i / count;
            }
            return position;
        } };
        return terrain;
    }
    test("A* goes around a wall with at most 64 clearance probes per tick and supports cancellation", () => {
        const terrain = wall(), path = new LocalNavigationPath(terrain); path.begin(0, 0, 6, 0, .3);
        for (let tick = 0; tick < 160 && path.status === "searching"; tick++) {
            vi.mocked(terrain.isClear).mockClear(); path.advance();
            expect(vi.mocked(terrain.isClear).mock.calls.length).toBeLessThanOrEqual(64);
        }
        expect(path.status).toBe("ready");
        let x = 0, z = 0, maximumZ = 0;
        for (let step = 0; step < 2401 && path.waypoint(x, z); step++) {
            const moved = terrain.move(x, z, path.x - x, path.z - z, .3, false);
            expect(moved.x).toBeCloseTo(path.x); expect(moved.z).toBeCloseTo(path.z);
            x = moved.x; z = moved.z; maximumZ = Math.max(maximumZ, Math.abs(z));
        }
        expect(x).toBe(6); expect(z).toBe(0); expect(maximumZ).toBeGreaterThan(3);
        path.begin(0, 0, 6, 0, .3); path.cancel(); path.advance(); expect(path.status).toBe("idle");
    });
    test("sealed and out-of-window goals fail with fixed storage and finite work", () => {
        const path = new LocalNavigationPath(wall(true)); path.begin(0, 0, 6, 0, .3);
        for (let tick = 0; tick < 160; tick++) path.advance();
        expect(path.status).toBe("failed"); path.begin(0, 0, 100, 0, .3); expect(path.status).toBe("failed");
    });
    test("the controller follows a detour with normal smoothed movement, then reaches the chest", () => {
        const a = arena(wall()); a.chests.count = 1; a.chests.x[0] = 6; a.controller.setEnabled(true);
        let vx = 0, vz = 0, reached = false;
        for (let tick = 1; tick <= 1800; tick++) {
            const movement = a.update(tick), p = a.e.position, slot = a.e.player;
            vx += ((movement.active ? movement.x * stats.moveSpeed : 0) - vx) * (1 - Math.exp(-36 / 120));
            vz += ((movement.active ? movement.z * stats.moveSpeed : 0) - vz) * (1 - Math.exp(-36 / 120));
            const x = p.x[slot], z = p.z[slot];
            a.e.moveActor(slot, vx / 120, vz / 120); vx = (p.x[slot] - x) * 120; vz = (p.z[slot] - z) * 120;
            if (Math.hypot(p.x[slot] - 6, p.z[slot]) < .95) { reached = true; break; }
        }
        expect(reached).toBe(true);
    });
    test("remote pursuit crosses a local detour using bounded navigation legs", () => {
        const terrain = wall(), move = vi.spyOn(terrain, "move"), a = arena(terrain); a.spawn(40, 0); a.controller.setEnabled(true);
        let reached = false;
        for (let tick = 1; tick <= 3000; tick++) {
            const movement = a.update(tick);
            a.e.moveActor(a.e.player, movement.x * stats.moveSpeed / 120, movement.z * stats.moveSpeed / 120);
            if (a.e.position.x[a.e.player] > 32) { reached = true; break; }
        }
        expect(reached).toBe(true);
        expect(Math.max(...move.mock.calls.map(call => Math.hypot(call[2], call[3])))).toBeLessThanOrEqual(12.000001);
    });
    test("projectile prediction uses hostile live trajectories and ignores friendly fire", () => {
        const a = arena(), threats = new AutoCombatThreats(a.e);
        a.e.spawnProjectile(0, Faction.Player, -1, 0, 4, 0, 1, 3);
        threats.sense(1); expect(threats.risk(0, 0, stats.moveSpeed, 0, 0, 0)).toBe(0);
        a.e.spawnProjectile(0, Faction.Enemy, -1, 0, 4, 0, 1, 3);
        threats.sense(1); expect(threats.risk(0, 0, stats.moveSpeed, 0, 0, 0)).toBeGreaterThan(0);
        a.e.position.z[a.e.player] = 2;
        expect(threats.risk(0, 0, stats.moveSpeed, 0, 0, 0)).toBe(0);
    });
});
