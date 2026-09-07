import { expect, test } from "@playwright/test";

test("loads a playable fight, advances enemies, pauses, and opens equipment", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const application = page.locator(".survivor");
    await expect(application).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await expect(page.getByTestId("region-status")).toHaveAttribute("data-difficulty", "normal");
    await expect(page.locator(".region-cell")).toHaveCount(9);
    await page.getByText("基础与超凡属性", { exact: true }).click();
    await expect(page.locator(".all-stats dt", { hasText: "生命抽取" })).toBeVisible();
    await expect.poll(async () => Number(await page.getByTestId("enemy-count").textContent()), { timeout: 8_000 }).toBeGreaterThan(0);
    const tickBeforeMovement = Number(await page.getByTestId("elapsed-time").getAttribute("data-tick"));
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(500);
    await page.keyboard.up("KeyW");
    await expect.poll(async () => Number(await page.getByTestId("elapsed-time").getAttribute("data-tick"))).toBeGreaterThan(tickBeforeMovement);

    await page.keyboard.press("KeyP");
    await expect(application).toHaveAttribute("data-paused", "true");
    const pausedTick = Number(await page.getByTestId("elapsed-time").getAttribute("data-tick"));
    await page.waitForTimeout(300);
    expect(Number(await page.getByTestId("elapsed-time").getAttribute("data-tick"))).toBe(pausedTick);
    await page.keyboard.press("KeyP");
    await expect(application).toHaveAttribute("data-paused", "false");

    await page.keyboard.press("KeyI");
    await expect(page.getByRole("complementary", { name: "装备背包" })).toHaveClass(/open/);
    await expect(page.locator(".equipped-slot")).toHaveCount(11);
    await expect(page.locator(".gear-stars").first()).toHaveAttribute("aria-label", "1星");
    await expect(page.locator(".affix-list").first()).toHaveAttribute("aria-label", "2条词条");
    await page.screenshot({ path: "test-results/survivor-app/regional-equipment.png" });
    expect(errors).toEqual([]);
});
