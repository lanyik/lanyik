export {
    SURFACE_COMPILE_PROFILE,
    SURFACE_COMPILE_PROFILE_VERSION,
    SURFACE_CORE_TEXELS,
    WORLD_SEMANTIC_CHUNK_SIZE,
    HYDROLOGY_REGION_SIZE
} from "./world/SurfaceCompileProfile";
export type { SurfaceCompileProfile } from "./world/SurfaceCompileProfile";

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
