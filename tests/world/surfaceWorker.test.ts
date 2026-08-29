import { beforeEach, describe, expect, test, vi } from "vitest";

import {
    semanticCatalogLimits,
    serializeBaseSemanticChunk
} from "../../src/world/BaseSemanticChunk";
import {
    CORE_WORLD_SEMANTICS_V2,
    createCoreInfiniteWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import { SurfaceWorkerClient } from "../../src/world/SurfaceWorkerClient";
import {
    SURFACE_WORKER_PROTOCOL_VERSION,
    createGenerateSemanticChunkWorkerRequest,
    semanticChunkTransferables
} from "../../src/world/SurfaceWorkerProtocol";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";
import {
    WORLD_GENERATOR_VERSION_V2,
    createWorldDescriptorV2
} from "../../src/world/WorldDescriptorV2";

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

    postMessage(message: unknown): void {
        this.messages.push(message);
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
});

