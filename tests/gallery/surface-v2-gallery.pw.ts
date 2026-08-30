import { expect, Page, test, TestInfo } from "@playwright/test";

interface SurfaceGalleryView {
    readonly id: "near" | "middle" | "far";
    readonly lod: 0 | 1 | 2;
    readonly time: number;
    readonly distance: number;
}

const SURFACE_GALLERY_VIEWS: readonly SurfaceGalleryView[] = Object.freeze([
    Object.freeze({ id: "near", lod: 0, time: 2.5, distance: 22 }),
    Object.freeze({ id: "middle", lod: 1, time: 5, distance: 29 }),
    Object.freeze({ id: "far", lod: 2, time: 8, distance: 37 })
]);

async function mountFixedSurface(page: Page): Promise<void> {
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
        document.body.replaceChildren();
        document.body.style.cssText = "margin:0;background:#0b1017;overflow:hidden";
        const canvas = document.createElement("canvas");
        canvas.dataset.surfaceV2Gallery = "true";
        canvas.width = 960;
        canvas.height = 720;
        canvas.style.cssText = "display:block;width:960px;height:720px";
        document.body.append(canvas);
        const renderer = new three.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(1);
        renderer.setSize(960, 720, false);
        const surface = new api.SurfaceTexturePool({ gpuBudgetBytes: api.SURFACE_GPU_PAGE_BYTES });
        const lighting = new api.LightingStateController();
        const rendererLighting = lighting.bindRenderer(renderer);
        const presentation = new api.SurfacePresentationLayer({
            surfaceTexturePool: surface,
            lighting,
            heightScale: 8
        });
        presentation.mount(lease, 0);
        const scene = new three.Scene();
        scene.background = new three.Color(0x0b1017);
        const sceneLighting = lighting.bindScene(scene);
        scene.add(presentation.root);
        const center = api.surfaceToWorld(7.5, 7.5);
        const camera = new three.PerspectiveCamera(42, 4 / 3, 0.1, 120);
        const state = {
            key,
            center,
            renderer,
            rendererLighting,
            sceneLighting,
            presentation,
            scene,
            camera,
            surface,
            lighting,
            released: () => released
        };
        (window as unknown as { surfaceV2Gallery: typeof state }).surfaceV2Gallery = state;
    });
}

async function setView(page: Page, view: SurfaceGalleryView): Promise<void> {
    await page.evaluate(view => {
        const state = (window as unknown as { surfaceV2Gallery: any }).surfaceV2Gallery;
        state.presentation.setLod(state.key, view.lod);
        state.presentation.setTime(view.time);
        state.camera.position.set(
            state.center.x + view.distance * 0.62,
            view.distance * 0.72,
            state.center.z + view.distance * 0.76
        );
        state.camera.lookAt(state.center.x, 3.3, state.center.z);
        state.camera.updateMatrixWorld();
        state.renderer.render(state.scene, state.camera);
    }, view);
    await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
}

async function capture(page: Page, testInfo: TestInfo, view: SurfaceGalleryView): Promise<void> {
    const path = testInfo.outputPath(`surface-v2-fixed-${view.id}.png`);
    await page.locator("[data-surface-v2-gallery]").screenshot({ path });
    await testInfo.attach(`surface-v2-fixed-${view.id}`, { path, contentType: "image/png" });
}

test("surface v2 fixed-seed water and vegetation views", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await mountFixedSurface(page);
    for (const view of SURFACE_GALLERY_VIEWS) {
        await setView(page, view);
        await capture(page, testInfo, view);
    }
    const stats = await page.evaluate(() => {
        const state = (window as unknown as { surfaceV2Gallery: any }).surfaceV2Gallery;
        const result = state.presentation.stats;
        state.sceneLighting.release();
        state.rendererLighting.release();
        state.presentation.dispose();
        const released = state.released();
        state.surface.dispose();
        state.lighting.dispose();
        state.renderer.dispose();
        return { result, released };
    });
    await testInfo.attach("surface-v2-fixed-metrics", {
        body: JSON.stringify(stats, null, 2),
        contentType: "application/json"
    });
    expect(errors, errors.join("\n")).toEqual([]);
    expect(stats).toMatchObject({
        result: {
            mountedChunks: 1,
            water: { coverageMeshes: 1 },
            vegetation: { candidateCount: expect.any(Number) }
        },
        released: true
    });
    expect(stats.result.vegetation.candidateCount).toBeGreaterThan(0);
});
