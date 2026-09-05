import { expect, Page, test } from "@playwright/test";

interface Diagnostics {
    status: string;
    generating: boolean;
    streaming?: {
        visibleChunks: number;
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
    renderer?: { calls: number; triangles: number };
    rendererPixelRatio?: number;
    adaptive?: { enabled: boolean; targetFrameMs: number };
    gpuTiming?: { supported: boolean; pendingQueries: number; completedSamples: number };
    worldLifecycle?: { state: string; pendingTasks: number; rejectedPublications: number };
    frameTasks?: { pendingTasks: number; pendingWeight: number; shedTasks: number };
    work?: {
        disposed: boolean;
        pendingTasks: number;
        pendingWeight: number;
        busyTasks: number;
        domains: Record<string, unknown>;
    };
    performance?: {
        fps: number | null;
        frameTime: number | null;
        cpuFrameMs: number | null;
        gpuFrameMs: number | null;
        workFrameMs: number | null;
        theoreticalFps: number | null;
        timingBasis: "cpuGpu" | "cpu" | "gpu" | null;
    };
    renderBackend?: { renderer: string; software: boolean };
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
    await page.goto("/?infinite&x=0&y=0&quality=fast", { waitUntil: "domcontentloaded" });
    await waitForWorld(page);
});

test.afterEach(async ({ page }) => {
    const errors = runtimeErrors.get(page) ?? [];
    expect(errors, errors.join("\n")).toEqual([]);
});

test("keeps the default infinite-world render budget bounded", async ({ page }, testInfo) => {
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics(): Diagnostics }).getWorldDiagnostics();
        return state.worldStreaming?.pendingChunks === 0
            && state.worldStreaming.queuedChunks === 0
            && (state.renderer?.triangles ?? 0) > 0
            && (state.performance?.fps ?? 0) > 0
            && (state.performance?.frameTime ?? 0) > 0;
    });
    const sample = await diagnostics(page);
    await testInfo.attach("default-render-budget.json", {
        body: JSON.stringify(sample, null, 2),
        contentType: "application/json"
    });

    expect(sample.worldStreaming!.residentChunks).toBeLessThanOrEqual(9);
    expect(sample.streaming!.visibleChunks).toBeLessThanOrEqual(12);
    expect(sample.renderer!.calls).toBeLessThanOrEqual(12);
    expect(sample.renderer!.triangles).toBeLessThan(10_000);
    expect(sample.rendererPixelRatio).toBeLessThanOrEqual(1);
    expect(sample.adaptive!.enabled).toBe(false);
    expect(sample.adaptive!.targetFrameMs).toBeCloseTo(1000 / 240);
    expect(sample.performance!.fps! * sample.performance!.frameTime!).toBeCloseTo(1000, 6);
    expect(sample.performance!.workFrameMs).toBe(Math.max(
        sample.performance!.cpuFrameMs ?? 0, sample.performance!.gpuFrameMs ?? 0
    ));
    expect(sample.performance!.theoreticalFps! * sample.performance!.workFrameMs!).toBeCloseTo(1000, 6);
    await expect(page.locator('[data-performance-value="theoreticalFps"]')).not.toHaveText("—");
    await expect(page.locator('[data-performance-value="cpuFrameMs"]')).not.toHaveText("—");
    expect(sample.renderBackend!.renderer.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as {
        hexWorld: { mountainHeight: number };
    }).hexWorld.mountainHeight)).toBe(80);
});

test("refreshes vegetation without replacing terrain or shared model preparation", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const map = (window as any).hexWorld;
        const terrain = map.terrain;
        const source = map.worldSource;
        map.grassVisible = true;
        map.grassDensity = 2;
        map.treesPerTile = 1;
        await map.vegetationRefreshQueue;
        const forestResources = map.streamedForestResources;
        const grassResources = map.streamedGrassResources;
        map.grassDensity = 3;
        map.treeScale = map.treeScale * 1.1;
        await map.vegetationRefreshQueue;
        return {
            terrain: map.terrain === terrain,
            source: map.worldSource === source,
            forest: Boolean(forestResources) && map.streamedForestResources === forestResources,
            grass: Boolean(grassResources) && map.streamedGrassResources === grassResources,
            density: map.grassDensity
        };
    });
    expect(result).toEqual({ terrain: true, source: true, forest: true, grass: true, density: 3 });
});

test("samples navigation in the shared Worker pool while browser frames continue", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const entry = "/js/pathfinding.mjs";
        const { ProceduralWorldNavigationIndex } = await import(entry);
        const map = (window as any).hexWorld;
        const source = map.worldSource;
        const completed = source.stats.completed;
        const workers = source.stats.configuredWorkers;
        const index = new ProceduralWorldNavigationIndex({ source, passable: () => true });
        let frames = 0;
        const frame = () => { frames += 1; };
        map.on("frame", frame);
        try {
            for (let x = 20; x < 32; x += 1) await index.getSummary(x, 20);
            return {
                frames,
                jobs: source.stats.completed - completed,
                workersUnchanged: source.stats.configuredWorkers === workers,
                installed: source.hasChunk(20, 20),
                summaries: index.cachedSummaries
            };
        } finally {
            map.off("frame", frame);
            index.dispose();
        }
    });
    expect(result.frames).toBeGreaterThan(0);
    expect(result.jobs).toBeGreaterThanOrEqual(12);
    expect(result.workersUnchanged).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.summaries).toBe(12);
});

test("streams across long distances while residency and GPU caches stay bounded", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
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

test("rapid world-session replacement drains cancelled work and keeps resources bounded", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const baseline = await diagnostics(page);
    const outcomes = await page.evaluate(async () => {
        const api = window as unknown as {
            HexMap: {
                ProceduralWorldSource: new (options: Record<string, unknown>) => unknown;
            };
            hexWorld: {
                loadWorld(options: Record<string, unknown>): Promise<void>;
                workCoordinator: unknown;
                settled: Promise<void>;
            };
        };
        const workerUrl = new URL("./js/world-generator.worker.mjs", window.location.href);
        const pending: Promise<void>[] = [];
        for (let generation = 0; generation < 40; generation += 1) {
            const source = new api.HexMap.ProceduralWorldSource({
                seed: `lifecycle-soak-${generation}`,
                workerUrl,
                workerCount: 1,
                chunkSize: 24,
                workCoordinator: api.hexWorld.workCoordinator
            });
            pending.push(api.hexWorld.loadWorld({
                source,
                initialTile: { x: generation * 24, y: -generation * 12 },
                loadRadius: 1,
                retentionRadius: 2,
                maxResidentChunks: 25,
                adaptiveStreaming: false
            }));
        }
        const results = await Promise.allSettled(pending);
        await api.hexWorld.settled;
        return results.map(result => {
            if (result.status === "fulfilled") return { status: result.status };
            const reason = result.reason as { name?: unknown; message?: unknown } | undefined;
            return {
                status: result.status,
                name: typeof reason?.name === "string" ? reason.name : "Error",
                message: typeof reason?.message === "string" ? reason.message : String(result.reason)
            };
        });
    });
    expect(outcomes[outcomes.length - 1]).toMatchObject({ status: "fulfilled" });
    expect(outcomes.slice(0, -1).every(outcome =>
        outcome.status === "fulfilled" || outcome.name === "AbortError"
    )).toBe(true);
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics(): Diagnostics }).getWorldDiagnostics();
        return state.worldLifecycle?.state === "active"
            && state.worldLifecycle.pendingTasks === 0
            && state.worldStreaming?.pendingChunks === 0
            && state.worldStreaming?.queuedChunks === 0
            && state.work?.pendingTasks === 0
            && state.work.busyTasks === 0;
    });
    await page.waitForTimeout(500);
    const after = await diagnostics(page);
    await testInfo.attach("lifecycle-soak.json", {
        body: JSON.stringify({ baseline, after, outcomes }, null, 2),
        contentType: "application/json"
    });

    expect(after.worldLifecycle).toMatchObject({ state: "active", pendingTasks: 0 });
    expect(after.worldStreaming!.residentChunks).toBeLessThanOrEqual(25);
    expect(after.streaming!.residentChunks).toBeLessThanOrEqual(192);
    expect(after.frameTasks!.pendingTasks).toBeLessThanOrEqual(512);
    expect(after.frameTasks!.pendingWeight).toBeLessThanOrEqual(2048);
    expect(Object.keys(after.work!.domains)).toHaveLength(3);
    expect(after.rendererMemory!.geometries).toBeLessThanOrEqual((baseline.rendererMemory?.geometries ?? 0) + 24);
    expect(after.rendererMemory!.textures).toBeLessThanOrEqual((baseline.rendererMemory?.textures ?? 0) + 4);
    expect(after.gpuTiming!.pendingQueries).toBeLessThanOrEqual(4);
});
