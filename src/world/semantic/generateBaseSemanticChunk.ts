import {
    createWorldSurfaceResolver,
    WorldSurfaceResolver,
    WorldSurfaceSample
} from "../WorldSurfaceResolver";
import {
    assertBaseSemanticChunk,
    BaseSemanticChunk
} from "./BaseSemanticChunk";
import {
    SubstrateClass
} from "./WorldSemanticCatalog";
import {
    BASE_SEMANTIC_CHUNK_REVISION,
    FULL_SEMANTIC_CHUNK_BOUNDS,
    LocalTileBounds,
    localBoundsContain,
    semanticChunkLocalIndex,
    semanticChunkOrigin,
    SemanticChunkKey,
    WORLD_SEMANTIC_CHUNK_SIZE,
    WORLD_SEMANTIC_CHUNK_TILE_COUNT
} from "./WorldSemanticFormat";
import {
    assertWorldDescriptorV2,
    canonicalizeSemanticChunkKey,
    ProceduralWorldDescriptorV2
} from "./WorldDescriptorV2";

export interface BaseSemanticChunkGenerationOptions {
    readonly descriptor: ProceduralWorldDescriptorV2;
    readonly key: SemanticChunkKey;
}

function clampUnit(value: number): number {
    if (!Number.isFinite(value)) throw new RangeError("semantic generator received a non-finite normalized value");
    return Math.max(0, Math.min(1, value));
}

function quantizeUint8(value: number): number {
    return Math.floor(clampUnit(value) * 255 + 0.5);
}

export function quantizeMacroHeight(value: number): number {
    return Math.floor(clampUnit(value) * 65535 + 0.5);
}

function substrateFor(sample: Readonly<WorldSurfaceSample>): SubstrateClass {
    switch (sample.baseTerrain) {
        case "sea":
        case "coastal":
            return SubstrateClass.Sediment;
        case "sand":
            return SubstrateClass.Sand;
        case "mountain":
            return SubstrateClass.Rock;
        case "tundra":
        case "snow":
            return SubstrateClass.Permafrost;
        case "land":
            return SubstrateClass.Soil;
        default:
            throw new TypeError(`semantic generator cannot map terrain ${String(sample.baseTerrain)} to substrate`);
    }
}

function fallbackBiomeIndex(substrate: SubstrateClass): number {
    switch (substrate) {
        case SubstrateClass.Sand: return 1;
        case SubstrateClass.Permafrost: return 2;
        case SubstrateClass.Rock: return 3;
        default: return 0;
    }
}

function quantizeBiomeWeights(
    sample: Readonly<WorldSurfaceSample>,
    substrate: SubstrateClass
): readonly [number, number, number, number] {
    const weights = [
        sample.biomeWeights.temperate,
        sample.biomeWeights.dry,
        sample.biomeWeights.cold,
        sample.biomeWeights.alpine
    ];
    if (weights.some(value => !Number.isFinite(value) || value < 0)) {
        throw new RangeError("semantic generator received invalid biome weights");
    }
    const sum = weights.reduce((total, value) => total + value, 0);
    if (sum <= 0) {
        const fallback = [0, 0, 0, 0];
        fallback[fallbackBiomeIndex(substrate)] = 255;
        return fallback as unknown as readonly [number, number, number, number];
    }
    const scaled = weights.map(value => value / sum * 255);
    const quantized = scaled.map(value => Math.floor(value));
    let remaining = 255 - quantized.reduce((total, value) => total + value, 0);
    const order = scaled.map((value, index) => ({ index, remainder: value - quantized[index] }))
        .sort((first, second) => second.remainder - first.remainder || first.index - second.index);
    for (let index = 0; index < order.length && remaining > 0; index += 1, remaining -= 1) {
        quantized[order[index].index] += 1;
    }
    return quantized as unknown as readonly [number, number, number, number];
}

function vegetationProfileFor(sample: Readonly<WorldSurfaceSample>, density: number): number {
    if (density === 0 || sample.vegetationKind === undefined) return 0;
    switch (sample.vegetationKind) {
        case "palm": return 1;
        case "pinia": return 2;
        case "oak": return 3;
    }
}

function assertResolverMatches(
    resolver: WorldSurfaceResolver,
    descriptor: ProceduralWorldDescriptorV2
): void {
    if (!resolver || resolver.seed !== descriptor.seed || resolver.domain.topology !== descriptor.topology
        || (descriptor.topology === "toroidal"
            && (resolver.domain.topology !== "toroidal"
                || resolver.domain.width !== descriptor.width
                || resolver.domain.height !== descriptor.height))) {
        throw new TypeError("world surface resolver does not match the v2 semantic chunk request");
    }
}

function validBoundsForInfiniteChunk(origin: Readonly<{ x: number; y: number }>): Readonly<LocalTileBounds> {
    const minX = Math.max(0, Number.MIN_SAFE_INTEGER - origin.x);
    const minY = Math.max(0, Number.MIN_SAFE_INTEGER - origin.y);
    const maxXExclusive = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, Number.MAX_SAFE_INTEGER - origin.x + 1);
    const maxYExclusive = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, Number.MAX_SAFE_INTEGER - origin.y + 1);
    return Object.freeze({ minX, minY, maxXExclusive, maxYExclusive });
}

function requireProceduralDescriptor(value: unknown): ProceduralWorldDescriptorV2 {
    assertWorldDescriptorV2(value);
    if (value.sourceKind === "static") {
        throw new TypeError("static v2 descriptors cannot be evaluated by the procedural semantic generator");
    }
    return value;
}

export function createSemanticChunkSurfaceResolver(
    descriptor: ProceduralWorldDescriptorV2
): WorldSurfaceResolver {
    const candidate = requireProceduralDescriptor(descriptor);
    return createWorldSurfaceResolver({
        seed: candidate.seed,
        domain: candidate.topology === "toroidal"
            ? { topology: "toroidal", width: candidate.width, height: candidate.height }
            : { topology: "infinite" }
    });
}

export function generateBaseSemanticChunk(options: BaseSemanticChunkGenerationOptions): BaseSemanticChunk {
    if (!options || typeof options !== "object") {
        throw new TypeError("base semantic chunk generation options are required");
    }
    return generateBaseSemanticChunkWithResolver(options, createSemanticChunkSurfaceResolver(options.descriptor));
}

export function generateBaseSemanticChunkWithResolver(
    options: BaseSemanticChunkGenerationOptions,
    resolver: WorldSurfaceResolver
): BaseSemanticChunk {
    if (!options || typeof options !== "object") {
        throw new TypeError("base semantic chunk generation options are required");
    }
    const descriptor = requireProceduralDescriptor(options.descriptor);
    const key = canonicalizeSemanticChunkKey(descriptor, options.key);
    const origin = semanticChunkOrigin(key);
    const validBounds = descriptor.topology === "infinite"
        ? validBoundsForInfiniteChunk(origin)
        : FULL_SEMANTIC_CHUNK_BOUNDS;
    assertResolverMatches(resolver, descriptor);

    const substrateClass = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const macroHeight = new Uint16Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const biomeWeights = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 4);
    const climate = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const vegetationProfile = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);

    for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
        for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
            const index = semanticChunkLocalIndex(localX, localY);
            if (!localBoundsContain(validBounds, localX, localY)) continue;
            const sample = resolver.sampleGenerated(origin.x + localX, origin.y + localY);
            const substrate = substrateFor(sample);
            const weights = quantizeBiomeWeights(sample, substrate);
            const density = quantizeUint8(sample.vegetationDensity);
            substrateClass[index] = substrate;
            // Generator v6 freezes normalized landform elevation as the shared
            // macro surface. Values outside the normalized domain saturate at
            // the format boundary before any consumer observes them.
            macroHeight[index] = quantizeMacroHeight(sample.landform.elevation);
            const biomeOffset = index * 4;
            biomeWeights[biomeOffset] = weights[0];
            biomeWeights[biomeOffset + 1] = weights[1];
            biomeWeights[biomeOffset + 2] = weights[2];
            biomeWeights[biomeOffset + 3] = weights[3];
            const climateOffset = index * 2;
            climate[climateOffset] = quantizeUint8(sample.landform.temperature);
            climate[climateOffset + 1] = quantizeUint8(sample.landform.moisture);
            vegetationDensity[index] = density;
            vegetationProfile[index] = vegetationProfileFor(sample, density);
        }
    }

    const chunk: BaseSemanticChunk = Object.freeze({
        key: Object.freeze(key),
        revision: BASE_SEMANTIC_CHUNK_REVISION,
        validBounds,
        substrateClass,
        macroHeight,
        biomeWeights,
        climate,
        vegetationDensity,
        vegetationProfile
    });
    assertBaseSemanticChunk(chunk);
    return chunk;
}
