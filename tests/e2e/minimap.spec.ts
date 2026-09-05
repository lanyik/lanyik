import { expect, test } from "@playwright/test";
import { WORLD_WATER_STYLE_RANGES } from "../../src/world/WorldStyleProfile";

interface MinimapView {
    generation: number;
    pageRequests: number;
    pageCompletions: number;
    loading: boolean;
    originX?: number;
    originY?: number;
    tileSpanX?: number;
    tileSpanY?: number;
    pixelWidth?: number;
    cachedPages: number;
    demandedPages: number;
    cachedDemandedPages: number;
    pendingPages: number;
    visiblePages: number;
    renders: number;
    demandRebuilds: number;
    cachedPageBytes: number;
    displayCanvasBytes: number;
    expanded: boolean;
    zoom: number;
    destination?: { x: number; y: number };
}

async function waitForMinimap(page: import("@playwright/test").Page): Promise<void> {
    await page.waitForFunction(() => {
        const diagnostics = (window as unknown as {
            getWorldDiagnostics?: () => { status: string; generating: boolean; minimap?: MinimapView };
        }).getWorldDiagnostics?.();
        return diagnostics && !diagnostics.generating && diagnostics.status !== "failed"
            && diagnostics.minimap?.loading === false
            && (diagnostics.minimap.cachedPages ?? 0) > 0;
    }, undefined, { timeout: 20_000 });
}

test("authors visible river lengths above an expanded map and refreshes without losing the inspection view", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/?infinite&quality=fast", { waitUntil: "domcontentloaded" });
    await waitForMinimap(page);
    await page.keyboard.press("m");
    const canvas = page.locator("[data-world-minimap]");
    await canvas.hover({ position: { x: 280, y: 310 } });
    await page.mouse.wheel(0, -100);
    await expect.poll(() => page.evaluate(() => (window as unknown as {
        worldMinimap: { view: MinimapView };
    }).worldMinimap.view.zoom)).toBeCloseTo(Math.exp(0.15), 6);
    // Pan away from the main camera so a reset-to-camera bug cannot pass.
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + 280, bounds.y + 310);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(bounds.x + 310, bounds.y + 330, { steps: 3 });
    await page.mouse.up({ button: "right" });
    await waitForMinimap(page);

    const snapshot = () => page.evaluate(() => {
        const canvas = document.querySelector("[data-world-minimap]") as HTMLCanvasElement;
        const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 0x811c9dc5;
        for (const value of pixels) hash = Math.imul(hash ^ value, 0x01000193);
        return {
            view: (window as unknown as { worldMinimap: { view: MinimapView } }).worldMinimap.view,
            hash: hash >>> 0
        };
    });
    const before = await snapshot();
    const layers = await page.evaluate(() => {
        const z = (selector: string) => Number(getComputedStyle(document.querySelector(selector)!).zIndex);
        return { controls: z(".dg.ac"), monitor: z(".performance-panel"), overview: z(".minimap-panel") };
    });
    expect(layers.controls).toBeGreaterThan(layers.overview);
    expect(layers.monitor).toBeGreaterThan(layers.overview);
    await expect(page.locator("[data-minimap-panel]")).not.toHaveAttribute("aria-modal", "true");

    const length = page.locator('[data-water-generation="riverLength"]');
    const slider = page.locator(".cr.number").filter({ has: length }).locator(".slider");
    await expect(slider).toBeVisible();
    const sliderBounds = (await slider.boundingBox())!;
    const { min, max } = WORLD_WATER_STYLE_RANGES.riverLength;
    await page.mouse.move(sliderBounds.x + sliderBounds.width * (100 - min) / (max - min), sliderBounds.y + sliderBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(sliderBounds.x + sliderBounds.width * (200 - min) / (max - min), sliderBounds.y + sliderBounds.height / 2);
    await page.mouse.up();
    await expect(length).toHaveValue("200");
    await page.waitForFunction(() => (window as unknown as {
        getWorldDiagnostics(): { waterStyle?: { riverLength: number }; generating: boolean };
    }).getWorldDiagnostics().waterStyle?.riverLength === 200);
    await waitForMinimap(page);
    const after = await snapshot();
    expect(after.view).toMatchObject({
        expanded: true, originX: before.view.originX, originY: before.view.originY,
        tileSpanX: before.view.tileSpanX, tileSpanY: before.view.tileSpanY, zoom: before.view.zoom
    });
    expect(after.view.generation).toBeGreaterThan(before.view.generation);
    expect(after.hash).not.toBe(before.hash);

    const refresh = page.locator("[data-minimap-refresh]");
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await waitForMinimap(page);
    const refreshed = await snapshot();
    expect(refreshed.view.generation).toBeGreaterThan(after.view.generation);
    expect(refreshed.view.pageRequests).toBeGreaterThan(after.view.pageRequests);
    expect(refreshed.view.expanded).toBe(true);
    expect(refreshed.hash).toBe(after.hash);
    expect(errors).toEqual([]);
});

test("expanded minimap zooms, selects a target, and teleports only after T", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await waitForMinimap(page);

    const before = await page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: MinimapView };
            hexWorld: { getCameraTargetTile(): { x: number; y: number } | undefined };
        };
        const canvas = document.querySelector("[data-world-minimap]") as HTMLCanvasElement;
        const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        let opaqueColoredPixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] > 0 && pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) {
                opaqueColoredPixels += 1;
            }
        }
        return {
            state: canvas.dataset.state,
            view: api.worldMinimap.view,
            target: api.hexWorld.getCameraTargetTile(),
            opaqueColoredPixels
        };
    });

    expect(before.state).toBe("ready");
    expect(before.view).toMatchObject({ tileSpanX: 42, tileSpanY: 32, pixelWidth: 256 });
    expect(before.opaqueColoredPixels).toBeGreaterThan(1_000);

    await page.keyboard.press("m");
    await expect(page.locator("[data-minimap-panel]")).toHaveClass(/minimap-panel--expanded/);
    await expect.poll(() => page.evaluate(() => (window as unknown as {
        worldMinimap: { view: MinimapView };
    }).worldMinimap.view.expanded)).toBe(true);

    const canvas = page.locator("[data-world-minimap]");
    const expandedBounds = await canvas.boundingBox();
    if (!expandedBounds) throw new Error("minimap canvas is not visible");
    await canvas.hover({ position: { x: expandedBounds.width / 2, y: expandedBounds.height / 2 } });
    await page.mouse.wheel(0, -100);
    await expect.poll(() => page.evaluate(() => (window as unknown as {
        worldMinimap: { view: MinimapView };
    }).worldMinimap.view.zoom)).toBeGreaterThan(1);
    const continuousZoom = await page.evaluate(() => (window as unknown as {
        worldMinimap: { view: MinimapView };
    }).worldMinimap.view);
    expect(continuousZoom.zoom).toBeLessThan(2);
    expect(continuousZoom.tileSpanX! % 1).not.toBe(0);

    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("minimap canvas is not visible");
    await canvas.click({ position: { x: bounds.width * 0.25, y: bounds.height * 0.3 } });
    const selected = await page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: MinimapView };
            hexWorld: { getCameraTargetTile(): { x: number; y: number } | undefined };
        };
        return { destination: api.worldMinimap.view.destination, target: api.hexWorld.getCameraTargetTile() };
    });
    expect(selected.destination).toBeDefined();
    expect(selected.target).not.toEqual(selected.destination);

    await page.keyboard.press("t");
    await expect.poll(() => page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: MinimapView };
            hexWorld: { getCameraTargetTile(): { x: number; y: number } | undefined };
        };
        return { expanded: api.worldMinimap.view.expanded, target: api.hexWorld.getCameraTargetTile() };
    })).toEqual({ expanded: false, target: selected.destination });
    expect(pageErrors).toEqual([]);
});

test("compact infinite minimap keeps its center inside the dead zone and follows smoothly outside it", async ({ page }) => {
    await page.goto("/?infinite&quality=fast&x=0&y=0", { waitUntil: "domcontentloaded" });
    await waitForMinimap(page);

    const initial = await page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: MinimapView };
            hexWorld: {
                getCameraTargetTile(): { x: number; y: number };
                setCameraTargetTile(x: number, y: number): void;
            };
        };
        const target = api.hexWorld.getCameraTargetTile();
        const originX = api.worldMinimap.view.originX!;
        api.hexWorld.setCameraTargetTile(target.x + 96, target.y);
        return { target, originX };
    });
    await page.waitForTimeout(180);
    const insideOrigin = await page.evaluate(() => (window as unknown as {
        worldMinimap: { view: MinimapView };
    }).worldMinimap.view.originX!);
    expect(insideOrigin).toBeCloseTo(initial.originX, 3);

    await page.evaluate(({ x, y }) => (window as unknown as {
        hexWorld: { setCameraTargetTile(x: number, y: number): void };
    }).hexWorld.setCameraTargetTile(x + 192, y), initial.target);
    const samples: number[] = [];
    for (let index = 0; index < 5; index += 1) {
        await page.waitForTimeout(45);
        samples.push(await page.evaluate(() => (window as unknown as {
            worldMinimap: { view: MinimapView };
        }).worldMinimap.view.originX!));
    }
    expect(samples[0]).toBeGreaterThan(initial.originX);
    expect(samples[samples.length - 1]).toBeGreaterThan(samples[0]);
    expect(new Set(samples.map(value => value.toFixed(3))).size).toBeGreaterThan(2);
});

test("an idle compact minimap stops rebuilding demand and repainting", async ({ page }) => {
    await page.goto("/?infinite&quality=fast&x=0&y=0", { waitUntil: "domcontentloaded" });
    await waitForMinimap(page);
    await expect.poll(() => page.evaluate(() => {
        const view = (window as unknown as { worldMinimap: { view: MinimapView } }).worldMinimap.view;
        return {
            demanded: view.demandedPages,
            cached: view.cachedDemandedPages,
            pending: view.pendingPages
        };
    }), { timeout: 20_000 }).toEqual({ demanded: 25, cached: 25, pending: 0 });

    const before = await page.evaluate(() => {
        const view = (window as unknown as { worldMinimap: { view: MinimapView } }).worldMinimap.view;
        return { renders: view.renders, demandRebuilds: view.demandRebuilds };
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
        const view = (window as unknown as { worldMinimap: { view: MinimapView } }).worldMinimap.view;
        return {
            renders: view.renders,
            demandRebuilds: view.demandRebuilds,
            cachedPageBytes: view.cachedPageBytes,
            displayCanvasBytes: view.displayCanvasBytes
        };
    });
    expect(after).toMatchObject(before);
    expect(after.cachedPageBytes).toBeGreaterThan(0);
    expect(after.displayCanvasBytes).toBeGreaterThan(0);
});

test("expanded infinite minimap right-drag pans continuously and Space recenters it", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/?infinite&quality=fast&x=0&y=0", { waitUntil: "domcontentloaded" });
    await waitForMinimap(page);
    await page.keyboard.press("m");

    await expect.poll(() => page.evaluate(() => {
        const view = (window as unknown as { worldMinimap: { view: MinimapView } }).worldMinimap.view;
        return view.demandedPages === 49
            && view.visiblePages === 9
            && view.cachedDemandedPages === view.demandedPages;
    }), { timeout: 20_000 }).toBe(true);

    const canvas = page.locator("[data-world-minimap]");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("minimap canvas is not visible");
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const initial = await page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: MinimapView };
            hexWorld: { getCameraTargetTile(): { x: number; y: number } };
        };
        return { view: api.worldMinimap.view, target: api.hexWorld.getCameraTargetTile() };
    });

    await page.mouse.move(centerX, centerY);
    await page.mouse.down({ button: "right" });
    await expect(canvas).toHaveAttribute("data-panning", "true");
    const origins: number[] = [];
    for (const offset of [40, 80, 120]) {
        await page.mouse.move(centerX + offset, centerY + offset / 2, { steps: 4 });
        origins.push(await page.evaluate(() => (window as unknown as {
            worldMinimap: { view: MinimapView };
        }).worldMinimap.view.originX!));
    }
    await page.mouse.move(centerX + bounds.width * 0.75, centerY + 60, { steps: 4 });
    expect(await canvas.getAttribute("data-state")).toBe("ready");
    await page.mouse.up({ button: "right" });
    await expect(canvas).toHaveAttribute("data-panning", "false");

    expect(origins[0]).toBeLessThan(initial.view.originX!);
    expect(origins[1]).toBeLessThan(origins[0]);
    expect(origins[2]).toBeLessThan(origins[1]);
    const panned = await page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: MinimapView };
            hexWorld: { getCameraTargetTile(): { x: number; y: number } };
        };
        return { view: api.worldMinimap.view, target: api.hexWorld.getCameraTargetTile() };
    });
    expect(panned.target).toEqual(initial.target);
    expect(panned.view.originY).toBeLessThan(initial.view.originY!);

    await page.keyboard.press("Space");
    await expect.poll(() => page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: MinimapView };
            hexWorld: { getCameraTargetTile(): { x: number; y: number } };
        };
        const view = api.worldMinimap.view;
        const target = api.hexWorld.getCameraTargetTile();
        return {
            originX: view.originX,
            originY: view.originY,
            expectedX: target.x + 0.5 - view.tileSpanX! / 2,
            expectedY: target.y + 0.5 - view.tileSpanY! / 2
        };
    })).toEqual({
        originX: initial.view.originX,
        originY: initial.view.originY,
        expectedX: initial.view.originX,
        expectedY: initial.view.originY
    });
    expect(pageErrors).toEqual([]);
});
