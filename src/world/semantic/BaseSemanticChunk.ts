import {
    SubstrateClass,
    WORLD_SUBSTRATE_CATALOG,
    WORLD_VEGETATION_PROFILE_CATALOG
} from "./WorldSemanticCatalog";
import {
    assertLocalTileBounds,
    assertSemanticChunkKey,
    LocalTileBounds,
    localBoundsContain,
    semanticChunkLocalIndex,
    SemanticChunkKey,
    WORLD_SEMANTIC_CHUNK_FORMAT_VERSION,
    WORLD_SEMANTIC_CHUNK_SIZE,
    WORLD_SEMANTIC_CHUNK_TILE_COUNT
} from "./WorldSemanticFormat";

const BIOME_CHANNELS = 4;
const CLIMATE_CHANNELS = 2;
const SERIALIZED_MAGIC = 0x32435342; // "BSC2" in little-endian byte order.
const SERIALIZED_HEADER_BYTES = 40;
const SUBSTRATE_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT;
const MACRO_HEIGHT_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT * Uint16Array.BYTES_PER_ELEMENT;
const BIOME_WEIGHT_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT * BIOME_CHANNELS;
const CLIMATE_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNELS;
const VEGETATION_DENSITY_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT;
const VEGETATION_PROFILE_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT;

export const BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES = SUBSTRATE_BYTES
    + MACRO_HEIGHT_BYTES
    + BIOME_WEIGHT_BYTES
    + CLIMATE_BYTES
    + VEGETATION_DENSITY_BYTES
    + VEGETATION_PROFILE_BYTES;
export const BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES = SERIALIZED_HEADER_BYTES + BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES;

export interface BaseSemanticChunk {
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

export interface BaseSemanticTileView {
    readonly x: number;
    readonly y: number;
    readonly substrateClass: SubstrateClass;
    readonly macroHeight: number;
    readonly biomeWeights: readonly [number, number, number, number];
    readonly temperature: number;
    readonly moisture: number;
    readonly vegetationDensity: number;
    readonly vegetationProfile: number;
}

function assertArray(name: string, value: unknown, type: typeof Uint8Array | typeof Uint16Array, length: number): void {
    if (!(value instanceof type) || value.length !== length) {
        throw new TypeError(`${name} must be a ${type.name} of length ${length}`);
    }
}

function assertRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("semantic chunk revision must be a non-negative safe integer");
    }
}

function assertInvalidTileIsZero(chunk: BaseSemanticChunk, index: number): void {
    const biomeOffset = index * BIOME_CHANNELS;
    const climateOffset = index * CLIMATE_CHANNELS;
    if (chunk.substrateClass[index] !== 0 || chunk.macroHeight[index] !== 0
        || chunk.biomeWeights[biomeOffset] !== 0 || chunk.biomeWeights[biomeOffset + 1] !== 0
        || chunk.biomeWeights[biomeOffset + 2] !== 0 || chunk.biomeWeights[biomeOffset + 3] !== 0
        || chunk.climate[climateOffset] !== 0 || chunk.climate[climateOffset + 1] !== 0
        || chunk.vegetationDensity[index] !== 0 || chunk.vegetationProfile[index] !== 0) {
        throw new TypeError("semantic chunk data outside validBounds must be zero-filled");
    }
}

export function assertBaseSemanticChunk(value: unknown): asserts value is BaseSemanticChunk {
    if (!value || typeof value !== "object") throw new TypeError("base semantic chunk must be an object");
    const chunk = value as BaseSemanticChunk;
    const allowedFields = new Set([
        "key",
        "revision",
        "validBounds",
        "substrateClass",
        "macroHeight",
        "biomeWeights",
        "climate",
        "vegetationDensity",
        "vegetationProfile"
    ]);
    if (Object.getOwnPropertyNames(chunk).some(name => !allowedFields.has(name))) {
        throw new TypeError("base semantic chunk contains fields outside the v2 authority format");
    }
    assertSemanticChunkKey(chunk.key);
    assertRevision(chunk.revision);
    assertLocalTileBounds(chunk.validBounds);
    assertArray("substrateClass", chunk.substrateClass, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    assertArray("macroHeight", chunk.macroHeight, Uint16Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    assertArray("biomeWeights", chunk.biomeWeights, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT * BIOME_CHANNELS);
    assertArray("climate", chunk.climate, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNELS);
    assertArray("vegetationDensity", chunk.vegetationDensity, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    assertArray("vegetationProfile", chunk.vegetationProfile, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);

    for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
        for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
            const index = semanticChunkLocalIndex(localX, localY);
            if (!localBoundsContain(chunk.validBounds, localX, localY)) {
                assertInvalidTileIsZero(chunk, index);
                continue;
            }
            if (chunk.substrateClass[index] >= WORLD_SUBSTRATE_CATALOG.length) {
                throw new TypeError("semantic chunk contains an unknown substrate class");
            }
            if (chunk.vegetationProfile[index] >= WORLD_VEGETATION_PROFILE_CATALOG.length) {
                throw new TypeError("semantic chunk contains an unknown vegetation profile");
            }
            const biomeOffset = index * BIOME_CHANNELS;
            const weightSum = chunk.biomeWeights[biomeOffset]
                + chunk.biomeWeights[biomeOffset + 1]
                + chunk.biomeWeights[biomeOffset + 2]
                + chunk.biomeWeights[biomeOffset + 3];
            if (weightSum !== 255) {
                throw new TypeError("semantic chunk biome weights must sum to 255 for every valid tile");
            }
        }
    }
}

export function baseSemanticChunkTransferables(chunk: BaseSemanticChunk): Transferable[] {
    assertBaseSemanticChunk(chunk);
    const buffers = new Set<ArrayBuffer>();
    for (const array of [
        chunk.substrateClass,
        chunk.macroHeight,
        chunk.biomeWeights,
        chunk.climate,
        chunk.vegetationDensity,
        chunk.vegetationProfile
    ]) {
        if (!(array.buffer instanceof ArrayBuffer)) {
            throw new TypeError("base semantic chunk arrays must use transferable ArrayBuffer storage");
        }
        buffers.add(array.buffer);
    }
    return [...buffers];
}

export class BaseSemanticChunkView {
    constructor(public readonly chunk: BaseSemanticChunk) {
        assertBaseSemanticChunk(chunk);
    }

    public getTile(localX: number, localY: number): Readonly<BaseSemanticTileView> {
        return readValidatedBaseSemanticTile(this.chunk, localX, localY);
    }
}

export function readValidatedBaseSemanticTile(
    chunk: BaseSemanticChunk,
    localX: number,
    localY: number
): Readonly<BaseSemanticTileView> {
    const index = semanticChunkLocalIndex(localX, localY);
    if (!localBoundsContain(chunk.validBounds, localX, localY)) {
        throw new RangeError("semantic tile lies outside the chunk validBounds");
    }
    const biomeOffset = index * BIOME_CHANNELS;
    const climateOffset = index * CLIMATE_CHANNELS;
    const originX = chunk.key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    const originY = chunk.key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
    return Object.freeze({
        x: originX + localX,
        y: originY + localY,
        substrateClass: chunk.substrateClass[index] as SubstrateClass,
        macroHeight: chunk.macroHeight[index] / 65535,
        biomeWeights: Object.freeze([
            chunk.biomeWeights[biomeOffset] / 255,
            chunk.biomeWeights[biomeOffset + 1] / 255,
            chunk.biomeWeights[biomeOffset + 2] / 255,
            chunk.biomeWeights[biomeOffset + 3] / 255
        ] as [number, number, number, number]),
        temperature: chunk.climate[climateOffset] / 255,
        moisture: chunk.climate[climateOffset + 1] / 255,
        vegetationDensity: chunk.vegetationDensity[index] / 255,
        vegetationProfile: chunk.vegetationProfile[index]
    });
}

export function serializeBaseSemanticChunk(chunk: BaseSemanticChunk): ArrayBuffer {
    assertBaseSemanticChunk(chunk);
    const buffer = new ArrayBuffer(BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES);
    const view = new DataView(buffer);
    view.setUint32(0, SERIALIZED_MAGIC, true);
    view.setUint16(4, WORLD_SEMANTIC_CHUNK_FORMAT_VERSION, true);
    view.setUint16(6, SERIALIZED_HEADER_BYTES, true);
    view.setFloat64(8, chunk.key.chunkX, true);
    view.setFloat64(16, chunk.key.chunkY, true);
    view.setFloat64(24, chunk.revision, true);
    view.setUint8(32, chunk.validBounds.minX);
    view.setUint8(33, chunk.validBounds.minY);
    view.setUint8(34, chunk.validBounds.maxXExclusive);
    view.setUint8(35, chunk.validBounds.maxYExclusive);
    view.setUint32(36, BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES, true);

    let offset = SERIALIZED_HEADER_BYTES;
    new Uint8Array(buffer, offset, SUBSTRATE_BYTES).set(chunk.substrateClass);
    offset += SUBSTRATE_BYTES;
    for (let index = 0; index < chunk.macroHeight.length; index += 1) {
        view.setUint16(offset + index * Uint16Array.BYTES_PER_ELEMENT, chunk.macroHeight[index], true);
    }
    offset += MACRO_HEIGHT_BYTES;
    new Uint8Array(buffer, offset, BIOME_WEIGHT_BYTES).set(chunk.biomeWeights);
    offset += BIOME_WEIGHT_BYTES;
    new Uint8Array(buffer, offset, CLIMATE_BYTES).set(chunk.climate);
    offset += CLIMATE_BYTES;
    new Uint8Array(buffer, offset, VEGETATION_DENSITY_BYTES).set(chunk.vegetationDensity);
    offset += VEGETATION_DENSITY_BYTES;
    new Uint8Array(buffer, offset, VEGETATION_PROFILE_BYTES).set(chunk.vegetationProfile);
    return buffer;
}

export function deserializeBaseSemanticChunk(buffer: ArrayBuffer): BaseSemanticChunk {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
        throw new TypeError(`serialized base semantic chunk must contain ${BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES} bytes`);
    }
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== SERIALIZED_MAGIC
        || view.getUint16(4, true) !== WORLD_SEMANTIC_CHUNK_FORMAT_VERSION
        || view.getUint16(6, true) !== SERIALIZED_HEADER_BYTES
        || view.getUint32(36, true) !== BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES) {
        throw new TypeError("serialized base semantic chunk header is invalid or unsupported");
    }
    const key = {
        chunkX: view.getFloat64(8, true),
        chunkY: view.getFloat64(16, true)
    };
    const revision = view.getFloat64(24, true);
    const validBounds = {
        minX: view.getUint8(32),
        minY: view.getUint8(33),
        maxXExclusive: view.getUint8(34),
        maxYExclusive: view.getUint8(35)
    };
    let offset = SERIALIZED_HEADER_BYTES;
    const substrateClass = new Uint8Array(SUBSTRATE_BYTES);
    substrateClass.set(new Uint8Array(buffer, offset, SUBSTRATE_BYTES));
    offset += SUBSTRATE_BYTES;
    const macroHeight = new Uint16Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    for (let index = 0; index < macroHeight.length; index += 1) {
        macroHeight[index] = view.getUint16(offset + index * Uint16Array.BYTES_PER_ELEMENT, true);
    }
    offset += MACRO_HEIGHT_BYTES;
    const biomeWeights = new Uint8Array(BIOME_WEIGHT_BYTES);
    biomeWeights.set(new Uint8Array(buffer, offset, BIOME_WEIGHT_BYTES));
    offset += BIOME_WEIGHT_BYTES;
    const climate = new Uint8Array(CLIMATE_BYTES);
    climate.set(new Uint8Array(buffer, offset, CLIMATE_BYTES));
    offset += CLIMATE_BYTES;
    const vegetationDensity = new Uint8Array(VEGETATION_DENSITY_BYTES);
    vegetationDensity.set(new Uint8Array(buffer, offset, VEGETATION_DENSITY_BYTES));
    offset += VEGETATION_DENSITY_BYTES;
    const vegetationProfile = new Uint8Array(VEGETATION_PROFILE_BYTES);
    vegetationProfile.set(new Uint8Array(buffer, offset, VEGETATION_PROFILE_BYTES));

    const chunk: BaseSemanticChunk = Object.freeze({
        key: Object.freeze(key),
        revision,
        validBounds: Object.freeze(validBounds),
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
