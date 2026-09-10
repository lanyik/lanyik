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
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
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
    await expect(panel).toContainText("可用点数 1");
    await panel.locator('[data-skill="frost"]').getByRole("button", { name: "升级 · 1 点" }).click();
    await expect(panel.locator('[data-skill="frost"]')).toContainText("Lv.2 / 5");
    await expect(panel).toContainText("可用点数 0");
    await panel.getByRole("group", { name: "选择技能槽" }).getByRole("button", { name: "1 裂隙脉冲", exact: true }).click();
    await panel.locator('[data-skill="ward"]').getByRole("button", { name: "装配到 1" }).click();
    await expect(page.locator(".skill-slots").getByRole("button", { name: "1 守护结界" })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator('[data-skill="ward"]').scrollIntoViewIfNeeded();
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
            actors: { enemies: InstancedMesh[][] }; effects: { mesh: InstancedMesh }; chargeWarnings: InstancedMesh; castWarnings: InstancedMesh } } };
        const layer = runtime.view.layer;
        return { pools: layer.actors.enemies.map(pool => pool[0].count), effects: layer.effects.mesh.count,
            charge: layer.chargeWarnings.count, spells: layer.castWarnings.count, kinds: Array.from(runtime.renderState.effects.kind.slice(0, runtime.renderState.effects.count)) };
    });
    expect(rendered.pools).toEqual([1, 1, 2, 2]);
    expect(rendered.effects).toBeGreaterThanOrEqual(3);
    expect(rendered.charge).toBe(1); expect(rendered.spells).toBe(2);
    expect(rendered.kinds).toContain(4); expect(rendered.kinds).toContain(1); expect(rendered.kinds).toContain(2);
    await page.screenshot({ path: testInfo.outputPath("skills-and-monsters.png") });
    expect(errors).toEqual([]);
});
