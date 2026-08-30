import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    EventEmitter,
    compileSurfaceChunk,
    createWorldDescriptorV2,
    effectiveSurfaceWindowTransferables,
    generateBaseSemanticChunk,
    generateWorld,
    generateWorldChunk,
    WORLD_GENERATOR_VERSION,
    WORLD_SURFACE_V2_GENERATOR_VERSION,
    WORLD_WORKER_PROTOCOL_VERSION,
    SURFACE_COMPILE_PROFILE_VERSION,
    SURFACE_COMPILER_REVISION,
    SURFACE_EFFECTIVE_WINDOW_SIZE,
    SurfaceWorkerCompilationError,
    WorldGeneratorClient
} from "../src/index";
import type { TransferableEffectiveWindow } from "../src/world/semantic/EffectiveSurfaceWindow";
import { setOptions } from "../src/helpers/setoptions";

class FakeWorker {
    static instances: FakeWorker[] = [];
    readonly listeners = new Map<string, Set<(event: any) => void>>();
    readonly messages: unknown[] = [];
    readonly transfers: Transferable[][] = [];
    terminated = false;
    postError: Error | undefined;

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
        if (this.postError) throw this.postError;
        this.messages.push(message);
        this.transfers.push(transfer);
    }

    terminate(): void {
        this.terminated = true;
    }

    emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
}

function flatSurfaceWindow(): TransferableEffectiveWindow {
    const count = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
    const biomeWeights = new Uint8Array(count * 4);
    for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
    return {
        worldIdentity: "worker-surface-compile",
        effectiveRevision: 0,
        key: { chunkX: -2, chunkY: 3 },
        dependencyKey: {
            worldIdentity: "worker-surface-compile",
            renderKey: { chunkX: -2, chunkY: 3 },
            compilerRevision: SURFACE_COMPILER_REVISION,
            compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
            semanticChunks: [],
            hydrologyRegions: []
        },
        validBounds: { minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 },
        substrateClass: new Uint8Array(count).fill(1),
        macroHeight: new Uint16Array(count).fill(50_000),
        biomeWeights,
        climate: new Uint8Array(count * 2).fill(127),
        vegetationDensity: new Uint8Array(count),
        vegetationProfile: new Uint8Array(count),
        rivers: [],
        lakes: []
    };
}

describe("core safeguards", () => {
    beforeEach(() => {
        FakeWorker.instances = [];
        vi.stubGlobal("Worker", FakeWorker);
    });

    test("setOptions only copies known own keys", () => {
        const target = { options: { enabled: true } };
        const inherited = Object.create({ enabled: false }) as { enabled?: boolean; extra?: number };
        inherited.extra = 3;
        setOptions(target, inherited);
        expect(target.options).toEqual({ enabled: true });

        setOptions(target, { enabled: false, unknown: true, __proto__: { polluted: true } });
        expect(target.options).toEqual({ enabled: false });
        expect((target.options as { polluted?: boolean }).polluted).toBeUndefined();
    });

    test("can clear event listeners", () => {
        const emitter = new EventEmitter();
        const first = vi.fn();
        const second = vi.fn();
        emitter.on("first", first).on("second", second).removeAllListeners("first");
        emitter.emit("first");
        emitter.emit("second");
        emitter.removeAllListeners();
        emitter.emit("second");
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });

    test("rejects invalid runtime topology values", () => {
        expect(() => generateWorld({ seed: 1, width: 8, height: 8, topology: "sphere" as never }))
            .toThrow(/topology/);
    });

    test("worker failures reject pending and future requests instead of hanging", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const worker = FakeWorker.instances[0];
        const pending = client.generate({ seed: 1, width: 8, height: 8 });
        worker.emit("error", { error: new Error("worker crashed"), message: "worker crashed" });

        await expect(pending).rejects.toThrow("worker crashed");
        await expect(client.generate({ seed: 2, width: 8, height: 8 })).rejects.toThrow(/disposed/);
        expect(worker.terminated).toBe(true);
    });

    test("removes a request when postMessage throws synchronously", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const worker = FakeWorker.instances[0];
        worker.postError = new Error("clone failed");
        await expect(client.generate({ seed: 1, width: 8, height: 8 })).rejects.toThrow("clone failed");
        client.dispose();
    });

    test("routes compact chunk responses independently from full-world responses", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const worker = FakeWorker.instances[0];
        const pending = client.generateChunk({ seed: 3, chunkX: -2, chunkY: 4, chunkSize: 12 });
        const request = worker.messages[0] as { id: number; type: string; generatorVersion: number };
        expect(request.type).toBe("chunk");
        expect(request.generatorVersion).toBe(WORLD_GENERATOR_VERSION);
        const chunk = generateWorldChunk({ seed: 3, chunkX: -2, chunkY: 4, chunkSize: 12 });
        worker.emit("message", {
            data: {
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION,
                id: request.id,
                chunk
            }
        });
        await expect(pending).resolves.toEqual(chunk);
        client.dispose();
    });

    test("routes v2 semantic chunks under their own generator identity", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const worker = FakeWorker.instances[0];
        const descriptor = createWorldDescriptorV2({ seed: "semantic-worker" });
        const pending = client.generateSemanticChunk({ descriptor, key: { chunkX: -2, chunkY: 4 } });
        const request = worker.messages[0] as { id: number; type: string; generatorVersion: number };
        expect(request.type).toBe("generateSemanticChunk");
        expect(request.generatorVersion).toBe(WORLD_SURFACE_V2_GENERATOR_VERSION);
        const semanticChunk = generateBaseSemanticChunk({ descriptor, key: { chunkX: -2, chunkY: 4 } });
        worker.emit("message", {
            data: {
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
                id: request.id,
                semanticChunk
            }
        });
        await expect(pending).resolves.toEqual(semanticChunk);
        client.dispose();
    });

    test("transfers v2 surface windows under compiler identity and reclaims their buffers", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const worker = FakeWorker.instances[0];
        const effectiveWindow = flatSurfaceWindow();
        const reclaimedWindowBuffers = effectiveSurfaceWindowTransferables(effectiveWindow);
        const pending = client.compileSurfaceChunk(effectiveWindow);
        const request = worker.messages[0] as {
            id: number;
            type: string;
            compilerRevision: number;
            compileProfileVersion: number;
        };
        expect(request).toMatchObject({
            type: "compileSurfaceChunk",
            compilerRevision: SURFACE_COMPILER_REVISION,
            compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION
        });
        expect(worker.transfers[0]).toEqual(reclaimedWindowBuffers);
        const surfaceChunk = compileSurfaceChunk(effectiveWindow);
        worker.emit("message", {
            data: {
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                compilerRevision: SURFACE_COMPILER_REVISION,
                compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
                id: request.id,
                type: "compileSurfaceChunk",
                surfaceChunk,
                reclaimedWindowBuffers
            }
        });
        await expect(pending).resolves.toMatchObject({ chunk: surfaceChunk, reclaimedWindowBuffers });
        client.dispose();
    });

    test("preserves reclaimed surface buffers on a remote compiler failure", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const worker = FakeWorker.instances[0];
        const effectiveWindow = flatSurfaceWindow();
        const reclaimedWindowBuffers = effectiveSurfaceWindowTransferables(effectiveWindow);
        const pending = client.compileSurfaceChunk(effectiveWindow);
        const request = worker.messages[0] as { id: number };
        worker.emit("message", {
            data: {
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                compilerRevision: SURFACE_COMPILER_REVISION,
                compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
                id: request.id,
                type: "compileSurfaceChunkError",
                reclaimedWindowBuffers,
                error: { name: "RangeError", message: "injected compiler failure" }
            }
        });
        const error = await pending.catch(reason => reason as SurfaceWorkerCompilationError);
        expect(error).toBeInstanceOf(SurfaceWorkerCompilationError);
        expect(error).toMatchObject({
            name: "RangeError",
            message: "injected compiler failure",
            reclaimedWindowBuffers
        });
        client.dispose();
    });

    test("rejects worker responses from a different generator identity", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const worker = FakeWorker.instances[0];
        const pending = client.generateChunk({ seed: 3, chunkX: 0, chunkY: 0, chunkSize: 12 });
        const request = worker.messages[0] as { id: number };
        worker.emit("message", {
            data: {
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION + 1,
                id: request.id,
                chunk: generateWorldChunk({ seed: 3, chunkX: 0, chunkY: 0, chunkSize: 12 })
            }
        });
        await expect(pending).rejects.toThrow(/invalid message/);
    });
});
