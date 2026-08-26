import { expect, Page, test } from "@playwright/test";

interface Diagnostics {
    status: string;
    generating: boolean;
    streaming?: {
        residentChunks: number;
        gpuResidentChunks: number;
        registeredObjects: number;
    };
    worldStreaming?: {
        centerChunkX: number;
        residentChunks: number;
        pendingChunks: number;
        queuedChunks: number;
    };
    rendererMemory?: { geometries: number; textures: number };
}

async function diagnostics(page: Page): Promise<Diagnostics> {
    return page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): Diagnostics;
    }).getWorldDiagnostics());
}

async function waitForWorld(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const api = window as unknown as { getWorldDiagnostics?: () => Diagnostics };
        const state = api.getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating
            && Boolean(state.worldStreaming?.residentChunks);
    });
}

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    runtimeErrors.set(page, errors);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/?infinite&x=0&y=0", { waitUntil: "domcontentloaded" });
    await waitForWorld(page);
});

test.afterEach(async ({ page }) => {
    const errors = runtimeErrors.get(page) ?? [];
    expect(errors, errors.join("\n")).toEqual([]);
});

test("streams across long distances while residency and GPU caches stay bounded", async ({ page }, testInfo) => {
    const samples: Diagnostics[] = [];
    for (const tileX of [0, 96, 240, 480, 960, 1440]) {
        await page.evaluate(x => {
            const map = (window as unknown as {
                hexWorld: { setCameraTargetTile(x: number, y: number): void };
            }).hexWorld;
            map.setCameraTargetTile(x, Math.floor(x / 9));
        }, tileX);
        const expectedChunk = Math.floor(tileX / 24);
        await page.waitForFunction(chunkX => {
            const state = (window as unknown as { getWorldDiagnostics(): Diagnostics }).getWorldDiagnostics();
            return state.worldStreaming?.centerChunkX === chunkX;
        }, expectedChunk);
        await page.waitForFunction(() => {
            const state = (window as unknown as { getWorldDiagnostics(): Diagnostics }).getWorldDiagnostics();
            return (state.worldStreaming?.pendingChunks ?? 1) === 0
                && (state.worldStreaming?.queuedChunks ?? 1) === 0;
        });
        samples.push(await diagnostics(page));
    }

    await testInfo.attach("streaming-residency-samples.json", {
        body: JSON.stringify(samples, null, 2),
        contentType: "application/json"
    });

    for (const sample of samples) {
        expect(sample.worldStreaming!.residentChunks).toBeLessThanOrEqual(49);
        expect(sample.streaming!.gpuResidentChunks).toBeLessThanOrEqual(128);
        expect(sample.streaming!.residentChunks).toBeLessThanOrEqual(192);
        expect(sample.rendererMemory!.textures).toBeLessThanOrEqual(16);
    }
    expect(samples[samples.length - 1].worldStreaming!.centerChunkX).toBe(60);
});

test("repeated world replacement does not show monotonic WebGL resource growth", async ({ page }, testInfo) => {
    const samples: Array<{ geometries: number; textures: number }> = [];
    for (let pass = 0; pass < 5; pass += 1) {
        await page.evaluate(async index => {
            const api = window as unknown as {
                worldControls: { seed: string };
                regenerateWorld(): Promise<void>;
                gc?: () => void;
            };
            api.worldControls.seed = `leak-check-${index}`;
            await api.regenerateWorld();
            api.gc?.();
        }, pass);
        await waitForWorld(page);
        await page.waitForTimeout(300);
        samples.push((await diagnostics(page)).rendererMemory!);
    }

    await testInfo.attach("webgl-resource-samples.json", {
        body: JSON.stringify(samples, null, 2),
        contentType: "application/json"
    });

    const first = samples[0];
    const last = samples[samples.length - 1];
    expect(last.geometries).toBeLessThanOrEqual(first.geometries + 16);
    expect(last.textures).toBeLessThanOrEqual(first.textures + 2);
    const geometryGrowth = samples.slice(1).every((sample, index) => sample.geometries > samples[index].geometries);
    const textureGrowth = samples.slice(1).every((sample, index) => sample.textures > samples[index].textures);
    expect(geometryGrowth && last.geometries > first.geometries + 4).toBe(false);
    expect(textureGrowth).toBe(false);
});
