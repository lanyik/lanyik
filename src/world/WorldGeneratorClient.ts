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
    assertBaseSemanticChunk,
    BaseSemanticChunk
} from "./semantic/BaseSemanticChunk";
import { BaseSemanticChunkGenerationOptions } from "./semantic/generateBaseSemanticChunk";
import {
    WORLD_SURFACE_V2_GENERATOR_VERSION
} from "./semantic/WorldSemanticFormat";
import { canonicalizeSemanticChunkKey } from "./semantic/WorldDescriptorV2";

interface WorkerSuccessMessage {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: number;
    id: number;
    world?: MapInfo;
    chunk?: PackedWorldChunk;
    vegetation?: WorldVegetationLayout;
    semanticChunk?: BaseSemanticChunk;
}

interface WorkerFailureMessage {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: number;
    id: number;
    error: { name: string; message: string; stack?: string };
}

type WorkerResponse = WorkerSuccessMessage | WorkerFailureMessage;

interface PendingRequest {
    kind: "world" | "chunk" | "vegetation" | "semantic-chunk";
    resolve(value: MapInfo | PackedWorldChunk | WorldVegetationLayout | BaseSemanticChunk): void;
    reject(error: Error): void;
    expectedGeneratorVersion: number;
    expectedChunk?: { chunkX: number; chunkY: number; chunkSize: number };
    expectedSemanticChunk?: { chunkX: number; chunkY: number };
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
            this.pending.set(id, {
                kind: "world",
                resolve: value => resolve(value as MapInfo),
                reject,
                expectedGeneratorVersion: WORLD_GENERATOR_VERSION
            });
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
                expectedGeneratorVersion: WORLD_GENERATOR_VERSION,
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
                reject,
                expectedGeneratorVersion: WORLD_GENERATOR_VERSION
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

    public generateSemanticChunk(options: BaseSemanticChunkGenerationOptions): Promise<BaseSemanticChunk> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        const expectedKey = canonicalizeSemanticChunkKey(options.descriptor, options.key);
        const id = this.nextRequestId++;
        return new Promise<BaseSemanticChunk>((resolve, reject) => {
            this.pending.set(id, {
                kind: "semantic-chunk",
                resolve: value => resolve(value as BaseSemanticChunk),
                reject,
                expectedGeneratorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
                expectedSemanticChunk: expectedKey
            });
            try {
                this.worker.postMessage({
                    protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                    generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
                    id,
                    type: "generateSemanticChunk",
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
            || !Number.isSafeInteger(data.generatorVersion)
            || typeof data.id !== "number"
            || (!("world" in data) && !("chunk" in data) && !("vegetation" in data)
                && !("semanticChunk" in data) && !("error" in data))) {
            this.fail(new Error("World generation worker returned an invalid message"));
            return;
        }
        const request = this.pending.get(data.id);
        if (!request) return;
        if (data.generatorVersion !== request.expectedGeneratorVersion) {
            this.fail(new Error("World generation worker returned an invalid message: generator identity mismatch"));
            return;
        }
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
        if (request.kind === "semantic-chunk" && "semanticChunk" in data && data.semanticChunk) {
            try {
                assertBaseSemanticChunk(data.semanticChunk);
                if (!request.expectedSemanticChunk
                    || data.semanticChunk.key.chunkX !== request.expectedSemanticChunk.chunkX
                    || data.semanticChunk.key.chunkY !== request.expectedSemanticChunk.chunkY) {
                    throw new TypeError("World generation worker returned a semantic chunk for the wrong request");
                }
                request.resolve(data.semanticChunk);
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
