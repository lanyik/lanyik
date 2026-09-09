import { expect, test } from "@playwright/test";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { InstancedMesh } from "three";

test("renders non-looping cast poses, telegraphs and hostile projectiles from fixed ticks", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    const windup = await page.evaluate(() => {
        const session = window.survivorApplication!.session;
        session.dispatch({ type: "toggle-pause" });
        const runtime = session as unknown as { simulation: CombatSimulation; view: { layer: {
            actors: { enemies: InstancedMesh[][] }; castWarnings: InstancedMesh } } };
        const simulation = runtime.simulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number };
        const e = fixture.entities, player = simulation.getRenderState().player;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        fixture.autoCast = false; fixture.attackCooldown = 1000;
        const home = fixture.world.chunks.get("0,0")!;
        e.spawnEnemy({ x: player.x, z: player.z + 5, kind: 3, boss: false, elite: false, level: 1,
            region: fixture.world.regionAt(player.x, player.z + 5) }, home);
        for (let tick = 0; tick < 18; tick++) simulation.step({ x: 0, z: 0, active: false });
        session.frame(performance.now());
        const mesh = runtime.view.layer.actors.enemies[3][0];
        return { tick: simulation.tick, weights: Array.from((mesh.morphTexture!.image.data as Float32Array).slice(1, 17)),
            frames: mesh.geometry.morphAttributes.position?.length, warnings: runtime.view.layer.castWarnings.count };
    });
    expect(windup.frames).toBe(16);
    expect(windup.weights.slice(0, 8).every(weight => weight === 0)).toBe(true);
    expect(windup.weights.slice(8).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(windup.warnings).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("caster-windup.png") });
    const release = await page.evaluate(() => {
        const session = window.survivorApplication!.session;
        const runtime = session as unknown as { simulation: CombatSimulation; view: { layer: {
            actors: { enemies: InstancedMesh[][] }; castWarnings: InstancedMesh; projectiles: InstancedMesh } } };
        const paused = runtime.simulation.tick;
        session.frame(performance.now());
        const unchanged = runtime.simulation.tick === paused;
        for (let tick = 0; tick < 18; tick++) runtime.simulation.step({ x: 0, z: 0, active: false });
        session.frame(performance.now());
        const layer = runtime.view.layer;
        return { unchanged, warnings: layer.castWarnings.count, bolts: layer.projectiles.count,
            color: Array.from(layer.projectiles.instanceColor!.array.slice(0, 3)),
            weights: Array.from((layer.actors.enemies[3][0].morphTexture!.image.data as Float32Array).slice(1, 17)) };
    });
    expect(release.unchanged).toBe(true);
    expect(release.warnings).toBe(0);
    expect(release.bolts).toBe(1);
    expect(release.color[0]).toBeGreaterThan(release.color[1]);
    expect(release.weights).not.toEqual(windup.weights);
    await page.screenshot({ path: testInfo.outputPath("caster-release.png") });
    const melee = await page.evaluate(() => {
        const session = window.survivorApplication!.session;
        const runtime = session as unknown as { simulation: CombatSimulation; view: { layer: { telegraphs: InstancedMesh } } };
        const fixture = runtime.simulation as unknown as { entities: CombatWorld; world: RegionalWorld };
        const e = fixture.entities, p = e.position, player = e.player;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        const x = p.x[player] - 1.2, z = p.z[player];
        const enemy = e.spawnEnemy({ x, z, kind: 2, boss: false, elite: false, level: 1,
            region: fixture.world.regionAt(x, z) }, fixture.world.chunks.get("0,0")!);
        for (let tick = 0; tick < 20; tick++) runtime.simulation.step({ x: 0, z: 0, active: false });
        session.frame(performance.now());
        const warning = runtime.view.layer.telegraphs;
        // The sector's local -Y center must point toward the locked world-space target.
        const matrix = warning.instanceMatrix.array;
        const dx = -matrix[4], dz = -matrix[6];
        const tx = p.x[player] - p.x[enemy], tz = p.z[player] - p.z[enemy];
        return { warnings: warning.count, alignment: (dx * tx + dz * tz) / Math.hypot(dx, dz) / Math.hypot(tx, tz),
            radius: Math.hypot(dx, dz), reach: e.action.reach[enemy] };
    });
    expect(melee.warnings).toBe(1);
    expect(melee.alignment).toBeCloseTo(1);
    expect(melee.radius).toBeCloseTo(melee.reach);
    await page.screenshot({ path: testInfo.outputPath("melee-windup.png") });
    expect(errors).toEqual([]);
});
