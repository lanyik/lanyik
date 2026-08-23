import { generateWorld, WorldGenerationOptions } from "./generateWorld";

interface GenerateRequest {
    id: number;
    options: WorldGenerationOptions;
}

const scope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<GenerateRequest>) => void): void;
    postMessage(message: unknown): void;
};

scope.addEventListener("message", event => {
    const { id, options } = event.data;
    try {
        scope.postMessage({ id, world: generateWorld(options) });
    } catch (reason) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        scope.postMessage({
            id,
            error: { name: error.name, message: error.message, stack: error.stack }
        });
    }
});
