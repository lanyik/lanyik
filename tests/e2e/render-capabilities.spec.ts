import { expect, test } from "@playwright/test";

test("reports the browser render-backend capabilities", async ({ page }, testInfo) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const capabilities = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        const debug = gl?.getExtension("WEBGL_debug_renderer_info");
        const gpu = navigator.gpu as GPU | undefined;
        let adapter: GPUAdapter | null = null;
        let adapterError: string | undefined;
        if (gpu) {
            try {
                adapter = await gpu.requestAdapter();
            } catch (reason) {
                adapterError = reason instanceof Error ? reason.message : String(reason);
            }
        }
        return {
            secureContext: window.isSecureContext,
            webgl2: Boolean(gl),
            webglRenderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : undefined,
            webgpuApi: Boolean(gpu),
            webgpuAdapter: Boolean(adapter),
            webgpuFeatures: adapter ? [...adapter.features].sort() : [],
            adapterError
        };
    });

    console.log(`[render-capabilities] ${JSON.stringify(capabilities)}`);
    await testInfo.attach("render-capabilities.json", {
        body: JSON.stringify(capabilities, null, 2),
        contentType: "application/json"
    });
    expect(capabilities.webgl2).toBe(true);
    expect(typeof capabilities.webgpuApi).toBe("boolean");
});

test("recovers repeatedly from real WebGL context loss with bounded resources", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/?infinite&quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const api = window as unknown as {
            getWorldDiagnostics?: () => {
                status: string;
                generating: boolean;
                renderer?: { triangles: number };
                webglContext?: { state: string };
            };
        };
        const state = api.getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating
            && state.webglContext?.state === "ready" && (state.renderer?.triangles ?? 0) > 0;
    });
    const baseline = await page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): {
            rendererMemory?: { geometries: number; textures: number };
            webglContext?: { generation: number };
        };
    }).getWorldDiagnostics());

    for (let cycle = 1; cycle <= 10; cycle += 1) {
        const supported = await page.evaluate(() => {
            const api = window as unknown as {
                hexWorld: { renderer: { getContext(): WebGL2RenderingContext } };
                contextLossExtension?: WEBGL_lose_context;
            };
            const renderer = api.hexWorld.renderer;
            const extension = renderer.getContext().getExtension("WEBGL_lose_context");
            if (extension) api.contextLossExtension = extension;
            extension?.loseContext();
            return Boolean(extension);
        });
        test.skip(!supported, "WEBGL_lose_context is unavailable");
        await page.waitForFunction(expectedLosses => {
            const context = (window as unknown as {
                getWorldDiagnostics(): { webglContext?: { state: string; losses: number } };
            }).getWorldDiagnostics().webglContext;
            return context?.state === "lost" && context.losses === expectedLosses;
        }, cycle);
        await page.evaluate(() => {
            (window as unknown as { contextLossExtension?: WEBGL_lose_context })
                .contextLossExtension?.restoreContext();
        });
        await page.waitForFunction(({ restores, generation }) => {
            const state = (window as unknown as {
                getWorldDiagnostics(): {
                    webglContext?: { state: string; restores: number; generation: number };
                    renderer?: { triangles: number };
                };
            }).getWorldDiagnostics();
            return state.webglContext?.state === "ready"
                && state.webglContext.restores === restores
                && state.webglContext.generation === generation
                && (state.renderer?.triangles ?? 0) > 0;
        }, { restores: cycle, generation: (baseline.webglContext?.generation ?? 1) + cycle });
    }

    const result = await page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): {
            rendererMemory?: { geometries: number; textures: number };
            gpuTiming?: { pendingQueries: number };
            webglContext?: { state: string; losses: number; restores: number };
            work?: { pendingTasks: number; busyTasks: number };
        };
    }).getWorldDiagnostics());
    await testInfo.attach("context-recovery.json", {
        body: JSON.stringify({ baseline, result }, null, 2),
        contentType: "application/json"
    });
    expect(pageErrors).toEqual([]);
    expect(result.webglContext).toMatchObject({ state: "ready", losses: 10, restores: 10 });
    expect(result.rendererMemory?.geometries ?? 0).toBeLessThanOrEqual((baseline.rendererMemory?.geometries ?? 0) + 24);
    expect(result.rendererMemory?.textures ?? 0).toBeLessThanOrEqual((baseline.rendererMemory?.textures ?? 0) + 4);
    expect(result.gpuTiming?.pendingQueries ?? 0).toBeLessThanOrEqual(4);
    expect(result.work).toMatchObject({ pendingTasks: 0, busyTasks: 0 });
});
