import { assertWrappableMap, getMapTile, positiveModulo } from "../helpers/topology";
import { MapInfo, Point, TileInfo } from "../interfaces";
import { MAX_WORLD_SIZE, MIN_WORLD_SIZE } from "./generateWorld";
import {
    DEFAULT_WORLD_GENERATION_CHUNK_SIZE,
    MAX_WORLD_GENERATION_CHUNK_SIZE,
    PackedWorldChunk,
    SparseWorldChunkStore,
    WORLD_GENERATOR_VERSION,
    WorldTileOverride,
    assertPackedWorldChunk
} from "./generateWorldChunk";
import { ChunkRequestOptions, WorldGeneratorPool, WorldGeneratorPoolStats } from "./WorldGeneratorPool";
import {
    createWorldChunkCacheKey,
    IndexedDbWorldChunkCache,
    WorldChunkCache,
    WorldChunkCacheStats
} from "./WorldChunkCache";

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
    busyWorkers: number;
    queued: number;
    completed: number;
    cacheHits?: number;
    cacheMisses?: number;
    cacheWrites?: number;
    cacheErrors?: number;
    cachedChunks?: number;
    cachedBytes?: number;
}

//A WorldSource owns the materialized MapInfo view used by renderers. Loading a
//chunk must make all of its core tiles (and any required neighbor halo) visible
//through `map` before the promise resolves; releaseChunk reverses that work.
//One source instance belongs to one HexMap load session and is disposed when
//that session is replaced.
export interface WorldSource {
    readonly map: MapInfo;
    readonly chunkSize: number;
    readonly bounds?: WorldBounds;
    readonly stats?: Readonly<WorldSourceStats>;
    resolveChunk(chunkX: number, chunkY: number): Point | undefined;
    chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number;
    loadChunk(chunkX: number, chunkY: number, request?: ChunkRequestOptions): Promise<WorldChunk>;
    releaseChunk(chunk: WorldChunk): void;
    hasChunk(chunkX: number, chunkY: number): boolean;
    hasTile(x: number, y: number): boolean;
    clearCache?(): Promise<boolean>;
    dispose(): void;
}

export interface StaticWorldSourceOptions {
    chunkSize?: number;
}

export interface ProceduralWorldSourceOptions {
    seed: string | number;
    workerUrl: string | URL;
    workerCount?: number;
    chunkSize?: number;
    cache?: boolean | WorldChunkCache;
    cacheDatabaseName?: string;
    cacheMaxBytes?: number;
    generatorVersion?: number;
}

export interface ToroidalWorldSourceOptions extends ProceduralWorldSourceOptions {
    width: number;
    height: number;
}

export interface ProceduralWorldSourceDependencies {
    pool?: WorldGeneratorPool;
    store?: SparseWorldChunkStore;
    cache?: WorldChunkCache;
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
    if (dependencies.cache) return { cache: dependencies.cache, owned: false };
    if (options.cache && typeof options.cache === "object") return { cache: options.cache, owned: false };
    if (options.cache === true) {
        return {
            cache: new IndexedDbWorldChunkCache({
                databaseName: options.cacheDatabaseName,
                maxBytes: options.cacheMaxBytes
            }),
            owned: true
        };
    }
    return { cache: undefined, owned: false };
}

function cacheStats(pool: WorldGeneratorPoolStats, cache: WorldChunkCache | undefined, cachedLoads: number): WorldSourceStats {
    const stored: Readonly<WorldChunkCacheStats> | undefined = cache?.stats;
    return {
        ...pool,
        completed: pool.completed + cachedLoads,
        cacheHits: cachedLoads,
        cacheMisses: stored?.misses ?? 0,
        cacheWrites: stored?.writes ?? 0,
        cacheErrors: stored?.errors ?? 0,
        cachedChunks: stored?.entries ?? 0,
        cachedBytes: stored?.bytes ?? 0
    };
}

// Finite toroidal counterpart to ProceduralWorldSource. The authoritative
// world is seed+dimensions; only camera-near packed chunks are materialized.
export class ToroidalWorldSource implements WorldSource {
    public readonly chunkSize: number;
    public readonly bounds: WorldBounds;
    public readonly store: SparseWorldChunkStore;
    private readonly seed: string | number;
    private readonly pool: WorldGeneratorPool;
    private readonly chunkCountX: number;
    private readonly chunkCountY: number;
    private readonly cache: WorldChunkCache | undefined;
    private readonly ownsCache: boolean;
    private readonly generatorVersion: number;
    private cachedLoads = 0;
    private cacheEpoch = 0;
    private disposed = false;

    constructor(options: ToroidalWorldSourceOptions, dependencies: ToroidalWorldSourceDependencies = {}) {
        if (!options || typeof options !== "object") throw new TypeError("toroidal world options are required");
        if (!Number.isInteger(options.width) || options.width < MIN_WORLD_SIZE || options.width > MAX_WORLD_SIZE
            || !Number.isInteger(options.height) || options.height < MIN_WORLD_SIZE || options.height > MAX_WORLD_SIZE) {
            throw new RangeError(`toroidal world dimensions must be integers between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
        }
        if (options.width % 2 !== 0) throw new RangeError("toroidal worlds require an even width");
        if (options.workerCount !== undefined
            && (!Number.isInteger(options.workerCount) || options.workerCount <= 0 || options.workerCount > 8)) {
            throw new RangeError("workerCount must be an integer between 1 and 8");
        }
        this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
        validateChunkSize(this.chunkSize);
        this.seed = options.seed;
        this.generatorVersion = options.generatorVersion ?? WORLD_GENERATOR_VERSION;
        if (!Number.isInteger(this.generatorVersion) || this.generatorVersion <= 0) {
            throw new RangeError("generatorVersion must be a positive integer");
        }
        this.bounds = { width: options.width, height: options.height, wrapX: true, wrapY: true };
        this.chunkCountX = Math.ceil(options.width / this.chunkSize);
        this.chunkCountY = Math.ceil(options.height / this.chunkSize);
        this.store = dependencies.store ?? new SparseWorldChunkStore(this.bounds);
        if (this.store.map.infinite || this.store.map.w !== options.width || this.store.map.h !== options.height
            || !this.store.map.wrapX || !this.store.map.wrapY) {
            throw new TypeError("toroidal world store bounds do not match source dimensions");
        }
        const resolvedCache = resolveCache(options, dependencies);
        this.cache = resolvedCache.cache;
        this.ownsCache = resolvedCache.owned;
        try {
            this.pool = dependencies.pool ?? new WorldGeneratorPool(options.workerUrl, { size: options.workerCount });
        } catch (error) {
            if (this.ownsCache) this.cache?.dispose();
            throw error;
        }
    }

    public get map(): MapInfo {
        return this.store.map;
    }

    public get stats(): Readonly<WorldSourceStats> {
        return cacheStats(this.pool.stats, this.cache, this.cachedLoads);
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
        if (this.disposed) throw new Error("ToroidalWorldSource has been disposed");
        const resolved = this.resolveChunk(chunkX, chunkY);
        if (!resolved || resolved.x !== chunkX || resolved.y !== chunkY) {
            throw new RangeError("toroidal chunk coordinates must use canonical bounds");
        }
        const generation = {
            seed: this.seed,
            chunkX,
            chunkY,
            chunkSize: this.chunkSize,
            world: { width: this.bounds.width, height: this.bounds.height, topology: "toroidal" }
        } as const;
        const cacheKey = createWorldChunkCacheKey({ ...generation, generatorVersion: this.generatorVersion });
        const cacheEpoch = this.cacheEpoch;
        let packed = this.cache ? await this.readCachedChunk(cacheKey, chunkX, chunkY) : undefined;
        if (!packed) {
            packed = await this.pool.generateChunk(generation, request);
            if (cacheEpoch === this.cacheEpoch) void this.cache?.put(cacheKey, packed).catch(() => false);
        }
        if (request.signal?.aborted) throw abortError();
        const coreTiles = this.store.add(packed);
        return { chunkX, chunkY, chunkSize: this.chunkSize, coreTiles, payload: packed };
    }

    public releaseChunk(chunk: WorldChunk): void {
        this.store.remove(chunk.chunkX, chunk.chunkY);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.store.hasChunk(chunkX, chunkY);
    }

    public hasTile(x: number, y: number): boolean {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)
            || x < 0 || x >= this.bounds.width || y < 0 || y >= this.bounds.height) return false;
        return this.store.hasCoreTile(x, y);
    }

    public setTileOverride(x: number, y: number, changes: WorldTileOverride): void {
        if (this.disposed) throw new Error("ToroidalWorldSource has been disposed");
        this.store.setTileOverride(
            positiveModulo(x, this.bounds.width),
            positiveModulo(y, this.bounds.height),
            changes
        );
    }

    public clearTileOverride(x: number, y: number): boolean {
        if (this.disposed) return false;
        return this.store.clearTileOverride(
            positiveModulo(x, this.bounds.width),
            positiveModulo(y, this.bounds.height)
        );
    }

    public clearCache(): Promise<boolean> {
        this.cacheEpoch += 1;
        return this.cache?.clear() ?? Promise.resolve(false);
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.pool.dispose();
        this.store.clear();
        if (this.ownsCache) this.cache?.dispose();
    }

    private async readCachedChunk(key: string, chunkX: number, chunkY: number): Promise<PackedWorldChunk | undefined> {
        if (!this.cache) return undefined;
        const chunk = await this.cache.get(key).catch(() => undefined);
        if (!chunk || chunk.chunkX !== chunkX || chunk.chunkY !== chunkY || chunk.chunkSize !== this.chunkSize) return undefined;
        this.cachedLoads += 1;
        return chunk;
    }
}

export class ProceduralWorldSource implements WorldSource {
    public readonly chunkSize: number;
    public readonly store: SparseWorldChunkStore;
    private readonly seed: string | number;
    private readonly pool: WorldGeneratorPool;
    private readonly cache: WorldChunkCache | undefined;
    private readonly ownsCache: boolean;
    private readonly generatorVersion: number;
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
        this.generatorVersion = options.generatorVersion ?? WORLD_GENERATOR_VERSION;
        if (!Number.isInteger(this.generatorVersion) || this.generatorVersion <= 0) {
            throw new RangeError("generatorVersion must be a positive integer");
        }
        this.store = dependencies.store ?? new SparseWorldChunkStore();
        const resolvedCache = resolveCache(options, dependencies);
        this.cache = resolvedCache.cache;
        this.ownsCache = resolvedCache.owned;
        try {
            this.pool = dependencies.pool ?? new WorldGeneratorPool(options.workerUrl, { size: options.workerCount });
        } catch (error) {
            if (this.ownsCache) this.cache?.dispose();
            throw error;
        }
    }

    public get map(): MapInfo {
        return this.store.map;
    }

    public get stats(): Readonly<WorldSourceStats> {
        return cacheStats(this.pool.stats, this.cache, this.cachedLoads);
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
        if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
        const generation = { seed: this.seed, chunkX, chunkY, chunkSize: this.chunkSize };
        const cacheKey = createWorldChunkCacheKey({ ...generation, generatorVersion: this.generatorVersion });
        const cacheEpoch = this.cacheEpoch;
        let packed = this.cache ? await this.readCachedChunk(cacheKey, chunkX, chunkY) : undefined;
        if (!packed) {
            packed = await this.pool.generateChunk(generation, request);
            if (cacheEpoch === this.cacheEpoch) void this.cache?.put(cacheKey, packed).catch(() => false);
        }
        if (request.signal?.aborted) throw abortError();
        const coreTiles = this.store.add(packed);
        return { chunkX, chunkY, chunkSize: this.chunkSize, coreTiles, payload: packed };
    }

    public releaseChunk(chunk: WorldChunk): void {
        this.store.remove(chunk.chunkX, chunk.chunkY);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.store.hasChunk(chunkX, chunkY);
    }

    public hasTile(x: number, y: number): boolean {
        return this.store.hasCoreTile(x, y);
    }

    public setTileOverride(x: number, y: number, changes: WorldTileOverride): void {
        if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
        this.store.setTileOverride(x, y, changes);
    }

    public clearTileOverride(x: number, y: number): boolean {
        if (this.disposed) return false;
        return this.store.clearTileOverride(x, y);
    }

    public clearCache(): Promise<boolean> {
        this.cacheEpoch += 1;
        return this.cache?.clear() ?? Promise.resolve(false);
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.pool.dispose();
        this.store.clear();
        if (this.ownsCache) this.cache?.dispose();
    }

    private async readCachedChunk(key: string, chunkX: number, chunkY: number): Promise<PackedWorldChunk | undefined> {
        if (!this.cache) return undefined;
        const chunk = await this.cache.get(key).catch(() => undefined);
        if (!chunk || chunk.chunkX !== chunkX || chunk.chunkY !== chunkY || chunk.chunkSize !== this.chunkSize) return undefined;
        this.cachedLoads += 1;
        return chunk;
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
