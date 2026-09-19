import { expect, test } from "@playwright/test";
import { getHexCenter, type HexMap, type WorldMinimap } from "three-hex-map";
import { enterWilds, pauseCombat, inspectCombatWorker, combatWorker, advanceCombat } from "../helpers/browserCombat";
import { ProceduralCombatTerrain } from "../../src/adapters/ProceduralCombatTerrain";
import { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";
import type { Group, Mesh } from "three";
import type { MapFog } from "../../src/adapters/MapFog";
import type { Exploration } from "../../src/core/Exploration";

test("map fog stays opaque outside discovery and reuses its raster while the viewport moves", async ({ page }) => {
    await page.goto("/"); await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page); await pauseCombat(page);
    const result = await page.evaluate(() => {
        const view = (window.survivorApplication!.session as unknown as { view: { regionMaps: Set<{
            fog: { draw: MapFog["draw"]; paint: (...args: unknown[]) => void }; exploration: Exploration; regions: RegionalWorld;
        }> } }).view;
        const { fog, exploration, regions } = [...view.regionMaps][0];
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
        const context = canvas.getContext("2d")!, paint = fog.paint;
        let rebuilds = 0;
        fog.paint = function (...args) { rebuilds++; paint.apply(this, args); };
        const region = regions.regionAtHex(-8, -3), x = region.centerX, z = region.centerZ;
        const column = x / 1.5, left = Math.floor(column), fraction = column - left;
        const center = { x: column + .5, y: z / Math.sqrt(3) - (left % 2 === 0 ? 1 - fraction : fraction) * .5 + .5 };
        const extent = { originX: center.x - 64, originY: center.y - 64, tileSpanX: 128, tileSpanY: 128 };
        const draw = (level = 1) => {
            context.clearRect(0, 0, 256, 256);
            fog.draw(context, { content: { x: 0, y: 0, width: 256, height: 256 }, extent }, exploration, level, regions);
        };
        const alpha = () => context.getImageData(128, 128, 1, 1).data[3];
        try {
            draw(region.level); const equalLevel = alpha();
            draw(region.level + 1); const lowerLevel = alpha();
            draw(); const unseen = alpha(), initial = rebuilds;
            // Small pans, heading redraws and continuous zoom share the same overscan image.
            for (let i = 0; i < 20; i++) { extent.originX += .1; extent.originY -= .1; extent.tileSpanX -= .1; draw(); }
            const warm = rebuilds - initial;
            extent.originX = center.x - 64; extent.originY = center.y - 64; extent.tileSpanX = 128;
            exploration.discover(x, z); draw(); const discovery = rebuilds - initial, discovered = alpha();
            const samples: { radius: number; alpha: number }[] = [];
            for (const radius of [45, 75]) for (let i = 0; i < 16; i++) {
                const sx = x + Math.cos(i * Math.PI / 8) * radius, sz = z + Math.sin(i * Math.PI / 8) * radius;
                const tx = sx / 1.5, lx = Math.floor(tx), f = tx - lx;
                const px = (tx + .5 - extent.originX) * 2;
                const py = (sz / Math.sqrt(3) - (lx % 2 === 0 ? 1 - f : f) * .5 + .5 - extent.originY) * 2;
                samples.push({ radius, alpha: context.getImageData(Math.floor(px), Math.floor(py), 1, 1).data[3] });
            }
            extent.originX += 400; draw(); const outside = rebuilds - initial;
            extent.tileSpanX = extent.tileSpanY = 256; draw(); const zoom = rebuilds - initial;
            return { equalLevel, lowerLevel, unseen, discovered, warm, discovery, outside, zoom, samples, chunks: regions.chunks.size };
        } finally { fog.paint = paint; }
    });
    expect(result).toMatchObject({ equalLevel: 255, lowerLevel: 0, unseen: 255, discovered: 0,
        warm: 0, discovery: 1, outside: 2, zoom: 3, chunks: 0 });
    for (const sample of result.samples) expect(sample.alpha).toBe(sample.radius === 45 ? 0 : 255);
    await page.evaluate(() => window.survivorApplication!.dispose());
});

test("home uses downloaded buildings, coastal sea, manual spells and a selectable travel chart", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/"); await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
    const home = await page.evaluate(() => {
        const view = (window.survivorApplication!.session as unknown as { view: { map: HexMap } }).view;
        const root = view.map.getScene().getObjectByName("homestead-buildings") as Group;
        return { buildings: root.children.filter(child => (child as Mesh).isMesh).map(child => {
            const mesh = child as Mesh; return { name: mesh.name, vertices: mesh.geometry.getAttribute("position").count, colours: mesh.geometry.hasAttribute("color") };
        }), sea: root.getObjectByName("homestead-surrounding-sea")!.children.length };
    });
    expect(home.buildings).toHaveLength(4); expect(home.sea).toBe(3);
    expect(home.buildings.every(mesh => mesh.vertices > 500 && mesh.colours)).toBe(true);
    await page.keyboard.press("Digit2");
    await expect.poll(() => page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.player.skills.remaining.frost)).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath("home-frost.png") });
    await page.keyboard.press("KeyH");
    const dialog = page.getByRole("dialog", { name: "世界传送" });
    await expect(dialog).toBeVisible(); await expect(page.locator(".survivor")).toHaveAttribute("data-paused", "true");
    await page.getByRole("button", { name: "目的地：荒野", exact: true }).hover();
    await expect(dialog.locator(".travel-details h3")).toHaveText("荒野");
    await expect(dialog.getByRole("button", { name: "当前所在", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "目的地：荒野", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "出战荒野", exact: true })).toBeEnabled();
    await expect(page.locator(".survivor")).toHaveAttribute("data-location", "homestead");
    await page.screenshot({ path: info.outputPath("world-travel.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0); await expect(page.locator(".survivor")).toHaveAttribute("data-paused", "false");
    await page.evaluate(async () => {
        const session = window.survivorApplication!.session;
        session.dispatch({ type: "teleport", x: 3, z: 55 }); await session.settled;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath("home-coast.png") });
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await page.keyboard.press("KeyH");
        await expect(dialog).toBeVisible();
        const chart = (await dialog.boundingBox())!;
        expect(chart.x).toBeGreaterThanOrEqual(0); expect(chart.y).toBeGreaterThanOrEqual(0);
        expect(chart.x + chart.width).toBeLessThanOrEqual(viewport.width);
        expect(chart.y + chart.height).toBeLessThanOrEqual(viewport.height);
        const rows = await page.locator(".interface-menu > button").evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size);
        expect(rows).toBeLessThanOrEqual(2);
        const travel = (await page.locator(".interface-menu button").filter({ has: page.locator("kbd", { hasText: /^H$/ }) }).boundingBox())!;
        expect(travel.y).toBeGreaterThan(viewport.height / 2);
        await page.screenshot({ path: info.outputPath(`travel-${viewport.width}.png`) });
        await page.keyboard.press("KeyH");
    }
    await page.evaluate(() => window.survivorApplication!.dispose());
    await expect.poll(() => page.workers().length).toBe(0); expect(errors).toEqual([]);
});

test("safe home, fog authority, strict level unlock and saved wilderness return survive world replacement", async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
    await expect(page.getByTestId("region-status")).toContainText("64 × 64");
    expect(await page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.livingEnemies)).toBe(0);
    await page.screenshot({ path: info.outputPath("homestead.png") });
    await enterWilds(page); await pauseCombat(page);
    const inspect = () => page.evaluate(() => {
        const session = window.survivorApplication!.session;
        const view = (session as unknown as { view: { map: HexMap; regionMaps: Set<{ minimap: WorldMinimap }> } }).view;
        return { ...[...view.regionMaps][0].minimap.view, combat: session.getSnapshot().combat!, discovery: session.getSnapshot().exploration! };
    });
    await page.keyboard.press("KeyM");
    const canvas = page.getByTestId("terrain-minimap");
    await expect(canvas).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    const before = await inspect(), terrain = new ProceduralCombatTerrain(before.combat.world.seed);
    const world = new RegionalWorld(before.combat.world.seed, before.combat.world.origin);
    let target: { tileX: number; tileY: number; x: number; z: number; level: number } | undefined;
    try {
        for (let x = Math.ceil(before.originX! + 8); x < before.originX! + before.tileSpanX! - 8 && !target; x++) {
            for (let y = Math.ceil(before.originY! + 8); y < before.originY! + before.tileSpanY! - 8 && !target; y++) {
                const point = getHexCenter(x, y, 1);
                if (Math.hypot(point.x - before.combat.player.x, point.y - before.combat.player.z) > 65 && terrain.isClear(point.x, point.y, .3)) {
                    target = { tileX: x, tileY: y, x: point.x, z: point.y, level: world.regionAt(point.x, point.y).level };
                }
            }
        }
    } finally { terrain.dispose(); }
    expect(target).toBeDefined();
    const chosen = target!, bounds = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: 6 + (chosen.tileX + .5 - before.originX!) / before.tileSpanX! * (bounds.width - 12),
        y: 6 + (chosen.tileY + .5 - before.originY!) / before.tileSpanY! * (bounds.height - 12) } });
    const teleport = page.getByRole("button", { name: "传送到目标" });
    await expect(teleport).toBeDisabled();
    await expect(page.locator(".map-destination")).toContainText("未探索");
    await page.keyboard.press("KeyT");
    expect((await inspect()).combat.player.x).toBe(before.combat.player.x);
    await page.evaluate(async target => {
        const session = window.survivorApplication!.session;
        session.dispatch({ type: "teleport", x: target.x, z: target.z }); await session.settled;
    }, chosen);
    await expect(page.getByText("目标仍被迷雾笼罩，请先步行探索或提升等级", { exact: true })).toBeVisible();
    const fogged = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
    await page.screenshot({ path: info.outputPath("wilds-fog.png") });
    for (const level of [chosen.level, chosen.level + 1]) {
        await combatWorker(page).evaluate(level => {
            const s = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            Object.assign(s, { level }); (s as unknown as { markChanged(): void }).markChanged();
        }, level);
        await advanceCombat(page);
        if (level === chosen.level) await expect(teleport).toBeDisabled();
        else await expect(teleport).toBeEnabled();
    }
    expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(fogged);
    await teleport.click();
    await expect.poll(async () => (await inspect()).combat.player.x).toBe(chosen.x);
    const arrivedDiscovery = (await inspect()).discovery;
    expect(arrivedDiscovery.revision).toBeGreaterThan(before.discovery.revision);
    const wilds = (await inspect()).combat.player;
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press("KeyH");
        await page.getByRole("button", { name: "目的地：灯火营地", exact: true }).click();
        await page.getByRole("button", { name: "回到家园", exact: false }).click();
        await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
        await expect(page.locator(".state-overlay.loading")).toHaveCount(0);
        expect((await inspect()).combat.livingEnemies).toBe(0);
        await enterWilds(page);
        expect((await inspect()).combat.player).toMatchObject({ x: wilds.x, z: wilds.z, level: wilds.level, gold: wilds.gold });
        expect((await inspect()).discovery).toEqual(arrivedDiscovery);
    }
    await page.keyboard.press("KeyH");
    await page.getByRole("button", { name: "目的地：灯火营地", exact: true }).click();
    await page.getByRole("button", { name: "回到家园", exact: false }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
    await expect(page.locator(".state-overlay.loading")).toHaveCount(0);
    await page.reload(); await page.getByRole("button", { name: "继续游戏", exact: true }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
    await enterWilds(page);
    expect((await inspect()).combat.player).toMatchObject({ x: wilds.x, z: wilds.z });
    const budget = await page.evaluate(async () => {
        const app = window.survivorApplication!, map = (app.session as unknown as { view: { map: HexMap } }).view.map;
        await app.dispose(); return map.resourceBudget.stats;
    });
    expect(budget).toMatchObject({ reservations: 0, cpuBytes: 0, gpuBytes: 0 });
    await expect.poll(() => page.workers().length).toBe(0);
    expect(errors).toEqual([]);
});
