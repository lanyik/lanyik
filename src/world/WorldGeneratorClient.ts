import { MapInfo } from "../interfaces";
import { WorldGenerationOptions } from "./generateWorld";
import {
    assertPackedWorldChunk,
    DEFAULT_WORLD_GENERATION_CHUNK_SIZE,
    PackedWorldChunk,
    WorldChunkGenerationOptions
} from "./generateWorldChunk";
import { WORLD_WORKER_PROTOCOL_VERSION } from "./WorldDescriptor";
import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";
import {
    assertWorldVegetationLayout,
    WorldVegetationGenerationOptions,
    WorldVegetationLayout
} from "./generateVegetation";
import {
    assertWorldOverviewRaster,
    WorldOverviewGenerationOptions,
    WorldOverviewRaster
} from "./generateWorldOverview";

interface WorkerSuccessMessage {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: typeof WORLD_GENERATOR_VERSION;
    id: number;
    world?: MapInfo;
    chunk?: PackedWorldChunk;
    vegetation?: WorldVegetationLayout;
    overview?: WorldOverviewRaster;
}

interface WorkerFailureMessage {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: typeof WORLD_GENERATOR_VERSION;
    id: number;
    error: { name: string; message: string; stack?: string };
}

type WorkerResponse = WorkerSuccessMessage | WorkerFailureMessage;

interface PendingRequest {
    kind: "world" | "chunk" | "vegetation" | "overview";
    resolve(value: MapInfo | PackedWorldChunk | WorldVegetationLayout | WorldOverviewRaster): void;
    reject(error: Error): void;
    expectedChunk?: { chunkX: number; chunkY: number; chunkSize: number };
    expectedOverview?: WorldOverviewGenerationOptions;
}

//Small lifecycle-safe client for the dedicated world generator worker. The
//URL is explicit so libraries/bundlers retain control over asset placement.
export class WorldGeneratorClient {
    private readonly worker: Worker;
    private readonly pending = new Map<number, PendingRequest>();
    private nextRequestId = 1;
    private disposed = false;

    constructor(workerUrl: string | URL, workerOptions: WorkerOptions = { type: "module" }) {
        this.worker = new Worker(workerUrl, workerOptions);
        this.worker.addEventListener("message", this.handleMessage);
        this.worker.addEventListener("error", this.handleWorkerError);
        this.worker.addEventListener("messageerror", this.handleMessageError);
    }

    public generate(options: WorldGenerationOptions): Promise<MapInfo> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        const id = this.nextRequestId++;
        return new Promise<MapInfo>((resolve, reject) => {
            this.pending.set(id, { kind: "world", resolve: value => resolve(value as MapInfo), reject });
            try {
                this.worker.postMessage({
                    protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                    generatorVersion: WORLD_GENERATOR_VERSION,
                    id,
                    type: "world",
                    options
                });
            } catch (reason) {
                this.pending.delete(id);
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
        });
    }

    public generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        const id = this.nextRequestId++;
        return new Promise<PackedWorldChunk>((resolve, reject) => {
            this.pending.set(id, {
                kind: "chunk",
                resolve: value => resolve(value as PackedWorldChunk),
                reject,
                expectedChunk: {
                    chunkX: options.chunkX,
                    chunkY: options.chunkY,
                    chunkSize: options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE
                }
            });
            try {
                this.worker.postMessage({
                    protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                    generatorVersion: WORLD_GENERATOR_VERSION,
                    id,
                    type: "chunk",
                    options
                });
            } catch (reason) {
                this.pending.delete(id);
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
        });
    }

    public generateVegetation(options: WorldVegetationGenerationOptions): Promise<WorldVegetationLayout> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        const id = this.nextRequestId++;
        return new Promise<WorldVegetationLayout>((resolve, reject) => {
            this.pending.set(id, {
                kind: "vegetation",
                resolve: value => resolve(value as WorldVegetationLayout),
                reject
            });
            try {
                this.worker.postMessage({
                    protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                    generatorVersion: WORLD_GENERATOR_VERSION,
                    id,
                    type: "vegetation",
                    options
                });
            } catch (reason) {
                this.pending.delete(id);
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
        });
    }

    public generateOverview(options: WorldOverviewGenerationOptions): Promise<WorldOverviewRaster> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        const id = this.nextRequestId++;
        return new Promise<WorldOverviewRaster>((resolve, reject) => {
            this.pending.set(id, {
                kind: "overview",
                resolve: value => resolve(value as WorldOverviewRaster),
                reject,
                expectedOverview: { ...options }
            });
            try {
                this.worker.postMessage({
                    protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                    generatorVersion: WORLD_GENERATOR_VERSION,
                    id,
                    type: "overview",
                    options
                });
            } catch (reason) {
                this.pending.delete(id);
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.worker.removeEventListener("message", this.handleMessage);
        this.worker.removeEventListener("error", this.handleWorkerError);
        this.worker.removeEventListener("messageerror", this.handleMessageError);
        this.worker.terminate();
        const error = new Error("World generation worker was disposed");
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
    }

    private handleMessage = (event: MessageEvent<WorkerResponse>): void => {
        const data = event.data;
        if (!data || typeof data !== "object" || data.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION
            || data.generatorVersion !== WORLD_GENERATOR_VERSION
            || typeof data.id !== "number"
            || (!("world" in data) && !("chunk" in data) && !("vegetation" in data)
                && !("overview" in data) && !("error" in data))) {
            this.fail(new Error("World generation worker returned an invalid message"));
            return;
        }
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id);
        if (request.kind === "world" && "world" in data && data.world) {
            request.resolve(data.world);
            return;
        }
        if (request.kind === "chunk" && "chunk" in data && data.chunk) {
            try {
                assertPackedWorldChunk(data.chunk);
                if (!request.expectedChunk || data.chunk.chunkX !== request.expectedChunk.chunkX
                    || data.chunk.chunkY !== request.expectedChunk.chunkY
                    || data.chunk.chunkSize !== request.expectedChunk.chunkSize) {
                    throw new TypeError("World generation worker returned a chunk for the wrong request");
                }
                request.resolve(data.chunk);
            } catch (reason) {
                request.reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
            return;
        }
        if (request.kind === "vegetation" && "vegetation" in data && data.vegetation) {
            try {
                assertWorldVegetationLayout(data.vegetation);
                request.resolve(data.vegetation);
            } catch (reason) {
                request.reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
            return;
        }
        if (request.kind === "overview" && "overview" in data && data.overview) {
            try {
                assertWorldOverviewRaster(data.overview);
                const expected = request.expectedOverview;
                if (!expected || data.overview.originX !== expected.originX
                    || data.overview.originY !== expected.originY
                    || data.overview.tileSpanX !== expected.tileSpanX
                    || data.overview.tileSpanY !== expected.tileSpanY
                    || data.overview.pixelWidth !== expected.pixelWidth
                    || data.overview.pixelHeight !== expected.pixelHeight) {
                    throw new TypeError("World generation worker returned an overview for the wrong request");
                }
                request.resolve(data.overview);
            } catch (reason) {
                request.reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
            return;
        }
        if (!("error" in data)) {
            request.reject(new Error(`World generation worker returned the wrong response type for ${request.kind}`));
            return;
        }
        const remote = data.error;
        if (!remote || typeof remote.message !== "string" || typeof remote.name !== "string") {
            const error = new Error("World generation worker returned an invalid error");
            request.reject(error);
            this.fail(error);
            return;
        }
        const error = new Error(remote.message);
        error.name = remote.name;
        if (remote.stack) error.stack = remote.stack;
        request.reject(error);
    };

    private handleWorkerError = (event: ErrorEvent): void => {
        const error = event.error instanceof Error ? event.error : new Error(event.message);
        this.fail(error);
    };

    private handleMessageError = (): void => {
        this.fail(new Error("World generation worker returned an unreadable message"));
    };

    private fail(error: Error): void {
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
        this.dispose();
    }

    public get isDisposed(): boolean {
        return this.disposed;
    }
}
