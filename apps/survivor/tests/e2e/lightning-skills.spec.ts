import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import type { SkillId } from "../../src/core/Skills";
import { EffectKind } from "../../src/core/CombatEffects";
import { initialSkillRanks, investedPoints, nodeIndex } from "../../src/core/SkillBuild";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("complete lightning tree, conductive actors, guarded player and distinct spell choreography survive the Worker boundary", async ({ page }, info) => {
    test.setTimeout(180_000); await page.setViewportSize({ width: 2560, height: 1440 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click(); await enterWilds(page); await pauseCombat(page);
    const ranks = initialSkillRanks();
    for (const [id, rank] of Object.entries({ arc: 10, "arc.power": 5, "arc.shape": 5, "arc.tempo": 5, thunderlance: 5, thunderstrike: 5,
        "thunderstrike.shape": 2, "thunderstrike.tempo": 5, chain: 5, thunderfield: 5, judgment: 1, tempest: 1, "lightning.resilience": 5 })) ranks[nodeIndex(id)] = rank;
    await combatWorker(page).evaluate(({ ranks, spent }) => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation, cp = sim.checkpoint();
        sim.restore({ ...cp, player: { ...cp.player, level: 100 }, skills: { ...cp.skills, ranks, points: 99 - spent, recoveryUntil: 0,
            readyAt: cp.skills.readyAt.map(() => 0), dashUntil: 0, loadout: ["arc", "thunderlance", "thunderstrike", "chain", "thunderfield", "tempest"] } });
        const f = sim as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number };
        f.autoCast = false; f.attackCooldown = 10000;
        const e = f.entities, p = e.position;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        for (let i = 0; i < 18; i++) {
            const x = p.x[e.player] + 2 + i % 6 * .6, z = p.z[e.player] + (Math.floor(i / 6) - 1) * .7;
            const slot = e.spawnEnemy({ x, z, kind: 0, boss: false, elite: false, level: 1, region: f.world.regionAt(x, z) }, { resident: true });
            e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1000000; e.enemy.speed[slot] = 0; e.action.readyAt[slot] = 100000;
        }
    }, { ranks, spent: investedPoints(ranks) });
    await advanceCombat(page); await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true });
    await panel.getByRole("button", { name: "雷电", exact: false }).click();
    await expect(panel.locator("[data-node]")).toHaveCount(34); await expect(panel.locator('[data-node="arc"]')).toHaveClass(/equipped/);
    await panel.locator('[data-node="chain"]').hover(); await expect(page.getByRole("tooltip")).toContainText("导电");
    await panel.locator('[data-node="thunderstrike"]').click(); await expect(panel.locator(".node-detail-stats")).toContainText("完整打击次数");
    const bounds = (await panel.boundingBox())!; expect(Math.abs(bounds.x + bounds.width / 2 - 1280)).toBeLessThan(2);
    await page.screenshot({ path: info.outputPath("lightning-tree-2k.png") });
    await panel.getByRole("button", { name: "关闭技能", exact: true }).click();
    const cast = async (id: SkillId) => {
        const action = await combatWorker(page).evaluate(id => {
            const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            const e = (sim as unknown as { entities: CombatWorld }).entities;
            e.vitals.mana[e.player] = 1000; if (id === "judgment") sim.equipSkill(id, 5); sim.castSkill(id);
            return sim.getSnapshot().player.skills.action;
        }, id);
        expect(action?.skill).toBe(id);
    };
    const read = () => page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState;
            view: { layer: { effects: { mesh: InstancedMesh }; statusEffects: { electricity: InstancedMesh; staticGuard: InstancedMesh } } } };
        const { effects, statusEffects } = runtime.view.layer, state = runtime.renderState;
        return { kinds: Array.from(state.effects.kind.slice(0, state.effects.count)), conductive: Array.from(state.entities.status.conductiveUntil).filter(Boolean).length,
            electricity: statusEffects.electricity.count, guard: statusEffects.staticGuard.count,
            matrices: Array.from(effects.mesh.instanceMatrix.array.slice(0, effects.mesh.count * 16)),
            statusMatrices: Array.from(statusEffects.electricity.instanceMatrix.array.slice(0, statusEffects.electricity.count * 16)) };
    });
    await cast("arc"); await advanceCombat(page, 25);
    expect((await read()).conductive).toBeGreaterThan(0); expect((await read()).electricity).toBeGreaterThan(0); expect((await read()).guard).toBe(2);
    await expect(page.getByLabel("增益与减益")).toContainText("静电防护"); await page.screenshot({ path: info.outputPath("arc-and-conductive.png") });
    await advanceCombat(page, 40); await cast("thunderlance"); await advanceCombat(page, 45);
    expect((await read()).kinds).toContain(EffectKind.ThunderLance); await page.screenshot({ path: info.outputPath("thunderlance.png") });
    await advanceCombat(page, 40); await cast("thunderfield"); await advanceCombat(page, 110);
    await cast("thunderstrike"); await advanceCombat(page, 90);
    expect((await read()).kinds).toEqual(expect.arrayContaining([EffectKind.ThunderField, EffectKind.ThunderWarning]));
    await page.screenshot({ path: info.outputPath("thunder-field-warning.png") });
    await advanceCombat(page, 25); expect((await read()).kinds).toContain(EffectKind.ThunderImpact);
    await cast("chain"); await advanceCombat(page, 60); expect((await read()).kinds).toContain(EffectKind.Lightning);
    await cast("tempest"); await advanceCombat(page, 90);
    const network = await read(); expect(network.kinds.filter(kind => kind === EffectKind.Tempest).length).toBeGreaterThan(2);
    expect(network.matrices.every(Number.isFinite)).toBe(true); expect(network.statusMatrices.every(Number.isFinite)).toBe(true);
    await page.screenshot({ path: info.outputPath("tempest-network.png") }); expect(await read()).toEqual(network);
    await advanceCombat(page, 70); await cast("judgment"); await advanceCombat(page, 100);
    expect((await read()).kinds).toContain(EffectKind.JudgmentWarning); await page.screenshot({ path: info.outputPath("judgment-warning.png") });
    await advanceCombat(page, 90); expect((await read()).kinds).toContain(EffectKind.JudgmentImpact);
    await page.screenshot({ path: info.outputPath("judgment-impact.png") });
    await advanceCombat(page, 1500); expect(await read()).toMatchObject({ conductive: 0, electricity: 0, guard: 0, kinds: [] });
    expect(errors).toEqual([]);
});
