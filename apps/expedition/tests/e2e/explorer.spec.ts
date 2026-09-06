import { expect, test } from "@playwright/test";
import { landAtRecommendation } from "./constructionHelpers";

test("the astronaut walks on the surface with a following camera and cannot build over their body", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await landAtRecommendation(page);
    const hero = page.getByTestId("explorer");
    await expect(hero).toBeVisible();
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const tick = await page.getByTestId("game-time").getAttribute("data-tick");
    const canvas = page.locator("#expedition-world");
    await canvas.focus();
    await page.keyboard.down("w");
    await expect.poll(async () => Number(await hero.getAttribute("data-distance"))).toBeGreaterThan(1.5);
    await page.keyboard.up("w");
    await expect(hero).toHaveAttribute("data-status", "idle");
    const tile = { x: await hero.getAttribute("data-tile-x"), y: await hero.getAttribute("data-tile-y") };
    await page.mouse.click(640, 360);
    await expect(page.getByTestId("tile-inspection")).toContainText(`${tile.x}, ${tile.y}`);
    await expect(page.getByTestId("game-time")).toHaveAttribute("data-tick", tick!);
    await page.mouse.wheel(0, -350);
    await page.screenshot({ path: testInfo.outputPath("astronaut-follow-camera.png") });
    await page.keyboard.press("b");
    await page.getByRole("tab", { name: "能源", exact: true }).click();
    await page.getByRole("button", { name: "选择能量辐射站", exact: true }).click();
    await page.mouse.move(640, 360);
    await expect(page.getByTestId("placement-status")).toContainText("覆盖主角");
    const iron = await page.getByTestId("inventory-iron").getAttribute("data-amount");
    await page.mouse.click(640, 360);
    await expect(page.getByTestId("inventory-iron")).toHaveAttribute("data-amount", iron!);
    await page.keyboard.press("Escape");
    await page.locator(".planet-settings > summary").click();
    await canvas.focus();
    await page.keyboard.down("a");
    await page.getByLabel("星球种子").focus();
    await page.keyboard.up("a");
    await expect(hero).toHaveAttribute("data-status", "idle");
    const distance = await hero.getAttribute("data-distance");
    await page.getByLabel("星球种子").fill("wasd");
    await page.keyboard.press("w");
    await expect(hero).toHaveAttribute("data-distance", distance!);
    expect(errors).toEqual([]);
});

test("survey navigation walks around buildings and arrives beside the ore without teleporting", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await landAtRecommendation(page);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const immediate = await page.evaluate(() => {
        const hero = document.querySelector<HTMLElement>('[data-testid="explorer"]')!;
        const before = [hero.dataset.x, hero.dataset.z];
        document.querySelector<HTMLButtonElement>('[aria-label="定位铁矿"]')!.click();
        return new Promise<{ before: (string | undefined)[]; after: (string | undefined)[] }>(resolve => queueMicrotask(() => {
            resolve({ before, after: [hero.dataset.x, hero.dataset.z] });
        }));
    });
    expect(immediate.after).toEqual(immediate.before);
    await expect(page.locator("#expedition-world")).toBeFocused();
    await expect(page.getByTestId("explorer")).toHaveAttribute("data-status", "arrived", { timeout: 40_000 });
    expect(Number(await page.getByTestId("explorer").getAttribute("data-distance"))).toBeGreaterThan(1);
    await page.screenshot({ path: testInfo.outputPath("walk-to-ore.png") });
    expect(errors).toEqual([]);
});
