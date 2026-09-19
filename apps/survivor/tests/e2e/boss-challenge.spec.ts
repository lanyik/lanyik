import { expect, test } from "@playwright/test";
import { inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";
import { CHALLENGE_ARENA } from "../../src/core/BossChallenge";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { HexMap, WorldMinimap } from "three-hex-map";

test("draggable world nodes preview real maps; challenge progress survives leave, old-slot load and refresh", async ({ page }, info) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/"); await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
    await pauseCombat(page);
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation, cp = simulation.checkpoint();
        simulation.restore({ ...cp, nextItemId: 3, skills: { ...cp.skills, points: 9 }, player: { ...cp.player, level: 10, inventory: [
            { id: 2, type: "scroll", value: "rift-lord", size: 2, rarity: "rainbow", name: "裂爪巢穴传送卷轴" }
        ] } });
    });
    await advanceCombat(page);
    const old = await page.evaluate(async () => (await window.survivorApplication!.session.save("manual-1")).checkpoint);
    await page.keyboard.press("KeyH");
    const dialog = page.getByRole("dialog", { name: "世界传送" });
    await expect(dialog.getByRole("navigation", { name: "传送区域" }).getByRole("button", { name: /^目的地：/ })).toHaveCount(6);
    const graph = dialog.getByTestId("world-travel-graph"), graphBounds = (await graph.boundingBox())!;
    const node = dialog.getByRole("button", { name: "目的地：荒野", exact: true }), nodeBefore = (await node.boundingBox())!;
    await page.mouse.move(graphBounds.x + 20, graphBounds.y + 20); await page.mouse.down({ button: "right" });
    await page.mouse.move(graphBounds.x + 70, graphBounds.y + 50, { steps: 5 }); await page.mouse.up({ button: "right" });
    expect((await node.boundingBox())!.x - nodeBefore.x).toBeCloseTo(50, 0);
    expect((await node.boundingBox())!.y - nodeBefore.y).toBeCloseTo(30, 0);
    await expect(dialog.getByRole("button", { name: "目的地：灯火营地", exact: true })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "复位世界航图", exact: true }).click();
    expect((await node.boundingBox())!.x).toBeCloseTo(nodeBefore.x, 0);
    await dialog.getByRole("button", { name: "目的地：荒野", exact: true }).click();
    await expect(dialog.getByTestId("terrain-minimap")).toHaveAttribute("data-state", "ready");
    await expect(page.locator(".survivor")).toHaveAttribute("data-location", "homestead");
    const terrainWorkers = page.workers().length;
    await dialog.getByRole("button", { name: "目的地：裂爪巢穴", exact: true }).click();
    await expect(dialog.getByTestId("terrain-minimap")).toHaveAttribute("data-state", "ready");
    await expect.poll(() => page.workers().length).toBeLessThan(terrainWorkers);
    await expect(dialog.locator(".travel-rules")).toContainText("击杀经验 ×3");
    const canvas = dialog.getByTestId("terrain-minimap"), bounds = (await canvas.boundingBox())!;
    const minimap = () => page.evaluate(() => {
        const view = (window.survivorApplication!.session as unknown as { view: { regionMaps: Map<{ minimap: WorldMinimap }, unknown> } }).view;
        return [...view.regionMaps.keys()][0].minimap.view;
    });
    const before = await minimap();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.wheel(0, -200);
    await expect.poll(async () => (await minimap()).zoom).toBeGreaterThan(before.zoom);
    await page.mouse.down({ button: "right" }); await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2, { steps: 4 }); await page.mouse.up({ button: "right" });
    await dialog.getByRole("button", { name: /^回到玩家/ }).click();
    await page.screenshot({ path: info.outputPath("challenge-world-map.png") });
    await dialog.getByRole("button", { name: "使用卷轴开启", exact: true }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "rift-lord", { timeout: 45_000 });
    await expect(page.getByTestId("enemy-count")).toHaveText("61");
    await expect(page.locator(".survivor")).toHaveAttribute("data-paused", "true");
    expect(await page.evaluate(() => {
        const view = (window.survivorApplication!.session as unknown as { view: { map: HexMap } }).view;
        const mist = view.map.getScene().getObjectByName("challenge-fixed-fog")!;
        return { visible: mist.visible, meshes: mist.children.length };
    })).toEqual({ visible: true, meshes: 2 });
    await page.screenshot({ path: info.outputPath("challenge-fog-arena.png") });
    const defeat = async (all = false) => {
        await combatWorker(page).evaluate(all => {
            const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            const runtime = simulation as unknown as { entities: CombatWorld; resolveImpacts(): void }, e = runtime.entities;
            const count = all ? e.enemies.count : 1;
            for (let i = 0; i < count; i++) {
                const target = e.enemies.slots[0], source = e.world.ids[e.player], id = e.world.ids[target];
                e.vitality.damage(source, id, e.vitals.health[target], simulation.tick, 0);
                e.vitality.defeat(source, id, simulation.tick, 0); runtime.resolveImpacts();
            }
        }, all); await advanceCombat(page);
    };
    await defeat(); await expect(page.getByTestId("enemy-count")).toHaveText("60");
    await page.evaluate(async () => { await window.survivorApplication!.session.travel("homestead"); await window.survivorApplication!.session.travel("rift-lord"); });
    await expect(page.getByTestId("enemy-count")).toHaveText("60");
    expect(await page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.player.inventory.find(item => item.type === "scroll")!.size)).toBe(1);
    await page.evaluate(cp => window.survivorApplication!.session.load(cp), old);
    await expect(page.getByTestId("enemy-count")).toHaveText("60");
    await defeat(true);
    expect(await combatWorker(page).evaluate(() => (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation.getRenderState().chests.count)).toBe(1);
    await page.evaluate(async point => { const session = window.survivorApplication!.session; session.dispatch({ type: "teleport", ...point }); await session.settled; }, { x: CHALLENGE_ARENA.x, z: CHALLENGE_ARENA.z });
    await advanceCombat(page, 1);
    const prize = await page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.player.inventory.filter(item => item.type === "equipment" && item.rarity === "rainbow" && item.stars === 3));
    expect(prize).toHaveLength(1);
    await page.evaluate(cp => window.survivorApplication!.session.load(cp), old);
    await expect(page.getByTestId("enemy-count")).toHaveText("0");
    expect(await page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.challenges["rift-lord"]!.claimed)).toBe(true);
    await page.reload(); await page.getByRole("button", { name: "继续游戏", exact: true }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "rift-lord", { timeout: 45_000 });
    await expect(page.getByTestId("enemy-count")).toHaveText("0");
    expect(await combatWorker(page).evaluate(() => (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation.getRenderState().chests.count)).toBe(0);
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await page.keyboard.press("KeyH");
        await expect(dialog).toBeVisible(); await dialog.getByRole("button", { name: "目的地：风暴祭坛", exact: true }).click();
        await expect(dialog.getByRole("button", { name: "使用卷轴开启", exact: true })).toBeDisabled();
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`challenge-travel-${viewport.width}.png`) }); await page.keyboard.press("Escape");
    }
    await page.evaluate(() => window.survivorApplication!.dispose()); await expect.poll(() => page.workers().length).toBe(0);
    expect(errors).toEqual([]);
});
