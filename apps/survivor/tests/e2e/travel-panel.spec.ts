import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import type {} from "../helpers/TravelInterfaceFixture";

test("autosave between pointer down and up preserves destination selection and only blocks travel", async ({ page }) => {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("../helpers/TravelInterfaceFixture.tsx", import.meta.url))],
        bundle: true, write: false, format: "esm", platform: "browser", outdir: "fixture" });
    await page.route("**/__travel-fixture", route => route.fulfill({ contentType: "text/html",
        body: '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/__travel.css"><div id="survivor-ui"></div><script type="module" src="/__travel.js"></script></html>' }));
    for (const extension of ["js", "css"]) await page.route(`**/__travel.${extension}`, route => route.fulfill({
        contentType: extension === "js" ? "application/javascript" : "text/css", body: bundle.outputFiles.find(file => file.path.endsWith(`.${extension}`))!.text }));
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/__travel-fixture");
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready");
    await page.keyboard.press("KeyH");
    const dialog = page.getByRole("dialog", { name: "世界传送" });
    await expect(page.locator(".survivor")).toHaveAttribute("data-paused", "true");
    const wilds = dialog.getByRole("button", { name: "目的地：荒野", exact: true });
    await wilds.hover(); await page.mouse.down();
    await page.evaluate(() => window.travelFixture.beginSave());
    // Saving must not invalidate a selection that is already in progress.
    await expect(wilds).toBeEnabled({ timeout: 1000 });
    await page.mouse.up();
    await expect(wilds).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.locator(".map-toolbar strong")).toHaveText("荒野");
    const travel = dialog.getByRole("button", { name: "出战荒野", exact: true });
    await expect(travel).toBeDisabled();
    await page.keyboard.press("KeyT");
    await expect(page.locator(".survivor")).toHaveAttribute("data-location", "homestead");
    await dialog.getByRole("button", { name: "关闭世界传送", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".survivor")).toHaveAttribute("data-paused", "false");
    await page.keyboard.press("KeyH"); await wilds.click();
    await expect(travel).toBeDisabled();
    await page.evaluate(() => window.travelFixture.finishSave());
    await expect(travel).toBeEnabled();
    await expect(wilds).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => window.travelFixture.dispose());
    expect(errors).toEqual([]);
});
