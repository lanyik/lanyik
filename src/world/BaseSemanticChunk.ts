import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";
import {
    WORLD_CHUNK_FORMAT_VERSION_V2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";

export const BASE_SEMANTIC_CHUNK_TILE_COUNT = WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE;
export const BASE_SEMANTIC_CHUNK_HEADER_BYTES = 40;

const BIOME_BASIS_COUNT = 4;
const CLIMATE_CHANNEL_COUNT = 2;
const SERIALIZED_MAGIC = 0x3243_5342; // ASCII "BSC2" when written little-endian.

const SUBSTRATE_OFFSET = BASE_SEMANTIC_CHUNK_HEADER_BYTES;
const MACRO_HEIGHT_OFFSET = SUBSTRATE_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT;
const BIOME_WEIGHTS_OFFSET = MACRO_HEIGHT_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT * Uint16Array.BYTES_PER_ELEMENT;
const CLIMATE_OFFSET = BIOME_WEIGHTS_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT * BIOME_BASIS_COUNT;
const VEGETATION_DENSITY_OFFSET = CLIMATE_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNEL_COUNT;
const VEGETATION_PROFILE_OFFSET = VEGETATION_DENSITY_OFFSET + BASE_SEMANTIC_CHUNK_TILE_COUNT;

export const BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES = VEGETATION_PROFILE_OFFSET
    + BASE_SEMANTIC_CHUNK_TILE_COUNT;

export interface SemanticChunkKey {
    readonly chunkX: number;
    readonly chunkY: number;
}

export interface LocalTileBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

export interface BaseSemanticChunk {
    readonly formatVersion: typeof WORLD_CHUNK_FORMAT_VERSION_V2;
    readonly key: SemanticChunkKey;
    readonly revision: number;
    readonly validBounds: LocalTileBounds;
    readonly substrateClass: Uint8Array;
    readonly macroHeight: Uint16Array;
    readonly biomeWeights: Uint8Array;
    readonly climate: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationProfile: Uint8Array;
}

export interface BaseSemanticChunkCatalogLimits {
    readonly substrateCount: number;
    readonly vegetationProfileCount: number;
}

export interface BaseSemanticChunkInput extends Omit<BaseSemanticChunk,
    "formatVersion" | "key" | "validBounds"> {
    readonly key: SemanticChunkKey;
    readonly validBounds?: LocalTileBounds;
}

export interface BaseSemanticTileView {
    readonly substrateClass: number;
    readonly macroHeight: number;
    readonly biomeWeights: readonly [number, number, number, number];
    readonly temperature: number;
    readonly moisture: number;
    readonly vegetationDensity: number;
    readonly vegetationProfile: number;
}

const FULL_LOCAL_BOUNDS: LocalTileBounds = Object.freeze({
    minX: 0,
    minY: 0,
    maxXExclusive: WORLD_SEMANTIC_CHUNK_SIZE,
    maxYExclusive: WORLD_SEMANTIC_CHUNK_SIZE
});

export function semanticCatalogLimits(descriptor: WorldDescriptorV2): BaseSemanticChunkCatalogLimits {
    return Object.freeze({
        substrateCount: descriptor.substrateCatalog.entryCount,
        vegetationProfileCount: descriptor.vegetationCatalog.entryCount
    });
}

export function semanticTileIndex(localX: number, localY: number): number {
    if (!Number.isInteger(localX) || localX < 0 || localX >= WORLD_SEMANTIC_CHUNK_SIZE
        || !Number.isInteger(localY) || localY < 0 || localY >= WORLD_SEMANTIC_CHUNK_SIZE) {
        throw new RangeError("semantic tile coordinate is outside its chunk");
    }
    return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
}

export function semanticBiomeWeightIndex(tileIndex: number, basisIndex: number): number {
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !Number.isInteger(basisIndex) || basisIndex < 0 || basisIndex >= BIOME_BASIS_COUNT) {
        throw new RangeError("semantic biome weight index is invalid");
    }
    return tileIndex * BIOME_BASIS_COUNT + basisIndex;
}

export function semanticClimateIndex(tileIndex: number, channelIndex: number): number {
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex >= CLIMATE_CHANNEL_COUNT) {
        throw new RangeError("semantic climate index is invalid");
    }
    return tileIndex * CLIMATE_CHANNEL_COUNT + channelIndex;
}

function assertCatalogLimits(limits: Readonly<BaseSemanticChunkCatalogLimits>): void {
    if (!Number.isInteger(limits.substrateCount) || limits.substrateCount <= 0 || limits.substrateCount > 256
        || !Number.isInteger(limits.vegetationProfileCount)
        || limits.vegetationProfileCount <= 0 || limits.vegetationProfileCount > 256) {
        throw new RangeError("semantic chunk catalog limits must be integers between 1 and 256");
    }
}

function assertLocalBounds(bounds: Readonly<LocalTileBounds>): void {
    if (!bounds || !Number.isInteger(bounds.minX) || !Number.isInteger(bounds.minY)
        || !Number.isInteger(bounds.maxXExclusive) || !Number.isInteger(bounds.maxYExclusive)
        || bounds.minX < 0 || bounds.minY < 0
        || bounds.maxXExclusive > WORLD_SEMANTIC_CHUNK_SIZE
        || bounds.maxYExclusive > WORLD_SEMANTIC_CHUNK_SIZE
        || bounds.minX >= bounds.maxXExclusive || bounds.minY >= bounds.maxYExclusive) {
        throw new RangeError("semantic chunk valid bounds are invalid");
    }
}

function tileIsValid(index: number, bounds: Readonly<LocalTileBounds>): boolean {
    const localX = Math.floor(index / WORLD_SEMANTIC_CHUNK_SIZE);
    const localY = index - localX * WORLD_SEMANTIC_CHUNK_SIZE;
    return localX >= bounds.minX && localX < bounds.maxXExclusive
        && localY >= bounds.minY && localY < bounds.maxYExclusive;
}

export function assertBaseSemanticChunk(
    chunk: Readonly<BaseSemanticChunk>,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): void {
    if (!chunk || typeof chunk !== "object" || chunk.formatVersion !== WORLD_CHUNK_FORMAT_VERSION_V2) {
        throw new TypeError("base semantic chunk format version is unsupported");
    }
    assertCatalogLimits(limits);
    if (!chunk.key || !Number.isSafeInteger(chunk.key.chunkX) || !Number.isSafeInteger(chunk.key.chunkY)) {
        throw new RangeError("base semantic chunk key must use safe integers");
    }
    chunkOrigin(chunk.key.chunkX, chunk.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    if (!Number.isSafeInteger(chunk.revision) || chunk.revision < 0) {
        throw new RangeError("base semantic chunk revision must be a non-negative safe integer");
    }
    assertLocalBounds(chunk.validBounds);
    if (!(chunk.substrateClass instanceof Uint8Array)
        || chunk.substrateClass.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !(chunk.macroHeight instanceof Uint16Array)
        || chunk.macroHeight.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !(chunk.biomeWeights instanceof Uint8Array)
        || chunk.biomeWeights.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT * BIOME_BASIS_COUNT
        || !(chunk.climate instanceof Uint8Array)
        || chunk.climate.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNEL_COUNT
        || !(chunk.vegetationDensity instanceof Uint8Array)
        || chunk.vegetationDensity.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !(chunk.vegetationProfile instanceof Uint8Array)
        || chunk.vegetationProfile.length !== BASE_SEMANTIC_CHUNK_TILE_COUNT) {
        throw new TypeError("base semantic chunk arrays do not match the frozen layout");
    }

    for (let tileIndex = 0; tileIndex < BASE_SEMANTIC_CHUNK_TILE_COUNT; tileIndex += 1) {
        const valid = tileIsValid(tileIndex, chunk.validBounds);
        const biomeOffset = tileIndex * BIOME_BASIS_COUNT;
        const climateOffset = tileIndex * CLIMATE_CHANNEL_COUNT;
        if (!valid) {
            if (chunk.substrateClass[tileIndex] !== 0 || chunk.macroHeight[tileIndex] !== 0
                || chunk.vegetationDensity[tileIndex] !== 0 || chunk.vegetationProfile[tileIndex] !== 0
                || chunk.biomeWeights[biomeOffset] !== 0 || chunk.biomeWeights[biomeOffset + 1] !== 0
                || chunk.biomeWeights[biomeOffset + 2] !== 0 || chunk.biomeWeights[biomeOffset + 3] !== 0
                || chunk.climate[climateOffset] !== 0 || chunk.climate[climateOffset + 1] !== 0) {
                throw new Error("base semantic chunk contains non-zero data outside valid bounds");
            }
            continue;
        }
        if (chunk.substrateClass[tileIndex] >= limits.substrateCount) {
            throw new RangeError("base semantic chunk substrate index exceeds its catalog");
        }
        if (chunk.vegetationProfile[tileIndex] >= limits.vegetationProfileCount) {
            throw new RangeError("base semantic chunk vegetation profile exceeds its catalog");
        }
        const weightSum = chunk.biomeWeights[biomeOffset]
            + chunk.biomeWeights[biomeOffset + 1]
            + chunk.biomeWeights[biomeOffset + 2]
            + chunk.biomeWeights[biomeOffset + 3];
        if (weightSum !== 255) {
            throw new RangeError("base semantic chunk biome weights must sum to 255");
        }
    }
}

export function createBaseSemanticChunk(
    input: Readonly<BaseSemanticChunkInput>,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): BaseSemanticChunk {
    if (!input || typeof input !== "object") throw new TypeError("base semantic chunk input is required");
    const bounds = input.validBounds ?? FULL_LOCAL_BOUNDS;
    const chunk: BaseSemanticChunk = Object.freeze({
        formatVersion: WORLD_CHUNK_FORMAT_VERSION_V2,
        key: Object.freeze({ chunkX: input.key.chunkX, chunkY: input.key.chunkY }),
        revision: input.revision,
        validBounds: Object.freeze({
            minX: bounds.minX,
            minY: bounds.minY,
            maxXExclusive: bounds.maxXExclusive,
            maxYExclusive: bounds.maxYExclusive
        }),
        substrateClass: input.substrateClass,
        macroHeight: input.macroHeight,
        biomeWeights: input.biomeWeights,
        climate: input.climate,
        vegetationDensity: input.vegetationDensity,
        vegetationProfile: input.vegetationProfile
    });
    assertBaseSemanticChunk(chunk, limits);
    return chunk;
}

export function getBaseSemanticTile(
    chunk: Readonly<BaseSemanticChunk>,
    localX: number,
    localY: number
): BaseSemanticTileView {
    const tileIndex = semanticTileIndex(localX, localY);
    if (!tileIsValid(tileIndex, chunk.validBounds)) {
        throw new RangeError("semantic tile coordinate is outside the chunk valid bounds");
    }
    const biomeOffset = tileIndex * BIOME_BASIS_COUNT;
    const climateOffset = tileIndex * CLIMATE_CHANNEL_COUNT;
    return Object.freeze({
        substrateClass: chunk.substrateClass[tileIndex],
        macroHeight: chunk.macroHeight[tileIndex],
        biomeWeights: Object.freeze([
            chunk.biomeWeights[biomeOffset],
            chunk.biomeWeights[biomeOffset + 1],
            chunk.biomeWeights[biomeOffset + 2],
            chunk.biomeWeights[biomeOffset + 3]
        ] as const),
        temperature: chunk.climate[climateOffset],
        moisture: chunk.climate[climateOffset + 1],
        vegetationDensity: chunk.vegetationDensity[tileIndex],
        vegetationProfile: chunk.vegetationProfile[tileIndex]
    });
}

export function serializeBaseSemanticChunk(
    chunk: Readonly<BaseSemanticChunk>,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): ArrayBuffer {
    assertBaseSemanticChunk(chunk, limits);
    const buffer = new ArrayBuffer(BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES);
    const view = new DataView(buffer);
    view.setUint32(0, SERIALIZED_MAGIC, true);
    view.setUint16(4, chunk.formatVersion, true);
    view.setUint16(6, BASE_SEMANTIC_CHUNK_HEADER_BYTES, true);
    view.setBigInt64(8, BigInt(chunk.key.chunkX), true);
    view.setBigInt64(16, BigInt(chunk.key.chunkY), true);
    view.setBigUint64(24, BigInt(chunk.revision), true);
    view.setUint8(32, chunk.validBounds.minX);
    view.setUint8(33, chunk.validBounds.minY);
    view.setUint8(34, chunk.validBounds.maxXExclusive);
    view.setUint8(35, chunk.validBounds.maxYExclusive);
    view.setUint32(36, BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES, true);
    new Uint8Array(buffer, SUBSTRATE_OFFSET, chunk.substrateClass.length).set(chunk.substrateClass);
    for (let index = 0; index < chunk.macroHeight.length; index += 1) {
        view.setUint16(MACRO_HEIGHT_OFFSET + index * Uint16Array.BYTES_PER_ELEMENT, chunk.macroHeight[index], true);
    }
    new Uint8Array(buffer, BIOME_WEIGHTS_OFFSET, chunk.biomeWeights.length).set(chunk.biomeWeights);
    new Uint8Array(buffer, CLIMATE_OFFSET, chunk.climate.length).set(chunk.climate);
    new Uint8Array(buffer, VEGETATION_DENSITY_OFFSET, chunk.vegetationDensity.length)
        .set(chunk.vegetationDensity);
    new Uint8Array(buffer, VEGETATION_PROFILE_OFFSET, chunk.vegetationProfile.length)
        .set(chunk.vegetationProfile);
    return buffer;
}

function safeBigIntNumber(name: string, value: bigint): number {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || BigInt(number) !== value) {
        throw new RangeError(`${name} exceeds the safe integer range`);
    }
    return number;
}

export function deserializeBaseSemanticChunk(
    buffer: ArrayBuffer,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): BaseSemanticChunk {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
        throw new TypeError("serialized base semantic chunk has an invalid byte length");
    }
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== SERIALIZED_MAGIC
        || view.getUint16(4, true) !== WORLD_CHUNK_FORMAT_VERSION_V2
        || view.getUint16(6, true) !== BASE_SEMANTIC_CHUNK_HEADER_BYTES
        || view.getUint32(36, true) !== BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
        throw new TypeError("serialized base semantic chunk header is invalid or unsupported");
    }
    const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    for (let index = 0; index < macroHeight.length; index += 1) {
        macroHeight[index] = view.getUint16(MACRO_HEIGHT_OFFSET + index * Uint16Array.BYTES_PER_ELEMENT, true);
    }
    return createBaseSemanticChunk({
        key: {
            chunkX: safeBigIntNumber("semantic chunk x", view.getBigInt64(8, true)),
            chunkY: safeBigIntNumber("semantic chunk y", view.getBigInt64(16, true))
        },
        revision: safeBigIntNumber("semantic chunk revision", view.getBigUint64(24, true)),
        validBounds: {
            minX: view.getUint8(32),
            minY: view.getUint8(33),
            maxXExclusive: view.getUint8(34),
            maxYExclusive: view.getUint8(35)
        },
        substrateClass: new Uint8Array(buffer, SUBSTRATE_OFFSET, BASE_SEMANTIC_CHUNK_TILE_COUNT).slice(),
        macroHeight,
        biomeWeights: new Uint8Array(
            buffer,
            BIOME_WEIGHTS_OFFSET,
            BASE_SEMANTIC_CHUNK_TILE_COUNT * BIOME_BASIS_COUNT
        ).slice(),
        climate: new Uint8Array(
            buffer,
            CLIMATE_OFFSET,
            BASE_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNEL_COUNT
        ).slice(),
        vegetationDensity: new Uint8Array(
            buffer,
            VEGETATION_DENSITY_OFFSET,
            BASE_SEMANTIC_CHUNK_TILE_COUNT
        ).slice(),
        vegetationProfile: new Uint8Array(
            buffer,
            VEGETATION_PROFILE_OFFSET,
            BASE_SEMANTIC_CHUNK_TILE_COUNT
        ).slice()
    }, limits);
}
