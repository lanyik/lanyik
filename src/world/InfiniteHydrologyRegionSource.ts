import { CoordinatePairMap } from "./CoordinatePairMap";
import {
    InfiniteDrainageBasinResolver,
    InfiniteDrainageBasinSite,
    compareInfiniteDrainageBasinKeys,
    infiniteDrainageSiteDistanceSquared
} from "./InfiniteDrainageBasins";
import { HydrologyRegion, HydrologyRegionKey } from "./HydrologyRegion";
import {
    HydrologyRegionAssembler,
    canonicalHydrologyPoint
} from "./HydrologyRegionAssembler";
import {
    MACRO_DRAINAGE_NODE_STEP_TILES,
    OCEAN_BODY_ID,
    assignMacroDrainageTerminalNodes,
    macroDrainageDischargeClass,
    macroDrainageTileNodeId
} from "./MacroDrainageGraph";
import {
    MACRO_DRAINAGE_TERMINAL,
    MacroDrainageRaster,
    MacroDrainageTree,
    buildMacroDrainageTree,
    deriveMacroDrainageTerminalWaterLevels,
    macroDrainageIndex
} from "./MacroDrainageTree";
import {
    MAX_LAKE_RADIUS_TILES,
    MIN_LAKE_RADIUS_TILES,
    MIN_RIVER_DISCHARGE
} from "./MacroDrainageHydrologySource";
import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import {
    BaseSemanticChunkGenerator,
    createBaseSemanticChunkGenerator
} from "./generateBaseSemanticChunk";
import { InfiniteWorldDescriptorV2 } from "./WorldDescriptorV2";
import { chunkOrigin } from "./WorldGrid";

export const DEFAULT_INFINITE_HYDROLOGY_RESIDENT_BASINS = 16;
export const MIN_INFINITE_HYDROLOGY_RESIDENT_BASINS = 9;

const BASIN_CELL_MACRO_NODES = 512 / MACRO_DRAINAGE_NODE_STEP_TILES;
const BASIN_SUPPORT_CELL_RADIUS = 1;
const BASIN_OWNER_SITE_RADIUS = 2;
const BASIN_SUPPORT_NODE_SPAN = BASIN_CELL_MACRO_NODES * (BASIN_SUPPORT_CELL_RADIUS * 2 + 1);
const UNASSIGNED_OWNER = 0xff;
const MACRO_NODE_CENTER_OFFSET = MACRO_DRAINAGE_NODE_STEP_TILES / 2;

export interface InfiniteHydrologyRegionSourceOptions {
    readonly descriptor: InfiniteWorldDescriptorV2;
    readonly maximumResidentBasins?: number;
}

export interface InfiniteHydrologyRegionSourceStats {
    readonly residentBasins: number;
    readonly residentBytes: number;
    readonly basinBuilds: number;
    readonly basinCacheHits: number;
}

interface CachedBasinGraph {
    readonly cellX: number;
    readonly cellY: number;
    readonly originNodeX: number;
    readonly originNodeY: number;
    readonly width: number;
    readonly height: number;
    readonly valid: Uint8Array;
    readonly ocean: Uint8Array;
    readonly tree: MacroDrainageTree;
    readonly terminalNode: Uint32Array;
    readonly terminalWaterLevel: Uint16Array;
    readonly bytes: number;
    lastUsed: number;
}

function checkedCellNodeOrigin(cell: number): number {
    if (!Number.isSafeInteger(cell)) throw new RangeError("infinite drainage basin cell must be a safe integer");
    const node = cell * BASIN_CELL_MACRO_NODES;
    if (!Number.isSafeInteger(node)) throw new RangeError("infinite drainage node origin exceeds safe integers");
    return node;
}

function checkedNodeTile(node: number): number {
    const tile = node * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET;
    if (!Number.isSafeInteger(tile)) throw new RangeError("infinite drainage node tile exceeds safe integers");
    return tile;
}

function sameSite(first: InfiniteDrainageBasinSite, second: InfiniteDrainageBasinSite): boolean {
    return first.cellX === second.cellX && first.cellY === second.cellY;
}

function nearestSite(
    sites: readonly InfiniteDrainageBasinSite[],
    tileX: number,
    tileY: number
): InfiniteDrainageBasinSite {
    let best = sites[0];
    let bestDistance = infiniteDrainageSiteDistanceSquared(best, tileX, tileY);
    for (let index = 1; index < sites.length; index += 1) {
        const candidate = sites[index];
        const distance = infiniteDrainageSiteDistanceSquared(candidate, tileX, tileY);
        if (distance < bestDistance
            || (distance === bestDistance && compareInfiniteDrainageBasinKeys(candidate, best) < 0)) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best;
}

function nodeAxisRange(minimumTile: number, maximumTile: number): readonly [number, number] {
    return [
        Math.ceil(
            (minimumTile - MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET)
            / MACRO_DRAINAGE_NODE_STEP_TILES
        ),
        Math.floor(
            (maximumTile + MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET)
            / MACRO_DRAINAGE_NODE_STEP_TILES
        )
    ];
}

function basinBytes(graph: Omit<CachedBasinGraph, "bytes" | "lastUsed">): number {
    return graph.valid.byteLength + graph.ocean.byteLength
        + graph.tree.terminalIndices.byteLength + graph.tree.downstream.byteLength
        + graph.tree.drainageRank.byteLength + graph.tree.spillLevel.byteLength
        + graph.tree.discharge.byteLength + graph.terminalNode.byteLength
        + graph.terminalWaterLevel.byteLength;
}

export class InfiniteHydrologyRegionSource {
    public readonly descriptor: InfiniteWorldDescriptorV2;
    public readonly worldIdentity: string;
    private readonly generator: BaseSemanticChunkGenerator;
    private readonly basinResolver: InfiniteDrainageBasinResolver;
    private readonly maximumResidentBasins: number;
    private readonly basinCache = new CoordinatePairMap<CachedBasinGraph>();
    private cacheClock = 0;
    private cacheBytes = 0;
    private basinBuilds = 0;
    private basinCacheHits = 0;

    constructor(options: Readonly<InfiniteHydrologyRegionSourceOptions>) {
        if (!options || typeof options !== "object" || !options.descriptor
            || options.descriptor.sourceKind !== "procedural-infinite") {
            throw new TypeError("infinite hydrology source requires an infinite world descriptor");
        }
        this.maximumResidentBasins = options.maximumResidentBasins
            ?? DEFAULT_INFINITE_HYDROLOGY_RESIDENT_BASINS;
        if (!Number.isInteger(this.maximumResidentBasins)
            || this.maximumResidentBasins < MIN_INFINITE_HYDROLOGY_RESIDENT_BASINS
            || this.maximumResidentBasins > 64) {
            throw new RangeError("infinite hydrology basin cache must contain between 9 and 64 basins");
        }
        this.descriptor = options.descriptor;
        this.generator = createBaseSemanticChunkGenerator(options.descriptor);
        this.worldIdentity = this.generator.identity;
        this.basinResolver = new InfiniteDrainageBasinResolver(options.descriptor.seed);
    }

    public resolveRegion(regionX: number, regionY: number): HydrologyRegionKey | undefined {
        if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return undefined;
        try {
            chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
            return Object.freeze({ regionX, regionY });
        } catch {
            return undefined;
        }
    }

    public buildRegion(regionX: number, regionY: number): HydrologyRegion {
        const key = this.resolveRegion(regionX, regionY);
        if (!key) throw new RangeError("infinite hydrology region key exceeds safe logical coordinates");
        const origin = chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
        const endX = origin.x + HYDROLOGY_REGION_SIZE;
        const endY = origin.y + HYDROLOGY_REGION_SIZE;
        const assembler = new HydrologyRegionAssembler({
            worldIdentity: this.worldIdentity,
            topology: "infinite",
            key,
            validWidth: HYDROLOGY_REGION_SIZE,
            validHeight: HYDROLOGY_REGION_SIZE,
            canonicalizePort: canonicalHydrologyPoint
        });
        const candidates = this.basinResolver.candidateSites(origin.x, origin.y);
        for (const candidate of candidates) {
            this.addBasinFeatures(this.basinFor(candidate.cellX, candidate.cellY), origin.x, origin.y, assembler);
        }
        return assembler.finish();
    }

    public get stats(): Readonly<InfiniteHydrologyRegionSourceStats> {
        return Object.freeze({
            residentBasins: this.basinCache.size,
            residentBytes: this.cacheBytes,
            basinBuilds: this.basinBuilds,
            basinCacheHits: this.basinCacheHits
        });
    }

    public clearCache(): void {
        this.basinCache.clear();
        this.cacheBytes = 0;
    }

    private basinFor(cellX: number, cellY: number): CachedBasinGraph {
        const cached = this.basinCache.get(cellX, cellY);
        if (cached) {
            this.basinCacheHits += 1;
            this.touch(cached);
            return cached;
        }
        const built = this.buildBasin(cellX, cellY);
        this.touch(built);
        this.basinCache.set(cellX, cellY, built);
        this.cacheBytes += built.bytes;
        this.basinBuilds += 1;
        while (this.basinCache.size > this.maximumResidentBasins) this.evictOldestBasin();
        return built;
    }

    private buildBasin(cellX: number, cellY: number): CachedBasinGraph {
        const target = this.basinResolver.siteAt(cellX, cellY);
        const sites: InfiniteDrainageBasinSite[] = [];
        for (let siteCellX = cellX - BASIN_OWNER_SITE_RADIUS;
            siteCellX <= cellX + BASIN_OWNER_SITE_RADIUS;
            siteCellX += 1) {
            for (let siteCellY = cellY - BASIN_OWNER_SITE_RADIUS;
                siteCellY <= cellY + BASIN_OWNER_SITE_RADIUS;
                siteCellY += 1) {
                sites.push(this.basinResolver.siteAt(siteCellX, siteCellY));
            }
        }
        const windowOriginNodeX = checkedCellNodeOrigin(cellX - BASIN_SUPPORT_CELL_RADIUS);
        const windowOriginNodeY = checkedCellNodeOrigin(cellY - BASIN_SUPPORT_CELL_RADIUS);
        const ownership = new Uint8Array(BASIN_SUPPORT_NODE_SPAN * BASIN_SUPPORT_NODE_SPAN);
        ownership.fill(UNASSIGNED_OWNER);
        let minimumX = BASIN_SUPPORT_NODE_SPAN;
        let minimumY = BASIN_SUPPORT_NODE_SPAN;
        let maximumX = -1;
        let maximumY = -1;
        for (let localX = 0; localX < BASIN_SUPPORT_NODE_SPAN; localX += 1) {
            const tileX = checkedNodeTile(windowOriginNodeX + localX);
            for (let localY = 0; localY < BASIN_SUPPORT_NODE_SPAN; localY += 1) {
                const tileY = checkedNodeTile(windowOriginNodeY + localY);
                if (!sameSite(nearestSite(sites, tileX, tileY), target)) continue;
                ownership[macroDrainageIndex(localX, localY, BASIN_SUPPORT_NODE_SPAN)] = 1;
                minimumX = Math.min(minimumX, localX);
                minimumY = Math.min(minimumY, localY);
                maximumX = Math.max(maximumX, localX);
                maximumY = Math.max(maximumY, localY);
                if (localX === 0 || localX === BASIN_SUPPORT_NODE_SPAN - 1
                    || localY === 0 || localY === BASIN_SUPPORT_NODE_SPAN - 1) {
                    throw new Error("infinite drainage basin escaped its proven three-cell support window");
                }
            }
        }
        if (maximumX < minimumX || maximumY < minimumY) {
            throw new Error("infinite drainage basin contains no macro nodes");
        }
        const width = maximumX - minimumX + 1;
        const height = maximumY - minimumY + 1;
        const length = width * height;
        const valid = new Uint8Array(length);
        const groundHeight = new Uint16Array(length);
        const ocean = new Uint8Array(length);
        const originNodeX = windowOriginNodeX + minimumX;
        const originNodeY = windowOriginNodeY + minimumY;
        for (let localX = 0; localX < width; localX += 1) {
            const tileX = checkedNodeTile(originNodeX + localX);
            for (let localY = 0; localY < height; localY += 1) {
                const ownershipIndex = macroDrainageIndex(
                    minimumX + localX,
                    minimumY + localY,
                    BASIN_SUPPORT_NODE_SPAN
                );
                if (ownership[ownershipIndex] === UNASSIGNED_OWNER) continue;
                const index = macroDrainageIndex(localX, localY, height);
                const tileY = checkedNodeTile(originNodeY + localY);
                valid[index] = 1;
                groundHeight[index] = this.generator.sampleMacroHeight(tileX, tileY);
                ocean[index] = groundHeight[index] < this.descriptor.seaLevel ? 1 : 0;
            }
        }
        const raster: MacroDrainageRaster = {
            width,
            height,
            valid,
            groundHeight,
            ocean,
            seaLevel: this.descriptor.seaLevel
        };
        const tree = buildMacroDrainageTree(raster);
        const partial = {
            cellX,
            cellY,
            originNodeX,
            originNodeY,
            width,
            height,
            valid,
            ocean,
            tree,
            terminalNode: assignMacroDrainageTerminalNodes(tree),
            terminalWaterLevel: deriveMacroDrainageTerminalWaterLevels(tree, raster)
        };
        return {
            ...partial,
            bytes: basinBytes(partial),
            lastUsed: 0
        };
    }

    private addBasinFeatures(
        basin: Readonly<CachedBasinGraph>,
        regionOriginX: number,
        regionOriginY: number,
        assembler: HydrologyRegionAssembler
    ): void {
        const [minimumNodeX, maximumNodeX] = nodeAxisRange(
            regionOriginX,
            regionOriginX + HYDROLOGY_REGION_SIZE
        );
        const [minimumNodeY, maximumNodeY] = nodeAxisRange(
            regionOriginY,
            regionOriginY + HYDROLOGY_REGION_SIZE
        );
        for (let nodeX = minimumNodeX; nodeX <= maximumNodeX; nodeX += 1) {
            const localX = nodeX - basin.originNodeX;
            if (localX < 0 || localX >= basin.width) continue;
            const sourceTileX = checkedNodeTile(nodeX);
            for (let nodeY = minimumNodeY; nodeY <= maximumNodeY; nodeY += 1) {
                const localY = nodeY - basin.originNodeY;
                if (localY < 0 || localY >= basin.height) continue;
                const sourceIndex = macroDrainageIndex(localX, localY, basin.height);
                if (basin.valid[sourceIndex] === 0) continue;
                const sourceTileY = checkedNodeTile(nodeY);
                if (sourceTileX >= regionOriginX && sourceTileX < regionOriginX + HYDROLOGY_REGION_SIZE
                    && sourceTileY >= regionOriginY && sourceTileY < regionOriginY + HYDROLOGY_REGION_SIZE
                    && basin.ocean[sourceIndex] !== 0) assembler.addOceanReference();
                const parentIndex = basin.tree.downstream[sourceIndex];
                if (parentIndex === MACRO_DRAINAGE_TERMINAL || basin.ocean[sourceIndex] !== 0
                    || basin.tree.discharge[sourceIndex] < MIN_RIVER_DISCHARGE) continue;
                const parentLocalX = Math.floor(parentIndex / basin.height);
                const parentLocalY = parentIndex - parentLocalX * basin.height;
                const parentNodeX = basin.originNodeX + parentLocalX;
                const parentNodeY = basin.originNodeY + parentLocalY;
                const parentTileX = checkedNodeTile(parentNodeX);
                const parentTileY = checkedNodeTile(parentNodeY);
                const terminalIndex = basin.terminalNode[sourceIndex];
                const terminalLocalX = Math.floor(terminalIndex / basin.height);
                const terminalLocalY = terminalIndex - terminalLocalX * basin.height;
                const terminalNodeId = macroDrainageTileNodeId(
                    checkedNodeTile(basin.originNodeX + terminalLocalX),
                    checkedNodeTile(basin.originNodeY + terminalLocalY)
                );
                const parentTerminal = basin.tree.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL;
                assembler.addDrainageEdge({
                    sourceNodeId: macroDrainageTileNodeId(sourceTileX, sourceTileY),
                    parentNodeId: macroDrainageTileNodeId(parentTileX, parentTileY),
                    terminalNodeId,
                    sourceX: sourceTileX,
                    sourceY: sourceTileY,
                    parentX: parentTileX,
                    parentY: parentTileY,
                    sourceLevel: basin.tree.spillLevel[sourceIndex],
                    parentLevel: parentTerminal
                        ? basin.terminalWaterLevel[parentIndex] : basin.tree.spillLevel[parentIndex],
                    dischargeClass: macroDrainageDischargeClass(basin.tree.discharge[sourceIndex]),
                    ...(parentTerminal ? {
                        parentTerminal: {
                            bodyId: basin.tree.terminalKind === "ocean"
                                ? OCEAN_BODY_ID : `lake:${terminalNodeId}`,
                            kind: basin.tree.terminalKind
                        }
                    } : {})
                });
            }
        }
        if (basin.tree.terminalKind !== "lake") return;
        for (const terminal of basin.tree.terminalIndices) {
            const localX = Math.floor(terminal / basin.height);
            const localY = terminal - localX * basin.height;
            const terminalNodeId = macroDrainageTileNodeId(
                checkedNodeTile(basin.originNodeX + localX),
                checkedNodeTile(basin.originNodeY + localY)
            );
            assembler.addLakeSlice({
                bodyId: `lake:${terminalNodeId}`,
                centerX: checkedNodeTile(basin.originNodeX + localX),
                centerY: checkedNodeTile(basin.originNodeY + localY),
                radiusTiles: Math.min(
                    MAX_LAKE_RADIUS_TILES,
                    MIN_LAKE_RADIUS_TILES + macroDrainageDischargeClass(basin.tree.discharge[terminal])
                ),
                level: basin.terminalWaterLevel[terminal]
            });
        }
    }

    private touch(basin: CachedBasinGraph): void {
        if (this.cacheClock >= Number.MAX_SAFE_INTEGER) {
            const entries = [...this.basinCache.values()].sort((first, second) => first.lastUsed - second.lastUsed);
            for (let index = 0; index < entries.length; index += 1) entries[index].lastUsed = index + 1;
            this.cacheClock = entries.length;
        }
        basin.lastUsed = ++this.cacheClock;
    }

    private evictOldestBasin(): void {
        let oldest: CachedBasinGraph | undefined;
        for (const basin of this.basinCache.values()) {
            if (!oldest || basin.lastUsed < oldest.lastUsed) oldest = basin;
        }
        if (!oldest) throw new Error("infinite hydrology basin cache eviction found no entry");
        this.basinCache.delete(oldest.cellX, oldest.cellY);
        this.cacheBytes -= oldest.bytes;
    }
}
