import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { SkillSystem } from "../../src/core/SkillSystem";
import type { CombatRenderState } from "../../src/core/CombatState";
import { EffectKind } from "../../src/core/CombatEffects";
import { initialSkillRanks, investedPoints, nodeIndex } from "../../src/core/SkillBuild";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("fire tree, channels, attached burning and detonation render across the real Worker and pause exactly", async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 2560, height: 1440 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page); await pauseCombat(page);
    const ranks = initialSkillRanks();
    for (const [id, rank] of Object.entries({ fireball: 10, "fireball.power": 5, "fireball.shape": 5, "fireball.tempo": 5,
        fireray: 5, firewall: 5, pyroblast: 5, meteor: 5, firedomain: 1, doom: 1, "fire.resilience": 5 })) ranks[nodeIndex(id)] = rank;
    await combatWorker(page).evaluate(({ ranks, spent }) => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const cp = sim.checkpoint();
        sim.restore({ ...cp, player: { ...cp.player, level: 100 }, skills: { ...cp.skills, ranks, points: 99 - spent, recoveryUntil: 0, readyAt: cp.skills.readyAt.map(() => 0), dashUntil: 0,
            loadout: ["fireball", "fireray", "firewall", "firedomain", "pyroblast", "meteor"] } });
        const f = sim as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number };
        f.autoCast = false; f.attackCooldown = 10000;
        const e = f.entities, p = e.position;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        for (let i = 0; i < 8; i++) {
            const x = p.x[e.player] + 2 + i % 3 * .45, z = p.z[e.player] + (Math.floor(i / 3) - 1) * .55;
            const slot = e.spawnEnemy({ x, z, kind: 0, boss: false, elite: false, level: 1, region: f.world.regionAt(x, z) }, { resident: true });
            e.vitals.health[slot] = e.vitals.maxHealth[slot] = 100000; e.enemy.speed[slot] = 0; e.action.readyAt[slot] = 100000;
        }
    }, { ranks, spent: investedPoints(ranks) });
    await advanceCombat(page); await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true });
    await panel.getByRole("button", { name: "火焰" }).click();
    await expect(panel.locator("[data-node]")).toHaveCount(34);
    await expect(panel.locator('[data-node="fireball"]')).toHaveClass(/equipped/);
    await panel.locator('[data-node="fireray"]').hover(); await expect(page.getByRole("tooltip")).toContainText("引导");
    await panel.locator('[data-node="fireray"]').click(); await expect(panel.locator(".node-detail-stats")).toContainText("引导时长");
    await expect(panel.locator(".node-detail-stats")).toContainText("本人叠层上限");
    const box = (await panel.boundingBox())!; expect(Math.abs(box.x + box.width / 2 - 1280)).toBeLessThan(2);
    await page.screenshot({ path: info.outputPath("fire-tree-2k.png") });
    await panel.getByRole("button", { name: "关闭技能", exact: true }).click(); await expect(panel).toHaveCount(0);

    const cast = async (id: "fireball" | "fireray" | "firewall" | "firedomain" | "pyroblast" | "meteor" | "doom") => {
        const started = await combatWorker(page).evaluate(id => {
            const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            const e = (sim as unknown as { entities: CombatWorld }).entities;
            e.vitals.mana[e.player] = 1000; if (id === "doom") sim.equipSkill(id, 3); sim.castSkill(id);
            return sim.getSnapshot().player.skills.action;
        }, id);
        expect(started?.skill).toBe(id);
    };
    await cast("fireball"); await advanceCombat(page, 26);
    const read = () => page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState;
            view: { layer: { effects: { mesh: InstancedMesh }; statusEffects: { flames: InstancedMesh; smoke: InstancedMesh; embers: InstancedMesh } } } };
        const { effects, statusEffects } = runtime.view.layer, state = runtime.renderState;
        return { shots: state.fireProjectiles.count, kinds: Array.from(state.effects.kind.slice(0, state.effects.count)),
            burning: Array.from(state.entities.status.burnStacks).filter(Boolean), flames: statusEffects.flames.count, smoke: statusEffects.smoke.count,
            matrices: Array.from(effects.mesh.instanceMatrix.array.slice(0, effects.mesh.count * 16)),
            flameMatrices: Array.from(statusEffects.flames.instanceMatrix.array.slice(0, statusEffects.flames.count * 16)) };
    });
    expect((await read()).shots).toBe(1); await page.screenshot({ path: info.outputPath("fireball-flight.png") });
    await advanceCombat(page, 50); expect((await read()).flames).toBeGreaterThan(0);
    await cast("firewall"); await advanceCombat(page, 95);
    await cast("firedomain"); await advanceCombat(page, 140);
    await cast("fireray"); await advanceCombat(page, 110);
    const burning = await read();
    expect(burning.kinds).toEqual(expect.arrayContaining([EffectKind.FireWall, EffectKind.FireDomain, EffectKind.FireRay]));
    expect(burning.burning.some(value => value > 1)).toBe(true); expect(burning.flames).toBeGreaterThan(3); expect(burning.smoke).toBeGreaterThan(0);
    expect(burning.matrices.every(Number.isFinite)).toBe(true); expect(burning.flameMatrices.every(Number.isFinite)).toBe(true);
    await expect(page.getByRole("progressbar", { name: "施法进度" })).toContainText("持续引导");
    await page.screenshot({ path: info.outputPath("fire-fields-and-burning.png") }); expect(await read()).toEqual(burning);
    await combatWorker(page).evaluate(() => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const f = sim as unknown as { skills: SkillSystem; random: never };
        f.skills.advanceCasting(sim.tick, f.random, true, () => {});
    });
    await advanceCombat(page, 20); expect((await read()).kinds).not.toContain(EffectKind.FireRay);
    await cast("meteor"); await advanceCombat(page, 165);
    expect((await read()).kinds).toEqual(expect.arrayContaining([EffectKind.MeteorImpact, EffectKind.Detonation]));
    await page.screenshot({ path: info.outputPath("meteor-detonation.png") });
    await cast("pyroblast"); await advanceCombat(page, 45); await page.screenshot({ path: info.outputPath("pyroblast-volley.png") });
    await advanceCombat(page, 45); await cast("doom"); await advanceCombat(page, 86);
    expect((await read()).kinds).toContain(EffectKind.Doom); await page.screenshot({ path: info.outputPath("doom-explosion.png") });
    await advanceCombat(page, 1400); const expired = await read();
    expect(expired.flames).toBe(0); expect(expired.smoke).toBe(0); expect(expired.shots).toBe(0);
    expect(errors).toEqual([]);
});
