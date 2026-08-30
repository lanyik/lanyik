import { expect, test } from "@playwright/test";

interface PresentationProbeResult {
    supported: boolean;
    errors?: number[];
    nonBackgroundPixels?: number;
    changedPixelsAfterInteraction?: number;
    waterKind?: string;
    vegetationCandidates?: number;
    vegetationLod0?: number;
    vegetationLod2?: number;
    pbrModelLuminance?: number;
    contextRestores?: number;
    released?: boolean;
}

test("renders, interacts with and restores the fixed-seed v2 water/vegetation presentation", async ({ page }) => {
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

    const initial = await page.evaluate((): PresentationProbeResult => {
        const three = (window as unknown as { THREE: typeof import("three") }).THREE;
        const api = (window as unknown as { HexMap: Record<string, any> }).HexMap;
        const count = api.SURFACE_EFFECTIVE_WINDOW_SIZE ** 2;
        const biomeWeights = new Uint8Array(count * 4);
        for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
        const key = { chunkX: 0, chunkY: 0 };
        const lakeId = api.createStableHydrologyId("lake", ["surface-v2-fixed-gallery"]);
        const dependencyKey = {
            worldIdentity: "surface-v2-fixed-gallery",
            renderKey: key,
            compilerRevision: api.SURFACE_COMPILER_REVISION,
            compileProfileVersion: api.SURFACE_COMPILE_PROFILE_VERSION,
            semanticChunks: [],
            hydrologyRegions: [{
                key: { regionX: 0, regionY: 0 },
                baseRevision: 0,
                features: [{ featureId: lakeId, revision: 1 }]
            }]
        };
        const chunk = api.compileSurfaceChunk({
            worldIdentity: "surface-v2-fixed-gallery",
            effectiveRevision: 1,
            key,
            dependencyKey,
            validBounds: { minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 },
            substrateClass: new Uint8Array(count).fill(1),
            macroHeight: new Uint16Array(count).fill(32_000),
            biomeWeights,
            climate: new Uint8Array(count * 2).fill(150),
            vegetationDensity: new Uint8Array(count).fill(255),
            vegetationProfile: new Uint8Array(count).fill(3),
            rivers: [],
            lakes: [{
                kind: "lake",
                featureKey: lakeId,
                bodyId: lakeId,
                revision: 1,
                profileIndex: 3,
                boundaryPoints: new Float64Array([3, 3, 12, 3, 12, 12, 3, 12]),
                level: 45_000
            }]
        });
        let released = false;
        const lease = Object.freeze({
            requestToken: Object.freeze({ sessionEpoch: 1, renderChunkGeneration: 1 }),
            effectiveRevision: 1,
            dependencyKey,
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
        canvas.width = 192;
        canvas.height = 144;
        const renderer = new three.WebGLRenderer({ canvas, antialias: false });
        renderer.setPixelRatio(1);
        renderer.setSize(192, 144, false);
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const extension = gl.getExtension("WEBGL_lose_context");
        if (!extension) {
            renderer.dispose();
            return { supported: false };
        }
        const surface = new api.SurfaceTexturePool({ gpuBudgetBytes: api.SURFACE_GPU_PAGE_BYTES });
        const lighting = new api.LightingStateController();
        const rendererLighting = lighting.bindRenderer(renderer);
        const presentation = new api.SurfacePresentationLayer({
            surfaceTexturePool: surface,
            lighting,
            heightScale: 8
        });
        const mounted = presentation.mount(lease, 0);
        presentation.setTime(2.5);
        const scene = new three.Scene();
        scene.background = new three.Color(0x0b1017);
        const sceneLighting = lighting.bindScene(scene);
        scene.add(presentation.root);
        const center = api.surfaceToWorld(7.5, 7.5);
        const pbrModel = new three.Mesh(
            new three.SphereGeometry(0.8, 12, 8),
            new three.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.72, metalness: 0 })
        );
        pbrModel.name = "surface-v2-pbr-model-probe";
        pbrModel.position.set(center.x, 7, center.z);
        scene.add(pbrModel);
        const camera = new three.OrthographicCamera(-15, 15, 11.25, -11.25, 0.1, 80);
        camera.position.set(center.x + 13, 18, center.z + 16);
        camera.lookAt(center.x, 3.5, center.z);
        camera.updateMatrixWorld();
        const target = new three.WebGLRenderTarget(192, 144, {
            format: three.RGBAFormat,
            type: three.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false
        });
        const errors: number[] = [];
        while (gl.getError() !== gl.NO_ERROR) { /* clear constructor diagnostics */ }
        const render = (): Uint8Array => {
            renderer.setRenderTarget(target);
            renderer.clear();
            renderer.render(scene, camera);
            errors.push(gl.getError());
            const pixels = new Uint8Array(192 * 144 * 4);
            renderer.readRenderTargetPixels(target, 0, 0, 192, 144, pixels);
            errors.push(gl.getError());
            return pixels;
        };
        const firstPixels = render();
        const background = [11, 16, 23];
        let nonBackgroundPixels = 0;
        for (let index = 0; index < firstPixels.length; index += 4) {
            if (firstPixels[index] !== background[0]
                || firstPixels[index + 1] !== background[1]
                || firstPixels[index + 2] !== background[2]) nonBackgroundPixels += 1;
        }
        const projectedModel = pbrModel.position.clone().project(camera);
        const modelX = Math.max(0, Math.min(191, Math.floor((projectedModel.x * 0.5 + 0.5) * 192)));
        const modelY = Math.max(0, Math.min(143, Math.floor((projectedModel.y * 0.5 + 0.5) * 144)));
        let pbrModelLuminance = 0;
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
            for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
                const x = Math.max(0, Math.min(191, modelX + offsetX));
                const y = Math.max(0, Math.min(143, modelY + offsetY));
                const offset = (y * 192 + x) * 4;
                pbrModelLuminance = Math.max(
                    pbrModelLuminance,
                    firstPixels[offset] + firstPixels[offset + 1] + firstPixels[offset + 2]
                );
            }
        }
        const vegetationLod0 = presentation.stats.vegetation.visibleInstanceCount;
        presentation.setLod(key, 2);
        presentation.setTime(7.75);
        presentation.setFloatingOrigin(1.5, -0.75);
        const secondPixels = render();
        let changedPixelsAfterInteraction = 0;
        for (let index = 0; index < firstPixels.length; index += 1) {
            if (firstPixels[index] !== secondPixels[index]) changedPixelsAfterInteraction += 1;
        }

        const probe = {
            state: "ready",
            extension,
            renderer,
            rendererLighting,
            sceneLighting,
            target,
            surface,
            lighting,
            pbrModel,
            presentation,
            render,
            errors,
            released: () => released
        };
        canvas.addEventListener("webglcontextlost", event => {
            event.preventDefault();
            presentation.handleContextLost();
            probe.state = "lost";
        });
        canvas.addEventListener("webglcontextrestored", () => {
            presentation.handleContextRestored();
            probe.state = "restored";
        });
        (window as unknown as { surfacePresentationProbe: typeof probe }).surfacePresentationProbe = probe;
        return {
            supported: true,
            errors: [...errors],
            nonBackgroundPixels,
            changedPixelsAfterInteraction,
            waterKind: mounted.water.kind,
            vegetationCandidates: mounted.vegetation.candidateCount,
            vegetationLod0,
            vegetationLod2: presentation.stats.vegetation.visibleInstanceCount,
            pbrModelLuminance
        };
    });

    test.skip(!initial.supported, "WEBGL_lose_context is unavailable");
    await page.evaluate(() => {
        (window as unknown as { surfacePresentationProbe: { extension: WEBGL_lose_context } })
            .surfacePresentationProbe.extension.loseContext();
    });
    await page.waitForFunction(() => (window as unknown as {
        surfacePresentationProbe?: { state: string };
    }).surfacePresentationProbe?.state === "lost");
    await page.evaluate(() => {
        (window as unknown as { surfacePresentationProbe: { extension: WEBGL_lose_context } })
            .surfacePresentationProbe.extension.restoreContext();
    });
    await page.waitForFunction(() => (window as unknown as {
        surfacePresentationProbe?: { state: string };
    }).surfacePresentationProbe?.state === "restored");

    const restored = await page.evaluate((): PresentationProbeResult => {
        const probe = (window as unknown as { surfacePresentationProbe: any }).surfacePresentationProbe;
        probe.render();
        const result: PresentationProbeResult = {
            supported: true,
            errors: [...probe.errors],
            contextRestores: probe.surface.stats.contextRestores,
            released: false
        };
        probe.sceneLighting.release();
        probe.rendererLighting.release();
        probe.presentation.dispose();
        result.released = probe.released();
        probe.pbrModel.geometry.dispose();
        probe.pbrModel.material.dispose();
        probe.surface.dispose();
        probe.lighting.dispose();
        probe.target.dispose();
        probe.renderer.dispose();
        return result;
    });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(initial.errors).toEqual([0, 0, 0, 0]);
    expect(initial.waterKind).toBe("coverage");
    expect(initial.vegetationCandidates).toBeGreaterThan(0);
    expect(initial.vegetationLod0).toBeGreaterThan(initial.vegetationLod2 ?? 0);
    expect(initial.pbrModelLuminance).toBeGreaterThan(90);
    expect(initial.nonBackgroundPixels).toBeGreaterThan(4_000);
    expect(initial.changedPixelsAfterInteraction).toBeGreaterThan(500);
    expect(restored).toMatchObject({
        errors: [0, 0, 0, 0, 0, 0],
        contextRestores: 1,
        released: true
    });
});
