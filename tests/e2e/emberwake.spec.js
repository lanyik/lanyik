import { expect, test } from "@playwright/test";
import { beacons, HOME, samePoint, siteAt } from "../../public/emberwake/rules.js";

const diagnostics = page => page.evaluate(() => window.getEmberwakeDiagnostics());
const settled = page => page.waitForFunction(() => {
    const game = window.getEmberwakeDiagnostics();
    return game.ready && !game.busy && !game.flying && !game.checkpoints.running;
});

async function openGame(page) {
    await page.goto("/emberwake.html?quality=fast");
    await page.waitForFunction(() => window.getEmberwakeDiagnostics?.().ready);
    await page.locator("#begin").click();
}

test("completes an expedition through real UI, restores an upgrade choice, and starts again", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await openGame(page);
    let recoveredChoice = false;
    for (let actions = 0; actions < 90; actions++) {
        const { state, fatal } = await diagnostics(page);
        expect(fatal).toBe(false);
        if (state.status !== "playing") break;
        if (state.pendingUpgrade) {
            if (!recoveredChoice) {
                await page.reload();
                await page.waitForFunction(() => window.getEmberwakeDiagnostics?.().ready);
                expect((await diagnostics(page)).state).toEqual(state);
                await page.locator("#begin").click();
                await expect(page.locator("#upgrade-dialog")).toBeVisible();
                recoveredChoice = true;
            }
            await page.locator(".upgrade-choice").first().click();
        } else {
            const site = siteAt(state.seed, state.position);
            if (site && site.kind !== "home" && !state.collected.includes(site.id)) {
                await page.locator("#interact").click();
            } else if (state.fuel < 5) {
                await page.locator("#charge").click();
            } else {
                const target = beacons(state.seed).find(beacon => !state.lit.includes(beacon.id)) ?? HOME;
                expect(samePoint(state.position, target)).toBe(false);
                await page.locator("#objective").click();
                await page.locator("#fly").click();
            }
        }
        await settled(page);
    }
    const won = await diagnostics(page);
    expect(won.state.status).toBe("won");
    expect(won.state.lit).toHaveLength(3);
    expect(won.state.position).toEqual(HOME);
    expect(won.state.visited.some(key => Math.abs(Number(key.split(",")[0])) >= 24)).toBe(true);
    expect(won.streaming.residentChunks).toBeLessThanOrEqual(25);
    expect(won.resources.cpuExceededBytes).toBe(0);
    await expect(page.locator("#ending")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("emberwake-victory.png") });
    await page.reload();
    await page.waitForFunction(() => window.getEmberwakeDiagnostics?.().ready);
    expect((await diagnostics(page)).state).toEqual(won.state);
    await page.locator("#begin").click();
    await page.locator("#again").click();
    await page.locator("#new-game").click();
    await settled(page);
    const fresh = (await diagnostics(page)).state;
    expect(fresh.turn).toBe(0);
    expect(fresh.lit).toEqual([]);
    expect(fresh.status).toBe("playing");
    expect(errors).toEqual([]);
});

test("radar input works on a narrow screen and a second tab cannot overwrite the save", async ({ page, context }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await openGame(page);
    await page.locator("#radar").click({ position: { x: 61, y: 50 } });
    await expect(page.locator("#fly")).toBeEnabled();
    await page.locator("#fly").click();
    await settled(page);
    expect((await diagnostics(page)).state.turn).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("emberwake-mobile.png") });
    for (const selector of ["#interact", "#charge", "#fly", ".mission", ".navigation"]) {
        const bounds = await page.locator(selector).boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    }
    const before = (await diagnostics(page)).state;
    const second = await context.newPage();
    await second.goto("/emberwake.html?quality=fast");
    await expect(second.locator("#welcome-status")).toContainText("另一个标签页");
    await expect(second.locator("#begin")).toBeDisabled();
    expect((await diagnostics(page)).state).toEqual(before);
    await second.close();
    await page.locator("#help-button").click();
    await page.locator("#seed").fill("emberwake-10");
    await page.locator("#begin").click();
    await page.waitForFunction(() => {
        const game = window.getEmberwakeDiagnostics?.();
        return game?.ready && game.state.seed === "emberwake-10";
    });
    expect((await diagnostics(page)).state.turn).toBe(0);
    await page.goto("/emberwake.html?quality=fast");
    await page.waitForFunction(() => window.getEmberwakeDiagnostics?.().ready);
    expect((await diagnostics(page)).state).toEqual(before);
    expect(errors).toEqual([]);
});
