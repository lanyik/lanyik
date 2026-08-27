import { expect, test } from "@playwright/test";

interface DemoDiagnostics {
    status: string;
    generating: boolean;
    worldMode: "finite" | "infinite" | "campaign";
    worldStreaming?: { residentChunks: number };
    campaign?: { ready: boolean };
}

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
