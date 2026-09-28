import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import type {} from "../helpers/TerrainReflectionFixture";

test("rough terrain retains dielectric reflection and matches Standard at grazing angles", async ({ page }) => {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("../helpers/TerrainReflectionFixture.ts", import.meta.url))],
        bundle: true, write: false, format: "esm", platform: "browser" });
    await page.route("**/__terrain-reflections", route => route.fulfill({ contentType: "text/html",
        body: '<!doctype html><canvas></canvas><script type="module" src="/__terrain-reflections.js"></script>' }));
    await page.route("**/__terrain-reflections.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/__terrain-reflections");
    await expect.poll(() => page.evaluate(() => window.terrainReflectionSamples?.length)).toBe(9);
    const samples = await page.evaluate(() => window.terrainReflectionSamples);
    for (const sample of samples) {
        expect(sample.terrain, JSON.stringify(sample)).toBeGreaterThan(20);
        expect(Math.abs(sample.terrain - sample.standard), JSON.stringify(sample)).toBeLessThanOrEqual(3);
    }
    expect(samples.find(sample => sample.roughness === 1 && sample.cosine === .1)!.terrain).toBeLessThan(60);
    expect(errors).toEqual([]);
});
