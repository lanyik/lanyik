import { expect, test } from "vitest";
import { WORLD_VIEW as view } from "../src/core/WorldView";
import { GAME_CONFIG, MAX_ENEMIES } from "../src/core/GameConfig";
import { COMBAT_CHUNK_SIZE, MAX_COMBAT_CHUNKS, RegionalWorld, REGION_RULES } from "../src/core/RegionalWorld";
import { actorVisibility } from "../src/presentation/ActorVisibility";

test("fog, living populations, vegetation and streamed terrain share an ordered distance contract", () => {
    expect(actorVisibility(30)).toBe(1); expect(view.actorFadeStart).toBe(view.mistDense);
    expect(view.awakeRadius).toBeGreaterThan(view.actorFadeEnd);
    expect(view.sleepRadius).toBeLessThan(view.residentRadius * view.chunkSize);
    expect(view.actorFadeEnd).toBeLessThan(view.vegetationEnd);
    expect(view.vegetationEnd).toBeLessThanOrEqual(view.mistOuter);
    expect(view.terrainFogEnd).toBe(view.mistOuter); expect(view.terrainEnd).toBeGreaterThan(view.terrainFogEnd);
    expect(view.terrainLoadRadius * view.terrainChunkSize * 1.5).toBeGreaterThanOrEqual(view.terrainEnd);
    expect(GAME_CONFIG.enemies.aggroDistance).toBe(12);
    expect(MAX_ENEMIES).toBeGreaterThanOrEqual(MAX_COMBAT_CHUNKS * (Math.max(...Object.values(REGION_RULES).map(rule => rule.population)) + 1));
});

test.each([1, -1])("a resident chunk leaves only after its homes are fully hidden at either travel direction (%s)", direction => {
    const world = new RegionalWorld("aligned-horizon", { x: 0, z: 0 }); world.synchronize(0, 0);
    const old = [...world.chunks.values()]; const playerX = direction * (COMBAT_CHUNK_SIZE / 2 + .01);
    world.synchronize(playerX, 0);
    let removed = 0;
    for (const chunk of old) if (!chunk.resident) {
        removed++;
        for (const spawn of chunk.spawns) expect(actorVisibility(Math.hypot(spawn.x - playerX, spawn.z))).toBe(0);
    }
    expect(removed).toBeGreaterThan(0);
});
