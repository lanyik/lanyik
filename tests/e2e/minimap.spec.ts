import { expect, test } from "@playwright/test";

interface MinimapView {
    loading: boolean;
    originX?: number;
    originY?: number;
    tileSpanX?: number;
    tileSpanY?: number;
    pixelWidth?: number;
    cachedPages: number;
    expanded: boolean;
    zoom: number;
    destination?: { x: number; y: number };
}

async function waitForMinimap(page: import("@playwright/test").Page): Promise<void> {
    await page.waitForFunction(() => {
        const diagnostics = (window as unknown as {
            getWorldDiagnostics?: () => { status: string; minimap?: MinimapView };
        }).getWorldDiagnostics?.();
        return diagnostics?.status === "generated"
            && diagnostics.minimap?.loading === false
            && (diagnostics.minimap.cachedPages ?? 0) > 0;
    });
}

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
