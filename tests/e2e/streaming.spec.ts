import { expect, Page, test } from "@playwright/test";

interface Diagnostics {
    status: string;
    generating: boolean;
    generation: number;
    renderSession?: {
        state: string;
        demandedChunks: number;
        pendingChunks: number;
        mountedChunks: number;
        mountedCompiledBytes: number;
        compiledWorkingSetBudgetBytes: number;
        failedChunks: number;
    };
    authority?: {
        semanticBytes: number;
        semanticBudgetBytes: number;
        hydrologyBytes: number;
        hydrologyBudgetBytes: number;
    };
    compilation?: { cacheBytes: number; cacheBudgetBytes: number; activeRequests: number };
    surfaceTextures?: { allocatedSlots: number; gpuBytes: number; gpuBudgetBytes: number };
    renderer?: { calls: number; triangles: number };
    rendererMemory?: { geometries: number; textures: number };
    rendererPixelRatio?: number;
}

async function diagnostics(page: Page): Promise<Diagnostics> {
    return page.evaluate(() => (window as unknown as { getWorldDiagnostics(): Diagnostics }).getWorldDiagnostics());
}

async function waitForWorld(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics?: () => Diagnostics }).getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating
            && state.renderSession?.state === "ready"
            && state.renderSession.pendingChunks === 0
            && state.renderSession.mountedChunks === state.renderSession.demandedChunks
            && state.renderSession.mountedChunks > 0
            && (state.renderer?.triangles ?? 0) > 0;
    }, undefined, { timeout: 90_000 });
}

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    runtimeErrors.set(page, errors);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await waitForWorld(page);
});

test.afterEach(async ({ page }) => {
    const errors = runtimeErrors.get(page) ?? [];
    expect(errors, errors.join("\n")).toEqual([]);
});

test("runs only the dependency-driven 16x16 surface path inside all byte budgets", async ({ page }, testInfo) => {
    const sample = await diagnostics(page);
    await testInfo.attach("surface-v2-budget.json", {
        body: JSON.stringify(sample, null, 2),
        contentType: "application/json"
    });
    expect(sample.renderSession!.demandedChunks).toBeLessThanOrEqual(25);
    expect(sample.renderSession!.failedChunks).toBe(0);
    expect(sample.renderSession!.mountedCompiledBytes)
        .toBeLessThanOrEqual(sample.renderSession!.compiledWorkingSetBudgetBytes);
    expect(sample.authority!.semanticBytes).toBeLessThanOrEqual(sample.authority!.semanticBudgetBytes);
    expect(sample.authority!.hydrologyBytes).toBeLessThanOrEqual(sample.authority!.hydrologyBudgetBytes);
    expect(sample.compilation!.cacheBytes).toBeLessThanOrEqual(sample.compilation!.cacheBudgetBytes);
    expect(sample.surfaceTextures!.gpuBytes).toBeLessThanOrEqual(sample.surfaceTextures!.gpuBudgetBytes);
    expect(sample.rendererPixelRatio).toBeLessThanOrEqual(1);
});

test("replaces exact demand across long distances without growing residency", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const samples: Diagnostics[] = [];
    for (const x of [0, 128, 512, 1024]) {
        await page.evaluate(async tileX => {
            await (window as unknown as {
                hexWorld: { setCameraTargetTile(x: number, y: number): Promise<void> };
            }).hexWorld.setCameraTargetTile(tileX, -Math.floor(tileX / 7));
        }, x);
        await waitForWorld(page);
        samples.push(await diagnostics(page));
    }
    await testInfo.attach("surface-v2-streaming.json", {
        body: JSON.stringify(samples, null, 2),
        contentType: "application/json"
    });
    for (const sample of samples) {
        expect(sample.renderSession!.demandedChunks).toBeLessThanOrEqual(25);
        expect(sample.renderSession!.mountedChunks).toBe(sample.renderSession!.demandedChunks);
        expect(sample.surfaceTextures!.allocatedSlots).toBe(sample.renderSession!.mountedChunks);
        expect(sample.rendererMemory!.textures).toBeLessThanOrEqual(12);
    }
});

test("atomically replaces worlds without monotonic WebGL resource growth", async ({ page }, testInfo) => {
    const samples: Array<{ geometries: number; textures: number }> = [];
    for (let pass = 0; pass < 5; pass += 1) {
        await page.evaluate(async index => {
            const browser = window as unknown as {
                worldControls: { seed: string };
                regenerateWorld(): Promise<void>;
                gc?: () => void;
            };
            browser.worldControls.seed = `surface-v2-replace-${index}`;
            await browser.regenerateWorld();
            browser.gc?.();
        }, pass);
        await waitForWorld(page);
        samples.push((await diagnostics(page)).rendererMemory!);
    }
    await testInfo.attach("surface-v2-replacement.json", {
        body: JSON.stringify(samples, null, 2),
        contentType: "application/json"
    });
    const first = samples[0];
    const last = samples[samples.length - 1];
    expect(last.geometries).toBeLessThanOrEqual(first.geometries + 4);
    expect(last.textures).toBeLessThanOrEqual(first.textures + 2);
});
