import { expect, test, vi } from "vitest";
import { ActorAction, CombatWorld, Component, MoveIntent } from "../src/core/CombatWorld";
import { OPEN_TERRAIN, type CombatTerrain } from "../src/core/CombatTerrain";
import { EnemyBehavior } from "../src/core/EnemyBehavior";
import { EnemyKind } from "../src/core/EnemyDefinitions";
import { moveEnemies } from "../src/core/CombatSystems";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { SurfaceMotion } from "../src/core/SurfaceMotion";
import { StatusKind } from "../src/core/StatusSystem";
import { LocalNavigationPath } from "../src/core/LocalNavigationPath";

type Wall = readonly [number, number, number, number];
function walls(rectangles: readonly Wall[]): CombatTerrain {
    const contact = (x: number, z: number, r: number) => {
        for (const [left, right, top, bottom] of rectangles) {
            if (x <= left - r || x >= right + r || z <= top - r || z >= bottom + r) continue;
            const gaps = [x - left + r, right + r - x, z - top + r, bottom + r - z];
            const side = gaps.indexOf(Math.min(...gaps));
            return { x: side === 0 ? -1 : side === 1 ? 1 : 0, z: side === 2 ? -1 : side === 3 ? 1 : 0, round: false };
        }
        return undefined;
    };
    const motion = new SurfaceMotion(contact);
    return { ...OPEN_TERRAIN, isClear: vi.fn((x, z, r) => !contact(x, z, r)), move: motion.move.bind(motion),
        traceAttack(sx, _sy, sz, ex, _ey, ez, r) {
            const steps = Math.ceil(Math.hypot(ex - sx, ez - sz) / .05);
            for (let i = 0; i <= steps; i++) if (contact(sx + (ex - sx) * i / steps, sz + (ez - sz) * i / steps, r)) return i / steps;
            return Infinity;
        } };
}
const region = new RegionalWorld("enemy-navigation", { x: 0, z: 0 }).regionAt(0, 0);
function arena(terrain = OPEN_TERRAIN, playerX = 6, playerZ = 0) {
    const e = new CombatWorld(playerX, playerZ, terrain), behavior = new EnemyBehavior(e, { residencyAt: () => "near" });
    const spawn = (x = 0, z = 0, kind = EnemyKind.Grunt, boss = false) => e.spawnEnemy({ x, z, kind, boss, elite: false, level: 1, region }, { resident: true });
    const step = (tick: number) => { e.status.advance(tick); behavior.update(tick); moveEnemies(e, tick); };
    return { e, spawn, step };
}

test.each(["wall", "concave", "return"])("a blocked enemy reaches its goal around %s without penetrating terrain", shape => {
    const rectangles: Wall[] = [[2, 3, -4, 4]];
    if (shape === "concave") rectangles.push([-2, 3, -4, -3.5], [-2, 3, 3.5, 4]);
    const terrain = walls(rectangles), { e, spawn, step } = arena(terrain, shape === "return" ? 28 : 6);
    const slot = spawn(shape === "return" ? 6 : 0);
    if (shape === "return") { e.position.x[slot] = 0; e.enemy.returning[slot] = 1; e.updateSpatial(slot, Component.Enemy); }
    e.action.readyAt[slot] = Infinity;
    let reached = false, minX = 0, maxZ = 0;
    for (let tick = 1; tick <= 4800; tick++) {
        step(tick);
        const x = e.position.x[slot], z = e.position.z[slot];
        expect(terrain.isClear(x, z, e.position.radius[slot])).toBe(true);
        minX = Math.min(minX, x); maxZ = Math.max(maxZ, Math.abs(z));
        if (Math.hypot(x - 6, z) < (shape === "return" ? .1 : 1.1)) { reached = true; break; }
    }
    expect(reached).toBe(true); expect(maxZ).toBeGreaterThan(4.3);
    if (shape === "concave") expect(minX).toBeLessThan(-2.3);
});

test("sealed goals have a shared per-tick search budget and a cooldown, regardless of population", () => {
    const terrain = walls([[2, 3, -50, 50]]), { e, spawn, step } = arena(terrain);
    const slots = Array.from({ length: 12 }, (_, i) => spawn(0, i * .1));
    // Avoid crowd admission probes: this fixture isolates the navigation budget.
    for (const slot of slots) { e.enemy.intent[slot] = MoveIntent.Return; e.enemy.homeX[slot] = 6; e.enemy.returning[slot] = 1; }
    e.position.x[e.player] = 28;
    let queries = 0;
    for (let tick = 1; tick <= 800; tick++) {
        vi.mocked(terrain.isClear).mockClear(); step(tick);
        const probes = vi.mocked(terrain.isClear).mock.calls.length;
        expect(probes).toBeLessThanOrEqual(256); queries += probes;
        for (const slot of slots) expect(e.position.x[slot]).toBeLessThan(1.71);
    }
    expect(queries).toBeGreaterThan(1000);
    expect(e.enemies.count).toBe(12);
});

test("target movement, control and slot reuse discard navigation", () => {
    const { e, spawn, step } = arena(walls([[2, 3, -4, 4]]));
    const slot = spawn(); e.action.readyAt[slot] = Infinity;
    let tick = 1;
    for (; tick < 245; tick++) step(tick);
    const x = e.position.x[slot], z = e.position.z[slot];
    e.status.apply(StatusKind.Frozen, e.world.ids[e.player], e.world.ids[slot], 1, tick + 120, tick);
    for (let end = tick + 60; tick < end; tick++) step(tick);
    expect(e.position.x[slot]).toBe(x); expect(e.position.z[slot]).toBe(z);
    e.position.x[e.player] = -6;
    for (let end = tick + 180; tick < end; tick++) step(tick);
    expect(e.position.x[slot]).toBeLessThan(x - .5);
    const old = e.world.ids[slot]; e.remove(slot);
    const replacement = spawn(-5); expect(replacement).toBe(slot); expect(e.world.ids[replacement]).not.toBe(old);
    step(tick); expect(e.action.kind[slot]).toBe(ActorAction.Melee);
});

test("melee crowds occupy distinct sides and keep space instead of stacking at one stop point", () => {
    const { e, spawn, step } = arena(OPEN_TERRAIN, 0);
    const slots = Array.from({ length: 8 }, (_, i) => spawn(-3 - i * .15, (i % 3 - 1) * .2));
    for (const slot of slots) e.action.readyAt[slot] = Infinity;
    for (let tick = 1; tick <= 2400; tick++) step(tick);
    let nearest = Infinity;
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
        nearest = Math.min(nearest, Math.hypot(e.position.x[slots[i]] - e.position.x[slots[j]], e.position.z[slots[i]] - e.position.z[slots[j]]));
    }
    expect(nearest).toBeGreaterThan(.5);
    expect(slots.filter(slot => Math.hypot(e.position.x[slot], e.position.z[slot]) < 1.1).length).toBeGreaterThanOrEqual(5);
    expect(slots.some(slot => e.position.x[slot] > .3)).toBe(true);
    expect(slots.some(slot => e.position.z[slot] > .5)).toBe(true);
    expect(slots.some(slot => e.position.z[slot] < -.5)).toBe(true);
});

test("a gap admits an ordinary body but not a boss, and copied route turns stay collision-free", () => {
    const terrain = walls([[2, 3, -50, -1], [2, 3, 1, 50]]);
    for (const radius of [.3, 1.15]) {
        const path = new LocalNavigationPath(terrain); path.begin(0, 0, 6, 0, radius);
        for (let i = 0; i < 160 && path.status === "searching"; i++) path.advance();
        expect(path.status).toBe(radius === .3 ? "ready" : "failed");
        if (path.status !== "ready") continue;
        const xs = new Float64Array(32), zs = new Float64Array(32), count = path.copyRoute(xs, zs, 0, 32);
        let x = 0, z = 0;
        for (let i = 0; i < count; i++) {
            const moved = terrain.move(x, z, xs[i] - x, zs[i] - z, radius, false);
            expect(moved.x).toBeCloseTo(xs[i]); expect(moved.z).toBeCloseTo(zs[i]); x = moved.x; z = moved.z;
        }
        expect(x).toBeCloseTo(6);
    }
});

test("outer melee actors fill a released inner position and reused slots inherit no reservation", () => {
    const { e, spawn, step } = arena(OPEN_TERRAIN, 0);
    const slots = Array.from({ length: 12 }, (_, i) => spawn(-3 - i * .15, (i % 3 - 1) * .2));
    for (const slot of slots) e.action.readyAt[slot] = Infinity;
    let tick = 1;
    for (; tick <= 2400; tick++) step(tick);
    const inner = slots.filter(slot => Math.hypot(e.position.x[slot], e.position.z[slot]) < 1.1);
    expect(inner.length).toBeGreaterThanOrEqual(5);
    const outer = slots.filter(slot => !inner.includes(slot));
    for (const slot of inner) e.remove(slot);
    const replacement = spawn(10);
    expect(e.crowd.canAttack(replacement)).toBe(true);
    for (; tick <= 3600; tick++) step(tick);
    expect(outer.filter(slot => Math.hypot(e.position.x[slot], e.position.z[slot]) < 1.1).length).toBeGreaterThanOrEqual(3);
});

test("coincident crowds separate deterministically and steering cannot cross a terrain wall", () => {
    const replay = () => {
        const terrain = walls([[-2, -1, -50, 50]]), { e, spawn, step } = arena(terrain, 0);
        const slots = Array.from({ length: 6 }, () => spawn(-.6));
        for (const slot of slots) e.action.readyAt[slot] = Infinity;
        for (let tick = 1; tick <= 600; tick++) {
            step(tick);
            for (const slot of slots) expect(terrain.isClear(e.position.x[slot], e.position.z[slot], e.position.radius[slot])).toBe(true);
        }
        return slots.map(slot => [e.position.x[slot], e.position.z[slot], e.enemy.intent[slot]]);
    };
    expect(replay()).toEqual(replay());
});

test.each([EnemyKind.Grunt, EnemyKind.Caster])("kind %i approaches a target beside cover instead of stopping across it", kind => {
    const terrain = walls([[2, 2.1, -3, 3]]), { e, spawn, step } = arena(terrain, 2.42);
    const slot = spawn(1.6, 0, kind); e.action.readyAt[slot] = Infinity;
    let reached = false;
    for (let tick = 1; tick <= 2400; tick++) {
        step(tick);
        if (e.position.x[slot] > 2.4 && e.canSee(slot, e.player)) { reached = true; break; }
    }
    expect(reached).toBe(true);
});

test.each(["target", "reuse", "teleport"])("an in-flight search is canceled immediately after %s", change => {
    const { e, spawn, step } = arena(walls([[2, 3, -4, 4]]));
    let slot = spawn(); e.action.readyAt[slot] = Infinity;
    let tick = 1;
    for (; tick < 500; tick++) { step(tick); if (e.navigation.steer(slot, tick) === 2) break; }
    expect(tick).toBeLessThan(500);
    if (change === "target") e.position.x[e.player] = -6;
    if (change === "reuse") { const old = slot; e.remove(slot); slot = spawn(-3); expect(slot).toBe(old); }
    if (change === "teleport") { e.position.x[slot] = -5; e.updateSpatial(slot, Component.Enemy); }
    const before = e.position.x[slot]; step(++tick);
    expect(e.navigation.steer(slot, tick)).toBe(0);
    if (change === "target") expect(e.position.x[slot]).toBeLessThan(before);
    else expect(e.position.x[slot]).toBeGreaterThan(before);
});

test("return navigation connects a conservative route to a clear home beside a wall", () => {
    const { e, spawn, step } = arena(walls([[2, 3, -3, 3]]), 26);
    const slot = spawn(3.45); e.position.x[slot] = 0; e.enemy.returning[slot] = 1; e.updateSpatial(slot, Component.Enemy);
    let returned = false;
    for (let tick = 1; tick <= 2400; tick++) {
        step(tick);
        if (Math.hypot(e.position.x[slot] - 3.45, e.position.z[slot]) < .05) { returned = true; break; }
    }
    expect(returned).toBe(true);
});
