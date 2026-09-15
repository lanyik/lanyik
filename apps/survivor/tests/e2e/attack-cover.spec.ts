import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import { inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("a rendered shot follows its authoritative height and stops at a real forest trunk", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 }); await pauseCombat(page);
    const fixture = await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const runtime = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number };
        const e = runtime.entities, p = e.position, terrain = e.terrain;
        runtime.autoCast = false; runtime.attackCooldown = 1000;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        for (const chunk of runtime.world.chunks.values()) chunk.spawned.fill(1);
        const chunks = (terrain as unknown as { chunks: Map<string, { trees: { x: number; z: number; scale: number }[] }> }).chunks;
        for (const chunk of chunks.values()) for (const tree of chunk.trees) {
            const distance = Math.hypot(tree.x - p.x[e.player], tree.z - p.z[e.player]);
            if (distance > 38 || !terrain.isClear(tree.x - 1.2, tree.z, .3) || !terrain.isClear(tree.x + 1.2, tree.z, .54)) continue;
            const y = terrain.height(tree.x, tree.z) + .8;
            if (y < terrain.height(tree.x + 1.2, tree.z) + .2 || y > terrain.height(tree.x + 1.2, tree.z) + 2
                || terrain.traceAttack(tree.x - 1.2, y, tree.z, tree.x - .6, y, tree.z, .11) !== Infinity) continue;
            p.x[e.player] = p.previousX[e.player] = tree.x - 1.2; p.z[e.player] = p.previousZ[e.player] = tree.z;
            runtime.world.synchronize(p.x[e.player], p.z[e.player]);
            for (const home of runtime.world.chunks.values()) home.spawned.fill(1);
            const enemy = e.spawnEnemy({ x: tree.x + 1.2, z: tree.z, kind: 2, level: 1, elite: false, boss: false,
                region: runtime.world.regionAt(tree.x + 1.2, tree.z) }, runtime.world.chunks.get("0,0")!);
            e.enemy.speed[enemy] = 0; e.action.readyAt[enemy] = 100_000;
            e.vitals.health[enemy] = e.vitals.maxHealth[enemy] = 1000;
            e.spawnProjectile(e.world.ids[e.player], e.vitals.faction[e.player], tree.x - 1.2, tree.z, 12, 0, 10, 2,
                { height: y - terrain.height(tree.x - 1.2, tree.z) });
            return { enemy, y, hit: terrain.traceAttack(tree.x - 1.2, y, tree.z, tree.x + 1.2, y, tree.z, .11) };
        }
        throw new Error("Seed fixture has no nearby clear forest firing lane");
    });
    expect(fixture.hit).toBeGreaterThan(0); expect(fixture.hit).toBeLessThan(.5);
    await advanceCombat(page, 5);
    const airborne = await page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: { projectiles: InstancedMesh } } };
        const e = runtime.renderState.entities, slot = e.projectiles.slots[0], mesh = runtime.view.layer.projectiles;
        return { count: e.projectiles.count, instances: mesh.count, y: e.projectile.y[slot], previousY: e.projectile.previousY[slot], renderedY: mesh.instanceMatrix.array[13] };
    });
    expect(airborne.count).toBe(1); expect(airborne.instances).toBe(1);
    expect(airborne.y).toBeCloseTo(fixture.y); expect(airborne.previousY).toBeCloseTo(fixture.y);
    expect(airborne.renderedY).toBeCloseTo(fixture.y, 4);
    await page.screenshot({ path: info.outputPath("forest-projectile.png") });
    await advanceCombat(page, 18);
    const stopped = await combatWorker(page).evaluate(enemy => {
        const { entities: e } = (self as unknown as { fixtureSimulation: { entities: CombatWorld } }).fixtureSimulation;
        return { shots: e.projectiles.count, health: e.vitals.health[enemy] };
    }, fixture.enemy);
    expect(stopped).toEqual({ shots: 0, health: 1000 }); expect(errors).toEqual([]);
});
