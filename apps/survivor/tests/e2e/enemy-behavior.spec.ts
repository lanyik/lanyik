import { ticksForSeconds } from "../../src/core/GameConfig";
import { expect, test } from "@playwright/test";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { InstancedMesh } from "three";
import type { CombatRenderState } from "../../src/core/CombatState";
import { inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";

test("renders non-looping cast poses, telegraphs and hostile projectiles from fixed ticks", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await inspectCombatWorker(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page);
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number };
        const e = fixture.entities, player = simulation.getRenderState().player;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        fixture.autoCast = false; fixture.attackCooldown = 1000;
        const home = fixture.world.chunks.get("0,0")!;
        e.spawnEnemy({ x: player.x, z: player.z + 5, kind: 3, boss: false, elite: false, level: 1,
            region: fixture.world.regionAt(player.x, player.z + 5) }, home);
    });
    await advanceCombat(page, ticksForSeconds(.36));
    const windup = await page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { view: { layer: {
            actors: { enemies: InstancedMesh[][] }; castWarnings: InstancedMesh } } };
        const mesh = runtime.view.layer.actors.enemies[3][0];
        return { weights: Array.from((mesh.morphTexture!.image.data as Float32Array).slice(1, 17)),
            frames: mesh.geometry.morphAttributes.position?.length, warnings: runtime.view.layer.castWarnings.count };
    });
    expect(windup.frames).toBe(16);
    expect(windup.weights.slice(0, 8).every(weight => weight === 0)).toBe(true);
    expect(windup.weights.slice(8).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(windup.warnings).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("caster-windup.png") });
    const pausedTick = await combatWorker(page).evaluate(() => (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation.tick);
    await page.evaluate(() => window.survivorApplication!.session.frame(performance.now()));
    expect(await combatWorker(page).evaluate(() => (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation.tick)).toBe(pausedTick);
    await advanceCombat(page, ticksForSeconds(.36));
    const release = await page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { view: { layer: {
            actors: { enemies: InstancedMesh[][] }; castWarnings: InstancedMesh; projectiles: InstancedMesh } } };
        const layer = runtime.view.layer;
        return { warnings: layer.castWarnings.count, bolts: layer.projectiles.count,
            color: Array.from(layer.projectiles.instanceColor!.array.slice(0, 3)),
            weights: Array.from((layer.actors.enemies[3][0].morphTexture!.image.data as Float32Array).slice(1, 17)) };
    });
    expect(release.warnings).toBe(0);
    expect(release.bolts).toBe(1);
    expect(release.color[0]).toBeGreaterThan(release.color[1]);
    expect(release.weights).not.toEqual(windup.weights);
    await page.screenshot({ path: testInfo.outputPath("caster-release.png") });
    const enemy = await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld };
        const e = fixture.entities, p = e.position, player = e.player;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        const x = p.x[player] - 1.2, z = p.z[player];
        const enemy = e.spawnEnemy({ x, z, kind: 2, boss: false, elite: false, level: 1,
            region: fixture.world.regionAt(x, z) }, fixture.world.chunks.get("0,0")!);
        return enemy;
    });
    await advanceCombat(page, ticksForSeconds(.4));
    const melee = await page.evaluate(enemy => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: { telegraphs: InstancedMesh } } };
        const e = runtime.renderState.entities, p = e.position;
        const player = runtime.renderState.player;
        const warning = runtime.view.layer.telegraphs;
        // The sector's local -Y center must point toward the locked world-space target.
        const matrix = warning.instanceMatrix.array;
        const dx = -matrix[4], dz = -matrix[6];
        const tx = player.x - p.x[enemy], tz = player.z - p.z[enemy];
        return { warnings: warning.count, alignment: (dx * tx + dz * tz) / Math.hypot(dx, dz) / Math.hypot(tx, tz),
            radius: Math.hypot(dx, dz), reach: e.action.reach[enemy] };
    }, enemy);
    expect(melee.warnings).toBe(1);
    expect(melee.alignment).toBeCloseTo(1);
    expect(melee.radius).toBeCloseTo(melee.reach);
    await page.screenshot({ path: testInfo.outputPath("melee-windup.png") });
    expect(errors).toEqual([]);
});
