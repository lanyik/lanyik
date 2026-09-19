import { WORLD_VIEW } from "../src/core/WorldView";
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
            const height = terrain.height(tree.x, tree.z);
            expect(terrain.traceAttack(tree.x - 1, height + .8, tree.z, tree.x + 1, height + .8, tree.z, .1)).toBeLessThan(.5);
            expect(terrain.traceAttack(tree.x - 1, height + 10, tree.z, tree.x + 1, height + 10, tree.z, .1)).toBe(Infinity);
            expect(result.x).toBeLessThan(tree.x); expect(terrain.isClear(result.x, result.z, .3)).toBe(true); checked = true; break;
        }
    }
    expect(checked).toBe(true); terrain.dispose();
});

test("terrain height and solid cover survive negative-coordinate eviction; water blocks walking but not an airborne shot", () => {
    const terrain = new ProceduralCombatTerrain("rift-ember-1"), original = terrain.height(-12.25, -12.25);
    const chunks = (terrain as unknown as { chunks: Map<string, { waters: Uint8Array; heights: Float64Array; trees: { x: number; z: number; scale: number }[] }> }).chunks;
    let waterChecked = false, mountainChecked = false;
    // Fixed ocean and inland fixtures under COMBAT_WATER_STYLE (the lower ocean level makes the origin dry).
    for (const [cx, cz] of [[-64, 53], [0, 0]]) {
        terrain.height(cx * 12, cz * 12);
        const chunk = chunks.get(`${cx},${cz}`)!;
        for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) {
            const a = z * 25 + x, px = cx * 12 + (x + .5) * .5, pz = cz * 12 + (z + .5) * .5;
            if (!waterChecked && chunk.waters[a] && chunk.waters[a + 1] && chunk.waters[a + 25] && chunk.waters[a + 26]) {
                expect(terrain.isClear(px, pz, .3)).toBe(false);
                const y = terrain.height(px, pz) + 4;
                expect(terrain.traceAttack(px - .1, y, pz, px + .1, y, pz, .1)).toBe(Infinity);
                waterChecked = true;
            }
            if (!mountainChecked && !chunk.waters[a] && terrain.height(px, pz) > 1
                && chunk.trees.every(tree => Math.hypot(tree.x - px, tree.z - pz) > .2 * tree.scale + .1)) {
                const y = terrain.height(px, pz);
                expect(terrain.traceAttack(px, y + 2, pz, px, y - 1, pz, .1)).toBeCloseTo(1.9 / 3, 2);
                mountainChecked = true;
            }
        }
    }
    expect(waterChecked).toBe(true); expect(mountainChecked).toBe(true);
    for (let i = 0; i < 130; i++) terrain.height(240 + i * 12, 100);
    expect(terrain.cachedChunks).toBeLessThanOrEqual(WORLD_VIEW.navigationChunks);
    expect(terrain.height(-12.25, -12.25)).toBe(original); terrain.dispose();
});

test("terrain cache has a fixed cap and regenerated negative chunks give identical results", () => {
    const terrain = new ProceduralCombatTerrain("cache-terrain"), first = terrain.isClear(-12.25, -12.25, .3);
    for (let i = 0; i < 106; i++) terrain.isClear(i * 12 + 3, 2, .3);
    expect(terrain.cachedChunks).toBeLessThanOrEqual(WORLD_VIEW.navigationChunks);
    expect(terrain.isClear(-12.25, -12.25, .3)).toBe(first); terrain.dispose();
    expect(terrain.cachedChunks).toBe(0);
    expect(terrain.isClear(-12.25, -12.25, .3)).toBe(first);
    expect(terrain.cachedChunks).toBe(4); terrain.dispose(); // Radius .3 crosses both chunk boundaries at -12.
});
