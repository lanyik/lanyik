import { Land } from "../enums";
import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BaseSemanticChunk,
    createBaseSemanticChunk,
    semanticTileIndex
} from "./BaseSemanticChunk";
import {
    CORE_WORLD_SEMANTICS_V2,
    CoreSubstrateClass,
    CoreVegetationProfile
} from "./SemanticCatalogsV2";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";
import {
    InfiniteWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    WorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";
import {
    WorldBiomeWeights,
    WorldSurfaceSample,
    createSemanticWorldSurfaceResolver,
    deriveSemanticBiomeWeights
} from "./WorldSurfaceResolver";
import { WORLD_STYLE_PROFILE } from "./WorldStyleProfile";

export interface GenerateBaseSemanticChunkOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly chunkX: number;
    readonly chunkY: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function quantizeUnitToUint16(value: number): number {
    return Math.floor(clamp01(value) * 0xffff + 0.5);
}

function quantizeUnitToUint8(value: number): number {
    return Math.floor(clamp01(value) * 0xff + 0.5);
}

function quantizeBiomeWeights(weights: Readonly<WorldBiomeWeights>): readonly [number, number, number, number] {
    const values = [weights.temperate, weights.dry, weights.cold, weights.alpine];
    const sum = values.reduce((total, value) => total + Math.max(0, value), 0);
    if (!Number.isFinite(sum) || sum <= 0) throw new Error("semantic biome weights are not normalizable");
    const scaled = values.map(value => Math.max(0, value) / sum * 255);
    const quantized = scaled.map(Math.floor);
    const remainderUnits = 255 - quantized.reduce((total, value) => total + value, 0);
    const order = scaled.map((value, index) => ({ index, fraction: value - quantized[index] }))
        .sort((first, second) => second.fraction - first.fraction || first.index - second.index);
    for (let index = 0; index < remainderUnits; index += 1) quantized[order[index].index] += 1;
    const quantizedSum = quantized.reduce((total, value) => total + value, 0);
    if (quantizedSum !== 255) throw new Error("semantic biome weight quantization did not conserve 255");
    return [quantized[0], quantized[1], quantized[2], quantized[3]];
}

function substrateFor(sample: Readonly<WorldSurfaceSample>): CoreSubstrateClass {
    const landform = sample.landform;
    if (sample.baseTerrain === Land.mountain
        || (landform.ridge >= WORLD_STYLE_PROFILE.terrain.mountainRidge
            && landform.roughness >= 0.55)) {
        return CoreSubstrateClass.Rock;
    }
    if (landform.temperature >= WORLD_STYLE_PROFILE.terrain.sandTemperature
        && landform.moisture < WORLD_STYLE_PROFILE.terrain.sandMoisture) {
        return CoreSubstrateClass.Sand;
    }
    return CoreSubstrateClass.Soil;
}

function vegetationProfileFor(sample: Readonly<WorldSurfaceSample>): CoreVegetationProfile {
    if (sample.baseTerrain === Land.mountain
        || sample.landform.elevation >= WORLD_STYLE_PROFILE.terrain.mountainElevation) {
        return CoreVegetationProfile.Alpine;
    }
    if (sample.landform.temperature > WORLD_STYLE_PROFILE.vegetation.palmTemperature) {
        return CoreVegetationProfile.Tropical;
    }
    if (sample.landform.temperature < WORLD_STYLE_PROFILE.vegetation.piniaTemperature) {
        return CoreVegetationProfile.Boreal;
    }
    return CoreVegetationProfile.Temperate;
}

function assertCoreDescriptor(
    descriptor: WorldDescriptorV2
): asserts descriptor is InfiniteWorldDescriptorV2 | ToroidalWorldDescriptorV2 {
    assertWorldDescriptorV2(descriptor);
    if (descriptor.sourceKind === "static") {
        throw new TypeError("procedural semantic generation cannot consume a static descriptor");
    }
    if (descriptor.seaLevel !== quantizeUnitToUint16(WORLD_STYLE_PROFILE.terrain.seaLevel)
        || descriptor.substrateCatalog.id !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.id
        || descriptor.substrateCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.contentHash
        || descriptor.substrateCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.substrateCatalog.entryCount
        || descriptor.vegetationCatalog.id !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.id
        || descriptor.vegetationCatalog.contentHash !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.contentHash
        || descriptor.vegetationCatalog.entryCount !== CORE_WORLD_SEMANTICS_V2.vegetationCatalog.entryCount
        || descriptor.biomeBasis.some((basis, index) =>
            basis.id !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].id
            || basis.contentHash !== CORE_WORLD_SEMANTICS_V2.biomeBasis[index].contentHash)) {
        throw new TypeError("procedural semantic generator does not support the descriptor catalogs or sea level");
    }
}

export function generateBaseSemanticChunk(
    options: Readonly<GenerateBaseSemanticChunkOptions>
): BaseSemanticChunk {
    if (!options || typeof options !== "object") throw new TypeError("semantic chunk generation options are required");
    assertCoreDescriptor(options.descriptor);
    const origin = chunkOrigin(options.chunkX, options.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    if (options.descriptor.sourceKind === "procedural-toroidal") {
        const chunksX = options.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
        const chunksY = options.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
        if (options.chunkX < 0 || options.chunkX >= chunksX || options.chunkY < 0 || options.chunkY >= chunksY) {
            throw new RangeError("toroidal semantic chunk key must be canonical and inside the world");
        }
    }
    const resolver = createSemanticWorldSurfaceResolver({
        seed: options.descriptor.seed,
        domain: options.descriptor.sourceKind === "procedural-toroidal"
            ? { topology: "toroidal", width: options.descriptor.width, height: options.descriptor.height }
            : { topology: "infinite" }
    });
    const substrateClass = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
    const climate = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const vegetationProfile = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);

    for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
        for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
            const tileIndex = semanticTileIndex(localX, localY);
            const sample = resolver.sampleGenerated(origin.x + localX, origin.y + localY);
            substrateClass[tileIndex] = substrateFor(sample);
            macroHeight[tileIndex] = quantizeUnitToUint16(sample.landform.elevation);
            biomeWeights.set(quantizeBiomeWeights(deriveSemanticBiomeWeights(sample)), tileIndex * 4);
            climate[tileIndex * 2] = quantizeUnitToUint8(sample.landform.temperature);
            climate[tileIndex * 2 + 1] = quantizeUnitToUint8(sample.landform.moisture);
            vegetationDensity[tileIndex] = quantizeUnitToUint8(sample.vegetationDensity);
            vegetationProfile[tileIndex] = vegetationProfileFor(sample);
        }
    }

    return createBaseSemanticChunk({
        key: { chunkX: options.chunkX, chunkY: options.chunkY },
        revision: 0,
        substrateClass,
        macroHeight,
        biomeWeights,
        climate,
        vegetationDensity,
        vegetationProfile
    }, {
        substrateCount: options.descriptor.substrateCatalog.entryCount,
        vegetationProfileCount: options.descriptor.vegetationCatalog.entryCount
    });
}

export function semanticGeneratorIdentity(descriptor: WorldDescriptorV2): string {
    assertCoreDescriptor(descriptor);
    return serializeWorldDescriptorV2(descriptor);
}
