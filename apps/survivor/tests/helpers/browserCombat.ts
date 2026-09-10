import { MAX_STEP_BATCH } from "../../src/worker/CombatProtocol";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import type { CombatTransport } from "../../src/app/CombatTransport";
import type { CombatUpdate } from "../../src/worker/CombatProtocol";

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
        session.dispatch({ type: "toggle-pause" });
        await session.settled;
    });
}

/** Advance the production protocol while presentation pacing is paused. */
export async function advanceCombat(page: Page, ticks = 0): Promise<void> {
    await page.evaluate(async ({ remaining, maxSteps }) => {
        const session = window.survivorApplication!.session;
        await session.settled;
        const runtime = session as unknown as { client: CombatTransport; accept(update: CombatUpdate): void };
        do {
            const steps = Math.min(maxSteps, remaining);
            runtime.accept(await runtime.client.advance({ steps, commands: [], input: { x: 0, z: 0, active: false } }));
            remaining -= steps;
        } while (remaining > 0);
        session.frame(performance.now());
    }, { remaining: ticks, maxSteps: MAX_STEP_BATCH });
}
