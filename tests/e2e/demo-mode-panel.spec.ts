import { expect, test } from "@playwright/test";
import { DEFAULT_WORLD_WATER_STYLE, WORLD_WATER_STYLE_RANGES, WorldWaterGenerationStyle } from "../../src/world/WorldStyleProfile";

interface DemoDiagnostics {
    status: string;
    generating: boolean;
    worldMode: "finite" | "infinite" | "campaign";
    worldStreaming?: { residentChunks: number };
    campaign?: { ready: boolean };
    renderer?: { triangles: number };
    waterStyle?: WorldWaterGenerationStyle;
}

test("links the full terrain shader within the supported attribute budget", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics?: () => DemoDiagnostics;
        }).getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating
            && (state.renderer?.triangles ?? 0) > 0;
    });
    const maxVertexAttributes = await page.evaluate(() => {
        const renderer = (window as unknown as {
            hexWorld: { renderer: { getContext(): WebGLRenderingContext } };
        }).hexWorld.renderer;
        const gl = renderer.getContext();
        return gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
    });
    expect(maxVertexAttributes).toBeGreaterThanOrEqual(15);
    expect(errors).toEqual([]);
});

test("switches and remembers world mode from the root demo control panel", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });

    // quality=fast is the CI render preset; mode selection itself starts from
    // the root route without an infinite/campaign launch flag.
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics?: () => DemoDiagnostics;
        }).getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating && state.worldMode === "finite";
    });

    await page.locator("[data-world-mode]").selectOption("infinite");
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics(): DemoDiagnostics;
        }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating
            && state.worldMode === "infinite"
            && Boolean(state.worldStreaming?.residentChunks);
    });
    expect(new URL(page.url()).search).toBe("?quality=fast");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics?: () => DemoDiagnostics;
        }).getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating && state.worldMode === "infinite";
    });
    await expect(page.locator("[data-world-mode]")).toHaveValue("infinite");

    await page.locator("[data-world-mode]").selectOption("campaign");
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics(): DemoDiagnostics;
        }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating
            && state.worldMode === "campaign" && state.campaign?.ready;
    });
    await expect(page.locator("[data-campaign-panel]")).toBeVisible();
    expect(errors).toEqual([]);
});

test("switches landform diagnostics and regional texture scale live without regenerating", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics?: () => DemoDiagnostics;
        }).getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating;
    });

    const before = await page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): DemoDiagnostics & { worldLifecycle?: { generation: number } };
    }).getWorldDiagnostics().worldLifecycle?.generation);
    await page.locator("[data-landform-debug]").selectOption("ridge");
    await expect(page.locator("[data-landform-debug]")).toHaveValue("ridge");
    await expect.poll(() => page.evaluate(() => (window as unknown as {
        hexWorld: { landformDebugMode: string };
    }).hexWorld.landformDebugMode)).toBe("ridge");
    await page.locator("[data-texture-region]").fill("6");
    await page.locator("[data-texture-region]").press("Enter");
    await expect.poll(() => page.evaluate(() => (window as unknown as {
        hexWorld: { terrainTextureRegionSize: number };
    }).hexWorld.terrainTextureRegionSize)).toBe(6);
    const after = await page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): DemoDiagnostics & { worldLifecycle?: { generation: number } };
    }).getWorldDiagnostics().worldLifecycle?.generation);

    expect(after).toBe(before);
    expect(errors).toEqual([]);
});

test("regenerates the world with water parameters from the control panel", async ({ page }) => {
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics?: () => DemoDiagnostics;
        }).getWorldDiagnostics?.();
        return state?.status === "generated" && !state.generating;
    });

    for (const [name, value] of Object.entries(DEFAULT_WORLD_WATER_STYLE)) {
        await expect(page.locator(`[data-water-generation="${name}"]`)).toHaveValue(String(value));
    }
    const before = await page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): DemoDiagnostics & { worldLifecycle?: { generation: number } };
    }).getWorldDiagnostics().worldLifecycle?.generation);
    const oceanLevel = page.locator('[data-water-generation="oceanLevel"]');
    await oceanLevel.fill("0.54");
    await oceanLevel.press("Enter");
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics(): DemoDiagnostics;
        }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating
            && state.waterStyle?.oceanLevel === 0.54;
    });
    const after = await page.evaluate(() => (window as unknown as {
        getWorldDiagnostics(): DemoDiagnostics & { worldLifecycle?: { generation: number } };
    }).getWorldDiagnostics().worldLifecycle?.generation);

    expect(after).toBeGreaterThan(before ?? -1);
    await expect(oceanLevel).toHaveValue("0.54");

    const length = page.locator('[data-water-generation="riverLength"]');
    await length.fill(String(WORLD_WATER_STYLE_RANGES.riverLength.max));
    await length.press("Enter");
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics(): DemoDiagnostics }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating && state.waterStyle?.riverLength === 96;
    });
    // Reset must reset the generator as well as the panel, including the new field.
    await page.getByText("Reset water parameters", { exact: true }).click();
    await page.waitForFunction(defaults => {
        const state = (window as unknown as { getWorldDiagnostics(): DemoDiagnostics }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating
            && JSON.stringify(state.waterStyle) === JSON.stringify(defaults);
    }, DEFAULT_WORLD_WATER_STYLE);
    await expect(length).toHaveValue("24");
    await expect(oceanLevel).toHaveValue("0.46");
});
