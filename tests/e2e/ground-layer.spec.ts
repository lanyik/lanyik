import { expect, test } from "@playwright/test";

interface GroundLayerProbeResult {
    supported: boolean;
    visiblePixel?: number[];
    hiddenPixel?: number[];
    restoredPixel?: number[];
    errors?: number[];
    surfaceRestores?: number;
    fogRestores?: number;
    pendingSurfaceUploads?: number;
    pendingFogUploads?: number;
}

test("renders and restores the v2 GroundLayer with an independent R8 fog layer", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto("/test-host.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
        const threeModulePath = "/js/vendor/three.module.js";
        const three = await import(threeModulePath) as typeof import("three");
        (window as unknown as { THREE: typeof three }).THREE = three;
        await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "/js/hex-map.global.js";
            script.addEventListener("load", () => resolve(), { once: true });
            script.addEventListener("error", () => reject(new Error("failed to load HexMap global bundle")), {
                once: true
            });
            document.head.append(script);
        });
    });

    const initial = await page.evaluate((): GroundLayerProbeResult => {
        const three = (window as unknown as { THREE: typeof import("three") }).THREE;
        const api = (window as unknown as { HexMap: Record<string, any> }).HexMap;
        const count = api.SURFACE_EFFECTIVE_WINDOW_SIZE ** 2;
        const biomeWeights = new Uint8Array(count * 4);
        for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
        const key = { chunkX: 0, chunkY: 0 };
        const dependencyKey = {
            worldIdentity: "ground-layer-gpu-probe",
            renderKey: key,
            compilerRevision: api.SURFACE_COMPILER_REVISION,
            compileProfileVersion: 1,
            semanticChunks: [],
            hydrologyRegions: []
        };
        const chunk = api.compileSurfaceChunk({
            worldIdentity: "ground-layer-gpu-probe",
            effectiveRevision: 0,
            key,
            dependencyKey,
            validBounds: { minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 },
            substrateClass: new Uint8Array(count).fill(1),
            macroHeight: new Uint16Array(count).fill(42_000),
            biomeWeights,
            climate: new Uint8Array(count * 2).fill(127),
            vegetationDensity: new Uint8Array(count),
            vegetationProfile: new Uint8Array(count),
            rivers: [],
            lakes: []
        });
        let released = false;
        const lease = Object.freeze({
            requestToken: Object.freeze({ sessionEpoch: 1, renderChunkGeneration: 1 }),
            effectiveRevision: 0,
            dependencyKey: chunk.dependencyKey,
            chunk,
            get released() { return released; },
            isCurrent: () => !released,
            release: () => {
                if (released) return false;
                released = true;
                return true;
            }
        });

        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const renderer = new three.WebGLRenderer({ canvas, antialias: false });
        renderer.setPixelRatio(1);
        renderer.setSize(64, 64, false);
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const extension = gl.getExtension("WEBGL_lose_context");
        if (!extension) {
            renderer.dispose();
            return { supported: false };
        }
        const surface = new api.SurfaceTexturePool({ gpuBudgetBytes: api.SURFACE_GPU_PAGE_BYTES });
        const fog = new api.SurfaceFogTexturePool({
            surfacePool: surface,
            gpuBudgetBytes: api.SURFACE_FOG_PAGE_BYTES
        });
        const lighting = new api.LightingStateController();
        const rendererLighting = lighting.bindRenderer(renderer);
        const ground = new api.GroundLayer({
            surfaceTexturePool: surface,
            fogTexturePool: fog,
            lighting,
            heightScale: 10
        });
        ground.mount(lease, 0);
        ground.uploadFog(key, new Uint8Array(api.SURFACE_FOG_LAYER_BYTES).fill(255));

        const scene = new three.Scene();
        scene.background = new three.Color(0x000000);
        scene.add(ground.root);
        const center = api.surfaceToWorld(7.5, 7.5);
        const camera = new three.OrthographicCamera(-12, 12, 12, -12, 0.1, 50);
        camera.position.set(center.x, 20, center.z);
        camera.up.set(0, 0, -1);
        camera.lookAt(center.x, 0, center.z);
        camera.updateMatrixWorld();
        const target = new three.WebGLRenderTarget(32, 32, {
            format: three.RGBAFormat,
            type: three.UnsignedByteType,
            magFilter: three.NearestFilter,
            minFilter: three.NearestFilter,
            depthBuffer: true,
            stencilBuffer: false
        });
        const errors: number[] = [];
        while (gl.getError() !== gl.NO_ERROR) { /* clear constructor diagnostics */ }
        const render = (): number[] => {
            renderer.setRenderTarget(target);
            renderer.clear();
            renderer.render(scene, camera);
            errors.push(gl.getError());
            const pixel = new Uint8Array(4);
            renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
            errors.push(gl.getError());
            return [...pixel];
        };
        const visiblePixel = render();
        ground.uploadFog(key, new Uint8Array(api.SURFACE_FOG_LAYER_BYTES));
        const hiddenPixel = render();
        ground.setLod(key, 2);
        const lodPixel = render();

        const probe = {
            state: "ready",
            extension,
            renderer,
            rendererLighting,
            target,
            ground,
            fog,
            surface,
            lighting,
            render,
            errors,
            visiblePixel,
            hiddenPixel,
            lodPixel
        };
        canvas.addEventListener("webglcontextlost", event => {
            event.preventDefault();
            ground.handleContextLost();
            probe.state = "lost";
        });
        canvas.addEventListener("webglcontextrestored", () => {
            ground.handleContextRestored();
            probe.state = "restored";
        });
        (window as unknown as { groundLayerProbe: typeof probe }).groundLayerProbe = probe;
        return { supported: true, visiblePixel, hiddenPixel, errors: [...errors] };
    });

    test.skip(!initial.supported, "WEBGL_lose_context is unavailable");
    await page.evaluate(() => {
        (window as unknown as { groundLayerProbe: { extension: WEBGL_lose_context } })
            .groundLayerProbe.extension.loseContext();
    });
    await page.waitForFunction(() => (window as unknown as {
        groundLayerProbe?: { state: string };
    }).groundLayerProbe?.state === "lost");
    await page.evaluate(() => {
        (window as unknown as { groundLayerProbe: { extension: WEBGL_lose_context } })
            .groundLayerProbe.extension.restoreContext();
    });
    await page.waitForFunction(() => (window as unknown as {
        groundLayerProbe?: { state: string };
    }).groundLayerProbe?.state === "restored");

    const result = await page.evaluate((): GroundLayerProbeResult => {
        const probe = (window as unknown as { groundLayerProbe: any }).groundLayerProbe;
        const restoredPixel = probe.render();
        const result = {
            supported: true,
            visiblePixel: probe.visiblePixel,
            hiddenPixel: probe.hiddenPixel,
            restoredPixel,
            errors: [...probe.errors],
            surfaceRestores: probe.surface.stats.contextRestores,
            fogRestores: probe.fog.stats.contextRestores,
            pendingSurfaceUploads: probe.surface.stats.pendingLayerUploads,
            pendingFogUploads: probe.fog.stats.pendingLayerUploads
        };
        probe.rendererLighting.release();
        probe.ground.dispose();
        probe.fog.dispose();
        probe.surface.dispose();
        probe.lighting.dispose();
        probe.target.dispose();
        probe.renderer.dispose();
        return result;
    });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(result.errors).toEqual(Array.from({ length: 8 }, () => 0));
    expect(result.visiblePixel?.[3]).toBe(255);
    expect(result.hiddenPixel?.[3]).toBe(255);
    const visibleLuminance = result.visiblePixel!.slice(0, 3).reduce((sum, value) => sum + value, 0);
    const hiddenLuminance = result.hiddenPixel!.slice(0, 3).reduce((sum, value) => sum + value, 0);
    expect(visibleLuminance).toBeGreaterThan(hiddenLuminance * 2);
    expect(result.restoredPixel).toEqual(result.hiddenPixel);
    expect(result).toMatchObject({
        surfaceRestores: 1,
        fogRestores: 1,
        // Ground consumes values/material; flow/water stay marked until the phase-6 water layer binds them.
        pendingSurfaceUploads: 1,
        pendingFogUploads: 0
    });
});
