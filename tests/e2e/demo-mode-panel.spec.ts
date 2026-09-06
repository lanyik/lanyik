import { expect, test } from "@playwright/test";
import { DEFAULT_WORLD_WATER_STYLE, WORLD_WATER_STYLE_RANGES, WorldWaterGenerationStyle } from "../../src/world/WorldStyleProfile";

interface DemoDiagnostics {
    status: string;
    generating: boolean;
    worldMode: "finite" | "infinite";
    worldStreaming?: { residentChunks: number };
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
    // the root route without an infinite launch flag.
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

    await expect(page.locator("[data-world-mode] option")).toHaveCount(2);
    await page.locator("[data-world-mode]").selectOption("finite");
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            getWorldDiagnostics(): DemoDiagnostics;
        }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating
            && state.worldMode === "finite";
    });
    await expect(page.locator("[data-world-mode]")).toHaveValue("finite");
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
    await length.fill(String(WORLD_WATER_STYLE_RANGES.riverLength.min));
    await length.press("Enter");
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics(): DemoDiagnostics }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating && state.waterStyle?.riverLength === 10;
    });
    // Reset must reset the generator as well as the panel, including the new field.
    await page.getByText("Reset water parameters", { exact: true }).click();
    await page.waitForFunction(defaults => {
        const state = (window as unknown as { getWorldDiagnostics(): DemoDiagnostics }).getWorldDiagnostics();
        return state.status === "generated" && !state.generating
            && JSON.stringify(state.waterStyle) === JSON.stringify(defaults);
    }, DEFAULT_WORLD_WATER_STYLE);
    await expect(length).toHaveValue("100");
    await expect(oceanLevel).toHaveValue("0.46");
});

test("publishes exact decimal water values at slider bounds and from typed input", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/?infinite&quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const state = (window as unknown as { getWorldDiagnostics?: () => DemoDiagnostics }).getWorldDiagnostics?.();
        return state?.waterStyle && !state.generating;
    });
    const checkPublication = async (property: keyof WorldWaterGenerationStyle, value: number) => {
        await page.waitForFunction(({ property, value }) => {
            const state = (window as unknown as { getWorldDiagnostics(): DemoDiagnostics }).getWorldDiagnostics();
            return !state.generating && (state.status === "failed" || state.waterStyle?.[property] === value);
        }, { property, value }, { timeout: 20_000 });
        const result = await page.evaluate(property => {
            const api = window as unknown as {
                getWorldDiagnostics(): DemoDiagnostics;
                worldControls: WorldWaterGenerationStyle;
            };
            const state = api.getWorldDiagnostics();
            return { failed: state.status === "failed", authored: api.worldControls[property], published: state.waterStyle?.[property] };
        }, property);
        expect(result).toEqual({ failed: false, authored: value, published: value });
    };
    // Reproduce 78 * 0.05 at the upper edge first, then cover every fractional
    // step's endpoints. The real drag goes outside the track to exercise clamping.
    const properties = ["riverWarpAmplitude", ...Object.keys(WORLD_WATER_STYLE_RANGES)
        .filter(name => name !== "riverWarpAmplitude") ] as (keyof WorldWaterGenerationStyle)[];
    for (const property of properties) {
        const { min, max, step } = WORLD_WATER_STYLE_RANGES[property];
        if (step >= 1) continue;
        const input = page.locator(`[data-water-generation="${property}"]`);
        const slider = page.locator(".cr.number").filter({ has: input }).locator(".slider");
        const bounds = (await slider.boundingBox())!;
        for (const value of [max, min]) {
            await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await page.mouse.down();
            await page.mouse.move(value === max ? bounds.x + bounds.width + 8 : bounds.x - 8, bounds.y + bounds.height / 2);
            await page.mouse.up();
            await checkPublication(property, value);
        }
    }
    const amplitude = page.locator('[data-water-generation="riverWarpAmplitude"]');
    for (const [typed, expected] of [["3.15", 3.15], ["3.9", 3.9], ["4", 3.9], ["-1", 0]] as const) {
        await amplitude.fill(typed);
        await amplitude.press("Enter");
        await checkPublication("riverWarpAmplitude", expected);
        await expect(amplitude).toHaveValue(String(expected));
    }
    expect(errors).toEqual([]);
});
