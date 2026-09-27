import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import type {} from "../helpers/HeroPresentationFixture";

test("hero skeletal layers render independently and browser audio unlocks, synthesizes and disposes", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 640, height: 400 });
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("../helpers/HeroPresentationFixture.tsx", import.meta.url))],
        bundle: true, write: false, format: "esm", platform: "browser", define: { "import.meta.env.BASE_URL": '"/"' } });
    await page.route("**/__hero-fixture", route => route.fulfill({ contentType: "text/html",
        body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><canvas></canvas><div id="controls"></div><script type="module" src="/__hero.js"></script></html>' }));
    await page.route("**/__hero.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/__hero-fixture");
    await expect.poll(() => page.evaluate(() => !!window.heroFixture)).toBe(true);
    const idle = await page.evaluate(() => window.heroFixture.pose("idle"));
    expect(idle.bones).toBe(130); expect(idle.maxY).toBeCloseTo(1.6, 1); expect(idle.drawCalls).toBe(1);
    const moving = await page.evaluate(() => window.heroFixture.pose("move"));
    await page.locator("canvas").screenshot({ path: testInfo.outputPath("hero-moving.png") });
    const attack = await page.evaluate(() => window.heroFixture.pose("moving-attack"));
    expect(attack.legs).toEqual(moving.legs); expect(attack.arm).not.toEqual(moving.arm); expect(attack.drawCalls).toBe(1);
    await page.locator("canvas").screenshot({ path: testInfo.outputPath("hero-attack.png") });
    await page.evaluate(() => window.heroFixture.pose("rear-attack"));
    await page.locator("canvas").screenshot({ path: testInfo.outputPath("hero-rear-attack.png") });
    const death = await page.evaluate(() => window.heroFixture.pose("death"));
    expect(death.maxY).toBeLessThan(idle.maxY * .6); expect(death.minY).toBeGreaterThan(-.2);
    await page.locator("canvas").screenshot({ path: testInfo.outputPath("hero-death.png") });
    await page.getByRole("button", { name: "启用声音" }).click();
    await expect.poll(() => page.evaluate(() => window.heroFixture.audioState().status)).toBe("ready");
    await page.getByRole("slider", { name: "音量" }).fill("20");
    expect(await page.evaluate(() => window.heroFixture.audioState().volume)).toBe(.2);
    await page.getByRole("checkbox", { name: "音效与环境声" }).uncheck();
    expect(await page.evaluate(() => window.heroFixture.audioState().enabled)).toBe(false);
    for (const sample of await page.evaluate(() => window.heroFixture.samples())) {
        expect(sample.finite).toBe(true); expect(sample.peak).toBeGreaterThan(.01); expect(sample.peak).toBeLessThan(.5);
    }
    const resources = await page.evaluate(() => window.heroFixture.dispose());
    expect(resources.remaining).toEqual(resources.baseline); expect(resources.remaining.geometries).toBe(0);
    expect(resources.allocated.cpuBytes).toBeGreaterThan(0); expect(resources.allocated.gpuBytes).toBeGreaterThan(0);
    expect(resources.released.cpuBytes).toBe(0); expect(resources.released.gpuBytes).toBe(0);
    expect(errors).toEqual([]);
});
