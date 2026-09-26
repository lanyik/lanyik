import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createStarterEquipment, EMPTY_BONUSES, equipmentScore, type Equipment } from "../../src/core/Equipment";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat } from "../helpers/browserCombat";

test("Shift locking stays safe with W, repeats and auto-sale; diagnostics survive reload and export", async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [], crashes: string[] = [];
    page.on("pageerror", error => errors.push(error.message)); page.on("crash", () => crashes.push("crashed"));
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await pauseCombat(page);
    await expect.poll(() => page.evaluate(() => window.survivorApplication!.session.getSnapshot().saveStatus.busy)).toBe(false);
    const base = createStarterEquipment("ranger"), bonuses = { ...EMPTY_BONUSES, damage: 1 };
    const weak: Equipment = { ...base, id: 901, name: "解锁回收测试弩", locked: true, bonuses, baseBonuses: bonuses, affixes: [], score: equipmentScore(bonuses) };
    await combatWorker(page).evaluate(items => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const saved = simulation.checkpoint();
        simulation.restore({ ...saved, nextItemId: 10_000, player: { ...saved.player, inventory: items } });
    }, [{ ...base, id: 900, locked: true }, weak]);
    await page.keyboard.press("KeyB");
    const bag = page.getByRole("dialog", { name: "背包", exact: true }), cell = bag.locator('[data-item-id="900"]');
    await expect(cell).toHaveClass(/item-locked/);
    await cell.click({ modifiers: ["Control"] }); await expect(cell).toHaveClass(/item-locked/);
    await page.keyboard.down("Shift"); await page.keyboard.down("KeyW");
    await cell.click({ modifiers: ["Shift"] }); await expect(cell).not.toHaveClass(/item-locked/);
    await page.keyboard.up("KeyW"); await page.keyboard.up("Shift");
    for (let i = 0; i < 6; i++) {
        await cell.click({ modifiers: ["Shift"] });
        if (i % 2 === 0) await expect(cell).toHaveClass(/item-locked/);
        else await expect(cell).not.toHaveClass(/item-locked/);
    }
    await cell.focus(); await page.keyboard.down("Shift"); await page.keyboard.down("Space");
    await expect(cell).toHaveClass(/item-locked/);
    await page.keyboard.down("Space"); await page.keyboard.up("Space"); await page.keyboard.up("Shift");
    await expect(cell).toHaveClass(/item-locked/);
    await bag.getByText("管理", { exact: true }).click();
    await bag.getByRole("combobox", { name: "自动售出装备品质" }).selectOption("rainbow");
    await bag.getByText("管理", { exact: true }).click();
    const inferior = bag.locator('[data-item-id="901"]'); await expect(inferior).toHaveClass(/item-locked/);
    await inferior.locator(".item-icon-trigger").hover();
    await expect(page.getByRole("tooltip")).toContainText(weak.name);
    await inferior.locator(".item-icon-trigger").focus(); await page.keyboard.press("Shift+Space");
    await expect(inferior).toHaveCount(0); await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(bag).toBeVisible(); await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready");
    await page.keyboard.press("KeyJ");
    const forge = page.getByRole("dialog", { name: "打造", exact: true }), gear = forge.locator('[data-craft-equipment="900"]');
    await gear.focus(); await page.keyboard.down("Shift"); await page.keyboard.down("Space");
    await expect(gear).not.toHaveClass(/item-locked/);
    await page.keyboard.down("Space"); await page.keyboard.up("Space"); await page.keyboard.up("Shift");
    await expect(gear).not.toHaveClass(/item-locked/);
    await expect(forge.locator('[data-bench-slot="source"]')).not.toContainText(base.name);
    await expect(page.locator(".skill-drag-ghost")).toHaveCount(0);
    await forge.getByRole("button", { name: /锁定模式/ }).click(); await gear.click();
    await expect(gear).toHaveClass(/item-locked/);
    expect(errors).toEqual([]); expect(crashes).toEqual([]);

    await page.keyboard.press("KeyO"); await page.getByText("诊断与日志", { exact: true }).click(); await expect(page.getByRole("button", { name: "导出诊断日志" })).toBeVisible();
    // A real uncaught browser error exercises persistence, independently of the safe interaction above.
    await page.evaluate(() => { setTimeout(() => { throw new Error("runtime-log-e2e"); }, 0); });
    await expect.poll(() => errors).toEqual(["runtime-log-e2e"]);
    await page.reload(); await expect(page.locator(".survivor")).toHaveAttribute("data-state", "menu");
    const downloading = page.waitForEvent("download");
    await page.getByText("诊断与日志", { exact: true }).click();
    await page.getByRole("button", { name: "导出诊断日志" }).click();
    const download = await downloading; await download.saveAs(info.outputPath("runtime-log.json"));
    const report = JSON.parse(await readFile(info.outputPath("runtime-log.json"), "utf8"));
    expect(report.storageError).toBeUndefined(); expect(report.entries.length).toBeLessThanOrEqual(64);
    expect(report.entries.some((entry: { event: string; detail: string }) => entry.event === "window-error" && entry.detail.includes("runtime-log-e2e"))).toBe(true);
    expect(report.entries.some((entry: { event: string; detail: string }) => entry.event === "inventory-command" && entry.detail.includes('"itemId":901'))).toBe(true);
    expect(report.entries.filter((entry: { event: string }) => entry.event === "page-start")).toHaveLength(2);
    expect(crashes).toEqual([]);
});
