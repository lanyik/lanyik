import { expect, test } from "@playwright/test";
import { pauseCombat } from "../helpers/browserCombat";

test("windows keep help, actions and navigation reachable across desktop, narrow and short screens", async ({ page }, info) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/"); await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await pauseCombat(page);
    await expect.poll(() => page.evaluate(() => window.survivorApplication!.session.getSnapshot().saveStatus.busy)).toBe(false);
    const entries = [{ key: "C", name: "角色" }, { key: "B", name: "背包" }, { key: "K", name: "技能" }, { key: "J", name: "打造" }, { key: "L", name: "灵境" }, { key: "H", name: "世界传送" }, { key: "O", name: "游戏与存档" }, { key: "M", name: "地域地图" }];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1366, height: 520 }]) {
        await page.setViewportSize(viewport);
        for (const entry of entries) {
            await page.keyboard.press(`Key${entry.key}`);
            const panel = entry.key === "M" ? page.getByTestId("region-status") : page.getByRole("dialog", { name: entry.name, exact: true });
            await expect(panel).toBeVisible();
            await expect(page.locator(".run-stats")).toBeHidden();
            const help = panel.getByLabel("操作说明", { exact: true });
            await help.click(); await expect(panel.locator(".panel-help-content")).toBeVisible();
            const helpBounds = (await panel.locator(".panel-help-content").boundingBox())!;
            expect(helpBounds.x).toBeGreaterThanOrEqual(0);
            expect(helpBounds.x + helpBounds.width).toBeLessThanOrEqual(viewport.width);
            await page.keyboard.press("Escape"); await expect(panel).toBeVisible();
            await expect(panel.locator(".panel-help-content")).toBeHidden();
            const bounds = (await panel.boundingBox())!, nav = (await page.getByRole("navigation", { name: "界面快捷键" }).boundingBox())!;
            expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
            expect(bounds.y + bounds.height).toBeLessThan(nav.y);
            expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
            const footer = panel.locator(".action-footer");
            if (await footer.count()) {
                await expect(footer).toBeVisible();
                const actionBounds = (await footer.boundingBox())!;
                expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
                expect(actionBounds.y).toBeGreaterThan(bounds.y + 50);
            }
            if (entry.key === "H") {
                await expect(panel.locator(".primary-action")).toHaveCount(1);
                await expect(panel.getByRole("button", { name: "当前所在", exact: true })).toBeDisabled();
                const canvas = panel.getByTestId("terrain-minimap");
                await canvas.click();
                await expect(panel.getByRole("button", { name: "地图选点", exact: true })).toHaveAttribute("aria-pressed", "true");
                await expect(panel.getByRole("button", { name: "传送到目标", exact: true })).toBeEnabled();
                await page.keyboard.press("KeyT");
                await expect(panel).toHaveCount(0);
                await expect(page.locator(".survivor")).toHaveAttribute("data-location", "homestead");
                await expect(page.locator(".survivor")).toHaveAttribute("data-paused", "true");
            } else {
                if (entry.key === "B") await page.screenshot({ path: info.outputPath(`inventory-${viewport.width}x${viewport.height}.png`) });
                await page.keyboard.press("Escape");
            }
        }
    }
    expect(errors).toEqual([]);
});
