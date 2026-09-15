import type { CombatRewards } from "../../src/core/CombatRewards";
import { expect, test } from "@playwright/test";
import { createStarterEquipment, EMPTY_BONUSES } from "../../src/core/Equipment";
import { generateOrb } from "../../src/core/Orbs";
import { createConsumable, type InventoryItem } from "../../src/core/InventoryItem";
import { RARITIES } from "../../src/core/Loot";
import { DeterministicRandom } from "../../src/core/DeterministicRandom";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import { inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("quality cleanup, orb mouse/touch swaps and all ground quality effects render through the real worker", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page);
    const random = new DeterministicRandom("loot-ui");
    const items: InventoryItem[] = [
        ...RARITIES.map((rarity, i) => ({ ...createStarterEquipment(), id: 100 + i, rarity, locked: false, bonuses: EMPTY_BONUSES })),
        generateOrb(random, 200, "rainbow"), generateOrb(random, 201, "diamond"),
        createConsumable(300, "rare", "health-percent", 5), createConsumable(301, "legendary", "mana", 3)
    ];
    await combatWorker(page).evaluate(items => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { rewards: CombatRewards; inventory: InventoryItem[]; entities: CombatWorld; };
        fixture.inventory = items;
        fixture.entities.effects.buffer.count = 0;
        const { x, z } = simulation.getSnapshot().player;
        items.forEach((item, i) => fixture.rewards.drop({ ...item, id: item.id + 1000 }, x - 4 + i * .9, z + 3));
    }, items);
    await page.evaluate(async () => {
        const session = window.survivorApplication!.session;
        session.dispatch({ type: "sort-inventory" }); await session.settled;
    });
    await advanceCombat(page);
    const worldOnly = await page.addStyleTag({ content: ".survivor { visibility: hidden; }" });
    await page.screenshot({ path: testInfo.outputPath("loot-quality-world.png") });
    await worldOnly.evaluate(element => element.parentNode!.removeChild(element));
    await page.keyboard.press("KeyB");
    const bag = page.getByRole("dialog", { name: "背包", exact: true });
    await bag.getByRole("combobox", { name: "自动售出装备品质" }).selectOption("rare");
    await expect(bag.locator('[data-kind="equipment"]')).toHaveCount(3);
    await expect(bag.locator('[data-item-id="103"]')).toHaveCount(1);
    await bag.getByRole("button", { name: /^宝珠/ }).click();
    await expect(bag.getByRole("combobox", { name: "自动分解宝珠品质" })).toHaveValue("off");
    await expect(bag.getByRole("button", { name: "丢弃", exact: true })).toHaveCount(0);
    const socket = (i: number) => bag.locator(`[data-orb-slot="${i}"]`);
    const first = bag.locator('[data-item-id="200"] .item-icon-trigger');
    await first.dragTo(socket(2)); await expect(bag.locator('[data-item-id="200"]')).toHaveCount(1);
    await first.dragTo(socket(0)); await expect(bag.locator('[data-item-id="200"]')).toHaveCount(0);
    await bag.locator('[data-item-id="201"] .item-icon-trigger').dragTo(socket(0));
    await expect(bag.locator('[data-item-id="200"]')).toHaveCount(1);
    await socket(0).locator("button").dragTo(socket(1));
    await expect(socket(1).locator(".rarity-diamond")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("orb-drag-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const touch = await page.context().newCDPSession(page);
    const source = (await first.boundingBox())!, target = (await socket(0).boundingBox())!;
    const sx = source.x + source.width / 2, sy = source.y + source.height / 2, tx = target.x + target.width / 2, ty = target.y + target.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 5; i++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx + (tx - sx) * i / 5, y: sy + (ty - sy) * i / 5 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await touch.detach();
    await expect(bag.locator('[data-item-id="200"]')).toHaveCount(0);
    await expect(socket(0).locator(".rarity-rainbow")).toHaveCount(1);
    await expect(page.locator(".equipment-tooltip")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("orb-drag-narrow.png") });
    await bag.getByRole("button", { name: /^药剂/ }).click();
    await expect(bag.getByRole("combobox", { name: "自动售出药剂品质" })).toHaveValue("off");
    await expect(bag.locator('[data-level]')).toHaveCount(0);
    await expect(bag).toContainText("恢复生命 45% 上限");
    await page.screenshot({ path: testInfo.outputPath("potion-recipes-narrow.png") });
    await bag.getByRole("combobox", { name: "自动售出药剂品质" }).selectOption("rare");
    await expect(bag.locator('[data-item-id="300"]')).toHaveCount(0);
    await expect(bag.locator('[data-item-id="301"]')).toHaveCount(1);
    await bag.locator('[data-item-id="301"]').getByRole("button", { name: "售出", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "确认物品操作" })).toContainText("获得 36 金币");
    await page.getByRole("button", { name: "确认售出物品", exact: true }).click();
    await expect(bag.locator('[data-item-id="301"]')).toHaveCount(0);
    await bag.getByRole("button", { name: /^装备/ }).click();
    await expect(bag.getByRole("combobox", { name: "自动售出装备品质" })).toHaveValue("rare");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.survivorApplication!.dispose());
});
