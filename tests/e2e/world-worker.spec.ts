import { expect, test } from "@playwright/test";
import { WORLD_GENERATOR_VERSION } from "../../src/world/WorldGeneratorVersion";
import { WORLD_WORKER_PROTOCOL_VERSION } from "../../src/world/WorldDescriptor";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import { SURFACE_WORKER_PROTOCOL_VERSION } from "../../src/world/SurfaceWorkerProtocol";
import { WORLD_GENERATOR_VERSION_V2 } from "../../src/world/WorldDescriptorV2";

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

test("surface worker transfers one validated protocol-3 semantic chunk", async ({ page }) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const descriptor = createCoreInfiniteWorldDescriptorV2("surface-worker-probe");
    const result = await page.evaluate(({ protocolVersion, generatorVersion, descriptor }) =>
        new Promise<Record<string, unknown>>(resolve => {
            const worker = new Worker("/js/surface.worker.mjs", { type: "module" });
            const finish = (value: Record<string, unknown>): void => {
                worker.terminate();
                resolve(value);
            };
            worker.addEventListener("message", event => {
                const chunk = event.data?.chunk;
                finish({
                    type: event.data?.type,
                    requestId: event.data?.requestId,
                    chunkX: chunk?.key?.chunkX,
                    chunkY: chunk?.key?.chunkY,
                    substrateLength: chunk?.substrateClass?.length,
                    heightLength: chunk?.macroHeight?.length,
                    biomeLength: chunk?.biomeWeights?.length,
                    firstBiomeSum: chunk?.biomeWeights
                        ? chunk.biomeWeights[0] + chunk.biomeWeights[1]
                            + chunk.biomeWeights[2] + chunk.biomeWeights[3]
                        : -1
                });
            }, { once: true });
            worker.addEventListener("error", event => finish({
                type: "browserError",
                message: event.message
            }), { once: true });
            worker.postMessage({
                protocolVersion,
                generatorVersion,
                requestId: 11,
                type: "generateSemanticChunk",
                descriptor,
                key: { chunkX: -3, chunkY: 2 }
            });
            setTimeout(() => finish({ type: "timeout" }), 10_000);
        }), {
        protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION_V2,
        descriptor
    });
    expect(result).toEqual({
        type: "generateSemanticChunkResult",
        requestId: 11,
        chunkX: -3,
        chunkY: 2,
        substrateLength: 1024,
        heightLength: 1024,
        biomeLength: 4096,
        firstBiomeSum: 255
    });
});

test("surface entry loads an infinite semantic source through the real worker", async ({ page }) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
        const surfaceUrl = "/js/surface.mjs";
        const surface = await import(surfaceUrl) as typeof import("../../src/surface");
        const descriptor = surface.createCoreInfiniteWorldDescriptorV2("surface-source-probe");
        const source = new surface.InfiniteSemanticWorldSource({
            descriptor,
            workerUrl: new URL("/js/surface.worker.mjs", window.location.href),
            workerPoolOptions: { size: 1 }
        });
        const chunk = await source.loadChunk(-2, 3);
        const loaded = {
            key: chunk.key,
            firstBiomeSum: chunk.biomeWeights[0] + chunk.biomeWeights[1]
                + chunk.biomeWeights[2] + chunk.biomeWeights[3],
            stats: source.stats
        };
        source.releaseChunk(chunk);
        const released = source.stats;
        source.dispose();
        return { loaded, released };
    });
    expect(result.loaded).toMatchObject({
        key: { chunkX: -2, chunkY: 3 },
        firstBiomeSum: 255,
        stats: { residentChunks: 1, leasedChunks: 1, workers: 1 }
    });
    expect(result.released).toMatchObject({ residentChunks: 1, leasedChunks: 0 });
});

test("surface entry loads and republishes infinite hydrology through the real worker", async ({ page }) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
        const surfaceUrl = "/js/surface.mjs";
        const surface = await import(surfaceUrl) as typeof import("../../src/surface");
        const descriptor = surface.createCoreInfiniteWorldDescriptorV2("hydrology-source-probe");
        const source = new surface.ProceduralHydrologyWorldSource({
            descriptor,
            workerUrl: new URL("/js/surface.worker.mjs", window.location.href)
        });
        const region = await source.loadRegion(0, 0);
        surface.assertHydrologyRegion(region);
        const loaded = {
            key: region.key,
            topology: region.topology,
            validBounds: region.validBounds,
            featureCount: region.rivers.length + region.lakes.length + region.mouths.length,
            stats: source.stats
        };
        source.releaseRegion(region);
        const released = source.stats;
        source.dispose();
        return { loaded, released };
    });
    expect(result.loaded).toMatchObject({
        key: { regionX: 0, regionY: 0 },
        topology: "infinite",
        validBounds: { maxXExclusive: 128, maxYExclusive: 128 },
        stats: { residentRegions: 1, leasedRegions: 1, workers: 1 }
    });
    expect(result.loaded.featureCount).toBeGreaterThan(0);
    expect(result.released).toMatchObject({ residentRegions: 1, leasedRegions: 0 });
});

test("surface worker retains one toroidal graph and returns partial edge bounds", async ({ page }) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
        const surfaceUrl = "/js/surface.mjs";
        const surface = await import(surfaceUrl) as typeof import("../../src/surface");
        const descriptor = surface.createCoreToroidalWorldDescriptorV2(
            "hydrology-torus-probe",
            160,
            96
        );
        const source = new surface.ProceduralHydrologyWorldSource({
            descriptor,
            workerUrl: new URL("/js/surface.worker.mjs", window.location.href)
        });
        const first = await source.loadRegion(1, 0);
        source.releaseRegion(first);
        const repeated = await source.loadRegion(1, 0);
        const output = {
            key: repeated.key,
            topology: repeated.topology,
            validBounds: repeated.validBounds,
            stats: source.stats
        };
        source.releaseRegion(repeated);
        source.dispose();
        return output;
    });
    expect(result).toMatchObject({
        key: { regionX: 1, regionY: 0 },
        topology: "toroidal",
        validBounds: { maxXExclusive: 32, maxYExclusive: 96 },
        stats: { residentRegions: 1, leasedRegions: 1, cacheHits: 1, workers: 1 }
    });
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
