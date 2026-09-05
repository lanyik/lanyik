import { expect, test } from "@playwright/test";
import { WORLD_GENERATOR_VERSION } from "../../src/world/WorldGeneratorVersion";
import { WORLD_WORKER_PROTOCOL_VERSION } from "../../src/world/WorldDescriptor";

interface WorkerProbe {
    kind: "message" | "error" | "messageerror" | "timeout";
    message?: string;
    filename?: string;
    line?: number;
    column?: number;
    stack?: string;
    chunkLength?: number;
}

test("world worker generates a transferable chunk in a real browser", async ({ page }) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(({ protocolVersion, generatorVersion }) => new Promise<WorkerProbe>(resolve => {
        const worker = new Worker("/js/world-generator.worker.mjs", { type: "module" });
        const finish = (value: WorkerProbe): void => {
            worker.terminate();
            resolve(value);
        };
        worker.addEventListener("message", event => finish({
            kind: "message",
            chunkLength: event.data?.chunk?.tiles?.length
        }), { once: true });
        worker.addEventListener("error", event => finish({
            kind: "error",
            message: event.message,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
            stack: event.error?.stack
        }), { once: true });
        worker.addEventListener("messageerror", () => finish({ kind: "messageerror" }), { once: true });
        worker.postMessage({
            id: 1,
            protocolVersion,
            generatorVersion,
            type: "chunk",
            options: { seed: "worker-probe", chunkX: 0, chunkY: 0, chunkSize: 24 }
        });
        setTimeout(() => finish({ kind: "timeout" }), 10_000);
    }), {
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION
    });

    expect(result).toEqual({ kind: "message", chunkLength: 26 * 26 });
});

test("cancels running overview batches without restarting the Worker", async ({ page }) => {
    await page.goto("/?infinite&quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).HexMap));
    const result = await page.evaluate(async () => {
        const library = (window as any).HexMap;
        const client = new library.WorldGeneratorClient("/js/world-generator.worker.mjs");
        const responses: any[] = [];
        client.worker.addEventListener("message", (event: MessageEvent) => responses.push(event.data));
        let clients = 0;
        const pool = new library.WorldGeneratorPool("unused", { size: 1, clientFactory: () => { clients += 1; return client; } });
        const controller = new AbortController();
        let errorName = "";
        try {
            const pending = pool.generateOverview({ descriptor: library.createWorldDescriptor({ seed: "new-world" }),
                originX: 0, originY: 0, tileSpanX: 16384, tileSpanY: 16384, pixelWidth: 128, pixelHeight: 128
            }, { signal: controller.signal });
            setTimeout(() => controller.abort(), 20);
            try { await pending; } catch (error) { errorName = (error as Error).name; }
            const chunk = await pool.generateChunk({ seed: "new-world", chunkX: 3, chunkY: -2, chunkSize: 24 });
            await new Promise(resolve => setTimeout(resolve, 0));
            return {
                errorName, clients, workerDisposed: client.isDisposed,
                response: responses.find(response => response.id === 1)?.error?.name,
                staleRaster: responses.some(response => response.id === 1 && response.overview),
                chunk: [chunk.chunkX, chunk.chunkY], failures: pool.stats.workerFailures, busy: pool.stats.busyWorkers
            };
        } finally { pool.dispose(); }
    });
    expect(result).toEqual({ errorName: "AbortError", clients: 1, workerDisposed: false,
        response: "AbortError", staleRaster: false, chunk: [3, -2], failures: 0, busy: 0 });
});

test("worker pool replaces a real crashed Worker and serves the next request", async ({ page }) => {
    await page.goto("/?infinite&quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { HexMap?: unknown }).HexMap));
    const result = await page.evaluate(async () => {
        const api = window as unknown as {
            HexMap: {
                WorldGeneratorClient: new (url: string | URL) => {
                    generateChunk(options: Record<string, unknown>): Promise<unknown>;
                    dispose(): void;
                    readonly isDisposed: boolean;
                };
                WorldGeneratorPool: new (url: string | URL, options: Record<string, unknown>) => {
                    generateChunk(options: Record<string, unknown>): Promise<{ chunkX: number; chunkY: number }>;
                    readonly stats: { workers: number; busyWorkers: number; queued: number; workerFailures: number };
                    dispose(): void;
                };
            };
        };
        const crashUrl = URL.createObjectURL(new Blob([
            `self.addEventListener("message", () => { throw new Error("injected real worker crash"); });`
        ], { type: "text/javascript" }));
        const healthyUrl = new URL("./js/world-generator.worker.mjs", window.location.href);
        let clients = 0;
        const pool = new api.HexMap.WorldGeneratorPool(healthyUrl, {
            size: 1,
            clientFactory: () => new api.HexMap.WorldGeneratorClient(clients++ === 0 ? crashUrl : healthyUrl)
        });
        let firstError = "";
        try {
            await pool.generateChunk({ seed: "crash", chunkX: 0, chunkY: 0, chunkSize: 24 });
        } catch (reason) {
            firstError = reason instanceof Error ? reason.message : String(reason);
        }
        const recovered = await pool.generateChunk({ seed: "recovered", chunkX: 3, chunkY: -2, chunkSize: 24 });
        await new Promise(resolve => setTimeout(resolve, 0));
        const stats = pool.stats;
        pool.dispose();
        URL.revokeObjectURL(crashUrl);
        return { firstError, recovered, stats, clients };
    });

    expect(result.firstError).toContain("injected real worker crash");
    expect(result.recovered).toMatchObject({ chunkX: 3, chunkY: -2 });
    expect(result.stats).toMatchObject({ workers: 1, busyWorkers: 0, queued: 0, workerFailures: 1 });
    expect(result.clients).toBe(2);
});
