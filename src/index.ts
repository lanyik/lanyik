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
export {
    generateWorldChunk,
    assertPackedWorldChunk,
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
    packedChunkFromWorldChunk,
    getWorldSourceTile
} from "./world/WorldSource";
export type {
    WorldSource,
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
export type {
    WorldStreamerOptions,
    WorldStreamerHandlers,
    WorldStreamingStats
} from "./world/WorldStreamer";
