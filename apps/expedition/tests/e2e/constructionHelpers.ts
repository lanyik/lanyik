import { expect, type Page } from "@playwright/test";

export async function landAtRecommendation(page: Page): Promise<void> {
    await expect(page.locator(".expedition")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("game-time")).toHaveAttribute("data-tick", "0");
    await page.keyboard.press("b");
    await expect(page.getByTestId("build-toolbar")).toBeVisible();
    await page.mouse.move(640, 360);
    await expect(page.getByTestId("placement-status")).toHaveAttribute("data-valid", "true");
    await page.mouse.click(640, 360);
    await expect(page.locator(".expedition")).toHaveAttribute("data-landed", "true");
    await expect(page.getByTestId("inventory-iron")).toHaveAttribute("data-amount", "120");
}

export async function findMinerOrientation(page: Page): Promise<void> {
    await page.mouse.move(640, 360);
    for (let rotation = 0; rotation < 6; rotation += 1) {
        if (await page.getByTestId("placement-status").getAttribute("data-valid") === "true") return;
        await page.keyboard.press("r");
    }
    await expect(page.getByTestId("placement-status")).toHaveAttribute("data-valid", "true");
}

export async function setPlanet(page: Page, seed: string): Promise<void> {
    if (!(await page.getByLabel("星球种子").isVisible())) await page.locator(".planet-settings > summary").click();
    await page.getByLabel("星球种子").fill(seed);
    await page.getByRole("button", { name: "重新勘察" }).click();
}
