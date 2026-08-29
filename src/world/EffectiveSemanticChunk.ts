import {
    BaseSemanticChunk,
    BaseSemanticTileView,
    LocalTileBounds,
    SemanticChunkKey,
    assertBaseSemanticChunk,
    semanticBiomeWeightIndex,
    semanticCatalogLimits,
    semanticClimateIndex,
    semanticTileIndex
} from "./BaseSemanticChunk";
import {
    SEMANTIC_DELTA_FIELD_BIOME,
    SEMANTIC_DELTA_FIELD_HEIGHT,
    SEMANTIC_DELTA_FIELD_SUBSTRATE,
    SEMANTIC_DELTA_FIELD_VEGETATION,
    SparseSemanticDelta,
    assertSparseSemanticDelta,
    sparseSemanticDeltaEntryIndex
} from "./SparseSemanticDelta";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import {
    WorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

export interface EffectiveSemanticChunk {
    readonly worldIdentity: string;
    readonly key: SemanticChunkKey;
    readonly effectiveRevision: number;
    readonly baseRevision: number;
    readonly deltaRevision: number;
    readonly validBounds: LocalTileBounds;
    readonly base: BaseSemanticChunk;
    readonly delta?: SparseSemanticDelta;
}

export interface CreateEffectiveSemanticChunkOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly base: BaseSemanticChunk;
    readonly delta?: SparseSemanticDelta;
    readonly effectiveRevision: number;
}

function tileIndexIsWithinBounds(tileIndex: number, bounds: Readonly<LocalTileBounds>): boolean {
    const localX = Math.floor(tileIndex / WORLD_SEMANTIC_CHUNK_SIZE);
    const localY = tileIndex - localX * WORLD_SEMANTIC_CHUNK_SIZE;
    return localX >= bounds.minX && localX < bounds.maxXExclusive
        && localY >= bounds.minY && localY < bounds.maxYExclusive;
}

export function createEffectiveSemanticChunk(
    options: Readonly<CreateEffectiveSemanticChunkOptions>
): EffectiveSemanticChunk {
    if (!options || typeof options !== "object") {
        throw new TypeError("effective semantic chunk options are required");
    }
    const limits = semanticCatalogLimits(options.descriptor);
    assertBaseSemanticChunk(options.base, limits);
    const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
    if (!Number.isSafeInteger(options.effectiveRevision) || options.effectiveRevision < 0) {
        throw new RangeError("effective semantic revision must be a non-negative safe integer");
    }
    let deltaRevision = 0;
    if (options.delta) {
        assertSparseSemanticDelta(options.delta, limits);
        if (options.delta.worldIdentity !== worldIdentity
            || options.delta.key.chunkX !== options.base.key.chunkX
            || options.delta.key.chunkY !== options.base.key.chunkY) {
            throw new TypeError("semantic delta identity or key does not match its base chunk");
        }
        if (options.delta.revision > options.effectiveRevision) {
            throw new RangeError("semantic delta revision is newer than its effective snapshot");
        }
        for (const tileIndex of options.delta.tileIndex) {
            if (!tileIndexIsWithinBounds(tileIndex, options.base.validBounds)) {
                throw new RangeError("semantic delta tile lies outside its base chunk valid bounds");
            }
        }
        deltaRevision = options.delta.revision;
    }
    return Object.freeze({
        worldIdentity,
        key: options.base.key,
        effectiveRevision: options.effectiveRevision,
        baseRevision: options.base.revision,
        deltaRevision,
        validBounds: options.base.validBounds,
        base: options.base,
        ...(options.delta ? { delta: options.delta } : {})
    });
}

export function getEffectiveSemanticTile(
    chunk: Readonly<EffectiveSemanticChunk>,
    localX: number,
    localY: number
): BaseSemanticTileView {
    const tileIndex = semanticTileIndex(localX, localY);
    if (!tileIndexIsWithinBounds(tileIndex, chunk.validBounds)) {
        throw new RangeError("effective semantic tile lies outside chunk valid bounds");
    }
    const baseBiomeOffset = semanticBiomeWeightIndex(tileIndex, 0);
    const climateOffset = semanticClimateIndex(tileIndex, 0);
    const deltaEntry = chunk.delta ? sparseSemanticDeltaEntryIndex(chunk.delta, tileIndex) : -1;
    if (deltaEntry < 0 || !chunk.delta) {
        return Object.freeze({
            substrateClass: chunk.base.substrateClass[tileIndex],
            macroHeight: chunk.base.macroHeight[tileIndex],
            biomeWeights: Object.freeze([
                chunk.base.biomeWeights[baseBiomeOffset],
                chunk.base.biomeWeights[baseBiomeOffset + 1],
                chunk.base.biomeWeights[baseBiomeOffset + 2],
                chunk.base.biomeWeights[baseBiomeOffset + 3]
            ] as const),
            temperature: chunk.base.climate[climateOffset],
            moisture: chunk.base.climate[climateOffset + 1],
            vegetationDensity: chunk.base.vegetationDensity[tileIndex],
            vegetationProfile: chunk.base.vegetationProfile[tileIndex]
        });
    }
    const mask = chunk.delta.fieldMask[deltaEntry];
    const deltaBiomeOffset = deltaEntry * 4;
    return Object.freeze({
        substrateClass: (mask & SEMANTIC_DELTA_FIELD_SUBSTRATE) !== 0
            ? chunk.delta.substrateClass[deltaEntry] : chunk.base.substrateClass[tileIndex],
        macroHeight: (mask & SEMANTIC_DELTA_FIELD_HEIGHT) !== 0
            ? chunk.delta.macroHeight[deltaEntry] : chunk.base.macroHeight[tileIndex],
        biomeWeights: (mask & SEMANTIC_DELTA_FIELD_BIOME) !== 0
            ? Object.freeze([
                chunk.delta.biomeWeights[deltaBiomeOffset],
                chunk.delta.biomeWeights[deltaBiomeOffset + 1],
                chunk.delta.biomeWeights[deltaBiomeOffset + 2],
                chunk.delta.biomeWeights[deltaBiomeOffset + 3]
            ] as const)
            : Object.freeze([
                chunk.base.biomeWeights[baseBiomeOffset],
                chunk.base.biomeWeights[baseBiomeOffset + 1],
                chunk.base.biomeWeights[baseBiomeOffset + 2],
                chunk.base.biomeWeights[baseBiomeOffset + 3]
            ] as const),
        temperature: chunk.base.climate[climateOffset],
        moisture: chunk.base.climate[climateOffset + 1],
        vegetationDensity: (mask & SEMANTIC_DELTA_FIELD_VEGETATION) !== 0
            ? chunk.delta.vegetationDensity[deltaEntry] : chunk.base.vegetationDensity[tileIndex],
        vegetationProfile: (mask & SEMANTIC_DELTA_FIELD_VEGETATION) !== 0
            ? chunk.delta.vegetationProfile[deltaEntry] : chunk.base.vegetationProfile[tileIndex]
    });
}
