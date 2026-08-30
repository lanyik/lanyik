import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";
import { WORLD_WORKER_PROTOCOL_VERSION } from "./WorldWorkerProtocol";
import {
    assertBaseSemanticChunk,
    BaseSemanticChunk
} from "./semantic/BaseSemanticChunk";
import { BaseSemanticChunkGenerationOptions } from "./semantic/generateBaseSemanticChunk";
import {
    assertTransferableEffectiveWindow,
    effectiveSurfaceWindowTransferables,
    TransferableEffectiveWindow
} from "./semantic/EffectiveSurfaceWindow";
import { HydrologyRegion, assertHydrologyRegion } from "./semantic/HydrologyRegion";
import { HydrologyRegionGenerationOptions } from "./semantic/generateHydrologyRegion";
import {
    SURFACE_COMPILE_PROFILE_VERSION,
    SURFACE_COMPILER_REVISION
} from "./semantic/SurfaceCompileProfile";
import { assertCompiledSurfaceChunk } from "./semantic/SurfaceCompiler";
import {
    cloneSurfaceDependencyKey,
    SurfaceDependencyKey,
    surfaceDependencyKeysEqual
} from "./semantic/SurfaceDependency";
import {
    SurfaceWorkerCompilation,
    SurfaceWorkerCompilationError
} from "./semantic/SurfaceWorkerProtocol";
import {
    canonicalizeHydrologyRegionKey,
    canonicalizeSemanticChunkKey
} from "./semantic/WorldDescriptorV2";

type RequestKind = "semantic" | "hydrology" | "surface";

interface PendingRequest {
    readonly kind: RequestKind;
    readonly resolve: (value: BaseSemanticChunk | HydrologyRegion | SurfaceWorkerCompilation) => void;
    readonly reject: (error: Error) => void;
    readonly semanticKey?: Readonly<{ chunkX: number; chunkY: number }>;
    readonly hydrologyKey?: Readonly<{ regionX: number; regionY: number }>;
    readonly dependencyKey?: SurfaceDependencyKey;
    readonly windowBufferByteLengths?: readonly number[];
}

interface WorkerMessage {
    readonly protocolVersion: number;
    readonly generatorVersion?: number;
    readonly compilerRevision?: number;
    readonly compileProfileVersion?: number;
    readonly id: number;
    readonly type?: "compileSurfaceChunk" | "compileSurfaceChunkError";
    readonly semanticChunk?: BaseSemanticChunk;
    readonly hydrologyRegion?: HydrologyRegion;
    readonly surfaceChunk?: import("./semantic/SurfaceCompiler").CompiledSurfaceChunk;
    readonly reclaimedWindowBuffers?: readonly ArrayBuffer[];
    readonly error?: Readonly<{ name: string; message: string; stack?: string }>;
}

function asError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

function reclaimedBuffers(
    value: readonly ArrayBuffer[] | undefined,
    byteLengths: readonly number[] | undefined
): readonly ArrayBuffer[] {
    if (!Array.isArray(value) || !byteLengths || value.length !== byteLengths.length
        || value.some((buffer, index) => !(buffer instanceof ArrayBuffer)
            || buffer.byteLength !== byteLengths[index])
        || new Set(value).size !== value.length) {
        throw new TypeError("surface worker returned invalid reclaimed window buffers");
    }
    return Object.freeze([...value]);
}

export class WorldSurfaceWorkerClient {
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

    public generateSemanticChunk(options: BaseSemanticChunkGenerationOptions): Promise<BaseSemanticChunk> {
        const key = canonicalizeSemanticChunkKey(options.descriptor, options.key);
        return this.request("semantic", { semanticKey: key }, {
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION,
            type: "generateSemanticChunk",
            options
        }) as Promise<BaseSemanticChunk>;
    }

    public generateHydrologyRegion(options: HydrologyRegionGenerationOptions): Promise<HydrologyRegion> {
        const key = canonicalizeHydrologyRegionKey(options.descriptor, options.key);
        return this.request("hydrology", { hydrologyKey: key }, {
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION,
            type: "generateHydrologyRegion",
            options
        }) as Promise<HydrologyRegion>;
    }

    public compileSurfaceChunk(window: TransferableEffectiveWindow): Promise<SurfaceWorkerCompilation> {
        this.assertReady();
        assertTransferableEffectiveWindow(window);
        const transferables = effectiveSurfaceWindowTransferables(window);
        return this.request("surface", {
            dependencyKey: cloneSurfaceDependencyKey(window.dependencyKey),
            windowBufferByteLengths: Object.freeze(transferables.map(buffer => buffer.byteLength))
        }, {
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            compilerRevision: SURFACE_COMPILER_REVISION,
            compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
            type: "compileSurfaceChunk",
            effectiveWindow: window
        }, transferables) as Promise<SurfaceWorkerCompilation>;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.worker.removeEventListener("message", this.handleMessage);
        this.worker.removeEventListener("error", this.handleWorkerError);
        this.worker.removeEventListener("messageerror", this.handleMessageError);
        this.worker.terminate();
        this.failPending(new Error("WorldSurfaceWorkerClient has been disposed"));
    }

    public get isDisposed(): boolean { return this.disposed; }

    private request(
        kind: RequestKind,
        expected: Omit<PendingRequest, "kind" | "resolve" | "reject">,
        message: Record<string, unknown>,
        transferables: readonly Transferable[] = []
    ): Promise<BaseSemanticChunk | HydrologyRegion | SurfaceWorkerCompilation> {
        this.assertReady();
        if (this.nextRequestId > Number.MAX_SAFE_INTEGER) {
            return Promise.reject(new RangeError("surface worker request identity space is exhausted"));
        }
        const id = this.nextRequestId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { kind, resolve, reject, ...expected });
            try {
                this.worker.postMessage({ ...message, id }, [...transferables]);
            } catch (reason) {
                this.pending.delete(id);
                reject(asError(reason));
            }
        });
    }

    private readonly handleMessage = (event: MessageEvent<WorkerMessage>): void => {
        const data = event.data;
        if (!data || typeof data !== "object" || data.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION
            || !Number.isSafeInteger(data.id)) {
            this.fail(new TypeError("surface worker returned an invalid protocol envelope"));
            return;
        }
        const pending = this.pending.get(data.id);
        if (!pending) return;
        try {
            if (pending.kind === "surface") this.acceptSurface(pending, data);
            else this.acceptAuthority(pending, data);
            this.pending.delete(data.id);
        } catch (reason) {
            this.pending.delete(data.id);
            pending.reject(asError(reason));
        }
    };

    private acceptAuthority(pending: PendingRequest, data: WorkerMessage): void {
        if (data.generatorVersion !== WORLD_GENERATOR_VERSION) {
            throw new TypeError("surface worker generator identity mismatch");
        }
        if (data.error) return this.rejectRemote(pending, data.error);
        if (pending.kind === "semantic" && data.semanticChunk) {
            assertBaseSemanticChunk(data.semanticChunk);
            if (data.semanticChunk.key.chunkX !== pending.semanticKey?.chunkX
                || data.semanticChunk.key.chunkY !== pending.semanticKey?.chunkY) {
                throw new TypeError("surface worker returned a semantic chunk for another request");
            }
            pending.resolve(data.semanticChunk);
            return;
        }
        if (pending.kind === "hydrology" && data.hydrologyRegion) {
            assertHydrologyRegion(data.hydrologyRegion);
            if (data.hydrologyRegion.key.regionX !== pending.hydrologyKey?.regionX
                || data.hydrologyRegion.key.regionY !== pending.hydrologyKey?.regionY) {
                throw new TypeError("surface worker returned a hydrology region for another request");
            }
            pending.resolve(data.hydrologyRegion);
            return;
        }
        throw new TypeError(`surface worker returned the wrong ${pending.kind} response`);
    }

    private acceptSurface(pending: PendingRequest, data: WorkerMessage): void {
        if (data.compilerRevision !== SURFACE_COMPILER_REVISION
            || data.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION) {
            throw new TypeError("surface worker compiler identity mismatch");
        }
        if (data.error) {
            const error = new SurfaceWorkerCompilationError(
                data.error.message,
                reclaimedBuffers(data.reclaimedWindowBuffers, pending.windowBufferByteLengths)
            );
            error.name = data.error.name;
            if (data.error.stack) error.stack = data.error.stack;
            pending.reject(error);
            return;
        }
        if (data.type !== "compileSurfaceChunk" || !data.surfaceChunk) {
            throw new TypeError("surface worker returned the wrong compilation response");
        }
        assertCompiledSurfaceChunk(data.surfaceChunk);
        if (!pending.dependencyKey
            || !surfaceDependencyKeysEqual(data.surfaceChunk.dependencyKey, pending.dependencyKey)) {
            throw new TypeError("surface worker returned a chunk for another dependency");
        }
        pending.resolve(Object.freeze({
            chunk: data.surfaceChunk,
            reclaimedWindowBuffers: reclaimedBuffers(
                data.reclaimedWindowBuffers,
                pending.windowBufferByteLengths
            )
        }));
    }

    private rejectRemote(pending: PendingRequest, remote: NonNullable<WorkerMessage["error"]>): void {
        if (typeof remote.name !== "string" || typeof remote.message !== "string") {
            throw new TypeError("surface worker returned an invalid error payload");
        }
        const error = new Error(remote.message);
        error.name = remote.name;
        if (remote.stack) error.stack = remote.stack;
        pending.reject(error);
    }

    private readonly handleWorkerError = (event: ErrorEvent): void => {
        this.fail(event.error instanceof Error ? event.error : new Error(event.message));
    };

    private readonly handleMessageError = (): void => {
        this.fail(new Error("surface worker returned an unreadable message"));
    };

    private fail(error: Error): void {
        this.failPending(error);
        this.dispose();
    }

    private failPending(error: Error): void {
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
    }

    private assertReady(): void {
        if (this.disposed) throw new Error("WorldSurfaceWorkerClient has been disposed");
    }
}
