import { expect, test } from "@playwright/test";
import { advanceCombat, combatWorker, enterWilds, inspectCombatWorker, pauseCombat } from "../helpers/browserCombat";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import { createStarterEquipment, withEquipmentAffixes } from "../../src/core/Equipment";
import { createOrb } from "../../src/core/Orbs";
import type { InventoryItem } from "../../src/core/InventoryItem";
import type { CombatRewards } from "../../src/core/CombatRewards";

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

test("Z equips without extra locks, retires obsolete gear, and saves single-toggle protection", async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await inspectCombatWorker(page); await page.goto("/");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page); await pauseCombat(page);
    const gear = (id: number, damage: number, itemLevel: number) => ({
        ...withEquipmentAffixes(createStarterEquipment(), [{ stat: "damage", value: damage, rarity: "common" }]),
        id, itemLevel, name: `自动装配测试 ${id}`, locked: false, autoEquipped: false
    });
    await combatWorker(page).evaluate(items => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = sim as unknown as { character: { inventory: InventoryItem[]; nextId: number };  resolution: { damageImmunity: number } };
        fixture.character.inventory = items; fixture.character.nextId = 10000; fixture.resolution.damageImmunity = 100000;
    }, [gear(900, 20, 2), createOrb(901, "rare", "harmony"), createOrb(902, "rare", "harmony")]);
    await page.keyboard.press("KeyZ");
    const player = () => page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.player);
    await expect.poll(async () => (await player()).equipment.weapon?.id).toBe(900);
    expect((await player()).orbs.slice(0, 2).map(orb => orb?.id)).toEqual([901, 902]);
    await page.keyboard.press("KeyC"); await page.locator('.equipment-slot[data-slot="weapon"]').click();
    await page.getByRole("button", { name: "锁定装备", exact: true }).click();
    await expect.poll(async () => (await player()).equipment.weapon?.autoEquipped).toBe(false);
    await page.keyboard.press("KeyC");
    const pickup = async (item: InventoryItem) => {
        await combatWorker(page).evaluate(item => {
            const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
            const p = sim.getSnapshot().player;
            (sim as unknown as { rewards: CombatRewards }).rewards.drop(item, p.x, p.z);
        }, item);
        await advanceCombat(page, 1);
    };
    await pickup(gear(903, 60, 30)); await pickup(gear(904, 80, 31));
    await page.keyboard.press("KeyB");
    const reserve = page.locator('[data-item-id="903"]');
    await expect(reserve.locator(".cell-lock-badge")).toHaveCount(0);
    await reserve.click({ modifiers: ["Shift"] });
    await expect(reserve.locator(".cell-lock-badge")).toHaveText("已锁定");
    await reserve.click({ modifiers: ["Shift"] });
    await expect(reserve.locator(".cell-lock-badge")).toHaveCount(0);
    await reserve.click({ modifiers: ["Shift"] });
    await expect(reserve.locator(".cell-lock-badge")).toHaveText("已锁定");
    await page.keyboard.press("KeyB");
    const before = await player(); await pickup(gear(905, 300, 50)); const after = await player();
    expect(after.equipment.weapon).toMatchObject({ id: 905, autoEquipped: true });
    expect(after.inventory.filter(item => item.id === 900 || item.id === 903)).toHaveLength(2);
    expect(after.inventory.some(item => item.id === 904)).toBe(false);
    expect(after.gold - before.gold).toBe(78);
    expect(after.recycled.equipment - before.recycled.equipment).toBe(1);
    await page.evaluate(async () => { const session = window.survivorApplication!.session; await session.settled; await session.save("manual-1"); });
    await page.reload(); await page.getByRole("button", { name: "读取手动存档 1", exact: true }).click();
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    expect((await player()).equipment.weapon).toMatchObject({ id: 905, locked: false, autoEquipped: true });
    expect((await player()).inventory.find(item => item.id === 903)).toMatchObject({ locked: true, autoEquipped: false });
    expect(await page.evaluate(() => window.survivorApplication!.session.getSnapshot().combat!.autoCombat.enabled)).toBe(false);
    expect(errors).toEqual([]);
});
