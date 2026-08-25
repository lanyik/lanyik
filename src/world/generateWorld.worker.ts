import { generateWorld, WorldGenerationOptions } from "./generateWorld";
import { generateWorldChunk, WorldChunkGenerationOptions } from "./generateWorldChunk";

interface GenerateWorldRequest {
    id: number;
    type?: "world";
    options: WorldGenerationOptions;
}

interface GenerateChunkRequest {
    id: number;
    type: "chunk";
    options: WorldChunkGenerationOptions;
}

type GenerateRequest = GenerateWorldRequest | GenerateChunkRequest;

const scope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<GenerateRequest>) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.addEventListener("message", event => {
    try {
        const request = event.data;
        if (!request || typeof request.id !== "number" || !request.options) {
            throw new TypeError("World generator received an invalid request");
        }
        if (request.type === "chunk") {
            const chunk = generateWorldChunk(request.options);
            scope.postMessage({ id: request.id, chunk }, [chunk.tiles.buffer]);
        } else {
            scope.postMessage({ id: request.id, world: generateWorld(request.options) });
        }
    } catch (reason) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        scope.postMessage({
            id: event.data?.id,
            error: { name: error.name, message: error.message, stack: error.stack }
        });
    }
});
