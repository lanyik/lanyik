import { expect, test } from "@playwright/test";

test("surveys a real world, selects terrain, controls time and replaces the planet", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const application = page.locator(".expedition");
    const time = page.getByTestId("game-time");
    await expect(application).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("survey-resource")).toHaveCount(3);
    await expect.poll(async () => Number(await time.getAttribute("data-tick"))).toBeGreaterThan(0);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const pausedTick = await time.getAttribute("data-tick");
    await page.mouse.click(800, 400);
    await expect(page.getByTestId("tile-inspection")).toBeVisible();
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await expect(page.getByRole("button", { name: "4×", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const [mineral, name] of [["iron", "铁矿"], ["copper", "铜矿"], ["stone", "石材"]]) {
        await page.getByRole("button", { name: `定位${name}`, exact: true }).click();
        await expect(async () => {
            await page.mouse.click(640, 360);
            await expect(page.getByTestId("mineral-inspection")).toHaveAttribute("data-mineral", mineral, { timeout: 1000 });
        }).toPass({ timeout: 20_000 });
        await expect(page.getByTestId("mineral-inspection")).toContainText("本格储量");
        if (mineral === "copper") await page.screenshot({ path: testInfo.outputPath("expedition-minerals.png") });
    }
    await expect(time).toHaveAttribute("data-tick", pausedTick!);
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect.poll(async () => Number(await time.getAttribute("data-tick"))).toBeGreaterThan(Number(pausedTick));

    for (const seed of ["expedition-2", "expedition-1"]) {
        await page.getByLabel("星球种子").fill(seed);
        await page.getByRole("button", { name: "重新勘察" }).click();
        await expect(application).toHaveAttribute("data-state", "ready");
        await expect(page.getByRole("button", { name: "1×", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByTestId("tile-inspection")).toHaveCount(0);
        await page.mouse.click(800, 400);
        await expect(page.getByTestId("tile-inspection")).toBeVisible();
    }
    expect(errors).toEqual([]);
});

test("reports an unsuitable landing survey and allows choosing a different planet", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".expedition")).toHaveAttribute("data-state", "ready");
    await page.getByLabel("星球种子").fill("expedition-3");
    await page.getByRole("button", { name: "重新勘察" }).click();
    await expect(page.getByRole("alert")).toContainText("未找到满足条件的登陆区");
    await expect(page.getByTestId("survey-resource")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeDisabled();
    await page.getByLabel("星球种子").fill("expedition-1");
    await page.getByRole("button", { name: "重新勘察" }).click();
    await expect(page.locator(".expedition")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("survey-resource")).toHaveCount(3);
});

test("shows a failed worker load and recovers only after a new survey", async ({ page }) => {
    const workerPattern = "**/world-generator.worker*.mjs*";
    await page.route(workerPattern, route => route.abort("failed"));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("alert")).toContainText("星球加载失败");
    await expect(page.locator(".expedition")).toHaveAttribute("data-state", "failed");
    await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeDisabled();
    await expect(page.getByTestId("game-time")).toHaveAttribute("data-tick", "0");
    await page.unroute(workerPattern);
    await page.getByRole("button", { name: "重新勘察" }).click();
    await expect(page.locator(".expedition")).toHaveAttribute("data-state", "ready");
    await expect.poll(async () => Number(await page.getByTestId("game-time").getAttribute("data-tick"))).toBeGreaterThan(0);
});
