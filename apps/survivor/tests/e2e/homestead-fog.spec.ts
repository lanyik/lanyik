import { expect, test } from "@playwright/test";
import { getHexCenter, type HexMap, type WorldMinimap } from "three-hex-map";
import { enterWilds, pauseCombat, inspectCombatWorker, combatWorker, advanceCombat } from "../helpers/browserCombat";
import { ProceduralCombatTerrain } from "../../src/adapters/ProceduralCombatTerrain";
import { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatSimulation } from "../../src/core/CombatSimulation";

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
                if (Math.hypot(point.x - before.combat.player.x, point.y - before.combat.player.z) > 20 && terrain.isClear(point.x, point.y, .3)) {
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
    expect((await inspect()).discovery).toEqual(before.discovery);
    const wilds = (await inspect()).combat.player;
    for (let i = 0; i < 3; i++) {
        if (i === 0) await page.keyboard.press("KeyH");
        else await page.getByRole("button", { name: "回到家园", exact: false }).click();
        await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
        await expect(page.locator(".state-overlay.loading")).toHaveCount(0);
        expect((await inspect()).combat.livingEnemies).toBe(0);
        await enterWilds(page);
        expect((await inspect()).combat.player).toMatchObject({ x: wilds.x, z: wilds.z, level: wilds.level, gold: wilds.gold });
        expect((await inspect()).discovery).toEqual(before.discovery);
    }
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
