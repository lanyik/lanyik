import {
    BaseSemanticChunk,
    SemanticChunkKey,
    createBaseSemanticChunk,
    semanticCatalogLimits
} from "./BaseSemanticChunk";
import {
    GenerateSemanticChunkWorkerResult,
    SURFACE_WORKER_PROTOCOL_VERSION,
    SurfaceWorkerFailure,
    SurfaceWorkerResponse,
    createGenerateSemanticChunkWorkerRequest
} from "./SurfaceWorkerProtocol";
import {
    WORLD_GENERATOR_VERSION_V2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";

export interface GenerateSemanticChunkOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly key: SemanticChunkKey;
}

interface PendingSemanticRequest {
    readonly descriptor: WorldDescriptorV2;
    readonly key: SemanticChunkKey;
    readonly resolve: (chunk: BaseSemanticChunk) => void;
    readonly reject: (error: Error) => void;
}

function remoteError(response: SurfaceWorkerFailure): Error {
    if (!response.error || typeof response.error.name !== "string"
        || typeof response.error.message !== "string") {
        return new Error("surface worker returned an invalid remote error");
    }
    const error = new Error(response.error.message);
    error.name = response.error.name;
    if (typeof response.error.stack === "string") error.stack = response.error.stack;
    return error;
}

function assertResponseEnvelope(value: unknown): asserts value is SurfaceWorkerResponse {
    if (!value || typeof value !== "object") throw new TypeError("surface worker response must be an object");
    const response = value as Partial<SurfaceWorkerResponse>;
    if (response.protocolVersion !== SURFACE_WORKER_PROTOCOL_VERSION
        || response.generatorVersion !== WORLD_GENERATOR_VERSION_V2
        || !Number.isSafeInteger(response.requestId) || (response.requestId as number) <= 0
        || (response.type !== "generateSemanticChunkResult" && response.type !== "surfaceWorkerError")) {
        throw new TypeError("surface worker response envelope is invalid or unsupported");
    }
}

export class SurfaceWorkerClient {
    private readonly worker: Worker;
    private readonly pending = new Map<number, PendingSemanticRequest>();
    private nextRequestId = 1;
    private disposed = false;

    constructor(workerUrl: string | URL, workerOptions: WorkerOptions = { type: "module" }) {
        this.worker = new Worker(workerUrl, workerOptions);
        this.worker.addEventListener("message", this.handleMessage);
        this.worker.addEventListener("error", this.handleWorkerError);
        this.worker.addEventListener("messageerror", this.handleMessageError);
    }

    public generateSemanticChunk(options: Readonly<GenerateSemanticChunkOptions>): Promise<BaseSemanticChunk> {
        if (this.disposed) return Promise.reject(new Error("SurfaceWorkerClient has been disposed"));
        if (!options || typeof options !== "object") {
            return Promise.reject(new TypeError("semantic chunk worker options are required"));
        }
        if (!Number.isSafeInteger(this.nextRequestId)) {
            return Promise.reject(new RangeError("surface worker request id space is exhausted"));
        }
        const requestId = this.nextRequestId;
        let request;
        try {
            request = createGenerateSemanticChunkWorkerRequest(requestId, options.descriptor, options.key);
        } catch (reason) {
            return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
        this.nextRequestId += 1;
        return new Promise<BaseSemanticChunk>((resolve, reject) => {
            this.pending.set(requestId, {
                descriptor: options.descriptor,
                key: Object.freeze({ chunkX: options.key.chunkX, chunkY: options.key.chunkY }),
                resolve,
                reject
            });
            try {
                this.worker.postMessage(request);
            } catch (reason) {
                this.pending.delete(requestId);
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
        const error = new Error("surface worker was disposed");
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
    }

    public get isDisposed(): boolean {
        return this.disposed;
    }

    private handleMessage = (event: MessageEvent<unknown>): void => {
        try {
            assertResponseEnvelope(event.data);
            const response = event.data;
            const request = this.pending.get(response.requestId as number);
            if (!request) throw new Error("surface worker returned an unknown request id");
            if (response.type === "surfaceWorkerError") {
                if (response.requestType !== "generateSemanticChunk") {
                    throw new TypeError("surface worker error does not match its pending request type");
                }
                this.pending.delete(response.requestId as number);
                request.reject(remoteError(response));
                return;
            }
            const chunk = this.publishChunk(response, request);
            this.pending.delete(response.requestId);
            request.resolve(chunk);
        } catch (reason) {
            this.fail(reason instanceof Error ? reason : new Error(String(reason)));
        }
    };

    private publishChunk(
        response: GenerateSemanticChunkWorkerResult,
        request: PendingSemanticRequest
    ): BaseSemanticChunk {
        if (!response.chunk || response.chunk.key?.chunkX !== request.key.chunkX
            || response.chunk.key?.chunkY !== request.key.chunkY) {
            throw new TypeError("surface worker returned a semantic chunk for the wrong request");
        }
        return createBaseSemanticChunk({
            key: response.chunk.key,
            revision: response.chunk.revision,
            validBounds: response.chunk.validBounds,
            substrateClass: response.chunk.substrateClass,
            macroHeight: response.chunk.macroHeight,
            biomeWeights: response.chunk.biomeWeights,
            climate: response.chunk.climate,
            vegetationDensity: response.chunk.vegetationDensity,
            vegetationProfile: response.chunk.vegetationProfile
        }, semanticCatalogLimits(request.descriptor));
    }

    private handleWorkerError = (event: ErrorEvent): void => {
        this.fail(event.error instanceof Error ? event.error : new Error(event.message));
    };

    private handleMessageError = (): void => {
        this.fail(new Error("surface worker returned an unreadable message"));
    };

    private fail(error: Error): void {
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
        this.dispose();
    }
}
