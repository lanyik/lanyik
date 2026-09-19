import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { SkillSystem } from "../../src/core/SkillSystem";
import type { CombatRenderState } from "../../src/core/CombatState";
import { EffectKind } from "../../src/core/CombatEffects";
import { ActorAction } from "../../src/core/CombatWorld";
import { EnemyKind } from "../../src/core/EnemyDefinitions";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("new skill choreography and boss attacks cross the real Worker boundary and freeze while paused", async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 });
    await pauseCombat(page);
    await combatWorker(page).evaluate(() => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const f = sim as unknown as { entities: CombatWorld; world: RegionalWorld; skills: SkillSystem; autoCast: boolean; attackCooldown: number; gainExperience(amount: number): void };
        const e = f.entities, p = e.position, player = e.player;
        f.autoCast = false; f.attackCooldown = 1000; f.gainExperience(1000);
        const cp = f.skills.checkpoint(sim.tick);
        f.skills.restore({ ...cp, readyAt: cp.readyAt.map(() => 0), recoveryUntil: 0 }, sim.tick);
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        e.effects.buffer.count = 0;
        for (let i = 0; i < 3; i++) {
            const x = p.x[player] + 2.5, z = p.z[player] + i * .5;
            const slot = e.spawnEnemy({ x, z, kind: 0, boss: false, elite: false, level: 1, region: f.world.regionAt(x, z) }, f.world.chunks.get("0,0")!);
            e.vitals.health[slot] = e.vitals.maxHealth[slot] = 10000; e.enemy.speed[slot] = 0; e.action.readyAt[slot] = 100000;
        }
        for (const [slot, id] of (["meteor", "vortex", "blades"] as const).entries()) sim.equipSkill(id, slot);
    });
    // Distinct slots share one action timeline; preserve overlapping fields by casting meteor last.
    for (const id of ["vortex", "blades", "meteor"] as const) {
        await combatWorker(page).evaluate(id => {
            const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            const e = (sim as unknown as { entities: CombatWorld }).entities;
            e.vitals.mana[e.player] = 100; sim.castSkill(id);
        }, id);
        await advanceCombat(page, id === "meteor" ? 55 : 90);
    }
    const read = () => page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: { effects: { mesh: InstancedMesh } } } };
        const b = runtime.renderState.effects, mesh = runtime.view.layer.effects.mesh;
        return { kinds: Array.from(b.kind.slice(0, b.count)), count: mesh.count,
            matrices: Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)),
            styles: Array.from(mesh.geometry.getAttribute("effectStyle").array.slice(0, mesh.count * 4)) };
    });
    const before = await read();
    expect(before.kinds).toEqual(expect.arrayContaining([EffectKind.Meteor, EffectKind.Vortex, EffectKind.Blades]));
    expect(before.count).toBeGreaterThan(30); expect(before.matrices.every(Number.isFinite)).toBe(true);
    expect(before.styles.filter((_, i) => i % 4 === 0)).toEqual(expect.arrayContaining([2, 4, 5]));
    await page.screenshot({ path: info.outputPath("meteor-vortex-blades.png") });
    expect(await read()).toEqual(before);
    await advanceCombat(page, 110);
    expect((await read()).kinds).toContain(EffectKind.MeteorImpact);
    await page.screenshot({ path: info.outputPath("meteor-impact.png") });
    await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true });
    for (const [school, id] of [["火焰", "meteor"], ["通用", "vortex"], ["星辰", "blades"]]) {
        await panel.getByRole("button", { name: school }).click();
        await expect(panel.locator(`[data-skill="${id}"]`)).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath("expanded-skill-catalog.png") });
    await page.keyboard.press("Escape");
    await advanceCombat(page, 500);
    for (const [kind, action, name] of [
        [EnemyKind.StoneSovereign, ActorAction.Quake, "断层岩王"],
        [EnemyKind.StormOracle, ActorAction.Storm, "风暴先知"],
        [EnemyKind.EmberChampion, ActorAction.Charge, "烬刃斗王"]
    ] as const) {
        await combatWorker(page).evaluate(kind => {
            const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            const f = sim as unknown as { entities: CombatWorld; world: RegionalWorld };
            const e = f.entities, p = e.position, x = p.x[e.player], z = p.z[e.player] - 5;
            while (e.enemies.count) e.remove(e.enemies.slots[0]);
            e.effects.buffer.count = 0;
            e.spawnEnemy({ x, z, kind, boss: true, elite: true, level: 1, region: f.world.regionAt(p.x[e.player], p.z[e.player]) }, f.world.chunks.get("0,0")!);
        }, kind);
        await advanceCombat(page, 35);
        await expect(page.locator(".boss-status")).toContainText(name);
        const actual = await combatWorker(page).evaluate(() => {
            const e = (self as unknown as { fixtureSimulation: { entities: CombatWorld } }).fixtureSimulation.entities;
            return e.action.kind[e.enemies.slots[0]];
        });
        expect(actual).toBe(action);
        await page.screenshot({ path: info.outputPath(`boss-${kind}-telegraph.png`) });
        await advanceCombat(page, 140);
        await page.screenshot({ path: info.outputPath(`boss-${kind}-release.png`) });
    }
    expect(errors).toEqual([]);
});
