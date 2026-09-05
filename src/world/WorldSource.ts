import { assertWrappableMap, getMapTile, positiveModulo } from "../helpers/topology";
import { MapInfo, Point, TileInfo } from "../interfaces";
import { assertToroidalWorldBounds } from "./WorldGenerationLimits";
import {
    DEFAULT_WORLD_GENERATION_CHUNK_SIZE,
    MAX_WORLD_GENERATION_CHUNK_SIZE,
    PackedWorldChunk,
    SparseWorldChunkStore,
    WorldTileOverride,
    WorldTileOverrideChange,
    assertPackedWorldChunk
} from "./generateWorldChunk";
import { ChunkRequestOptions, WorldGeneratorPool, WorldGeneratorPoolStats } from "./WorldGeneratorPool";
import {
    createWorldChunkCacheKey,
    WorldChunkCache,
    WorldChunkCacheStats
} from "./WorldChunkCacheContract";
import {
    normalizeWorldChunkDelta,
    WorldChunkDelta,
    WorldDeltaStore
} from "./WorldDeltaContract";
import {
    createWorldVegetationMapSnapshot,
    WorldVegetationGenerationOptions,
    WorldVegetationLayout
} from "./generateVegetation";
import {
    generateStaticWorldOverview,
    WorldOverviewPreparationOptions,
    WorldOverviewRaster
} from "./generateWorldOverview";
import { RuntimeWorkCoordinator } from "../runtime/RuntimeWorkCoordinator";
import {
    createWorldDescriptor,
    serializeWorldDescriptor,
    WorldDescriptor
} from "./WorldDescriptor";
import { WorldWaterGenerationStyle } from "./WorldStyleProfile";

export interface WorldBounds {
    width: number;
    height: number;
    wrapX: boolean;
    wrapY: boolean;
}

export interface WorldChunk {
    chunkX: number;
    chunkY: number;
    chunkSize: number;
    coreTiles: readonly Point[];
    payload?: unknown;
}

export interface WorldSourceStats {
    workers: number;
    configuredWorkers?: number;
    busyWorkers: number;
    queued: number;
    completed: number;
    queuedChunks?: number;
    queuedVegetation?: number;
    queuedOverviews?: number;
    busyChunkWorkers?: number;
    busyVegetationWorkers?: number;
    busyOverviewWorkers?: number;
    averageChunkMs?: number;
    averageVegetationMs?: number;
    averageOverviewMs?: number;
    queuedWeight?: number;
    oldestQueuedMs?: number;
    shedTasks?: number;
    starvationPromotions?: number;
    workerFailures?: number;
    clientFactoryFailures?: number;
    cacheHits?: number;
    cacheMisses?: number;
    cacheWrites?: number;
    cacheErrors?: number;
    cachedChunks?: number;
    cachedBytes?: number;
    trackedDeltaChunks?: number;
    pendingDeltaTiles?: number;
    restoringDeltaChunks?: number;
}

export interface WorldChunkRevision {
    terrainRevision: string | number;
    deltaRevision: number;
}

//A WorldSource owns the materialized MapInfo view used by renderers. Loading a
//chunk must make all of its core tiles (and any required neighbor halo) visible
//through `map` before the promise resolves; releaseChunk reverses that work.
//One source instance belongs to one HexMap load session and is disposed when
//that session is replaced.
export interface WorldSource {
    readonly map: MapInfo;
    readonly chunkSize: number;
    readonly descriptor?: WorldDescriptor;
    readonly bounds?: WorldBounds;
    readonly stats?: Readonly<WorldSourceStats>;
    resolveChunk(chunkX: number, chunkY: number): Point | undefined;
    chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number;
    loadChunk(chunkX: number, chunkY: number, request?: ChunkRequestOptions): Promise<WorldChunk>;
    releaseChunk(chunk: WorldChunk): void;
    hasChunk(chunkX: number, chunkY: number): boolean;
    hasTile(x: number, y: number): boolean;
    getChunkRevision?(chunkX: number, chunkY: number): WorldChunkRevision | undefined;
    clearCache?(): Promise<boolean>;
    flushCache?(): Promise<void>;
    prepareVegetation?(
        options: WorldVegetationPreparationOptions,
        request?: ChunkRequestOptions
    ): Promise<WorldVegetationLayout>;
    prepareOverview?(
        options: WorldOverviewPreparationOptions,
        request?: ChunkRequestOptions
    ): Promise<WorldOverviewRaster>;
    configureWorkerCount?(count: number): number;
    dispose(): void;
}

export type WorldVegetationPreparationOptions = Omit<WorldVegetationGenerationOptions, "map">;

export interface WorldVegetationSource extends WorldSource {
    prepareVegetation(
        options: WorldVegetationPreparationOptions,
        request?: ChunkRequestOptions
    ): Promise<WorldVegetationLayout>;
}

export function isWorldVegetationSource(source: WorldSource): source is WorldVegetationSource {
    return typeof source.prepareVegetation === "function";
}

export interface WorldOverviewSource extends WorldSource {
    prepareOverview(
        options: WorldOverviewPreparationOptions,
        request?: ChunkRequestOptions
    ): Promise<WorldOverviewRaster>;
}

export function isWorldOverviewSource(source: WorldSource): source is WorldOverviewSource {
    return typeof source.prepareOverview === "function";
}

export interface MutableWorldSource extends WorldSource {
    setTileOverride(x: number, y: number, changes: WorldTileOverride): void;
    setTileOverrides?(changes: readonly WorldTileOverrideChange[]): void;
    clearTileOverride(x: number, y: number): boolean;
    flushDeltas?(): Promise<void>;
    clearDeltas?(): Promise<void>;
    createDeltaCheckpointSnapshot?(): Promise<WorldDeltaCheckpoint>;
    restoreDeltaCheckpointSnapshot?(snapshot: WorldDeltaCheckpoint): Promise<void>;
}

export function isMutableWorldSource(source: WorldSource): source is MutableWorldSource {
    const candidate = source as Partial<MutableWorldSource>;
    return typeof candidate.setTileOverride === "function"
        && typeof candidate.clearTileOverride === "function";
}

export interface StaticWorldSourceOptions {
    chunkSize?: number;
}

export interface ProceduralWorldSourceOptions {
    seed: string | number;
    workerUrl: string | URL;
    workerCount?: number;
    reservedChunkWorkers?: number;
    chunkSize?: number;
    // Options-level persistence resources are owned and disposed by the source.
    cache?: WorldChunkCache;
    generatorVersion?: number;
    deltaStore?: WorldDeltaStore;
    worldId?: string;
    workCoordinator?: RuntimeWorkCoordinator;
    waterStyle?: Readonly<WorldWaterGenerationStyle>;
}

export interface ToroidalWorldSourceOptions extends ProceduralWorldSourceOptions {
    width: number;
    height: number;
}

export interface ProceduralWorldSourceDependencies {
    pool?: WorldGeneratorPool;
    store?: SparseWorldChunkStore;
    cache?: WorldChunkCache;
    deltaStore?: WorldDeltaStore;
}

export const WORLD_DELTA_CHECKPOINT_FORMAT_VERSION = 1;

export interface WorldDeltaCheckpoint {
    version: typeof WORLD_DELTA_CHECKPOINT_FORMAT_VERSION;
    worldId: string;
    chunkSize: number;
    deltas: readonly WorldChunkDelta[];
}

export type ToroidalWorldSourceDependencies = ProceduralWorldSourceDependencies;

export function assertWorldSource(source: WorldSource): void {
    if (!source || typeof source !== "object") throw new TypeError("world source must be an object");
    if (!source.map || typeof source.map !== "object") throw new TypeError("world source must expose a MapInfo view");
    assertWrappableMap(source.map);
    validateChunkSize(source.chunkSize);
    for (const method of ["resolveChunk", "chunkDistance", "loadChunk", "releaseChunk", "hasChunk", "hasTile", "dispose"] as const) {
        if (typeof source[method] !== "function") throw new TypeError(`world source must implement ${method}()`);
    }
    if (source.bounds) {
        const { width, height, wrapX, wrapY } = source.bounds;
        if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
            throw new RangeError("world source bounds must use positive integer dimensions");
        }
        if (typeof wrapX !== "boolean" || typeof wrapY !== "boolean") {
            throw new TypeError("world source bounds wrap flags must be boolean");
        }
        if (source.map.infinite || source.map.w !== width || source.map.h !== height
            || Boolean(source.map.wrapX) !== wrapX || Boolean(source.map.wrapY) !== wrapY) {
            throw new TypeError("world source bounds must match its MapInfo topology");
        }
    } else if (!source.map.infinite) {
        throw new TypeError("an unbounded world source must expose an infinite MapInfo view");
    }
}

export function assertWorldChunk(source: WorldSource, chunk: WorldChunk, expectedX: number, expectedY: number): void {
    if (!chunk || typeof chunk !== "object"
        || chunk.chunkX !== expectedX || chunk.chunkY !== expectedY
        || chunk.chunkSize !== source.chunkSize
        || !Array.isArray(chunk.coreTiles)) {
        throw new TypeError("world source returned an invalid chunk");
    }
    const seen = new Set<string>();
    for (const point of chunk.coreTiles) {
        const key = point ? `${point.x},${point.y}` : "";
        if (!point || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)
            || Math.floor(point.x / source.chunkSize) !== expectedX
            || Math.floor(point.y / source.chunkSize) !== expectedY
            || !source.hasTile(point.x, point.y) || seen.has(key)) {
            throw new TypeError("world source returned an invalid core tile");
        }
        seen.add(key);
    }
}

function validateChunkSize(value: number): void {
    if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
        throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
    }
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") return new DOMException("World chunk request was aborted", "AbortError");
    const error = new Error("World chunk request was aborted");
    error.name = "AbortError";
    return error;
}

function assertChunkRequestActive(disposed: boolean, request: ChunkRequestOptions): void {
    if (request.signal?.aborted) throw abortError();
    if (disposed) throw new Error("WorldSource has been disposed");
}

export class StaticWorldSource implements WorldSource {
    public readonly map: MapInfo;
    public readonly chunkSize: number;
    public readonly bounds: WorldBounds;
    private readonly chunkCountX: number;
    private readonly chunkCountY: number;
    private disposed = false;

    constructor(map: MapInfo, options: StaticWorldSourceOptions = {}) {
        assertWrappableMap(map);
        if (map.infinite) throw new TypeError("StaticWorldSource requires a finite MapInfo");
        this.map = map;
        this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
        validateChunkSize(this.chunkSize);
        this.bounds = {
            width: map.w,
            height: map.h,
            wrapX: map.wrapX ?? false,
            wrapY: map.wrapY ?? false
        };
        this.chunkCountX = Math.ceil(map.w / this.chunkSize);
        this.chunkCountY = Math.ceil(map.h / this.chunkSize);
    }

    public resolveChunk(chunkX: number, chunkY: number): Point | undefined {
        if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) return undefined;
        const x = this.bounds.wrapX ? positiveModulo(chunkX, this.chunkCountX) : chunkX;
        const y = this.bounds.wrapY ? positiveModulo(chunkY, this.chunkCountY) : chunkY;
        if (x < 0 || x >= this.chunkCountX || y < 0 || y >= this.chunkCountY) return undefined;
        return { x, y };
    }

    public chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number {
        let dx = Math.abs(chunkX - centerChunkX);
        let dy = Math.abs(chunkY - centerChunkY);
        if (this.bounds.wrapX) dx = Math.min(dx, this.chunkCountX - dx);
        if (this.bounds.wrapY) dy = Math.min(dy, this.chunkCountY - dy);
        return Math.hypot(dx, dy);
    }

    public loadChunk(chunkX: number, chunkY: number, request: ChunkRequestOptions = {}): Promise<WorldChunk> {
        if (this.disposed) return Promise.reject(new Error("StaticWorldSource has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        const resolved = this.resolveChunk(chunkX, chunkY);
        if (!resolved || resolved.x !== chunkX || resolved.y !== chunkY) {
            return Promise.reject(new RangeError("static world chunk coordinates are outside the canonical bounds"));
        }
        const startX = chunkX * this.chunkSize;
        const startY = chunkY * this.chunkSize;
        const endX = Math.min(this.map.w, startX + this.chunkSize);
        const endY = Math.min(this.map.h, startY + this.chunkSize);
        const coreTiles: Point[] = [];
        for (let x = startX; x < endX; x += 1) {
            for (let y = startY; y < endY; y += 1) {
                if (this.map.data[x]?.[y]) coreTiles.push({ x, y });
            }
        }
        return Promise.resolve({ chunkX, chunkY, chunkSize: this.chunkSize, coreTiles });
    }

    public prepareOverview(
        options: WorldOverviewPreparationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldOverviewRaster> {
        if (this.disposed) return Promise.reject(new Error("StaticWorldSource has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        return Promise.resolve().then(() => generateStaticWorldOverview(this.map, options));
    }

    public releaseChunk(_chunk: WorldChunk): void {
        //The caller owns MapInfo, so render residency never mutates its data.
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        const resolved = this.resolveChunk(chunkX, chunkY);
        return resolved?.x === chunkX && resolved.y === chunkY;
    }

    public hasTile(x: number, y: number): boolean {
        return getMapTile(this.map, x, y) !== undefined;
    }

    public dispose(): void {
        this.disposed = true;
    }

}

function resolveCache(
    options: ProceduralWorldSourceOptions,
    dependencies: ProceduralWorldSourceDependencies
): { cache: WorldChunkCache | undefined; owned: boolean } {
    if (dependencies.cache !== undefined && options.cache !== undefined) {
        throw new TypeError("world chunk cache must be provided through options or dependencies, not both");
    }
    const cache = dependencies.cache ?? options.cache;
    if (cache !== undefined) assertWorldChunkCache(cache);
    if (dependencies.cache !== undefined) return { cache, owned: false };
    if (cache !== undefined) return { cache, owned: true };
    return { cache: undefined, owned: false };
}

function resolveDeltaStore(
    options: ProceduralWorldSourceOptions,
    dependencies: ProceduralWorldSourceDependencies
): { store: WorldDeltaStore | undefined; owned: boolean } {
    if (dependencies.deltaStore !== undefined && options.deltaStore !== undefined) {
        throw new TypeError("world delta store must be provided through options or dependencies, not both");
    }
    const store = dependencies.deltaStore ?? options.deltaStore;
    if (store !== undefined) assertWorldDeltaStore(store);
    if (dependencies.deltaStore !== undefined) return { store, owned: false };
    if (store !== undefined) return { store, owned: true };
    return { store: undefined, owned: false };
}

function assertWorldChunkCache(cache: WorldChunkCache): void {
    if (!cache || typeof cache !== "object") throw new TypeError("world chunk cache must be an object");
    for (const method of ["get", "put", "clear", "dispose"] as const) {
        if (typeof cache[method] !== "function") throw new TypeError(`world chunk cache must implement ${method}()`);
    }
}

function assertWorldDeltaStore(store: WorldDeltaStore): void {
    if (!store || typeof store !== "object") throw new TypeError("world delta store must be an object");
    for (const method of ["loadChunk", "putTile", "deleteTile", "flush", "clear", "dispose"] as const) {
        if (typeof store[method] !== "function") throw new TypeError(`world delta store must implement ${method}()`);
    }
}

function resolveWorldId(value: string | undefined, fallback: string): string {
    const worldId = value ?? fallback;
    if (typeof worldId !== "string" || worldId.trim().length === 0) {
        throw new TypeError("worldId must be a non-empty string");
    }
    return worldId;
}

interface WorldDeltaSessionStats {
    trackedChunks: number;
    pendingTiles: number;
    restoringChunks: number;
}

interface WorldDeltaChunkState {
    chunkX: number;
    chunkY: number;
    revision: number;
    mutationEpoch: number;
    activeTiles: Set<string>;
    pendingTiles: Map<string, Point & { epoch: number }>;
    modifiedDuringRestore: Map<string, number>;
    restored: boolean;
    restore?: Promise<void>;
    write?: Promise<void>;
}

const MAX_DELTA_REVISION_TOMBSTONES = 4096;

class WorldDeltaSession {
    private readonly chunks = new Map<string, WorldDeltaChunkState>();
    //Recently emptied chunks retain a bounded revision tombstone so navigation
    //summaries can be invalidated precisely without keeping every historical
    //edit forever. Overflow promotes one global baseline and drops the set.
    private readonly revisionTombstones = new Map<string, number>();
    private baselineRevision = 0;
    private generation = 0;
    private clearing = false;
    private restoring = false;
    private disposed = false;

    constructor(
        private readonly deltaStore: WorldDeltaStore | undefined,
        private readonly worldId: string,
        private readonly chunkSize: number,
        private readonly tileStore: SparseWorldChunkStore
    ) {}

    public get stats(): WorldDeltaSessionStats {
        let pendingTiles = 0;
        let restoringChunks = 0;
        for (const state of this.chunks.values()) {
            pendingTiles += new Set([
                ...state.pendingTiles.keys(),
                ...state.modifiedDuringRestore.keys()
            ]).size;
            if (state.restore) restoringChunks += 1;
        }
        return {
            trackedChunks: this.chunks.size + this.revisionTombstones.size,
            pendingTiles,
            restoringChunks
        };
    }

    public getRevision(chunkX: number, chunkY: number): number {
        const key = `${chunkX},${chunkY}`;
        return this.chunks.get(key)?.revision
            ?? this.revisionTombstones.get(key)
            ?? this.baselineRevision;
    }

    public assertEditable(): void {
        if (this.disposed) throw new Error("world delta session has been disposed");
        if (this.clearing) throw new Error("world deltas are being cleared; await clearDeltas() before editing");
        if (this.restoring) throw new Error("world deltas are being restored; await checkpoint recovery before editing");
    }

    public persist(points: readonly Point[]): void {
        if (points.length === 0) return;
        this.assertEditable();

        const unique = new Map<string, Point>();
        for (const point of points) unique.set(`${point.x},${point.y}`, point);
        const groups = new Map<string, { chunkX: number; chunkY: number; points: Point[] }>();
        for (const point of unique.values()) {
            const chunkX = Math.floor(point.x / this.chunkSize);
            const chunkY = Math.floor(point.y / this.chunkSize);
            const key = `${chunkX},${chunkY}`;
            const group = groups.get(key) ?? { chunkX, chunkY, points: [] };
            group.points.push(point);
            groups.set(key, group);
        }

        for (const [key, group] of groups) {
            const state = this.state(key, group.chunkX, group.chunkY);
            state.mutationEpoch += 1;
            state.revision = this.incrementRevision(Math.max(state.revision, this.baselineRevision));
            for (const point of group.points) {
                const tileKey = `${point.x},${point.y}`;
                if (this.tileStore.getTileOverride(point.x, point.y)) state.activeTiles.add(tileKey);
                else state.activeTiles.delete(tileKey);
                if (this.deltaStore) {
                    state.pendingTiles.set(tileKey, { ...point, epoch: state.mutationEpoch });
                    if (state.restore) state.modifiedDuringRestore.set(tileKey, state.mutationEpoch);
                }
            }
            this.persistGroup(key, state);
        }
    }

    public restore(chunkX: number, chunkY: number): Promise<void> {
        if (!this.deltaStore || this.disposed || this.clearing || this.restoring) return Promise.resolve();
        const key = `${chunkX},${chunkY}`;
        const state = this.state(key, chunkX, chunkY);
        if (state.restored) return Promise.resolve();
        if (state.restore) return state.restore;
        const generation = this.generation;
        const mutationEpoch = state.mutationEpoch;
        const revisionBeforeRestore = state.revision;
        const restore = (async () => {
            const loaded = await this.deltaStore!.loadChunk(this.worldId, chunkX, chunkY, {
                chunkSize: this.chunkSize
            });
            if (this.disposed || generation !== this.generation) return;
            const delta = loaded
                ? normalizeWorldChunkDelta(loaded, this.worldId, chunkX, chunkY, { chunkSize: this.chunkSize })
                : undefined;
            state.restored = true;
            if (!delta) return;
            const locallyMutated = state.mutationEpoch !== mutationEpoch;
            state.revision = locallyMutated
                ? Math.max(state.revision, delta.revision + 1)
                : delta.entries.length > 0 && delta.revision <= revisionBeforeRestore
                    ? this.incrementRevision(revisionBeforeRestore)
                    : Math.max(state.revision, delta.revision);
            const protectedTiles = new Set([
                ...state.pendingTiles.keys(),
                ...state.modifiedDuringRestore.keys()
            ]);
            const restored = delta.entries.filter(entry => !protectedTiles.has(`${entry.x},${entry.y}`));
            this.tileStore.setTileOverrides(restored.map(entry => ({
                x: entry.x,
                y: entry.y,
                changes: entry.override
            })));
            for (const entry of restored) state.activeTiles.add(`${entry.x},${entry.y}`);
        })();
        state.restore = restore;
        void restore.finally(() => {
            if (state.restore !== restore) return;
            state.restore = undefined;
            state.modifiedDuringRestore.clear();
            this.pruneState(key, state);
        }).catch(() => undefined);
        return restore;
    }

    public async flush(): Promise<void> {
        if (this.disposed) throw new Error("world delta session has been disposed");
        if (this.clearing) throw new Error("world deltas are being cleared");
        if (!this.deltaStore) return;

        while (true) {
            for (const [key, state] of this.chunks) {
                if (state.pendingTiles.size > 0 && !state.write) this.startWrite(key, state);
            }
            const writes = [...this.chunks.values()].flatMap(state => state.write ? [state.write] : []);
            if (writes.length === 0) {
                await this.deltaStore.flush();
                //A caller may have edited while the Store barrier was pending.
                if ([...this.chunks.values()].some(state => state.write || state.pendingTiles.size > 0)) continue;
                return;
            }
            const results = await Promise.allSettled(writes);
            const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
            if (failure) {
                //Drain/consume Store-owned error state as well. The Session's
                //pending tile epochs remain intact and the next flush retries.
                await this.deltaStore.flush().catch(() => undefined);
                throw this.persistenceError(failure.reason);
            }
        }
    }

    public async createCheckpointSnapshot(): Promise<WorldDeltaCheckpoint> {
        if (this.restoring) throw new Error("world deltas are being restored");
        await this.flush();
        if (!this.deltaStore?.listWorld) {
            throw new Error("WorldDeltaStore does not support checkpoint enumeration");
        }
        const deltas = await this.deltaStore.listWorld(this.worldId);
        return {
            version: WORLD_DELTA_CHECKPOINT_FORMAT_VERSION,
            worldId: this.worldId,
            chunkSize: this.chunkSize,
            deltas: deltas.map(delta => normalizeWorldChunkDelta(
                delta,
                this.worldId,
                delta.chunkX,
                delta.chunkY,
                { chunkSize: this.chunkSize }
            ))
        };
    }

    public async restoreCheckpointSnapshot(snapshot: WorldDeltaCheckpoint): Promise<void> {
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
            || snapshot.version !== WORLD_DELTA_CHECKPOINT_FORMAT_VERSION
            || snapshot.worldId !== this.worldId || snapshot.chunkSize !== this.chunkSize
            || !Array.isArray(snapshot.deltas)) {
            throw new TypeError("world delta checkpoint is invalid or incompatible");
        }
        if (!this.deltaStore?.replaceWorld) {
            throw new Error("WorldDeltaStore does not support atomic checkpoint replacement");
        }
        const deltas = snapshot.deltas.map(delta => normalizeWorldChunkDelta(
            delta,
            this.worldId,
            delta.chunkX,
            delta.chunkY,
            { chunkSize: this.chunkSize }
        ));
        const keys = new Set<string>();
        for (const delta of deltas) {
            const key = `${delta.chunkX},${delta.chunkY}`;
            if (keys.has(key)) throw new TypeError("world delta checkpoint contains duplicate chunks");
            keys.add(key);
        }
        if (this.disposed) throw new Error("world delta session has been disposed");
        if (this.clearing) throw new Error("world deltas are being cleared");
        if (this.restoring) throw new Error("world deltas are already being restored");
        this.restoring = true;
        try {
            await this.flush();
            await this.deltaStore.replaceWorld(this.worldId, deltas);
            await this.deltaStore.flush();
            if (this.disposed) throw new Error("world delta session has been disposed");
            this.generation += 1;
            this.chunks.clear();
            this.revisionTombstones.clear();
            this.baselineRevision = 0;
            this.tileStore.clearTileOverrides();
            for (const delta of deltas) {
                const key = `${delta.chunkX},${delta.chunkY}`;
                const state = this.state(key, delta.chunkX, delta.chunkY);
                state.revision = delta.revision;
                state.restored = true;
                for (const entry of delta.entries) state.activeTiles.add(`${entry.x},${entry.y}`);
                this.tileStore.setTileOverrides(delta.entries.map(entry => ({
                    x: entry.x,
                    y: entry.y,
                    changes: entry.override
                })));
            }
        } finally {
            this.restoring = false;
        }
    }

    public async clear(): Promise<void> {
        if (this.disposed) throw new Error("world delta session has been disposed");
        if (this.clearing) throw new Error("world deltas are already being cleared");
        if (this.restoring) throw new Error("world deltas are being restored");
        this.clearing = true;
        this.generation += 1;
        try {
            await Promise.allSettled(
                [...this.chunks.values()].flatMap(state => state.write ? [state.write] : [])
            );
            await this.deltaStore?.clear(this.worldId);
            this.tileStore.clearTileOverrides();
            let highestRevision = this.baselineRevision;
            for (const revision of this.revisionTombstones.values()) {
                highestRevision = Math.max(highestRevision, revision);
            }
            for (const state of this.chunks.values()) {
                highestRevision = Math.max(highestRevision, state.revision);
                state.restore = undefined;
            }
            this.baselineRevision = this.incrementRevision(highestRevision);
            this.chunks.clear();
            this.revisionTombstones.clear();
        } finally {
            this.clearing = false;
        }
    }

    public dispose(): void {
        this.disposed = true;
        this.generation += 1;
        for (const state of this.chunks.values()) state.restore = undefined;
        this.chunks.clear();
        this.revisionTombstones.clear();
    }

    private state(key: string, chunkX: number, chunkY: number): WorldDeltaChunkState {
        let state = this.chunks.get(key);
        if (!state) {
            const revision = this.revisionTombstones.get(key) ?? this.baselineRevision;
            this.revisionTombstones.delete(key);
            state = {
                chunkX,
                chunkY,
                revision,
                mutationEpoch: 0,
                activeTiles: new Set(),
                pendingTiles: new Map(),
                modifiedDuringRestore: new Map(),
                restored: false
            };
            this.chunks.set(key, state);
        } else if (state.chunkX !== chunkX || state.chunkY !== chunkY) {
            throw new Error("world delta chunk state identity is inconsistent");
        }
        return state;
    }

    private persistGroup(key: string, state: WorldDeltaChunkState): void {
        if (!this.deltaStore) {
            this.pruneState(key, state);
            return;
        }
        this.startWrite(key, state);
    }

    private startWrite(key: string, state: WorldDeltaChunkState): void {
        if (!this.deltaStore || state.write || state.pendingTiles.size === 0
            || this.disposed || this.clearing) return;
        const pending = new Map(state.pendingTiles);
        const generation = this.generation;
        const write = this.writePendingTiles(state, pending).then(revision => {
            if (this.disposed || generation !== this.generation) return;
            if (revision !== undefined) state.revision = Math.max(state.revision, revision);
            for (const [tileKey, point] of pending) {
                if (state.pendingTiles.get(tileKey)?.epoch === point.epoch) state.pendingTiles.delete(tileKey);
            }
        });
        state.write = write;
        void write.then(() => {
            if (state.write !== write) return;
            state.write = undefined;
            if (!this.disposed && generation === this.generation && state.pendingTiles.size > 0) {
                this.startWrite(key, state);
            }
            this.pruneState(key, state);
        }, () => {
            if (state.write === write) state.write = undefined;
        });
        //The write remains observable through state.write/flush(); suppress an
        //unhandled-rejection report while application code has not flushed yet.
        void write.catch(() => undefined);
    }

    private async writePendingTiles(
        state: WorldDeltaChunkState,
        pending: ReadonlyMap<string, Point & { epoch: number }>
    ): Promise<number | undefined> {
        const store = this.deltaStore;
        if (!store) throw new Error("world delta store is unavailable");
        const changes = [...pending.values()].map(point => ({
            x: point.x,
            y: point.y,
            override: this.tileStore.getTileOverride(point.x, point.y) ?? null
        }));
        if (store.putChunkDelta) {
            const delta = await store.putChunkDelta(
                this.worldId,
                state.chunkX,
                state.chunkY,
                changes,
                { chunkSize: this.chunkSize }
            );
            return delta?.revision;
        }
        for (const change of changes) {
            if (change.override) {
                store.putTile(this.worldId, state.chunkX, state.chunkY, {
                    x: change.x,
                    y: change.y,
                    override: change.override
                }, { chunkSize: this.chunkSize });
            } else {
                store.deleteTile(
                    this.worldId,
                    state.chunkX,
                    state.chunkY,
                    change.x,
                    change.y,
                    { chunkSize: this.chunkSize }
                );
            }
        }
        await store.flush();
        return undefined;
    }

    private pruneState(key: string, state: WorldDeltaChunkState): void {
        if (this.disposed || state.activeTiles.size > 0 || state.restore || state.write
            || state.pendingTiles.size > 0 || state.modifiedDuringRestore.size > 0) return;
        if (this.chunks.get(key) === state) this.chunks.delete(key);
        if (state.revision <= this.baselineRevision) return;
        this.revisionTombstones.delete(key);
        this.revisionTombstones.set(key, state.revision);
        if (this.revisionTombstones.size <= MAX_DELTA_REVISION_TOMBSTONES) return;
        let highestRevision = this.baselineRevision;
        for (const revision of this.revisionTombstones.values()) {
            highestRevision = Math.max(highestRevision, revision);
        }
        this.baselineRevision = this.incrementRevision(highestRevision);
        this.revisionTombstones.clear();
    }

    private incrementRevision(revision: number): number {
        if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER) {
            throw new RangeError("world delta revision space is exhausted");
        }
        return revision + 1;
    }

    private persistenceError(reason: unknown): Error {
        return reason instanceof Error ? reason : new Error(`world delta persistence failed: ${String(reason)}`);
    }
}

function cacheStats(
    pool: WorldGeneratorPoolStats,
    cache: WorldChunkCache | undefined,
    cachedLoads: number,
    deltas: WorldDeltaSessionStats
): WorldSourceStats {
    const stored: Readonly<WorldChunkCacheStats> | undefined = cache?.stats;
    return {
        ...pool,
        completed: pool.completed + cachedLoads,
        cacheHits: cachedLoads,
        cacheMisses: stored?.misses ?? 0,
        cacheWrites: stored?.writes ?? 0,
        cacheErrors: stored?.errors ?? 0,
        cachedChunks: stored?.entries ?? 0,
        cachedBytes: stored?.bytes ?? 0,
        trackedDeltaChunks: deltas.trackedChunks,
        pendingDeltaTiles: deltas.pendingTiles,
        restoringDeltaChunks: deltas.restoringChunks
    };
}

// Finite toroidal counterpart to ProceduralWorldSource. The authoritative
// world is seed+dimensions; only camera-near packed chunks are materialized.
export class ToroidalWorldSource implements MutableWorldSource {
    public readonly chunkSize: number;
    public readonly bounds: WorldBounds;
    public readonly store: SparseWorldChunkStore;
    public readonly descriptor: WorldDescriptor;
    public readonly worldId: string;
    private readonly seed: string | number;
    private readonly pool: WorldGeneratorPool;
    private readonly chunkCountX: number;
    private readonly chunkCountY: number;
    private readonly cache: WorldChunkCache | undefined;
    private readonly ownsCache: boolean;
    private readonly worldFingerprint: string;
    private readonly deltaStore: WorldDeltaStore | undefined;
    private readonly ownsDeltaStore: boolean;
    private readonly deltaSession: WorldDeltaSession;
    private cachedLoads = 0;
    private cacheEpoch = 0;
    private disposed = false;

    constructor(options: ToroidalWorldSourceOptions, dependencies: ToroidalWorldSourceDependencies = {}) {
        if (!options || typeof options !== "object") throw new TypeError("toroidal world options are required");
        assertToroidalWorldBounds({ topology: "toroidal", width: options.width, height: options.height });
        if (options.workerCount !== undefined
            && (!Number.isInteger(options.workerCount) || options.workerCount <= 0 || options.workerCount > 8)) {
            throw new RangeError("workerCount must be an integer between 1 and 8");
        }
        this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
        validateChunkSize(this.chunkSize);
        this.seed = options.seed;
        this.descriptor = createWorldDescriptor({
            seed: options.seed,
            chunkSize: this.chunkSize,
            generatorVersion: options.generatorVersion,
            waterStyle: options.waterStyle,
            world: { width: options.width, height: options.height, topology: "toroidal" }
        });
        this.worldFingerprint = serializeWorldDescriptor(this.descriptor);
        this.bounds = { width: options.width, height: options.height, wrapX: true, wrapY: true };
        this.worldId = resolveWorldId(options.worldId, this.worldFingerprint);
        this.chunkCountX = Math.ceil(options.width / this.chunkSize);
        this.chunkCountY = Math.ceil(options.height / this.chunkSize);
        this.store = dependencies.store ?? new SparseWorldChunkStore(this.bounds);
        if (this.store.map.infinite || this.store.map.w !== options.width || this.store.map.h !== options.height
            || !this.store.map.wrapX || !this.store.map.wrapY) {
            throw new TypeError("toroidal world store bounds do not match source dimensions");
        }
        const resolvedDeltas = resolveDeltaStore(options, dependencies);
        const resolvedCache = resolveCache(options, dependencies);
        this.deltaStore = resolvedDeltas.store;
        this.ownsDeltaStore = resolvedDeltas.owned;
        this.cache = resolvedCache.cache;
        this.ownsCache = resolvedCache.owned;
        this.deltaSession = new WorldDeltaSession(this.deltaStore, this.worldId, this.chunkSize, this.store);
        try {
            this.pool = dependencies.pool ?? new WorldGeneratorPool(options.workerUrl, {
                size: options.workerCount,
                reservedChunkWorkers: options.reservedChunkWorkers,
                coordinator: options.workCoordinator,
                domain: "worker"
            });
        } catch (error) {
            if (this.ownsCache) this.cache?.dispose();
            if (this.ownsDeltaStore) this.deltaStore?.dispose();
            throw error;
        }
    }

    public get map(): MapInfo {
        return this.store.map;
    }

    public get stats(): Readonly<WorldSourceStats> {
        return cacheStats(this.pool.stats, this.cache, this.cachedLoads, this.deltaSession.stats);
    }

    public resolveChunk(chunkX: number, chunkY: number): Point | undefined {
        if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) return undefined;
        return {
            x: positiveModulo(chunkX, this.chunkCountX),
            y: positiveModulo(chunkY, this.chunkCountY)
        };
    }

    public chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number {
        const dx = Math.min(Math.abs(chunkX - centerChunkX), this.chunkCountX - Math.abs(chunkX - centerChunkX));
        const dy = Math.min(Math.abs(chunkY - centerChunkY), this.chunkCountY - Math.abs(chunkY - centerChunkY));
        return Math.hypot(dx, dy);
    }

    public async loadChunk(
        chunkX: number,
        chunkY: number,
        request: ChunkRequestOptions = {}
    ): Promise<WorldChunk> {
        assertChunkRequestActive(this.disposed, request);
        const resolved = this.resolveChunk(chunkX, chunkY);
        if (!resolved || resolved.x !== chunkX || resolved.y !== chunkY) {
            throw new RangeError("toroidal chunk coordinates must use canonical bounds");
        }
        const generation = {
            seed: this.seed,
            chunkX,
            chunkY,
            chunkSize: this.chunkSize,
            waterStyle: this.descriptor.waterStyle,
            world: { width: this.bounds.width, height: this.bounds.height, topology: "toroidal" }
        } as const;
        const cacheKey = createWorldChunkCacheKey({ descriptor: this.descriptor, chunkX, chunkY });
        const cacheEpoch = this.cacheEpoch;
        let packed = this.cache ? await this.readCachedChunk(cacheKey, chunkX, chunkY) : undefined;
        assertChunkRequestActive(this.disposed, request);
        if (!packed) {
            packed = await this.pool.generateChunk(generation, request);
            assertChunkRequestActive(this.disposed, request);
            if (cacheEpoch === this.cacheEpoch) void this.cache?.put(cacheKey, packed).catch(() => false);
        }
        await this.restoreChunkDelta(chunkX, chunkY);
        assertChunkRequestActive(this.disposed, request);
        const coreTiles = this.store.add(packed);
        return { chunkX, chunkY, chunkSize: this.chunkSize, coreTiles, payload: packed };
    }

    public releaseChunk(chunk: WorldChunk): void {
        this.store.remove(chunk.chunkX, chunk.chunkY);
    }

    public prepareVegetation(
        options: WorldVegetationPreparationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldVegetationLayout> {
        if (this.disposed) return Promise.reject(new Error("ToroidalWorldSource has been disposed"));
        return this.pool.generateVegetation({
            ...options,
            map: createWorldVegetationMapSnapshot(this.map, options.points)
        }, request);
    }

    public prepareOverview(
        options: WorldOverviewPreparationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldOverviewRaster> {
        if (this.disposed) return Promise.reject(new Error("ToroidalWorldSource has been disposed"));
        return this.pool.generateOverview({ ...options, descriptor: this.descriptor }, request);
    }

    public configureWorkerCount(count: number): number {
        return this.pool.configureSize(count);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.store.hasChunk(chunkX, chunkY);
    }

    public hasTile(x: number, y: number): boolean {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)
            || x < 0 || x >= this.bounds.width || y < 0 || y >= this.bounds.height) return false;
        return this.store.hasCoreTile(x, y);
    }

    public getChunkRevision(chunkX: number, chunkY: number): WorldChunkRevision | undefined {
        const resolved = this.resolveChunk(chunkX, chunkY);
        if (!resolved) return undefined;
        return {
            terrainRevision: this.worldFingerprint,
            deltaRevision: this.deltaSession.getRevision(resolved.x, resolved.y)
        };
    }

    public setTileOverride(x: number, y: number, changes: WorldTileOverride): void {
        if (this.disposed) throw new Error("ToroidalWorldSource has been disposed");
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
            throw new RangeError("tile override coordinates must be safe integers");
        }
        const canonicalX = positiveModulo(x, this.bounds.width);
        const canonicalY = positiveModulo(y, this.bounds.height);
        this.deltaSession.assertEditable();
        if (this.store.setTileOverride(canonicalX, canonicalY, changes)) {
            this.persistOverrides([{ x: canonicalX, y: canonicalY }]);
        }
    }

    public setTileOverrides(changes: readonly WorldTileOverrideChange[]): void {
        if (this.disposed) throw new Error("ToroidalWorldSource has been disposed");
        const normalized = changes.map(change => {
            if (!Number.isSafeInteger(change.x) || !Number.isSafeInteger(change.y)) {
                throw new RangeError("tile override coordinates must be safe integers");
            }
            return {
                x: positiveModulo(change.x, this.bounds.width),
                y: positiveModulo(change.y, this.bounds.height),
                changes: change.changes
            };
        });
        this.deltaSession.assertEditable();
        this.persistOverrides(this.store.setTileOverrides(normalized));
    }

    public clearTileOverride(x: number, y: number): boolean {
        if (this.disposed) return false;
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
        const canonicalX = positiveModulo(x, this.bounds.width);
        const canonicalY = positiveModulo(y, this.bounds.height);
        this.deltaSession.assertEditable();
        const cleared = this.store.clearTileOverride(canonicalX, canonicalY);
        if (cleared) {
            this.persistOverrides([{ x: canonicalX, y: canonicalY }]);
        }
        return cleared;
    }

    public clearCache(): Promise<boolean> {
        this.cacheEpoch += 1;
        return this.cache?.clear() ?? Promise.resolve(false);
    }

    public flushCache(): Promise<void> {
        return this.cache?.flush?.() ?? Promise.resolve();
    }

    public flushDeltas(): Promise<void> { return this.deltaSession.flush(); }

    public createDeltaCheckpointSnapshot(): Promise<WorldDeltaCheckpoint> {
        return this.deltaSession.createCheckpointSnapshot();
    }

    public restoreDeltaCheckpointSnapshot(snapshot: WorldDeltaCheckpoint): Promise<void> {
        return this.deltaSession.restoreCheckpointSnapshot(snapshot);
    }

    public clearDeltas(): Promise<void> { return this.deltaSession.clear(); }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.deltaSession.dispose();
        this.pool.dispose();
        this.store.clear();
        if (this.ownsCache) this.cache?.dispose();
        if (this.ownsDeltaStore) this.deltaStore?.dispose();
    }

    private async readCachedChunk(key: string, chunkX: number, chunkY: number): Promise<PackedWorldChunk | undefined> {
        if (!this.cache) return undefined;
        const chunk = await this.cache.get(key).catch(() => undefined);
        if (!chunk || chunk.chunkX !== chunkX || chunk.chunkY !== chunkY || chunk.chunkSize !== this.chunkSize) return undefined;
        this.cachedLoads += 1;
        return chunk;
    }

    private persistOverrides(points: readonly Point[]): void {
        this.deltaSession.persist(points);
    }

    private restoreChunkDelta(chunkX: number, chunkY: number): Promise<void> {
        return this.deltaSession.restore(chunkX, chunkY);
    }
}

export class ProceduralWorldSource implements MutableWorldSource {
    public readonly chunkSize: number;
    public readonly store: SparseWorldChunkStore;
    public readonly descriptor: WorldDescriptor;
    public readonly worldId: string;
    private readonly seed: string | number;
    private readonly pool: WorldGeneratorPool;
    private readonly cache: WorldChunkCache | undefined;
    private readonly ownsCache: boolean;
    private readonly worldFingerprint: string;
    private readonly deltaStore: WorldDeltaStore | undefined;
    private readonly ownsDeltaStore: boolean;
    private readonly deltaSession: WorldDeltaSession;
    private cachedLoads = 0;
    private cacheEpoch = 0;
    private disposed = false;

    constructor(options: ProceduralWorldSourceOptions, dependencies: ProceduralWorldSourceDependencies = {}) {
        if (!options || typeof options !== "object") throw new TypeError("procedural world options are required");
        if (options.workerCount !== undefined
            && (!Number.isInteger(options.workerCount) || options.workerCount <= 0 || options.workerCount > 8)) {
            throw new RangeError("workerCount must be an integer between 1 and 8");
        }
        this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
        validateChunkSize(this.chunkSize);
        this.seed = options.seed;
        this.descriptor = createWorldDescriptor({
            seed: options.seed,
            chunkSize: this.chunkSize,
            generatorVersion: options.generatorVersion,
            waterStyle: options.waterStyle
        });
        this.worldFingerprint = serializeWorldDescriptor(this.descriptor);
        this.store = dependencies.store ?? new SparseWorldChunkStore();
        this.worldId = resolveWorldId(options.worldId, this.worldFingerprint);
        const resolvedDeltas = resolveDeltaStore(options, dependencies);
        const resolvedCache = resolveCache(options, dependencies);
        this.deltaStore = resolvedDeltas.store;
        this.ownsDeltaStore = resolvedDeltas.owned;
        this.cache = resolvedCache.cache;
        this.ownsCache = resolvedCache.owned;
        this.deltaSession = new WorldDeltaSession(this.deltaStore, this.worldId, this.chunkSize, this.store);
        try {
            this.pool = dependencies.pool ?? new WorldGeneratorPool(options.workerUrl, {
                size: options.workerCount,
                reservedChunkWorkers: options.reservedChunkWorkers,
                coordinator: options.workCoordinator,
                domain: "worker"
            });
        } catch (error) {
            if (this.ownsCache) this.cache?.dispose();
            if (this.ownsDeltaStore) this.deltaStore?.dispose();
            throw error;
        }
    }

    public get map(): MapInfo {
        return this.store.map;
    }

    public get stats(): Readonly<WorldSourceStats> {
        return cacheStats(this.pool.stats, this.cache, this.cachedLoads, this.deltaSession.stats);
    }

    public resolveChunk(chunkX: number, chunkY: number): Point | undefined {
        return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY) ? { x: chunkX, y: chunkY } : undefined;
    }

    public chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number {
        return Math.hypot(chunkX - centerChunkX, chunkY - centerChunkY);
    }

    public async loadChunk(
        chunkX: number,
        chunkY: number,
        request: ChunkRequestOptions = {}
    ): Promise<WorldChunk> {
        assertChunkRequestActive(this.disposed, request);
        const generation = {
            seed: this.seed,
            chunkX,
            chunkY,
            chunkSize: this.chunkSize,
            waterStyle: this.descriptor.waterStyle
        };
        const cacheKey = createWorldChunkCacheKey({ descriptor: this.descriptor, chunkX, chunkY });
        const cacheEpoch = this.cacheEpoch;
        let packed = this.cache ? await this.readCachedChunk(cacheKey, chunkX, chunkY) : undefined;
        assertChunkRequestActive(this.disposed, request);
        if (!packed) {
            packed = await this.pool.generateChunk(generation, request);
            assertChunkRequestActive(this.disposed, request);
            if (cacheEpoch === this.cacheEpoch) void this.cache?.put(cacheKey, packed).catch(() => false);
        }
        await this.restoreChunkDelta(chunkX, chunkY);
        assertChunkRequestActive(this.disposed, request);
        const coreTiles = this.store.add(packed);
        return { chunkX, chunkY, chunkSize: this.chunkSize, coreTiles, payload: packed };
    }

    public releaseChunk(chunk: WorldChunk): void {
        this.store.remove(chunk.chunkX, chunk.chunkY);
    }

    public prepareVegetation(
        options: WorldVegetationPreparationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldVegetationLayout> {
        if (this.disposed) return Promise.reject(new Error("ProceduralWorldSource has been disposed"));
        return this.pool.generateVegetation({
            ...options,
            map: createWorldVegetationMapSnapshot(this.map, options.points)
        }, request);
    }

    public prepareOverview(
        options: WorldOverviewPreparationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldOverviewRaster> {
        if (this.disposed) return Promise.reject(new Error("ProceduralWorldSource has been disposed"));
        return this.pool.generateOverview({ ...options, descriptor: this.descriptor }, request);
    }

    public configureWorkerCount(count: number): number {
        return this.pool.configureSize(count);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.store.hasChunk(chunkX, chunkY);
    }

    public hasTile(x: number, y: number): boolean {
        return this.store.hasCoreTile(x, y);
    }

    public getChunkRevision(chunkX: number, chunkY: number): WorldChunkRevision | undefined {
        const resolved = this.resolveChunk(chunkX, chunkY);
        if (!resolved) return undefined;
        return {
            terrainRevision: this.worldFingerprint,
            deltaRevision: this.deltaSession.getRevision(resolved.x, resolved.y)
        };
    }

    public setTileOverride(x: number, y: number, changes: WorldTileOverride): void {
        if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
        this.deltaSession.assertEditable();
        if (this.store.setTileOverride(x, y, changes)) this.persistOverrides([{ x, y }]);
    }

    public setTileOverrides(changes: readonly WorldTileOverrideChange[]): void {
        if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
        this.deltaSession.assertEditable();
        this.persistOverrides(this.store.setTileOverrides(changes));
    }

    public clearTileOverride(x: number, y: number): boolean {
        if (this.disposed) return false;
        this.deltaSession.assertEditable();
        const cleared = this.store.clearTileOverride(x, y);
        if (cleared) {
            this.persistOverrides([{ x, y }]);
        }
        return cleared;
    }

    public clearCache(): Promise<boolean> {
        this.cacheEpoch += 1;
        return this.cache?.clear() ?? Promise.resolve(false);
    }

    public flushCache(): Promise<void> {
        return this.cache?.flush?.() ?? Promise.resolve();
    }

    public flushDeltas(): Promise<void> { return this.deltaSession.flush(); }

    public createDeltaCheckpointSnapshot(): Promise<WorldDeltaCheckpoint> {
        return this.deltaSession.createCheckpointSnapshot();
    }

    public restoreDeltaCheckpointSnapshot(snapshot: WorldDeltaCheckpoint): Promise<void> {
        return this.deltaSession.restoreCheckpointSnapshot(snapshot);
    }

    public clearDeltas(): Promise<void> { return this.deltaSession.clear(); }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.deltaSession.dispose();
        this.pool.dispose();
        this.store.clear();
        if (this.ownsCache) this.cache?.dispose();
        if (this.ownsDeltaStore) this.deltaStore?.dispose();
    }

    private async readCachedChunk(key: string, chunkX: number, chunkY: number): Promise<PackedWorldChunk | undefined> {
        if (!this.cache) return undefined;
        const chunk = await this.cache.get(key).catch(() => undefined);
        if (!chunk || chunk.chunkX !== chunkX || chunk.chunkY !== chunkY || chunk.chunkSize !== this.chunkSize) return undefined;
        this.cachedLoads += 1;
        return chunk;
    }

    private persistOverrides(points: readonly Point[]): void {
        this.deltaSession.persist(points);
    }

    private restoreChunkDelta(chunkX: number, chunkY: number): Promise<void> {
        return this.deltaSession.restore(chunkX, chunkY);
    }
}

export function packedChunkFromWorldChunk(chunk: WorldChunk): PackedWorldChunk | undefined {
    if (!(chunk.payload instanceof Object) || !("tiles" in chunk.payload)) return undefined;
    const packed = chunk.payload as PackedWorldChunk;
    assertPackedWorldChunk(packed);
    if (packed.chunkX !== chunk.chunkX || packed.chunkY !== chunk.chunkY || packed.chunkSize !== chunk.chunkSize) {
        throw new TypeError("packed payload does not match its world chunk");
    }
    return packed;
}

export function getWorldSourceTile(source: WorldSource, x: number, y: number): TileInfo | undefined {
    return source.hasTile(x, y) ? getMapTile(source.map, x, y) : undefined;
}
