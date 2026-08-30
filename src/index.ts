//----------------------------------------------------------------------------------
//Library entry point. `three` is a peerDependency (see package.json/tsup.config.ts) -
//consumers must have their own copy of three.js installed/loaded.
//----------------------------------------------------------------------------------
export { HexMap } from "./HexMap";
export type { HexMapOptions, WorldLoadOptions } from "./HexMap";
export type { LandformDebugMode } from "./objects/TerrainMesh";

export { GameEngine } from "./gameengine";
export type { GameEngineOptions } from "./gameengine";

export { Unit } from "./objects/Unit";
export { PathFinder } from "./helpers/pathfinder";
export { EventEmitter } from "./EventEmitter";
export type { Listener } from "./EventEmitter";
export { LifecycleDrainTimeoutError, LifecycleScope, lifecycleAbortError } from "./runtime/LifecycleScope";
export type { LifecycleScopeOptions, LifecycleScopeStats, LifecycleState } from "./runtime/LifecycleScope";
export {
    ResourceBudgetLedger,
    normalizeResourceCost,
    estimateBufferGeometriesBytes,
    estimateBufferGeometriesResourceBytes,
    estimateObject3DResourceCost
} from "./runtime/ResourceBudget";
export type {
    ResourceCost,
    ResourceBudgetAccount,
    ResourceBudgetAccountStats,
    ResourceBudgetLimits,
    ResourceBudgetView,
    ResourceReservation,
    ResourceReservationHandle,
    ResourceBudgetStats,
    BufferGeometryResourceBytes
} from "./runtime/ResourceBudget";
export { PriorityTaskQueue, WorkQueueBackpressureError } from "./runtime/PriorityTaskQueue";
export type {
    WorkLane,
    PriorityTaskOptions,
    PriorityTaskQueueOptions,
    PriorityTaskQueueStats
} from "./runtime/PriorityTaskQueue";
export { RuntimeWorkCoordinator } from "./runtime/RuntimeWorkCoordinator";
export type {
    RuntimeWorkCoordinatorOptions,
    RuntimeWorkCoordinatorStats,
    RuntimeWorkDomainStats,
    WorkDomainTelemetry
} from "./runtime/RuntimeWorkCoordinator";

export { FogOfWar, FogState } from "./objects/FogOfWar";
export type { FogViewer, FogChange } from "./objects/FogOfWar";

export { Land, UnitActions, LandColor, LandPriority } from "./enums";
export type { HexMapEventName } from "./enums";

export type {
    Point,
    TileInfo,
    CityInfo,
    RiverSegment,
    MapInfo,
    MapInfoData,
    UnitPlacement,
    UnitInfo,
    UnitList
} from "./interfaces";

export { getHexCenter, HEXPolygon } from "./helpers/helpers";
export { getNeighborCoords, getNeighbors, NEIGHBOR_DIRECTIONS } from "./helpers/neighbors";
export type { NeighborDirection, Neighbor } from "./helpers/neighbors";

export {
    positiveModulo,
    normalizeMapCoordinates,
    getMapTile,
    getMapNeighbors
} from "./helpers/topology";

export { generateWorld, MIN_WORLD_SIZE, MAX_WORLD_SIZE } from "./world/generateWorld";
export type { WorldGenerationOptions, WorldTopology } from "./world/generateWorld";
export {
    createLandformSampler,
    sampleLandform,
    LANDFORM_SEA_LEVEL
} from "./world/LandformSampler";
export type {
    LandformDomain,
    LandformSample,
    LandformSampler,
    LandformSamplerOptions
} from "./world/LandformSampler";
export type { WorldSurfaceAnchor } from "./world/WorldSurfaceView";
export {
    SurfaceWorkerCompilationError,
    WorldGeneratorClient
} from "./world/WorldGeneratorClient";
export type { SurfaceWorkerCompilation } from "./world/WorldGeneratorClient";
export {
    createWorldDescriptor,
    assertWorldDescriptor,
    assertSupportedWorldGeneratorVersion,
    serializeWorldDescriptor,
    worldDescriptorsEqual,
    WORLD_DESCRIPTOR_FORMAT_VERSION,
    WORLD_WORKER_PROTOCOL_VERSION
} from "./world/WorldDescriptor";
export type {
    WorldDescriptor,
    CreateWorldDescriptorOptions,
    ProceduralWorldKind
} from "./world/WorldDescriptor";
export {
    createWorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2,
    worldDescriptorsV2Equal,
    canonicalizeSemanticChunkKey,
    canonicalizeHydrologyRegionKey,
    WORLD_DESCRIPTOR_V2_FORMAT_VERSION
} from "./world/semantic/WorldDescriptorV2";
export type {
    WorldDescriptorV2,
    ProceduralWorldDescriptorV2,
    InfiniteWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    StaticWorldDescriptorV2,
    CreateWorldDescriptorV2Options,
    CreateProceduralWorldDescriptorV2Options,
    CreateStaticWorldDescriptorV2Options
} from "./world/semantic/WorldDescriptorV2";
export {
    SubstrateClass,
    WORLD_BIOME_BASIS,
    WORLD_SUBSTRATE_CATALOG,
    WORLD_SUBSTRATE_CATALOG_IDENTITY,
    WORLD_VEGETATION_PROFILE_CATALOG,
    WORLD_VEGETATION_CATALOG_IDENTITY
} from "./world/semantic/WorldSemanticCatalog";
export type {
    WorldBiomeBasis,
    SemanticCatalogIdentity,
    SubstrateCatalogEntry,
    VegetationSpeciesWeight,
    VegetationProfileCatalogEntry
} from "./world/semantic/WorldSemanticCatalog";
export {
    WORLD_SEMANTIC_CHUNK_SIZE,
    WORLD_SEMANTIC_CHUNK_TILE_COUNT,
    WORLD_SEMANTIC_CHUNK_FORMAT_VERSION,
    WORLD_SURFACE_V2_GENERATOR_VERSION,
    HYDROLOGY_REGION_FORMAT_VERSION,
    HYDROLOGY_REGION_SIZE,
    HYDROLOGY_REGION_REVISION,
    HYDROLOGY_COORDINATE_SCALE,
    HYDROLOGY_MACRO_CELL_SIZE,
    HYDROLOGY_INFINITE_BASIN_SIZE,
    HYDROLOGY_MACRO_CELLS_PER_INFINITE_BASIN,
    BASE_SEMANTIC_CHUNK_REVISION,
    FULL_SEMANTIC_CHUNK_BOUNDS,
    FULL_HYDROLOGY_REGION_BOUNDS,
    assertSemanticChunkKey,
    assertLocalTileBounds,
    assertHydrologyRegionKey,
    assertHydrologyRegionLocalBounds,
    semanticChunkCoordinate,
    hydrologyRegionCoordinate,
    semanticChunkLocalIndex,
    locateSemanticTile,
    semanticChunkOrigin,
    hydrologyRegionOrigin
} from "./world/semantic/WorldSemanticFormat";
export type {
    SemanticChunkKey,
    SemanticChunkLocation,
    LocalTileBounds,
    HydrologyRegionKey,
    HydrologyRegionLocalBounds
} from "./world/semantic/WorldSemanticFormat";
export {
    BaseSemanticChunkView,
    assertBaseSemanticChunk,
    baseSemanticChunkTransferables,
    serializeBaseSemanticChunk,
    deserializeBaseSemanticChunk,
    BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES,
    BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES
} from "./world/semantic/BaseSemanticChunk";
export type {
    BaseSemanticChunk,
    BaseSemanticTileView
} from "./world/semantic/BaseSemanticChunk";
export {
    createSemanticChunkSurfaceResolver,
    generateBaseSemanticChunk,
    generateBaseSemanticChunkWithResolver,
    quantizeMacroHeight
} from "./world/semantic/generateBaseSemanticChunk";
export {
    OCEAN_BODY_ID,
    HYDROLOGY_SEA_LEVEL,
    HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS,
    HYDROLOGY_MAX_DISCHARGE_CLASS,
    HYDROLOGY_MAX_MACRO_NODES,
    createStableHydrologyId,
    createProceduralMacroHeightSource,
    buildMacroDrainageGraph,
    assertMacroDrainageGraph
} from "./world/semantic/MacroDrainageGraph";
export type {
    HydrologyBodyId,
    HydrologyFeatureId,
    HydrologyNodeId,
    HydrologyEdgeId,
    InfiniteDrainageBasinKey,
    MacroHeightSource,
    MacroDrainageTerminal,
    MacroDrainageNode,
    MacroDrainageEdge,
    MacroDrainageGraph,
    BuildMacroDrainageGraphOptions
} from "./world/semantic/MacroDrainageGraph";
export {
    HYDROLOGY_MAX_REGION_RIVERS,
    HYDROLOGY_MAX_REGION_PORTS,
    HYDROLOGY_MAX_REGION_LAKES,
    HYDROLOGY_MAX_REGION_MOUTHS,
    HYDROLOGY_MAX_REGION_BODIES,
    HYDROLOGY_MAX_REGION_CONTROL_POINTS,
    assertHydrologyRegion,
    assertMatchingHydrologyPorts,
    hydrologyRegionTransferables,
    hydrologyRegionVectorBytes
} from "./world/semantic/HydrologyRegion";
export type {
    HydrologySegmentId,
    HydrologyPortId,
    HydrologyConnectionId,
    RiverEndpoint,
    HydrologyPort,
    RiverFeatureSegment,
    LakeFeature,
    RiverMouthFeature,
    HydrologyBodyRef,
    HydrologyRegion
} from "./world/semantic/HydrologyRegion";
export {
    HydrologyRegionGenerator,
    generateHydrologyRegion
} from "./world/semantic/generateHydrologyRegion";
export type {
    HydrologyRegionGenerationOptions,
    HydrologyRegionGeneratorOptions
} from "./world/semantic/generateHydrologyRegion";
export {
    HYDROLOGY_SPATIAL_BIN_SIZE,
    HydrologyRegionSpatialIndex
} from "./world/semantic/HydrologySpatialIndex";
export type {
    HydrologyIndexedFeature,
    HydrologyQueryBounds
} from "./world/semantic/HydrologySpatialIndex";
export {
    HydrologyWaterKind,
    deriveHydrologyRaster,
    derivedHydrologyRasterTransferables
} from "./world/semantic/DerivedHydrologyRaster";
export type {
    DerivedHydrologyRaster,
    DerivedHydrologyRasterOptions
} from "./world/semantic/DerivedHydrologyRaster";
export {
    SemanticOverrideField,
    createSparseSemanticDelta,
    assertSparseSemanticDelta,
    cloneSparseSemanticDelta,
    sparseSemanticDeltaOverrideOffset,
    sparseSemanticDeltaByteLength
} from "./world/semantic/SparseSemanticDelta";
export type {
    SparseSemanticTileOverride,
    SparseSemanticDelta,
    CreateSparseSemanticDeltaOptions
} from "./world/semantic/SparseSemanticDelta";
export {
    assertHydrologyFeatureDelta,
    cloneHydrologyFeatureDelta,
    hydrologyFeatureBounds
} from "./world/semantic/HydrologyFeatureDelta";
export type {
    HydrologyFeatureConnection,
    HydrologyRiverSource,
    HydrologyRiverFeatureDelta,
    HydrologyLakeFeatureDelta,
    HydrologyFeatureTombstone,
    HydrologyFeatureDelta,
    HydrologyFeatureBounds
} from "./world/semantic/HydrologyFeatureDelta";
export {
    createEffectiveDeltaSnapshot,
    EffectiveWorldView
} from "./world/semantic/EffectiveWorldView";
export type {
    HydrologyRegionFeatureIndex,
    EffectiveDeltaSnapshot,
    CreateEffectiveDeltaSnapshotOptions,
    CaptureEffectiveWorldSnapshotOptions,
    EffectiveSemanticTileView,
    EffectiveSemanticChunkSnapshot,
    EffectiveHydrologyRegionSnapshot,
    EffectiveWorldSnapshot
} from "./world/semantic/EffectiveWorldView";
export {
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_COMPILER_REVISION,
    SURFACE_COMPILE_PROFILE_VERSION,
    canonicalizeRenderChunkKey,
    assertSurfaceDependencyKey,
    createSurfaceDependencyBinding,
    surfaceDependencyKeysEqual,
    serializeSurfaceDependencyKey,
    cloneSurfaceDependencyKey,
    assertSurfaceRequestToken,
    SurfaceRequestTracker
} from "./world/semantic/SurfaceDependency";
export type {
    RenderChunkKey,
    SurfaceSemanticDependency,
    SurfaceHydrologyFeatureDependency,
    SurfaceHydrologyDependency,
    SurfaceDependencyKey,
    SurfaceDependencyBinding,
    CreateSurfaceDependencyBindingOptions,
    SurfaceRequestToken,
    SurfaceRequestIdentity
} from "./world/semantic/SurfaceDependency";
export {
    SURFACE_SAMPLES_PER_TILE_INTERVAL,
    SURFACE_FIELD_CORE_SIZE,
    SURFACE_FIELD_GUTTER_TEXELS,
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_FIELD_TEXEL_COUNT,
    SURFACE_INFLUENCE_RADIUS_TILES,
    SURFACE_EFFECTIVE_WINDOW_SIZE,
    SURFACE_MAX_WATER_BODY_COUNT,
    SURFACE_CANONICAL_HEX_SIZE,
    SURFACE_TEXTURE_PAGE_LAYERS,
    SURFACE_COMPILE_PROFILE_V1
} from "./world/semantic/SurfaceCompileProfile";
export {
    surfaceColumnStagger,
    surfaceStagger,
    surfaceToWorld,
    worldToSurface,
    surfaceLatticeTexelLocalCoordinate,
    surfaceLatticeTexelWorldCoordinate,
    surfaceFieldTexelCoordinate,
    surfaceLatticeIndex,
    surfacePointOwnerRenderChunk,
    SURFACE_LATTICE_TEST_VECTORS
} from "./world/semantic/SurfaceLattice";
export type {
    SurfaceCoordinate,
    SurfaceWorldCoordinate
} from "./world/semantic/SurfaceLattice";
export {
    encodeFloat16,
    decodeFloat16,
    quantizeFloat16
} from "./world/semantic/SurfaceHalfFloat";
export {
    surfaceSemanticChunkRequirements,
    surfaceHydrologyRegionRequirements,
    assertTransferableEffectiveWindow,
    createTransferableEffectiveWindow,
    effectiveSurfaceWindowTransferables
} from "./world/semantic/EffectiveSurfaceWindow";
export type {
    SurfaceWindowValidBounds,
    SurfaceWindowRiver,
    SurfaceWindowLake,
    TransferableEffectiveWindow,
    SurfaceWindowBufferAllocator,
    CreateTransferableEffectiveWindowOptions
} from "./world/semantic/EffectiveSurfaceWindow";
export {
    compileSurfaceChunk,
    assertCompiledSurfaceChunk,
    sampleCompiledSurfaceChunk,
    compiledSurfaceFieldTransferables
} from "./world/semantic/SurfaceCompiler";
export type {
    CompiledWaterBodyRef,
    CompiledSurfaceField,
    CompiledSurfaceBounds,
    CompiledSurfaceChunk,
    CompiledSurfaceSample
} from "./world/semantic/SurfaceCompiler";
export {
    SurfaceCompilationService,
    SurfaceWindowBufferPool
} from "./world/semantic/SurfaceCompilationService";
export type {
    SurfaceCompilationWorkerRequestOptions,
    SurfaceCompilationWorker,
    SurfaceCompilationServiceOptions,
    SurfaceCompilationRequestOptions,
    ResidentSurfaceLease,
    ReadySurfaceCompilation,
    StaleSurfaceCompilation,
    SurfaceCompilationOutcome,
    SurfaceCompilationRequest,
    SurfaceWindowBufferPoolStats,
    SurfaceCompilationServiceStats
} from "./world/semantic/SurfaceCompilationService";
export {
    SURFACE_VALUES_TEXTURE_CHANNELS,
    SURFACE_MATERIAL_TEXTURE_CHANNELS,
    SURFACE_FLOW_TEXTURE_CHANNELS,
    SURFACE_WATER_TEXTURE_CHANNELS,
    SURFACE_GPU_BYTES_PER_TEXEL,
    SURFACE_GPU_LAYER_BYTES,
    SURFACE_GPU_PAGE_BYTES,
    SURFACE_TEXTURE_FORMAT_V1,
    SurfaceTexturePool
} from "./rendering/SurfaceTexturePool";
export type {
    SurfaceTexturePoolState,
    SurfaceTexturePoolOptions,
    SurfaceTextureSlotHandle,
    SurfaceTextureBinding,
    SurfaceTexturePoolStats
} from "./rendering/SurfaceTexturePool";
export {
    SURFACE_FOG_TEXTURE_SIZE,
    SURFACE_FOG_LAYER_BYTES,
    SURFACE_FOG_PAGE_BYTES,
    SurfaceFogTexturePool
} from "./rendering/SurfaceFogTexturePool";
export type {
    SurfaceFogTexturePoolOptions,
    SurfaceFogTextureBinding,
    SurfaceFogTexturePoolStats
} from "./rendering/SurfaceFogTexturePool";
export {
    SURFACE_GROUND_LOD_GRID_STEPS,
    SURFACE_GROUND_BOUNDARY_INTERVALS,
    createSurfaceGroundGeometry,
    getSurfaceGroundGeometryInfo,
    SurfaceGroundGeometryPool
} from "./rendering/SurfaceGroundGeometry";
export type {
    SurfaceGroundGeometryInfo,
    SurfaceGroundGeometryPoolStats
} from "./rendering/SurfaceGroundGeometry";
export {
    DEFAULT_LIGHTING_STATE,
    createLightingState,
    LightingStateController
} from "./rendering/LightingState";
export type {
    LightingVector3,
    LinearRgb,
    LightingEnvironmentHandle,
    LightingState,
    LightingUniformBinding,
    LightingRendererBinding,
    LightingStateControllerStats
} from "./rendering/LightingState";
export {
    SURFACE_GROUND_DEFAULT_MATERIAL_PALETTE,
    GroundLayer
} from "./rendering/GroundLayer";
export type {
    GroundLayerOptions,
    GroundChunkMount,
    GroundLayerStats
} from "./rendering/GroundLayer";
export type {
    BaseSemanticChunkGenerationOptions
} from "./world/semantic/generateBaseSemanticChunk";
export type { WorldChunkStreamingStats } from "./rendering/WorldChunkScheduler";
export { FrameTaskScheduler } from "./rendering/FrameTaskScheduler";
export type {
    FrameTaskSchedulerOptions,
    FrameTaskSchedulerStats,
    FrameTaskEnqueueOptions
} from "./rendering/FrameTaskScheduler";
export { WorldChunkMountQueue } from "./rendering/WorldChunkMountQueue";
export type {
    WorldChunkMountQueueOptions,
    WorldChunkMountQueueStats
} from "./rendering/WorldChunkMountQueue";
export { mergeBufferUpdateRanges, commitBufferAttributeRanges } from "./rendering/BufferUpdateBatch";
export type { BufferUpdateRange, GpuTileStateChange } from "./rendering/BufferUpdateBatch";
export { AdaptiveStreamingController } from "./rendering/AdaptiveStreamingController";
export type {
    AdaptiveStreamingControllerOptions,
    AdaptiveStreamingProfile,
    AdaptiveStreamingStats,
    AdaptiveStreamingSample
} from "./rendering/AdaptiveStreamingController";
export { WebGlGpuTimer } from "./rendering/WebGlGpuTimer";
export type { WebGlGpuTimerOptions, WebGlGpuTimerStats } from "./rendering/WebGlGpuTimer";
export { HexMapRendererHost } from "./rendering/HexMapRendererHost";
export type {
    HexMapRendererHostOptions,
    WebGlContextState,
    WebGlContextStats
} from "./rendering/HexMapRendererHost";
export { HexMapInteractionController } from "./rendering/HexMapInteractionController";
export type {
    HexMapInteractionControllerOptions,
    HexMapInteractionStats
} from "./rendering/HexMapInteractionController";
export {
    generateWorldChunk,
    assertPackedWorldChunk,
    assertWorldTileOverride,
    decodeWorldChunkTile,
    getWorldChunkCorePoints,
    SparseWorldChunkStore,
    DEFAULT_WORLD_GENERATION_CHUNK_SIZE,
    MAX_WORLD_GENERATION_CHUNK_SIZE,
    WORLD_GENERATOR_VERSION,
    WORLD_CHUNK_FORMAT_VERSION,
    WORLD_CHUNK_PADDING
} from "./world/generateWorldChunk";
export type {
    PackedWorldChunk,
    WorldChunkGenerationOptions,
    BoundedWorldChunkGeneration,
    WorldTileOverride,
    WorldTileOverrideChange,
    SparseWorldChunkStoreOptions
} from "./world/generateWorldChunk";
export { WorldGeneratorPool } from "./world/WorldGeneratorPool";
export type {
    WorldGeneratorPoolOptions,
    WorldGeneratorPoolStats,
    ChunkRequestOptions,
    ChunkGeneratorClient
} from "./world/WorldGeneratorPool";
export {
    generateWorldVegetation,
    createWorldVegetationMapSnapshot,
    assertWorldVegetationLayout,
    worldVegetationTransferables,
    WORLD_VEGETATION_FORMAT_VERSION
} from "./world/generateVegetation";
export type {
    WorldVegetationMapSnapshot,
    WorldVegetationGenerationOptions,
    WorldVegetationLayout,
    WorldVegetationGrassChunkLayout,
    WorldVegetationGrassLodLayout,
    WorldVegetationForestChunkLayout,
    WorldVegetationForestLodLayout
} from "./world/generateVegetation";
export {
    IndexedDbWorldChunkCache,
    createWorldChunkCacheKey,
    clearWorldChunkCache
} from "./world/WorldChunkCache";
export type {
    WorldChunkCache,
    WorldChunkCacheStats,
    WorldChunkCacheKeyOptions,
    IndexedDbWorldChunkCacheOptions
} from "./world/WorldChunkCache";
export {
    StaticWorldSource,
    ToroidalWorldSource,
    ProceduralWorldSource,
    assertWorldSource,
    assertWorldChunk,
    isMutableWorldSource,
    isWorldVegetationSource,
    packedChunkFromWorldChunk,
    getWorldSourceTile,
    WORLD_DELTA_CHECKPOINT_FORMAT_VERSION
} from "./world/WorldSource";
export type {
    WorldSource,
    WorldChunkRevision,
    MutableWorldSource,
    WorldVegetationSource,
    WorldVegetationPreparationOptions,
    WorldBounds,
    WorldChunk,
    WorldSourceStats,
    StaticWorldSourceOptions,
    ToroidalWorldSourceOptions,
    ToroidalWorldSourceDependencies,
    ProceduralWorldSourceOptions,
    ProceduralWorldSourceDependencies,
    WorldDeltaCheckpoint
} from "./world/WorldSource";
export { WorldStreamer } from "./world/WorldStreamer";
export { WorldEditingFacade, worldTileVisualSignature } from "./world/WorldEditingFacade";
export type {
    WorldEditingFacadeOptions,
    WorldEditResult,
    WorldEditingStats
} from "./world/WorldEditingFacade";
export {
    ChunkResidencyCoordinator,
    getChunkResidencyCoordinator
} from "./world/ChunkResidencyCoordinator";
export type {
    ChunkLeaseOwner,
    ChunkLeaseOptions,
    WorldChunkLease,
    ChunkResidencyStats
} from "./world/ChunkResidencyCoordinator";
export type {
    WorldStreamerOptions,
    WorldStreamerHandlers,
    WorldStreamingStats
} from "./world/WorldStreamer";
export { WorldRenderLayerRegistry } from "./rendering/WorldRenderLayer";
export type {
    WorldRenderLayer,
    WorldRenderLayerHost,
    WorldRenderChunkContext,
    WorldRenderTileRefreshContext
} from "./rendering/WorldRenderLayer";
export { RenderWorldController } from "./rendering/RenderWorldController";
export type { RenderWorldStreamingOptions } from "./rendering/RenderWorldController";
export {
    tagWorldChunk,
    getWorldChunkMetadata,
    getWorldChunkBounds,
    groupTilesByWorldChunk,
    WORLD_CHUNK_SIZE
} from "./helpers/chunks";
export type {
    WorldChunkKind,
    BuiltinWorldChunkKind,
    WorldChunkLod,
    WorldChunkMetadata,
    WorldChunkBounds
} from "./helpers/chunks";
