import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../apps/survivor/tests/helpers/InspectableCombat.worker.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "browser" });
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11"] });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route(/\/Combat\.worker-[^/]+\.js$/, route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.goto(url);
    await page.waitForFunction(() => ["menu", "ready", "failed"].includes(document.querySelector(".survivor")?.getAttribute("data-state")));
    if (await page.locator('.survivor[data-state="menu"]').count()) await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await page.locator('.survivor[data-state="ready"]').waitFor({ timeout: 45_000 });
    await page.keyboard.press("KeyH");
    await page.getByRole("button", { name: "目的地：荒野", exact: true }).click();
    await page.getByRole("button", { name: "出战荒野", exact: false }).click();
    await page.locator('.survivor[data-state="ready"][data-location="wilds"]').waitFor({ timeout: 45_000 });
    await page.waitForFunction(() => !window.survivorApplication.session.getSnapshot().travelling);
    await page.evaluate(async () => { const s = window.survivorApplication.session; s.dispatch({ type: "toggle-pause" }); await s.settled; });
    const worker = page.workers().find(worker => /\/Combat\.worker-/.test(worker.url()));
    await worker.evaluate(() => {
        const s = self.fixtureSimulation, base = s.getSnapshot().player.equipment.weapon;
        s.inventory = Array.from({ length: 80 }, (_, i) => ({ ...base, id: 100 + i, name: `高品质装备 ${i + 1}`, rarity: "rainbow", locked: false }));
        s.nextItemId = 1000; s.markChanged();
    });
    await page.evaluate(async () => { const s = window.survivorApplication.session; s.dispatch({ type: "sort-inventory" }); await s.settled; });
    const cdp = await page.context().newCDPSession(page); await cdp.send("Performance.enable");
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(entry => [entry.name, entry.value]));
    const sample = async () => {
        const before = await metrics();
        const frame = await page.evaluate(() => new Promise(resolve => {
            const deltas = [], started = performance.now(); let last = started;
            const tick = now => { deltas.push(now - last); last = now; if (now - started < 2500) requestAnimationFrame(tick); else {
                deltas.sort((a, b) => a - b); resolve({ frames: deltas.length, p95Ms: deltas[Math.floor(deltas.length * .95)] });
            } }; requestAnimationFrame(tick);
        }));
        const after = await metrics();
        return { ...frame, taskMs: (after.TaskDuration - before.TaskDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
            styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, domNodes: after.Nodes };
    };
    const closed = await sample();
    await page.keyboard.press("KeyB"); await page.locator(".inventory-window").waitFor();
    const open = await sample(), mountedCells = await page.locator('[data-testid="inventory-item"]').count();
    await page.keyboard.press("KeyJ"); await page.locator(".craft-window").waitFor();
    const forge = await sample(), mountedForge = await page.locator(".craft-cell").count();
    console.log(JSON.stringify({ url, inventoryItems: 80, closed, open, mountedCells, forge, mountedForge }, null, 2));
} finally { await browser.close(); }
