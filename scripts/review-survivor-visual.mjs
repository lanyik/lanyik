import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { cpus, platform, release } from "node:os";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { summarizeLatencies } from "./lib/benchmark-latency.mjs";

const [url = "http://127.0.0.1:4174", destination = ".browser-artifacts/visual-current", mode] = process.argv.slice(2);
if (process.argv.length > 5 || mode && !/^--play=(forest|clearing|shore)$/.test(mode)) throw new Error("Usage: node scripts/review-survivor-visual.mjs <url> <output-directory> [--play=forest|clearing|shore]");
const output = resolve(destination);
await mkdir(output, { recursive: true });
const fixturePath = join(output, "fixture.mjs");
await build({ entryPoints: ["scripts/lib/survivor-visual-fixture.ts"], bundle: true, outfile: fixturePath, format: "esm", platform: "node" });
const { VISUAL_SAMPLE, visualCheckpoints } = await import(pathToFileURL(fixturePath).href);
const checkpoints = visualCheckpoints();
await writeFile(join(output, "checkpoints.json"), JSON.stringify(checkpoints, null, 2));
const browser = await chromium.launch({ headless: !mode, args: ["--use-angle=d3d11"] });
const errors = [], warnings = [], samples = [];
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
try {
    const context = await browser.newContext({ viewport: VISUAL_SAMPLE.viewport, deviceScaleFactor: 1,
        recordVideo: mode ? undefined : { dir: output, size: { width: 1280, height: 720 } } });
    const scripts = [], scriptReads = [];
    if (!mode) context.on("response", response => {
        const path = new URL(response.url()).pathname;
        if (!/\.(?:mjs|js)$/.test(path)) return;
        scriptReads.push(response.body().then(body => scripts.push({ path, sha256: createHash("sha256").update(body).digest("hex") })));
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error" || /GL_INVALID/i.test(message.text())) errors.push(message.text());
        else if (message.type() === "warning") warnings.push(message.text());
    });
    await page.goto(url);
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await page.locator('.survivor[data-state="ready"]').waitFor({ timeout: 60000 });
    const select = async entry => {
        await page.evaluate(async ({ checkpoint, camera }) => {
            const session = window.survivorApplication.session;
            await session.load(checkpoint);
            const map = session.view.map, target = map.controls.target;
            map.getCamera().position.set(target.x + camera.offset[0], target.y + camera.offset[1], target.z + camera.offset[2]);
            map.getCamera().fov = camera.fov; map.getCamera().updateProjectionMatrix();
            map.controls.update(); await map.settled;
        }, { checkpoint: entry.checkpoint, camera: VISUAL_SAMPLE.camera });
        await page.locator('.survivor[data-state="ready"]').waitFor();
    };
    if (mode) {
        await select(checkpoints.find(entry => entry.id === mode.slice(7)));
        await page.evaluate(() => window.survivorApplication.session.dispatch({ type: "toggle-pause" }));
        console.log("Playable visual sample is open; close the browser window to finish.");
        await new Promise(resolve => browser.on("disconnected", resolve));
    } else {
        const capture = async id => {
            await page.waitForTimeout(VISUAL_SAMPLE.warmupMs);
            const raw = await page.evaluate(duration => new Promise((resolve, reject) => {
                const session = window.survivorApplication.session, map = session.view.map;
                const started = performance.now(), frames = [], input = [];
                const timeout = setTimeout(() => {
                    map.off("afterframe", sample); reject(new Error("Visual capture stopped receiving frames"));
                }, duration + 5000);
                const sample = frame => {
                    if (frames.length >= 4096) {
                        clearTimeout(timeout); map.off("afterframe", sample); reject(new Error("Visual capture exceeded its frame capacity")); return;
                    }
                    frames.push({ intervalMs: frame.dtS * 1000, cpuMs: frame.cpuFrameMs, gpuMs: frame.gpuFrameMs,
                        draws: frame.drawCalls, triangles: frame.triangles });
                    const latency = session.getSnapshot().performance?.inputLatencyMs;
                    if (latency !== undefined) input.push(latency);
                    if (performance.now() - started < duration) return;
                    clearTimeout(timeout);
                    map.off("afterframe", sample);
                    const renderer = map.renderer, gl = renderer.getContext(), extension = gl.getExtension("WEBGL_debug_renderer_info");
                    resolve({ frames, input, wallMs: performance.now() - started, tick: session.getSnapshot().combat.tick,
                        gameOver: session.getSnapshot().combat.gameOver, gpuTiming: map.gpuTimingStats,
                        resources: map.resourceBudget.stats, rendererMemory: { ...renderer.info.memory },
                        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
                        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                        camera: { position: map.getCamera().position.toArray(), target: map.controls.target.toArray(), fov: map.getCamera().fov }
                    });
                }; map.on("afterframe", sample);
            }), VISUAL_SAMPLE.sampleMs);
            assert.deepEqual(raw.drawingBuffer, [2560, 1440], "Review requires a native 1440p drawing buffer");
            const stats = key => { const values = raw.frames.map(frame => frame[key]).filter(value => value !== undefined); return values.length ? summarizeLatencies(values, 1000 / 60) : null; };
            samples.push({ id, ...raw, summary: { interval: stats("intervalMs"), cpu: stats("cpuMs"), gpu: stats("gpuMs") } });
            await page.screenshot({ path: join(output, `${id}.png`) });
        };
        for (const entry of checkpoints) { await select(entry); await capture(entry.id); }
        await select(checkpoints[0]);
        await page.evaluate(() => window.survivorApplication.session.dispatch({ type: "toggle-pause" }));
        await page.keyboard.down("a");
        await capture("live-movement");
        await page.keyboard.up("a");
        assert.deepEqual(errors, []);
        const video = page.video();
        await Promise.all(scriptReads);
        await context.close();
        await video.saveAs(join(output, "sample.webm"));
        const fixtureHash = createHash("sha256").update(await readFile(fixturePath)).digest("hex");
        const report = { capturedAt: new Date().toISOString(), commit, fixtureHash,
            servedScripts: scripts.sort((a, b) => a.path.localeCompare(b.path)),
            host: { os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, browser: browser.version() },
            url, fixture: VISUAL_SAMPLE, warnings,
            scope: "Three paused material checkpoints and one live movement/combat sample; production Worker and gameplay. Resource bytes are ledger estimates, not driver VRAM. GPU samples are asynchronous and absent when unsupported. Video is 720p; screenshots and rendering are native 1440p. This is B1 lighting evidence, not final art or a 60 FPS certification.", samples };
        await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ output, samples: samples.map(({ id, summary }) => ({ id,
            cpuP95Ms: summary.cpu?.p95Ms, gpuP95Ms: summary.gpu?.p95Ms, frameP99Ms: summary.interval?.p99Ms })) }, null, 2));
    }
} finally { await browser.close(); }
