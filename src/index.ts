//----------------------------------------------------------------------------------
//Library entry point. `three` is a peerDependency (see package.json/tsup.config.ts) -
//consumers must have their own copy of three.js installed/loaded.
//----------------------------------------------------------------------------------
export { HexMap } from "./HexMap";
export type { HexMapOptions, WorldLoadOptions } from "./HexMap";

export { GameEngine } from "./gameengine";
export type { GameEngineOptions } from "./gameengine";

export { Unit } from "./objects/Unit";
export { PathFinder } from "./helpers/pathfinder";
export { EventEmitter } from "./EventEmitter";
export type { Listener } from "./EventEmitter";

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
export { WorldGeneratorClient } from "./world/WorldGeneratorClient";
export type { WorldChunkStreamingStats } from "./rendering/WorldChunkScheduler";
export { FrameTaskScheduler } from "./rendering/FrameTaskScheduler";
export type { FrameTaskSchedulerOptions, FrameTaskSchedulerStats } from "./rendering/FrameTaskScheduler";
export { mergeBufferUpdateRanges, commitBufferAttributeRanges } from "./rendering/BufferUpdateBatch";
export type { BufferUpdateRange, GpuTileStateChange } from "./rendering/BufferUpdateBatch";
export { AdaptiveStreamingController } from "./rendering/AdaptiveStreamingController";
export type {
    AdaptiveStreamingControllerOptions,
    AdaptiveStreamingProfile,
    AdaptiveStreamingStats,
    AdaptiveStreamingSample
} from "./rendering/AdaptiveStreamingController";
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
    getWorldSourceTile
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
    ProceduralWorldSourceDependencies
} from "./world/WorldSource";
export { WorldStreamer } from "./world/WorldStreamer";
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
