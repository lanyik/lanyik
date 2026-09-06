import { expect, test } from "@playwright/test";

test("hover and selection follow mountain slopes and refresh after height edits", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/?quality=gallery", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as any).getWorldDiagnostics?.().status === "generated");
    await page.addStyleTag({ content: ".performance-panel,.world-status,.dg,.minimap-panel{display:none!important}" });
    await page.evaluate(async () => {
        const { hexWorld: map, HexMap: api } = window as any;
        const data: Record<number, Record<number, object>> = {};
        for (let x = 0; x < 18; x += 1) {
            data[x] = {};
            for (let y = 0; y < 18; y += 1) data[x][y] = {
                type: x < 9 ? api.Land.land : api.Land.mountain,
                modifiers: x < 8 ? ["wood"] : undefined,
                treeModel: "Assets/models/oak"
            };
        }
        map.grassVisible = true;
        map.grassDensity = 60;
        map.treesPerTile = 12;
        await map.vegetationRefreshQueue;
        await map.load({ data, w: 18, h: 18 });
        map.setCameraTargetTile(9, 9);
        const target = map.getCameraTarget();
        const camera = map.getCamera();
        camera.position.set(target.x - 260, target.y + 360, target.z + 240);
        camera.lookAt(target);
    });
    await page.waitForFunction(() => {
        const state = (window as any).getWorldDiagnostics();
        return state.frameTasks.pendingTasks === 0 && state.work.pendingTasks === 0 && state.work.busyTasks === 0;
    });
    const screen = await page.evaluate(() => {
        const { hexWorld: map, THREE } = window as any;
        const target = map.getCameraTarget();
        const point = new THREE.Vector3(target.x, target.y, target.z).project(map.getCamera());
        const rect = document.querySelector("[data-world-canvas]")!.getBoundingClientRect();
        return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
    });
    await page.mouse.move(screen.x, screen.y);
    await page.mouse.click(screen.x, screen.y);
    const before = await page.evaluate(() => {
        const map = (window as any).hexWorld;
        const heights = Array.from(map.pointer.geometry.getAttribute("position").array as Float32Array)
            .filter((_, index) => index % 3 === 1);
        return {
            hovered: map.interactionStats.hoveredTile,
            visible: map.pointer.visible && map.selector.visible,
            minimum: Math.min(...heights), maximum: Math.max(...heights),
            sameProjection: [...map.pointer.geometry.getAttribute("position").array].join(",")
                === [...map.selector.geometry.getAttribute("position").array].join(",")
        };
    });
    expect(before.hovered).toEqual({ x: 9, y: 9 });
    expect(before.visible && before.sameProjection).toBe(true);
    expect(before.maximum - before.minimum).toBeGreaterThan(20);
    const markerPixels = await page.evaluate(() => {
        const map = (window as any).hexWorld;
        map.rendererHost.render();
        const gl = map.renderer.getContext() as WebGL2RenderingContext;
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let yellow = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 180 && pixels[i + 1] > 180 && pixels[i + 2] < 80) yellow += 1;
        }
        return yellow;
    });
    expect(markerPixels).toBeGreaterThan(30);
    await page.screenshot({ path: testInfo.outputPath("vegetation-and-slope-marker.png") });
    await page.evaluate(async () => {
        const map = (window as any).hexWorld;
        await new Promise<void>(resolve => {
            const refreshed = () => { map.off("surfacechange", refreshed); resolve(); };
            map.on("surfacechange", refreshed);
            map.mountainHeight = 160;
        });
    });
    const after = await page.evaluate(() => {
        const map = (window as any).hexWorld;
        return Math.max(...Array.from(map.pointer.geometry.getAttribute("position").array as Float32Array)
            .filter((_, index) => index % 3 === 1));
    });
    expect(after).toBeGreaterThan(before.maximum * 1.9);
    expect(errors).toEqual([]);
});
