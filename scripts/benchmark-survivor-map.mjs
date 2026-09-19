import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11"] });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url);
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await page.locator(".survivor[data-state=ready]").waitFor({ timeout: 45_000 });
    await page.keyboard.press("KeyH");
    await page.getByRole("button", { name: "目的地：荒野", exact: true }).click();
    await page.getByRole("button", { name: "出战荒野", exact: true }).click();
    await page.locator(".survivor[data-location=wilds][data-state=ready]").waitFor({ timeout: 45_000 });
    await page.evaluate(async () => {
        const session = window.survivorApplication.session;
        session.dispatch({ type: "toggle-pause" }); await session.settled;
        const adapter = [...session.view.regionMaps][0], minimap = adapter.minimap;
        const stats = { fog: [], overlay: [], render: [] };
        // Freeze published snapshots while replaying viewport/knowledge changes in this disposable page.
        adapter.update = () => {};
        window.mapProfile = { adapter, minimap, stats, sampling: false };
        for (const [owner, key, bucket] of [[adapter, "drawFog", "fog"], [minimap, "drawOverlay", "overlay"], [minimap, "render", "render"]]) {
            const original = owner[key];
            owner[key] = function (...args) {
                const start = performance.now();
                try { return original.apply(this, args); }
                finally { if (window.mapProfile.sampling) stats[bucket].push(performance.now() - start); }
            };
        }
    });
    const scenarios = {};
    for (const mode of ["heading", "follow", "explore", "pan", "zoom", "far-pan", "far-zoom"]) {
        if (mode === "pan") {
            await page.keyboard.press("KeyM");
            await page.waitForFunction(() => window.mapProfile.minimap.view.pendingPages === 0);
        }
        scenarios[mode] = await page.evaluate(async mode => {
            const profile = window.mapProfile, { adapter, minimap, stats } = profile;
            for (const key of Object.keys(stats)) stats[key] = [];
            const frames = [], start = { ...minimap.viewport };
            let last = performance.now();
            for (let i = 0; i < 120; i++) {
                await new Promise(requestAnimationFrame);
                const now = performance.now(); frames.push(now - last); last = now;
                if (mode === "far-pan" && i === 0) {
                    adapter.combat = { ...adapter.combat, player: { ...adapter.combat.player, level: 20 } };
                    minimap.zoomFactor = minimap.targetZoomFactor = 4;
                    minimap.viewport.tileSpanX = minimap.viewport.tileSpanY = 384;
                }
                if (mode === "heading") adapter.combat = { ...adapter.combat, player: { ...adapter.combat.player, heading: i * .02 } };
                else if (["follow", "explore", "pan", "far-pan"].includes(mode)) {
                    minimap.viewport.centerX = start.centerX + i * .15;
                    minimap.viewport.centerY = start.centerY + i * .08;
                    if (mode === "explore") {
                        adapter.exploration.discover(adapter.combat.player.x + i * .3, adapter.combat.player.z + i * .2);
                        adapter.discoveryRevision = adapter.exploration.snapshot.revision;
                    }
                } else {
                    const factor = 1 + i * (mode === "far-zoom" ? -.002 : .002);
                    minimap.viewport.tileSpanX = start.tileSpanX * factor;
                    minimap.viewport.tileSpanY = start.tileSpanY * factor;
                }
                profile.sampling = true; minimap.redraw(); profile.sampling = false;
            }
            const summarize = values => {
                values.sort((a, b) => a - b);
                return { n: values.length, total: values.reduce((a, b) => a + b, 0),
                    p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: Math.max(...values) };
            };
            return { frame: summarize(frames), ...Object.fromEntries(Object.entries(stats).map(([key, values]) => [key, summarize(values)])) };
        }, mode);
    }
    console.log(JSON.stringify({ url, browser: browser.version(), viewport: "1280x720", units: "ms", samplesPerScenario: 120,
        method: "Paused world, controlled minimap viewport replay; synchronous Canvas submission time, not GPU completion or combat FPS.", scenarios }, null, 2));
    await page.evaluate(() => window.survivorApplication.dispose());
} finally { await browser.close(); }
