import { expect, test } from "@playwright/test";

const environment = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
}).process?.env;
const requestedIterations = Number.parseInt(environment?.FOUNDATION_SOAK_ITERATIONS ?? "0", 10);
const soakIterations = Number.isSafeInteger(requestedIterations) && requestedIterations > 0
    ? requestedIterations
    : 0;

test.skip(soakIterations === 0, "set FOUNDATION_SOAK_ITERATIONS to enable the scheduled foundation soak");

test("long-running world replacement keeps lifecycle, work and WebGL resources bounded", async ({ page }, testInfo) => {
    test.setTimeout(Math.max(300_000, soakIterations * 2_000));
    const runtimeErrors: string[] = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") runtimeErrors.push(message.text());
    });
    await page.goto("/?infinite&x=0&y=0&quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const api = window as unknown as { getWorldDiagnostics?: () => { status: string; generating: boolean } };
        const state = api.getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating;
    });
    await page.requestGC();
    const baselineHeapBytes = await page.evaluate(() =>
        (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0);

    const result = await page.evaluate(async iterations => {
        type Sample = {
            iteration: number;
            geometries: number;
            textures: number;
            residentChunks: number;
            pendingGpuQueries: number;
            lifecyclePending: number;
            minimapPending: number;
            workPending: number;
            workBusy: number;
            domains: number;
        };
        type Diagnostics = {
            rendererMemory?: { geometries: number; textures: number };
            streaming?: { residentChunks: number };
            gpuTiming?: { pendingQueries: number };
            worldLifecycle?: { pendingTasks: number };
            minimap?: { pendingPages: number };
            work?: { pendingTasks: number; busyTasks: number; domains: Record<string, unknown> };
        };
        const api = window as unknown as {
            HexMap: { ProceduralWorldSource: new (options: Record<string, unknown>) => unknown };
            hexWorld: {
                loadWorld(options: Record<string, unknown>): Promise<void>;
                readonly settled: Promise<void>;
                readonly workCoordinator: unknown;
                readonly workStats: { disposed: boolean; pendingTasks: number; busyTasks: number; domains: Record<string, unknown> };
                readonly resourceBudget: { stats: { reservations: number; cpuBytes: number; gpuBytes: number } };
                disposeAsync(): Promise<void>;
            };
            worldMinimap: { readonly view: { pendingPages: number }; dispose(): void };
            getWorldDiagnostics(): Diagnostics;
        };
        const workerUrl = new URL("./js/world-generator.worker.mjs", window.location.href);
        const baseline = api.getWorldDiagnostics().rendererMemory ?? { geometries: 0, textures: 0 };
        const samples: Sample[] = [];
        const sampleEvery = Math.max(1, Math.floor(iterations / 25));
        const load = (iteration: number) => api.hexWorld.loadWorld({
            source: new api.HexMap.ProceduralWorldSource({
                seed: `scheduled-soak-${iteration}`,
                workerUrl,
                workerCount: 1,
                chunkSize: 24,
                cache: false,
                deltaStore: false,
                workCoordinator: api.hexWorld.workCoordinator
            }),
            initialTile: { x: iteration * 24, y: -(iteration % 31) * 12 },
            loadRadius: 0,
            retentionRadius: 1,
            maxResidentChunks: 9,
            maxRetries: 0,
            retryBaseDelayMs: 0,
            adaptiveStreaming: false
        });

        for (let iteration = 1; iteration <= iterations; iteration += 1) {
            if (iteration % 25 === 0) {
                // Periodic bursts exercise cancellation propagation as well as
                // steady sequential replacement.
                const burst = await Promise.allSettled([
                    load(iteration), load(iteration + 100_000), load(iteration + 200_000)
                ]);
                const rejected = burst.find(outcome => outcome.status === "rejected"
                    && (outcome.reason as { name?: unknown } | undefined)?.name !== "AbortError");
                if (rejected?.status === "rejected") throw rejected.reason;
                if (burst[2].status !== "fulfilled") throw burst[2].reason;
            } else {
                await load(iteration);
            }
            await api.hexWorld.settled;
            if (iteration % sampleEvery !== 0 && iteration !== iterations) continue;
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const state = api.getWorldDiagnostics();
            const memory = state.rendererMemory ?? { geometries: 0, textures: 0 };
            const sample: Sample = {
                iteration,
                geometries: memory.geometries,
                textures: memory.textures,
                residentChunks: state.streaming?.residentChunks ?? 0,
                pendingGpuQueries: state.gpuTiming?.pendingQueries ?? 0,
                lifecyclePending: state.worldLifecycle?.pendingTasks ?? 0,
                minimapPending: state.minimap?.pendingPages ?? 0,
                workPending: state.work?.pendingTasks ?? 0,
                workBusy: state.work?.busyTasks ?? 0,
                domains: Object.keys(state.work?.domains ?? {}).length
            };
            if (sample.geometries > baseline.geometries + 32
                || sample.textures > baseline.textures + 4
                || sample.residentChunks > 192
                || sample.pendingGpuQueries > 4
                || sample.lifecyclePending > 0
                // The active world's minimap deliberately continues at most
                // two non-critical page requests after render streaming has
                // settled. Superseded pools are detected by the domain bound.
                || sample.minimapPending > 2
                || sample.workPending > 2
                || sample.workBusy > 1
                || sample.domains > 3) {
                throw new Error(`foundation soak bound exceeded: ${JSON.stringify({ baseline, sample })}`);
            }
            samples.push(sample);
        }
        api.worldMinimap.dispose();
        await api.hexWorld.disposeAsync();
        return {
            baseline,
            samples,
            finalWork: api.hexWorld.workStats,
            finalResources: api.hexWorld.resourceBudget.stats
        };
    }, soakIterations);
    await page.requestGC();
    const finalHeapBytes = await page.evaluate(() =>
        (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0);

    await testInfo.attach("foundation-soak.json", {
        body: JSON.stringify({ ...result, baselineHeapBytes, finalHeapBytes }, null, 2),
        contentType: "application/json"
    });
    expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
    expect(result.samples.length).toBeGreaterThanOrEqual(Math.min(soakIterations, 20));
    expect(result.finalWork).toMatchObject({ disposed: true, pendingTasks: 0, busyTasks: 0, domains: {} });
    expect(result.finalResources).toMatchObject({ reservations: 0, cpuBytes: 0, gpuBytes: 0 });
    if (baselineHeapBytes > 0 && finalHeapBytes > 0) {
        expect(finalHeapBytes).toBeLessThanOrEqual(baselineHeapBytes + 32 * 1024 * 1024);
    }
});
