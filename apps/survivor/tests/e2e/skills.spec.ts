import { isBrowserConsoleFailure } from "../helpers/browserConsole";
import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import type { EnemyKind } from "../../src/core/EnemyDefinitions";
import { advanceCombat, combatWorker, inspectCombatWorker, pauseCombat } from "../helpers/browserCombat";

test("six monster roles share pools; skill effects, ranks and loadout work through the real Worker", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [], atlas: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text());
    });
    page.on("response", response => { if (response.url().endsWith("/effects/skills.png") && response.ok()) atlas.push(response.url()); });
    await inspectCombatWorker(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page);
    expect(atlas).toHaveLength(1);
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number;
            skills: { readyAt: Float64Array }; gainExperience(value: number): void };
        const e = fixture.entities, p = e.position, x = p.x[e.player], z = p.z[e.player];
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        e.effects.buffer.count = 0;
        fixture.autoCast = false; fixture.attackCooldown = 1000;
        fixture.gainExperience(39);
        // Loading may already advance a few automatic casts before the pause acknowledgment.
        fixture.skills.readyAt.fill(0); e.vitals.mana[e.player] = simulation.getSnapshot().player.stats.maxMana;
        for (let kind = 0; kind < 6; kind++) {
            const angle = kind * Math.PI / 3, radius = kind < 3 ? 3 : 4.5;
            const slot = e.spawnEnemy({ x: x + Math.sin(angle) * radius, z: z + Math.cos(angle) * radius, kind: kind as EnemyKind,
                boss: false, elite: false, level: 1, region: fixture.world.regionAt(x, z) }, fixture.world.chunks.get("0,0")!);
            e.enemy.active[slot] = 1; e.vitals.maxHealth[slot] = 10000; e.vitals.health[slot] = 4000;
        }
    });
    await advanceCombat(page, 1);
    await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true });
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "1");
    await panel.locator('[data-skill="frost"]').getByRole("button", { name: "升级 · 1 点" }).click();
    await expect(panel.locator('[data-skill="frost"]')).toContainText("Lv.2 / 5");
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "0");
    const wardIcon = panel.locator('[data-skill="ward"] .skill-icon-trigger');
    await wardIcon.hover();
    await expect(page.getByRole("tooltip")).toContainText("守护结界");
    await page.keyboard.press("Alt");
    await panel.locator(".window-heading").hover();
    await expect(page.getByRole("tooltip")).toHaveAttribute("data-pinned", "true");
    await page.keyboard.press("Alt");
    await panel.locator('[data-skill="ward"] h3').hover();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await wardIcon.dragTo(panel.locator('[data-skill-slot="0"]'));
    await expect(page.locator(".skill-slots").getByRole("button", { name: "1 守护结界" })).toBeDisabled();
    await expect(panel.locator('[data-skill-slot="0"] [data-item-icon="skill"]')).toHaveAttribute("data-item-value", "ward");
    // Slot-to-HUD dragging swaps, while dropping outside a slot and Escape cancel.
    await panel.locator('[data-skill-slot="0"] .skill-icon-trigger').dragTo(page.locator('.skill-slots [data-skill-slot="2"]'));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("连锁闪电");
    await expect(panel.locator('[data-skill-slot="2"]')).toContainText("守护结界");
    await panel.locator('[data-skill-slot="2"] .skill-icon-trigger').focus();
    await page.keyboard.press("Space"); await page.keyboard.press("Digit1");
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await wardIcon.dragTo(panel.locator(".window-heading"));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await wardIcon.focus(); await page.keyboard.press("Space"); await page.keyboard.press("Escape");
    await expect(panel).toBeVisible(); await expect(page.locator(".skill-drag-ghost")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("skill-loadout-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator('[data-skill="ward"]').scrollIntoViewIfNeeded();
    // Real touch pointer events exercise capture and closing the touch-pinned tooltip.
    const touch = await page.context().newCDPSession(page);
    const source = (await wardIcon.boundingBox())!, target = (await panel.locator('[data-skill-slot="3"]').boundingBox())!;
    const sx = source.x + source.width / 2, sy = source.y + source.height / 2;
    const tx = target.x + target.width / 2, ty = target.y + target.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 5; i++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx + (tx - sx) * i / 5, y: sy + (ty - sy) * i / 5 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    await expect(panel.locator('[data-skill-slot="3"]')).toContainText("守护结界");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await panel.locator('[data-skill-slot="3"] .skill-icon-trigger').focus();
    await page.keyboard.press("Space"); await page.keyboard.press("Digit1");
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await expect(panel.getByRole("button", { name: "关闭技能", exact: true })).toBeInViewport();
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("skill-loadout-narrow.png") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 720 });
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        simulation.castSkill("ward"); simulation.castSkill("frost"); simulation.castSkill("chain");
    });
    await advanceCombat(page, 15);
    const rendered = await page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: {
            actors: { enemies: InstancedMesh[][] }; effects: { mesh: InstancedMesh; ward: { visible: boolean } }; mist: { mesh: InstancedMesh }; chargeWarnings: InstancedMesh; castWarnings: InstancedMesh } } };
        const layer = runtime.view.layer;
        return { pools: layer.actors.enemies.map(pool => pool[0].count), effects: layer.effects.mesh.count, ward: layer.effects.ward.visible, mist: layer.mist.mesh.count,
            charge: layer.chargeWarnings.count, spells: layer.castWarnings.count, kinds: Array.from(runtime.renderState.effects.kind.slice(0, runtime.renderState.effects.count)) };
    });
    expect(rendered.pools).toEqual([1, 1, 2, 2]);
    expect(rendered.effects).toBeGreaterThan(60);
    expect(rendered.ward).toBe(true); expect(rendered.mist).toBe(3);
    expect(rendered.charge).toBe(1); expect(rendered.spells).toBe(2);
    expect(rendered.kinds).toContain(4); expect(rendered.kinds).toContain(1); expect(rendered.kinds).toContain(2);
    await page.screenshot({ path: testInfo.outputPath("skills-and-monsters.png") });
    await page.mouse.move(980, 380); await page.mouse.wheel(0, 1800);
    await page.screenshot({ path: testInfo.outputPath("boundary-mist.png") });
    expect(errors).toEqual([]);
});
