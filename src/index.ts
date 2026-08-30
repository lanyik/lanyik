//----------------------------------------------------------------------------------
//Library entry point. `three` is a peerDependency (see package.json/tsup.config.ts) -
//consumers must have their own copy of three.js installed/loaded.
//----------------------------------------------------------------------------------
export { HexMap } from "./rendering/SurfaceHexMap";
export type { HexMapOptions, WorldLoadOptions, HexMapStats } from "./rendering/SurfaceHexMap";
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

export type { WorldPoint } from "./world/WorldPoint";

export {
    SurfaceWorkerCompilationError,
} from "./world/semantic/SurfaceWorkerProtocol";
export type { SurfaceWorkerCompilation } from "./world/semantic/SurfaceWorkerProtocol";
export { WorldSurfaceWorkerClient } from "./world/WorldSurfaceWorkerClient";
export { WORLD_WORKER_PROTOCOL_VERSION } from "./world/WorldWorkerProtocol";
export { WORLD_GENERATOR_VERSION } from "./world/WorldGeneratorVersion";
export {
    createWorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2,
    worldDescriptorsV2Equal,
    canonicalizeSemanticChunkKey,
    canonicalizeHydrologyRegionKey,
    WORLD_DESCRIPTOR_FORMAT_VERSION
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
    WORLD_CHUNK_FORMAT_VERSION,
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
    SURFACE_WATER_COVERAGE_THRESHOLD,
    SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED,
    SURFACE_VEGETATION_COORDINATE_SCALE,
    SURFACE_MAX_VEGETATION_SEEDS,
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
    compiledSurfaceChunkTransferables
} from "./world/semantic/SurfaceCompiler";
export type {
    CompiledWaterBodyRef,
    CompiledSurfaceField,
    CompiledSurfaceBounds,
    CompiledSurfaceChunk,
    CompiledSurfaceSample
} from "./world/semantic/SurfaceCompiler";
export {
    CompiledVegetationSpecies,
    compileWaterGeometry,
    compileVegetationSeeds,
    waterGeometryByteLength,
    vegetationSeedsByteLength,
    surfacePresentationTransferables
} from "./world/semantic/SurfacePresentationCompiler";
export type {
    CompiledWaterMesh,
    CompiledWaterGeometry,
    CompiledVegetationSeeds
} from "./world/semantic/SurfacePresentationCompiler";
export {
    SurfaceCompilationService,
    SurfaceWindowBufferPool
} from "./world/semantic/SurfaceCompilationService";
export {
    WorldChangeDomain,
    createWorldChangeSet
} from "./world/semantic/WorldChangeSet";
export type {
    TileBounds,
    DirtySemanticChunk,
    DirtyHydrologyFeature,
    DirtyHydrologyRegion,
    DirtyRenderChunk,
    DirtyNavigationChunk,
    DirtySimulationChunk,
    WorldChangeSet,
    SemanticChangePoint,
    HydrologyFeatureChange
} from "./world/semantic/WorldChangeSet";
export {
    WORLD_DELTA_FORMAT_VERSION,
    WORLD_DELTA_CHECKPOINT_FORMAT_VERSION,
    WorldDeltaRevisionConflictError,
    MemoryWorldDeltaStore,
    IndexedDbWorldDeltaStore
} from "./world/WorldDeltaStore";
export type {
    SemanticAuthorityMutation,
    HydrologyFeatureInput,
    HydrologyFeatureUpsertMutation,
    HydrologyFeatureDeleteMutation,
    HydrologyAuthorityMutation,
    WorldDeltaCommitRequest,
    WorldDeltaCommitRecord,
    WorldDeltaCommitResult,
    WorldDeltaCheckpoint,
    WorldDeltaStoreStats,
    WorldDeltaStore,
    IndexedDbWorldDeltaStoreOptions
} from "./world/WorldDeltaStore";
export { WorldEditTransaction, WorldEditor } from "./world/WorldEditing";
export type {
    WorldEditWaterPolicy,
    WorldEditFalloff,
    WorldEditArea,
    QuantizedSemanticAuthorityTile,
    HydrologyGroundConstraint,
    WorldEditAuthority,
    HydrologyRebakeResult,
    HydrologyRebaker,
    WorldEditorOptions,
    RaiseTerrainOptions,
    PaintMaterialOptions,
    PaintVegetationOptions,
    UpsertRiverOptions,
    UpsertLakeOptions
} from "./world/WorldEditing";
export {
    ProceduralWorldAuthoritySource,
    StaticWorldAuthoritySource,
    WorldAuthorityRepository
} from "./world/semantic/WorldAuthorityRepository";
export { compileStaticWorldAuthority } from "./world/semantic/compileStaticWorldAuthority";
export type {
    CompiledStaticWorldAuthority,
    StaticWorldSemanticFields
} from "./world/semantic/compileStaticWorldAuthority";
export type {
    WorldAuthorityLoadOptions,
    WorldAuthoritySource,
    ProceduralWorldAuthoritySourceOptions,
    StaticWorldAuthoritySourceOptions,
    WorldAuthorityRepositoryOptions,
    WorldAuthorityRepositoryStats,
    WorldAuthorityLease
} from "./world/semantic/WorldAuthorityRepository";
export { SurfaceQueryService } from "./world/semantic/SurfaceQueryService";
export type {
    SurfaceQuerySnapshotProvider,
    SurfaceQueryServiceOptions,
    SurfaceQueryServiceStats
} from "./world/semantic/SurfaceQueryService";
export { SurfacePickingService } from "./world/semantic/SurfacePickingService";
export type {
    SurfacePickResult,
    SurfacePickingServiceOptions
} from "./world/semantic/SurfacePickingService";
export {
    WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION,
    SemanticNavigationIndex
} from "./world/semantic/SemanticNavigationIndex";
export type {
    SemanticNavigationHydrologySample,
    SemanticNavigationAuthority,
    SemanticNavigationPortal,
    SemanticNavigationDependencyKey,
    SemanticNavigationChunkSummary,
    SemanticNavigationIndexOptions
} from "./world/semantic/SemanticNavigationIndex";
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
    LightingSceneBinding,
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
export { WaterLayer } from "./rendering/WaterLayer";
export type {
    WaterLayerOptions,
    WaterChunkMount,
    WaterLayerStats
} from "./rendering/WaterLayer";
export { VegetationLayer } from "./rendering/VegetationLayer";
export type {
    VegetationLayerOptions,
    VegetationChunkMount,
    VegetationLayerStats
} from "./rendering/VegetationLayer";
export { SurfacePresentationLayer } from "./rendering/SurfacePresentationLayer";
export type {
    SurfacePresentationLayerOptions,
    SurfacePresentationChunkMount,
    SurfacePresentationLayerStats
} from "./rendering/SurfacePresentationLayer";
export {
    createSurfacePresentationStyle,
    DEFAULT_SURFACE_PRESENTATION_STYLE
} from "./rendering/SurfacePresentationStyle";
export type { SurfacePresentationStyle } from "./rendering/SurfacePresentationStyle";
export {
    DependencyDrivenRenderGraph,
    WorldRenderDependencyError
} from "./rendering/DependencyDrivenRenderGraph";
export type {
    WorldRenderDependency,
    WorldRenderLayerChunkAccess,
    DependencyDrivenWorldRenderLayer
} from "./rendering/DependencyDrivenRenderGraph";
export { WorldRenderSession } from "./rendering/WorldRenderSession";
export type {
    WorldRenderDemand,
    WorldRenderSessionOptions,
    WorldRenderSessionChunkContext,
    WorldRenderSessionStats
} from "./rendering/WorldRenderSession";
export { planWorldRenderDemand } from "./rendering/WorldRenderDemandPlanner";
export type { WorldRenderDemandPlanOptions } from "./rendering/WorldRenderDemandPlanner";
export {
    MINIMUM_WORLD_SURFACE_RUNTIME_BUDGETS,
    WorldSurfaceRuntime
} from "./rendering/WorldSurfaceRuntime";
export type {
    WorldSurfaceRuntimeBudgets,
    WorldSurfaceRuntimeOptions
} from "./rendering/WorldSurfaceRuntime";
export type {
    BaseSemanticChunkGenerationOptions
} from "./world/semantic/generateBaseSemanticChunk";
export { WorldSurfaceWorkerPool } from "./world/WorldSurfaceWorkerPool";
export type {
    WorldSurfaceWorker,
    WorldSurfaceWorkerRequestOptions,
    WorldSurfaceWorkerPoolOptions,
    WorldSurfaceWorkerPoolStats
} from "./world/WorldSurfaceWorkerPool";
export type { WorldChunkLod } from "./rendering/WorldChunkLod";
