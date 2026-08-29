import { beforeEach, describe, expect, test, vi } from "vitest";

import {
    semanticCatalogLimits,
    serializeBaseSemanticChunk
} from "../../src/world/BaseSemanticChunk";
import {
    HydrologyRegion,
    createHydrologyRegion
} from "../../src/world/HydrologyRegion";
import { compiledSurfaceChunkTransferables } from "../../src/world/CompiledSurfaceChunk";
import {
    CORE_WORLD_SEMANTICS_V2,
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import { SurfaceWorkerClient } from "../../src/world/SurfaceWorkerClient";
import { createSurfaceRequestToken } from "../../src/world/SurfaceDependencyKey";
import {
    SURFACE_WORKER_PROTOCOL_VERSION,
    createGenerateHydrologyRegionWorkerRequest,
    createGenerateSemanticChunkWorkerRequest,
    createCompileSurfaceChunkWorkerRequest,
    compileSurfaceChunkRequestTransferables,
    hydrologyRegionTransferables,
    semanticChunkTransferables
} from "../../src/world/SurfaceWorkerProtocol";
import { compileSurfaceChunk } from "../../src/world/compileSurfaceChunk";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";
import {
    WORLD_GENERATOR_VERSION_V2,
    createWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "../../src/world/WorldDescriptorV2";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

function emptyInfiniteRegion(seed: string, regionX: number, regionY: number): HydrologyRegion {
    const descriptor = createCoreInfiniteWorldDescriptorV2(seed);
    return createHydrologyRegion({
        worldIdentity: serializeWorldDescriptorV2(descriptor),
        topology: "infinite",
        key: { regionX, regionY },
        revision: 0,
        validBounds: { minX: 0, minY: 0, maxXExclusive: 128, maxYExclusive: 128 },
        boundaryPorts: [],
        rivers: [],
        lakes: [],
        mouths: [],
        bodies: []
    });
}

class FakeWorker {
    static instances: FakeWorker[] = [];
    readonly listeners = new Map<string, Set<(event: any) => void>>();
    readonly messages: unknown[] = [];
    terminated = false;

    constructor() {
        FakeWorker.instances.push(this);
    }

    addEventListener(type: string, listener: (event: any) => void): void {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: (event: any) => void): void {
        this.listeners.get(type)?.delete(listener);
    }

    postMessage(message: unknown, transfer: Transferable[] = []): void {
        this.messages.push(structuredClone(message, { transfer }));
    }

    terminate(): void {
        this.terminated = true;
    }

    emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
}

describe("v2 surface worker protocol", () => {
    beforeEach(() => {
        FakeWorker.instances = [];
        vi.stubGlobal("Worker", FakeWorker);
    });

    test("uses a strict protocol-3 discriminated semantic request", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("worker-contract");
        const request = createGenerateSemanticChunkWorkerRequest(7, descriptor, { chunkX: -2, chunkY: 4 });
        expect(request).toMatchObject({
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: 7,
            type: "generateSemanticChunk",
            key: { chunkX: -2, chunkY: 4 }
        });
        const staticDescriptor = createWorldDescriptorV2({
            ...CORE_WORLD_SEMANTICS_V2,
            sourceKind: "static",
            sourceContentHash: `sha256:${"a".repeat(64)}`,
            width: 32,
            height: 32
        });
        expect(() => createGenerateSemanticChunkWorkerRequest(8, staticDescriptor, { chunkX: 0, chunkY: 0 }))
            .toThrow(/procedural/);
        expect(() => createGenerateSemanticChunkWorkerRequest(0, descriptor, { chunkX: 0, chunkY: 0 }))
            .toThrow(/envelope/);
    });

    test("uses a strict protocol-3 hydrology request with canonical topology keys", () => {
        const infinite = createCoreInfiniteWorldDescriptorV2("worker-hydrology-contract");
        expect(createGenerateHydrologyRegionWorkerRequest(9, infinite, { regionX: -2, regionY: 4 }))
            .toMatchObject({
                protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION_V2,
                requestId: 9,
                type: "generateHydrologyRegion",
                key: { regionX: -2, regionY: 4 }
            });
        const toroidal = createCoreToroidalWorldDescriptorV2("worker-hydrology-torus", 160, 96);
        expect(() => createGenerateHydrologyRegionWorkerRequest(10, toroidal, { regionX: -1, regionY: 0 }))
            .toThrow(/canonical/);
        expect(() => createGenerateHydrologyRegionWorkerRequest(10, toroidal, { regionX: 2, regionY: 0 }))
            .toThrow(/canonical/);
    });

    test("transfers all semantic payload buffers without cloning authority", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("worker-transfer");
        const chunk = generateBaseSemanticChunk({ descriptor, chunkX: 1, chunkY: -1 });
        const expected = serializeBaseSemanticChunk(chunk, semanticCatalogLimits(descriptor));
        const transfer = semanticChunkTransferables(chunk);
        expect(transfer).toHaveLength(6);
        const cloned = structuredClone(chunk, { transfer }) as typeof chunk;
        expect(chunk.substrateClass.byteLength).toBe(0);
        expect(serializeBaseSemanticChunk(cloned, semanticCatalogLimits(descriptor))).toEqual(expected);
    });

    test("transfers every hydrology typed-array payload exactly once", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("worker-hydrology-transfer");
        const region = createHydrologyRegion({
            worldIdentity: serializeWorldDescriptorV2(descriptor),
            topology: "infinite",
            key: { regionX: 0, regionY: 0 },
            revision: 0,
            validBounds: { minX: 0, minY: 0, maxXExclusive: 128, maxYExclusive: 128 },
            boundaryPorts: [],
            rivers: [],
            lakes: [{
                featureId: "lake-slice:transfer",
                bodyId: "lake:transfer",
                center: new Int16Array([64, 64]),
                radius: 64,
                level: 100,
                profileIndex: 1
            }],
            mouths: [],
            bodies: [{ bodyId: "lake:transfer", kind: "lake", profileIndex: 1 }]
        });
        const transfer = hydrologyRegionTransferables(region);
        expect(transfer).toHaveLength(1);
        const cloned = structuredClone(region, { transfer }) as HydrologyRegion;
        expect(region.lakes[0].center.byteLength).toBe(0);
        expect(cloned.lakes[0].center).toEqual(new Int16Array([64, 64]));
    });

    test("uses a tokened compile request and transfers only the owned effective window", () => {
        const window = createSurfaceCompilerTestWindow({
            seaLevel: 0,
            macroHeight: () => 20_000
        });
        const request = createCompileSurfaceChunkWorkerRequest(
            11,
            createSurfaceRequestToken(3, 7),
            window
        );
        const transfer = compileSurfaceChunkRequestTransferables(request);
        expect(request).toMatchObject({
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            type: "compileSurfaceChunk",
            requestToken: { sessionEpoch: 3, renderChunkGeneration: 7 }
        });
        expect(transfer).toHaveLength(7);
        const cloned = structuredClone(request, { transfer: [...transfer] });
        expect(window.valid.byteLength).toBe(0);
        expect(cloned.effectiveWindow.valid.byteLength).toBeGreaterThan(0);
    });

    test("validates and republishes a worker result before exposing it", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("worker-client");
        const client = new SurfaceWorkerClient("surface.worker.mjs");
        const worker = FakeWorker.instances[0];
        const pending = client.generateSemanticChunk({ descriptor, key: { chunkX: -3, chunkY: 2 } });
        const request = worker.messages[0] as { requestId: number; type: string };
        expect(request.type).toBe("generateSemanticChunk");
        const chunk = generateBaseSemanticChunk({ descriptor, chunkX: -3, chunkY: 2 });
        worker.emit("message", { data: {
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: request.requestId,
            type: "generateSemanticChunkResult",
            chunk
        } });
        const result = await pending;
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.key)).toBe(true);
        expect(result.key).toEqual({ chunkX: -3, chunkY: 2 });
        client.dispose();
    });

    test("terminates on a corrupted result instead of accepting the wrong chunk", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("worker-corruption");
        const client = new SurfaceWorkerClient("surface.worker.mjs");
        const worker = FakeWorker.instances[0];
        const pending = client.generateSemanticChunk({ descriptor, key: { chunkX: 0, chunkY: 0 } });
        const request = worker.messages[0] as { requestId: number };
        worker.emit("message", { data: {
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: request.requestId,
            type: "generateSemanticChunkResult",
            chunk: generateBaseSemanticChunk({ descriptor, chunkX: 1, chunkY: 0 })
        } });
        await expect(pending).rejects.toThrow(/wrong request/);
        expect(client.isDisposed).toBe(true);
        expect(worker.terminated).toBe(true);
    });

    test("validates and republishes a hydrology result before exposing it", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("worker-hydrology-client");
        const client = new SurfaceWorkerClient("surface.worker.mjs");
        const worker = FakeWorker.instances[0];
        const pending = client.generateHydrologyRegion({ descriptor, key: { regionX: -3, regionY: 2 } });
        const request = worker.messages[0] as { requestId: number; type: string };
        expect(request.type).toBe("generateHydrologyRegion");
        worker.emit("message", { data: {
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: request.requestId,
            type: "generateHydrologyRegionResult",
            region: emptyInfiniteRegion("worker-hydrology-client", -3, 2)
        } });
        const result = await pending;
        expect(Object.isFrozen(result)).toBe(true);
        expect(result.key).toEqual({ regionX: -3, regionY: 2 });
        client.dispose();
    });

    test("terminates when hydrology identity or key does not match the request", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("worker-hydrology-corruption");
        const client = new SurfaceWorkerClient("surface.worker.mjs");
        const worker = FakeWorker.instances[0];
        const pending = client.generateHydrologyRegion({ descriptor, key: { regionX: 0, regionY: 0 } });
        const request = worker.messages[0] as { requestId: number };
        worker.emit("message", { data: {
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: request.requestId,
            type: "generateHydrologyRegionResult",
            region: emptyInfiniteRegion("worker-hydrology-corruption", 1, 0)
        } });
        await expect(pending).rejects.toThrow(/wrong request or world contract/);
        expect(client.isDisposed).toBe(true);
        expect(worker.terminated).toBe(true);
    });

    test("validates and republishes a final compiled chunk with its exact token", async () => {
        const client = new SurfaceWorkerClient("surface.worker.mjs");
        const worker = FakeWorker.instances[0];
        const effectiveWindow = createSurfaceCompilerTestWindow({
            seaLevel: 0,
            macroHeight: () => 20_000,
            vegetationDensity: () => 64
        });
        const requestToken = createSurfaceRequestToken(4, 9);
        const pending = client.compileSurfaceChunk({ requestToken, effectiveWindow });
        const request = worker.messages[0] as ReturnType<typeof createCompileSurfaceChunkWorkerRequest>;
        expect(request.type).toBe("compileSurfaceChunk");
        expect(effectiveWindow.valid.byteLength).toBe(0);
        const chunk = compileSurfaceChunk(request.effectiveWindow);
        expect(compiledSurfaceChunkTransferables(chunk)).toHaveLength(14);
        worker.emit("message", { data: {
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: request.requestId,
            type: "compileSurfaceChunkResult",
            requestToken,
            chunk
        } });
        const result = await pending;
        expect(result.requestToken).toEqual(requestToken);
        expect(result.chunk.key).toEqual({ chunkX: 0, chunkY: 0 });
        expect(Object.isFrozen(result.chunk)).toBe(true);
        client.dispose();
    });

    test("terminates on a mismatched compiled-surface request token", async () => {
        const client = new SurfaceWorkerClient("surface.worker.mjs");
        const worker = FakeWorker.instances[0];
        const requestToken = createSurfaceRequestToken(2, 5);
        const pending = client.compileSurfaceChunk({
            requestToken,
            effectiveWindow: createSurfaceCompilerTestWindow({
                seaLevel: 0,
                macroHeight: () => 20_000
            })
        });
        const request = worker.messages[0] as ReturnType<typeof createCompileSurfaceChunkWorkerRequest>;
        worker.emit("message", { data: {
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: request.requestId,
            type: "compileSurfaceChunkResult",
            requestToken: createSurfaceRequestToken(2, 6),
            chunk: compileSurfaceChunk(request.effectiveWindow)
        } });
        await expect(pending).rejects.toThrow(/wrong token/);
        expect(client.isDisposed).toBe(true);
        expect(worker.terminated).toBe(true);
    });
});
