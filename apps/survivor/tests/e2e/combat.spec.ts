import { expect, test } from "@playwright/test";

test("loads a playable fight, advances enemies, pauses, and opens equipment", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const application = page.locator(".survivor");
    await expect(application).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
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
    expect(errors).toEqual([]);
});
