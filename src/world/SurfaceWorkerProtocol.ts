import {
    BaseSemanticChunk,
    SemanticChunkKey
} from "./BaseSemanticChunk";
import {
    HydrologyRegion,
    HydrologyRegionKey
} from "./HydrologyRegion";
import {
    HYDROLOGY_REGION_SIZE,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";
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

export interface GenerateHydrologyRegionWorkerRequest {
    readonly protocolVersion: typeof SURFACE_WORKER_PROTOCOL_VERSION;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION_V2;
    readonly requestId: number;
    readonly type: "generateHydrologyRegion";
    readonly descriptor: ProceduralWorldDescriptorV2;
    readonly key: HydrologyRegionKey;
}

export type SurfaceWorkerRequest = GenerateSemanticChunkWorkerRequest
    | GenerateHydrologyRegionWorkerRequest;

export interface GenerateSemanticChunkWorkerResult {
    readonly protocolVersion: typeof SURFACE_WORKER_PROTOCOL_VERSION;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION_V2;
    readonly requestId: number;
    readonly type: "generateSemanticChunkResult";
    readonly chunk: BaseSemanticChunk;
}

export interface GenerateHydrologyRegionWorkerResult {
    readonly protocolVersion: typeof SURFACE_WORKER_PROTOCOL_VERSION;
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION_V2;
    readonly requestId: number;
    readonly type: "generateHydrologyRegionResult";
    readonly region: HydrologyRegion;
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

export type SurfaceWorkerResponse = GenerateSemanticChunkWorkerResult
    | GenerateHydrologyRegionWorkerResult
    | SurfaceWorkerFailure;

function assertWorkerRequestEnvelope(value: unknown, expectedType: SurfaceWorkerRequest["type"]): void {
    if (!value || typeof value !== "object") throw new TypeError("surface worker request must be an object");
    const request = value as Partial<SurfaceWorkerRequest>;
    if (request.protocolVersion !== SURFACE_WORKER_PROTOCOL_VERSION
        || request.generatorVersion !== WORLD_GENERATOR_VERSION_V2
        || !Number.isSafeInteger(request.requestId) || (request.requestId as number) <= 0
        || request.type !== expectedType) {
        throw new TypeError("surface worker request envelope is invalid or unsupported");
    }
}

function assertProceduralDescriptor(descriptor: unknown, taskType: SurfaceWorkerRequest["type"]): asserts descriptor is ProceduralWorldDescriptorV2 {
    assertWorldDescriptorV2(descriptor);
    if (descriptor.sourceKind === "static") {
        throw new TypeError(`${taskType} requires a procedural world descriptor`);
    }
}

export function assertGenerateSemanticChunkWorkerRequest(
    value: unknown
): asserts value is GenerateSemanticChunkWorkerRequest {
    assertWorkerRequestEnvelope(value, "generateSemanticChunk");
    const request = value as Partial<GenerateSemanticChunkWorkerRequest>;
    assertProceduralDescriptor(request.descriptor, "generateSemanticChunk");
    if (!request.key || !Number.isSafeInteger(request.key.chunkX)
        || !Number.isSafeInteger(request.key.chunkY)) {
        throw new RangeError("surface worker semantic chunk key must use safe integers");
    }
    chunkOrigin(request.key.chunkX, request.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
}

export function assertGenerateHydrologyRegionWorkerRequest(
    value: unknown
): asserts value is GenerateHydrologyRegionWorkerRequest {
    assertWorkerRequestEnvelope(value, "generateHydrologyRegion");
    const request = value as Partial<GenerateHydrologyRegionWorkerRequest>;
    assertProceduralDescriptor(request.descriptor, "generateHydrologyRegion");
    if (!request.key || !Number.isSafeInteger(request.key.regionX)
        || !Number.isSafeInteger(request.key.regionY)) {
        throw new RangeError("surface worker hydrology region key must use safe integers");
    }
    chunkOrigin(request.key.regionX, request.key.regionY, HYDROLOGY_REGION_SIZE);
    if (request.descriptor.sourceKind === "procedural-toroidal") {
        const regionCountX = Math.ceil(request.descriptor.width / HYDROLOGY_REGION_SIZE);
        const regionCountY = Math.ceil(request.descriptor.height / HYDROLOGY_REGION_SIZE);
        if (request.key.regionX < 0 || request.key.regionX >= regionCountX
            || request.key.regionY < 0 || request.key.regionY >= regionCountY) {
            throw new RangeError("surface worker toroidal hydrology key must be canonical and in-domain");
        }
    }
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

export function createGenerateHydrologyRegionWorkerRequest(
    requestId: number,
    descriptor: WorldDescriptorV2,
    key: Readonly<HydrologyRegionKey>
): GenerateHydrologyRegionWorkerRequest {
    const request = {
        protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION_V2,
        requestId,
        type: "generateHydrologyRegion" as const,
        descriptor,
        key: Object.freeze({ regionX: key.regionX, regionY: key.regionY })
    };
    assertGenerateHydrologyRegionWorkerRequest(request);
    return Object.freeze(request);
}

function transferableBuffer(buffer: ArrayBufferLike, name: string): ArrayBuffer {
    if (!(buffer instanceof ArrayBuffer)) {
        throw new TypeError(`surface worker ${name} must own a transferable ArrayBuffer`);
    }
    return buffer;
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
        unique.add(transferableBuffer(buffer, "semantic array"));
    }
    return [...unique];
}

export function hydrologyRegionTransferables(region: Readonly<HydrologyRegion>): Transferable[] {
    const unique = new Set<ArrayBuffer>();
    const add = (buffer: ArrayBufferLike): void => {
        unique.add(transferableBuffer(buffer, "hydrology array"));
    };
    for (const port of region.boundaryPorts) {
        add(port.point.buffer);
        add(port.flowDirection.buffer);
    }
    for (const river of region.rivers) {
        add(river.controlPoints.buffer);
        add(river.widthProfile.buffer);
        add(river.levelProfile.buffer);
    }
    for (const lake of region.lakes) add(lake.center.buffer);
    for (const mouth of region.mouths) add(mouth.point.buffer);
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
