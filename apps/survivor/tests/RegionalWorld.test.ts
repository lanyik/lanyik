import { describe, expect, test } from "vitest";
import { MAX_COMBAT_CHUNKS, RegionalWorld, REGION_RULES, hexDistance, SETTLEMENTS } from "../src/core/RegionalWorld";

describe("regional ecology", () => {
    test("camps have compatible members, compact homes and boss support instead of random species", () => {
        const world = new RegionalWorld("ecology", { x: 0, z: 0 }), kinds = new Set<string>();
        for (let x = -120; x <= 120; x += 60) {
            world.synchronize(x, 30);
            for (const chunk of world.chunks.values()) {
                const camp = chunk.spawns[0].settlement!;
                kinds.add(camp.kind);
                for (const spawn of chunk.spawns) {
                    expect(spawn.settlement).toBe(camp);
                    expect(SETTLEMENTS[camp.kind].members).toContain(spawn.kind);
                    expect(Math.hypot(spawn.x - camp.x, spawn.z - camp.z)).toBeLessThan(3.1);
                    if (spawn.boss) expect(camp.kind).toBe("cult");
                }
            }
        }
        expect(kinds.size).toBe(4);
    });
    test("positions within the same hex reuse its immutable region, including negative boundaries", () => {
        const world = new RegionalWorld("region-cache", { x: 10, z: -8 });
        const current = world.regionAt(10, -8);
        expect(world.regionAt(10.1, -8.1, current)).toBe(current);
        const moved = world.regionAt(-30, -8, current);
        expect(moved).not.toBe(current);
        expect(moved).toEqual(world.regionAt(-30, -8));
        expect(world.regionAt(moved.centerX + .1, moved.centerZ + .1, moved)).toBe(moved);
    });

    test("keeps 81 resident chunks, retires ownership and reconstructs consumed populations on reentry", () => {
        const world = new RegionalWorld("residency", { x: 10, z: -8 });
        world.synchronize(10, -8);
        const initial = world.chunks.get("0,0")!;
        initial.spawned.fill(1); initial.chestOpened = true;
        for (let step = 1; step <= 60; step++) {
            world.synchronize(10 + step * 12, -8);
            expect(world.chunks.size).toBe(MAX_COMBAT_CHUNKS);
            expect([...world.chunks.values()].filter(chunk => chunk.band === "near")).toHaveLength(9);
            expect([...world.chunks.values()].filter(chunk => chunk.band === "buffer")).toHaveLength(16);
            expect([...world.chunks.values()].filter(chunk => chunk.band === "retained")).toHaveLength(56);
        }
        expect(initial.resident).toBe(false);
        world.synchronize(10, -8);
        const returned = world.chunks.get("0,0")!;
        expect(returned).not.toBe(initial);
        expect(returned.spawns).toEqual(initial.spawns);
        expect(returned.spawned.every(value => value === 0)).toBe(true);
        expect(returned.chestOpened).toBe(false);
        returned.spawned.fill(1); returned.chestOpened = true;
        for (let tick = 0; tick < 20_000; tick++) expect(world.synchronize(10, -8)).toBe(false);
        expect(returned.spawned.every(value => value === 1)).toBe(true);
        expect(returned.chestOpened).toBe(true);
    });

    test("uses true hex regions, outward level bands and each spawn's own region at boundaries", () => {
        const world = new RegionalWorld("hex-regions", { x: 20, z: -10 });
        const difficulties = new Set<string>(); let bosses = 0;
        for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
            const region = world.regionAtHex(q, r); difficulties.add(region.difficulty);
            expect(world.regionAt(region.centerX, region.centerZ)).toEqual(region);
            expect(region.ring).toBe(hexDistance(q, r));
            expect(region.level).toBeGreaterThanOrEqual(region.ring * 5 + 1);
            expect(region.level).toBeLessThanOrEqual(region.ring * 5 + 5);
            world.synchronize(region.centerX, region.centerZ);
            for (const chunk of world.chunks.values()) {
                for (const spawn of chunk.spawns) {
                    expect(world.regionAt(spawn.x, spawn.z)).toEqual(spawn.region);
                    if (spawn.boss && spawn.region.x === q && spawn.region.z === r) bosses++;
                    expect(spawn.level).toBeGreaterThanOrEqual(Math.max(1, spawn.region.level - 1));
                }
                if (chunk.chest) expect(world.regionAt(chunk.chest.x, chunk.chest.z)).toEqual(chunk.chest.region);
                expect(chunk.spawns.length).toBeLessThanOrEqual(REGION_RULES.horror.population + 1);
            }
        }
        expect(difficulties.size).toBe(3); expect(bosses).toBeGreaterThan(0);
        expect(world.nearbyRegions(world.regionAtHex(0, 0))).toHaveLength(19);
        expect(world.regionAtHex(0, 0).difficulty).toBe("normal");
    });
});
