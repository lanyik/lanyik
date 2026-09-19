import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11"] });
try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url);
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await page.locator(".survivor[data-state=ready]").waitFor({ timeout: 60_000 });
    await page.keyboard.press("KeyH");
    await page.getByRole("button", { name: "目的地：荒野", exact: true }).click();
    await page.getByRole("button", { name: "出战荒野", exact: true }).click();
    await page.locator(".survivor[data-state=ready][data-location=wilds]").waitFor({ timeout: 60_000 });
    await page.keyboard.press("KeyM");
    await page.waitForFunction(() => [...window.survivorApplication.session.view.regionMaps.keys()][0].minimap.view.pendingPages === 0,
        undefined, { timeout: 60_000 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.evaluate(() => {
        const adapter = [...window.survivorApplication.session.view.regionMaps.keys()][0], minimap = adapter.minimap;
        const stats = {};
        window.mapProfile = { minimap, stats, active: false, frames: [], longTasks: [] };
        for (const [owner, key, bucket] of [[adapter, "drawFog", "fog"], [adapter.fog, "paint", "fogRebuild"],
            [minimap, "drawOverlay", "overlay"], [minimap, "render", "render"], [minimap, "syncPageDemand", "demand"]]) {
            const original = owner[key];
            owner[key] = function (...args) {
                const start = performance.now();
                try { return original.apply(this, args); }
                finally { if (window.mapProfile.active) (stats[bucket] ??= []).push(performance.now() - start); }
            };
        }
        new PerformanceObserver(list => {
            if (window.mapProfile.active) window.mapProfile.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })));
        }).observe({ type: "longtask", buffered: true });
        let last = performance.now();
        const frame = time => {
            if (window.mapProfile.active) window.mapProfile.frames.push(time - last);
            last = time; requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    });
    const scenarios = [];
    for (const mode of ["idle", "drag", "far-drag"]) {
        const bounds = await page.getByTestId("terrain-minimap").boundingBox();
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        if (mode === "far-drag") {
            await page.mouse.move(center.x, center.y);
            // Deltas are capped per event; several real events must reach the farthest scale.
            for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(100); }
            await page.waitForFunction(() => window.mapProfile.minimap.view.tileSpanX === 384);
            await page.waitForTimeout(1500);
        }
        const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(metric => [metric.name, metric.value]));
        const before = await metrics();
        await page.evaluate(() => {
            const profile = window.mapProfile;
            for (const key of ["fog", "fogRebuild", "overlay", "render", "demand"]) profile.stats[key] = [];
            profile.frames = []; profile.longTasks = []; profile.active = true; profile.start = profile.minimap.view;
        });
        if (mode === "idle") await page.waitForTimeout(6000);
        else for (let i = 0; i < 6; i++) {
            await page.mouse.move(center.x + bounds.width * .35, center.y + bounds.height * .12);
            await page.mouse.down({ button: "right" });
            await page.mouse.move(center.x - bounds.width * .35, center.y - bounds.height * .12, { steps: 60 });
            await page.mouse.up({ button: "right" });
        }
        const after = await metrics();
        const data = await page.evaluate(() => {
            const profile = window.mapProfile; profile.active = false;
            const summarize = values => {
                values.sort((a, b) => a - b);
                return { n: values.length, total: values.reduce((a, b) => a + b, 0), p50: values[Math.floor(values.length * .5)] ?? 0,
                    p95: values[Math.floor(values.length * .95)] ?? 0, max: values.at(-1) ?? 0 };
            };
            return { mapBefore: profile.start, mapAfter: profile.minimap.view, frames: summarize(profile.frames), longTasks: profile.longTasks,
                stats: Object.fromEntries(Object.entries(profile.stats).map(([key, values]) => [key, summarize(values)])) };
        });
        scenarios.push({ mode, ...data, metrics: Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"]
            .map(key => [key, (after[key] - before[key]) * 1000])) });
    }
    console.log(JSON.stringify({ url, browser: browser.version(), viewport: "1920x1080", units: "ms",
        method: "Real pointer/wheel input: 6 drags x 60 moves. World and page scheduling remain active; no viewport mutation or snapshot freeze.", scenarios }, null, 2));
    await page.evaluate(() => window.survivorApplication.dispose());
} finally { await browser.close(); }
