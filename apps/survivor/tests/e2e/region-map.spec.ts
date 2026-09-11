import { expect, test } from "@playwright/test";
import type { HexMap, WorldMinimap } from "three-hex-map";
import { pauseCombat } from "../helpers/browserCombat";

test("samples terrain with a region wash, shares cached pages and leaves controls with the game", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await pauseCombat(page);
    const canvas = page.getByTestId("terrain-minimap"), panel = page.getByTestId("region-status");
    await expect(canvas).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await expect(panel.locator("polygon")).toHaveCount(0);
    const workers = page.workers().length;
    const inspect = () => page.evaluate(() => {
        const view = (window.survivorApplication!.session as unknown as {
            view: { map: HexMap; regionMaps: Set<{ minimap: WorldMinimap }> }
        }).view;
        return { ...[...view.regionMaps][0].minimap.view, target: view.map.getCameraTarget().toArray() };
    });
    await expect.poll(async () => (await inspect()).pendingPages, { timeout: 60_000 }).toBe(0);
    const compact = await inspect();
    expect(compact.cachedDemandedPages).toBe(compact.demandedPages);
    const pixels = await canvas.evaluate(element => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set<number>();
        for (let i = 0; i < pixels.length; i += 16) colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
        return colors.size;
    });
    expect(pixels).toBeGreaterThan(100);
    await page.screenshot({ path: testInfo.outputPath("terrain-map-compact.png") });
    await page.keyboard.press("KeyM");
    await expect(panel).toHaveClass(/expanded/);
    await expect(canvas).toHaveAttribute("data-expanded", "true");
    await expect(canvas).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await expect.poll(async () => (await inspect()).pendingPages, { timeout: 60_000 }).toBe(0);
    const expanded = await inspect();
    expect(expanded.cachedDemandedPages).toBe(expanded.demandedPages);
    expect(expanded.cachedPages).toBeLessThanOrEqual(64);
    expect(expanded.destination).toBeUndefined();
    expect(page.workers()).toHaveLength(workers);
    await page.keyboard.press("KeyT");
    expect((await inspect()).target).toEqual(expanded.target);
    await page.screenshot({ path: testInfo.outputPath("terrain-map-expanded.png") });
    await page.waitForTimeout(300);
    const idle = await inspect();
    expect(idle.pageRequests).toBe(expanded.pageRequests);
    expect(idle.demandRebuilds).toBe(expanded.demandRebuilds);
    expect(idle.renders).toBe(expanded.renders);
    await page.keyboard.press("Escape");
    await expect(panel).not.toHaveClass(/expanded/);
    await expect(canvas).toHaveAttribute("data-expanded", "false");
    expect((await inspect()).pageRequests).toBe(expanded.pageRequests);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "展开地图", exact: true }).click();
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y + bounds.height).toBeLessThan(530);
    await page.screenshot({ path: testInfo.outputPath("terrain-map-narrow.png") });
    await page.getByRole("button", { name: "收起地图", exact: true }).click();
    const released = await page.evaluate(async () => {
        const app = window.survivorApplication!;
        const view = (app.session as unknown as { view: { regionMaps: Set<{ minimap: WorldMinimap }> } }).view;
        const minimap = [...view.regionMaps][0].minimap;
        await app.dispose();
        return { maps: view.regionMaps.size, ...minimap.view };
    });
    expect(released.maps).toBe(0);
    expect(released.cachedPages).toBe(0);
    expect(released.pendingPages).toBe(0);
    expect(released.cachedPageBytes).toBe(0);
    expect(errors).toEqual([]);
});
