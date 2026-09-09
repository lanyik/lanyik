import { expect, test } from "@playwright/test";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatTransport } from "../../src/app/CombatTransport";
import { inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";

test("parallel queries run in real workers and repeated restart, crash and disposal release every owner", async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 }));
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
        for (let i = 0; i < 640; i++) e.spawnEnemy({ x: player.x + 6, z: player.z + i / 640, kind: 0,
            level: 1, elite: false, boss: false, region: fixture.world.regionAt(player.x, player.z) }, fixture.world.chunks.get("0,0")!);
        for (let i = 0; i < 128; i++) e.spawnProjectile(e.world.ids[e.player], 0, player.x + 100, player.z + 100, .01, 0, 1, 1000);
    });
    await advanceCombat(page, 1);
    const stats = await page.evaluate(() => window.survivorApplication!.session.diagnostics);
    expect(stats.workers).toBe(3);
    expect(stats.simulation!.parallelBatches).toBeGreaterThan(0);
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
