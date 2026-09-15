import { expect, test } from "vitest";
import { SpatialGrid, SpatialQuery } from "../src/core/SpatialGrid";
import { ProjectileBatch, resolveProjectileRange, segmentCircleHit } from "../src/core/ProjectileBatch";
import { CombatWorld, Component, Faction } from "../src/core/CombatWorld";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { prepareProjectileFixture } from "./helpers/ProjectileFixture";
import { advanceProjectiles } from "../src/core/CombatSystems";

test("unsupported coordinates fail before grid traversal and very long queries stay bounded", () => {
    const grid = new SpatialGrid(4), result = new SpatialQuery(4);
    expect(() => grid.update(0, Infinity, 0, 1, 1)).toThrow();
    expect(() => grid.query(1e30, 0, 1e30, 1, 1, result)).toThrow();
    grid.update(0, 0, 0, 1, 1);
    grid.query(-1e9, -1e9, 1e9, 1e9, 1, result);
    expect(result.count).toBe(1); expect(result.visited).toBe(4);
});

test("cell crossings, negative coordinates, hash collisions and slot reuse do not lose or duplicate targets", () => {
    const grid = new SpatialGrid(64), result = new SpatialQuery(64);
    const positions = Array.from({ length: 64 }, (_, slot) => ({ x: slot % 8 * 4 - 16, z: Math.floor(slot / 8) * 4 - 16, alive: true }));
    const check = () => {
        grid.query(-8, -8, 7.99, 7.99, 1, result);
        const expected = positions.flatMap((p, i) => p.alive && p.x >= -8 && p.x < 8 && p.z >= -8 && p.z < 8 ? [i] : []);
        expect(Array.from(result.slots.subarray(0, result.count)).sort((a, b) => a - b)).toEqual(expected);
    };
    for (let i = 0; i < 64; i++) grid.update(i, positions[i].x, positions[i].z, .3, 1);
    check();
    for (let i = 0; i < 64; i += 3) { grid.remove(i); positions[i].alive = false; }
    check();
    for (let i = 0; i < 64; i++) {
        const p = positions[i]; p.x += 8; p.z -= 4; p.alive = true;
        grid.update(i, p.x, p.z, .3, 1);
    }
    check();
    grid.query(100, 100, 101, 101, 1, result);
    expect(result.count).toBe(0);
});

test("combat target queries include overlapping large bodies and remove recycled enemy identities", () => {
    const world = new CombatWorld(-1, -1), regions = new RegionalWorld("spatial", { x: 0, z: 0 });
    regions.synchronize(0, 0);
    const slot = world.spawnEnemy({ x: 4.1, z: 0, kind: 2, boss: true, elite: false, level: 1, region: regions.regionAt(0, 0) }, regions.chunks.get("0,0")!);
    const id = world.world.ids[slot];
    expect(world.queryNearby(Component.Enemy, 0, 0, 3, true).count).toBe(1);
    expect(world.queryNearby(Component.Enemy, 0, 0, 3).count).toBe(0);
    world.position.x[slot] = -4.1; world.updateSpatial(slot, Component.Enemy);
    expect(world.queryNearby(Component.Enemy, -4, 0, .2).count).toBe(1);
    world.remove(slot); world.spawnExperience(-4.1, 0, 2);
    expect(world.world.resolve(id)).toBe(-1);
    expect(world.queryNearby(Component.Enemy, -4, 0, 2).count).toBe(0);
    expect(world.queryNearby(Component.Experience, -4, 0, 2).count).toBe(1);
});

test("projectile candidates map maintained entity slots into snapshots after swaps, moves and pickup reuse", () => {
    const entities = new CombatWorld(0, 0), regions = new RegionalWorld("live-spatial", { x: 0, z: 0 });
    regions.synchronize(0, 0);
    const home = regions.chunks.get("0,0")!, region = regions.regionAt(0, 0);
    const spawn = (x: number) => entities.spawnEnemy({ x, z: 0, kind: 0, boss: false, elite: false, level: 1, region }, home);
    const removed = spawn(1), near = spawn(2), middle = spawn(4);
    entities.remove(removed); entities.spawnExperience(1, 0, 1);
    const far = spawn(6);
    const fire = () => {
        entities.impacts.count = 0;
        entities.spawnProjectile(entities.world.ids[entities.player], Faction.Player, 0, 0, 1200, 0, 1, 1);
        advanceProjectiles(entities);
        expect(entities.impacts.count).toBe(1);
        return entities.impacts.target[0];
    };
    expect(fire()).toBe(entities.world.ids[near]);
    entities.position.x[near] = 100; entities.updateSpatial(near, Component.Enemy);
    entities.remove(middle); entities.spawnExperience(4, 0, 1);
    expect(fire()).toBe(entities.world.ids[far]);
});

test("grid collision results equal exhaustive earliest-hit queries over mixed sweeps and radii", () => {
    let seed = 19;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 2 ** 32; };
    const batch = new ProjectileBatch();
    batch.enemyCount = 640; batch.count = 128; batch.setPlayer(700, -2, 5, .3, 0, 1.6);
    for (let round = 0; round < 12; round++) {
        for (let i = 0; i < batch.enemyCount; i++) {
            batch.enemyIds[i] = 2 ** 33 + 640 - i;
            batch.enemyX[i] = random() * 160 - 80; batch.enemyZ[i] = random() * 160 - 80;
            batch.enemyRadius[i] = random() * 3;
        }
        // Identical intersections exercise the full-handle tie break.
        batch.enemyX[1] = batch.enemyX[0]; batch.enemyZ[1] = batch.enemyZ[0]; batch.enemyRadius[1] = batch.enemyRadius[0];
        for (let shot = 0; shot < batch.count; shot++) {
            batch.startX[shot] = random() * 160 - 80; batch.startZ[shot] = random() * 160 - 80;
            batch.endX[shot] = batch.startX[shot] + (random() - .5) * (shot % 3 ? 1 : 800);
            batch.endZ[shot] = batch.startZ[shot] + (random() - .5) * (shot % 3 ? 1 : 800);
            batch.hostile[shot] = shot % 5 === 0 ? 1 : 0; batch.radius[shot] = random() * .5;
        }
        batch.hostile[1] = 0; batch.startX[1] = batch.endX[1] = batch.enemyX[0]; batch.startZ[1] = batch.endZ[1] = batch.enemyZ[0];
        prepareProjectileFixture(batch); resolveProjectileRange(batch);
        for (let shot = 0; shot < batch.count; shot++) {
            let nearest = Infinity, expected = 0;
            const check = (id: number, x: number, z: number, radius: number) => {
                const t = segmentCircleHit(batch.startX[shot], batch.startZ[shot], batch.endX[shot], batch.endZ[shot], x, z, radius + batch.radius[shot]);
                if (t < nearest || t !== Infinity && t === nearest && id < expected) { nearest = t; expected = id; }
            };
            if (batch.hostile[shot]) check(700, -2, 5, .3);
            else for (let i = 0; i < batch.enemyCount; i++) check(batch.enemyIds[i], batch.enemyX[i], batch.enemyZ[i], batch.enemyRadius[i]);
            expect(batch.targets[shot]).toBe(expected);
        }
    }
});

test("sparse projectile work is proportional to nearby targets, with inclusive tangent boundaries", () => {
    const batch = new ProjectileBatch(); batch.enemyCount = 640; batch.count = 128;
    for (let i = 0; i < 640; i++) { batch.enemyX[i] = 20 + i % 20 * 4; batch.enemyZ[i] = 20 + Math.floor(i / 20) * 4; batch.enemyIds[i] = i + 1; }
    batch.enemyRadius.fill(.5); batch.radius.fill(.5); batch.endX.fill(4);
    prepareProjectileFixture(batch);
    expect(batch.candidateCounts.every(count => count === 0)).toBe(true);
    batch.enemyX[0] = 2; batch.enemyZ[0] = 1;
    prepareProjectileFixture(batch); resolveProjectileRange(batch);
    expect(batch.targets.every(target => target === 1)).toBe(true);
    expect(batch.candidateCounts.every(count => count === 1)).toBe(true);
});
