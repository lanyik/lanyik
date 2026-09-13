import { expect, test } from "@playwright/test";
import type { Color, Group, Object3D, Scene, WebGLRenderer } from "three";
import type { GroundProjection, HexMap } from "three-hex-map";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { LootEffects } from "../../src/presentation/LootEffects";
import type { LootModels } from "../../src/presentation/LootModels";
import { advanceCombat, combatWorker, inspectCombatWorker, pauseCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

type RenderFixture = {
    load(seed: string, point: { x: number; z: number }): Promise<unknown>;
    map: Pick<HexMap, "getCamera"> & { rendererHost: { renderer: WebGLRenderer; scene: Scene } };
    layer: { groundProjection: GroundProjection; lootEffects: LootEffects; lootModels: LootModels;
        root: Group; dummy: Object3D; height(x: number, z: number): number };
};

test("loot rings survive subtexel motion and a chest seats on a real terrain slope", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page);
    const rings = await page.evaluate(() => {
        const { map, layer } = (window.survivorApplication!.session as unknown as { view: RenderFixture }).view;
        const projection = layer.groundProjection, effects = layer.lootEffects, renderer = map.rendererHost.renderer;
        const visible = projection.root.children.map(child => child.visible);
        const density = projection.target.width / projection.span, size = 128, half = projection.target.width / 2;
        const pixels = new Uint8Array(size * size * 4), samples: { minimum: number; mean: number; alpha: number }[] = [];
        try {
            projection.root.children.forEach(child => { child.visible = child === effects.halo; });
            for (const offset of [0, .5 / density]) {
                effects.begin(0); effects.add(offset, 0, offset, 0, 0); effects.upload(); projection.render(renderer);
                renderer.readRenderTargetPixels(projection.target, half - size / 2, half - size / 2, size, size, pixels);
                const brightness = (x: number, y: number) => {
                    const at = (y * size + x) * 4;
                    return Math.max(pixels[at], pixels[at + 1], pixels[at + 2]) / 255;
                };
                const values = Array.from({ length: 64 }, (_, i) => {
                    const angle = i * Math.PI * 2 / 64, radius = .95 * .60 / 2;
                    const x = size / 2 - .5 + (offset + Math.cos(angle) * radius) * density;
                    const y = size / 2 - .5 + (-offset + Math.sin(angle) * radius) * density;
                    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
                    return brightness(ix, iy) * (1 - fx) * (1 - fy) + brightness(ix + 1, iy) * fx * (1 - fy)
                        + brightness(ix, iy + 1) * (1 - fx) * fy + brightness(ix + 1, iy + 1) * fx * fy;
                });
                let alpha = 0; for (let i = 3; i < pixels.length; i += 4) alpha = Math.max(alpha, pixels[i]);
                samples.push({ minimum: Math.min(...values), mean: values.reduce((a, b) => a + b) / values.length, alpha });
            }
        } finally { projection.root.children.forEach((child, i) => { child.visible = visible[i]; }); }
        return samples;
    });
    for (const ring of rings) { expect(ring.minimum).toBeGreaterThan(.2); expect(ring.alpha).toBe(0); }
    expect(Math.abs(rings[0].mean - rings[1].mean)).toBeLessThan(.025);

    const beams = await page.evaluate(() => {
        const { map, layer } = (window.survivorApplication!.session as unknown as { view: RenderFixture }).view;
        const { renderer } = map.rendererHost, scene = map.rendererHost.scene.clone(false), camera = map.getCamera().clone();
        const effects = layer.lootEffects, parent = effects.beam.parent!;
        const target = layer.groundProjection.target.clone(); target.samples = 4; target.setSize(256, 256);
        const savedTarget = renderer.getRenderTarget(), savedAlpha = renderer.getClearAlpha();
        const savedColor = renderer.getClearColor((scene.fog as { color: Color }).color.clone());
        scene.background = null; scene.add(effects.beam);
        camera.aspect = 1; camera.fov = 47; camera.near = .1; camera.far = 10; camera.updateProjectionMatrix();
        const pixels = new Uint8Array(256 * 256 * 4), measurements: { energy: number; outside: number }[] = [];
        try {
            renderer.setRenderTarget(target); renderer.setClearColor(0, 0);
            for (const time of [0, 1, 3]) for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
                effects.begin(time); effects.add(0, 0, 0, 5, 0); effects.upload();
                camera.position.set(Math.cos(angle) * 4, 2.6, Math.sin(angle) * 4); camera.lookAt(0, 1.075, 0);
                renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
                let energy = 0, outside = 0;
                for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
                    const at = (y * 256 + x) * 4, value = Math.max(pixels[at], pixels[at + 1], pixels[at + 2]);
                    energy += value / 255;
                    if (Math.abs(x + .5 - 128) > 50) outside = Math.max(outside, value);
                }
                measurements.push({ energy, outside });
            }
        } finally {
            parent.add(effects.beam); renderer.setRenderTarget(savedTarget); renderer.setClearColor(savedColor, savedAlpha); target.dispose();
        }
        return measurements;
    });
    for (const beam of beams) { expect(beam.energy).toBeGreaterThan(100); expect(beam.outside).toBeLessThanOrEqual(2); }
    for (let phase = 0; phase < 3; phase++) {
        const energies = beams.slice(phase * 4, phase * 4 + 4).map(beam => beam.energy);
        expect(Math.max(...energies) / Math.min(...energies)).toBeLessThan(1.02);
    }

    // v22's spawn plain is intentionally almost flat; inspect chest grounding on a real ridge instead.
    const ridge = await page.evaluate(() => {
        const { layer } = (window.survivorApplication!.session as unknown as { view: RenderFixture }).view;
        let best = { x: -69, z: 7.794228634, slope: 0 };
        for (let dx = -30; dx <= 30; dx++) for (let dz = -30; dz <= 30; dz++) {
            const x = -69 + dx, z = 7.794228634 + dz;
            const slope = Math.hypot(layer.height(x + .4, z) - layer.height(x - .4, z), layer.height(x, z + .4) - layer.height(x, z - .4)) / .8;
            if (slope > best.slope && slope < .65) best = { x, z, slope };
        }
        return best;
    });
    expect(ridge.slope).toBeGreaterThan(.4);
    await combatWorker(page).evaluate(({ x, z }) => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { playerX: number; playerZ: number; previousPlayerX: number; previousPlayerZ: number; entities: CombatWorld };
        fixture.playerX = fixture.previousPlayerX = x; fixture.playerZ = fixture.previousPlayerZ = z;
        const { position, player } = fixture.entities;
        position.x[player] = position.previousX[player] = x; position.z[player] = position.previousZ[player] = z;
    }, ridge);
    await page.evaluate(async point => {
        const session = window.survivorApplication!.session;
        session.dispatch({ type: "sort-inventory" }); await session.settled;
        await (session as unknown as { view: RenderFixture }).view.load("rift-ember-1", point);
    }, ridge);
    await advanceCombat(page);
    const placement = await page.evaluate(() => {
        const session = window.survivorApplication!.session, player = session.getSnapshot().combat!.player;
        const { map, layer } = (session as unknown as { view: RenderFixture }).view;
        const camera = map.getCamera(), point = camera.position.clone();
        let best = { x: 0, z: 0, slope: 0 };
        for (let dx = -7; dx <= 7; dx += .25) for (let dz = -7; dz <= 7; dz += .25) {
            if (Math.hypot(dx, dz) < 2) continue;
            const x = player.x + dx, z = player.z + dz, y = layer.height(x, z);
            point.set(dx, y + .4, dz); layer.root.localToWorld(point); point.project(camera);
            if (Math.abs(point.x) > .7 || Math.abs(point.y) > .65) continue;
            const slope = Math.hypot(layer.height(x + .4, z) - layer.height(x - .4, z), layer.height(x, z + .4) - layer.height(x, z - .4)) / .8;
            if (slope > best.slope && slope < .9) best = { x, z, slope };
        }
        return best;
    });
    expect(placement.slope).toBeGreaterThan(.15);
    await combatWorker(page).evaluate(({ x, z }) => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const state = simulation.getRenderState(), entities = (simulation as unknown as { entities: CombatWorld }).entities;
        while (entities.enemies.count) entities.remove(entities.enemies.slots[0]);
        entities.effects.buffer.count = 0;
        const chests = state.chests as { count: number; x: Float64Array; z: Float64Array; tiers: Uint8Array };
        chests.count = 1; chests.x[0] = x; chests.z[0] = z; chests.tiers[0] = 2;
    }, placement);
    await page.evaluate(async () => {
        const session = window.survivorApplication!.session;
        session.dispatch({ type: "sort-inventory" }); await session.settled;
    });
    await advanceCombat(page);
    const contact = await page.evaluate(({ x, z }) => {
        const { layer } = (window.survivorApplication!.session as unknown as { view: RenderFixture }).view;
        const chest = layer.lootModels.chest, matrix = layer.dummy.matrix.clone(), point = layer.dummy.position.clone();
        chest.getMatrixAt(0, matrix);
        const { min, max } = chest.geometry.boundingBox!, originX = x - matrix.elements[12], originZ = z - matrix.elements[14];
        let lowest = Infinity, highest = -Infinity, oldPenetration = 0;
        for (let row = 0; row <= 20; row++) for (let column = 0; column <= 20; column++) {
            const px = min.x + (max.x - min.x) * column / 20, pz = min.z + (max.z - min.z) * row / 20;
            point.set(px, min.y, pz).applyMatrix4(matrix);
            const gap = point.y - layer.height(point.x + originX, point.z + originZ);
            lowest = Math.min(lowest, gap); highest = Math.max(highest, gap);
            oldPenetration = Math.max(oldPenetration, layer.height(x + px, z + pz) - layer.height(x, z) - .02);
        }
        return { lowest, highest, oldPenetration, upY: matrix.elements[5], count: chest.count };
    }, placement);
    expect(contact.count).toBe(1); expect(contact.upY).toBeLessThan(.99);
    expect(contact.oldPenetration).toBeGreaterThan(.08);
    expect(contact.lowest).toBeGreaterThan(-.015); expect(contact.lowest).toBeLessThan(.015);
    expect(contact.highest).toBeLessThan(.15);
    await page.addStyleTag({ content: ".survivor { visibility: hidden; }" });
    await page.screenshot({ path: testInfo.outputPath("chest-slope-contact.png") });
    expect(errors).toEqual([]);
    await page.evaluate(() => window.survivorApplication!.dispose());
});
