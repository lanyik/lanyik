import { Land } from "../enums";
import { getNeighbors } from "../helpers/neighbors";
import { getMapTile } from "../helpers/topology";
import { MapInfo, RiverSegment, TileInfo } from "../interfaces";
import { CoordinatePairMap } from "./CoordinatePairMap";
import { HydrologyRegion, HydrologyRegionKey } from "./HydrologyRegion";
import {
    DEFAULT_HYDROLOGY_REGION_CACHE_BYTES,
    HYDROLOGY_REGION_BASE_RESIDENT_BYTES,
    HydrologyWorldSource,
    HydrologyWorldSourceStats,
    hydrologyRegionResidentBytes
} from "./HydrologyWorldSource";
import {
    HydrologyDrainageEdgeInput,
    HydrologyLakeSliceInput,
    HydrologyRegionAssembler,
    canonicalHydrologyPoint
} from "./HydrologyRegionAssembler";
import { macroDrainageDischargeClass } from "./MacroDrainageGraph";
import {
    HYDROLOGY_REGION_SIZE
} from "./SurfaceCompileProfile";
import { SurfaceTaskRequestOptions } from "./SurfaceWorkerPool";
import {
    STATIC_PLAIN_HEIGHT,
    assertStaticMapDescriptor,
    assertStaticSemanticTile
} from "./compileStaticSemanticChunk";
import { StaticWorldDescriptorV2, serializeWorldDescriptorV2 } from "./WorldDescriptorV2";
import { chunkOrigin, hydrologyRegionLocation } from "./WorldGrid";

export const STATIC_EXPLICIT_WATER_LEVEL_OFFSET = 1_024;
export const STATIC_EXPLICIT_WATER_LEVEL = STATIC_PLAIN_HEIGHT + STATIC_EXPLICIT_WATER_LEVEL_OFFSET;
export const STATIC_LAKE_TILE_RADIUS = 1;

interface TileCoordinate {
    readonly x: number;
    readonly y: number;
}

interface RiverChain {
    readonly riverIndex: number;
    readonly tiles: readonly TileCoordinate[];
}

interface StaticRiverEdge extends HydrologyDrainageEdgeInput {}

interface StaticLakeSlice extends HydrologyLakeSliceInput {}

interface StaticRegionCacheEntry {
    readonly region: HydrologyRegion;
    readonly bytes: number;
    references: number;
    lastUsed: number;
}

export interface StaticHydrologyRegionSourceOptions {
    readonly cacheMaxBytes?: number;
}

interface StaticRiverEdgeDraft {
    readonly source: TileCoordinate;
    readonly target: TileCoordinate;
    readonly component: number;
    readonly terminal?: HydrologyDrainageEdgeInput["parentTerminal"];
}

function coordinateIdentity(x: number, y: number): string {
    return `${x}:${y}`;
}

function compareCoordinate(first: TileCoordinate, second: TileCoordinate): number {
    return first.x - second.x || first.y - second.y;
}

function isHexNeighbor(first: TileCoordinate, second: TileCoordinate): boolean {
    return getNeighbors(first.x, first.y).some(neighbor => neighbor.x === second.x && neighbor.y === second.y);
}

function assertExplicitWaterTile(tile: Readonly<TileInfo>, x: number, y: number, kind: "river" | "lake"): void {
    if (tile.type !== Land.land || tile.modifiers?.includes("hill")) {
        throw new TypeError(`static ${kind} tile ${x},${y} must use plain land ground`);
    }
}

function assertRiverEntry(entry: Readonly<RiverSegment>, x: number, y: number): void {
    if (!entry || typeof entry !== "object"
        || !Number.isSafeInteger(entry.riverIndex) || entry.riverIndex < 0
        || !Number.isSafeInteger(entry.riverTileIndex) || entry.riverTileIndex < 0) {
        throw new TypeError(`static river metadata at ${x},${y} must use non-negative safe integers`);
    }
}

function find(parent: Map<number, number>, value: number): number {
    let root = parent.get(value) as number;
    while (root !== parent.get(root)) root = parent.get(root) as number;
    let cursor = value;
    while (cursor !== root) {
        const next = parent.get(cursor) as number;
        parent.set(cursor, root);
        cursor = next;
    }
    return root;
}

function union(parent: Map<number, number>, first: number, second: number): void {
    const firstRoot = find(parent, first);
    const secondRoot = find(parent, second);
    if (firstRoot === secondRoot) return;
    parent.set(Math.max(firstRoot, secondRoot), Math.min(firstRoot, secondRoot));
}

function addBucketValue<T>(buckets: CoordinatePairMap<T[]>, regionX: number, regionY: number, value: T): void {
    const values = buckets.get(regionX, regionY);
    if (values) values.push(value);
    else buckets.set(regionX, regionY, [value]);
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("static hydrology region request was aborted", "AbortError");
    }
    const error = new Error("static hydrology region request was aborted");
    error.name = "AbortError";
    return error;
}

export class StaticHydrologyRegionSource implements HydrologyWorldSource {
    public readonly descriptor: StaticWorldDescriptorV2;
    public readonly worldIdentity: string;
    public readonly regionCountX: number;
    public readonly regionCountY: number;
    private readonly riverEdges = new CoordinatePairMap<StaticRiverEdge[]>();
    private readonly lakeSlices = new CoordinatePairMap<StaticLakeSlice[]>();
    private readonly oceanRegions = new CoordinatePairMap<true>();
    private readonly regions = new CoordinatePairMap<StaticRegionCacheEntry>();
    private readonly cacheMaxBytes: number;
    private residentBytes = 0;
    private cacheClock = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private disposed = false;

    constructor(
        map: MapInfo,
        descriptor: StaticWorldDescriptorV2,
        options: Readonly<StaticHydrologyRegionSourceOptions> = {}
    ) {
        assertStaticMapDescriptor(map, descriptor);
        this.descriptor = descriptor;
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
        this.cacheMaxBytes = options.cacheMaxBytes ?? DEFAULT_HYDROLOGY_REGION_CACHE_BYTES;
        const minimumCacheBytes = HYDROLOGY_REGION_BASE_RESIDENT_BYTES + this.worldIdentity.length * 2;
        if (!Number.isSafeInteger(this.cacheMaxBytes) || this.cacheMaxBytes < minimumCacheBytes) {
            throw new RangeError("static hydrology cache must hold at least one empty region");
        }
        this.regionCountX = Math.ceil(descriptor.width / HYDROLOGY_REGION_SIZE);
        this.regionCountY = Math.ceil(descriptor.height / HYDROLOGY_REGION_SIZE);
        this.compile(map);
    }

    public resolveRegion(regionX: number, regionY: number): HydrologyRegionKey | undefined {
        return Number.isSafeInteger(regionX) && Number.isSafeInteger(regionY)
            && regionX >= 0 && regionX < this.regionCountX
            && regionY >= 0 && regionY < this.regionCountY
            ? Object.freeze({ regionX, regionY }) : undefined;
    }

    public buildRegion(regionX: number, regionY: number): HydrologyRegion {
        if (this.disposed) throw new Error("static hydrology source has been disposed");
        const key = this.resolveRegion(regionX, regionY);
        if (!key) throw new RangeError("static hydrology region key is outside the finite world");
        const entry = this.regionFor(key);
        this.evictUnleased();
        return entry.region;
    }

    public regionDistance(regionX: number, regionY: number, centerRegionX: number, centerRegionY: number): number {
        const first = this.resolveRegion(regionX, regionY);
        const second = this.resolveRegion(centerRegionX, centerRegionY);
        return first && second
            ? Math.hypot(first.regionX - second.regionX, first.regionY - second.regionY)
            : Number.POSITIVE_INFINITY;
    }

    public loadRegion(
        regionX: number,
        regionY: number,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<HydrologyRegion> {
        if (this.disposed) return Promise.reject(new Error("static hydrology source has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        const key = this.resolveRegion(regionX, regionY);
        if (!key) return Promise.reject(new RangeError("static hydrology region key is outside the finite world"));
        const entry = this.regionFor(key);
        entry.references += 1;
        this.touch(entry);
        this.evictUnleased();
        return Promise.resolve(entry.region);
    }

    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        const entry = this.regions.get(region.key.regionX, region.key.regionY);
        if (!entry || entry.region !== region || entry.references <= 0) {
            throw new Error("static hydrology region release does not match an active source lease");
        }
        entry.references -= 1;
        this.touch(entry);
        this.evictUnleased();
    }

    public hasRegion(regionX: number, regionY: number): boolean {
        return this.regions.has(regionX, regionY);
    }

    public get stats(): Readonly<HydrologyWorldSourceStats> {
        let leasedRegions = 0;
        for (const entry of this.regions.values()) {
            if (entry.references > 0) leasedRegions += 1;
        }
        return Object.freeze({
            residentRegions: this.regions.size,
            residentBytes: this.residentBytes,
            leasedRegions,
            inFlightRegions: 0,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            workers: 0,
            busyWorkers: 0,
            queuedWorkerTasks: 0
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.regions.clear();
        this.residentBytes = 0;
    }

    private regionFor(key: Readonly<HydrologyRegionKey>): StaticRegionCacheEntry {
        const cached = this.regions.get(key.regionX, key.regionY);
        if (cached) {
            this.cacheHits += 1;
            this.touch(cached);
            return cached;
        }
        this.cacheMisses += 1;
        const region = this.assembleRegion(key);
        const entry: StaticRegionCacheEntry = {
            region,
            bytes: hydrologyRegionResidentBytes(region),
            references: 0,
            lastUsed: 0
        };
        this.touch(entry);
        this.regions.set(key.regionX, key.regionY, entry);
        this.residentBytes += entry.bytes;
        return entry;
    }

    private touch(entry: StaticRegionCacheEntry): void {
        if (this.cacheClock >= Number.MAX_SAFE_INTEGER) {
            const entries = [...this.regions.values()].sort((first, second) => first.lastUsed - second.lastUsed);
            for (let index = 0; index < entries.length; index += 1) entries[index].lastUsed = index + 1;
            this.cacheClock = entries.length;
        }
        this.cacheClock += 1;
        entry.lastUsed = this.cacheClock;
    }

    private evictUnleased(): void {
        while (this.residentBytes > this.cacheMaxBytes) {
            let candidate: StaticRegionCacheEntry | undefined;
            for (const entry of this.regions.values()) {
                if (entry.references === 0 && (!candidate || entry.lastUsed < candidate.lastUsed)) candidate = entry;
            }
            if (!candidate) return;
            this.regions.delete(candidate.region.key.regionX, candidate.region.key.regionY);
            this.residentBytes -= candidate.bytes;
        }
    }

    private assembleRegion(key: Readonly<HydrologyRegionKey>): HydrologyRegion {
        const regionX = key.regionX;
        const regionY = key.regionY;
        const origin = chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
        const assembler = new HydrologyRegionAssembler({
            worldIdentity: this.worldIdentity,
            topology: "finite",
            key,
            validWidth: Math.min(HYDROLOGY_REGION_SIZE, this.descriptor.width - origin.x),
            validHeight: Math.min(HYDROLOGY_REGION_SIZE, this.descriptor.height - origin.y),
            canonicalizePort: canonicalHydrologyPoint
        });
        if (this.oceanRegions.has(regionX, regionY)) assembler.addOceanReference();
        for (const edge of this.riverEdges.get(regionX, regionY) ?? []) assembler.addDrainageEdge(edge);
        for (const lake of this.lakeSlices.get(regionX, regionY) ?? []) assembler.addLakeSlice(lake);
        return assembler.finish();
    }

    private compile(map: MapInfo): void {
        const riverGroups = new Map<number, Map<number, TileCoordinate>>();
        const riverEntriesByTile = new Map<string, readonly RiverSegment[]>();
        const lakeTiles = new Map<string, TileCoordinate>();
        for (let x = 0; x < this.descriptor.width; x += 1) {
            for (let y = 0; y < this.descriptor.height; y += 1) {
                const tile = getMapTile(map, x, y);
                if (!tile) throw new TypeError(`static hydrology map is missing tile ${x},${y}`);
                assertStaticSemanticTile(tile, x, y);
                const isRiver = tile.modifiers?.includes("river") ?? false;
                const isLake = tile.modifiers?.includes("lake") ?? false;
                if (isRiver && isLake) throw new TypeError(`static water tile ${x},${y} cannot be river and lake`);
                if (tile.type === Land.sea || tile.type === Land.coastal) {
                    const location = hydrologyRegionLocation(x, y);
                    this.oceanRegions.set(location.chunkX, location.chunkY, true);
                }
                if (isLake) {
                    assertExplicitWaterTile(tile, x, y, "lake");
                    if (tile.rivers && tile.rivers.length > 0) {
                        throw new TypeError(`static lake tile ${x},${y} cannot carry river ordering metadata`);
                    }
                    lakeTiles.set(coordinateIdentity(x, y), Object.freeze({ x, y }));
                }
                if (!isRiver) {
                    if (tile.rivers && tile.rivers.length > 0) {
                        throw new TypeError(`static non-river tile ${x},${y} carries river ordering metadata`);
                    }
                    continue;
                }
                assertExplicitWaterTile(tile, x, y, "river");
                if (!Array.isArray(tile.rivers) || tile.rivers.length === 0) {
                    throw new TypeError(`static river tile ${x},${y} requires ordered river metadata`);
                }
                const riverIndices = new Set<number>();
                for (const entry of tile.rivers) {
                    assertRiverEntry(entry, x, y);
                    if (riverIndices.has(entry.riverIndex)) {
                        throw new Error(`static river tile ${x},${y} repeats river ${entry.riverIndex}`);
                    }
                    riverIndices.add(entry.riverIndex);
                    let group = riverGroups.get(entry.riverIndex);
                    if (!group) {
                        group = new Map();
                        riverGroups.set(entry.riverIndex, group);
                    }
                    if (group.has(entry.riverTileIndex)) {
                        throw new Error(`static river ${entry.riverIndex} repeats tile index ${entry.riverTileIndex}`);
                    }
                    group.set(entry.riverTileIndex, Object.freeze({ x, y }));
                }
                riverEntriesByTile.set(coordinateIdentity(x, y), tile.rivers);
            }
        }
        const lakeBodyByTile = this.compileLakes(lakeTiles);
        const chains = this.compileRiverChains(riverGroups);
        this.compileRivers(map, chains, riverEntriesByTile, lakeBodyByTile);
    }

    private compileLakes(lakeTiles: ReadonlyMap<string, TileCoordinate>): ReadonlyMap<string, string> {
        const bodyByTile = new Map<string, string>();
        const visited = new Set<string>();
        for (const tile of lakeTiles.values()) {
            const identity = coordinateIdentity(tile.x, tile.y);
            if (visited.has(identity)) continue;
            const component: TileCoordinate[] = [];
            const queue = [tile];
            visited.add(identity);
            for (let read = 0; read < queue.length; read += 1) {
                const current = queue[read];
                component.push(current);
                for (const neighbor of getNeighbors(current.x, current.y)) {
                    const neighborIdentity = coordinateIdentity(neighbor.x, neighbor.y);
                    const next = lakeTiles.get(neighborIdentity);
                    if (!next || visited.has(neighborIdentity)) continue;
                    visited.add(neighborIdentity);
                    queue.push(next);
                }
            }
            component.sort(compareCoordinate);
            const bodyId = `static-lake:${component[0].x}:${component[0].y}`;
            for (const current of component) {
                bodyByTile.set(coordinateIdentity(current.x, current.y), bodyId);
                this.assignLakeSlice({
                    bodyId,
                    centerX: current.x,
                    centerY: current.y,
                    radiusTiles: STATIC_LAKE_TILE_RADIUS,
                    level: STATIC_EXPLICIT_WATER_LEVEL
                });
            }
        }
        return bodyByTile;
    }

    private compileRiverChains(groups: ReadonlyMap<number, Map<number, TileCoordinate>>): readonly RiverChain[] {
        const chains: RiverChain[] = [];
        for (const [riverIndex, indexedTiles] of groups) {
            const tiles: TileCoordinate[] = [];
            for (let riverTileIndex = 0; riverTileIndex < indexedTiles.size; riverTileIndex += 1) {
                const tile = indexedTiles.get(riverTileIndex);
                if (!tile) throw new Error(`static river ${riverIndex} tile indices must be contiguous from zero`);
                tiles.push(tile);
                if (riverTileIndex > 0 && !isHexNeighbor(tiles[riverTileIndex - 1], tile)) {
                    throw new Error(`static river ${riverIndex} has non-neighboring ordered tiles`);
                }
            }
            chains.push(Object.freeze({ riverIndex, tiles: Object.freeze(tiles) }));
        }
        chains.sort((first, second) => first.riverIndex - second.riverIndex);
        return Object.freeze(chains);
    }

    private compileRivers(
        map: MapInfo,
        chains: readonly RiverChain[],
        entriesByTile: ReadonlyMap<string, readonly RiverSegment[]>,
        lakeBodyByTile: ReadonlyMap<string, string>
    ): void {
        const parent = new Map<number, number>();
        for (const chain of chains) parent.set(chain.riverIndex, chain.riverIndex);
        for (const entries of entriesByTile.values()) {
            for (let index = 1; index < entries.length; index += 1) {
                union(parent, entries[0].riverIndex, entries[index].riverIndex);
            }
        }
        const componentMinimum = new Map<number, number>();
        for (const chain of chains) {
            const root = find(parent, chain.riverIndex);
            componentMinimum.set(root, Math.min(componentMinimum.get(root) ?? chain.riverIndex, chain.riverIndex));
        }
        const componentByRiver = new Map<number, number>();
        for (const chain of chains) componentByRiver.set(
            chain.riverIndex,
            componentMinimum.get(find(parent, chain.riverIndex)) as number
        );

        const edgeDrafts = new Map<string, StaticRiverEdgeDraft>();
        const graphNodes = new Set<string>();
        const graphEdges = new Map<string, Set<string>>();
        const downstreamByNode = new Map<string, string>();
        const claimDownstream = (source: TileCoordinate, targetIdentity: string): void => {
            const sourceId = coordinateIdentity(source.x, source.y);
            const existing = downstreamByNode.get(sourceId);
            if (existing !== undefined && existing !== targetIdentity) {
                throw new Error(`static river node ${source.x},${source.y} has divergent ordered outlets`);
            }
            downstreamByNode.set(sourceId, targetIdentity);
        };
        const addGraphEdge = (source: TileCoordinate, target: TileCoordinate): void => {
            const sourceId = coordinateIdentity(source.x, source.y);
            const targetId = coordinateIdentity(target.x, target.y);
            claimDownstream(source, `node:${targetId}`);
            graphNodes.add(sourceId);
            graphNodes.add(targetId);
            let targets = graphEdges.get(sourceId);
            if (!targets) {
                targets = new Set();
                graphEdges.set(sourceId, targets);
            }
            targets.add(targetId);
        };
        const addEdgeDraft = (
            source: TileCoordinate,
            target: TileCoordinate,
            component: number,
            terminal?: HydrologyDrainageEdgeInput["parentTerminal"]
        ): void => {
            const identity = `${component}:${source.x}:${source.y}>${target.x}:${target.y}:${terminal?.bodyId ?? "node"}`;
            if (!edgeDrafts.has(identity)) edgeDrafts.set(identity, Object.freeze({
                source,
                target,
                component,
                ...(terminal ? { terminal } : {})
            }));
        };

        for (const chain of chains) {
            const component = componentByRiver.get(chain.riverIndex) as number;
            for (const tile of chain.tiles) graphNodes.add(coordinateIdentity(tile.x, tile.y));
            for (let index = 0; index < chain.tiles.length - 1; index += 1) {
                addGraphEdge(chain.tiles[index], chain.tiles[index + 1]);
                addEdgeDraft(chain.tiles[index], chain.tiles[index + 1], component);
            }
            const finalTile = chain.tiles[chain.tiles.length - 1];
            const targets = new Map<string, TileCoordinate>();
            for (const neighbor of getNeighbors(finalTile.x, finalTile.y)) {
                const tile = getMapTile(map, neighbor.x, neighbor.y);
                if (!tile) continue;
                const lakeBody = lakeBodyByTile.get(coordinateIdentity(neighbor.x, neighbor.y));
                const bodyId = lakeBody ?? (tile.type === Land.sea || tile.type === Land.coastal ? "ocean" : undefined);
                if (!bodyId) continue;
                const current = targets.get(bodyId);
                if (!current || compareCoordinate(neighbor, current) < 0) {
                    targets.set(bodyId, Object.freeze({ x: neighbor.x, y: neighbor.y }));
                }
            }
            if (targets.size > 1) {
                throw new Error(`static river ${chain.riverIndex} has ambiguous terminal water bodies`);
            }
            for (const [bodyId, target] of targets) {
                claimDownstream(finalTile, `body:${bodyId}`);
                addEdgeDraft(finalTile, target, component, {
                    bodyId,
                    kind: bodyId === "ocean" ? "ocean" : "lake"
                });
            }
        }
        for (const node of graphNodes) {
            if (!downstreamByNode.has(node)) {
                throw new Error(`static river node ${node} has no ocean, lake or continuing river outlet`);
            }
        }
        const dischargeByNode = this.calculateRiverDischarge(graphNodes, graphEdges);
        for (const draft of edgeDrafts.values()) {
            const sourceIdentity = coordinateIdentity(draft.source.x, draft.source.y);
            const discharge = dischargeByNode.get(sourceIdentity);
            if (discharge === undefined) throw new Error("static river edge lost its discharge source");
            const edge: StaticRiverEdge = Object.freeze({
                sourceNodeId: `static-node:${draft.source.x}:${draft.source.y}`,
                parentNodeId: `static-node:${draft.target.x}:${draft.target.y}`,
                terminalNodeId: `static:${draft.component}`,
                sourceX: draft.source.x,
                sourceY: draft.source.y,
                parentX: draft.target.x,
                parentY: draft.target.y,
                sourceLevel: STATIC_EXPLICIT_WATER_LEVEL,
                parentLevel: draft.terminal?.kind === "ocean"
                    ? this.descriptor.seaLevel : STATIC_EXPLICIT_WATER_LEVEL,
                dischargeClass: macroDrainageDischargeClass(discharge),
                ...(draft.terminal ? { parentTerminal: draft.terminal } : {})
            });
            this.assignRiverEdge(edge);
        }
    }

    private calculateRiverDischarge(
        nodes: ReadonlySet<string>,
        edges: ReadonlyMap<string, ReadonlySet<string>>
    ): ReadonlyMap<string, number> {
        const indegree = new Map<string, number>();
        const discharge = new Map<string, number>();
        for (const node of nodes) indegree.set(node, 0);
        for (const node of nodes) discharge.set(node, 1);
        for (const targets of edges.values()) {
            for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
        }
        const queue = [...nodes].filter(node => indegree.get(node) === 0).sort();
        let visited = 0;
        for (let read = 0; read < queue.length; read += 1) {
            const node = queue[read];
            visited += 1;
            for (const target of edges.get(node) ?? []) {
                const nextDischarge = (discharge.get(target) as number) + (discharge.get(node) as number);
                if (!Number.isSafeInteger(nextDischarge)) {
                    throw new RangeError("static river accumulated discharge exceeds safe integer range");
                }
                discharge.set(target, nextDischarge);
                const next = (indegree.get(target) as number) - 1;
                indegree.set(target, next);
                if (next === 0) queue.push(target);
            }
        }
        if (visited !== nodes.size) throw new Error("static ordered river metadata contains a directed cycle");
        return discharge;
    }

    private assignRiverEdge(edge: StaticRiverEdge): void {
        const minimumRegionX = Math.max(0, Math.floor(Math.min(edge.sourceX, edge.parentX) / HYDROLOGY_REGION_SIZE));
        const maximumRegionX = Math.min(
            this.regionCountX - 1,
            Math.floor(Math.max(edge.sourceX, edge.parentX) / HYDROLOGY_REGION_SIZE)
        );
        const minimumRegionY = Math.max(0, Math.floor(Math.min(edge.sourceY, edge.parentY) / HYDROLOGY_REGION_SIZE));
        const maximumRegionY = Math.min(
            this.regionCountY - 1,
            Math.floor(Math.max(edge.sourceY, edge.parentY) / HYDROLOGY_REGION_SIZE)
        );
        for (let regionX = minimumRegionX; regionX <= maximumRegionX; regionX += 1) {
            for (let regionY = minimumRegionY; regionY <= maximumRegionY; regionY += 1) {
                addBucketValue(this.riverEdges, regionX, regionY, edge);
            }
        }
    }

    private assignLakeSlice(lake: StaticLakeSlice): void {
        const minimumRegionX = Math.max(0, Math.floor((lake.centerX - lake.radiusTiles) / HYDROLOGY_REGION_SIZE));
        const maximumRegionX = Math.min(
            this.regionCountX - 1,
            Math.floor((lake.centerX + lake.radiusTiles) / HYDROLOGY_REGION_SIZE)
        );
        const minimumRegionY = Math.max(0, Math.floor((lake.centerY - lake.radiusTiles) / HYDROLOGY_REGION_SIZE));
        const maximumRegionY = Math.min(
            this.regionCountY - 1,
            Math.floor((lake.centerY + lake.radiusTiles) / HYDROLOGY_REGION_SIZE)
        );
        for (let regionX = minimumRegionX; regionX <= maximumRegionX; regionX += 1) {
            for (let regionY = minimumRegionY; regionY <= maximumRegionY; regionY += 1) {
                addBucketValue(this.lakeSlices, regionX, regionY, lake);
            }
        }
    }
}
