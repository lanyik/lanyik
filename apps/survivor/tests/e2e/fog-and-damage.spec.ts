import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { Group, PerspectiveCamera, WebGLRenderer, Scene, Fog, Mesh, InstancedMesh, RawShaderMaterial, Vector3, Material, BufferGeometry } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { DamageNumbers } from "../../src/presentation/DamageNumbers";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("distant terrain merges into the sky and 256 damage labels add exactly one draw", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45000 }); await pauseCombat(page);
    const fogResults = await page.evaluate(() => {
        const { map, layer } = (window.survivorApplication!.session as unknown as { view: {
            map: { getCamera(): PerspectiveCamera; worldRoot: Group; controls: { target: Vector3 };
                rendererHost: { renderer: WebGLRenderer; scene: Scene; render(projection?: undefined, focus?: Vector3): void } };
            layer: { projectiles: InstancedMesh; damageNumbers: DamageNumbers } } }).view;
        const host = map.rendererHost, { renderer, scene } = host, camera = map.getCamera(), root = map.worldRoot;
        const fog = scene.fog as Fog, near = fog.near, far = fog.far, position = camera.position.clone(), rotation = camera.quaternion.clone();
        let terrain: Mesh | undefined;
        root.traverse(object => {
            const mesh = object as Mesh, material = mesh.material as RawShaderMaterial;
            if (!terrain && mesh.isMesh && material?.isRawShaderMaterial && material.fragmentShader.includes("vec3 applyHorizonFog(")
                && material.fragmentShader.includes("terrain")) terrain = mesh;
        });
        if (!terrain) throw new Error("Actual terrain material unavailable");
        const MeshType = layer.damageNumbers.mesh.constructor as typeof Mesh;
        const GeometryType = Object.getPrototypeOf(Object.getPrototypeOf(layer.damageNumbers.mesh.geometry)).constructor as typeof BufferGeometry;
        const ground = new MeshType(new GeometryType().copy(terrain.geometry), terrain.material);
        ground.geometry.computeBoundingBox(); const box = ground.geometry.boundingBox!, center = box.getCenter(camera.position.clone());
        ground.geometry.translate(-center.x, -center.y, -center.z); ground.scale.setScalar(300 / Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
        const solid = layer.projectiles.clone(); solid.geometry = layer.projectiles.geometry.clone(); solid.material = (layer.projectiles.material as Material).clone();
        solid.count = 1; solid.setMatrixAt(0, camera.matrixWorld.clone().identity()); solid.scale.setScalar(2000);
        const children = root.children.slice(), visible = children.map(child => child.visible); children.forEach(child => { child.visible = false; });
        const focus = camera.position.clone().set(0, 0, 0);
        const read = () => {
            host.render(undefined, focus); const gl = renderer.getContext(), pixels = new Uint8Array(32 * 32 * 4);
            gl.readPixels(gl.drawingBufferWidth / 2 - 16, gl.drawingBufferHeight / 2 - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
        };
        const results: { type: string; altitude: number; fogDifference: number; controlDifference: number }[] = [];
        try {
            for (const mesh of [ground, solid]) for (const altitude of [100, 1100]) {
                root.add(mesh); mesh.visible = true; mesh.frustumCulled = false; mesh.position.set(2150, altitude, 0);
                camera.position.set(0, altitude + 900, 0); camera.lookAt(mesh.position); camera.updateMatrixWorld();
                fog.near = near; fog.far = far; const loaded = read(); mesh.visible = false; const unloaded = read();
                mesh.visible = true; fog.near = 10000; fog.far = 20000; const control = read();
                results.push({ type: mesh === ground ? "terrain" : "standard", altitude,
                    fogDifference: loaded.reduce((max, value, i) => Math.max(max, Math.abs(value - unloaded[i])), 0),
                    controlDifference: control.filter((value, i) => Math.abs(value - unloaded[i]) > 5).length });
                root.remove(mesh);
            }
            return results;
        } finally {
            root.remove(ground, solid); ground.geometry.dispose(); solid.geometry.dispose(); (solid.material as Material).dispose();
            camera.position.copy(position); camera.quaternion.copy(rotation); fog.near = near; fog.far = far;
            children.forEach((child, i) => { child.visible = visible[i]; });
        }
    });
    await info.attach("fog-pixel-measurements", { body: JSON.stringify(fogResults, null, 2), contentType: "application/json" });
    for (const result of fogResults) { expect(result.controlDifference).toBeGreaterThan(100); expect(result.fogDifference).toBeLessThanOrEqual(1); }
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; tickValue: number }, e = fixture.entities, player = e.player;
        e.combatText.buffer.count = 0;
        for (let i = 0; i < 256; i++) e.combatText.add(10000 + i, i % 8, 100 + i, e.position.x[player] + (i % 16 - 8) * .8, e.position.z[player] + (Math.floor(i / 16) - 8) * .6, fixture.tickValue);
    });
    await advanceCombat(page);
    const batching = await page.evaluate(() => {
        const { map, layer } = (window.survivorApplication!.session as unknown as { view: {
            map: { controls: { target: Vector3 }; rendererHost: { renderer: WebGLRenderer; render(projection?: undefined, focus?: Vector3): void } };
            layer: { damageNumbers: DamageNumbers } } }).view;
        const mesh = layer.damageNumbers.mesh, host = map.rendererHost;
        const visible = mesh.visible;
        mesh.visible = false; host.render(undefined, map.controls.target); const without = { ...host.renderer.info.render };
        mesh.visible = visible; host.render(undefined, map.controls.target); const withText = host.renderer.info.render;
        return { visible, glyphs: mesh.geometry.instanceCount, draws: withText.calls - without.calls, triangles: withText.triangles - without.triangles };
    });
    expect(batching.visible).toBe(true); expect(batching.glyphs).toBeGreaterThan(256);
    expect(batching.draws).toBe(1); expect(batching.triangles).toBe(batching.glyphs * 2);
    await page.screenshot({ path: info.outputPath("batched-damage-numbers.png") });
    await info.attach("damage-batching", { body: JSON.stringify(batching), contentType: "application/json" });
    await writeFile(info.outputPath("measurements.json"), JSON.stringify({ fog: fogResults, damage: batching }, null, 2));
    expect(errors).toEqual([]);
});
