import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    EventEmitter,
    generateWorld,
    generateWorldChunk,
    WORLD_GENERATOR_VERSION,
    WORLD_WORKER_PROTOCOL_VERSION,
    WorldGeneratorClient
} from "../src/index";
import { setOptions } from "../src/helpers/setoptions";

class FakeWorker {
    static instances: FakeWorker[] = [];
    readonly listeners = new Map<string, Set<(event: any) => void>>();
    readonly messages: unknown[] = [];
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

    postMessage(message: unknown): void {
        if (this.postError) throw this.postError;
        this.messages.push(message);
    }

    terminate(): void {
        this.terminated = true;
    }

    emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
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

    test("classifies explicit worker disposal as request cancellation", async () => {
        const client = new WorldGeneratorClient("worker.mjs");
        const pending = client.generate({ seed: 1, width: 8, height: 8 });
        client.dispose();

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
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
