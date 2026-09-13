import { expect, test } from "@playwright/test";
import type { DataArrayTexture, Group, Mesh, MeshStandardMaterial, RawShaderMaterial } from "three";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("free forest materials and linear terrain surfaces render in full and fast quality and release on replacement", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await page.evaluate(async () => {
        const session = window.survivorApplication!.session;
        session.dispatch({ type: "toggle-pause" }); await session.settled;
    });
    for (const quality of ["full", "fast", "full"] as const) {
        const state = await page.evaluate(async quality => {
            const session = window.survivorApplication!.session as unknown as { view: {
                render: () => void;
                load(seed: string, point: { x: number; z: number }): Promise<void>;
                map: { options: { terrainShaderQuality: string }; worldRoot: Group;
                    terrain: { atlasTexture: DataArrayTexture; surfaceTexture: DataArrayTexture; landMaterial: RawShaderMaterial } };
            } };
            const view = session.view, map = view.map, previous = map.terrain;
            let released = 0;
            for (const texture of [previous.atlasTexture, previous.surfaceTexture]) texture.addEventListener("dispose", () => released++);
            view.render = () => {}; // Fixed scene review, independent of simulation camera tracking.
            map.options.terrainShaderQuality = quality;
            await view.load("rift-ember-1", { x: 39, z: -28.5788383 });
            await new Promise<void>(resolve => { let frames = 12; const tick = () => --frames ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); });
            const surface = map.terrain.surfaceTexture;
            let bark = 0, foliage = 0;
            map.worldRoot.traverse(object => {
                const mesh = object as Mesh;
                if (!mesh.isMesh || Array.isArray(mesh.material)) return;
                const material = mesh.material as MeshStandardMaterial;
                if (material.name === "bark:forest-lit" && material.normalMap && material.roughnessMap) bark++;
                if (material.userData.forestFoliage && material.map && material.alphaTest === .42) foliage++;
            });
            return { released, bark, foliage, size: [surface.image.width, surface.image.height, surface.image.depth],
                bytes: surface.image.data!.byteLength, enabled: map.terrain.landMaterial.defines.TERRAIN_SURFACE_MAP,
                shader: map.terrain.landMaterial.fragmentShader.includes("Two broad sine waves") ? "fast" : "full" };
        }, quality);
        expect(state).toMatchObject({ released: 2, size: [504, 504, 8], bytes: 504 * 504 * 8 * 4, enabled: 1, shader: quality });
        expect(state.bark).toBeGreaterThan(0); expect(state.foliage).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath(`forest-${quality}.png`) });
    }
    await page.evaluate(() => window.survivorApplication!.dispose());
    expect(errors).toEqual([]);
});
