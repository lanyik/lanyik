import { expect, test } from "@playwright/test";

interface KeyboardTestMap {
    interactionStats: { movementKeys: readonly string[] };
    dispose(): void;
}

test("WASD input is isolated to the focused map canvas", async ({ page }) => {
    await page.goto("/?quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { hexWorld?: unknown }).hexWorld));
    await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.dataset.secondWorldCanvas = "";
        canvas.style.width = "320px";
        canvas.style.height = "180px";
        document.body.append(canvas);
        const api = window as unknown as {
            HexMap: { HexMap: new(options: { element: string }) => KeyboardTestMap };
            secondHexWorld?: KeyboardTestMap;
        };
        api.secondHexWorld = new api.HexMap.HexMap({ element: "[data-second-world-canvas]" });
    });

    await page.locator("[data-world-canvas]").click({ position: { x: 20, y: 20 } });
    await page.keyboard.down("w");
    expect(await page.evaluate(() => {
        const api = window as unknown as { hexWorld: KeyboardTestMap; secondHexWorld: KeyboardTestMap };
        return {
            first: api.hexWorld.interactionStats.movementKeys,
            second: api.secondHexWorld.interactionStats.movementKeys,
            active: document.activeElement?.hasAttribute("data-world-canvas")
        };
    })).toEqual({ first: ["KeyW"], second: [], active: true });

    await page.locator("[data-second-world-canvas]").click({ position: { x: 20, y: 20 } });
    await page.keyboard.up("w");
    await page.keyboard.down("d");
    expect(await page.evaluate(() => {
        const api = window as unknown as { hexWorld: KeyboardTestMap; secondHexWorld: KeyboardTestMap };
        return {
            first: api.hexWorld.interactionStats.movementKeys,
            second: api.secondHexWorld.interactionStats.movementKeys,
            active: document.activeElement?.hasAttribute("data-second-world-canvas")
        };
    })).toEqual({ first: [], second: ["KeyD"], active: true });

    await page.keyboard.up("d");
    await page.evaluate(() => {
        const api = window as unknown as { secondHexWorld: KeyboardTestMap };
        api.secondHexWorld.dispose();
        document.querySelector("[data-second-world-canvas]")?.remove();
    });
});
