import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BaseSemanticChunkCatalogLimits,
    SemanticChunkKey
} from "./BaseSemanticChunk";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

export const SPARSE_SEMANTIC_DELTA_FORMAT_VERSION = 1;
export const SPARSE_SEMANTIC_DELTA_HEADER_BYTES = 40;
export const SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY = 12;
export const MAX_SPARSE_SEMANTIC_DELTA_WORLD_IDENTITY_LENGTH = 16_384;

export const SEMANTIC_DELTA_FIELD_HEIGHT = 1 << 0;
export const SEMANTIC_DELTA_FIELD_SUBSTRATE = 1 << 1;
export const SEMANTIC_DELTA_FIELD_BIOME = 1 << 2;
export const SEMANTIC_DELTA_FIELD_VEGETATION = 1 << 3;
export const SEMANTIC_DELTA_ALL_FIELDS = SEMANTIC_DELTA_FIELD_HEIGHT
    | SEMANTIC_DELTA_FIELD_SUBSTRATE
    | SEMANTIC_DELTA_FIELD_BIOME
    | SEMANTIC_DELTA_FIELD_VEGETATION;

const BIOME_BASIS_COUNT = 4;
const SERIALIZED_MAGIC = 0x3244_5353; // ASCII "SSD2" when written little-endian.

export interface SparseSemanticDelta {
    readonly formatVersion: typeof SPARSE_SEMANTIC_DELTA_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly key: SemanticChunkKey;
    readonly revision: number;
    readonly tileIndex: Uint16Array;
    readonly fieldMask: Uint8Array;
    readonly macroHeight: Uint16Array;
    readonly substrateClass: Uint8Array;
    readonly biomeWeights: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationProfile: Uint8Array;
}

export interface SparseSemanticDeltaInput extends Omit<SparseSemanticDelta,
    "formatVersion" | "key"> {
    readonly key: SemanticChunkKey;
}

interface SparseSemanticDeltaOffsets {
    readonly identity: number;
    readonly tileIndex: number;
    readonly fieldMask: number;
    readonly macroHeight: number;
    readonly substrateClass: number;
    readonly biomeWeights: number;
    readonly vegetationDensity: number;
    readonly vegetationProfile: number;
    readonly totalBytes: number;
}

function assertCatalogLimits(limits: Readonly<BaseSemanticChunkCatalogLimits>): void {
    if (!limits || !Number.isInteger(limits.substrateCount)
        || limits.substrateCount <= 0 || limits.substrateCount > 256
        || !Number.isInteger(limits.vegetationProfileCount)
        || limits.vegetationProfileCount <= 0 || limits.vegetationProfileCount > 256) {
        throw new RangeError("sparse semantic delta catalog limits must be integers between 1 and 256");
    }
}

function offsets(identityBytes: number, entryCount: number): SparseSemanticDeltaOffsets {
    const identity = SPARSE_SEMANTIC_DELTA_HEADER_BYTES;
    const tileIndex = identity + identityBytes;
    const fieldMask = tileIndex + entryCount * Uint16Array.BYTES_PER_ELEMENT;
    const macroHeight = fieldMask + entryCount;
    const substrateClass = macroHeight + entryCount * Uint16Array.BYTES_PER_ELEMENT;
    const biomeWeights = substrateClass + entryCount;
    const vegetationDensity = biomeWeights + entryCount * BIOME_BASIS_COUNT;
    const vegetationProfile = vegetationDensity + entryCount;
    const totalBytes = vegetationProfile + entryCount;
    if (!Number.isSafeInteger(totalBytes)) {
        throw new RangeError("serialized sparse semantic delta exceeds safe byte addressing");
    }
    return {
        identity,
        tileIndex,
        fieldMask,
        macroHeight,
        substrateClass,
        biomeWeights,
        vegetationDensity,
        vegetationProfile,
        totalBytes
    };
}

function safeBigIntNumber(name: string, value: bigint): number {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || BigInt(number) !== value) {
        throw new RangeError(`${name} exceeds the safe integer range`);
    }
    return number;
}

export function assertSparseSemanticDelta(
    delta: Readonly<SparseSemanticDelta>,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): void {
    if (!delta || typeof delta !== "object"
        || delta.formatVersion !== SPARSE_SEMANTIC_DELTA_FORMAT_VERSION) {
        throw new TypeError("sparse semantic delta format version is unsupported");
    }
    assertCatalogLimits(limits);
    if (typeof delta.worldIdentity !== "string" || delta.worldIdentity.length === 0
        || delta.worldIdentity.length > MAX_SPARSE_SEMANTIC_DELTA_WORLD_IDENTITY_LENGTH) {
        throw new TypeError("sparse semantic delta world identity is invalid");
    }
    if (!delta.key || !Number.isSafeInteger(delta.key.chunkX) || !Number.isSafeInteger(delta.key.chunkY)) {
        throw new RangeError("sparse semantic delta key must use safe integers");
    }
    chunkOrigin(delta.key.chunkX, delta.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    if (!Number.isSafeInteger(delta.revision) || delta.revision <= 0) {
        throw new RangeError("sparse semantic delta revision must be a positive safe integer");
    }
    const entryCount = delta.tileIndex?.length;
    if (!(delta.tileIndex instanceof Uint16Array)
        || entryCount <= 0 || entryCount > BASE_SEMANTIC_CHUNK_TILE_COUNT
        || !(delta.fieldMask instanceof Uint8Array) || delta.fieldMask.length !== entryCount
        || !(delta.macroHeight instanceof Uint16Array) || delta.macroHeight.length !== entryCount
        || !(delta.substrateClass instanceof Uint8Array) || delta.substrateClass.length !== entryCount
        || !(delta.biomeWeights instanceof Uint8Array)
            || delta.biomeWeights.length !== entryCount * BIOME_BASIS_COUNT
        || !(delta.vegetationDensity instanceof Uint8Array)
            || delta.vegetationDensity.length !== entryCount
        || !(delta.vegetationProfile instanceof Uint8Array)
            || delta.vegetationProfile.length !== entryCount) {
        throw new TypeError("sparse semantic delta arrays do not match the frozen layout");
    }

    let previousTileIndex = -1;
    for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
        const tileIndex = delta.tileIndex[entryIndex];
        const mask = delta.fieldMask[entryIndex];
        const biomeOffset = entryIndex * BIOME_BASIS_COUNT;
        if (tileIndex <= previousTileIndex || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT) {
            throw new Error("sparse semantic delta tile indices must be unique ascending X-major indices");
        }
        previousTileIndex = tileIndex;
        if (mask === 0 || (mask & ~SEMANTIC_DELTA_ALL_FIELDS) !== 0) {
            throw new RangeError("sparse semantic delta field mask is empty or unknown");
        }
        if ((mask & SEMANTIC_DELTA_FIELD_HEIGHT) === 0 && delta.macroHeight[entryIndex] !== 0) {
            throw new Error("sparse semantic delta unused height slot must be zero");
        }
        if ((mask & SEMANTIC_DELTA_FIELD_SUBSTRATE) !== 0) {
            if (delta.substrateClass[entryIndex] >= limits.substrateCount) {
                throw new RangeError("sparse semantic delta substrate exceeds its catalog");
            }
        } else if (delta.substrateClass[entryIndex] !== 0) {
            throw new Error("sparse semantic delta unused substrate slot must be zero");
        }
        const biomeSum = delta.biomeWeights[biomeOffset]
            + delta.biomeWeights[biomeOffset + 1]
            + delta.biomeWeights[biomeOffset + 2]
            + delta.biomeWeights[biomeOffset + 3];
        if ((mask & SEMANTIC_DELTA_FIELD_BIOME) !== 0) {
            if (biomeSum !== 255) {
                throw new RangeError("sparse semantic delta biome weights must sum to 255");
            }
        } else if (biomeSum !== 0) {
            throw new Error("sparse semantic delta unused biome slots must be zero");
        }
        if ((mask & SEMANTIC_DELTA_FIELD_VEGETATION) !== 0) {
            if (delta.vegetationProfile[entryIndex] >= limits.vegetationProfileCount) {
                throw new RangeError("sparse semantic delta vegetation profile exceeds its catalog");
            }
        } else if (delta.vegetationDensity[entryIndex] !== 0
            || delta.vegetationProfile[entryIndex] !== 0) {
            throw new Error("sparse semantic delta unused vegetation slots must be zero");
        }
    }
}

export function createSparseSemanticDelta(
    input: Readonly<SparseSemanticDeltaInput>,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): SparseSemanticDelta {
    if (!input || typeof input !== "object") throw new TypeError("sparse semantic delta input is required");
    const delta: SparseSemanticDelta = Object.freeze({
        formatVersion: SPARSE_SEMANTIC_DELTA_FORMAT_VERSION,
        worldIdentity: input.worldIdentity,
        key: Object.freeze({ chunkX: input.key.chunkX, chunkY: input.key.chunkY }),
        revision: input.revision,
        tileIndex: input.tileIndex,
        fieldMask: input.fieldMask,
        macroHeight: input.macroHeight,
        substrateClass: input.substrateClass,
        biomeWeights: input.biomeWeights,
        vegetationDensity: input.vegetationDensity,
        vegetationProfile: input.vegetationProfile
    });
    assertSparseSemanticDelta(delta, limits);
    return delta;
}

export function sparseSemanticDeltaEntryIndex(
    delta: Readonly<SparseSemanticDelta>,
    tileIndex: number
): number {
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= BASE_SEMANTIC_CHUNK_TILE_COUNT) {
        throw new RangeError("sparse semantic delta lookup tile index is invalid");
    }
    let minimum = 0;
    let maximum = delta.tileIndex.length - 1;
    while (minimum <= maximum) {
        const middle = (minimum + maximum) >>> 1;
        const candidate = delta.tileIndex[middle];
        if (candidate === tileIndex) return middle;
        if (candidate < tileIndex) minimum = middle + 1;
        else maximum = middle - 1;
    }
    return -1;
}

export function sparseSemanticDeltaSerializedBytes(delta: Readonly<SparseSemanticDelta>): number {
    const identityBytes = new TextEncoder().encode(delta.worldIdentity).byteLength;
    return offsets(identityBytes, delta.tileIndex.length).totalBytes;
}

export function serializeSparseSemanticDelta(
    delta: Readonly<SparseSemanticDelta>,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): ArrayBuffer {
    assertSparseSemanticDelta(delta, limits);
    const identity = new TextEncoder().encode(delta.worldIdentity);
    const layout = offsets(identity.byteLength, delta.tileIndex.length);
    const buffer = new ArrayBuffer(layout.totalBytes);
    const view = new DataView(buffer);
    view.setUint32(0, SERIALIZED_MAGIC, true);
    view.setUint16(4, delta.formatVersion, true);
    view.setUint16(6, SPARSE_SEMANTIC_DELTA_HEADER_BYTES, true);
    view.setBigInt64(8, BigInt(delta.key.chunkX), true);
    view.setBigInt64(16, BigInt(delta.key.chunkY), true);
    view.setBigUint64(24, BigInt(delta.revision), true);
    view.setUint32(32, identity.byteLength, true);
    view.setUint16(36, delta.tileIndex.length, true);
    view.setUint16(38, SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY, true);
    new Uint8Array(buffer, layout.identity, identity.byteLength).set(identity);
    for (let index = 0; index < delta.tileIndex.length; index += 1) {
        view.setUint16(layout.tileIndex + index * Uint16Array.BYTES_PER_ELEMENT, delta.tileIndex[index], true);
        view.setUint16(layout.macroHeight + index * Uint16Array.BYTES_PER_ELEMENT, delta.macroHeight[index], true);
    }
    new Uint8Array(buffer, layout.fieldMask, delta.fieldMask.length).set(delta.fieldMask);
    new Uint8Array(buffer, layout.substrateClass, delta.substrateClass.length).set(delta.substrateClass);
    new Uint8Array(buffer, layout.biomeWeights, delta.biomeWeights.length).set(delta.biomeWeights);
    new Uint8Array(buffer, layout.vegetationDensity, delta.vegetationDensity.length)
        .set(delta.vegetationDensity);
    new Uint8Array(buffer, layout.vegetationProfile, delta.vegetationProfile.length)
        .set(delta.vegetationProfile);
    return buffer;
}

export function deserializeSparseSemanticDelta(
    buffer: ArrayBuffer,
    limits: Readonly<BaseSemanticChunkCatalogLimits>
): SparseSemanticDelta {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < SPARSE_SEMANTIC_DELTA_HEADER_BYTES) {
        throw new TypeError("serialized sparse semantic delta has an invalid byte length");
    }
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== SERIALIZED_MAGIC
        || view.getUint16(4, true) !== SPARSE_SEMANTIC_DELTA_FORMAT_VERSION
        || view.getUint16(6, true) !== SPARSE_SEMANTIC_DELTA_HEADER_BYTES
        || view.getUint16(38, true) !== SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY) {
        throw new TypeError("serialized sparse semantic delta header is invalid or unsupported");
    }
    const identityBytes = view.getUint32(32, true);
    const entryCount = view.getUint16(36, true);
    const layout = offsets(identityBytes, entryCount);
    if (layout.totalBytes !== buffer.byteLength) {
        throw new TypeError("serialized sparse semantic delta byte length does not match its header");
    }
    let worldIdentity: string;
    try {
        worldIdentity = new TextDecoder("utf-8", { fatal: true }).decode(
            new Uint8Array(buffer, layout.identity, identityBytes)
        );
    } catch {
        throw new TypeError("serialized sparse semantic delta world identity is not valid UTF-8");
    }
    const tileIndex = new Uint16Array(entryCount);
    const macroHeight = new Uint16Array(entryCount);
    for (let index = 0; index < entryCount; index += 1) {
        tileIndex[index] = view.getUint16(layout.tileIndex + index * Uint16Array.BYTES_PER_ELEMENT, true);
        macroHeight[index] = view.getUint16(
            layout.macroHeight + index * Uint16Array.BYTES_PER_ELEMENT,
            true
        );
    }
    return createSparseSemanticDelta({
        worldIdentity,
        key: {
            chunkX: safeBigIntNumber("sparse semantic delta chunk x", view.getBigInt64(8, true)),
            chunkY: safeBigIntNumber("sparse semantic delta chunk y", view.getBigInt64(16, true))
        },
        revision: safeBigIntNumber("sparse semantic delta revision", view.getBigUint64(24, true)),
        tileIndex,
        fieldMask: new Uint8Array(buffer, layout.fieldMask, entryCount).slice(),
        macroHeight,
        substrateClass: new Uint8Array(buffer, layout.substrateClass, entryCount).slice(),
        biomeWeights: new Uint8Array(buffer, layout.biomeWeights, entryCount * BIOME_BASIS_COUNT).slice(),
        vegetationDensity: new Uint8Array(buffer, layout.vegetationDensity, entryCount).slice(),
        vegetationProfile: new Uint8Array(buffer, layout.vegetationProfile, entryCount).slice()
    }, limits);
}
