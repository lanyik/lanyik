import {
    SubstrateClass,
    WORLD_SUBSTRATE_CATALOG,
    WORLD_VEGETATION_PROFILE_CATALOG
} from "./WorldSemanticCatalog";
import {
    assertSemanticChunkKey,
    semanticChunkLocalIndex,
    SemanticChunkKey,
    WORLD_SEMANTIC_CHUNK_TILE_COUNT
} from "./WorldSemanticFormat";

export enum SemanticOverrideField {
    Substrate = 1 << 0,
    MacroHeight = 1 << 1,
    BiomeWeights = 1 << 2,
    VegetationDensity = 1 << 3,
    VegetationProfile = 1 << 4
}

const ALL_SEMANTIC_OVERRIDE_FIELDS = SemanticOverrideField.Substrate
    | SemanticOverrideField.MacroHeight
    | SemanticOverrideField.BiomeWeights
    | SemanticOverrideField.VegetationDensity
    | SemanticOverrideField.VegetationProfile;

export interface SparseSemanticTileOverride {
    readonly localX: number;
    readonly localY: number;
    readonly substrateClass?: SubstrateClass;
    readonly macroHeight?: number;
    readonly biomeWeights?: readonly [number, number, number, number];
    readonly vegetationDensity?: number;
    readonly vegetationProfile?: number;
}

export interface SparseSemanticDelta {
    readonly key: SemanticChunkKey;
    readonly revision: number;
    readonly indices: Uint16Array;
    readonly masks: Uint8Array;
    readonly substrateClass: Uint8Array;
    readonly macroHeight: Uint16Array;
    readonly biomeWeights: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationProfile: Uint8Array;
}

export interface CreateSparseSemanticDeltaOptions {
    readonly key: SemanticChunkKey;
    readonly revision: number;
    readonly overrides: readonly SparseSemanticTileOverride[];
}

function assertPositiveRevision(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive safe integer`);
    }
}

function assertUint8(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new RangeError(`${name} must be a Uint8 value`);
    }
}

function assertUint16(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new RangeError(`${name} must be a Uint16 value`);
    }
}

function assertBiomeWeights(value: readonly number[]): void {
    if (!Array.isArray(value) || value.length !== 4) {
        throw new TypeError("semantic biomeWeights must contain exactly four values");
    }
    for (const weight of value) assertUint8("semantic biome weight", weight);
    if (value[0] + value[1] + value[2] + value[3] !== 255) {
        throw new RangeError("semantic biomeWeights must sum to 255");
    }
}

function assertTileOverride(value: SparseSemanticTileOverride): { readonly index: number; readonly mask: number } {
    if (!value || typeof value !== "object") throw new TypeError("semantic tile override must be an object");
    const allowedFields = new Set([
        "localX",
        "localY",
        "substrateClass",
        "macroHeight",
        "biomeWeights",
        "vegetationDensity",
        "vegetationProfile"
    ]);
    if (Object.getOwnPropertyNames(value).some(name => !allowedFields.has(name))) {
        throw new TypeError("semantic tile override contains unknown fields");
    }
    const index = semanticChunkLocalIndex(value.localX, value.localY);
    let mask = 0;
    if (value.substrateClass !== undefined) {
        if (!Number.isInteger(value.substrateClass)
            || value.substrateClass < 0
            || value.substrateClass >= WORLD_SUBSTRATE_CATALOG.length) {
            throw new RangeError("semantic substrate override is not in the frozen catalog");
        }
        mask |= SemanticOverrideField.Substrate;
    }
    if (value.macroHeight !== undefined) {
        assertUint16("semantic macroHeight override", value.macroHeight);
        mask |= SemanticOverrideField.MacroHeight;
    }
    if (value.biomeWeights !== undefined) {
        assertBiomeWeights(value.biomeWeights);
        mask |= SemanticOverrideField.BiomeWeights;
    }
    if (value.vegetationDensity !== undefined) {
        assertUint8("semantic vegetationDensity override", value.vegetationDensity);
        mask |= SemanticOverrideField.VegetationDensity;
    }
    if (value.vegetationProfile !== undefined) {
        if (!Number.isInteger(value.vegetationProfile)
            || value.vegetationProfile < 0
            || value.vegetationProfile >= WORLD_VEGETATION_PROFILE_CATALOG.length) {
            throw new RangeError("semantic vegetationProfile override is not in the frozen catalog");
        }
        mask |= SemanticOverrideField.VegetationProfile;
    }
    if (mask === 0) throw new TypeError("semantic tile override must replace at least one authority field");
    return { index, mask };
}

export function createSparseSemanticDelta(options: CreateSparseSemanticDeltaOptions): SparseSemanticDelta {
    if (!options || typeof options !== "object") throw new TypeError("sparse semantic delta options are required");
    assertSemanticChunkKey(options.key);
    assertPositiveRevision("semantic delta revision", options.revision);
    if (!Array.isArray(options.overrides) || options.overrides.length === 0
        || options.overrides.length > WORLD_SEMANTIC_CHUNK_TILE_COUNT) {
        throw new RangeError("sparse semantic delta must contain between 1 and 1024 tile overrides");
    }
    const sorted = options.overrides.map(override => ({
        override,
        ...assertTileOverride(override)
    })).sort((first, second) => first.index - second.index);
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index - 1].index === sorted[index].index) {
            throw new TypeError("sparse semantic delta contains duplicate tile coordinates");
        }
    }

    const count = sorted.length;
    const indices = new Uint16Array(count);
    const masks = new Uint8Array(count);
    const substrateClass = new Uint8Array(count);
    const macroHeight = new Uint16Array(count);
    const biomeWeights = new Uint8Array(count * 4);
    const vegetationDensity = new Uint8Array(count);
    const vegetationProfile = new Uint8Array(count);
    for (let offset = 0; offset < count; offset += 1) {
        const { override, index, mask } = sorted[offset];
        indices[offset] = index;
        masks[offset] = mask;
        if (mask & SemanticOverrideField.Substrate) substrateClass[offset] = override.substrateClass as number;
        if (mask & SemanticOverrideField.MacroHeight) macroHeight[offset] = override.macroHeight as number;
        if (mask & SemanticOverrideField.BiomeWeights) {
            biomeWeights.set(override.biomeWeights as readonly number[], offset * 4);
        }
        if (mask & SemanticOverrideField.VegetationDensity) {
            vegetationDensity[offset] = override.vegetationDensity as number;
        }
        if (mask & SemanticOverrideField.VegetationProfile) {
            vegetationProfile[offset] = override.vegetationProfile as number;
        }
    }
    const delta: SparseSemanticDelta = Object.freeze({
        key: Object.freeze({ ...options.key }),
        revision: options.revision,
        indices,
        masks,
        substrateClass,
        macroHeight,
        biomeWeights,
        vegetationDensity,
        vegetationProfile
    });
    assertSparseSemanticDelta(delta);
    return delta;
}

export function assertSparseSemanticDelta(value: unknown): asserts value is SparseSemanticDelta {
    if (!value || typeof value !== "object") throw new TypeError("sparse semantic delta must be an object");
    const delta = value as SparseSemanticDelta;
    const allowedFields = new Set([
        "key",
        "revision",
        "indices",
        "masks",
        "substrateClass",
        "macroHeight",
        "biomeWeights",
        "vegetationDensity",
        "vegetationProfile"
    ]);
    if (Object.getOwnPropertyNames(delta).some(name => !allowedFields.has(name))) {
        throw new TypeError("sparse semantic delta contains unknown fields");
    }
    assertSemanticChunkKey(delta.key);
    assertPositiveRevision("semantic delta revision", delta.revision);
    if (!(delta.indices instanceof Uint16Array) || delta.indices.length === 0
        || delta.indices.length > WORLD_SEMANTIC_CHUNK_TILE_COUNT) {
        throw new TypeError("semantic delta indices must be a non-empty Uint16Array");
    }
    const count = delta.indices.length;
    if (!(delta.masks instanceof Uint8Array) || delta.masks.length !== count
        || !(delta.substrateClass instanceof Uint8Array) || delta.substrateClass.length !== count
        || !(delta.macroHeight instanceof Uint16Array) || delta.macroHeight.length !== count
        || !(delta.biomeWeights instanceof Uint8Array) || delta.biomeWeights.length !== count * 4
        || !(delta.vegetationDensity instanceof Uint8Array) || delta.vegetationDensity.length !== count
        || !(delta.vegetationProfile instanceof Uint8Array) || delta.vegetationProfile.length !== count) {
        throw new TypeError("semantic delta column lengths are inconsistent");
    }
    for (let offset = 0; offset < count; offset += 1) {
        const index = delta.indices[offset];
        const mask = delta.masks[offset];
        if (index >= WORLD_SEMANTIC_CHUNK_TILE_COUNT
            || offset > 0 && index <= delta.indices[offset - 1]
            || mask === 0 || (mask & ~ALL_SEMANTIC_OVERRIDE_FIELDS) !== 0) {
            throw new TypeError("semantic delta indices or masks are not canonical");
        }
        if (mask & SemanticOverrideField.Substrate) {
            if (delta.substrateClass[offset] >= WORLD_SUBSTRATE_CATALOG.length) {
                throw new RangeError("semantic delta substrate class is not in the frozen catalog");
            }
        } else if (delta.substrateClass[offset] !== 0) {
            throw new TypeError("unused semantic substrate columns must be zero");
        }
        if (!(mask & SemanticOverrideField.MacroHeight) && delta.macroHeight[offset] !== 0) {
            throw new TypeError("unused semantic height columns must be zero");
        }
        const biomeOffset = offset * 4;
        if (mask & SemanticOverrideField.BiomeWeights) {
            assertBiomeWeights(Array.from(delta.biomeWeights.subarray(biomeOffset, biomeOffset + 4)));
        } else if (delta.biomeWeights[biomeOffset] !== 0 || delta.biomeWeights[biomeOffset + 1] !== 0
            || delta.biomeWeights[biomeOffset + 2] !== 0 || delta.biomeWeights[biomeOffset + 3] !== 0) {
            throw new TypeError("unused semantic biome columns must be zero");
        }
        if (!(mask & SemanticOverrideField.VegetationDensity) && delta.vegetationDensity[offset] !== 0) {
            throw new TypeError("unused semantic vegetation density columns must be zero");
        }
        if (mask & SemanticOverrideField.VegetationProfile) {
            if (delta.vegetationProfile[offset] >= WORLD_VEGETATION_PROFILE_CATALOG.length) {
                throw new RangeError("semantic delta vegetation profile is not in the frozen catalog");
            }
        } else if (delta.vegetationProfile[offset] !== 0) {
            throw new TypeError("unused semantic vegetation profile columns must be zero");
        }
    }
}

export function cloneSparseSemanticDelta(delta: SparseSemanticDelta): SparseSemanticDelta {
    assertSparseSemanticDelta(delta);
    const clone: SparseSemanticDelta = Object.freeze({
        key: Object.freeze({ ...delta.key }),
        revision: delta.revision,
        indices: delta.indices.slice(),
        masks: delta.masks.slice(),
        substrateClass: delta.substrateClass.slice(),
        macroHeight: delta.macroHeight.slice(),
        biomeWeights: delta.biomeWeights.slice(),
        vegetationDensity: delta.vegetationDensity.slice(),
        vegetationProfile: delta.vegetationProfile.slice()
    });
    assertSparseSemanticDelta(clone);
    return clone;
}

export function sparseSemanticDeltaOverrideOffset(delta: SparseSemanticDelta, tileIndex: number): number {
    if (!(delta?.indices instanceof Uint16Array)) {
        throw new TypeError("semantic delta lookup requires canonical Uint16 indices");
    }
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= WORLD_SEMANTIC_CHUNK_TILE_COUNT) {
        throw new RangeError("semantic delta lookup index is outside the chunk");
    }
    let low = 0;
    let high = delta.indices.length - 1;
    while (low <= high) {
        const middle = (low + high) >>> 1;
        const candidate = delta.indices[middle];
        if (candidate === tileIndex) return middle;
        if (candidate < tileIndex) low = middle + 1;
        else high = middle - 1;
    }
    return -1;
}

export function sparseSemanticDeltaByteLength(delta: SparseSemanticDelta): number {
    assertSparseSemanticDelta(delta);
    return delta.indices.byteLength
        + delta.masks.byteLength
        + delta.substrateClass.byteLength
        + delta.macroHeight.byteLength
        + delta.biomeWeights.byteLength
        + delta.vegetationDensity.byteLength
        + delta.vegetationProfile.byteLength;
}
