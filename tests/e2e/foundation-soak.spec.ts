import { expect, test } from "@playwright/test";

const environment = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
}).process?.env;
const requestedIterations = Number.parseInt(environment?.FOUNDATION_SOAK_ITERATIONS ?? "0", 10);
const soakIterations = Number.isSafeInteger(requestedIterations) && requestedIterations > 0
    ? requestedIterations
    : 0;

test.skip(soakIterations === 0, "set FOUNDATION_SOAK_ITERATIONS to enable the scheduled foundation soak");

test("surface v2 replacement keeps exact demand and WebGL resources bounded", async ({ page }, testInfo) => {
    test.setTimeout(Math.max(300_000, soakIterations * 8_000));
    const runtimeErrors: string[] = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") runtimeErrors.push(message.text());
    });
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics?: () => any }).getWorldDiagnostics?.();
        return state?.status === "generated" && state.renderSession?.pendingChunks === 0;
    }, undefined, { timeout: 90_000 });
    await page.requestGC();
    const baselineHeapBytes = await page.evaluate(() =>
        (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0);

    const result = await page.evaluate(async iterations => {
        const browser = window as unknown as {
            worldControls: { seed: string; initialX: number; initialY: number };
            regenerateWorld(): Promise<void>;
            getWorldDiagnostics(): any;
            hexWorld: { dispose(): void };
        };
        const baseline = browser.getWorldDiagnostics().rendererMemory;
        const samples: any[] = [];
        const sampleEvery = Math.max(1, Math.floor(iterations / 20));
        for (let iteration = 1; iteration <= iterations; iteration += 1) {
            browser.worldControls.seed = `surface-v2-soak-${iteration}`;
            browser.worldControls.initialX = iteration * 64;
            browser.worldControls.initialY = -(iteration % 17) * 32;
            await browser.regenerateWorld();
            const state = browser.getWorldDiagnostics();
            if (state.renderSession.pendingChunks !== 0
                || state.renderSession.mountedChunks !== state.renderSession.demandedChunks
                || state.renderSession.failedChunks !== 0
                || state.renderSession.mountedCompiledBytes > state.renderSession.compiledWorkingSetBudgetBytes
                || state.authority.semanticBytes > state.authority.semanticBudgetBytes
                || state.authority.hydrologyBytes > state.authority.hydrologyBudgetBytes
                || state.surfaceTextures.gpuBytes > state.surfaceTextures.gpuBudgetBytes
                || state.rendererMemory.geometries > baseline.geometries + 8
                || state.rendererMemory.textures > baseline.textures + 4) {
                throw new Error(`surface v2 soak bound exceeded: ${JSON.stringify({ baseline, state })}`);
            }
            if (iteration % sampleEvery === 0 || iteration === iterations) samples.push(state);
        }
        browser.hexWorld.dispose();
        return { baseline, samples, final: browser.getWorldDiagnostics() };
    }, soakIterations);
    await page.requestGC();
    const finalHeapBytes = await page.evaluate(() =>
        (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0);

    await testInfo.attach("surface-v2-soak.json", {
        body: JSON.stringify({ ...result, baselineHeapBytes, finalHeapBytes }, null, 2),
        contentType: "application/json"
    });
    expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
    expect(result.samples.length).toBeGreaterThanOrEqual(Math.min(soakIterations, 10));
    expect(result.final.renderSession).toBeUndefined();
    expect(result.final.worker).toMatchObject({ state: "disposed", busyWorkers: 0, queuedTasks: 0 });
    if (baselineHeapBytes > 0 && finalHeapBytes > 0) {
        expect(finalHeapBytes).toBeLessThanOrEqual(baselineHeapBytes + 48 * 1024 * 1024);
    }
});
