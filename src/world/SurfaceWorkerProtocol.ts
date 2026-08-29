import {
    BaseSemanticChunk,
    SemanticChunkKey
} from "./BaseSemanticChunk";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";
import {
    InfiniteWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    WORLD_GENERATOR_VERSION_V2,
    WorldDescriptorV2,
    assertWorldDescriptorV2
} from "./WorldDescriptorV2";

export const SURFACE_WORKER_PROTOCOL_VERSION = 3;

export type ProceduralWorldDescriptorV2 = InfiniteWorldDescriptorV2 | ToroidalWorldDescriptorV2;

export interface GenerateSemanticChunkWorkerRequest {
    readonly protocolVersion: typeof SURFACE_WORKER_PROTOCOL_VERSION;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION_V2;
    readonly requestId: number;
    readonly type: "generateSemanticChunk";
    readonly descriptor: ProceduralWorldDescriptorV2;
    readonly key: SemanticChunkKey;
}

export type SurfaceWorkerRequest = GenerateSemanticChunkWorkerRequest;

export interface GenerateSemanticChunkWorkerResult {
    readonly protocolVersion: typeof SURFACE_WORKER_PROTOCOL_VERSION;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION_V2;
    readonly requestId: number;
    readonly type: "generateSemanticChunkResult";
    readonly chunk: BaseSemanticChunk;
}

export interface SurfaceWorkerFailure {
    readonly protocolVersion: typeof SURFACE_WORKER_PROTOCOL_VERSION;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION_V2;
    readonly requestId: number | null;
    readonly type: "surfaceWorkerError";
    readonly requestType: SurfaceWorkerRequest["type"] | null;
    readonly error: {
        readonly name: string;
        readonly message: string;
        readonly stack?: string;
    };
}

export type SurfaceWorkerResponse = GenerateSemanticChunkWorkerResult | SurfaceWorkerFailure;

export function assertGenerateSemanticChunkWorkerRequest(
    value: unknown
): asserts value is GenerateSemanticChunkWorkerRequest {
    if (!value || typeof value !== "object") throw new TypeError("surface worker request must be an object");
    const request = value as Partial<GenerateSemanticChunkWorkerRequest>;
    if (request.protocolVersion !== SURFACE_WORKER_PROTOCOL_VERSION
        || request.generatorVersion !== WORLD_GENERATOR_VERSION_V2
        || !Number.isSafeInteger(request.requestId) || (request.requestId as number) <= 0
        || request.type !== "generateSemanticChunk") {
        throw new TypeError("surface worker request envelope is invalid or unsupported");
    }
    const descriptor = request.descriptor as WorldDescriptorV2;
    assertWorldDescriptorV2(descriptor);
    if (descriptor.sourceKind === "static") {
        throw new TypeError("generateSemanticChunk requires a procedural world descriptor");
    }
    if (!request.key || !Number.isSafeInteger(request.key.chunkX)
        || !Number.isSafeInteger(request.key.chunkY)) {
        throw new RangeError("surface worker semantic chunk key must use safe integers");
    }
    chunkOrigin(request.key.chunkX, request.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
}

export function createGenerateSemanticChunkWorkerRequest(
    requestId: number,
    descriptor: WorldDescriptorV2,
    key: Readonly<SemanticChunkKey>
): GenerateSemanticChunkWorkerRequest {
    const request = {
        protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION_V2,
        requestId,
        type: "generateSemanticChunk" as const,
        descriptor,
        key: Object.freeze({ chunkX: key.chunkX, chunkY: key.chunkY })
    };
    assertGenerateSemanticChunkWorkerRequest(request);
    return Object.freeze(request);
}

export function semanticChunkTransferables(chunk: Readonly<BaseSemanticChunk>): Transferable[] {
    const buffers = [
        chunk.substrateClass.buffer,
        chunk.macroHeight.buffer,
        chunk.biomeWeights.buffer,
        chunk.climate.buffer,
        chunk.vegetationDensity.buffer,
        chunk.vegetationProfile.buffer
    ];
    const unique = new Set<ArrayBuffer>();
    for (const buffer of buffers) {
        if (!(buffer instanceof ArrayBuffer)) {
            throw new TypeError("surface worker semantic arrays must own transferable ArrayBuffers");
        }
        unique.add(buffer);
    }
    return [...unique];
}

export function serializeSurfaceWorkerError(reason: unknown): SurfaceWorkerFailure["error"] {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    return Object.freeze({
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {})
    });
}
