import { isBrowserConsoleFailure } from "../helpers/browserConsole";
import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import type { EnemyKind } from "../../src/core/EnemyDefinitions";
import type { SkillSystem } from "../../src/core/SkillSystem";
import { EffectKind } from "../../src/core/CombatEffects";
import { enterWilds, advanceCombat, combatWorker, inspectCombatWorker, pauseCombat } from "../helpers/browserCombat";

test("constellation drafts, six slots, drag inputs and casting recovery work through the real Worker", async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [], atlas: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    page.on("response", response => { if (response.url().endsWith("/effects/skills.png") && response.ok()) atlas.push(response.url()); });
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page); expect(atlas).toHaveLength(1);
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number;
            skills: SkillSystem; gainExperience(value: number): void };
        const e = fixture.entities, p = e.position, x = p.x[e.player], z = p.z[e.player];
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        fixture.autoCast = false; fixture.attackCooldown = 1000; fixture.gainExperience(39);
        const cp = fixture.skills.checkpoint(simulation.tick);
        fixture.skills.restore({ ...cp, readyAt: cp.readyAt.map(() => 0), recoveryUntil: 0 }, simulation.tick);
        e.vitals.mana[e.player] = simulation.getSnapshot().player.stats.maxMana;
        for (let kind = 0; kind < 6; kind++) {
            const angle = kind * Math.PI / 3, radius = kind < 3 ? 3 : 4.5;
            const slot = e.spawnEnemy({ x: x + Math.sin(angle) * radius, z: z + Math.cos(angle) * radius, kind: kind as EnemyKind,
                boss: false, elite: false, level: 1, region: fixture.world.regionAt(x, z) }, fixture.world.chunks.get("0,0")!);
            e.enemy.active[slot] = 1; e.vitals.maxHealth[slot] = 10000; e.vitals.health[slot] = 4000;
        }
    });
    await advanceCombat(page, 1); await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true });
    await expect(panel.locator(".constellation-node")).toHaveCount(34);
    await expect(panel.locator(".loadout-slot")).toHaveCount(6);
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "1");
    await panel.getByRole("button", { name: "提升冰霜弹", exact: true }).click();
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "1"); // Draft does not spend.
    await expect(panel.locator('[data-node="icebolt"]')).toHaveClass(/draft/);
    await panel.getByRole("button", { name: "应用构筑", exact: true }).click();
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "0");
    await expect(panel.locator('[data-node="icebolt"]')).not.toHaveClass(/draft/);
    await panel.locator('[data-node="icebolt"]').focus(); await page.keyboard.press("Space"); await page.keyboard.press("Digit6");
    await expect(panel.locator('[data-skill-slot="5"]')).toContainText("冰霜弹");
    await page.screenshot({ path: info.outputPath("skill-tree-desktop.png") });
    await panel.locator('[data-node="frost.winter"]').click();
    await expect(panel.locator(".constellation-details")).toContainText("角色 30 级解锁");
    await page.screenshot({ path: info.outputPath("skill-tree-advanced.png") });

    await panel.getByRole("button", { name: "星辰", exact: false }).click();
    const ward = panel.locator('[data-node="ward"]');
    await ward.click(); await panel.locator(".node-detail-icon").hover();
    await expect(page.getByRole("tooltip")).toContainText("守护结界");
    await page.keyboard.press("Alt"); await panel.locator(".window-heading").hover();
    await expect(page.getByRole("tooltip")).toHaveAttribute("data-pinned", "true");
    await page.keyboard.press("Alt"); await panel.locator(".window-heading").hover();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await ward.dragTo(panel.locator('[data-skill-slot="0"]'));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await panel.locator('[data-skill-slot="0"] .skill-icon-trigger').dragTo(page.locator('.skill-slots [data-skill-slot="1"]'));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("连锁闪电");
    await expect(panel.locator('[data-skill-slot="1"]')).toContainText("守护结界");
    await panel.locator('[data-skill-slot="1"] .skill-icon-trigger').focus(); await page.keyboard.press("Space"); await page.keyboard.press("Digit1");
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await ward.dragTo(panel.locator(".window-heading"));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await ward.focus(); await page.keyboard.press("Space"); await page.keyboard.press("Escape");
    await expect(panel).toBeVisible(); await expect(page.locator(".skill-drag-ghost")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await ward.scrollIntoViewIfNeeded();
    const touch = await page.context().newCDPSession(page);
    const source = (await ward.boundingBox())!, target = (await panel.locator('[data-skill-slot="3"]').boundingBox())!;
    const sx = source.x + source.width / 2, sy = source.y + source.height / 2, tx = target.x + target.width / 2, ty = target.y + target.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 5; i++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx + (tx - sx) * i / 5, y: sy + (ty - sy) * i / 5 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await touch.detach();
    await expect(panel.locator('[data-skill-slot="3"]')).toContainText("守护结界");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "关闭技能", exact: true })).toBeInViewport();
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await panel.locator(".school-tabs").getByRole("button", { name: "冰霜", exact: false }).click();
    await page.screenshot({ path: info.outputPath("skill-tree-narrow.png") });
    await page.keyboard.press("Escape"); await page.setViewportSize({ width: 1280, height: 720 });

    const rejected = await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        simulation.castSkill("ward"); simulation.castSkill("chain");
        return simulation.getSnapshot().player.skills;
    });
    expect(rejected.action?.phase).toBe("windup"); expect(rejected.remaining.chain).toBe(0);
    await advanceCombat(page, 50);
    await combatWorker(page).evaluate(() => (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation.castSkill("icebolt"));
    await advanceCombat(page, 20);
    const rendered = await page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: {
            actors: { enemies: InstancedMesh[][] }; effects: { mesh: InstancedMesh; ward: { visible: boolean } } } } };
        const layer = runtime.view.layer;
        return { pools: layer.actors.enemies.map(pool => pool[0].count), effects: layer.effects.mesh.count, ward: layer.effects.ward.visible,
            kinds: Array.from(runtime.renderState.effects.kind.slice(0, runtime.renderState.effects.count)) };
    });
    expect(rendered.pools).toEqual([1, 1, 2, 1, 1]);
    expect(rendered.effects).toBeGreaterThan(0); expect(rendered.ward).toBe(true); expect(rendered.kinds).toContain(EffectKind.IceBolt);
    await page.screenshot({ path: info.outputPath("ice-cast-and-monsters.png") }); expect(errors).toEqual([]);
});
