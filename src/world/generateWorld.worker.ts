import { generateWorld, WorldGenerationOptions } from "./generateWorld";
import {
    createWorldChunkSurfaceResolver,
    generateWorldChunkWithResolver,
    WorldChunkGenerationOptions
} from "./generateWorldChunk";
import {
    generateWorldVegetation,
    WorldVegetationGenerationOptions,
    worldVegetationTransferables
} from "./generateVegetation";
import {
    createWorldDescriptor,
    serializeWorldDescriptor,
    WORLD_WORKER_PROTOCOL_VERSION
} from "./WorldDescriptor";
import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";
import { WorldSurfaceResolver } from "./WorldSurfaceResolver";
import {
    baseSemanticChunkTransferables,
    BaseSemanticChunk
} from "./semantic/BaseSemanticChunk";
import {
    BaseSemanticChunkGenerationOptions,
    createSemanticChunkSurfaceResolver,
    generateBaseSemanticChunkWithResolver
} from "./semantic/generateBaseSemanticChunk";
import { WORLD_SURFACE_V2_GENERATOR_VERSION } from "./semantic/WorldSemanticFormat";
import {
    serializeWorldDescriptorV2
} from "./semantic/WorldDescriptorV2";

interface GenerateWorldRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: typeof WORLD_GENERATOR_VERSION;
    id: number;
    type: "world";
    options: WorldGenerationOptions;
}

interface GenerateChunkRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: typeof WORLD_GENERATOR_VERSION;
    id: number;
    type: "chunk";
    options: WorldChunkGenerationOptions;
}

interface GenerateVegetationRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: typeof WORLD_GENERATOR_VERSION;
    id: number;
    type: "vegetation";
    options: WorldVegetationGenerationOptions;
}

interface GenerateSemanticChunkRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: typeof WORLD_SURFACE_V2_GENERATOR_VERSION;
    id: number;
    type: "generateSemanticChunk";
    options: BaseSemanticChunkGenerationOptions;
}

type GenerateRequest = GenerateWorldRequest | GenerateChunkRequest
    | GenerateVegetationRequest | GenerateSemanticChunkRequest;

const scope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<GenerateRequest>) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

let chunkResolver: WorldSurfaceResolver | undefined;
let chunkResolverKey: string | undefined;
let semanticResolver: WorldSurfaceResolver | undefined;
let semanticResolverKey: string | undefined;

function resolverFor(options: WorldChunkGenerationOptions): WorldSurfaceResolver {
    const key = serializeWorldDescriptor(createWorldDescriptor({
        seed: options.seed,
        chunkSize: options.chunkSize,
        world: options.world
    }));
    if (!chunkResolver || chunkResolverKey !== key) {
        chunkResolver = createWorldChunkSurfaceResolver(options);
        chunkResolverKey = key;
    }
    return chunkResolver;
}

function semanticResolverFor(options: BaseSemanticChunkGenerationOptions): WorldSurfaceResolver {
    const key = serializeWorldDescriptorV2(options.descriptor);
    if (!semanticResolver || semanticResolverKey !== key) {
        semanticResolver = createSemanticChunkSurfaceResolver(options.descriptor);
        semanticResolverKey = key;
    }
    return semanticResolver;
}

function requestGeneratorVersion(request: GenerateRequest): number {
    return request.type === "generateSemanticChunk"
        ? WORLD_SURFACE_V2_GENERATOR_VERSION
        : WORLD_GENERATOR_VERSION;
}

scope.addEventListener("message", event => {
    try {
        const request = event.data;
        if (!request || request.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION
            || !Number.isSafeInteger(request.id) || !request.options
            || !["world", "chunk", "vegetation", "generateSemanticChunk"].includes(request.type)
            || request.generatorVersion !== requestGeneratorVersion(request)) {
            throw new TypeError("World generator received an invalid request");
        }
        if (request.type === "generateSemanticChunk") {
            const semanticChunk: BaseSemanticChunk = generateBaseSemanticChunkWithResolver(
                request.options,
                semanticResolverFor(request.options)
            );
            scope.postMessage({
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
                id: request.id,
                semanticChunk
            }, baseSemanticChunkTransferables(semanticChunk));
        } else if (request.type === "chunk") {
            const chunk = generateWorldChunkWithResolver(request.options, resolverFor(request.options));
            scope.postMessage({
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION,
                id: request.id,
                chunk
            }, [chunk.tiles.buffer]);
        } else if (request.type === "vegetation") {
            const vegetation = generateWorldVegetation(request.options);
            scope.postMessage({
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION,
                id: request.id,
                vegetation
            }, worldVegetationTransferables(vegetation));
        } else {
            scope.postMessage({
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION,
                id: request.id,
                world: generateWorld(request.options)
            });
        }
    } catch (reason) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        scope.postMessage({
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: event.data?.type === "generateSemanticChunk"
                ? WORLD_SURFACE_V2_GENERATOR_VERSION
                : WORLD_GENERATOR_VERSION,
            id: event.data?.id,
            error: { name: error.name, message: error.message, stack: error.stack }
        });
    }
});
