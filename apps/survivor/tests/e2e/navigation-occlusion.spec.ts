import { expect, test } from "@playwright/test";
import type { Group, PerspectiveCamera, Vector4, Vector3, WebGLRenderer, Scene } from "three";
import type { HexMap } from "three-hex-map";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";
import { pauseCombat } from "../helpers/browserCombat";

type Fixture = { view: {
    render(): void;
    load(seed: string, point: { x: number; z: number }): Promise<void>;
    layer: { root: Group; player: Group; height(x: number, z: number): number };
    map: { size: number; surface: NonNullable<HexMap["surface"]>; getCamera(): PerspectiveCamera;
        options: { foregroundFadeRadius: number }; forestFocus: { value: Vector4 }; renderOrigin: { x: number; y: number };
        controls: { target: Vector3; enableDamping: boolean; update(): void };
        rendererHost: { renderer: WebGLRenderer; scene: Scene } };
} };

test("foreground trees reveal the player locally and orbiting a ridge keeps the camera above terrain", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await page.goto("/"); await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await pauseCombat(page);
    const coverage = await page.evaluate(async () => {
        const { view } = window.survivorApplication!.session as unknown as Fixture;
        view.render = () => {};
        await view.load("rift-ember-1", { x: 39, z: -28.5788383 });
        const { map, layer } = view;
        layer.root.visible = true;
        layer.root.children.forEach(child => { child.visible = child === layer.player; });
        layer.root.position.set(39 * map.size, 0, -28.5788383 * map.size);
        layer.player.position.set(0, layer.height(39, -28.5788383), 0);
        const { renderer, scene } = map.rendererHost;
        await new Promise<void>(resolve => { let n = 12; const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); });
        const gl = renderer.getContext(), read = () => {
            renderer.render(scene, map.getCamera());
            const center = new Uint8Array(96 * 96 * 4), corner = new Uint8Array(32 * 32 * 4);
            gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) - 48, Math.floor(gl.drawingBufferHeight / 2) - 48, 96, 96, gl.RGBA, gl.UNSIGNED_BYTE, center);
            gl.readPixels(8, 8, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, corner);
            return { center, corner };
        };
        const radius = map.forestFocus.value.w;
        map.forestFocus.value.w = 0; const covered = read();
        map.forestFocus.value.w = radius; const visible = read();
        return { radius, centerChanged: visible.center.filter((v, i) => Math.abs(v - covered.center[i]) > 8).length,
            outsideChanged: visible.corner.filter((v, i) => v !== covered.corner[i]).length };
    });
    expect(coverage.radius).toBeGreaterThan(0); expect(coverage.centerChanged).toBeGreaterThan(200);
    expect(coverage.outsideChanged).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("player-in-forest.png") });
    await page.evaluate(async () => {
        const { view } = window.survivorApplication!.session as unknown as Fixture;
        await view.load("rift-ember-1", { x: -69, z: 7.794228634 }); view.layer.root.visible = false;
        view.map.controls.enableDamping = false;
    });
    for (const angle of [0, 1.6, 3.2, 4.8]) {
        const result = await page.evaluate(async angle => {
            const { map } = (window.survivorApplication!.session as unknown as Fixture).view;
            const camera = map.getCamera(), target = map.controls.target;
            camera.position.set(target.x + Math.cos(angle) * 400, target.y + 35, target.z + Math.sin(angle) * 400);
            map.controls.update();
            const distance = camera.position.distanceTo(target);
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const point = target.clone(); let minimum = Infinity;
            for (let i = 1; i <= 100; i++) {
                point.copy(target).lerp(camera.position, i / 100);
                minimum = Math.min(minimum, point.y - map.surface.getWorldHeight(point.x + map.renderOrigin.x, point.z + map.renderOrigin.y));
            }
            return { minimum, distance, actualDistance: camera.position.distanceTo(target) };
        }, angle);
        expect(result.minimum).toBeGreaterThanOrEqual(-.05);
        expect(result.actualDistance).toBeCloseTo(result.distance, 3);
    }
    await page.screenshot({ path: testInfo.outputPath("ridge-camera-clearance.png") });
    await page.evaluate(() => window.survivorApplication!.dispose());
    expect(errors).toEqual([]);
});
