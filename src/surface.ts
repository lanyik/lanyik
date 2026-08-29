export {
    SURFACE_COMPILE_PROFILE,
    SURFACE_COMPILE_PROFILE_VERSION,
    SURFACE_CORE_TEXELS,
    WORLD_SEMANTIC_CHUNK_SIZE,
    HYDROLOGY_REGION_SIZE,
    surfaceInfluenceRadiusWorld
} from "./world/SurfaceCompileProfile";
export type { SurfaceCompileProfile } from "./world/SurfaceCompileProfile";

export {
    HALF_FLOAT_POSITIVE_INFINITY,
    HALF_FLOAT_CANONICAL_NAN,
    HALF_FLOAT_MAX_FINITE,
    float32ToFloat16Bits,
    float16BitsToFloat32,
    finiteFloat16Bits
} from "./world/HalfFloat";

export {
    SURFACE_COMPILER_REVISION,
    COMPILED_SURFACE_FIELD_FORMAT_VERSION,
    COMPILED_SURFACE_TEXEL_COUNT,
    SURFACE_WATER_KIND_NONE,
    SURFACE_WATER_KIND_OCEAN,
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_RIVER,
    surfaceFieldTexelIndex,
    assertCompiledSurfaceField,
    createCompiledSurfaceField,
    compiledSurfaceFieldResidentBytes,
    compiledSurfaceFieldTransferables
} from "./world/CompiledSurfaceField";
export type {
    CompiledSurfaceField,
    CompiledSurfaceFieldInput
} from "./world/CompiledSurfaceField";

export {
    SURFACE_DEPENDENCY_KEY_FORMAT_VERSION,
    MAX_SURFACE_DEPENDENCY_SEMANTIC_CHUNKS,
    MAX_SURFACE_DEPENDENCY_HYDROLOGY_REGIONS,
    MAX_SURFACE_DEPENDENCY_HYDROLOGY_FEATURES,
    assertSurfaceRequestToken,
    createSurfaceRequestToken,
    surfaceRequestTokensEqual,
    assertSurfaceDependencyKey,
    createSurfaceDependencyKey,
    serializeSurfaceDependencyKey,
    surfaceDependencyKeysEqual
} from "./world/SurfaceDependencyKey";
export type {
    RenderChunkKey,
    SurfaceCompileMetrics,
    SurfaceSemanticDependency,
    SurfaceHydrologyRegionDependency,
    SurfaceHydrologyFeatureDependency,
    SurfaceDependencyKey,
    SurfaceDependencyKeyInput,
    SurfaceRequestToken
} from "./world/SurfaceDependencyKey";

export {
    TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION,
    EFFECTIVE_WINDOW_TILE_SIZE,
    EFFECTIVE_WINDOW_TILE_COUNT,
    assertTransferableEffectiveWindow,
    buildTransferableEffectiveWindow,
    transferableEffectiveWindowTransferables
} from "./world/TransferableEffectiveWindow";
export type {
    TransferableHydrologyRegionSlice,
    TransferableWorldDomain,
    TransferableEffectiveWindow,
    BuildTransferableEffectiveWindowOptions
} from "./world/TransferableEffectiveWindow";

export { compileSemanticSurfaceField } from "./world/compileSemanticSurfaceField";

export {
    COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION,
    MAX_COMPILED_WATER_BODIES,
    assertCompiledWaterBodyPalette,
    createCompiledWaterBodyPalette,
    compiledWaterBodyPaletteIndex
} from "./world/CompiledWaterBodyPalette";
export type {
    CompiledWaterBodyKind,
    CompiledWaterBody,
    CompiledWaterBodyPalette
} from "./world/CompiledWaterBodyPalette";
export { compileOceanSurfaceField } from "./world/compileOceanSurfaceField";
export type { OceanSurfaceCompilation } from "./world/compileOceanSurfaceField";
export {
    MAX_SURFACE_PERIODIC_FEATURE_IMAGES,
    compileLakeSurfaceField
} from "./world/compileLakeSurfaceField";
export type { LakeSurfaceCompilation } from "./world/compileLakeSurfaceField";
export { compileSurfaceField } from "./world/compileSurfaceField";
export type { SurfaceFieldCompilation } from "./world/compileSurfaceField";

export {
    SURFACE_STATIC_GPU_BYTES_PER_TEXEL,
    SURFACE_FOG_GPU_BYTES_PER_TEXEL,
    SURFACE_TEXTURE_PAGE_GPU_BYTES,
    readSurfaceArrayTextureCapabilities,
    SurfaceTexturePool
} from "./rendering/SurfaceTexturePool";

export {
    SURFACE_GROUND_LODS,
    assertSurfaceGroundGeometryData,
    createSurfaceGroundGeometryData,
    createSurfaceGroundGeometry,
    SurfaceGroundGeometrySet
} from "./rendering/SurfaceGroundGeometry";
export type {
    SurfaceGroundLod,
    SurfaceGroundGeometryData
} from "./rendering/SurfaceGroundGeometry";
export type {
    SurfaceTextureCapabilitySource,
    SurfaceArrayTextureCapabilities,
    SurfaceTexturePoolOptions,
    SurfaceTextureSlotHandle,
    SurfaceTexturePageBindings,
    SurfaceTexturePoolStats
} from "./rendering/SurfaceTexturePool";

export {
    surfaceColumnStagger,
    surfaceStagger,
    surfaceToWorld,
    worldToSurface,
    surfaceTexelCenterAxis
} from "./world/SurfaceLattice";

export {
    WORLD_GENERATOR_VERSION_V2,
    WORLD_DESCRIPTOR_FORMAT_VERSION_V2,
    WORLD_CHUNK_FORMAT_VERSION_V2,
    HYDROLOGY_REGION_FORMAT_VERSION,
    createWorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2,
    worldDescriptorsV2Equal
} from "./world/WorldDescriptorV2";
export type {
    WorldDescriptorV2,
    StaticWorldDescriptorV2,
    InfiniteWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    WorldDescriptorV2Semantics,
    SemanticBasisIdentity,
    SemanticCatalogIdentity
} from "./world/WorldDescriptorV2";

export {
    CORE_SUBSTRATE_ENTRIES,
    CORE_VEGETATION_PROFILE_ENTRIES,
    CORE_WORLD_SEMANTICS_V2,
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2,
    assertCoreWorldSemanticsV2
} from "./world/SemanticCatalogsV2";

export {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES,
    semanticTileIndex,
    semanticBiomeWeightIndex,
    semanticClimateIndex,
    semanticCatalogLimits,
    assertBaseSemanticChunk,
    getBaseSemanticTile,
    serializeBaseSemanticChunk,
    deserializeBaseSemanticChunk
} from "./world/BaseSemanticChunk";
export type {
    BaseSemanticChunk,
    BaseSemanticTileView,
    SemanticChunkKey,
    LocalTileBounds
} from "./world/BaseSemanticChunk";

export {
    createBaseSemanticChunkGenerator,
    generateBaseSemanticChunk,
    semanticGeneratorIdentity
} from "./world/generateBaseSemanticChunk";
export type {
    BaseSemanticChunkGenerator,
    GenerateBaseSemanticChunkOptions
} from "./world/generateBaseSemanticChunk";

export {
    SPARSE_SEMANTIC_DELTA_FORMAT_VERSION,
    SPARSE_SEMANTIC_DELTA_HEADER_BYTES,
    SPARSE_SEMANTIC_DELTA_BYTES_PER_ENTRY,
    SEMANTIC_DELTA_FIELD_HEIGHT,
    SEMANTIC_DELTA_FIELD_SUBSTRATE,
    SEMANTIC_DELTA_FIELD_BIOME,
    SEMANTIC_DELTA_FIELD_VEGETATION,
    SEMANTIC_DELTA_ALL_FIELDS,
    assertSparseSemanticDelta,
    createSparseSemanticDelta,
    sparseSemanticDeltaEntryIndex,
    sparseSemanticDeltaSerializedBytes,
    serializeSparseSemanticDelta,
    deserializeSparseSemanticDelta
} from "./world/SparseSemanticDelta";
export type {
    SparseSemanticDelta,
    SparseSemanticDeltaInput
} from "./world/SparseSemanticDelta";

export {
    createEffectiveSemanticChunk,
    getEffectiveSemanticTile
} from "./world/EffectiveSemanticChunk";
export type {
    EffectiveSemanticChunk,
    CreateEffectiveSemanticChunkOptions
} from "./world/EffectiveSemanticChunk";

export {
    HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION,
    MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS,
    MAX_AUTHORED_LAKE_POLYGON_POINTS,
    authoredHydrologyPoint,
    assertAuthoredRiverFeature,
    createAuthoredRiverFeature,
    assertAuthoredLakeFeature,
    createAuthoredLakeFeature,
    assertHydrologyFeatureDelta,
    createHydrologyFeatureDelta
} from "./world/HydrologyFeatureDelta";
export type {
    AuthoredHydrologyFeatureKind,
    AuthoredRiverSource,
    AuthoredRiverOutlet,
    AuthoredRiverFeature,
    AuthoredLakeFeature,
    AuthoredHydrologyFeature,
    HydrologyFeatureUpsertDelta,
    HydrologyFeatureDeleteDelta,
    HydrologyFeatureDelta,
    HydrologyFeatureDeltaInput
} from "./world/HydrologyFeatureDelta";

export {
    SURFACE_DELTA_TRANSACTION_FORMAT_VERSION,
    MAX_SURFACE_DELTA_TRANSACTION_MUTATIONS,
    MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL,
    SurfaceDeltaConflictError,
    SurfaceDeltaSnapshot,
    MemorySurfaceDeltaStore
} from "./world/SurfaceDeltaStore";
export type {
    SurfaceSemanticDeltaPayload,
    SurfaceSemanticUpsertMutation,
    SurfaceSemanticDeleteMutation,
    SurfaceSemanticMutation,
    SurfaceHydrologyUpsertMutation,
    SurfaceHydrologyDeleteMutation,
    SurfaceHydrologyMutation,
    SurfaceDeltaTransactionInput,
    SurfaceSemanticUpsertChange,
    SurfaceSemanticDeleteChange,
    SurfaceSemanticChange,
    SurfaceHydrologyChange,
    SurfaceDeltaCommit,
    SurfaceSemanticDeltaState,
    EffectiveHydrologyGraphNode,
    BaseHydrologyFeatureIndex,
    SurfaceDeltaStore
} from "./world/SurfaceDeltaStore";

export {
    HYDROLOGY_FEATURE_SPATIAL_INDEX_LEAF_SIZE,
    MAX_HYDROLOGY_FEATURE_SPATIAL_INDEX_ITEMS,
    authoredHydrologyFeatureBoundsQ64,
    hydrologyRegionBoundsQ64,
    HydrologyFeatureSpatialIndex
} from "./world/HydrologyFeatureSpatialIndex";
export type { HydrologyFeatureBoundsQ64 } from "./world/HydrologyFeatureSpatialIndex";

export {
    createEffectiveHydrologyRegion,
    effectiveHydrologySuppressesBaseFeature,
    EffectiveWorldView
} from "./world/EffectiveWorldView";
export type {
    EffectiveHydrologyRegion,
    EffectiveBaseHydrologySlices,
    CreateEffectiveHydrologyRegionOptions,
    EffectiveWorldViewOptions,
    EffectiveWorldViewStats
} from "./world/EffectiveWorldView";

export {
    SURFACE_WORKER_PROTOCOL_VERSION,
    createGenerateSemanticChunkWorkerRequest,
    createGenerateHydrologyRegionWorkerRequest,
    assertGenerateSemanticChunkWorkerRequest,
    assertGenerateHydrologyRegionWorkerRequest
} from "./world/SurfaceWorkerProtocol";
export type {
    SurfaceWorkerRequest,
    SurfaceWorkerResponse,
    GenerateSemanticChunkWorkerRequest,
    GenerateSemanticChunkWorkerResult,
    GenerateHydrologyRegionWorkerRequest,
    GenerateHydrologyRegionWorkerResult
} from "./world/SurfaceWorkerProtocol";
export { SurfaceWorkerClient } from "./world/SurfaceWorkerClient";
export type {
    GenerateSemanticChunkOptions,
    GenerateHydrologyRegionOptions
} from "./world/SurfaceWorkerClient";
export { SurfaceWorkerPool } from "./world/SurfaceWorkerPool";
export type {
    SurfaceWorkerPoolOptions,
    SurfaceWorkerPoolStats,
    SurfaceTaskRequestOptions,
    SurfaceTaskWorkerClient
} from "./world/SurfaceWorkerPool";

export {
    DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES,
    InfiniteSemanticWorldSource,
    ToroidalSemanticWorldSource,
    StaticSemanticWorldSource,
    assertSemanticWorldSource
} from "./world/SemanticWorldSource";
export type {
    SemanticWorldSource,
    SemanticWorldBounds,
    SemanticWorldSourceStats,
    SemanticChunkPool,
    ProceduralSemanticWorldSourceOptions
} from "./world/SemanticWorldSource";

export {
    MACRO_DRAINAGE_NODE_STEP_TILES,
    MAX_MACRO_DRAINAGE_GRAPH_NODES,
    OCEAN_BODY_ID,
    buildMacroDrainageGraph,
    assertMacroDrainageGraph,
    macroDrainageNodeTile,
    macroDrainageNodeId,
    macroDrainageTerminalBodyId
} from "./world/MacroDrainageGraph";
export type {
    MacroDrainageGraph,
    BuildMacroDrainageGraphOptions
} from "./world/MacroDrainageGraph";

export {
    HYDROLOGY_REGION_REVISION,
    HYDROLOGY_POINT_QUANTIZATION,
    HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE,
    hydrologyRegionMaximumQuantizedCoordinate,
    MAX_HYDROLOGY_REGION_PORTS,
    MAX_HYDROLOGY_REGION_RIVERS,
    MAX_HYDROLOGY_REGION_LAKES,
    MAX_HYDROLOGY_REGION_MOUTHS,
    MAX_HYDROLOGY_REGION_BODIES,
    MAX_HYDROLOGY_SEGMENT_CONTROL_POINTS,
    HYDROLOGY_BOUNDARY_MIN_X,
    HYDROLOGY_BOUNDARY_MAX_X,
    HYDROLOGY_BOUNDARY_MIN_Y,
    HYDROLOGY_BOUNDARY_MAX_Y,
    OCEAN_HYDROLOGY_PROFILE,
    LAKE_HYDROLOGY_PROFILE,
    RIVER_HYDROLOGY_PROFILE,
    assertHydrologyRegion,
    createHydrologyRegion,
    hydrologyPortConnectionSignature
} from "./world/HydrologyRegion";
export type {
    HydrologyFeatureId,
    HydrologySegmentId,
    HydrologyBodyId,
    HydrologyConnectionId,
    HydrologyBodyKind,
    HydrologyRegionTopology,
    HydrologyRegionKey,
    HydrologyRegionValidBounds,
    RiverEndpoint,
    HydrologyPort,
    RiverFeatureSegment,
    LakeFeature,
    RiverMouthFeature,
    HydrologyBodyRef,
    HydrologyRegion,
    HydrologyRegionInput
} from "./world/HydrologyRegion";

export {
    MIN_RIVER_DISCHARGE,
    MIN_LAKE_RADIUS_TILES,
    MAX_LAKE_RADIUS_TILES,
    MacroDrainageHydrologySource
} from "./world/MacroDrainageHydrologySource";

export {
    DEFAULT_INFINITE_HYDROLOGY_RESIDENT_BASINS,
    MIN_INFINITE_HYDROLOGY_RESIDENT_BASINS,
    InfiniteHydrologyRegionSource
} from "./world/InfiniteHydrologyRegionSource";
export type {
    InfiniteHydrologyRegionSourceOptions,
    InfiniteHydrologyRegionSourceStats
} from "./world/InfiniteHydrologyRegionSource";

export {
    createProceduralHydrologyRegionGenerator
} from "./world/ProceduralHydrologyRegionGenerator";
export type {
    ProceduralHydrologyDescriptorV2,
    ProceduralHydrologyRegionGenerator,
    CreateProceduralHydrologyRegionGeneratorOptions
} from "./world/ProceduralHydrologyRegionGenerator";

export {
    DEFAULT_HYDROLOGY_REGION_CACHE_BYTES,
    HYDROLOGY_REGION_BASE_RESIDENT_BYTES,
    hydrologyRegionResidentBytes,
    assertHydrologyWorldSource,
    ProceduralHydrologyWorldSource
} from "./world/HydrologyWorldSource";
export type {
    ProceduralHydrologyWorldDescriptorV2,
    HydrologyWorldSource,
    HydrologyRegionPool,
    ProceduralHydrologyWorldSourceOptions,
    HydrologyWorldSourceStats
} from "./world/HydrologyWorldSource";

export {
    HYDROLOGY_SPATIAL_CELL_SIZE,
    HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES,
    HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES,
    HYDROLOGY_KIND_NONE,
    HYDROLOGY_KIND_OCEAN,
    HYDROLOGY_KIND_LAKE,
    HYDROLOGY_KIND_RIVER,
    hydrologyRiverHalfWidthTiles,
    HydrologyRegionSpatialIndex
} from "./world/HydrologyRegionSpatialIndex";
export type {
    HydrologyKind,
    HydrologySample
} from "./world/HydrologyRegionSpatialIndex";

export {
    MAX_DERIVED_HYDROLOGY_RASTER_SAMPLES,
    MAX_DERIVED_HYDROLOGY_BODY_PALETTE,
    derivedHydrologyRasterIndex,
    assertDerivedHydrologyRaster,
    deriveHydrologyRaster
} from "./world/DerivedHydrologyRaster";
export type {
    DerivedHydrologyRaster,
    DeriveHydrologyRasterOptions
} from "./world/DerivedHydrologyRaster";

export {
    STATIC_EXPLICIT_WATER_LEVEL_OFFSET,
    STATIC_EXPLICIT_WATER_LEVEL,
    STATIC_LAKE_TILE_RADIUS,
    StaticHydrologyRegionSource
} from "./world/StaticHydrologyRegionSource";
export type { StaticHydrologyRegionSourceOptions } from "./world/StaticHydrologyRegionSource";
