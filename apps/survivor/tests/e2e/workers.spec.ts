import { expect, test, type Page } from "@playwright/test";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatTransport } from "../../src/app/CombatTransport";
import type { HexMap, HexMapFrameEndEvent, GroundProjection } from "three-hex-map";
import type { CombatLayer } from "../../src/presentation/CombatLayer";
import { inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";

async function startCrowdedCombat(page: Page): Promise<void> {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
        window.survivorOptions = { collisionQueries: true };
    });
    await inspectCombatWorker(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page);
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; attackCooldown: number; autoCast: boolean };
        const e = fixture.entities, player = simulation.getRenderState().player;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        fixture.attackCooldown = 1000; fixture.autoCast = false;
        for (let i = 0; i < 640; i++) e.spawnEnemy({ x: player.x + 6, z: player.z + i / 64000, kind: 0,
            level: 1, elite: false, boss: false, region: fixture.world.regionAt(player.x, player.z) }, fixture.world.chunks.get("0,0")!);
        for (let i = 0; i < 128; i++) e.spawnProjectile(e.world.ids[e.player], 0, player.x + 5.61, player.z + .39, .01, 0, 1, 1000);
    });
    await advanceCombat(page, 1);
    const stats = await page.evaluate(() => window.survivorApplication!.session.diagnostics);
    expect(stats.workers).toBe(3);
    expect(stats.simulation!.parallelBatches).toBeGreaterThan(0);
}

test("reports each worker's load, decays paused samples and fits the narrow HUD", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await startCrowdedCombat(page);
    // Query timing is recorded; keep one boss for layout checks without rendering the stress fixture throughout.
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld };
        const e = fixture.entities, player = simulation.getRenderState().player;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        e.spawnEnemy({ x: player.x + 6, z: player.z, kind: 0, level: 1, elite: false, boss: true,
            region: fixture.world.regionAt(player.x, player.z) }, fixture.world.chunks.get("0,0")!);
    });
    await advanceCombat(page);
    const order = await page.evaluate(async () => {
        const view = (window.survivorApplication!.session as unknown as { view: { map: HexMap; layer: CombatLayer } }).view;
        const renderer = (view.map as unknown as { rendererHost: { render(projection?: GroundProjection): void } }).rendererHost;
        const update = view.layer.update, draw = renderer.render, phases: string[] = [];
        return new Promise<{ phases: string[]; cpuMs: number }>(resolve => {
            view.layer.update = (...args) => { phases.push("presentation"); update.apply(view.layer, args); };
            renderer.render = (...args) => { phases.push("draw"); draw.apply(renderer, args); };
            const after = (frame: HexMapFrameEndEvent) => {
                phases.push("after"); view.map.off("afterframe", after);
                view.layer.update = update; renderer.render = draw;
                resolve({ phases, cpuMs: frame.cpuFrameMs });
            };
            view.map.on("afterframe", after);
        });
    });
    expect(order.phases).toEqual(["presentation", "draw", "after"]);
    expect(order.cpuMs).toBeGreaterThan(0);
    const monitor = page.getByRole("region", { name: "Worker 负载", exact: true });
    await expect(monitor).toBeVisible();
    await expect.poll(() => monitor.locator("[data-runtime-fps]").getAttribute("data-runtime-fps")).not.toBeNull();
    const performance = await page.evaluate(() => window.survivorApplication!.session.getSnapshot().performance!);
    expect(performance.frameP95Ms).toBeGreaterThan(0); expect(performance.mainMs).toBeGreaterThan(0);
    expect(performance.queryWaitMs).toBeGreaterThanOrEqual(0);
    await expect(monitor.locator("[data-worker]")).toHaveCount(5);
    await expect.poll(() => monitor.locator("[data-worker]").evaluateAll(rows => rows.every(row =>
        Number(row.getAttribute("data-completed")) > 0 && row.querySelector(".worker-load-time")!.textContent!.includes("ms")))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("worker-load-desktop.png") });
    // Paused combat must keep publishing diagnostics without submitting simulation ticks.
    await expect.poll(async () => monitor.locator('[data-worker="simulation"], [data-worker^="query-"]').evaluateAll(rows => rows.every(row => Number(row.getAttribute("data-occupancy")) === 0))).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = (await monitor.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(await monitor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.locator(".pause-banner")).toBeHidden();
    await expect(page.locator(".dock-pause")).toBeVisible();
    const boss = (await page.locator(".boss-status").boundingBox())!;
    expect(boss.x).toBeGreaterThan(bounds.x + bounds.width);
    expect(boss.x + boss.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("worker-load-narrow.png") });
    await monitor.locator("summary").click();
    expect(await monitor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await monitor.getByText("超出追赶上限", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("worker-load-narrow-details.png") });
    await monitor.locator("summary").click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.survivorApplication!.session.dispatch({ type: "restart" }));
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready");
    await expect(monitor.locator("[data-worker]")).toHaveCount(5);
    await expect(monitor.locator('[data-worker="query-0"]')).toHaveAttribute("data-completed", "0");
});

test("parallel queries run in real workers and repeated restart, crash and disposal release every owner", async ({ page }) => {
    test.setTimeout(150_000);
    await startCrowdedCombat(page);
    const liveCombatWorkers = () => page.workers().filter(worker => /\/(Combat|Projectile)\.worker-/.test(worker.url()));
    for (let i = 0; i < 20; i++) {
        const previous = liveCombatWorkers();
        await page.evaluate(() => window.survivorApplication!.session.dispatch({ type: "restart" }));
        await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready");
        await expect.poll(() => liveCombatWorkers().length).toBe(3);
        expect(previous.every(worker => !page.workers().includes(worker))).toBe(true);
    }
    const query = page.workers().find(worker => /\/Projectile\.worker-/.test(worker.url()))!;
    await query.evaluate(() => { setTimeout(() => { throw new Error("intentional query worker failure"); }, 0); });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "failed");
    await expect.poll(() => liveCombatWorkers().length).toBe(0);
    await page.evaluate(async () => { await window.survivorApplication!.session.start(); });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready");
    const disposal = await page.evaluate(async () => {
        const app = window.survivorApplication!;
        const client = (app.session as unknown as { client: CombatTransport }).client;
        await app.dispose(); return client.stats;
    });
    expect(disposal.workers).toBe(0); expect(disposal.pending).toBe(0);
    await expect.poll(() => page.workers().length).toBe(0);
});
