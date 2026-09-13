import { expect, test } from "@playwright/test";
import type { HexMap } from "three-hex-map";

test("WebGL creation failure displays its cause and retries after graphics becomes available", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
        const state = window as unknown as { graphicsUnavailable: boolean }; state.graphicsUnavailable = true;
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
            if (state.graphicsUnavailable && /^(webgl2?|experimental-webgl)$/.test(type)) return null;
            return original.call(this, type, ...args);
        } as typeof original;
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Error creating WebGL context");
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "menu");
    await page.evaluate(() => { (window as unknown as { graphicsUnavailable: boolean }).graphicsUnavailable = false; });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    expect(errors).toEqual([]);
    await page.evaluate(() => window.survivorApplication!.dispose());
    await expect.poll(() => page.workers().length).toBe(0);
});

test("closing during a stalled actor texture aborts loading and releases the world", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("**/actors/RiftSpider-normal.png", () => {});
    const requested = page.waitForRequest("**/actors/RiftSpider-normal.png");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click(); await requested;
    const budget = await page.evaluate(async () => {
        const app = window.survivorApplication!;
        const map = (app.session as unknown as { view: { map: HexMap } }).view.map;
        await app.dispose(); return map.resourceBudget.stats;
    });
    expect(budget.disposed).toBe(true); expect(budget.reservations).toBe(0);
    expect(budget.cpuBytes).toBe(0); expect(budget.gpuBytes).toBe(0);
    await expect.poll(() => page.workers().length).toBe(0);
});
