//----------------------------------------------------------------------------------
//Library entry point. `three` is a peerDependency (see package.json/tsup.config.ts) -
//consumers must have their own copy of three.js installed/loaded.
//----------------------------------------------------------------------------------
export { HexMap } from "./HexMap";
export type { HexMapOptions, WorldLoadOptions } from "./HexMap";
export { WorldMinimap } from "./WorldMinimap";
export type { WorldMinimapOptions, WorldMinimapView } from "./WorldMinimap";
export type { LandformDebugMode } from "./objects/TerrainMesh";

export { GameEngine } from "./gameengine";
export type { GameEngineOptions } from "./gameengine";

export { Unit } from "./objects/Unit";
export { PathFinder } from "./helpers/pathfinder";
export { EventEmitter } from "./EventEmitter";
export type { Listener } from "./EventEmitter";
export type {
    HexMapEventMap,
    HexMapEventName,
    HexMapFrameEvent,
    HexMapSurfaceChangeEvent,
    HexMapTileEvent,
    UnitEventMap,
    UnitEventName,
    UnitStartMoveEvent,
    UnitCellEnterEvent,
    UnitEndMoveEvent,
    GameEngineEventMap,
    GameEngineEventName
} from "./EventMaps";
export { LifecycleDrainTimeoutError, LifecycleScope, lifecycleAbortError } from "./runtime/LifecycleScope";
export type { LifecycleScopeOptions, LifecycleScopeStats, LifecycleState } from "./runtime/LifecycleScope";
export {
    ResourceBudgetLedger,
    normalizeResourceCost,
    estimateBufferGeometriesBytes,
    estimateBufferGeometriesResourceBytes,
    estimateObject3DResourceCost,
    disposeObject3DResources
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
export { ModelAssetCache, DEFAULT_MODEL_ASSET_CACHE_BYTES } from "./helpers/models";
export type {
    LoadedModel,
    ModelInfo,
    ModelMetadata,
    ModelAssetLease,
    ModelAssetCacheOptions,
    ModelAssetCacheStats
} from "./helpers/models";

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
export {
    DEFAULT_WORLD_WATER_STYLE,
    assertWorldWaterGenerationStyle,
    normalizeWorldWaterGenerationStyle,
    serializeWorldWaterGenerationStyle,
    worldWaterGenerationStylesEqual
} from "./world/WorldStyleProfile";
export type { WorldWaterGenerationStyle } from "./world/WorldStyleProfile";
export type {
    LandformDomain,
    LandformSample,
    LandformSampler,
    LandformSamplerOptions
} from "./world/LandformSampler";
export type { WorldSurfaceAnchor } from "./world/WorldSurfaceView";
export { WorldGeneratorClient } from "./world/WorldGeneratorClient";
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
    ChunkGeneratorClient,
    WorldTaskControl
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
    generateWorldOverviewWithResolver,
    generateStaticWorldOverview,
    assertWorldOverviewPreparationOptions,
    assertWorldOverviewRaster,
    worldOverviewTransferables,
    WORLD_OVERVIEW_FORMAT_VERSION,
    MAX_WORLD_OVERVIEW_RASTER_SIZE,
    MAX_WORLD_OVERVIEW_TILE_SPAN
} from "./world/generateWorldOverview";
export type {
    WorldOverviewPreparationOptions,
    WorldOverviewGenerationOptions,
    WorldOverviewRaster
} from "./world/generateWorldOverview";
export {
    createWorldChunkCacheKey
} from "./world/WorldChunkCacheContract";
export type {
    WorldChunkCache,
    WorldChunkCacheStats,
    WorldChunkCacheKeyOptions
} from "./world/WorldChunkCacheContract";
export {
    normalizeWorldChunkDelta,
    WorldDeltaConflictError,
    WORLD_DELTA_FORMAT_VERSION
} from "./world/WorldDeltaContract";
export type {
    WorldDeltaStore,
    WorldDeltaEntry,
    WorldDeltaChange,
    WorldDeltaReadOptions,
    WorldDeltaBatchOptions,
    WorldChunkDelta
} from "./world/WorldDeltaContract";
export {
    StaticWorldSource,
    ToroidalWorldSource,
    ProceduralWorldSource,
    assertWorldSource,
    assertWorldChunk,
    isMutableWorldSource,
    isWorldOverviewSource,
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
    WorldOverviewSource,
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
