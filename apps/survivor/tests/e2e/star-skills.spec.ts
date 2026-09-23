import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import type { SkillId } from "../../src/core/Skills";
import { EffectKind } from "../../src/core/CombatEffects";
import { StatusKind } from "../../src/core/StatusSystem";
import { initialSkillRanks, investedPoints, nodeIndex } from "../../src/core/SkillBuild";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("star tree, support states, cleansing and all seven spells cross the real Worker and render boundary", async ({ page }, info) => {
    test.setTimeout(180_000); await page.setViewportSize({ width: 2560, height: 1440 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click(); await enterWilds(page); await pauseCombat(page);
    const ranks = initialSkillRanks();
    for (const [id, rank] of Object.entries({ starbolt: 10, "starbolt.power": 5, "starbolt.shape": 5, "starbolt.tempo": 5,
        infusion: 5, blades: 5, ward: 5, shelter: 5, "shelter.tempo": 3, resonance: 1, bastion: 1, "bastion.tempo": 5 })) ranks[nodeIndex(id)] = rank;
    // The recovery side branch requires bastion rank 5.
    ranks[nodeIndex("bastion")] = 5;
    await combatWorker(page).evaluate(({ ranks, spent }) => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation, cp = sim.checkpoint();
        sim.restore({ ...cp, player: { ...cp.player, level: 100 }, skills: { ...cp.skills, ranks, points: 99 - spent,
            recoveryUntil: 0, readyAt: cp.skills.readyAt.map(() => 0), loadout: ["starbolt", "infusion", "ward", "shelter", "blades", "resonance"] } });
        const f = sim as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number };
        f.autoCast = false; f.attackCooldown = 10000;
        const e = f.entities, p = e.position;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        for (let i = 0; i < 10; i++) {
            const x = p.x[e.player] + 2.4 + i % 3 * .3, z = p.z[e.player] + (Math.floor(i / 3) - 1) * .5;
            const slot = e.spawnEnemy({ x, z, kind: 0, boss: false, elite: false, level: 1, region: f.world.regionAt(x, z) }, { resident: true });
            e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1000000; e.enemy.speed[slot] = 0; e.action.readyAt[slot] = 100000;
        }
    }, { ranks, spent: investedPoints(ranks) });
    await advanceCombat(page); await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true });
    await panel.getByRole("navigation", { name: "技能学派" }).getByRole("button", { name: "星辰 完整分支", exact: true }).click();
    await expect(panel.locator("[data-node]")).toHaveCount(34); await expect(panel.locator('[data-node="starbolt"]')).toHaveClass(/equipped/);
    await panel.locator('[data-node="infusion"]').hover(); await expect(page.getByRole("tooltip")).toContainText("强化");
    await panel.locator('[data-node="shelter"]').click(); await expect(panel.locator(".node-detail-stats")).toContainText("净化负面来源组");
    const bounds = (await panel.boundingBox())!; expect(Math.abs(bounds.x + bounds.width / 2 - 1280)).toBeLessThan(2);
    await page.screenshot({ path: info.outputPath("star-tree-2k.png") });
    await page.setViewportSize({ width: 390, height: 844 }); await panel.locator('[data-node="bastion"]').click();
    await expect(panel.getByRole("button", { name: "关闭技能", exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath("star-tree-narrow.png") });
    await panel.getByRole("button", { name: "关闭技能", exact: true }).click(); await page.setViewportSize({ width: 2560, height: 1440 });
    const cast = async (id: SkillId) => {
        const action = await combatWorker(page).evaluate(id => {
            const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            const e = (sim as unknown as { entities: CombatWorld }).entities;
            e.vitals.mana[e.player] = sim.getSnapshot().player.stats.maxMana;
            if (id === "bastion") sim.equipSkill(id, 5);
            sim.castSkill(id); return sim.getSnapshot().player.skills.action;
        }, id);
        expect(action?.skill).toBe(id);
    };
    const read = () => page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState;
            view: { layer: { effects: { mesh: InstancedMesh; ward: { visible: boolean } }; statusEffects: { starMotes: InstancedMesh; astralShield: InstancedMesh; weakness: InstancedMesh } } } };
        const { effects, statusEffects } = runtime.view.layer, state = runtime.renderState;
        return { kinds: Array.from(state.effects.kind.slice(0, state.effects.count)), motes: statusEffects.starMotes.count,
            guard: statusEffects.astralShield.count, weak: statusEffects.weakness.count, ward: effects.ward.visible,
            matrices: Array.from(effects.mesh.instanceMatrix.array.slice(0, effects.mesh.count * 16)),
            statusMatrices: Array.from(statusEffects.starMotes.instanceMatrix.array.slice(0, statusEffects.starMotes.count * 16)) };
    });
    await cast("starbolt"); await advanceCombat(page, 25);
    expect((await read()).kinds).toContain(EffectKind.StarBolt); expect((await read()).weak).toBeGreaterThan(0); expect((await read()).motes).toBe(1);
    await expect(page.getByLabel("增益与减益")).toContainText("星能 1 层"); await page.screenshot({ path: info.outputPath("starbolt-weakness.png") });
    await advanceCombat(page, 45); await cast("infusion"); await advanceCombat(page, 30);
    expect((await read()).kinds).toContain(EffectKind.Infusion); expect((await read()).motes).toBe(3);
    await expect(page.getByLabel("增益与减益")).toContainText("3 次");
    await advanceCombat(page, 40); await cast("ward"); await advanceCombat(page, 25);
    expect((await read()).ward).toBe(true); expect((await read()).motes).toBe(3);
    await advanceCombat(page, 40);
    await combatWorker(page).evaluate(({ slow }) => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const e = (sim as unknown as { entities: CombatWorld }).entities, id = e.world.ids[e.player];
        e.status.apply(slow, 999, id, .3, sim.tick + 400, sim.tick); e.status.burns.apply(999, id, 1, sim.tick, 400);
    }, { slow: StatusKind.Slow });
    await cast("shelter"); await advanceCombat(page, 30);
    expect((await read()).kinds).toContain(EffectKind.Cleanse); expect((await read()).guard).toBe(3);
    await expect(page.getByLabel("增益与减益")).toContainText("星辰庇护"); await expect(page.getByLabel("增益与减益")).not.toContainText("灼烧");
    await page.screenshot({ path: info.outputPath("star-cleanse-shelter.png") });
    await advanceCombat(page, 40); await cast("resonance"); await advanceCombat(page, 75);
    expect((await read()).kinds).toContain(EffectKind.Resonance); await page.screenshot({ path: info.outputPath("star-resonance.png") });
    await advanceCombat(page, 60); await cast("blades"); await advanceCombat(page, 45);
    expect((await read()).kinds).toContain(EffectKind.Blades); expect((await read()).motes).toBe(2);
    await advanceCombat(page, 40); await cast("bastion"); await advanceCombat(page, 55);
    const guarded = await read(); expect(guarded.kinds).toContain(EffectKind.Bastion); expect(guarded.ward).toBe(true);
    expect(guarded.matrices.every(Number.isFinite)).toBe(true); expect(guarded.statusMatrices.every(Number.isFinite)).toBe(true);
    await page.screenshot({ path: info.outputPath("star-bastion.png") }); expect(await read()).toEqual(guarded);
    const saved = await page.evaluate(async () => (await window.survivorApplication!.session.save("manual-1")).checkpoint);
    expect(saved.version).toBe(9); expect(saved.skills.statuses.find(status => status.kind === StatusKind.Empowered)?.charges).toBe(2);
    await advanceCombat(page, 1700); expect(await read()).toMatchObject({ motes: 0, guard: 0, weak: 0, ward: false, kinds: [] });
    expect(errors).toEqual([]);
});
