import { describe, expect, test } from "vitest";

import { BaseSemanticChunk } from "../../src/world/BaseSemanticChunk";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import {
    SemanticChunkWorkerClient,
    SurfaceWorkerPool
} from "../../src/world/SurfaceWorkerPool";
import { GenerateSemanticChunkOptions } from "../../src/world/SurfaceWorkerClient";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";

interface DeferredRequest {
    readonly options: Readonly<GenerateSemanticChunkOptions>;
    readonly resolve: (chunk: BaseSemanticChunk) => void;
    readonly reject: (error: Error) => void;
}

class DeferredClient implements SemanticChunkWorkerClient {
    public readonly requests: DeferredRequest[] = [];
    public isDisposed = false;

    public generateSemanticChunk(options: Readonly<GenerateSemanticChunkOptions>): Promise<BaseSemanticChunk> {
        return new Promise((resolve, reject) => this.requests.push({ options, resolve, reject }));
    }

    public complete(index = 0): void {
        const request = this.requests[index];
        request.resolve(generateBaseSemanticChunk({
            descriptor: request.options.descriptor,
            chunkX: request.options.key.chunkX,
            chunkY: request.options.key.chunkY
        }));
    }

    public crash(index = 0): void {
        this.isDisposed = true;
        this.requests[index].reject(new Error("injected surface worker crash"));
    }

    public dispose(): void {
        this.isDisposed = true;
    }
}

describe("v2 surface worker pool", () => {
    test("runs one task per worker and dispatches queued work by priority", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("pool-priority");
        const client = new DeferredClient();
        const pool = new SurfaceWorkerPool("unused", { size: 1, clientFactory: () => client });
        const running = pool.generateSemanticChunk({ descriptor, key: { chunkX: 0, chunkY: 0 } });
        const far = pool.generateSemanticChunk(
            { descriptor, key: { chunkX: 9, chunkY: 0 } },
            { priority: 9 }
        );
        const near = pool.generateSemanticChunk(
            { descriptor, key: { chunkX: 2, chunkY: 0 } },
            { priority: 2 }
        );
        expect(client.requests).toHaveLength(1);
        client.complete(0);
        await running;
        await Promise.resolve();
        expect(client.requests[1].options.key).toEqual({ chunkX: 2, chunkY: 0 });
        client.complete(1);
        await near;
        await Promise.resolve();
        expect(client.requests[2].options.key).toEqual({ chunkX: 9, chunkY: 0 });
        client.complete(2);
        await far;
        expect(pool.stats).toMatchObject({ completed: 3, queued: 0, busyWorkers: 0 });
        pool.dispose();
    });

    test("replaces a crashed client and retries exactly within the configured bound", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("pool-retry");
        const clients = [new DeferredClient(), new DeferredClient()];
        let created = 0;
        const pool = new SurfaceWorkerPool("unused", {
            size: 1,
            maximumWorkerRetries: 1,
            clientFactory: () => clients[created++]
        });
        const pending = pool.generateSemanticChunk({ descriptor, key: { chunkX: 4, chunkY: -2 } });
        clients[0].crash();
        await Promise.resolve();
        expect(clients[1].requests).toHaveLength(1);
        clients[1].complete();
        await expect(pending).resolves.toMatchObject({ key: { chunkX: 4, chunkY: -2 } });
        expect(pool.stats).toMatchObject({ workerFailures: 1, retried: 1, completed: 1 });
        pool.dispose();
    });

    test("cancels queued work without disturbing the running worker", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("pool-abort");
        const client = new DeferredClient();
        const pool = new SurfaceWorkerPool("unused", { size: 1, clientFactory: () => client });
        const running = pool.generateSemanticChunk({ descriptor, key: { chunkX: 0, chunkY: 0 } });
        const controller = new AbortController();
        const queued = pool.generateSemanticChunk(
            { descriptor, key: { chunkX: 1, chunkY: 0 } },
            { signal: controller.signal }
        );
        controller.abort();
        await expect(queued).rejects.toMatchObject({ name: "AbortError" });
        expect(client.requests).toHaveLength(1);
        client.complete();
        await running;
        expect(pool.stats).toMatchObject({ completed: 1, queued: 0 });
        pool.dispose();
    });
});

