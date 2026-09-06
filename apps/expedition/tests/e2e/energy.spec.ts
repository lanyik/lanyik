import { expect, test, type Page } from "@playwright/test";
import { findMinerOrientation, landAtRecommendation } from "./constructionHelpers";

async function place(page: Page, category: string, name: string, preferred: { x: number; y: number }) {
    if (!(await page.getByTestId("build-toolbar").count())) await page.keyboard.press("b");
    await page.getByRole("tab", { name: category, exact: true }).click();
    await page.getByRole("button", { name: `选择${name}`, exact: true }).click();
    let point = preferred;
    // Survey terrain is authoritative: choose a visibly valid footprint in this bounded camera area.
    for (const candidate of [preferred, { x: 560, y: 360 }, { x: 860, y: 320 }, { x: 800, y: 400 },
        { x: 460, y: 400 }, { x: 500, y: 300 }, { x: 720, y: 300 }, { x: 560, y: 300 }, { x: 860, y: 380 }]) {
        point = candidate;
        await page.mouse.move(point.x, point.y);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
        if (await page.getByTestId("placement-status").getAttribute("data-valid") === "true") break;
    }
    await expect(page.getByTestId("placement-status")).toHaveAttribute("data-valid", "true");
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press("Escape");
}

test("energy categories build solar and relay models and equipment controls change actual generation", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await landAtRecommendation(page);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await expect(page.getByTestId("energy-panel")).toHaveAttribute("data-generation", "60");
    await place(page, "能源", "光能发电站", { x: 500, y: 360 });
    await expect(page.getByTestId("energy-panel")).toHaveAttribute("data-generation", "180");
    await page.getByRole("button", { name: "停止运行", exact: true }).click();
    await expect(page.getByTestId("energy-panel")).toHaveAttribute("data-generation", "60");
    await page.getByRole("button", { name: "启动设备", exact: true }).click();
    await place(page, "能源", "能量辐射站", { x: 560, y: 360 });
    await expect(page.getByTestId("building-inspection")).toHaveAttribute("data-building", "power-relay");
    await expect(page.getByTestId("device-power")).toHaveAttribute("data-network", "building-1");
    await page.keyboard.press("b");
    await page.getByRole("tab", { name: "能源", exact: true }).click();
    await page.getByRole("button", { name: "选择能量辐射站", exact: true }).click();
    await page.mouse.move(500, 300);
    await page.screenshot({ path: testInfo.outputPath("energy-catalog-and-coverage.png") });
    expect(errors).toEqual([]);
});

test("actual power shortage suspends mining until the player changes equipment priority", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await landAtRecommendation(page);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await place(page, "工业生产", "冶炼厂", { x: 500, y: 360 });
    await expect(page.getByTestId("building-inspection")).toHaveAttribute("data-building", "smelter");
    await page.getByRole("button", { name: "定位铁矿", exact: true }).click();
    await page.keyboard.press("b");
    await findMinerOrientation(page);
    await page.mouse.click(640, 360);
    await page.keyboard.press("Escape");
    await expect(page.locator(".building-state")).toHaveAttribute("data-status", "insufficient-power");
    const iron = await page.getByTestId("inventory-iron").getAttribute("data-amount");
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect.poll(async () => Number(await page.getByTestId("inventory-iron-plate").getAttribute("data-amount"))).toBeGreaterThan(0);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    expect(Number(await page.getByTestId("inventory-iron").getAttribute("data-amount"))).toBeLessThan(Number(iron));
    await page.getByLabel("供电优先级").selectOption("0");
    await expect(page.locator(".building-state")).toHaveAttribute("data-status", "mining");
    const before = Number(await page.getByTestId("inventory-iron").getAttribute("data-amount"));
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect.poll(async () => Number(await page.getByTestId("inventory-iron").getAttribute("data-amount"))).toBeGreaterThan(before);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("powered-mining.png") });
    expect(errors).toEqual([]);
});

test("real refining supplies the battery construction cost, then surplus power charges it without advancing while paused", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await landAtRecommendation(page);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await place(page, "工业生产", "冶炼厂", { x: 500, y: 360 });
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await page.getByRole("button", { name: "继续", exact: true }).click();
    for (const recipe of ["iron-plate", "copper-plate", "stone-brick"]) {
        await page.getByLabel("加工配方", { exact: true }).selectOption(recipe);
        await expect.poll(async () => Number(await page.getByTestId(`inventory-${recipe}`).getAttribute("data-amount")), { timeout: 35_000 }).toBeGreaterThanOrEqual(10);
    }
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await page.getByRole("button", { name: "停止运行", exact: true }).click();
    const plates = Number(await page.getByTestId("inventory-iron-plate").getAttribute("data-amount"));
    await place(page, "能源", "储能站", { x: 500, y: 300 });
    await expect(page.getByTestId("inventory-iron-plate")).toHaveAttribute("data-amount", String(plates - 10));
    await expect(page.getByTestId("battery-energy")).toHaveAttribute("data-joules", "0");
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect.poll(async () => Number(await page.getByTestId("battery-energy").getAttribute("data-joules"))).toBeGreaterThan(0);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const stored = await page.getByTestId("battery-energy").getAttribute("data-joules");
    await page.getByTestId("energy-panel").locator("summary").click();
    await expect(page.locator(".energy-details")).toContainText("充电 60");
    await page.screenshot({ path: testInfo.outputPath("refining-and-storage.png") });
    await expect(page.getByTestId("battery-energy")).toHaveAttribute("data-joules", stored!);
    expect(errors).toEqual([]);
});
