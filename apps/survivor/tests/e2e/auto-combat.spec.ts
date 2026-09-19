import { expect, test } from "@playwright/test";
import { advanceCombat, combatWorker, enterWilds, inspectCombatWorker, pauseCombat } from "../helpers/browserCombat";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";

test.use({ viewport: { width: 960, height: 640 } });

test("Z toggles Worker automation, respects manual input and autocast, and stops at death", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await inspectCombatWorker(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    const toggle = page.getByRole("button", { name: /自动战斗/ });
    await expect(toggle).toBeDisabled();
    await enterWilds(page); await pauseCombat(page);
    await page.keyboard.press("KeyF");
    await expect(page.getByRole("button", { name: /自动施法/ })).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.down("KeyZ");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.down("KeyZ"); await page.keyboard.up("KeyZ");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const start = await page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.player);
    await advanceCombat(page, 120);
    const moved = await page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.player);
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(.2);
    expect(moved.autoCast).toBe(false);

    await page.keyboard.press("KeyP");
    await page.keyboard.down("KeyW");
    await expect.poll(() => page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.autoCombat.activity)).toBe("manual");
    await page.keyboard.up("KeyW");
    await expect.poll(() => page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.autoCombat.activity)).not.toBe("manual");
    await pauseCombat(page);
    await page.keyboard.press("KeyZ"); await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("KeyZ"); await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; resolution: { damageImmunity: number; shieldCooldown: number }; health: number; potionCooldown: number };
        fixture.health = 1; fixture.potionCooldown = 100;
        fixture.resolution.damageImmunity = 0; fixture.resolution.shieldCooldown = 1000;
        fixture.entities.impacts.add(0, fixture.entities.world.ids[fixture.entities.player], 1_000_000);
    });
    await advanceCombat(page, 1);
    await expect(page.locator(".survivor")).toHaveAttribute("data-game-over", "true");
    await expect(toggle).toHaveAttribute("aria-pressed", "false"); await expect(toggle).toBeDisabled();
    expect(errors).toEqual([]);
});
