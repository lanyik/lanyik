import { describe, expect, test } from "vitest";
import { MAX_COMBAT_CHUNKS, RegionalWorld, REGION_RULES, hexDistance } from "../src/core/RegionalWorld";

describe("regional ecology", () => {
    test("keeps 49 resident chunks, retires ownership and reconstructs consumed populations on reentry", () => {
        const world = new RegionalWorld("residency", { x: 10, z: -8 });
        world.synchronize(10, -8);
        const initial = world.chunks.get("0,0")!;
        initial.spawned.fill(1); initial.chestOpened = true;
        for (let step = 1; step <= 60; step++) {
            world.synchronize(10 + step * 12, -8);
            expect(world.chunks.size).toBe(MAX_COMBAT_CHUNKS);
            expect([...world.chunks.values()].filter(chunk => chunk.band === "near")).toHaveLength(9);
            expect([...world.chunks.values()].filter(chunk => chunk.band === "buffer")).toHaveLength(16);
            expect([...world.chunks.values()].filter(chunk => chunk.band === "retained")).toHaveLength(24);
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
