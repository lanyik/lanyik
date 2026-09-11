import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Check the server actually handed to the developer, including its current module cache.
// Do not rebuild, restart it, or substitute a bundled fixture Worker before this check.
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => ["ready", "failed"].includes(document.querySelector(".survivor")?.getAttribute("data-state")),
        undefined, { timeout: 45_000 });
    const initial = await page.evaluate(() => {
        const snapshot = window.survivorApplication.session.getSnapshot();
        return { status: snapshot.status, error: snapshot.error };
    });
    assert.equal(initial.status, "ready", initial.error);
    await page.evaluate(async () => {
        const session = window.survivorApplication.session;
        session.dispatch({ type: "toggle-pause" });
        await session.settled;
    });
    const worker = page.workers().find(candidate => new URL(candidate.url()).pathname === "/src/worker/Combat.worker.ts");
    assert.ok(worker, "Expected the unbundled development Combat Worker");
    const pickedUp = await worker.evaluate(async () => {
        const core = new URL("../core/", self.location.href);
        const [{ CombatSimulation }, { generateEquipment }, { generateOrb }, { createConsumable }, { DeterministicRandom }, { BASE_LOOT_PROFILE }] = await Promise.all(
            ["CombatSimulation", "Equipment", "Orbs", "InventoryItem", "DeterministicRandom", "Loot"].map(name => import(new URL(`${name}.ts`, core).href)));
        // An isolated fixture in the real Worker uses the modules served by Vite,
        // so a stale item producer cannot hide behind an up-to-date test bundle.
        const simulation = new CombatSimulation("development-item-contract");
        try {
            const random = new DeterministicRandom("development-items");
            const items = [generateEquipment(random, 9000, 1, BASE_LOOT_PROFILE), generateOrb(random, 9001, 1), createConsumable(9002, 1, "mana", 2)];
            for (const item of items) simulation.dropItem(item, 0, 0);
            simulation.collectEquipment();
            return simulation.getSnapshot().player.inventory.map(item => ({ type: item.type, value: item.value, size: item.size }));
        } finally { simulation.dispose(); }
    });
    assert.equal(pickedUp.length, 3);
    assert.deepEqual(pickedUp.map(item => item.type).sort(), ["consumable", "equipment", "orb"]);
    assert.ok(pickedUp.every(item => typeof item.value === "string" && item.value.length > 0));
    assert.equal(pickedUp.find(item => item.type === "consumable").size, 2);
    assert.ok(pickedUp.filter(item => item.type !== "consumable").every(item => item.size === 1));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("KeyK");
    await page.locator(".skills-window").waitFor();
    assert.equal(await page.locator(".skill-catalog article").count(), 5);
    assert.equal(await page.locator('.skill-catalog [data-item-icon="skill"]').count(), 5);
    await page.locator('[data-skill="frost"] .skill-icon-trigger').dragTo(page.locator('.skill-loadout [data-skill-slot="0"]'));
    await page.waitForFunction(() => document.querySelector('.skill-loadout [data-skill-slot="0"] [data-item-icon="skill"]')?.getAttribute("data-item-value") === "frost");
    await page.locator(".skill-management").evaluate(element => { element.scrollTop = element.scrollHeight; });
    const panel = await page.locator(".skills-window").boundingBox();
    const close = await page.locator(".skills-window .close-button").boundingBox();
    assert.ok(panel && close && close.y >= panel.y && close.y + close.height <= panel.y + panel.height,
        "The skill window close button must remain visible when its catalog scrolls");
    await page.screenshot({ path: ".browser-artifacts/skills-dev-narrow.png" });
    await page.locator(".skills-window .close-button").click();
    assert.deepEqual(errors, []);
    console.log("Development page, skill dragging, shaders and unbundled Worker item pickup passed:", pickedUp);
} finally { await browser.close(); }
