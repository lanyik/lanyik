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
    assertGenerateSemanticChunkWorkerRequest
} from "./world/SurfaceWorkerProtocol";
export type {
    SurfaceWorkerRequest,
    SurfaceWorkerResponse,
    GenerateSemanticChunkWorkerRequest,
    GenerateSemanticChunkWorkerResult
} from "./world/SurfaceWorkerProtocol";
export { SurfaceWorkerClient } from "./world/SurfaceWorkerClient";
export type { GenerateSemanticChunkOptions } from "./world/SurfaceWorkerClient";
export { SurfaceWorkerPool } from "./world/SurfaceWorkerPool";
export type {
    SurfaceWorkerPoolOptions,
    SurfaceWorkerPoolStats,
    SurfaceTaskRequestOptions,
    SemanticChunkWorkerClient
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
