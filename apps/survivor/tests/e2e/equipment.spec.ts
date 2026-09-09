import { expect, test } from "@playwright/test";
import { createStarterEquipment, EMPTY_BONUSES, equipmentScore, generateEquipment, type Equipment } from "../../src/core/Equipment";
import { DeterministicRandom } from "../../src/core/DeterministicRandom";
import { BASE_LOOT_PROFILE } from "../../src/core/Loot";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { InventoryItem } from "../../src/core/InventoryItem";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { HexMap } from "three-hex-map";

test("compares gear on hover, protects upgrades during cleanup and equips a real pickup from the HUD", async ({ page }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await page.evaluate(() => window.survivorApplication!.session.dispatch({ type: "toggle-pause" }));
    const rendered = await page.evaluate(() => {
        const session = window.survivorApplication!.session;
        session.frame(performance.now());
        const runtime = session as unknown as { simulation: CombatSimulation; view: { layer: { actors: { enemies: { count: number }[][] } } } };
        const { entities, player } = runtime.simulation.getRenderState();
        const { enemies, position, enemy } = entities;
        const world = (runtime.simulation as unknown as { world: RegionalWorld }).world;
        const expected = [0, 0, 0, 0];
        let outsideActive = 0;
        for (let cursor = 0; cursor < enemies.count; cursor++) {
            const i = enemies.slots[cursor];
            const distance = Math.hypot(position.x[i] - player.x, position.z[i] - player.z);
            const homeDistance = Math.hypot(enemy.homeX[i] - player.x, enemy.homeZ[i] - player.z);
            if (Math.max(distance - position.radius[i] * 2, homeDistance) >= 30) continue;
            expected[enemy.kind[i]]++;
            if (distance <= 24 && world.lodAt(position.x[i], position.z[i]) !== "active") outsideActive++;
        }
        return { expected, actual: runtime.view.layer.actors.enemies.map(pool => pool.map(mesh => mesh.count)), outsideActive };
    });
    expect(rendered.outsideActive).toBeGreaterThan(0);
    for (let kind = 0; kind < 4; kind++) {
        expect(rendered.actual[kind].length).toBeGreaterThan(0);
        expect(rendered.actual[kind].every(count => count === rendered.expected[kind])).toBe(true);
    }
    const starter = createStarterEquipment();
    const weakBonuses = { ...EMPTY_BONUSES, damage: 1 };
    const betterBonuses = { ...starter.bonuses, damage: 50, armor: 10 };
    const better: Equipment = { ...starter, id: 9001, name: "晨光试炼弩", bonuses: betterBonuses,
        baseBonuses: { ...EMPTY_BONUSES, damage: 49, armor: 10 }, score: equipmentScore(betterBonuses) };
    const weaker: Equipment = { ...starter, id: 9002, name: "磨损短弩", bonuses: weakBonuses, baseBonuses: weakBonuses, affixes: [], score: equipmentScore(weakBonuses) };
    const random = new DeterministicRandom("dense-inventory");
    const inventory = [better, weaker, ...Array.from({ length: 16 }, (_, i) => generateEquipment(random, 9010 + i, 5 + i, BASE_LOOT_PROFILE))];
    // Arrange inventory data only; comparisons, cleanup, pickup and equip use production commands.
    await page.evaluate(items => {
        const session = window.survivorApplication!.session;
        const simulation = (session as unknown as { simulation: CombatSimulation }).simulation;
        (simulation as unknown as { inventory: InventoryItem[] }).inventory = items;
        session.dispatch({ type: "sort-inventory" });
    }, inventory);
    await page.keyboard.press("KeyC");
    const equipped = page.locator('.equipment-slot[data-slot="weapon"]');
    await equipped.hover();
    await expect(page.locator(".equipment-tooltip")).toContainText("守夜短弩");
    await expect(page.locator(".equipment-tooltip .affix-list")).toHaveAttribute("aria-label", "2条词条");
    await page.keyboard.press("KeyB");
    const bag = page.getByRole("dialog", { name: "背包", exact: true });
    await expect(bag.locator(".bag-tabs button")).toHaveCount(3);
    await expect(bag.getByRole("button", { name: /^全部/ })).toHaveCount(0);
    const candidate = bag.locator('[data-item-id="9001"]');
    await candidate.hover();
    const tooltip = page.locator(".equipment-tooltip").filter({ hasText: "晨光试炼弩" });
    await expect(tooltip).toContainText("当前装备");
    await expect(tooltip).toContainText("换装提升");
    await expect(tooltip).toContainText("守夜短弩");
    const delta = Number(await candidate.getAttribute("data-power-delta"));
    expect(delta).toBeGreaterThan(0);
    const cardBounds = (await candidate.boundingBox())!;
    const tooltipBounds = (await tooltip.boundingBox())!;
    expect(cardBounds.height).toBeLessThan(140);
    expect(tooltipBounds.x >= cardBounds.x + cardBounds.width || tooltipBounds.x + tooltipBounds.width <= cardBounds.x
        || tooltipBounds.y >= cardBounds.y + cardBounds.height || tooltipBounds.y + tooltipBounds.height <= cardBounds.y).toBe(true);
    await page.screenshot({ path: ".browser-artifacts/equipment-comparison.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await candidate.hover();
    await candidate.click();
    await expect(candidate).toHaveClass(/selected/);
    const narrowCard = (await candidate.boundingBox())!;
    const narrowTooltip = (await tooltip.boundingBox())!;
    expect(narrowTooltip.y >= narrowCard.y + narrowCard.height || narrowTooltip.y + narrowTooltip.height <= narrowCard.y).toBe(true);
    expect(narrowTooltip.x + narrowTooltip.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: ".browser-artifacts/equipment-narrow.png" });
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await expect(bag).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    await bag.getByRole("button", { name: /清理较弱装备/ }).click();
    await expect(candidate).toBeVisible();
    await expect(bag.locator('[data-item-id="9002"]')).toHaveCount(0);
    await page.getByRole("button", { name: "关闭背包", exact: true }).click();
    await page.getByRole("button", { name: "关闭角色", exact: true }).click();

    const pickup = { ...better, id: 9100, name: "破晓猎弩" };
    await page.evaluate(item => {
        const session = window.survivorApplication!.session;
        const simulation = (session as unknown as { simulation: CombatSimulation }).simulation;
        const player = simulation.getSnapshot().player;
        const source = simulation as unknown as { dropItem(item: Equipment, x: number, z: number): void; collectEquipment(): void };
        source.dropItem(item, player.x, player.z); source.collectEquipment();
        session.frame(performance.now());
    }, pickup);
    const prompt = page.getByRole("complementary", { name: "更好装备" });
    await expect(prompt).toContainText("破晓猎弩");
    const powerBefore = Number(await page.getByTestId("battle-power").textContent());
    await page.screenshot({ path: ".browser-artifacts/equipment-upgrade-prompt.png" });
    await prompt.getByRole("button", { name: "一键穿戴", exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page.getByTestId("battle-power")).toHaveText(String(powerBefore + delta));
    const released = await page.evaluate(async () => {
        const application = window.survivorApplication!;
        const budget = (application.session as unknown as { view: { map: HexMap } }).view.map.resourceBudget;
        await application.dispose();
        return budget.stats;
    });
    expect(released.disposed).toBe(true);
    expect(released.reservations).toBe(0);
    expect(released.cpuBytes).toBe(0);
    expect(released.gpuBytes).toBe(0);
    expect(errors).toEqual([]);
});
