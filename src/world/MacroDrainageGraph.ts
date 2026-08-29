import {
    BaseSemanticChunk,
    SemanticChunkKey,
    semanticTileIndex
} from "./BaseSemanticChunk";
import {
    MACRO_DRAINAGE_TERMINAL,
    MacroDrainageRaster,
    MacroDrainageTree,
    assertMacroDrainageTree,
    buildMacroDrainageTree,
    buildToroidalMacroDrainageTree,
    macroDrainageIndex
} from "./MacroDrainageTree";
import { SemanticWorldSource } from "./SemanticWorldSource";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";

export const MACRO_DRAINAGE_NODE_STEP_TILES = 8;
export const MAX_MACRO_DRAINAGE_GRAPH_NODES = 1_048_576;
export const OCEAN_BODY_ID = "ocean";

export interface MacroDrainageGraph {
    readonly revision: 0;
    readonly worldIdentity: string;
    readonly topology: "finite" | "toroidal";
    readonly worldWidth: number;
    readonly worldHeight: number;
    readonly nodeStepTiles: typeof MACRO_DRAINAGE_NODE_STEP_TILES;
    readonly width: number;
    readonly height: number;
    readonly seaLevel: number;
    readonly groundHeight: Uint16Array;
    readonly ocean: Uint8Array;
    readonly downstream: Int32Array;
    readonly drainageRank: Uint32Array;
    readonly spillLevel: Uint16Array;
    readonly discharge: Uint32Array;
    readonly dischargeClass: Uint8Array;
    readonly terminalNode: Uint32Array;
    readonly terminalKind: "ocean" | "lake";
    readonly terminalIndices: Uint32Array;
    readonly validNodeCount: number;
    readonly maxDrainageRank: number;
}

export interface BuildMacroDrainageGraphOptions {
    readonly signal?: AbortSignal;
    readonly maximumConcurrentChunkLoads?: number;
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") return new DOMException("macro drainage graph build was aborted", "AbortError");
    const error = new Error("macro drainage graph build was aborted");
    error.name = "AbortError";
    return error;
}

function classifyDischarge(discharge: number): number {
    return Math.min(255, Math.floor(Math.log2(Math.max(1, discharge))));
}

function treeFor(raster: Readonly<MacroDrainageRaster>, topology: MacroDrainageGraph["topology"]): MacroDrainageTree {
    return topology === "toroidal"
        ? buildToroidalMacroDrainageTree(raster)
        : buildMacroDrainageTree(raster);
}

function assignTerminalNodes(tree: Readonly<MacroDrainageTree>): Uint32Array {
    const terminalNode = new Uint32Array(tree.downstream.length);
    terminalNode.fill(0xffff_ffff);
    for (const terminal of tree.terminalIndices) terminalNode[terminal] = terminal;
    const nodeAtRank = new Uint32Array(tree.maxDrainageRank + 1);
    for (let index = 0; index < tree.drainageRank.length; index += 1) {
        const rank = tree.drainageRank[index];
        if (rank > 0 && rank <= tree.maxDrainageRank) nodeAtRank[rank] = index;
    }
    for (let rank = 1; rank <= tree.maxDrainageRank; rank += 1) {
        const index = nodeAtRank[rank];
        const parent = tree.downstream[index];
        if (parent < 0 || terminalNode[parent] === 0xffff_ffff) {
            throw new Error("macro drainage terminal assignment encountered an unresolved parent");
        }
        terminalNode[index] = terminalNode[parent];
    }
    return terminalNode;
}

export function macroDrainageNodeTile(
    graph: Pick<MacroDrainageGraph, "width" | "height" | "worldWidth" | "worldHeight">,
    index: number
): Readonly<{ x: number; y: number }> {
    if (!Number.isInteger(index) || index < 0 || index >= graph.width * graph.height) {
        throw new RangeError("macro drainage node index is invalid");
    }
    const nodeX = Math.floor(index / graph.height);
    const nodeY = index - nodeX * graph.height;
    return Object.freeze({
        x: Math.min(graph.worldWidth - 1, nodeX * MACRO_DRAINAGE_NODE_STEP_TILES + 4),
        y: Math.min(graph.worldHeight - 1, nodeY * MACRO_DRAINAGE_NODE_STEP_TILES + 4)
    });
}

export function macroDrainageNodeId(graph: Readonly<MacroDrainageGraph>, index: number): string {
    const tile = macroDrainageNodeTile(graph, index);
    return `node:${tile.x}:${tile.y}`;
}

export function macroDrainageTerminalBodyId(graph: Readonly<MacroDrainageGraph>, index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= graph.terminalNode.length) {
        throw new RangeError("macro drainage terminal body node is invalid");
    }
    const terminal = graph.terminalNode[index];
    return graph.ocean[terminal] !== 0 ? OCEAN_BODY_ID : `lake:${macroDrainageNodeId(graph, terminal)}`;
}

export function assertMacroDrainageGraph(graph: Readonly<MacroDrainageGraph>): void {
    if (!graph || typeof graph !== "object" || graph.revision !== 0
        || typeof graph.worldIdentity !== "string" || graph.worldIdentity.length === 0
        || (graph.topology !== "finite" && graph.topology !== "toroidal")
        || !Number.isSafeInteger(graph.worldWidth) || graph.worldWidth <= 0
        || !Number.isSafeInteger(graph.worldHeight) || graph.worldHeight <= 0
        || graph.nodeStepTiles !== MACRO_DRAINAGE_NODE_STEP_TILES
        || graph.width !== Math.ceil(graph.worldWidth / MACRO_DRAINAGE_NODE_STEP_TILES)
        || graph.height !== Math.ceil(graph.worldHeight / MACRO_DRAINAGE_NODE_STEP_TILES)) {
        throw new TypeError("macro drainage graph dimensions, identity or topology are invalid");
    }
    const length = graph.width * graph.height;
    if (length > MAX_MACRO_DRAINAGE_GRAPH_NODES
        || !(graph.groundHeight instanceof Uint16Array) || graph.groundHeight.length !== length
        || !(graph.ocean instanceof Uint8Array) || graph.ocean.length !== length
        || !(graph.dischargeClass instanceof Uint8Array) || graph.dischargeClass.length !== length
        || !(graph.terminalNode instanceof Uint32Array) || graph.terminalNode.length !== length
        || !Number.isInteger(graph.seaLevel) || graph.seaLevel < 0 || graph.seaLevel > 0xffff) {
        throw new RangeError("macro drainage graph arrays or sea level exceed the frozen contract");
    }
    const valid = new Uint8Array(length);
    valid.fill(1);
    assertMacroDrainageTree(graph, valid, graph.topology === "toroidal" ? "toroidal" : "bounded");
    if (graph.validNodeCount !== length) {
        throw new Error("complete macro drainage graph must populate every node");
    }
    const expectedTerminalNode = assignTerminalNodes(graph);
    let oceanCount = 0;
    for (let index = 0; index < length; index += 1) {
        if (graph.ocean[index] > 1) throw new TypeError("macro drainage ocean mask must contain only zero or one");
        if (graph.ocean[index] !== 0) {
            oceanCount += 1;
            if (graph.groundHeight[index] > graph.seaLevel
                || graph.downstream[index] !== MACRO_DRAINAGE_TERMINAL) {
                throw new Error("macro drainage ocean nodes must be valid sea-level terminals");
            }
        }
        const terminal = graph.terminalNode[index];
        if (terminal >= length || graph.downstream[terminal] !== MACRO_DRAINAGE_TERMINAL
            || terminal !== expectedTerminalNode[index]
            || graph.dischargeClass[index] !== classifyDischarge(graph.discharge[index])) {
            throw new Error("macro drainage graph terminal or discharge class is invalid");
        }
    }
    if ((oceanCount > 0 && (graph.terminalKind !== "ocean" || graph.terminalIndices.length !== oceanCount))
        || (oceanCount === 0 && (graph.terminalKind !== "lake" || graph.terminalIndices.length !== 1))) {
        throw new Error("macro drainage terminal kind does not match its ocean mask");
    }
    if (graph.topology === "toroidal" && (graph.worldWidth % WORLD_SEMANTIC_CHUNK_SIZE !== 0
        || graph.worldHeight % WORLD_SEMANTIC_CHUNK_SIZE !== 0)) {
        throw new Error("toroidal macro drainage graph is not semantic-chunk aligned");
    }
}

function sampleMacroNodesFromChunk(
    chunk: Readonly<BaseSemanticChunk>,
    key: Readonly<SemanticChunkKey>,
    worldWidth: number,
    worldHeight: number,
    nodeWidth: number,
    nodeHeight: number,
    seaLevel: number,
    groundHeight: Uint16Array,
    ocean: Uint8Array
): void {
    for (let localNodeX = 0; localNodeX < 4; localNodeX += 1) {
        const nodeX = key.chunkX * 4 + localNodeX;
        if (nodeX >= nodeWidth) break;
        const tileX = Math.min(worldWidth - 1, nodeX * MACRO_DRAINAGE_NODE_STEP_TILES + 4);
        const localX = tileX - key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
        for (let localNodeY = 0; localNodeY < 4; localNodeY += 1) {
            const nodeY = key.chunkY * 4 + localNodeY;
            if (nodeY >= nodeHeight) break;
            const tileY = Math.min(worldHeight - 1, nodeY * MACRO_DRAINAGE_NODE_STEP_TILES + 4);
            const localY = tileY - key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
            const sourceIndex = semanticTileIndex(localX, localY);
            const targetIndex = macroDrainageIndex(nodeX, nodeY, nodeHeight);
            const value = chunk.macroHeight[sourceIndex];
            groundHeight[targetIndex] = value;
            ocean[targetIndex] = value < seaLevel ? 1 : 0;
        }
    }
}

export async function buildMacroDrainageGraph(
    source: SemanticWorldSource,
    options: Readonly<BuildMacroDrainageGraphOptions> = {}
): Promise<MacroDrainageGraph> {
    if (!source.bounds || (source.bounds.topology !== "finite" && source.bounds.topology !== "toroidal")) {
        throw new TypeError("complete macro drainage graph requires a finite or toroidal semantic source");
    }
    const maximumConcurrentChunkLoads = options.maximumConcurrentChunkLoads ?? 8;
    if (!Number.isInteger(maximumConcurrentChunkLoads)
        || maximumConcurrentChunkLoads <= 0 || maximumConcurrentChunkLoads > 32) {
        throw new RangeError("macro drainage chunk concurrency must be an integer between 1 and 32");
    }
    if (options.signal?.aborted) throw abortError();
    const width = Math.ceil(source.bounds.width / MACRO_DRAINAGE_NODE_STEP_TILES);
    const height = Math.ceil(source.bounds.height / MACRO_DRAINAGE_NODE_STEP_TILES);
    const length = width * height;
    if (!Number.isSafeInteger(length) || length > MAX_MACRO_DRAINAGE_GRAPH_NODES) {
        throw new RangeError("macro drainage graph exceeds the frozen node budget");
    }
    const groundHeight = new Uint16Array(length);
    const ocean = new Uint8Array(length);
    const valid = new Uint8Array(length);
    valid.fill(1);
    const chunkCountX = Math.ceil(source.bounds.width / WORLD_SEMANTIC_CHUNK_SIZE);
    const chunkCountY = Math.ceil(source.bounds.height / WORLD_SEMANTIC_CHUNK_SIZE);
    const keys: SemanticChunkKey[] = [];
    for (let chunkX = 0; chunkX < chunkCountX; chunkX += 1) {
        for (let chunkY = 0; chunkY < chunkCountY; chunkY += 1) keys.push({ chunkX, chunkY });
    }
    const sampleChunk = async (key: SemanticChunkKey): Promise<void> => {
        if (options.signal?.aborted) throw abortError();
        const chunk = await source.loadChunk(key.chunkX, key.chunkY, {
            signal: options.signal,
            lane: "background",
            priority: key.chunkX * chunkCountY + key.chunkY
        });
        try {
            sampleMacroNodesFromChunk(
                chunk,
                key,
                source.bounds!.width,
                source.bounds!.height,
                width,
                height,
                source.descriptor.seaLevel,
                groundHeight,
                ocean
            );
        } finally {
            source.releaseChunk(chunk);
        }
    };
    for (let start = 0; start < keys.length; start += maximumConcurrentChunkLoads) {
        await Promise.all(keys.slice(start, start + maximumConcurrentChunkLoads).map(sampleChunk));
    }
    const raster: MacroDrainageRaster = {
        width,
        height,
        valid,
        groundHeight,
        ocean,
        seaLevel: source.descriptor.seaLevel
    };
    const tree = treeFor(raster, source.bounds.topology);
    const dischargeClass = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
        dischargeClass[index] = classifyDischarge(tree.discharge[index]);
    }
    const graph: MacroDrainageGraph = Object.freeze({
        revision: 0,
        worldIdentity: source.worldIdentity,
        topology: source.bounds.topology,
        worldWidth: source.bounds.width,
        worldHeight: source.bounds.height,
        nodeStepTiles: MACRO_DRAINAGE_NODE_STEP_TILES,
        width,
        height,
        seaLevel: source.descriptor.seaLevel,
        groundHeight,
        ocean,
        downstream: tree.downstream,
        drainageRank: tree.drainageRank,
        spillLevel: tree.spillLevel,
        discharge: tree.discharge,
        dischargeClass,
        terminalNode: assignTerminalNodes(tree),
        terminalKind: tree.terminalKind,
        terminalIndices: tree.terminalIndices,
        validNodeCount: tree.validNodeCount,
        maxDrainageRank: tree.maxDrainageRank
    });
    assertMacroDrainageGraph(graph);
    return graph;
}
