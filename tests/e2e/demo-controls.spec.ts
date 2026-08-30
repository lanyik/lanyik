import { expect, test } from "@playwright/test";

test("restores the v1 dashboard and interaction semantics on the v2 runtime", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const browser = window as unknown as { getWorldDiagnostics?: () => any };
        const diagnostics = browser.getWorldDiagnostics?.();
        return diagnostics?.status === "generated"
            && diagnostics.renderSession?.pendingChunks === 0
            && diagnostics.renderSession?.mountedChunks > 0;
    }, undefined, { timeout: 90_000 });

    await expect(page.locator(".dg.main")).toBeVisible();
    await expect(page.locator("[data-performance-panel]")).toBeVisible();
    await page.waitForFunction(() =>
        document.querySelector('[data-performance-value="fps"]')?.textContent !== "—");

    await page.locator(".dg li.title").filter({ hasText: /^Terrain$|^地形$/ }).click();
    const gridControl = page.locator(".dg li.cr.boolean")
        .filter({ hasText: /grid|网格/i })
        .locator('input[type="checkbox"]');
    await expect(gridControl).toBeVisible();
    await gridControl.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as {
        hexWorld: { presentationStyle: { gridVisible: boolean } };
    }).hexWorld.presentationStyle.gridVisible)).toBe(false);

    const canvas = page.locator("[data-world-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const centerX = box!.x + box!.width * 0.5;
    const centerY = box!.y + box!.height * 0.56;
    await page.mouse.click(centerX, centerY);
    await page.waitForFunction(() => {
        const browser = window as unknown as { hexWorld: { getScene(): any } };
        return browser.hexWorld.getScene().getObjectByName("surface-tile-pointer-v2")?.visible === true;
    });

    const beforeMove = await page.evaluate(() => (window as unknown as {
        hexWorld: { getCameraTarget(): { toArray(): number[] } };
    }).hexWorld.getCameraTarget().toArray());
    await canvas.focus();
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(250);
    await page.keyboard.up("KeyW");
    const afterMove = await page.evaluate(() => (window as unknown as {
        hexWorld: { getCameraTarget(): { toArray(): number[] } };
    }).hexWorld.getCameraTarget().toArray());
    expect(afterMove).not.toEqual(beforeMove);

    const beforeOrbit = await page.evaluate(() => (window as unknown as {
        hexWorld: { camera: { position: { toArray(): number[] } } };
    }).hexWorld.camera.position.toArray());
    await page.mouse.move(centerX, centerY);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(centerX + 80, centerY + 30, { steps: 5 });
    await page.mouse.up({ button: "right" });
    const afterOrbit = await page.evaluate(() => (window as unknown as {
        hexWorld: { camera: { position: { toArray(): number[] } } };
    }).hexWorld.camera.position.toArray());
    expect(afterOrbit).not.toEqual(beforeOrbit);
    expect(errors, errors.join("\n")).toEqual([]);
});
