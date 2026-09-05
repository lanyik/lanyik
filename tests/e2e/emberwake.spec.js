import { expect, test } from "@playwright/test";

const diagnostics = page => page.evaluate(() => window.getEmberwakeDiagnostics());
async function ready(page) {
    await page.waitForFunction(() => window.getEmberwakeDiagnostics?.().ready || window.getEmberwakeDiagnostics?.().fatal);
    expect((await diagnostics(page)).fatal).toBe(false);
    await expect(page.locator("#begin")).toBeEnabled();
}
async function saved(page) {
    await page.waitForFunction(() => !window.getEmberwakeDiagnostics().saving);
    expect((await diagnostics(page)).fatal).toBe(false);
}
async function radarPoint(page, point, waitForSave = true) {
    const base = (await diagnostics(page)).state.base;
    const bounds = await page.locator("#radar").boundingBox();
    const x = 116 + (point.x - base.x) * 8.3;
    const y = 102 + (point.y - base.y + (point.x % 2 === 0 ? 0.5 : 0) - (base.x % 2 === 0 ? 0.5 : 0)) * 8.3 * 1.1547;
    await page.mouse.click(bounds.x + x / 232 * bounds.width, bounds.y + y / 204 * bounds.height);
    expect((await diagnostics(page)).selected).toEqual(point);
    if (waitForSave) await saved(page);
}

test("commands a real battle, rescues cargo, packs a turret and restores an upgrade before crossing a source boundary", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/emberwake.html?quality=fast");
    await ready(page);
    await page.locator("#begin").click();
    await page.locator("#pause").click();
    await saved(page);
    await page.locator("#mine-nearest").click(); await saved(page);
    await page.locator("#mine-nearest").click(); await saved(page);
    expect((await diagnostics(page)).state.rovers).toHaveLength(2);
    await page.locator('[data-mode="gun"]').click();
    const target = (await diagnostics(page)).targets.find(p => p.x === -2 && p.y === 0);
    expect(target.screen.visible).toBe(true);
    await page.mouse.click(target.screen.x, target.screen.y);
    await saved(page);
    expect((await diagnostics(page)).state.towers).toHaveLength(1);
    expect((await diagnostics(page)).state.metal).toBe(22);
    await page.locator("#speed").click();
    await page.locator("#pause").click();
    await page.waitForFunction(() => getEmberwakeDiagnostics().state.wave >= 1);
    await page.locator("#pause").click(); await saved(page);
    const before = (await diagnostics(page)).state;
    expect(before.enemies.length).toBeGreaterThan(0);
    await page.locator('[data-mode="barrage"]').click();
    await radarPoint(page, { x: before.enemies[0].x, y: before.enemies[0].y });
    expect((await diagnostics(page)).state.bombs).toHaveLength(1);
    expect((await diagnostics(page)).state.fuel).toBe(before.fuel - 4);
    await page.locator("#pause").click();
    await page.waitForFunction(kills => {
        const s = getEmberwakeDiagnostics().state;
        return s.kills > kills && !s.bombs.length && s.delivered >= 40;
    }, before.kills);
    await page.locator("#pause").click(); await saved(page);
    const delivered = (await diagnostics(page)).state;
    expect(delivered.rovers).toHaveLength(0);
    expect(delivered.lostRovers).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("fortress-battle.png") });
    await page.locator('[data-mode="salvage"]').click();
    await radarPoint(page, { x: -2, y: 0 });
    expect((await diagnostics(page)).state.towers[0].packing).toBe(15);
    await page.locator("#pause").click();
    await page.waitForFunction(() => getEmberwakeDiagnostics().state.towers.length === 0);
    expect((await diagnostics(page)).state.metal).toBeGreaterThanOrEqual(delivered.metal + 12);
    await page.locator("#advance").click();
    await page.waitForFunction(() => getEmberwakeDiagnostics().state.base.x === 8 && !getEmberwakeDiagnostics().state.base.path.length);
    await page.locator("#advance").click();
    await expect(page.locator("#upgrade-dialog")).toBeVisible();
    await saved(page);
    const upgrade = (await diagnostics(page)).state;
    expect(upgrade.pendingUpgrade).toBe(true);
    await page.reload(); await ready(page);
    expect((await diagnostics(page)).state).toEqual(upgrade);
    expect((await diagnostics(page)).paused).toBe(true);
    await page.locator("#begin").click();
    await expect(page.locator("#upgrade-dialog")).toBeVisible();
    await page.locator(".upgrade-choice").filter({ hasText: "双联火控" }).click();
    await saved(page);
    await page.locator("#advance").click();
    await page.waitForFunction(() => {
        const d = getEmberwakeDiagnostics();
        return d.state.base.x === 24 && d.navigation.center.x === 1 && !d.terrainLoading;
    });
    await page.locator("#save").click(); await saved(page);
    const end = await diagnostics(page);
    expect(end.state.upgrades).toEqual(["firepower"]);
    expect(end.navigation.chunks).toBe(9);
    expect(end.checkpoints.failedOperations).toBe(0);
    await page.reload(); await ready(page);
    expect((await diagnostics(page)).state).toEqual(end.state);
    expect(errors).toEqual([]);
});

test("accepts mobile radar commands and excludes a second save writer", async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/emberwake.html?quality=fast"); await ready(page);
    await page.locator("#begin").click();
    await page.locator("#pause").click(); await saved(page);
    const completed = (await diagnostics(page)).checkpoints.completedCheckpoints;
    // Hold completion after a real IndexedDB generation commits. Subsequent UI
    // commands must request a fresh capture, even while the app sees an old save.
    await page.evaluate(async () => {
        const { GenerationCheckpointCoordinator } = await import("/js/persistence.mjs");
        const original = GenerationCheckpointCoordinator.prototype.checkpoint;
        let first = true;
        const barrier = new Promise(resolve => { window.releaseEmberwakeSave = resolve; });
        GenerationCheckpointCoordinator.prototype.checkpoint = function (...args) {
            const result = original.apply(this, args);
            if (!first) return result;
            first = false;
            return result.then(async value => { await barrier; return value; });
        };
    });
    await page.locator('[data-mode="mine"]').click();
    await radarPoint(page, { x: 3, y: 0 }, false);
    expect((await diagnostics(page)).state.rovers[0].mine).toEqual({ x: 3, y: 0 });
    await page.waitForFunction(count => getEmberwakeDiagnostics().checkpoints.completedCheckpoints > count, completed);
    await page.locator('[data-mode="gun"]').click();
    await radarPoint(page, { x: -2, y: 0 }, false);
    expect((await diagnostics(page)).state.towers).toHaveLength(1);
    await page.evaluate(() => window.releaseEmberwakeSave()); await saved(page);
    expect((await diagnostics(page)).checkpoints.completedCheckpoints).toBe(completed + 2);
    await page.locator("#save").click(); await saved(page);
    const snapshot = (await diagnostics(page)).state;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    for (const selector of [".resources", ".tools", "#radar", "#pause"]) {
        const bounds = await page.locator(selector).boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    }
    await page.screenshot({ path: testInfo.outputPath("fortress-mobile.png") });
    const other = await context.newPage();
    await other.goto("/emberwake.html?quality=fast");
    await expect(other.locator("#welcome-status")).toContainText("另一个标签页");
    await expect(other.locator("#begin")).toBeDisabled();
    await other.close();
    await page.reload(); await ready(page);
    expect((await diagnostics(page)).state).toEqual(snapshot);
});
