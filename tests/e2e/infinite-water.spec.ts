import { expect, test } from "@playwright/test";

interface InfiniteWaterDiagnostics {
    ready: boolean;
    seed: string;
    camera: { x: number; y: number; zoom: number };
    renderedMainCurves: number;
    renderedBranches: number;
    directionBins: number;
    oceanCoverage: number;
    visibleOceanBasins: number;
    largestOceanDiameter: number;
    minimumOceanCorridor: number;
    sampleSignature: string;
}

const readDiagnostics = () => (window as unknown as {
    getInfiniteWaterDiagnostics(): InfiniteWaterDiagnostics;
}).getInfiniteWaterDiagnostics();

test("the infinite water curve field is deterministic across distant viewport queries", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/infinite-water.html?seed=water-spve36-jen8lk", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as {
        getInfiniteWaterDiagnostics?: () => InfiniteWaterDiagnostics;
    }).getInfiniteWaterDiagnostics?.().ready);

    const initial = await page.evaluate(readDiagnostics);
    expect(initial.seed).toBe("water-spve36-jen8lk");
    expect(initial.renderedMainCurves).toBeGreaterThan(0);
    expect(initial.sampleSignature).not.toBe("");

    const canvas = page.locator("[data-water-field]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    await page.mouse.wheel(0, 5_000);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.15, box!.y + box!.height * 0.8, { steps: 5 });
    await page.mouse.up();

    await expect.poll(() => page.evaluate(readDiagnostics)).toMatchObject({
        ready: true,
        seed: "water-spve36-jen8lk"
    });
    const moved = await page.evaluate(readDiagnostics);
    expect(Math.abs(moved.camera.x) + Math.abs(moved.camera.y)).toBeGreaterThan(4_000);
    expect(moved.camera.zoom).toBeLessThan(initial.camera.zoom);
    expect(moved.renderedMainCurves).toBeGreaterThan(0);
    expect(moved.renderedBranches).toBeGreaterThan(0);
    expect(moved.directionBins).toBeGreaterThanOrEqual(6);
    expect(moved.oceanCoverage).toBeGreaterThan(0.03);
    expect(moved.oceanCoverage).toBeLessThan(0.9);
    expect(moved.visibleOceanBasins).toBeGreaterThan(0);
    expect(moved.largestOceanDiameter).toBeLessThan(5_200);
    expect(moved.minimumOceanCorridor).toBeGreaterThanOrEqual(400);
    expect(moved.sampleSignature).toBe(initial.sampleSignature);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as {
        getInfiniteWaterDiagnostics?: () => InfiniteWaterDiagnostics;
    }).getInfiniteWaterDiagnostics?.().ready);
    const reloaded = await page.evaluate(readDiagnostics);
    expect(reloaded.camera).toEqual(initial.camera);
    expect(reloaded.sampleSignature).toBe(initial.sampleSignature);
    expect(errors).toEqual([]);
});
