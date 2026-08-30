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
import {
    canonicalizeHydrologyRegionKey,
    canonicalizeSemanticChunkKey
} from "./semantic/WorldDescriptorV2";
import { assertHydrologyRegion, HydrologyRegion } from "./semantic/HydrologyRegion";
import { HydrologyRegionGenerationOptions } from "./semantic/generateHydrologyRegion";
import {
    assertTransferableEffectiveWindow,
    effectiveSurfaceWindowTransferables,
    TransferableEffectiveWindow
} from "./semantic/EffectiveSurfaceWindow";
import {
    assertCompiledSurfaceChunk,
    CompiledSurfaceChunk
} from "./semantic/SurfaceCompiler";
import {
    cloneSurfaceDependencyKey,
    SurfaceDependencyKey,
    surfaceDependencyKeysEqual
} from "./semantic/SurfaceDependency";
import {
    SURFACE_COMPILE_PROFILE_VERSION,
    SURFACE_COMPILER_REVISION
} from "./semantic/SurfaceCompileProfile";

export interface SurfaceWorkerCompilation {
    readonly chunk: CompiledSurfaceChunk;
    readonly reclaimedWindowBuffers: readonly ArrayBuffer[];
}

export class SurfaceWorkerCompilationError extends Error {
    constructor(
        message: string,
        public readonly reclaimedWindowBuffers: readonly ArrayBuffer[]
    ) {
        super(message);
        this.name = "SurfaceWorkerCompilationError";
    }
}

interface WorkerSuccessMessage {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion?: number;
    id: number;
    world?: MapInfo;
    chunk?: PackedWorldChunk;
    vegetation?: WorldVegetationLayout;
    semanticChunk?: BaseSemanticChunk;
    hydrologyRegion?: HydrologyRegion;
    compilerRevision?: number;
    compileProfileVersion?: number;
    type?: "compileSurfaceChunk";
    surfaceChunk?: CompiledSurfaceChunk;
    reclaimedWindowBuffers?: readonly ArrayBuffer[];
}

interface GeneratorWorkerFailureMessage {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: number;
    id: number;
    error: { name: string; message: string; stack?: string };
}

interface SurfaceWorkerFailureMessage {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    compilerRevision: number;
    compileProfileVersion: number;
    id: number;
    type: "compileSurfaceChunkError";
    reclaimedWindowBuffers: readonly ArrayBuffer[];
    error: { name: string; message: string; stack?: string };
}

type WorkerResponse = WorkerSuccessMessage | GeneratorWorkerFailureMessage | SurfaceWorkerFailureMessage;

interface PendingRequest {
    kind: "world" | "chunk" | "vegetation" | "semantic-chunk" | "hydrology-region"
        | "surface-chunk";
    resolve(value: MapInfo | PackedWorldChunk | WorldVegetationLayout | BaseSemanticChunk
        | HydrologyRegion | SurfaceWorkerCompilation): void;
    reject(error: Error): void;
    expectedGeneratorVersion?: number;
    expectedCompilerRevision?: number;
    expectedCompileProfileVersion?: number;
    expectedChunk?: { chunkX: number; chunkY: number; chunkSize: number };
    expectedSemanticChunk?: { chunkX: number; chunkY: number };
    expectedHydrologyRegion?: { regionX: number; regionY: number };
    expectedSurfaceDependency?: SurfaceDependencyKey;
    expectedWindowBufferByteLengths?: readonly number[];
}

function assertReclaimedWindowBuffers(
    value: readonly ArrayBuffer[] | undefined,
    expectedByteLengths: readonly number[] | undefined
): readonly ArrayBuffer[] {
    if (!Array.isArray(value) || !expectedByteLengths || value.length !== expectedByteLengths.length
        || value.some((buffer, index) => !(buffer instanceof ArrayBuffer)
            || buffer.byteLength !== expectedByteLengths[index])
        || new Set(value).size !== value.length) {
        throw new TypeError("World generation worker returned invalid reclaimed surface window buffers");
    }
    return Object.freeze([...value]);
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

    public generateHydrologyRegion(options: HydrologyRegionGenerationOptions): Promise<HydrologyRegion> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        const expectedKey = canonicalizeHydrologyRegionKey(options.descriptor, options.key);
        const id = this.nextRequestId++;
        return new Promise<HydrologyRegion>((resolve, reject) => {
            this.pending.set(id, {
                kind: "hydrology-region",
                resolve: value => resolve(value as HydrologyRegion),
                reject,
                expectedGeneratorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
                expectedHydrologyRegion: expectedKey
            });
            try {
                this.worker.postMessage({
                    protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                    generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
                    id,
                    type: "generateHydrologyRegion",
                    options
                });
            } catch (reason) {
                this.pending.delete(id);
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
        });
    }

    public compileSurfaceChunk(effectiveWindow: TransferableEffectiveWindow): Promise<SurfaceWorkerCompilation> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        assertTransferableEffectiveWindow(effectiveWindow);
        const transferables = effectiveSurfaceWindowTransferables(effectiveWindow);
        const expectedWindowBufferByteLengths = Object.freeze(transferables.map(buffer => buffer.byteLength));
        const id = this.nextRequestId++;
        return new Promise<SurfaceWorkerCompilation>((resolve, reject) => {
            this.pending.set(id, {
                kind: "surface-chunk",
                resolve: value => resolve(value as SurfaceWorkerCompilation),
                reject,
                expectedCompilerRevision: SURFACE_COMPILER_REVISION,
                expectedCompileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
                expectedSurfaceDependency: cloneSurfaceDependencyKey(effectiveWindow.dependencyKey),
                expectedWindowBufferByteLengths
            });
            try {
                this.worker.postMessage({
                    protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                    compilerRevision: SURFACE_COMPILER_REVISION,
                    compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
                    id,
                    type: "compileSurfaceChunk",
                    effectiveWindow
                }, [...transferables]);
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
            || !Number.isSafeInteger(data.id)
            || (!("world" in data) && !("chunk" in data) && !("vegetation" in data)
                && !("semanticChunk" in data) && !("hydrologyRegion" in data)
                && !("surfaceChunk" in data) && !("error" in data))) {
            this.fail(new Error("World generation worker returned an invalid message"));
            return;
        }
        const request = this.pending.get(data.id);
        if (!request) return;
        if (request.kind === "surface-chunk") {
            if (!("compilerRevision" in data) || !("compileProfileVersion" in data)
                || data.compilerRevision !== request.expectedCompilerRevision
                || data.compileProfileVersion !== request.expectedCompileProfileVersion
                || ("error" in data && data.type !== "compileSurfaceChunkError")
                || (!("error" in data) && data.type !== "compileSurfaceChunk")) {
                this.fail(new Error("World generation worker returned an invalid message: compiler identity mismatch"));
                return;
            }
        } else {
            if (!("generatorVersion" in data) || !Number.isSafeInteger(data.generatorVersion)
                || data.generatorVersion !== request.expectedGeneratorVersion) {
                this.fail(new Error("World generation worker returned an invalid message: generator identity mismatch"));
                return;
            }
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
        if (request.kind === "hydrology-region" && "hydrologyRegion" in data && data.hydrologyRegion) {
            try {
                assertHydrologyRegion(data.hydrologyRegion);
                if (!request.expectedHydrologyRegion
                    || data.hydrologyRegion.key.regionX !== request.expectedHydrologyRegion.regionX
                    || data.hydrologyRegion.key.regionY !== request.expectedHydrologyRegion.regionY) {
                    throw new TypeError("World generation worker returned a hydrology region for the wrong request");
                }
                request.resolve(data.hydrologyRegion);
            } catch (reason) {
                request.reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
            return;
        }
        if (request.kind === "surface-chunk" && "surfaceChunk" in data && data.surfaceChunk
            && data.type === "compileSurfaceChunk") {
            try {
                assertCompiledSurfaceChunk(data.surfaceChunk);
                if (!request.expectedSurfaceDependency
                    || !surfaceDependencyKeysEqual(
                        data.surfaceChunk.dependencyKey,
                        request.expectedSurfaceDependency
                    )) {
                    throw new TypeError("World generation worker returned a surface chunk for the wrong request");
                }
                const reclaimedWindowBuffers = assertReclaimedWindowBuffers(
                    data.reclaimedWindowBuffers,
                    request.expectedWindowBufferByteLengths
                );
                request.resolve(Object.freeze({
                    chunk: data.surfaceChunk,
                    reclaimedWindowBuffers
                }));
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
        let error: Error;
        try {
            error = request.kind === "surface-chunk"
                ? new SurfaceWorkerCompilationError(
                    remote.message,
                    assertReclaimedWindowBuffers(
                        "reclaimedWindowBuffers" in data ? data.reclaimedWindowBuffers : undefined,
                        request.expectedWindowBufferByteLengths
                    )
                )
                : new Error(remote.message);
        } catch (reason) {
            request.reject(reason instanceof Error ? reason : new Error(String(reason)));
            return;
        }
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
