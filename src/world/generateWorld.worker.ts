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
    generateWorldOverviewWithResolver,
    WorldOverviewGenerationOptions,
    worldOverviewTransferables
} from "./generateWorldOverview";
import {
    assertWorldDescriptor,
    createWorldDescriptor,
    serializeWorldDescriptor,
    WORLD_WORKER_PROTOCOL_VERSION
} from "./WorldDescriptor";
import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";
import { createWorldSurfaceResolver, WorldSurfaceResolver } from "./WorldSurfaceResolver";

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

interface GenerateOverviewRequest {
    protocolVersion: typeof WORLD_WORKER_PROTOCOL_VERSION;
    generatorVersion: typeof WORLD_GENERATOR_VERSION;
    id: number;
    type: "overview";
    options: WorldOverviewGenerationOptions;
}

type GenerateRequest = GenerateWorldRequest | GenerateChunkRequest | GenerateVegetationRequest | GenerateOverviewRequest;

const scope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<GenerateRequest>) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

let chunkResolver: WorldSurfaceResolver | undefined;
let chunkResolverKey: string | undefined;

function resolverFor(options: WorldChunkGenerationOptions): WorldSurfaceResolver {
    const key = serializeWorldDescriptor(createWorldDescriptor({
        seed: options.seed,
        chunkSize: options.chunkSize,
        world: options.world,
        waterStyle: options.waterStyle
    }));
    if (!chunkResolver || chunkResolverKey !== key) {
        chunkResolver = createWorldChunkSurfaceResolver(options);
        chunkResolverKey = key;
    }
    return chunkResolver;
}

function overviewResolverFor(options: WorldOverviewGenerationOptions): WorldSurfaceResolver {
    assertWorldDescriptor(options.descriptor);
    const key = serializeWorldDescriptor(options.descriptor);
    if (!chunkResolver || chunkResolverKey !== key) {
        const descriptor = options.descriptor;
        chunkResolver = createWorldSurfaceResolver({
            seed: descriptor.seed,
            waterStyle: descriptor.waterStyle,
            domain: descriptor.topology === "toroidal"
                ? { topology: "toroidal", width: descriptor.width!, height: descriptor.height! }
                : { topology: "infinite" }
        });
        chunkResolverKey = key;
    }
    return chunkResolver;
}

scope.addEventListener("message", event => {
    try {
        const request = event.data;
        if (!request || request.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION
            || request.generatorVersion !== WORLD_GENERATOR_VERSION
            || !Number.isSafeInteger(request.id) || !request.options
            || !["world", "chunk", "vegetation", "overview"].includes(request.type)) {
            throw new TypeError("World generator received an invalid request");
        }
        if (request.type === "chunk") {
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
        } else if (request.type === "overview") {
            const overview = generateWorldOverviewWithResolver(request.options, overviewResolverFor(request.options));
            scope.postMessage({
                protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
                generatorVersion: WORLD_GENERATOR_VERSION,
                id: request.id,
                overview
            }, worldOverviewTransferables(overview));
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
            generatorVersion: WORLD_GENERATOR_VERSION,
            id: event.data?.id,
            error: { name: error.name, message: error.message, stack: error.stack }
        });
    }
});
