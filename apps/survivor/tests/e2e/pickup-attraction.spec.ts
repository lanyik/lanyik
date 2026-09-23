import type { CombatRewards } from "../../src/core/CombatRewards";
import { expect, test } from "@playwright/test";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import type { CombatLayer } from "../../src/presentation/CombatLayer";
import type { LootModels } from "../../src/presentation/LootModels";
import type { LootEffects } from "../../src/presentation/LootEffects";
import { enterWilds, inspectCombatWorker, combatWorker, pauseCombat, advanceCombat } from "../helpers/browserCombat";
import { isBrowserConsoleFailure } from "../helpers/browserConsole";

test("equipment and potions attract through the Worker and interpolate together with their ground halos", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45_000 }); await pauseCombat(page);
    const distance = await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        // Live frames before pausing can already produce loot; begin with a clean, valid character/world fixture.
        const cp = simulation.checkpoint();
        simulation.restore({ ...cp, nextItemId: Math.max(cp.nextItemId, 902), player: { ...cp.player, inventory: [] } });
        const fixture = simulation as unknown as { rewards: CombatRewards; entities: CombatWorld; autoCast: boolean; attackCooldown: number;
            };
        fixture.autoCast = false; fixture.attackCooldown = 1000;
        const e = fixture.entities; while (e.enemies.count) e.remove(e.enemies.slots[0]);
        const player = simulation.getSnapshot().player, distance = player.stats.pickupRadius * .9;
        fixture.rewards.drop({ ...player.equipment.weapon!, id: 900 }, player.x + distance, player.z);
        fixture.rewards.drop({ type: "consumable", value: "mana", name: "Test potion", rarity: "common", id: 901, size: 2 }, player.x + distance, player.z);
        return distance;
    });
    expect(distance).toBeGreaterThan(.75); await advanceCombat(page, 10);
    const samples = await page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: CombatLayer } };
        const state = runtime.renderState, layer = runtime.view.layer;
        const fixture = layer as unknown as { lootModels: LootModels; lootEffects: LootEffects };
        const e = state.entities, slot = e.loot.slots[0];
        return [0, .5, 1].map(alpha => {
            layer.update(state, alpha, performance.now());
            const expected = e.position.previousX[slot] + (e.position.x[slot] - e.position.previousX[slot]) * alpha
                - (state.player.previousX + (state.player.x - state.player.previousX) * alpha);
            return { expected, weaponX: fixture.lootModels.loot[0].instanceMatrix.array[12], potionX: fixture.lootModels.loot[3].instanceMatrix.array[12],
                haloX: fixture.lootEffects.halo.instanceMatrix.array[12], count: e.loot.count };
        });
    });
    for (const sample of samples) {
        expect(sample.count).toBe(2); expect(sample.expected).toBeLessThan(distance);
        expect(sample.weaponX).toBeCloseTo(sample.expected, 5); expect(sample.potionX).toBeCloseTo(sample.expected, 5);
        expect(sample.haloX).toBeCloseTo(sample.expected, 5);
    }
    expect(samples[0].weaponX).toBeGreaterThan(samples[1].weaponX); expect(samples[1].weaponX).toBeGreaterThan(samples[2].weaponX);
    await advanceCombat(page, 120);
    const authoritative = await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        // Arrival order follows full ECS handles, whose generations depend on live ticks before pausing.
        return { inventory: simulation.getSnapshot().player.inventory.map(item => item.id).sort((a, b) => a - b), loot: simulation.getRenderState().entities.loot.count };
    });
    expect(authoritative).toEqual({ inventory: [900, 901], loot: 0 });
    await expect.poll(() => page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.player.inventory.map(item => item.id)))
        .toEqual(expect.arrayContaining([900, 901])); expect(errors).toEqual([]);
});
