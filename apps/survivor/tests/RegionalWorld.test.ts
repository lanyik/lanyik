import { describe, expect, test } from "vitest";
import { RegionalWorld, REGION_RULES, MAX_COMBAT_CHUNKS, WORLD_RENEWAL_TICKS } from "../src/core/RegionalWorld";

describe("regional world", () => {
    test("bounds all four rings while moving across positive and negative coordinates", () => {
        const world = new RegionalWorld("rings", { x: 0, z: 0 });
        world.synchronize(0, 0, 0);
        const original = [...world.chunks.values()];
        expect(original.filter(chunk => chunk.lod === "active")).toHaveLength(9);
        expect(original.filter(chunk => chunk.lod === "low")).toHaveLength(16);
        expect(original.filter(chunk => chunk.lod === "static")).toHaveLength(24);
        for (let step = 1; step <= 300; step += 1) {
            world.synchronize(-step * 12, step * 12, step);
            expect(world.chunks.size).toBe(MAX_COMBAT_CHUNKS);
        }
        expect(original.every(chunk => !chunk.resident)).toBe(true);
        expect(world.lodAt(0, 0)).toBe("unloaded");
    });

    test("terrain difficulty and treasure locations are independent of load order; horror has one boss home", () => {
        const first = new RegionalWorld("regional-content", { x: 0, z: 0 });
        const second = new RegionalWorld("regional-content", { x: 0, z: 0 });
        expect(first.regionAt(0, 0).difficulty).toBe("normal");
        const difficulties = new Set<string>();
        for (let x = -8; x <= 8; x += 1) {
            const region = first.regionAt(x * 36, 72);
            difficulties.add(region.difficulty);
            first.synchronize(region.bossX, region.bossZ, 1);
            second.synchronize(1000, -1000, 1);
            second.synchronize(region.bossX, region.bossZ, 1);
            const owned = [...first.chunks.values()].filter(chunk => chunk.region.x === region.x && chunk.region.z === region.z);
            expect(owned.filter(chunk => chunk.hasBoss)).toHaveLength(region.difficulty === "horror" ? 1 : 0);
            for (const chunk of owned) {
                const other = second.chunks.get(chunk.key)!;
                expect(chunk.chest).toEqual(other.chest);
                expect(chunk.region).toEqual(other.region);
                expect(chunk.enemyIds.length).toBe(REGION_RULES[region.difficulty].population + Number(chunk.hasBoss));
            }
        }
        expect(difficulties.size).toBe(3);
    });

    test("keeps chest claims across unloading and renews them only at the world epoch", () => {
        const world = new RegionalWorld("claims", { x: 0, z: 0 });
        world.synchronize(0, 0, 1);
        const chest = [...world.chunks.values()].find(chunk => chunk.chest)!;
        world.claim("chest", chest);
        world.synchronize(1000, 1000, 2);
        world.synchronize(0, 0, 3);
        const reloaded = world.chunks.get(chest.key)!;
        expect(reloaded).not.toBe(chest);
        expect(world.isClaimed("chest", reloaded)).toBe(true);
        world.synchronize(0, 0, WORLD_RENEWAL_TICKS);
        expect(world.isClaimed("chest", reloaded)).toBe(false);
    });
});
