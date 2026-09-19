import { isBrowserConsoleFailure } from "../helpers/browserConsole";
import { expect, test } from "@playwright/test";
import { getHexCenter, type HexMap, type WorldMinimap } from "three-hex-map";
import { enterWilds, pauseCombat, inspectCombatWorker, combatWorker, advanceCombat } from "../helpers/browserCombat";
import { ProceduralCombatTerrain } from "../../src/adapters/ProceduralCombatTerrain";

test("world map reuses terrain pages and restores inspection, target selection and authoritative travel", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await inspectCombatWorker(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await pauseCombat(page);
    // This regression inspects distant map controls; fog rules have their own locked/level-unlock scenario.
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: { level: number; markChanged(): void } }).fixtureSimulation;
        simulation.level = 1000; simulation.markChanged();
    });
    await advanceCombat(page);
    const canvas = page.getByTestId("terrain-minimap"), panel = page.getByTestId("region-status");
    await expect(canvas).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await expect(panel.locator("polygon")).toHaveCount(0);
    const workers = page.workers().length;
    const inspect = () => page.evaluate(() => {
        const view = (window.survivorApplication!.session as unknown as {
            view: { map: HexMap; regionMaps: Map<{ minimap: WorldMinimap }, unknown> }
        }).view;
        const adapter = [...view.regionMaps.keys()][0] as { minimap: WorldMinimap; visibleRegions: { ring: number }[] };
        return { ...adapter.minimap.view, target: view.map.getCameraTarget().toArray(),
            camera: view.map.getCamera().position.toArray(), cameraTile: view.map.getCameraTargetTile(),
            regions: adapter.visibleRegions.map(region => region.ring), combat: window.survivorApplication!.session.getSnapshot().combat! };
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
    expect(expanded.destination).toEqual(expanded.cameraTile);
    expect(page.workers()).toHaveLength(workers);
    const tipBounds = (await panel.locator(".map-action-footer").boundingBox())!;
    expect(tipBounds.y + tipBounds.height).toBeLessThan(800);
    await page.screenshot({ path: testInfo.outputPath("terrain-map-expanded.png") });
    await page.waitForTimeout(300);
    const idle = await inspect();
    expect(idle.pageRequests).toBe(expanded.pageRequests);
    expect(idle.demandRebuilds).toBe(expanded.demandRebuilds);
    expect(idle.renders).toBe(expanded.renders);
    const boundsExpanded = (await canvas.boundingBox())!;
    const center = { x: boundsExpanded.x + boundsExpanded.width / 2, y: boundsExpanded.y + boundsExpanded.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -200);
    await expect.poll(async () => (await inspect()).zoom).toBeCloseTo(Math.exp(.3), 5);
    expect((await inspect()).camera).toEqual(expanded.camera);
    const zoomed = await inspect();
    await page.mouse.down({ button: "right" });
    await expect(canvas).toHaveAttribute("data-panning", "true");
    await page.mouse.move(center.x + 170, center.y + 70, { steps: 5 });
    await page.mouse.up({ button: "right" });
    await expect(canvas).toHaveAttribute("data-panning", "false");
    const panned = await inspect();
    expect(panned.originX).toBeLessThan(zoomed.originX! - 15);
    expect(panned.originY).toBeLessThan(zoomed.originY! - 5);
    expect(panned.target).toEqual(expanded.target);
    expect(panned.combat.player).toEqual(expanded.combat.player);
    await page.keyboard.press("Space");
    const recentered = await inspect();
    expect(recentered.originX! + recentered.tileSpanX! / 2).toBeCloseTo(expanded.cameraTile!.x + .5);
    expect(recentered.originY! + recentered.tileSpanY! / 2).toBeCloseTo(expanded.cameraTile!.y + .5);
    expect(recentered.zoom).toBeCloseTo(zoomed.zoom);
    // Repeated panning inspects distant metadata without moving the world camera or loading encounters.
    for (let i = 0; i < 5; i++) {
        await page.mouse.move(center.x, center.y); await page.mouse.down({ button: "right" });
        await page.mouse.move(center.x - 220, center.y, { steps: 3 }); await page.mouse.up({ button: "right" });
    }
    const distant = await inspect();
    expect(Math.max(...distant.regions)).toBeGreaterThan(Math.max(...expanded.regions) + 3);
    expect(distant.combat.chunks).toEqual(expanded.combat.chunks);
    await page.getByRole("button", { name: "回到玩家" }).click();
    // Closing discards inspection state without relocating the player.
    await page.keyboard.press("Escape");
    await expect(panel).not.toHaveClass(/expanded/);
    await expect(canvas).toHaveAttribute("data-expanded", "false");
    expect((await inspect()).combat.player).toEqual(expanded.combat.player);
    await canvas.click();
    await expect(panel).toHaveClass(/expanded/);
    const selectionView = await inspect();
    const terrain = new ProceduralCombatTerrain(selectionView.combat.world.seed);
    const choices: { clear: boolean; tile: { x: number; y: number }; x: number; z: number }[] = [];
    try {
        for (let x = Math.ceil(selectionView.originX! + 4); x < selectionView.originX! + selectionView.tileSpanX! - 4 && choices.length < 2; x++) {
            for (let y = Math.ceil(selectionView.originY! + 4); y < selectionView.originY! + selectionView.tileSpanY! - 4 && choices.length < 2; y++) {
                const point = getHexCenter(x, y, 1), clear = terrain.isClear(point.x, point.y, .3);
                if (!choices.some(choice => choice.clear === clear)) choices.push({ clear, tile: { x, y }, x: point.x, z: point.y });
            }
        }
    } finally { terrain.dispose(); }
    expect(choices).toHaveLength(2);
    for (const choice of choices.sort((a, b) => Number(a.clear) - Number(b.clear))) {
        if (!(await inspect()).expanded) await page.keyboard.press("KeyM");
        const current = await inspect(), bounds = (await canvas.boundingBox())!;
        await canvas.click({ position: { x: 6 + (choice.tile.x + .5 - current.originX!) / current.tileSpanX! * (bounds.width - 12),
            y: 6 + (choice.tile.y + .5 - current.originY!) / current.tileSpanY! * (bounds.height - 12) } });
        expect((await inspect()).destination).toEqual(choice.tile);
        expect((await inspect()).combat.player).toEqual(expanded.combat.player);
        if (choice.clear) await page.getByRole("button", { name: "传送到目标" }).click();
        else await page.keyboard.press("KeyT");
        await expect(panel).not.toHaveClass(/expanded/);
        if (choice.clear) {
            await expect.poll(async () => (await inspect()).combat.player.x).toBe(choice.x);
            expect((await inspect()).combat.player.z).toBe(choice.z);
            await expect.poll(async () => (await inspect()).target[0]).toBeCloseTo(choice.x * 34);
        } else {
            await expect(page.getByText("目标位置无法落脚，请选择平坦陆地", { exact: true })).toBeVisible();
            expect((await inspect()).target).toEqual(expanded.target);
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "展开地图", exact: true }).click();
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: testInfo.outputPath("terrain-map-narrow.png") });
    await page.getByRole("button", { name: "收起地图", exact: true }).click();
    await page.keyboard.press("KeyM"); await page.keyboard.press("KeyK");
    await expect(panel).not.toHaveClass(/expanded/);
    await expect(canvas).toHaveAttribute("data-expanded", "false");
    await page.keyboard.press("Escape");
    const released = await page.evaluate(async () => {
        const app = window.survivorApplication!;
        const view = (app.session as unknown as { view: { regionMaps: Map<{ minimap: WorldMinimap }, unknown> } }).view;
        const minimap = [...view.regionMaps.keys()][0].minimap;
        await app.dispose();
        return { maps: view.regionMaps.size, ...minimap.view };
    });
    expect(released.maps).toBe(0);
    expect(released.cachedPages).toBe(0);
    expect(released.pendingPages).toBe(0);
    expect(released.cachedPageBytes).toBe(0);
    expect(errors).toEqual([]);
});
