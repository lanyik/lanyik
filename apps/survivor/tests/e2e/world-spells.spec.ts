import type { CombatResolution } from "../../src/core/CombatResolution";
import { expect, test } from "@playwright/test";
import type { Group, PerspectiveCamera, WebGLRenderer, Scene, Fog, CubeTexture, InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { SkillSystem } from "../../src/core/SkillSystem";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import { ActorAction } from "../../src/core/CombatWorld";
import { EffectKind } from "../../src/core/CombatEffects";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("the HDR skybox rotates beyond terrain fog; enemy weapons close, travel and sweep without player rune effects", async ({ page }, info) => {
    test.setTimeout(120_000); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 }); await pauseCombat(page);
    const readSky = () => page.evaluate(() => {
        const { map } = (window.survivorApplication!.session as unknown as { view: { map: { getCamera(): PerspectiveCamera;
            worldRoot: Group; rendererHost: { renderer: WebGLRenderer; scene: Scene; render(): void } } } }).view;
        const { renderer, scene } = map.rendererHost, camera = map.getCamera(), fog = scene.fog as Fog;
        const background = scene.background as CubeTexture, position = camera.position.clone(), rotation = camera.quaternion.clone();
        const children = scene.children.filter(child => child.type === "Group");
        const visible = children.map(child => child.visible); children.forEach(child => { child.visible = false; });
        const near = fog.near, far = fog.far;
        const read = () => {
            map.rendererHost.render(); const gl = renderer.getContext(), data = new Uint8Array(32 * 32 * 4);
            gl.readPixels(gl.drawingBufferWidth / 2 - 16, gl.drawingBufferHeight / 2 - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, data); return data;
        };
        try {
            camera.position.set(0, 0, 0); camera.lookAt(0, 1000, -1000);
            const normal = read(); fog.near = 0; fog.far = .1; const denseFog = read();
            camera.lookAt(1000, 100, 1000); const turned = read();
            return { cube: background.isCubeTexture, name: background.name,
                signature: normal.reduce((hash, value) => Math.imul(hash ^ value, 16777619) >>> 0, 2166136261),
                fogDifference: denseFog.filter((value, i) => value !== normal[i]).length,
                directionDifference: turned.filter((value, i) => Math.abs(value - normal[i]) > 5).length };
        } finally {
            camera.position.copy(position); camera.quaternion.copy(rotation); fog.near = near; fog.far = far;
            children.forEach((child, i) => { child.visible = visible[i]; });
        }
    });
    const sky = await readSky();
    expect(sky.cube).toBe(true); expect(sky.name).toBe("procedural-daylight-skybox");
    expect(sky.fogDifference).toBe(0); expect(sky.directionDifference).toBeGreaterThan(100);
    await page.evaluate(async () => {
        const { renderer } = (window.survivorApplication!.session as unknown as { view: { map: { rendererHost: { renderer: WebGLRenderer } } } }).view.map.rendererHost;
        const extension = renderer.getContext().getExtension("WEBGL_lose_context");
        if (!extension) throw new Error("Context-loss test extension unavailable");
        (window as unknown as { skyRecovery: WEBGL_lose_context }).skyRecovery = extension;
        await new Promise<void>(resolve => {
            renderer.domElement.addEventListener("webglcontextlost", () => resolve(), { once: true }); extension.loseContext();
        });
    });
    await page.evaluate(async () => {
        const canvas = document.querySelector<HTMLCanvasElement>("#survivor-world")!;
        await new Promise<void>(resolve => {
            canvas.addEventListener("webglcontextrestored", () => resolve(), { once: true });
            (window as unknown as { skyRecovery: WEBGL_lose_context }).skyRecovery.restoreContext();
        });
    });
    expect(await readSky()).toEqual(sky);
    const spawn = async (kind: number, boss: boolean, distance: number) => combatWorker(page).evaluate(({ kind, boss, distance }) => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { resolution: CombatResolution; entities: CombatWorld; skills: SkillSystem; world: RegionalWorld; autoCast: boolean; attackCooldown: number; };
        fixture.autoCast = false; fixture.attackCooldown = 1000; fixture.resolution.damageImmunity = 1000;
        // Entry may already have started a player windup; disabling auto-cast only prevents the next cast.
        const checkpoint = simulation.checkpoint();
        fixture.skills.restore({ ...checkpoint.skills, recoveryUntil: 0, dashUntil: 0 }, checkpoint.tick);
        const e = fixture.entities, p = e.position, player = e.player;
        while (e.enemies.count) e.remove(e.enemies.slots[0]); while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        e.effects.buffer.count = 0;
        const x = p.x[player], z = p.z[player] - distance;
        const slot = e.spawnEnemy({ x, z, kind, boss, elite: boss, level: 1, region: fixture.world.regionAt(x, z) }, fixture.world.chunks.get("0,0")!);
        e.enemy.attackStep[slot] = 1;
        return slot;
    }, { kind, boss, distance });
    const readSpell = () => page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: {
            enemyEffects: { warnings: InstancedMesh; rocks: InstancedMesh; blades: InstancedMesh; threads: InstancedMesh }; effects: { mesh: InstancedMesh } } } };
        const state = runtime.renderState, slot = state.entities.enemies.slots[0], display = runtime.view.layer.enemyEffects;
        return { action: state.entities.action.kind[slot], warnings: display.warnings.count, rocks: display.rocks.count,
            blades: display.blades.count, threads: display.threads.count, playerEffects: runtime.view.layer.effects.mesh.count,
            projectiles: state.entities.projectiles.count, effects: Array.from(state.effects.kind.slice(0, state.effects.count)),
            verticesFinite: [display.rocks, display.blades, display.threads].every(mesh => Array.from(mesh.instanceMatrix.array).every(Number.isFinite)) };
    });
    await spawn(3, true, 5); await advanceCombat(page, 55);
    expect(await readSpell()).toMatchObject({ action: ActorAction.Jaws, warnings: 4, playerEffects: 0 });
    await page.screenshot({ path: info.outputPath("boss-jaws-warning.png") });
    await advanceCombat(page, 100);
    expect(await readSpell()).toMatchObject({ warnings: 0, effects: [EffectKind.EnemyJaws], blades: 14, playerEffects: 0, verticesFinite: true });
    await page.screenshot({ path: info.outputPath("boss-jaws-open.png") });
    await advanceCombat(page, 45);
    await page.screenshot({ path: info.outputPath("boss-jaws-closing.png") });
    await spawn(2, false, 5); await advanceCombat(page, 55);
    expect(await readSpell()).toMatchObject({ action: ActorAction.Fault, warnings: 6 });
    await advanceCombat(page, 120);
    const fault = await readSpell();
    expect(fault).toMatchObject({ warnings: 0, effects: [EffectKind.EnemyFault], playerEffects: 0, verticesFinite: true });
    expect(fault.rocks).toBeGreaterThan(3);
    await page.screenshot({ path: info.outputPath("guard-advancing-stones.png") });
    await spawn(3, false, 5); await advanceCombat(page, 55);
    expect(await readSpell()).toMatchObject({ action: ActorAction.Volley, warnings: 0, blades: 3, playerEffects: 0 });
    await advanceCombat(page, 100);
    expect(await readSpell()).toMatchObject({ warnings: 0, projectiles: 3, blades: 6, threads: 3, playerEffects: 0, verticesFinite: true });
    await page.screenshot({ path: info.outputPath("caster-curving-blades.png") });
    const lord = await spawn(3, true, 2);
    await combatWorker(page).evaluate(slot => {
        const e = (self as unknown as { fixtureSimulation: { entities: CombatWorld } }).fixtureSimulation.entities;
        e.vitals.health[slot] *= .4;
    }, lord);
    await advanceCombat(page, 55);
    expect(await readSpell()).toMatchObject({ action: ActorAction.Reave, warnings: 2, playerEffects: 0 });
    await advanceCombat(page, 85);
    expect(await readSpell()).toMatchObject({ warnings: 0, effects: [EffectKind.EnemyReave], blades: 3, playerEffects: 0, verticesFinite: true });
    await page.screenshot({ path: info.outputPath("boss-frontal-reave.png") });
    expect(errors).toEqual([]);
});
