import {
    BaseSemanticChunkGenerator,
    createBaseSemanticChunkGenerator
} from "./generateBaseSemanticChunk";
import {
    SURFACE_WORKER_PROTOCOL_VERSION,
    SurfaceWorkerRequest,
    assertGenerateSemanticChunkWorkerRequest,
    semanticChunkTransferables,
    serializeSurfaceWorkerError
} from "./SurfaceWorkerProtocol";
import {
    WORLD_GENERATOR_VERSION_V2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

const scope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

let semanticGenerator: BaseSemanticChunkGenerator | undefined;

function generatorFor(request: SurfaceWorkerRequest): BaseSemanticChunkGenerator {
    const identity = serializeWorldDescriptorV2(request.descriptor);
    if (!semanticGenerator || semanticGenerator.identity !== identity) {
        semanticGenerator = createBaseSemanticChunkGenerator(request.descriptor);
    }
    return semanticGenerator;
}

function recoverRequestId(value: unknown): number | null {
    if (!value || typeof value !== "object") return null;
    const requestId = (value as { requestId?: unknown }).requestId;
    return Number.isSafeInteger(requestId) && (requestId as number) > 0 ? requestId as number : null;
}

function recoverRequestType(value: unknown): SurfaceWorkerRequest["type"] | null {
    if (!value || typeof value !== "object") return null;
    return (value as { type?: unknown }).type === "generateSemanticChunk" ? "generateSemanticChunk" : null;
}

scope.addEventListener("message", event => {
    try {
        assertGenerateSemanticChunkWorkerRequest(event.data);
        const request = event.data;
        const chunk = generatorFor(request).generate(request.key.chunkX, request.key.chunkY);
        scope.postMessage({
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: request.requestId,
            type: "generateSemanticChunkResult",
            chunk
        }, semanticChunkTransferables(chunk));
    } catch (reason) {
        scope.postMessage({
            protocolVersion: SURFACE_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION_V2,
            requestId: recoverRequestId(event.data),
            type: "surfaceWorkerError",
            requestType: recoverRequestType(event.data),
            error: serializeSurfaceWorkerError(reason)
        });
    }
});
