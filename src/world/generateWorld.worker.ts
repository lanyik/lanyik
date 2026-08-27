import { generateWorld, WorldGenerationOptions } from "./generateWorld";
import { generateWorldChunk, WorldChunkGenerationOptions } from "./generateWorldChunk";
import {
    generateWorldVegetation,
    WorldVegetationGenerationOptions,
    worldVegetationTransferables
} from "./generateVegetation";
import { WORLD_WORKER_PROTOCOL_VERSION } from "./WorldDescriptor";

interface GenerateWorldRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    id: number;
    type: "world";
    options: WorldGenerationOptions;
}

interface GenerateChunkRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    id: number;
    type: "chunk";
    options: WorldChunkGenerationOptions;
}

interface GenerateVegetationRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    id: number;
    type: "vegetation";
    options: WorldVegetationGenerationOptions;
}

type GenerateRequest = GenerateWorldRequest | GenerateChunkRequest | GenerateVegetationRequest;

const scope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<GenerateRequest>) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.addEventListener("message", event => {
    try {
        const request = event.data;
        if (!request || request.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION
            || !Number.isSafeInteger(request.id) || !request.options
            || !["world", "chunk", "vegetation"].includes(request.type)) {
            throw new TypeError("World generator received an invalid request");
        }
        if (request.type === "chunk") {
            const chunk = generateWorldChunk(request.options);
            scope.postMessage({ protocolVersion: WORLD_WORKER_PROTOCOL_VERSION, id: request.id, chunk }, [chunk.tiles.buffer]);
        } else if (request.type === "vegetation") {
            const vegetation = generateWorldVegetation(request.options);
            scope.postMessage({
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                id: request.id,
                vegetation
            }, worldVegetationTransferables(vegetation));
        } else {
            scope.postMessage({
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                id: request.id,
                world: generateWorld(request.options)
            });
        }
    } catch (reason) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        scope.postMessage({
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            id: event.data?.id,
            error: { name: error.name, message: error.message, stack: error.stack }
        });
    }
});
