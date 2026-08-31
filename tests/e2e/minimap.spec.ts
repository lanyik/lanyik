import { expect, test } from "@playwright/test";

test("data-driven minimap previews the finite world and navigates by tile", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const api = window as unknown as {
            getWorldDiagnostics?: () => { status: string; minimap?: { pixelWidth?: number } };
        };
        const diagnostics = api.getWorldDiagnostics?.();
        return diagnostics?.status === "generated" && Boolean(diagnostics.minimap?.pixelWidth);
    });

    const before = await page.evaluate(() => {
        const api = window as unknown as {
            worldMinimap: { view: Record<string, number | boolean | undefined> };
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
    expect(before.view).toMatchObject({ tileSpanX: 42, tileSpanY: 32, pixelWidth: 192 });
    expect(before.opaqueColoredPixels).toBeGreaterThan(1_000);

    const canvas = page.locator("[data-world-minimap]");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("minimap canvas is not visible");
    await canvas.click({ position: { x: bounds.width * 0.25, y: bounds.height * 0.3 } });
    await expect.poll(() => page.evaluate(() => {
        const api = window as unknown as {
            hexWorld: { getCameraTargetTile(): { x: number; y: number } | undefined };
        };
        return api.hexWorld.getCameraTargetTile();
    })).not.toEqual(before.target);

    expect(pageErrors).toEqual([]);
});
