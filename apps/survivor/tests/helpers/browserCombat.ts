import { MAX_STEP_BATCH } from "../../src/worker/CombatProtocol";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

export async function enterWilds(page: Page): Promise<void> {
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
    await page.keyboard.press("KeyH");
    await page.getByRole("button", { name: "目的地：荒野", exact: true }).click();
    await page.getByRole("button", { name: "出战荒野", exact: false }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "wilds", { timeout: 45_000 });
    await expect(page.locator(".state-overlay.loading")).toHaveCount(0);
}

export async function inspectCombatWorker(page: Page): Promise<void> {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("./InspectableCombat.worker.ts", import.meta.url))],
        bundle: true, write: false, format: "esm", platform: "browser" });
    await page.route(/\/Combat\.worker-[^/]+\.js$/, route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
}

export function combatWorker(page: Page) {
    const worker = page.workers().find(candidate => /\/Combat\.worker-/.test(candidate.url()));
    if (!worker) throw new Error("Authority Worker is missing");
    return worker;
}

export async function pauseCombat(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const session = window.survivorApplication!.session;
        if (!session.isPaused) session.dispatch({ type: "toggle-pause" });
        await session.settled;
    });
}

/** Advance the production protocol while presentation pacing is paused. */
export async function advanceCombat(page: Page, ticks = 0): Promise<void> {
    await page.evaluate(async ({ remaining, maxSteps }) => {
        const session = window.survivorApplication!.session;
        await session.settled;
        // Use the session's in-flight barrier so a wall-clock autosave cannot
        // race a direct transport request during a long browser capture.
        const runtime = session as unknown as { pendingSteps: number; pendingSnapshot: boolean; flush(): void };
        do {
            const steps = Math.min(maxSteps, remaining);
            runtime.pendingSteps = steps; runtime.pendingSnapshot = true; runtime.flush();
            await session.settled;
            remaining -= steps;
        } while (remaining > 0);
        session.frame(performance.now());
    }, { remaining: ticks, maxSteps: MAX_STEP_BATCH });
}
