import { Land } from "../enums";
import { getNeighbors } from "../helpers/neighbors";
import { getMapNeighbors, getMapTile, normalizeMapCoordinates } from "../helpers/topology";
import { MapInfo, Point, TileInfo } from "../interfaces";
import { WorldBounds, WorldChunk, WorldSource } from "./WorldSource";
import {
    ChunkResidencyCoordinator,
    getChunkResidencyCoordinator,
    WorldChunkLease
} from "./ChunkResidencyCoordinator";
import {
    BoundedWorldChunkGeneration,
    generateWorldChunk,
    SparseWorldChunkStore
} from "./generateWorldChunk";
import { createWorldDescriptor, serializeWorldDescriptor } from "./WorldDescriptor";

export const WORLD_NAVIGATION_FORMAT_VERSION = 2;

export interface WorldNavigationPortal {
    id: string;
    entranceId: string;
    inside: Point;
    outside: Point;
    targetChunkX: number;
    targetChunkY: number;
    crossingCost: number;
}

export interface WorldNavigationChunkSummary {
    version: typeof WORLD_NAVIGATION_FORMAT_VERSION;
    chunkX: number;
    chunkY: number;
    movementType: string;
    terrainRevision: string | number;
    deltaRevision: number;
    portals: readonly WorldNavigationPortal[];
    costs: readonly (readonly (number | null)[])[];
}

export interface WorldNavigationIndex {
    readonly chunkSize: number;
    readonly bounds?: WorldBounds;
    readonly movementType: string;
    getSummary(chunkX: number, chunkY: number): Promise<WorldNavigationChunkSummary | undefined>;
    invalidateChunk?(chunkX: number, chunkY: number): boolean;
}

export type TilePassability = (tile: TileInfo, x: number, y: number) => boolean;
export type TileMovementCost = (tile: TileInfo, x: number, y: number) => number;

export interface WorldNavigationBuildOptions {
    maxPortalsPerEntrance?: number;
    movementType?: string;
    terrainRevision?: string | number;
    deltaRevision?: number;
    movementCost?: TileMovementCost;
}

export interface WorldNavigationRevision {
    terrainRevision: string | number;
    deltaRevision: number;
}

export type WorldNavigationRevisionProvider = (
    chunkX: number,
    chunkY: number
) => WorldNavigationRevision | undefined | Promise<WorldNavigationRevision | undefined>;

export class StaleWorldNavigationSummaryError extends Error {
    public readonly name = "StaleWorldNavigationSummaryError";
    constructor(public readonly chunkX: number, public readonly chunkY: number) {
        super(`Navigation summary ${chunkX},${chunkY} does not match the current world revision`);
    }
}

const pointKey = (point: Point): string => `${point.x},${point.y}`;
const chunkKey = (x: number, y: number): string => `${x},${y}`;

interface QueueNode<T> { value: T; priority: number }

class MinQueue<T> {
    private readonly entries: QueueNode<T>[] = [];
    public get size(): number { return this.entries.length; }
    public push(value: T, priority: number): void {
        const entry = { value, priority };
        this.entries.push(entry);
        let index = this.entries.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.entries[parent].priority <= priority) break;
            this.entries[index] = this.entries[parent];
            index = parent;
        }
        this.entries[index] = entry;
    }
    public pop(): QueueNode<T> | undefined {
        const first = this.entries[0];
        const last = this.entries.pop();
        if (!first || !last || this.entries.length === 0) return first;
        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            if (left >= this.entries.length) break;
            const child = right < this.entries.length && this.entries[right].priority < this.entries[left].priority ? right : left;
            if (this.entries[child].priority >= last.priority) break;
            this.entries[index] = this.entries[child];
            index = child;
        }
        this.entries[index] = last;
        return first;
    }
}

export class MemoryWorldNavigationIndex implements WorldNavigationIndex {
    private readonly summaries = new Map<string, WorldNavigationChunkSummary>();
    constructor(
        public readonly chunkSize: number,
        public readonly bounds?: WorldBounds,
        public readonly movementType = "default"
    ) {
        if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError("navigation chunkSize must be positive");
        if (!movementType.trim()) throw new TypeError("navigation movementType must be a non-empty string");
    }
    public setSummary(summary: WorldNavigationChunkSummary): void {
        assertNavigationSummary(summary);
        if (summary.movementType !== this.movementType) {
            throw new TypeError("navigation summary movementType does not match its index");
        }
        this.summaries.set(chunkKey(summary.chunkX, summary.chunkY), summary);
    }
    public getSummary(chunkX: number, chunkY: number): Promise<WorldNavigationChunkSummary | undefined> {
        return Promise.resolve(this.summaries.get(chunkKey(chunkX, chunkY)));
    }
    public invalidateChunk(chunkX: number, chunkY: number): boolean {
        return this.summaries.delete(chunkKey(chunkX, chunkY));
    }
}

export interface ProceduralWorldNavigationIndexOptions {
    seed: string | number;
    chunkSize: number;
    world?: BoundedWorldChunkGeneration;
    passable?: TilePassability;
    movementCost?: TileMovementCost;
    movementType?: string;
    terrainRevision?: string | number;
    deltaRevision?: number;
    maxPortalsPerEntrance?: number;
    maxCachedSummaries?: number;
}

//Builds compact Portal summaries directly from deterministic packed terrain.
//It does not call WorldSource.loadChunk() and never installs tiles in the
//render source; only the bounded LRU of summaries survives the request.
export class ProceduralWorldNavigationIndex implements WorldNavigationIndex {
    public readonly chunkSize: number;
    public readonly bounds: WorldBounds | undefined;
    public readonly movementType: string;
    private readonly seed: string | number;
    private readonly world: BoundedWorldChunkGeneration | undefined;
    private readonly passable: TilePassability;
    private readonly buildOptions: WorldNavigationBuildOptions;
    private readonly maxCached: number;
    private readonly cache = new Map<string, WorldNavigationChunkSummary>();

    constructor(options: ProceduralWorldNavigationIndexOptions) {
        if (!options || !Number.isSafeInteger(options.chunkSize) || options.chunkSize <= 0) {
            throw new RangeError("procedural navigation chunkSize must be positive");
        }
        this.seed = options.seed;
        this.chunkSize = options.chunkSize;
        this.world = options.world;
        this.bounds = options.world
            ? { width: options.world.width, height: options.world.height, wrapX: true, wrapY: true }
            : undefined;
        this.passable = options.passable ?? (tile => tile.type !== Land.sea);
        this.movementType = options.movementType ?? "default";
        this.buildOptions = {
            movementType: this.movementType,
            movementCost: options.movementCost,
            terrainRevision: options.terrainRevision ?? serializeWorldDescriptor(createWorldDescriptor({
                seed: options.seed,
                chunkSize: options.chunkSize,
                world: options.world
            })),
            deltaRevision: options.deltaRevision ?? 0,
            maxPortalsPerEntrance: options.maxPortalsPerEntrance
        };
        this.maxCached = options.maxCachedSummaries ?? 2048;
        if (!Number.isInteger(this.maxCached) || this.maxCached <= 0) {
            throw new RangeError("maxCachedSummaries must be a positive integer");
        }
    }

    public get cachedSummaries(): number { return this.cache.size; }

    public getSummary(chunkX: number, chunkY: number): Promise<WorldNavigationChunkSummary | undefined> {
        const resolved = this.resolveChunk(chunkX, chunkY);
        if (!resolved) return Promise.resolve(undefined);
        const key = chunkKey(resolved.x, resolved.y);
        const cached = this.cache.get(key);
        if (cached) {
            this.cache.delete(key);
            this.cache.set(key, cached);
            return Promise.resolve(cached);
        }
        const packed = generateWorldChunk({
            seed: this.seed,
            chunkX: resolved.x,
            chunkY: resolved.y,
            chunkSize: this.chunkSize,
            world: this.world
        });
        const store = this.bounds ? new SparseWorldChunkStore(this.bounds) : new SparseWorldChunkStore();
        store.add(packed);
        const summary = buildWorldNavigationSummary(
            store.map, resolved.x, resolved.y, this.chunkSize, this.passable, this.buildOptions
        );
        this.cache.set(key, summary);
        while (this.cache.size > this.maxCached) this.cache.delete(this.cache.keys().next().value!);
        return Promise.resolve(summary);
    }

    public invalidateChunk(chunkX: number, chunkY: number): boolean {
        const resolved = this.resolveChunk(chunkX, chunkY);
        return resolved ? this.cache.delete(chunkKey(resolved.x, resolved.y)) : false;
    }

    private resolveChunk(chunkX: number, chunkY: number): Point | undefined {
        if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) return undefined;
        if (!this.bounds) return { x: chunkX, y: chunkY };
        const countX = Math.ceil(this.bounds.width / this.chunkSize);
        const countY = Math.ceil(this.bounds.height / this.chunkSize);
        return { x: ((chunkX % countX) + countX) % countX, y: ((chunkY % countY) + countY) % countY };
    }
}

export function assertNavigationSummary(summary: WorldNavigationChunkSummary): void {
    if (!summary || summary.version !== WORLD_NAVIGATION_FORMAT_VERSION || !Number.isSafeInteger(summary.chunkX)
        || !Number.isSafeInteger(summary.chunkY) || typeof summary.movementType !== "string"
        || summary.movementType.trim().length === 0
        || (typeof summary.terrainRevision !== "string" && !Number.isFinite(summary.terrainRevision))
        || !Number.isSafeInteger(summary.deltaRevision) || summary.deltaRevision < 0
        || !Array.isArray(summary.portals)
        || !Array.isArray(summary.costs) || summary.costs.length !== summary.portals.length
        || summary.costs.some(row => !Array.isArray(row) || row.length !== summary.portals.length
            || row.some(cost => cost !== null && (!Number.isFinite(cost) || cost < 0)))
        || summary.portals.some(portal => !portal?.id || !portal.entranceId || !Number.isSafeInteger(portal.inside.x)
            || !Number.isSafeInteger(portal.inside.y) || !Number.isSafeInteger(portal.outside.x)
            || !Number.isSafeInteger(portal.outside.y) || !Number.isSafeInteger(portal.targetChunkX)
            || !Number.isSafeInteger(portal.targetChunkY) || !Number.isFinite(portal.crossingCost)
            || portal.crossingCost <= 0)) {
        throw new TypeError("world navigation chunk summary is invalid");
    }
}

export function buildWorldNavigationSummary(
    map: MapInfo,
    chunkX: number,
    chunkY: number,
    chunkSize: number,
    passable: TilePassability,
    options: WorldNavigationBuildOptions = {}
): WorldNavigationChunkSummary {
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)
        || !Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError("navigation chunk coordinates and size are invalid");
    const originX = chunkX * chunkSize;
    const originY = chunkY * chunkSize;
    const width = map.infinite ? chunkSize : Math.max(0, Math.min(chunkSize, map.w - originX));
    const height = map.infinite ? chunkSize : Math.max(0, Math.min(chunkSize, map.h - originY));
    const maxPortalsPerEntrance = options.maxPortalsPerEntrance ?? 2;
    if (!Number.isInteger(maxPortalsPerEntrance) || maxPortalsPerEntrance <= 0) {
        throw new RangeError("maxPortalsPerEntrance must be a positive integer");
    }
    const movementType = options.movementType ?? "default";
    if (typeof movementType !== "string" || movementType.trim().length === 0) {
        throw new TypeError("navigation movementType must be a non-empty string");
    }
    const terrainRevision = options.terrainRevision ?? 0;
    if (typeof terrainRevision !== "string" && !Number.isFinite(terrainRevision)) {
        throw new TypeError("terrainRevision must be a string or finite number");
    }
    const deltaRevision = options.deltaRevision ?? 0;
    if (!Number.isSafeInteger(deltaRevision) || deltaRevision < 0) {
        throw new RangeError("deltaRevision must be a non-negative safe integer");
    }
    const rawPortals: WorldNavigationPortal[] = [];
    const seen = new Set<string>();

    for (let localX = 0; localX < width; localX += 1) {
        for (let localY = 0; localY < height; localY += 1) {
            const inside = { x: originX + localX, y: originY + localY };
            const tile = getMapTile(map, inside.x, inside.y);
            if (!tile || !passable(tile, inside.x, inside.y)) continue;
            for (const raw of getNeighbors(inside.x, inside.y)) {
                const outside = normalizeMapCoordinates(map, raw.x, raw.y);
                if (!outside) continue;
                const targetChunkX = Math.floor(outside.x / chunkSize);
                const targetChunkY = Math.floor(outside.y / chunkSize);
                if (targetChunkX === chunkX && targetChunkY === chunkY) continue;
                const outsideTile = getMapTile(map, outside.x, outside.y);
                if (!outsideTile || !passable(outsideTile, outside.x, outside.y)) continue;
                const id = `${inside.x},${inside.y}>${outside.x},${outside.y}`;
                if (seen.has(id)) continue;
                seen.add(id);
                rawPortals.push({
                    id,
                    entranceId: id,
                    inside,
                    outside,
                    targetChunkX,
                    targetChunkY,
                    crossingCost: getMovementCost(outsideTile, outside.x, outside.y, options.movementCost)
                });
            }
        }
    }
    const portals = compactPortals(map, rawPortals, maxPortalsPerEntrance);

    const costs: Array<Array<number | null>> = portals.map(() => portals.map(() => null));
    for (let index = 0; index < portals.length; index += 1) {
        const distances = localDistances(
            map,
            portals[index].inside,
            chunkX,
            chunkY,
            chunkSize,
            passable,
            options.movementCost
        );
        for (let target = 0; target < portals.length; target += 1) {
            costs[index][target] = distances.get(pointKey(portals[target].inside)) ?? null;
        }
    }
    return {
        version: WORLD_NAVIGATION_FORMAT_VERSION,
        chunkX,
        chunkY,
        movementType,
        terrainRevision,
        deltaRevision,
        portals,
        costs
    };
}

function compactPortals(
    map: MapInfo,
    rawPortals: readonly WorldNavigationPortal[],
    maximum: number
): WorldNavigationPortal[] {
    const remaining = new Set(rawPortals.map((_, index) => index));
    const compacted: WorldNavigationPortal[] = [];
    while (remaining.size > 0) {
        const seed = remaining.values().next().value!;
        remaining.delete(seed);
        const component: WorldNavigationPortal[] = [];
        const queue = [seed];
        for (let head = 0; head < queue.length; head += 1) {
            const index = queue[head];
            const portal = rawPortals[index];
            component.push(portal);
            for (const candidate of [...remaining]) {
                if (!portalsTouch(map, portal, rawPortals[candidate])) continue;
                remaining.delete(candidate);
                queue.push(candidate);
            }
        }
        component.sort(compareUndirectedCrossings);
        const first = undirectedCrossingKey(component[0]);
        const last = undirectedCrossingKey(component[component.length - 1]);
        const entranceId = `${first}..${last}#${component.length}`;
        for (const portal of selectRepresentatives(component, maximum)) {
            compacted.push({ ...portal, entranceId });
        }
    }
    return compacted.sort((a, b) => a.id.localeCompare(b.id));
}

function portalsTouch(map: MapInfo, first: WorldNavigationPortal, second: WorldNavigationPortal): boolean {
    if (first.targetChunkX !== second.targetChunkX || first.targetChunkY !== second.targetChunkY) return false;
    return sameOrNeighbor(map, first.inside, second.inside)
        && sameOrNeighbor(map, first.outside, second.outside);
}

function sameOrNeighbor(map: MapInfo, first: Point, second: Point): boolean {
    return (first.x === second.x && first.y === second.y)
        || getMapNeighbors(map, first.x, first.y).some(point => point.x === second.x && point.y === second.y);
}

function selectRepresentatives(
    portals: readonly WorldNavigationPortal[],
    maximum: number
): readonly WorldNavigationPortal[] {
    if (portals.length <= maximum) return portals;
    if (maximum === 1) return [portals[Math.floor((portals.length - 1) / 2)]];
    const selected: WorldNavigationPortal[] = [];
    const seen = new Set<number>();
    for (let index = 0; index < maximum; index += 1) {
        const selectedIndex = Math.round(index * (portals.length - 1) / (maximum - 1));
        if (!seen.has(selectedIndex)) selected.push(portals[selectedIndex]);
        seen.add(selectedIndex);
    }
    return selected;
}

function compareUndirectedCrossings(first: WorldNavigationPortal, second: WorldNavigationPortal): number {
    const a = undirectedCrossingTuple(first);
    const b = undirectedCrossingTuple(second);
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
}

function undirectedCrossingTuple(portal: WorldNavigationPortal): [number, number, number, number] {
    const first = portal.inside.x < portal.outside.x
        || (portal.inside.x === portal.outside.x && portal.inside.y <= portal.outside.y)
        ? portal.inside : portal.outside;
    const second = first === portal.inside ? portal.outside : portal.inside;
    return [first.x, first.y, second.x, second.y];
}

function undirectedCrossingKey(portal: WorldNavigationPortal): string {
    return undirectedCrossingTuple(portal).join(",");
}

function localDistances(
    map: MapInfo,
    start: Point,
    chunkX: number,
    chunkY: number,
    chunkSize: number,
    passable: TilePassability,
    movementCost?: TileMovementCost
): Map<string, number> {
    const distances = new Map<string, number>([[pointKey(start), 0]]);
    const frontier = new MinQueue<Point>();
    frontier.push(start, 0);
    while (frontier.size > 0) {
        const queued = frontier.pop()!;
        const current = queued.value;
        const distance = distances.get(pointKey(current));
        if (distance === undefined || distance !== queued.priority) continue;
        for (const neighbor of getMapNeighbors(map, current.x, current.y)) {
            if (Math.floor(neighbor.x / chunkSize) !== chunkX || Math.floor(neighbor.y / chunkSize) !== chunkY) continue;
            const key = pointKey(neighbor);
            const tile = getMapTile(map, neighbor.x, neighbor.y);
            if (!tile || !passable(tile, neighbor.x, neighbor.y)) continue;
            const nextDistance = distance + getMovementCost(tile, neighbor.x, neighbor.y, movementCost);
            if (nextDistance >= (distances.get(key) ?? Infinity)) continue;
            distances.set(key, nextDistance);
            frontier.push(neighbor, nextDistance);
        }
    }
    return distances;
}

function getMovementCost(tile: TileInfo, x: number, y: number, movementCost?: TileMovementCost): number {
    const cost = movementCost?.(tile, x, y) ?? 1;
    if (!Number.isFinite(cost) || cost <= 0) {
        throw new RangeError("tile movement costs must be positive finite numbers");
    }
    return cost;
}

interface PortalState { chunkX: number; chunkY: number; entryIndex: number }
interface LocalPath { path: Point[]; cost: number }
interface PortalTransition {
    from: PortalState;
    to: PortalState;
    exit: WorldNavigationPortal;
    entry: WorldNavigationPortal;
}

export interface HierarchicalPathOptions {
    maxVisitedPortals?: number;
    releaseLoadedChunks?: boolean;
    signal?: AbortSignal;
}

export interface HierarchicalPathResult {
    path: readonly Point[];
    chunks: readonly Point[];
    visitedPortals: number;
    loadedChunks: readonly WorldChunk[];
    release(): void;
}

export interface HierarchicalPathfinderOptions {
    residency?: ChunkResidencyCoordinator;
    owner?: string;
    movementType?: string;
    movementCost?: TileMovementCost;
    expectedRevision?: WorldNavigationRevisionProvider;
}

export class HierarchicalPathfinder {
    private readonly residency: ChunkResidencyCoordinator;
    private readonly owner: string;
    private readonly movementType: string;
    private readonly movementCost: TileMovementCost | undefined;
    private readonly expectedRevision: WorldNavigationRevisionProvider | undefined;

    constructor(
        private readonly source: WorldSource,
        private readonly index: WorldNavigationIndex,
        private readonly passable: TilePassability = tile => tile.type !== Land.sea,
        options: HierarchicalPathfinderOptions = {}
    ) {
        if (source.chunkSize !== index.chunkSize) throw new Error("navigation index chunkSize must match WorldSource chunkSize");
        this.movementType = options.movementType ?? "default";
        if (index.movementType !== this.movementType) {
            throw new TypeError("navigation index movementType does not match the pathfinder");
        }
        this.movementCost = options.movementCost;
        this.expectedRevision = options.expectedRevision
            ?? (source.getChunkRevision
                ? (chunkX, chunkY) => source.getChunkRevision!(chunkX, chunkY)
                : undefined);
        this.residency = options.residency ?? getChunkResidencyCoordinator(source);
        if (this.residency.source !== source) {
            throw new TypeError("HierarchicalPathfinder residency must coordinate its source");
        }
        this.owner = options.owner ?? "hierarchical-pathfinder";
        if (typeof this.owner !== "string" || this.owner.trim().length === 0) {
            throw new TypeError("pathfinder chunk lease owner must be a non-empty string");
        }
    }

    public async find(startValue: Point, endValue: Point, options: HierarchicalPathOptions = {}): Promise<HierarchicalPathResult> {
        const loadedByPath = new Map<string, WorldChunkLease>();
        try {
            return await this.findInternal(startValue, endValue, options, loadedByPath);
        } catch (reason) {
            for (const lease of loadedByPath.values()) lease.release();
            throw reason;
        }
    }

    private async findInternal(
        startValue: Point,
        endValue: Point,
        options: HierarchicalPathOptions,
        loadedByPath: Map<string, WorldChunkLease>
    ): Promise<HierarchicalPathResult> {
        throwIfAborted(options.signal);
        const start = normalizeMapCoordinates(this.source.map, startValue.x, startValue.y);
        const end = normalizeMapCoordinates(this.source.map, endValue.x, endValue.y);
        if (!start || !end) return this.emptyResult();
        const startChunk = this.resolveTileChunk(start);
        const endChunk = this.resolveTileChunk(end);
        if (!startChunk || !endChunk) return this.emptyResult();
        await this.ensureDetailedChunk(startChunk, loadedByPath, options.signal);
        const startTile = getMapTile(this.source.map, start.x, start.y);
        if (!startTile || !this.passable(startTile, start.x, start.y)) {
            return this.result([], [], 0, loadedByPath, options.releaseLoadedChunks);
        }
        if (startChunk.x === endChunk.x && startChunk.y === endChunk.y) {
            const local = this.findLocalPath(start, end, startChunk.x, startChunk.y);
            return this.result(local.path, [startChunk], 0, loadedByPath, options.releaseLoadedChunks);
        }
        await this.ensureDetailedChunk(endChunk, loadedByPath, options.signal);
        const endTile = getMapTile(this.source.map, end.x, end.y);
        if (!endTile || !this.passable(endTile, end.x, end.y)) {
            return this.result([], [], 0, loadedByPath, options.releaseLoadedChunks);
        }
        if (!this.movementCost && getMapNeighbors(this.source.map, start.x, start.y)
            .some(point => point.x === end.x && point.y === end.y)) {
            return this.result([start, end], [startChunk, endChunk], 0, loadedByPath, options.releaseLoadedChunks);
        }

        const maximum = options.maxVisitedPortals ?? 100_000;
        if (!Number.isInteger(maximum) || maximum <= 0) throw new RangeError("maxVisitedPortals must be a positive integer");
        const summaries = new Map<string, WorldNavigationChunkSummary>();
        const getSummary = async (point: Point) => {
            throwIfAborted(options.signal);
            const key = chunkKey(point.x, point.y);
            if (summaries.has(key)) return summaries.get(key);
            let summary = await this.index.getSummary(point.x, point.y);
            if (summary) {
                assertNavigationSummary(summary);
                if (summary.movementType !== this.movementType) {
                    throw new TypeError("navigation summary movementType does not match the pathfinder");
                }
                const expected = await this.expectedRevision?.(point.x, point.y);
                if (expected && !summaryRevisionMatches(summary, expected)) {
                    this.index.invalidateChunk?.(point.x, point.y);
                    summary = await this.index.getSummary(point.x, point.y);
                    if (!summary) throw new StaleWorldNavigationSummaryError(point.x, point.y);
                    assertNavigationSummary(summary);
                    if (summary.movementType !== this.movementType
                        || !summaryRevisionMatches(summary, expected)) {
                        throw new StaleWorldNavigationSummaryError(point.x, point.y);
                    }
                }
                summaries.set(key, summary);
            }
            return summary;
        };
        const startSummary = await getSummary(startChunk);
        const endSummary = await getSummary(endChunk);
        if (!startSummary || !endSummary) return this.result([], [], 0, loadedByPath, options.releaseLoadedChunks);

        const frontier = new MinQueue<PortalState>();
        const costs = new Map<string, number>();
        const parents = new Map<string, PortalTransition>();
        const stateKey = (state: PortalState) => `${state.chunkX},${state.chunkY}|${state.entryIndex}`;
        for (let exitIndex = 0; exitIndex < startSummary.portals.length; exitIndex += 1) {
            const exit = startSummary.portals[exitIndex];
            const local = this.findLocalPath(start, exit.inside, startChunk.x, startChunk.y);
            if (local.path.length === 0) continue;
            const targetSummary = await getSummary({ x: exit.targetChunkX, y: exit.targetChunkY });
            const entryIndex = targetSummary ? reversePortalIndex(targetSummary, exit) : -1;
            if (!targetSummary || entryIndex < 0) continue;
            const state = { chunkX: targetSummary.chunkX, chunkY: targetSummary.chunkY, entryIndex };
            const key = stateKey(state);
            const cost = local.cost + exit.crossingCost;
            if (cost >= (costs.get(key) ?? Infinity)) continue;
            costs.set(key, cost);
            frontier.push(state, cost);
            parents.set(key, {
                from: { chunkX: startChunk.x, chunkY: startChunk.y, entryIndex: -1 },
                to: state, exit, entry: targetSummary.portals[entryIndex]
            });
        }

        let goal: PortalState | undefined;
        let goalCost = Infinity;
        let visited = 0;
        while (frontier.size > 0 && visited < maximum) {
            throwIfAborted(options.signal);
            const queued = frontier.pop()!;
            const state = queued.value;
            const key = stateKey(state);
            const currentCost = costs.get(key);
            if (currentCost === undefined || queued.priority !== currentCost) continue;
            if (currentCost >= goalCost) break;
            visited += 1;
            const summary = await getSummary({ x: state.chunkX, y: state.chunkY });
            if (!summary) continue;
            if (state.chunkX === endChunk.x && state.chunkY === endChunk.y) {
                const local = this.findLocalPath(summary.portals[state.entryIndex].inside, end, state.chunkX, state.chunkY);
                const candidateCost = currentCost + local.cost;
                if (local.path.length > 0 && candidateCost < goalCost) {
                    goal = state;
                    goalCost = candidateCost;
                }
            }
            for (let exitIndex = 0; exitIndex < summary.portals.length; exitIndex += 1) {
                const within = summary.costs[state.entryIndex]?.[exitIndex];
                if (within === null || within === undefined) continue;
                const exit = summary.portals[exitIndex];
                const target = await getSummary({ x: exit.targetChunkX, y: exit.targetChunkY });
                const entryIndex = target ? reversePortalIndex(target, exit) : -1;
                if (!target || entryIndex < 0) continue;
                const next = { chunkX: target.chunkX, chunkY: target.chunkY, entryIndex };
                const nextKey = stateKey(next);
                const nextCost = currentCost + within + exit.crossingCost;
                if (nextCost >= (costs.get(nextKey) ?? Infinity)) continue;
                costs.set(nextKey, nextCost);
                frontier.push(next, nextCost);
                parents.set(nextKey, { from: state, to: next, exit, entry: target.portals[entryIndex] });
            }
        }
        if (!goal) return this.result([], [], visited, loadedByPath, options.releaseLoadedChunks);

        const transitions: PortalTransition[] = [];
        let cursor = goal;
        while (cursor.entryIndex >= 0) {
            const transition = parents.get(stateKey(cursor));
            if (!transition) return this.result([], [], visited, loadedByPath, options.releaseLoadedChunks);
            transitions.push(transition);
            cursor = transition.from;
        }
        transitions.reverse();
        const corridor: Point[] = [startChunk];
        for (const transition of transitions) corridor.push({ x: transition.to.chunkX, y: transition.to.chunkY });
        for (const chunk of corridor) await this.ensureDetailedChunk(chunk, loadedByPath, options.signal);

        const fullPath: Point[] = [];
        let current = start;
        for (let index = 0; index < corridor.length; index += 1) {
            const transition = transitions[index];
            const target = transition?.exit.inside ?? end;
            const local = this.findLocalPath(current, target, corridor[index].x, corridor[index].y);
            if (local.path.length === 0) return this.result([], corridor, visited, loadedByPath, options.releaseLoadedChunks);
            appendUnique(fullPath, local.path);
            if (transition) {
                appendUnique(fullPath, [transition.exit.outside]);
                current = transition.entry.inside;
            }
        }
        return this.result(fullPath, corridor, visited, loadedByPath, options.releaseLoadedChunks);
    }

    private resolveTileChunk(point: Point): Point | undefined {
        return this.source.resolveChunk(Math.floor(point.x / this.source.chunkSize), Math.floor(point.y / this.source.chunkSize));
    }

    private async ensureDetailedChunk(
        point: Point,
        loaded: Map<string, WorldChunkLease>,
        signal?: AbortSignal
    ): Promise<void> {
        throwIfAborted(signal);
        const key = chunkKey(point.x, point.y);
        if (loaded.has(key)) return;
        loaded.set(key, await this.residency.acquireChunk(point.x, point.y, {
            owner: this.owner,
            signal
        }));
    }

    private findLocalPath(start: Point, end: Point, chunkX: number, chunkY: number): LocalPath {
        if (start.x === end.x && start.y === end.y) return { path: [{ ...start }], cost: 0 };
        const frontier = new MinQueue<Point>();
        frontier.push(start, 0);
        const parents = new Map<string, Point>();
        const costs = new Map<string, number>([[pointKey(start), 0]]);
        while (frontier.size > 0) {
            const queued = frontier.pop()!;
            const current = queued.value;
            const currentCost = costs.get(pointKey(current));
            if (currentCost === undefined || currentCost !== queued.priority) continue;
            if (current.x === end.x && current.y === end.y) {
                return { path: reconstruct(start, end, parents), cost: currentCost };
            }
            for (const neighbor of getMapNeighbors(this.source.map, current.x, current.y)) {
                const owner = this.resolveTileChunk(neighbor);
                if (!owner || owner.x !== chunkX || owner.y !== chunkY) continue;
                const key = pointKey(neighbor);
                const tile = getMapTile(this.source.map, neighbor.x, neighbor.y);
                if (!tile || !this.passable(tile, neighbor.x, neighbor.y)) continue;
                const nextCost = currentCost + getMovementCost(tile, neighbor.x, neighbor.y, this.movementCost);
                if (nextCost >= (costs.get(key) ?? Infinity)) continue;
                costs.set(key, nextCost);
                parents.set(key, current);
                frontier.push(neighbor, nextCost);
            }
        }
        return { path: [], cost: Infinity };
    }

    private result(
        path: readonly Point[],
        chunks: readonly Point[],
        visitedPortals: number,
        loaded: Map<string, WorldChunkLease>,
        releaseNow = false
    ): HierarchicalPathResult {
        let released = false;
        const leases = [...loaded.values()];
        const loadedChunks = leases.map(lease => lease.chunk);
        const release = () => {
            if (released) return;
            released = true;
            for (const lease of leases) lease.release();
        };
        if (releaseNow) release();
        return { path, chunks, visitedPortals, loadedChunks, release };
    }

    private emptyResult(): HierarchicalPathResult {
        return { path: [], chunks: [], visitedPortals: 0, loadedChunks: [], release() {} };
    }
}

function reversePortalIndex(summary: WorldNavigationChunkSummary, portal: WorldNavigationPortal): number {
    return summary.portals.findIndex(candidate => candidate.inside.x === portal.outside.x
        && candidate.inside.y === portal.outside.y && candidate.outside.x === portal.inside.x
        && candidate.outside.y === portal.inside.y);
}

function summaryRevisionMatches(
    summary: WorldNavigationChunkSummary,
    expected: WorldNavigationRevision
): boolean {
    return summary.terrainRevision === expected.terrainRevision
        && summary.deltaRevision === expected.deltaRevision;
}

function reconstruct(start: Point, end: Point, parents: ReadonlyMap<string, Point>): Point[] {
    const path: Point[] = [{ ...end }];
    let current = end;
    while (current.x !== start.x || current.y !== start.y) {
        const parent = parents.get(pointKey(current));
        if (!parent) return [];
        path.push(parent);
        current = parent;
    }
    return path.reverse();
}

function appendUnique(target: Point[], points: readonly Point[]): void {
    for (const point of points) {
        const previous = target[target.length - 1];
        if (!previous || previous.x !== point.x || previous.y !== point.y) target.push({ ...point });
    }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
    if (!signal?.aborted) return;
    if (typeof DOMException !== "undefined") throw new DOMException("Hierarchical pathfinding was aborted", "AbortError");
    const error = new Error("Hierarchical pathfinding was aborted");
    error.name = "AbortError";
    throw error;
}
