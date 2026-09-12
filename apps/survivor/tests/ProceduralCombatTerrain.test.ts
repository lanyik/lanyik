import { expect, test } from "vitest";
import { ProceduralCombatTerrain } from "../src/adapters/ProceduralCombatTerrain";
import { CombatSimulation } from "../src/core/CombatSimulation";
import type { CombatWorld } from "../src/core/CombatWorld";
import { findCombatStart } from "../src/adapters/HexCombatView";

test("production spawns and chests have ground clearance including their body radii", () => {
    const seed = "rift-ember-1", terrain = new ProceduralCombatTerrain(seed), start = findCombatStart(seed).point;
    const simulation = new CombatSimulation(seed, start, undefined, terrain), render = simulation.getRenderState();
    expect(terrain.isClear(start.x, start.z, .3)).toBe(true); expect(render.entities.enemies.count).toBeGreaterThan(30);
    const { position: p, enemies } = render.entities;
    for (let i = 0; i < enemies.count; i++) { const slot = enemies.slots[i]; expect(terrain.isClear(p.x[slot], p.z[slot], p.radius[slot])).toBe(true); }
    for (let i = 0; i < render.chests.count; i++) expect(terrain.isClear(render.chests.x[i], render.chests.z[i], .45)).toBe(true);
    const world = (simulation as unknown as { entities: CombatWorld }).entities;
    for (let i = 0; i < 150; i++) simulation.step({ x: 1, z: .4, active: true });
    expect(terrain.isClear(world.position.x[world.player], world.position.z[world.player], .3)).toBe(true);
    for (let i = 0; i < enemies.count; i++) { const slot = enemies.slots[i]; expect(terrain.isClear(p.x[slot], p.z[slot], p.radius[slot])).toBe(true); }
    simulation.dispose(); expect(terrain.cachedChunks).toBe(0);
});

test("trunks stop movement and long straight dashes cannot tunnel across their footprint", () => {
    const terrain = new ProceduralCombatTerrain("rift-ember-1");
    const chunks = (terrain as unknown as { chunks: Map<string, { trees: { x: number; z: number; scale: number }[] }> }).chunks;
    let checked = false;
    for (let x = -36; x <= 36 && !checked; x += 12) for (let z = -36; z <= 36 && !checked; z += 12) {
        terrain.isClear(x, z, .3);
        for (const chunk of chunks.values()) for (const tree of chunk.trees) {
            if (!terrain.isClear(tree.x - 1, tree.z, .3) || !terrain.isClear(tree.x + 1, tree.z, .3)) continue;
            expect(terrain.isClear(tree.x, tree.z, .3)).toBe(false);
            const result = terrain.move(tree.x - 1, tree.z, 2, 0, .3, false);
            expect(result.x).toBeLessThan(tree.x); expect(terrain.isClear(result.x, result.z, .3)).toBe(true); checked = true; break;
        }
    }
    expect(checked).toBe(true); terrain.dispose();
});

test("terrain cache has a fixed cap and regenerated negative chunks give identical results", () => {
    const terrain = new ProceduralCombatTerrain("cache-terrain"), first = terrain.isClear(-12.25, -12.25, .3);
    for (let i = 0; i < 106; i++) terrain.isClear(i * 12 + 3, 2, .3);
    expect(terrain.cachedChunks).toBeLessThanOrEqual(100);
    expect(terrain.isClear(-12.25, -12.25, .3)).toBe(first); terrain.dispose();
});
