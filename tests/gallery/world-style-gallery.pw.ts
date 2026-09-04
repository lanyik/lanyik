import { expect, Page, test, TestInfo } from "@playwright/test";

import {
    analyzeWorldStyleGallerySample,
    WORLD_STYLE_GALLERY_SAMPLES,
    WorldStyleGalleryMetrics,
    WorldStyleGalleryPoint,
    WorldStyleGallerySample
} from "../helpers/worldStyleGallery";

interface GalleryDiagnostics {
    status: string;
    generating: boolean;
    streaming?: { visibleChunks: number; residentChunks: number };
    worldStreaming?: {
        pendingChunks: number;
        queuedChunks: number;
        queuedVegetationChunks: number;
        averageTerrainTaskMs: number;
        averageVegetationTaskMs: number;
        averageChunkLoadMs: number;
    };
    frameTasks?: { pendingTasks: number };
    work?: { pendingTasks: number; busyTasks: number };
    performance?: { fps: number | null; frameTime: number | null };
    renderer?: { calls: number; triangles: number };
    rendererMemory?: { geometries: number; textures: number };
    gpuTiming?: { supported: boolean; lastGpuMs?: number };
    renderBackend?: { renderer: string; software: boolean };
}

interface GalleryView {
    readonly id: "far" | "middle" | "near" | "debug";
    readonly target: WorldStyleGalleryPoint;
    readonly distance: number;
    readonly debug: "off" | "elevation";
}

async function diagnostics(page: Page): Promise<GalleryDiagnostics> {
    return page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): GalleryDiagnostics;
    }).getWorldDiagnostics());
}

async function waitForSettledWorld(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics(): GalleryDiagnostics;
        }).getWorldDiagnostics();
        return (state.worldStreaming?.pendingChunks ?? 1) === 0
            && (state.worldStreaming?.queuedChunks ?? 1) === 0
            && (state.worldStreaming?.queuedVegetationChunks ?? 0) === 0
            && (state.frameTasks?.pendingTasks ?? 1) === 0
            && (state.work?.pendingTasks ?? 1) === 0
            && (state.work?.busyTasks ?? 1) === 0;
    }, undefined, { timeout: 60_000 });
}

async function loadSample(
    page: Page,
    sample: WorldStyleGallerySample,
    initialTarget: WorldStyleGalleryPoint
): Promise<{ firstVisibleMs: number; stableMs: number }> {
    await page.goto("/?quality=gallery", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
        content: ".performance-panel,.world-status,.campaign-panel,.dg{display:none!important}"
    });
    await page.waitForFunction(() => {
        const api = window as unknown as { getWorldDiagnostics?: () => GalleryDiagnostics };
        return api.getWorldDiagnostics?.().status === "generated";
    });
    const loadStarted = performance.now();
    await page.evaluate(async ({ sample, initialTarget }) => {
        const browser = window as unknown as {
            HexMap: {
                generateWorld(options: object): object;
                StaticWorldSource: new (map: object, options: object) => object;
            };
            hexWorld: {
                loadWorld(options: object): Promise<void>;
            };
            worldControls: {
                worldMode: string;
                seed: string;
                width: number;
                height: number;
                initialX: number;
                initialY: number;
            };
            regenerateWorld(): Promise<void>;
            __worldStyleGallerySource?: object;
        };
        if (sample.topology === "bounded") {
            const map = browser.HexMap.generateWorld({
                seed: sample.seed,
                width: sample.width,
                height: sample.height,
                topology: "bounded"
            });
            const source = new browser.HexMap.StaticWorldSource(map, { chunkSize: 24 });
            browser.__worldStyleGallerySource = source;
            await browser.hexWorld.loadWorld({
                source,
                initialTile: initialTarget,
                adaptiveStreaming: false,
                targetFrameMs: 1000 / 240
            });
            return;
        }
        browser.worldControls.worldMode = sample.topology === "infinite" ? "infinite" : "finite";
        browser.worldControls.seed = sample.seed;
        browser.worldControls.width = sample.width;
        browser.worldControls.height = sample.height;
        browser.worldControls.initialX = initialTarget.x;
        browser.worldControls.initialY = initialTarget.y;
        await browser.regenerateWorld();
    }, { sample, initialTarget });
    const firstVisibleMs = performance.now() - loadStarted;
    await waitForSettledWorld(page);
    return {
        firstVisibleMs,
        stableMs: performance.now() - loadStarted
    };
}

function viewsFor(metrics: WorldStyleGalleryMetrics): readonly GalleryView[] {
    const nearTarget = metrics.lakes.tiles > 0
        ? metrics.anchors.lake
        : metrics.forests.tiles > 0
            ? metrics.anchors.forest
            : metrics.anchors.coast;
    return [
        { id: "far", target: metrics.anchors.center, distance: 780, debug: "off" },
        { id: "middle", target: metrics.anchors.mountain, distance: 500, debug: "off" },
        { id: "near", target: nearTarget, distance: 210, debug: "off" },
        { id: "debug", target: metrics.anchors.relief, distance: 500, debug: "elevation" }
    ];
}

async function setView(page: Page, view: GalleryView): Promise<void> {
    await page.evaluate(({ target, distance, debug }) => {
        const browser = window as unknown as {
            THREE: { Vector3: new (x: number, y: number, z: number) => {
                normalize(): unknown;
            } };
            hexWorld: {
                landformDebugMode: string;
                setCameraTargetTile(x: number, y: number): void;
                getCameraTarget(): {
                    x: number;
                    y: number;
                    z: number;
                };
                getCamera(): {
                    position: {
                        set(x: number, y: number, z: number): void;
                    };
                    lookAt(target: object): void;
                };
            };
        };
        const map = browser.hexWorld;
        map.landformDebugMode = debug;
        map.setCameraTargetTile(target.x, target.y);
        const lookAt = map.getCameraTarget();
        const direction = new browser.THREE.Vector3(0.72, 0.58, 0.64);
        direction.normalize();
        const vector = direction as unknown as { x: number; y: number; z: number };
        const camera = map.getCamera();
        camera.position.set(
            lookAt.x + vector.x * distance,
            lookAt.y + vector.y * distance,
            lookAt.z + vector.z * distance
        );
        camera.lookAt(lookAt);
    }, view);
    await waitForSettledWorld(page);
    await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
}

async function captureView(page: Page, testInfo: TestInfo, sampleId: string, viewId: string): Promise<void> {
    const path = testInfo.outputPath(`${sampleId}-${viewId}.jpg`);
    await page.locator("[data-world-canvas]").screenshot({ path, type: "jpeg", quality: 88 });
    await testInfo.attach(`${sampleId}-${viewId}`, { path, contentType: "image/jpeg" });
}

for (const sample of WORLD_STYLE_GALLERY_SAMPLES) {
    test(`${sample.id} fixed world-style views`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
            if (message.type() === "error") errors.push(message.text());
        });
        const metrics = analyzeWorldStyleGallerySample(sample);
        const timings = await loadSample(page, sample, metrics.anchors.center);
        for (const view of viewsFor(metrics)) {
            await setView(page, view);
            await captureView(page, testInfo, sample.id, view.id);
        }
        const runtime = await diagnostics(page);
        await testInfo.attach(`${sample.id}-metrics`, {
            body: JSON.stringify({ metrics, timings, runtime }, null, 2),
            contentType: "application/json"
        });
        expect(errors, errors.join("\n")).toEqual([]);
        expect(runtime.renderer?.triangles ?? 0).toBeGreaterThan(0);
        expect(runtime.performance?.frameTime ?? 0).toBeGreaterThan(0);
    });
}
