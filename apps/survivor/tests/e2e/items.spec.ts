import { expect, test } from "@playwright/test";
import { createConsumable, type InventoryItem } from "../../src/core/InventoryItem";
import { generateOrb } from "../../src/core/Orbs";
import { DeterministicRandom } from "../../src/core/DeterministicRandom";
import { createStarterEquipment } from "../../src/core/Equipment";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import { enterWilds, combatWorker, inspectCombatWorker, pauseCombat } from "../helpers/browserCombat";

test("item icons alone show details, Alt pins one tooltip, and potion stacks use their own bag", async ({ page }, testInfo) => {
    // Desktop and narrow interaction checks run with software WebGL in CI too.
    test.setTimeout(180_000);
    await inspectCombatWorker(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page);
    const items = [createConsumable(9000, "common", "health", 2), createConsumable(9001, "common", "health", 3),
        createConsumable(9002, "common", "mana", 4), generateOrb(new DeterministicRandom("icon"), 9003)];
    await combatWorker(page).evaluate(items => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { character: { inventory: InventoryItem[]; }; mana: number; potionCooldown: number };
        fixture.character.inventory = items; fixture.mana = 1; fixture.potionCooldown = 0;
    }, items);
    await page.evaluate(async () => { const session = window.survivorApplication!.session; session.dispatch({ type: "sort-inventory" }); await session.settled; });
    await page.keyboard.press("KeyB");
    const bag = page.getByRole("dialog", { name: "背包", exact: true });
    await expect(bag.getByLabel("装备容量 0 / 80")).toBeVisible();
    await bag.getByRole("button", { name: /^药剂/ }).click();
    await expect(bag.getByRole("button", { name: "合并药剂", exact: true })).toBeDisabled();
    await expect(bag.getByLabel("药剂容量 2 / 32")).toBeVisible();
    const health = bag.locator('[data-item-id="9000"]'), mana = bag.locator('[data-item-id="9002"]');
    await expect(health.locator(".item-icon-badge")).toHaveText("5");
    await expect(health.locator("[data-item-value]")).toHaveAttribute("data-item-value", "health");
    await health.locator(".bag-item-heading strong").hover();
    await expect(page.locator(".equipment-tooltip")).toHaveCount(0);
    await health.locator(".item-icon-trigger").hover();
    await expect(page.locator(".equipment-tooltip")).toContainText("数量 5 / 99");
    await health.locator(".bag-item-heading strong").hover();
    await expect(page.locator(".equipment-tooltip")).toHaveCount(0);
    await health.locator(".item-icon-trigger").focus();
    await page.keyboard.press("Alt");
    // A pinned, interactive tooltip may cover the next icon. Move the real pointer;
    // the tooltip must stay pinned whether the pointer reaches the icon or the popup.
    const manaIcon = (await mana.locator(".item-icon-trigger").boundingBox())!;
    await page.mouse.move(manaIcon.x + manaIcon.width / 2, manaIcon.y + manaIcon.height / 2);
    await expect(page.locator(".equipment-tooltip")).toHaveCount(1);
    await expect(page.locator(".equipment-tooltip")).toContainText("白·生命药剂");
    // Close away from icons, so uncovering the next icon is not a fresh hover.
    await bag.getByRole("heading", { name: "背包" }).hover();
    await page.keyboard.press("Escape");
    await expect(page.locator(".equipment-tooltip")).toHaveCount(0); await expect(bag).toBeVisible();
    await mana.click();
    await expect(bag.getByRole("button", { name: "使用", exact: true })).toBeDisabled();
    await page.keyboard.press("KeyP");
    await expect(page.locator(".survivor")).toHaveAttribute("data-paused", "false");
    await bag.getByRole("button", { name: "使用", exact: true }).click();
    await expect(mana.locator(".item-icon-badge")).toHaveText("3");
    await page.keyboard.press("KeyP");
    await bag.getByRole("button", { name: /^宝珠/ }).click();
    await expect(bag.getByLabel("宝珠容量 1 / 48")).toBeVisible();
    await expect(bag.locator(".inventory-card [data-item-icon=orb] .item-icon-base")).toHaveCount(1);
    await expect(bag.locator(".inventory-card [data-item-icon=orb] .item-icon-border")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await bag.locator(".inventory-card .item-icon-trigger").hover(); await page.keyboard.press("Alt");
    const tip = page.locator(".equipment-tooltip"), bounds = (await tip.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("item-icons-narrow.png") });
    await tip.getByRole("button", { name: "关闭物品详情" }).click();
    await expect(tip).toHaveCount(0);
});

test("a new run resets item selection and the selected orb socket before IDs are reused", async ({ page }) => {
    test.setTimeout(90_000);
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page);
    const equipment = { ...createStarterEquipment("ranger"), id: 2 };
    await combatWorker(page).evaluate(item => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { character: { levelValue: number; inventory: InventoryItem[]; };  };
        fixture.character.levelValue = 200; fixture.character.inventory = [item];
    }, equipment);
    const publish = async () => page.evaluate(async () => {
        const session = window.survivorApplication!.session; session.dispatch({ type: "sort-inventory" }); await session.settled;
    });
    await publish(); await page.keyboard.press("KeyC");
    await page.getByRole("button", { name: "宝珠槽 6，空", exact: true }).click();
    await page.keyboard.press("KeyB");
    const bag = page.getByRole("dialog", { name: "背包", exact: true });
    await bag.locator('[data-item-id="2"]').click();
    await expect(bag.locator('[data-item-id="2"]')).toHaveClass(/selected/);
    await page.evaluate(() => window.survivorApplication!.session.dispatch({ type: "restart" }));
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready"); await pauseCombat(page);
    await expect(bag).toHaveCount(0);
    const orb = generateOrb(new DeterministicRandom("run-reset"), 3);
    await combatWorker(page).evaluate(items => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        (simulation as unknown as { character: { inventory: InventoryItem[]; };  }).character.inventory = items;
    }, [equipment, orb]);
    await publish(); await page.keyboard.press("KeyB");
    await expect(bag.locator('[data-item-id="2"]')).not.toHaveClass(/selected/);
    await page.keyboard.press("Delete"); await expect(bag.locator('[data-item-id="2"]')).toHaveCount(1);
    await bag.getByRole("button", { name: /^宝珠/ }).click();
    await expect(bag.getByRole("combobox", { name: "嵌入宝珠槽" })).toHaveCount(0);
    await bag.locator('[data-item-id="3"] .item-icon-trigger').focus();
    await page.keyboard.press("Space"); await page.keyboard.press("Digit6");
    await expect(bag.locator('[data-item-id="3"]')).toHaveCount(1);
    await bag.locator('[data-item-id="3"] .item-icon-trigger').focus();
    await page.keyboard.press("Space"); await page.keyboard.press("Digit1");
    await expect(bag.locator('[data-orb-slot="0"] [data-item-icon="orb"]')).toHaveCount(1);
    await expect(bag.locator('[data-item-id="3"]')).toHaveCount(0);
    await page.evaluate(() => window.survivorApplication!.dispose());
});
