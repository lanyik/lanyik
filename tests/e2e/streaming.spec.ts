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

async function observeSurfaceLayerDraws(page: Page): Promise<Readonly<{
    ground: readonly number[];
    expectedGround: readonly number[];
    water: readonly number[];
    expectedWater: readonly number[];
}>> {
    return page.evaluate(async () => {
        const browser = window as unknown as {
            hexWorld: {
                renderer: { getContext(): WebGL2RenderingContext };
                runtime: {
                    presentation: {
                        ground: { chunks: Map<string, { slot: { layerIndex: number }; mesh: { frustumCulled: boolean } }> };
                        water: { chunks: Map<string, { slot: { layerIndex: number }; mesh?: { frustumCulled: boolean } }> };
                    };
                };
            };
        };
        const presentation = browser.hexWorld.runtime.presentation;
        const groundChunks = [...presentation.ground.chunks.values()];
        const waterChunks = [...presentation.water.chunks.values()].filter(chunk => chunk.mesh);
        const meshes = [
            ...groundChunks.map(chunk => chunk.mesh),
            ...waterChunks.map(chunk => chunk.mesh!)
        ];
        const previousCulling = meshes.map(mesh => mesh.frustumCulled);
        for (const mesh of meshes) mesh.frustumCulled = false;

        const gl = browser.hexWorld.renderer.getContext();
        const mutableGl = gl as WebGL2RenderingContext & {
            drawElements: WebGL2RenderingContext["drawElements"];
        };
        const originalDrawElements = mutableGl.drawElements;
        const ground = new Set<number>();
        const water = new Set<number>();
        mutableGl.drawElements = function (...args): void {
            const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
            if (program) {
                const layerLocation = gl.getUniformLocation(program, "uLayer");
                if (layerLocation) {
                    const layer = gl.getUniform(program, layerLocation) as number;
                    const phaseLocation = gl.getUniformLocation(program, "uChunkSurfacePhase");
                    (phaseLocation ? water : ground).add(layer);
                }
            }
            originalDrawElements.apply(gl, args);
        };
        try {
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        } finally {
            mutableGl.drawElements = originalDrawElements;
            meshes.forEach((mesh, index) => { mesh.frustumCulled = previousCulling[index]; });
        }
        const sorted = (values: Iterable<number>) => [...new Set(values)].sort((first, second) => first - second);
        return {
            ground: sorted(ground),
            expectedGround: sorted(groundChunks.map(chunk => chunk.slot.layerIndex)),
            water: sorted(water),
            expectedWater: sorted(waterChunks.map(chunk => chunk.slot.layerIndex))
        };
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
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await waitForWorld(page);
});

test.afterEach(async ({ page }) => {
    const errors = runtimeErrors.get(page) ?? [];
    expect(errors, errors.join("\n")).toEqual([]);
});

test("runs only the dependency-driven 16x16 surface path inside all byte budgets", async ({ page }, testInfo) => {
    const sample = await diagnostics(page);
    const layers = await observeSurfaceLayerDraws(page);
    await testInfo.attach("surface-v2-budget.json", {
        body: JSON.stringify({ sample, layers }, null, 2),
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
    expect(layers.expectedGround.length).toBeGreaterThan(1);
    expect(layers.ground).toEqual(layers.expectedGround);
    expect(layers.expectedWater.length).toBeGreaterThan(1);
    expect(layers.water).toEqual(layers.expectedWater);
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
