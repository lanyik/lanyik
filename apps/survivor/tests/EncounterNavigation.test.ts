import { expect, test } from "vitest";
import { OPEN_TERRAIN, type CombatTerrain } from "../src/core/CombatTerrain";
import { EncounterNavigation } from "../src/core/EncounterNavigation";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { CombatSimulation } from "../src/core/CombatSimulation";
import type { CombatWorld } from "../src/core/CombatWorld";
import { ENEMY_DEFINITIONS } from "../src/core/EnemyDefinitions";

function terrainWith(isClear: CombatTerrain["isClear"]): CombatTerrain {
    return { ...OPEN_TERRAIN, isClear,
        move(x, z, dx, dz, radius) {
            const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .025));
            let t = 0;
            for (let i = 1; i <= steps && isClear(x + dx * i / steps, z + dz * i / steps, radius); i++) t = i / steps;
            return { x: x + dx * t, z: z + dz * t };
        }
    };
}
const divided = terrainWith((x, _z, radius) => Math.abs(x - 2) > radius);

test("a clear but enclosed pocket cannot host a key encounter", () => {
    const terrain = terrainWith((x, z, radius) => {
        const d = Math.hypot(x - 6, z - 6);
        return d + radius < 2 || d - radius > 3;
    });
    const navigation = new EncounterNavigation(terrain, 0, 0);
    expect(terrain.isClear(6, 6, .9)).toBe(true);
    const point = navigation.nearest(6, 6, .9)!;
    expect(point).toBeDefined(); expect(Math.hypot(point.x - 6, point.z - 6)).toBeGreaterThan(3.9);
    expect(navigation.borders[point.component].length).toBeGreaterThan(0);
});

test("cardinal components do not cut diagonal corners or cross a thin wall", () => {
    const navigation = new EncounterNavigation(divided, -6, -6);
    expect(navigation.componentAt(0, 0)).not.toBe(navigation.componentAt(4, 0));
    const pinched = terrainWith((x, z, radius) => x + radius < 6 && z + radius < 6 || x - radius > 6 && z - radius > 6);
    const corners = new EncounterNavigation(pinched, 0, 0);
    expect(corners.componentAt(3, 3)).not.toBe(corners.componentAt(9, 9));
});

test("resident portal propagation distinguishes disconnected land from a route around a wall", () => {
    for (const opening of [false, true]) {
        const terrain = opening ? terrainWith((x, z, radius) => Math.abs(x - 2) > radius || Math.abs(z) > 9 + radius) : divided;
        const regions = new RegionalWorld("encounter-access", { x: 0, z: 0 }, terrain); regions.synchronize(0, 0);
        regions.updateAccess(0, 0);
        const home = regions.chunks.get("0,0")!;
        expect(home.navigation.isReached(0, 0)).toBe(true);
        expect(home.navigation.isReached(4, 0)).toBe(opening);
        expect(regions.updateAccess(.1, .1)).toBe(false);
        if (!opening) {
            regions.updateAccess(4, 0); // a separately validated entry, e.g. arriving from outside the resident window
            expect(home.navigation.isReached(4, 0)).toBe(true);
            regions.resetAccess(); regions.updateAccess(0, 0);
            expect(home.navigation.isReached(4, 0)).toBe(false);
        }
    }
});

test("invalid horror centers relocate within their owning region; support shares a walkable component", () => {
    const probe = new RegionalWorld("boss-placement", { x: 0, z: 0 });
    const horror = probe.nearbyRegions(probe.regionAt(0, 0), 4).find(region => region.difficulty === "horror")!;
    expect(horror).toBeDefined();
    const terrain = terrainWith((x, z, radius) => Math.hypot(x - horror.centerX, z - horror.centerZ) > 1.5 + radius);
    const regions = new RegionalWorld("boss-placement", { x: 0, z: 0 }, terrain);
    const verify = () => {
        const chunk = [...regions.chunks.values()].find(chunk => chunk.spawns.some(spawn => spawn.boss && spawn.region.x === horror.x && spawn.region.z === horror.z))!;
        expect(chunk).toBeDefined();
        const boss = chunk.spawns.find(spawn => spawn.boss)!;
        expect(boss.region).toEqual(horror);
        expect(Math.hypot(boss.x - horror.centerX, boss.z - horror.centerZ)).toBeGreaterThan(1.5);
        const component = chunk.navigation.componentAt(boss.x, boss.z);
        for (const spawn of chunk.spawns) {
            expect(chunk.navigation.componentAt(spawn.x, spawn.z)).toBe(component);
            const radius = ENEMY_DEFINITIONS[spawn.kind].radius * (spawn.boss ? 2.5 : spawn.elite ? 1.28 : 1) + .08;
            expect(terrain.isClear(spawn.x, spawn.z, radius)).toBe(true);
            expect(regions.regionAt(spawn.x, spawn.z)).toEqual(spawn.region);
        }
        return chunk.spawns;
    };
    regions.synchronize(horror.centerX, horror.centerZ); const first = verify();
    regions.synchronize(500, 500); regions.synchronize(horror.centerX, horror.centerZ);
    expect(verify()).toEqual(first); expect(regions.chunks.size).toBe(81);
});

test("unreachable and safety-radius spawns stay pending; successful spawns consume their slot once", () => {
    const simulation = new CombatSimulation("pending-encounters", { x: 0, z: 0 }, undefined, divided);
    const runtime = simulation as unknown as { world: RegionalWorld; entities: CombatWorld; spawnEnemies(): void; refreshChests(): void };
    const { entities: e, world } = runtime;
    let pending = 0;
    for (const chunk of world.chunks.values()) for (let i = 0; i < chunk.spawns.length; i++) {
        if (chunk.spawns[i].x > 2) { expect(chunk.spawned[i]).toBe(0); pending++; }
    }
    expect(pending).toBeGreaterThan(0);
    for (let i = 0; i < simulation.getRenderState().chests.count; i++) expect(simulation.getRenderState().chests.x[i]).toBeLessThan(2);
    e.position.x[e.player] = 4; world.updateAccess(4, 0); runtime.spawnEnemies(); runtime.refreshChests();
    const count = e.enemies.count; runtime.spawnEnemies(); expect(e.enemies.count).toBe(count);
    const right = [...world.chunks.values()].filter(chunk => chunk.spawns.some(spawn => spawn.x > 7));
    expect(right.some(chunk => chunk.spawned.some(value => value === 1))).toBe(true);
    simulation.dispose();
});

test("blocked worlds advertise neither a boss nor a chest and do not fabricate a walkable fallback", () => {
    const world = new RegionalWorld("no-land", { x: 0, z: 0 }, terrainWith(() => false)); world.synchronize(0, 0); world.updateAccess(0, 0);
    for (const chunk of world.chunks.values()) { expect(chunk.spawns).toHaveLength(0); expect(chunk.chest).toBeUndefined(); }
});
