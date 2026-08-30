import { expect, test } from "@playwright/test";
import { WORLD_GENERATOR_VERSION } from "../../src/world/WorldGeneratorVersion";
import { WORLD_WORKER_PROTOCOL_VERSION } from "../../src/world/WorldDescriptor";
import { createWorldDescriptorV2 } from "../../src/world/semantic/WorldDescriptorV2";
import { WORLD_SURFACE_V2_GENERATOR_VERSION } from "../../src/world/semantic/WorldSemanticFormat";

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

test("world worker generates a transferable v2 semantic chunk in a real browser", async ({ page }) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const descriptor = createWorldDescriptorV2({ seed: "semantic-worker-probe" });
    const result = await page.evaluate(
        ({ protocolVersion, generatorVersion, descriptor }) => new Promise<{
            kind: WorkerProbe["kind"];
            key?: { chunkX: number; chunkY: number };
            lengths?: number[];
            message?: string;
        }>(resolve => {
            const worker = new Worker("/js/world-generator.worker.mjs", { type: "module" });
            const finish = (value: Parameters<typeof resolve>[0]): void => {
                worker.terminate();
                resolve(value);
            };
            worker.addEventListener("message", event => {
                const chunk = event.data?.semanticChunk;
                finish({
                    kind: "message",
                    key: chunk?.key,
                    lengths: chunk ? [
                        chunk.substrateClass.length,
                        chunk.macroHeight.length,
                        chunk.biomeWeights.length,
                        chunk.climate.length,
                        chunk.vegetationDensity.length,
                        chunk.vegetationProfile.length
                    ] : undefined,
                    message: event.data?.error?.message
                });
            }, { once: true });
            worker.addEventListener("error", event => finish({ kind: "error", message: event.message }), { once: true });
            worker.addEventListener("messageerror", () => finish({ kind: "messageerror" }), { once: true });
            worker.postMessage({
                id: 1,
                protocolVersion,
                generatorVersion,
                type: "generateSemanticChunk",
                options: { descriptor, key: { chunkX: -2, chunkY: 3 } }
            });
            setTimeout(() => finish({ kind: "timeout" }), 10_000);
        }),
        {
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
            descriptor
        }
    );

    expect(result).toEqual({
        kind: "message",
        key: { chunkX: -2, chunkY: 3 },
        lengths: [1024, 1024, 4096, 2048, 1024, 1024],
        message: undefined
    });
});

test("world worker generates a transferable v2 hydrology region in a real browser", async ({ page }) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const descriptor = createWorldDescriptorV2({ seed: "hydrology-order" });
    const result = await page.evaluate(
        ({ protocolVersion, generatorVersion, descriptor }) => new Promise<{
            kind: WorkerProbe["kind"];
            key?: { regionX: number; regionY: number };
            riverCount?: number;
            portCount?: number;
            firstControlPoints?: number;
            transferableBuffers?: number;
            message?: string;
        }>(resolve => {
            const worker = new Worker("/js/world-generator.worker.mjs", { type: "module" });
            const finish = (value: Parameters<typeof resolve>[0]): void => {
                worker.terminate();
                resolve(value);
            };
            worker.addEventListener("message", event => {
                const region = event.data?.hydrologyRegion;
                const buffers = region ? new Set(region.rivers.flatMap((river: {
                    controlPoints: Int16Array;
                    widthProfile: Uint8Array;
                    levelProfile: Uint16Array;
                }) => [river.controlPoints.buffer, river.widthProfile.buffer, river.levelProfile.buffer])) : undefined;
                finish({
                    kind: "message",
                    key: region?.key,
                    riverCount: region?.rivers?.length,
                    portCount: region?.boundaryPorts?.length,
                    firstControlPoints: region?.rivers?.[0]?.controlPoints?.length,
                    transferableBuffers: buffers?.size,
                    message: event.data?.error?.message
                });
            }, { once: true });
            worker.addEventListener("error", event => finish({ kind: "error", message: event.message }), { once: true });
            worker.addEventListener("messageerror", () => finish({ kind: "messageerror" }), { once: true });
            worker.postMessage({
                id: 1,
                protocolVersion,
                generatorVersion,
                type: "generateHydrologyRegion",
                options: { descriptor, key: { regionX: 2, regionY: 3 } }
            });
            setTimeout(() => finish({ kind: "timeout" }), 10_000);
        }),
        {
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
            descriptor
        }
    );

    expect(result.kind).toBe("message");
    expect(result.key).toEqual({ regionX: 2, regionY: 3 });
    expect(result.riverCount).toBeGreaterThan(0);
    expect(result.portCount).toBeGreaterThan(0);
    expect(result.firstControlPoints).toBe(4);
    expect(result.transferableBuffers).toBe(result.riverCount! * 3);
    expect(result.message).toBeUndefined();
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
