import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    EventEmitter,
    createWorldDescriptor,
    generateWorld,
    generateWorldChunk,
    WORLD_GENERATOR_VERSION,
    WORLD_WORKER_PROTOCOL_VERSION,
    WorldGeneratorClient,
    WorldGeneratorPool
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

    test("binds event names to payloads and snapshots listeners during dispatch", () => {
        const emitter = new EventEmitter<{
            ready: void;
            value: { count: number };
            error: Error;
        }>();
        const observed: number[] = [];
        const second = vi.fn(({ count }: { count: number }) => { observed.push(count * 2); });
        emitter.on("value", ({ count }) => {
            observed.push(count);
            emitter.off("value", second);
        });
        emitter.on("value", second);

        emitter.emit("ready");
        emitter.emit("value", { count: 3 });
        emitter.emit("value", { count: 4 });

        expect(observed).toEqual([3, 6, 4]);
        expect(emitter.listenerCount("value")).toBe(1);
        if (false) {
            // @ts-expect-error value events require their mapped payload.
            emitter.emit("value");
            // @ts-expect-error unknown event names are rejected.
            emitter.on("missing", () => undefined);
        }
    });

    test("throws an error event when no observer is registered", () => {
        const emitter = new EventEmitter<{ error: Error }>();
        const failure = new Error("unhandled event failure");
        expect(() => emitter.emit("error", failure)).toThrow(failure);

        const listener = vi.fn();
        emitter.on("error", listener);
        expect(() => emitter.emit("error", failure)).not.toThrow();
        expect(listener).toHaveBeenCalledWith(failure);
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

    test("keeps a cancelled overview slot occupied until acknowledgement, then reuses its Worker", async () => {
        const pool = new WorldGeneratorPool("worker.mjs", { size: 1 });
        const worker = FakeWorker.instances[0];
        const controller = new AbortController();
        const removeListener = vi.spyOn(controller.signal, "removeEventListener");
        const overview = pool.generateOverview({ descriptor: createWorldDescriptor({ seed: 3 }),
            originX: 0, originY: 0, tileSpanX: 4096, tileSpanY: 4096, pixelWidth: 128, pixelHeight: 128
        }, { signal: controller.signal });
        const chunk = pool.generateChunk({ seed: 3, chunkX: 0, chunkY: 0, chunkSize: 12 });
        controller.abort();
        await expect(overview).rejects.toMatchObject({ name: "AbortError" });
        expect(worker.messages).toHaveLength(2);
        expect(worker.messages[1]).toMatchObject({ type: "cancel-overview", id: 1 });
        expect(pool.stats).toMatchObject({ busyOverviewWorkers: 1, queuedChunks: 1 });
        worker.emit("message", { data: { protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION, id: 1,
            error: { name: "AbortError", message: "cancelled" } } });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
        expect(worker.messages[2]).toMatchObject({ type: "chunk", id: 2 });
        const packed = generateWorldChunk({ seed: 3, chunkX: 0, chunkY: 0, chunkSize: 12 });
        worker.emit("message", { data: { protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION, id: 2, chunk: packed } });
        await expect(chunk).resolves.toEqual(packed);
        expect(worker.terminated).toBe(false);
        expect(FakeWorker.instances).toHaveLength(1);
        pool.dispose();
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
