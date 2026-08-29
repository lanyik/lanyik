import {
    BaseSemanticChunkGenerator,
    createBaseSemanticChunkGenerator
} from "./generateBaseSemanticChunk";
import {
    ProceduralHydrologyRegionGenerator,
    createProceduralHydrologyRegionGenerator
} from "./ProceduralHydrologyRegionGenerator";
import {
    SURFACE_WORKER_PROTOCOL_VERSION,
    SurfaceWorkerRequest,
    assertCompileSurfaceChunkWorkerRequest,
    assertGenerateHydrologyRegionWorkerRequest,
    assertGenerateSemanticChunkWorkerRequest,
    hydrologyRegionTransferables,
    semanticChunkTransferables,
    serializeSurfaceWorkerError
} from "./SurfaceWorkerProtocol";
import { compiledSurfaceChunkTransferables } from "./CompiledSurfaceChunk";
import { compileSurfaceChunk } from "./compileSurfaceChunk";
import {
    WORLD_GENERATOR_VERSION_V2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

const scope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

interface WorkerWorldContext {
    readonly identity: string;
    readonly semanticGenerator: BaseSemanticChunkGenerator;
    hydrologyGenerator?: ProceduralHydrologyRegionGenerator;
}

type GenerationWorkerRequest = Exclude<SurfaceWorkerRequest, { readonly type: "compileSurfaceChunk" }>;

let worldContext: WorkerWorldContext | undefined;

function contextFor(request: GenerationWorkerRequest): WorkerWorldContext {
    const identity = serializeWorldDescriptorV2(request.descriptor);
    if (!worldContext || worldContext.identity !== identity) {
        worldContext = {
            identity,
            semanticGenerator: createBaseSemanticChunkGenerator(request.descriptor)
        };
    }
    return worldContext;
}

function hydrologyGeneratorFor(request: GenerationWorkerRequest): ProceduralHydrologyRegionGenerator {
    const context = contextFor(request);
    if (!context.hydrologyGenerator) {
        context.hydrologyGenerator = createProceduralHydrologyRegionGenerator({
            descriptor: request.descriptor
        });
    }
    return context.hydrologyGenerator;
}

function recoverRequestId(value: unknown): number | null {
    if (!value || typeof value !== "object") return null;
    const requestId = (value as { requestId?: unknown }).requestId;
    return Number.isSafeInteger(requestId) && (requestId as number) > 0 ? requestId as number : null;
}

function recoverRequestType(value: unknown): SurfaceWorkerRequest["type"] | null {
    if (!value || typeof value !== "object") return null;
    const type = (value as { type?: unknown }).type;
    return type === "generateSemanticChunk" || type === "generateHydrologyRegion"
        || type === "compileSurfaceChunk" ? type : null;
}

async function handleRequest(value: unknown): Promise<void> {
    try {
        if ((value as { type?: unknown } | null)?.type === "compileSurfaceChunk") {
            assertCompileSurfaceChunkWorkerRequest(value);
            const chunk = compileSurfaceChunk(value.effectiveWindow);
            scope.postMessage({
                protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION_V2,
                requestId: value.requestId,
                type: "compileSurfaceChunkResult",
                requestToken: value.requestToken,
                chunk
            }, [...compiledSurfaceChunkTransferables(chunk)]);
        } else if ((value as { type?: unknown } | null)?.type === "generateHydrologyRegion") {
            assertGenerateHydrologyRegionWorkerRequest(value);
            const region = await hydrologyGeneratorFor(value).generate(value.key.regionX, value.key.regionY);
            scope.postMessage({
                protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION_V2,
                requestId: value.requestId,
                type: "generateHydrologyRegionResult",
                region
            }, hydrologyRegionTransferables(region));
        } else {
            assertGenerateSemanticChunkWorkerRequest(value);
            const chunk = contextFor(value).semanticGenerator.generate(value.key.chunkX, value.key.chunkY);
            scope.postMessage({
                protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION_V2,
                requestId: value.requestId,
                type: "generateSemanticChunkResult",
                chunk
            }, semanticChunkTransferables(chunk));
        }
    } catch (reason) {
        scope.postMessage({
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: recoverRequestId(value),
            type: "surfaceWorkerError",
            requestType: recoverRequestType(value),
            error: serializeSurfaceWorkerError(reason)
        });
    }
}

scope.addEventListener("message", event => {
    void handleRequest(event.data);
});
