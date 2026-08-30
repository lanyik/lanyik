import { expect, test } from "@playwright/test";

test("restores the surface texture pools after repeated real WebGL context loss", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics?: () => any }).getWorldDiagnostics?.();
        return state?.status === "generated" && state.renderSession?.pendingChunks === 0
            && state.webglContext?.state === "ready" && (state.renderer?.triangles ?? 0) > 0;
    }, undefined, { timeout: 90_000 });
    const baseline = await page.evaluate(() =>
        (window as unknown as { getWorldDiagnostics(): any }).getWorldDiagnostics());

    for (let cycle = 1; cycle <= 3; cycle += 1) {
        const supported = await page.evaluate(() => {
            const browser = window as unknown as {
                hexWorld: { renderer: { getContext(): WebGL2RenderingContext } };
                contextLossExtension?: WEBGL_lose_context;
            };
            const extension = browser.hexWorld.renderer.getContext().getExtension("WEBGL_lose_context");
            browser.contextLossExtension = extension ?? undefined;
            extension?.loseContext();
            return Boolean(extension);
        });
        test.skip(!supported, "WEBGL_lose_context is unavailable");
        await page.waitForFunction(expected => {
            const state = (window as unknown as { getWorldDiagnostics(): any }).getWorldDiagnostics();
            return state.webglContext.state === "lost"
                && state.webglContext.losses === expected
                && state.renderSession.state === "lost";
        }, cycle);
        await page.evaluate(() => {
            (window as unknown as { contextLossExtension?: WEBGL_lose_context })
                .contextLossExtension?.restoreContext();
        });
        await page.waitForFunction(expected => {
            const state = (window as unknown as { getWorldDiagnostics(): any }).getWorldDiagnostics();
            return state.webglContext.state === "ready"
                && state.webglContext.restores === expected
                && state.renderSession.state === "ready"
                && state.surfaceTextures.state === "ready"
                && state.fogTextures.state === "ready"
                && (state.renderer?.triangles ?? 0) > 0;
        }, cycle);
    }

    const result = await page.evaluate(() =>
        (window as unknown as { getWorldDiagnostics(): any }).getWorldDiagnostics());
    await testInfo.attach("surface-v2-context-recovery.json", {
        body: JSON.stringify({ baseline, result }, null, 2),
        contentType: "application/json"
    });
    expect(pageErrors).toEqual([]);
    expect(result.webglContext).toMatchObject({ state: "ready", losses: 3, restores: 3 });
    expect(result.surfaceTextures.contextRestores).toBe(3);
    expect(result.fogTextures.contextRestores).toBe(3);
    expect(result.rendererMemory.geometries).toBeLessThanOrEqual(baseline.rendererMemory.geometries + 4);
    expect(result.rendererMemory.textures).toBeLessThanOrEqual(baseline.rendererMemory.textures + 2);
});
