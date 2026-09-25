import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { CombatSimulation } from "../../src/core/CombatSimulation";
import { ProceduralCombatTerrain } from "../../src/adapters/ProceduralCombatTerrain";
import type { Exploration } from "../../src/core/Exploration";
import type { CombatRequest, CombatResponse, CombatUpdate } from "../../src/worker/CombatProtocol";

test("production authority yields during saved-position loading and far teleport without partial publications", async ({ page }) => {
    const seed = "rift-ember-1", terrain = new ProceduralCombatTerrain(seed), source = new CombatSimulation(seed);
    let target: { x: number; z: number } | undefined;
    for (let x = 360; x < 380 && !target; x++) for (let z = 0; z < 20 && !target; z++)
        if (terrain.isClear(x, z, .3)) target = { x, z };
    terrain.dispose();
    expect(target).toBeDefined();
    (source as unknown as { exploration: Exploration }).exploration.discover(target!.x, target!.z);
    const checkpoint = source.checkpoint(); source.dispose();
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("../../src/worker/Combat.worker.ts", import.meta.url))],
        bundle: true, write: false, format: "esm", platform: "browser" });
    // Exercise the production entry and browser task queue without mixing WebGL frame cost into protocol checks.
    await page.route("**/__streaming-harness", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Worker streaming</title>" }));
    await page.route("**/__streaming.worker.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.goto("/__streaming-harness");
    const result = await page.evaluate(async ({ checkpoint, target }) => {
        const worker = new Worker("/__streaming.worker.js", { type: "module" });
        let responses = 0;
        const request = (message: CombatRequest) => new Promise<CombatUpdate>((resolve, reject) => {
            worker.onerror = event => reject(new Error(event.message));
            worker.onmessage = (event: MessageEvent<CombatResponse>) => {
                responses++;
                if (event.data.type === "error") reject(new Error(event.data.message));
                else if (event.data.id !== message.id) reject(new Error("Unexpected partial or out-of-order publication"));
                else resolve(event.data.update);
            };
            worker.postMessage(message);
        });
        try {
            const loaded = await request({ type: "init", id: 1, seed: checkpoint.seed, start: checkpoint.origin, checkpoint, ports: [] });
            const teleported = await request({ type: "advance", id: 2, batch: { steps: 0, checkpoint: true,
                input: { x: 0, z: 0, active: false }, commands: [{ type: "teleport", ...target }] } });
            return { responses, initial: { tick: loaded.tick, chunks: loaded.snapshot!.chunks.total, stats: loaded.stats },
                arrival: { tick: teleported.tick, chunks: teleported.snapshot!.chunks.total, stats: teleported.stats,
                    x: teleported.checkpoint!.player.x, z: teleported.checkpoint!.player.z } };
        } finally { worker.terminate(); }
    }, { checkpoint, target: target! });
    expect(result.responses).toBe(2);
    expect(result.initial).toMatchObject({ tick: checkpoint.tick, chunks: 81 });
    expect(result.arrival).toMatchObject({ tick: checkpoint.tick, chunks: 81, ...target });
    for (const state of [result.initial, result.arrival]) {
        expect(state.stats.generationYieldMs).toBeGreaterThan(0);
        expect(state.stats.simulationYieldMs).toBe(0);
        expect(state.stats.executeMs).toBeLessThan(state.stats.batchMs);
    }
    await expect.poll(() => page.workers().length).toBe(0);
});
