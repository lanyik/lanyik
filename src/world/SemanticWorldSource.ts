import { MapInfo } from "../interfaces";
import {
    BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES,
    BaseSemanticChunk,
    SemanticChunkKey
} from "./BaseSemanticChunk";
import { compileStaticSemanticChunk } from "./compileStaticSemanticChunk";
import { CoordinatePairMap } from "./CoordinatePairMap";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import {
    SurfaceTaskRequestOptions,
    SurfaceWorkerPool,
    SurfaceWorkerPoolOptions,
    SurfaceWorkerPoolStats
} from "./SurfaceWorkerPool";
import { chunkOrigin } from "./WorldGrid";
import {
    InfiniteWorldDescriptorV2,
    StaticWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    WorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

export const DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES = 32 * 1024 * 1024;

export interface SemanticWorldBounds {
    readonly width: number;
    readonly height: number;
    readonly topology: "finite" | "toroidal";
}

export interface SemanticWorldSourceStats {
    readonly residentChunks: number;
    readonly residentBytes: number;
    readonly leasedChunks: number;
    readonly inFlightChunks: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly workers: number;
    readonly busyWorkers: number;
    readonly queuedWorkerTasks: number;
}

export interface SemanticWorldSource {
    readonly descriptor: WorldDescriptorV2;
    readonly worldIdentity: string;
    readonly bounds?: SemanticWorldBounds;
    readonly stats: Readonly<SemanticWorldSourceStats>;
    resolveChunk(chunkX: number, chunkY: number): SemanticChunkKey | undefined;
    chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number;
    loadChunk(
        chunkX: number,
        chunkY: number,
        request?: Readonly<SurfaceTaskRequestOptions>
    ): Promise<BaseSemanticChunk>;
    releaseChunk(chunk: Readonly<BaseSemanticChunk>): void;
    hasChunk(chunkX: number, chunkY: number): boolean;
    dispose(): void;
}

export interface SemanticChunkPool {
    generateSemanticChunk(
        options: { readonly descriptor: WorldDescriptorV2; readonly key: SemanticChunkKey },
        request?: Readonly<SurfaceTaskRequestOptions>
    ): Promise<BaseSemanticChunk>;
    readonly stats: Readonly<SurfaceWorkerPoolStats>;
    dispose(): void;
}

export interface ProceduralSemanticWorldSourceOptions {
    readonly descriptor: InfiniteWorldDescriptorV2 | ToroidalWorldDescriptorV2;
    readonly workerUrl?: string | URL;
    readonly workerPool?: SemanticChunkPool;
    readonly workerPoolOptions?: Readonly<SurfaceWorkerPoolOptions>;
    readonly cacheMaxBytes?: number;
}

interface CacheEntry {
    readonly chunk: BaseSemanticChunk;
    readonly bytes: number;
    references: number;
    lastUsed: number;
}

interface PendingChunk {
    readonly controller: AbortController;
    readonly promise: Promise<BaseSemanticChunk>;
    waiters: number;
    settled: boolean;
}

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") return new DOMException("semantic chunk request was aborted", "AbortError");
    const error = new Error("semantic chunk request was aborted");
    error.name = "AbortError";
    return error;
}

function semanticChunkBytes(chunk: Readonly<BaseSemanticChunk>): number {
    return chunk.substrateClass.byteLength
        + chunk.macroHeight.byteLength
        + chunk.biomeWeights.byteLength
        + chunk.climate.byteLength
        + chunk.vegetationDensity.byteLength
        + chunk.vegetationProfile.byteLength;
}

function validateChunkKey(chunkX: number, chunkY: number): boolean {
    try {
        chunkOrigin(chunkX, chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
        return true;
    } catch {
        return false;
    }
}

abstract class ProceduralSemanticWorldSourceBase implements SemanticWorldSource {
    public readonly descriptor: InfiniteWorldDescriptorV2 | ToroidalWorldDescriptorV2;
    public readonly worldIdentity: string;
    public readonly bounds: SemanticWorldBounds | undefined;
    private readonly pool: SemanticChunkPool;
    private readonly ownsPool: boolean;
    private readonly cacheMaxBytes: number;
    private readonly cache = new CoordinatePairMap<CacheEntry>();
    private readonly inFlight = new CoordinatePairMap<PendingChunk>();
    private cacheBytes = 0;
    private cacheClock = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private disposed = false;

    protected constructor(
        options: Readonly<ProceduralSemanticWorldSourceOptions>,
        expectedKind: InfiniteWorldDescriptorV2["sourceKind"] | ToroidalWorldDescriptorV2["sourceKind"]
    ) {
        if (!options || typeof options !== "object") throw new TypeError("procedural semantic source options are required");
        assertWorldDescriptorV2(options.descriptor);
        if (options.descriptor.sourceKind !== expectedKind) {
            throw new TypeError(`semantic source requires a ${expectedKind} descriptor`);
        }
        this.descriptor = options.descriptor;
        this.worldIdentity = serializeWorldDescriptorV2(this.descriptor);
        this.bounds = this.descriptor.sourceKind === "procedural-toroidal"
            ? Object.freeze({ width: this.descriptor.width, height: this.descriptor.height, topology: "toroidal" })
            : undefined;
        this.cacheMaxBytes = options.cacheMaxBytes ?? DEFAULT_SEMANTIC_CHUNK_CACHE_BYTES;
        if (!Number.isSafeInteger(this.cacheMaxBytes)
            || this.cacheMaxBytes < BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
            throw new RangeError("semantic chunk cache must hold at least one serialized chunk");
        }
        if (options.workerPool) {
            if (options.workerUrl !== undefined || options.workerPoolOptions !== undefined) {
                throw new TypeError("external semantic workerPool cannot be combined with workerUrl or workerPoolOptions");
            }
            this.pool = options.workerPool;
            this.ownsPool = false;
        } else {
            if (!options.workerUrl) throw new TypeError("procedural semantic source requires a surface worker URL");
            this.pool = new SurfaceWorkerPool(options.workerUrl, options.workerPoolOptions);
            this.ownsPool = true;
        }
    }

    public resolveChunk(chunkX: number, chunkY: number): SemanticChunkKey | undefined {
        if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) return undefined;
        if (this.descriptor.sourceKind === "procedural-infinite") {
            return validateChunkKey(chunkX, chunkY) ? { chunkX, chunkY } : undefined;
        }
        const countX = this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
        const countY = this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
        return {
            chunkX: positiveModulo(chunkX, countX),
            chunkY: positiveModulo(chunkY, countY)
        };
    }

    public chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number {
        const first = this.resolveChunk(chunkX, chunkY);
        const second = this.resolveChunk(centerChunkX, centerChunkY);
        if (!first || !second) return Number.POSITIVE_INFINITY;
        let dx = Math.abs(first.chunkX - second.chunkX);
        let dy = Math.abs(first.chunkY - second.chunkY);
        if (this.descriptor.sourceKind === "procedural-toroidal") {
            const countX = this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
            const countY = this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
            dx = Math.min(dx, countX - dx);
            dy = Math.min(dy, countY - dy);
        }
        return Math.hypot(dx, dy);
    }

    public loadChunk(
        chunkX: number,
        chunkY: number,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<BaseSemanticChunk> {
        if (this.disposed) return Promise.reject(new Error("semantic world source has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        const resolved = this.resolveChunk(chunkX, chunkY);
        if (!resolved || resolved.chunkX !== chunkX || resolved.chunkY !== chunkY) {
            return Promise.reject(new RangeError("semantic chunk request must use a canonical in-domain key"));
        }
        const cached = this.cache.get(chunkX, chunkY);
        if (cached) {
            this.cacheHits += 1;
            cached.references += 1;
            this.touch(cached);
            return Promise.resolve(cached.chunk);
        }
        this.cacheMisses += 1;
        let pending = this.inFlight.get(chunkX, chunkY);
        if (!pending) {
            const controller = new AbortController();
            const created = {
                controller,
                waiters: 0,
                settled: false,
                promise: undefined as unknown as Promise<BaseSemanticChunk>
            };
            created.promise = this.pool.generateSemanticChunk({
                descriptor: this.descriptor,
                key: resolved
            }, {
                priority: request.priority,
                lane: request.lane,
                weight: request.weight,
                signal: controller.signal
            }).then(chunk => {
                if (this.disposed) throw new Error("semantic world source was disposed during generation");
                this.insert(chunk);
                return chunk;
            }).finally(() => {
                created.settled = true;
                this.inFlight.delete(chunkX, chunkY);
                if (created.waiters === 0) this.evictUnleased();
            });
            pending = created;
            this.inFlight.set(chunkX, chunkY, pending);
        }
        return this.waitFor(pending, request.signal);
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        const entry = this.cache.get(chunk.key.chunkX, chunk.key.chunkY);
        if (!entry || entry.chunk !== chunk || entry.references <= 0) {
            throw new Error("semantic chunk release does not match an active source lease");
        }
        entry.references -= 1;
        this.touch(entry);
        this.evictUnleased();
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.cache.has(chunkX, chunkY);
    }

    public get stats(): Readonly<SemanticWorldSourceStats> {
        const worker = this.pool.stats;
        let leasedChunks = 0;
        for (const entry of this.cache.values()) {
            if (entry.references > 0) leasedChunks += 1;
        }
        return Object.freeze({
            residentChunks: this.cache.size,
            residentBytes: this.cacheBytes,
            leasedChunks,
            inFlightChunks: this.inFlight.size,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            workers: worker.workers,
            busyWorkers: worker.busyWorkers,
            queuedWorkerTasks: worker.queued
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const pending of this.inFlight.values()) pending.controller.abort();
        if (this.ownsPool) this.pool.dispose();
        this.cache.clear();
        this.cacheBytes = 0;
    }

    private waitFor(pending: PendingChunk, signal: AbortSignal | undefined): Promise<BaseSemanticChunk> {
        pending.waiters += 1;
        return new Promise<BaseSemanticChunk>((resolve, reject) => {
            let settled = false;
            const finish = (settle: () => void): void => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener("abort", onAbort);
                pending.waiters -= 1;
                if (pending.waiters === 0 && !pending.settled) pending.controller.abort();
                settle();
            };
            const onAbort = () => finish(() => reject(abortError()));
            signal?.addEventListener("abort", onAbort, { once: true });
            pending.promise.then(chunk => finish(() => {
                const entry = this.cache.get(chunk.key.chunkX, chunk.key.chunkY);
                if (!entry || entry.chunk !== chunk) {
                    reject(new Error("generated semantic chunk was not published to its source cache"));
                    return;
                }
                entry.references += 1;
                this.touch(entry);
                this.evictUnleased();
                resolve(chunk);
            }), reason => finish(() => reject(reason instanceof Error ? reason : new Error(String(reason)))));
            if (signal?.aborted) onAbort();
        });
    }

    private insert(chunk: BaseSemanticChunk): void {
        if (this.cache.has(chunk.key.chunkX, chunk.key.chunkY)) {
            throw new Error("semantic worker produced a duplicate resident chunk");
        }
        const bytes = semanticChunkBytes(chunk);
        const entry: CacheEntry = { chunk, bytes, references: 0, lastUsed: 0 };
        this.touch(entry);
        this.cache.set(chunk.key.chunkX, chunk.key.chunkY, entry);
        this.cacheBytes += bytes;
    }

    private touch(entry: CacheEntry): void {
        if (this.cacheClock >= Number.MAX_SAFE_INTEGER) {
            const entries = [...this.cache.values()].sort((first, second) => first.lastUsed - second.lastUsed);
            for (let index = 0; index < entries.length; index += 1) entries[index].lastUsed = index + 1;
            this.cacheClock = entries.length;
        }
        this.cacheClock += 1;
        entry.lastUsed = this.cacheClock;
    }

    private evictUnleased(): void {
        while (this.cacheBytes > this.cacheMaxBytes) {
            let candidate: CacheEntry | undefined;
            for (const entry of this.cache.values()) {
                if (entry.references === 0 && (!candidate || entry.lastUsed < candidate.lastUsed)) candidate = entry;
            }
            if (!candidate) return;
            this.cache.delete(candidate.chunk.key.chunkX, candidate.chunk.key.chunkY);
            this.cacheBytes -= candidate.bytes;
        }
    }
}

export class InfiniteSemanticWorldSource extends ProceduralSemanticWorldSourceBase {
    constructor(options: Readonly<ProceduralSemanticWorldSourceOptions & { descriptor: InfiniteWorldDescriptorV2 }>) {
        super(options, "procedural-infinite");
    }
}

export class ToroidalSemanticWorldSource extends ProceduralSemanticWorldSourceBase {
    constructor(options: Readonly<ProceduralSemanticWorldSourceOptions & { descriptor: ToroidalWorldDescriptorV2 }>) {
        super(options, "procedural-toroidal");
    }
}

export class StaticSemanticWorldSource implements SemanticWorldSource {
    public readonly descriptor: StaticWorldDescriptorV2;
    public readonly worldIdentity: string;
    public readonly bounds: SemanticWorldBounds;
    private readonly chunks = new CoordinatePairMap<CacheEntry>();
    private residentBytes = 0;
    private disposed = false;

    constructor(map: MapInfo, descriptor: StaticWorldDescriptorV2) {
        assertWorldDescriptorV2(descriptor);
        if (descriptor.sourceKind !== "static") {
            throw new TypeError("StaticSemanticWorldSource requires a static descriptor");
        }
        this.descriptor = descriptor;
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
        this.bounds = Object.freeze({ width: descriptor.width, height: descriptor.height, topology: "finite" });
        const countX = Math.ceil(descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE);
        const countY = Math.ceil(descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE);
        for (let chunkX = 0; chunkX < countX; chunkX += 1) {
            for (let chunkY = 0; chunkY < countY; chunkY += 1) {
                const chunk = compileStaticSemanticChunk({ map, descriptor, chunkX, chunkY });
                const bytes = semanticChunkBytes(chunk);
                this.chunks.set(chunkX, chunkY, { chunk, bytes, references: 0, lastUsed: 0 });
                this.residentBytes += bytes;
            }
        }
    }

    public resolveChunk(chunkX: number, chunkY: number): SemanticChunkKey | undefined {
        return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY) && this.chunks.has(chunkX, chunkY)
            ? { chunkX, chunkY } : undefined;
    }

    public chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number {
        const first = this.resolveChunk(chunkX, chunkY);
        const second = this.resolveChunk(centerChunkX, centerChunkY);
        return first && second
            ? Math.hypot(first.chunkX - second.chunkX, first.chunkY - second.chunkY)
            : Number.POSITIVE_INFINITY;
    }

    public loadChunk(
        chunkX: number,
        chunkY: number,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<BaseSemanticChunk> {
        if (this.disposed) return Promise.reject(new Error("static semantic source has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        const entry = this.chunks.get(chunkX, chunkY);
        if (entry) entry.references += 1;
        return entry ? Promise.resolve(entry.chunk)
            : Promise.reject(new RangeError("static semantic chunk is outside the finite world"));
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        const entry = this.chunks.get(chunk.key.chunkX, chunk.key.chunkY);
        if (!entry || entry.chunk !== chunk || entry.references <= 0) {
            throw new Error("static semantic chunk release does not match an active source lease");
        }
        entry.references -= 1;
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(chunkX, chunkY);
    }

    public get stats(): Readonly<SemanticWorldSourceStats> {
        let leasedChunks = 0;
        for (const entry of this.chunks.values()) {
            if (entry.references > 0) leasedChunks += 1;
        }
        return Object.freeze({
            residentChunks: this.chunks.size,
            residentBytes: this.residentBytes,
            leasedChunks,
            inFlightChunks: 0,
            cacheHits: 0,
            cacheMisses: 0,
            workers: 0,
            busyWorkers: 0,
            queuedWorkerTasks: 0
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.chunks.clear();
        this.residentBytes = 0;
    }
}

export function assertSemanticWorldSource(source: SemanticWorldSource): void {
    if (!source || typeof source !== "object") throw new TypeError("semantic world source must be an object");
    assertWorldDescriptorV2(source.descriptor);
    if (source.worldIdentity !== serializeWorldDescriptorV2(source.descriptor)) {
        throw new TypeError("semantic world source identity does not match its descriptor");
    }
    for (const method of ["resolveChunk", "chunkDistance", "loadChunk", "releaseChunk", "hasChunk", "dispose"] as const) {
        if (typeof source[method] !== "function") throw new TypeError(`semantic world source must implement ${method}()`);
    }
}
