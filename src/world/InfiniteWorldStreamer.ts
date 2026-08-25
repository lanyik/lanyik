import { Point } from "../interfaces";
import {
    DEFAULT_WORLD_GENERATION_CHUNK_SIZE,
    MAX_WORLD_GENERATION_CHUNK_SIZE,
    PackedWorldChunk,
    SparseWorldChunkStore
} from "./generateWorldChunk";
import { WorldGeneratorPool } from "./WorldGeneratorPool";

export interface InfiniteWorldStreamerOptions {
    seed: string | number;
    chunkSize?: number;
    loadRadius?: number;
    retentionRadius?: number;
    maxResidentChunks?: number;
}

export interface InfiniteWorldStreamerHandlers {
    chunkLoaded(chunk: PackedWorldChunk, coreTiles: readonly Point[]): void;
    chunkUnloading(chunk: PackedWorldChunk): void;
    error?(error: Error): void;
}

export interface InfiniteWorldStreamingStats {
    centerChunkX: number;
    centerChunkY: number;
    residentChunks: number;
    pendingChunks: number;
    queuedChunks: number;
    busyWorkers: number;
    completedChunks: number;
}

interface PendingChunk {
    controller: AbortController;
    promise: Promise<PackedWorldChunk>;
}

interface ChunkCoordinate {
    x: number;
    y: number;
    distance: number;
    key: string;
}

function integerOption(name: string, value: number, minimum: number): void {
    if (!Number.isInteger(value) || value < minimum) {
        throw new RangeError(`${name} must be an integer >= ${minimum}`);
    }
}

export class InfiniteWorldStreamer {
    public readonly store: SparseWorldChunkStore;
    private readonly seed: string | number;
    private readonly chunkSize: number;
    private readonly loadRadius: number;
    private readonly retentionRadius: number;
    private readonly maxResidentChunks: number;
    private readonly residents = new Map<string, PackedWorldChunk>();
    private readonly pending = new Map<string, PendingChunk>();
    private wanted = new Set<string>();
    private centerChunkX = 0;
    private centerChunkY = 0;
    private disposed = false;

    constructor(
        private readonly pool: WorldGeneratorPool,
        private readonly handlers: InfiniteWorldStreamerHandlers,
        options: InfiniteWorldStreamerOptions,
        store = new SparseWorldChunkStore()
    ) {
        this.store = store;
        this.seed = options.seed;
        this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
        this.loadRadius = options.loadRadius ?? 3;
        this.retentionRadius = options.retentionRadius ?? this.loadRadius + 1;
        this.maxResidentChunks = options.maxResidentChunks ?? (this.retentionRadius * 2 + 1) ** 2;
        integerOption("chunkSize", this.chunkSize, 1);
        if (this.chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE) {
            throw new RangeError(`chunkSize must be <= ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
        }
        integerOption("loadRadius", this.loadRadius, 0);
        integerOption("retentionRadius", this.retentionRadius, this.loadRadius);
        integerOption("maxResidentChunks", this.maxResidentChunks, 1);
    }

    //Updates demand only when the camera crosses a generation-chunk boundary.
    //The returned promise resolves once the center chunk is resident, allowing
    //loadInfinite() to present a renderable first frame before it completes.
    public setCenterTile(x: number, y: number): Promise<PackedWorldChunk> {
        if (this.disposed) return Promise.reject(new Error("InfiniteWorldStreamer has been disposed"));
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
            return Promise.reject(new RangeError("streaming center must use safe integer tile coordinates"));
        }
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkY = Math.floor(y / this.chunkSize);
        const changed = chunkX !== this.centerChunkX || chunkY !== this.centerChunkY || this.wanted.size === 0;
        this.centerChunkX = chunkX;
        this.centerChunkY = chunkY;
        if (changed) this.refreshDemand();
        return this.requestChunk(chunkX, chunkY, 0);
    }

    public get stats(): Readonly<InfiniteWorldStreamingStats> {
        const pool = this.pool.stats;
        return {
            centerChunkX: this.centerChunkX,
            centerChunkY: this.centerChunkY,
            residentChunks: this.residents.size,
            pendingChunks: this.pending.size,
            queuedChunks: pool.queued,
            busyWorkers: pool.busyWorkers,
            completedChunks: pool.completed
        };
    }

    public dispose(disposePool = true): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const request of this.pending.values()) request.controller.abort();
        this.pending.clear();
        for (const chunk of this.residents.values()) this.handlers.chunkUnloading(chunk);
        this.residents.clear();
        this.store.clear();
        if (disposePool) this.pool.dispose();
    }

    private refreshDemand(): void {
        const coordinates: ChunkCoordinate[] = [];
        for (let dx = -this.loadRadius; dx <= this.loadRadius; dx += 1) {
            for (let dy = -this.loadRadius; dy <= this.loadRadius; dy += 1) {
                const distance = Math.hypot(dx, dy);
                if (distance > this.loadRadius + 0.5) continue;
                const x = this.centerChunkX + dx;
                const y = this.centerChunkY + dy;
                coordinates.push({ x, y, distance, key: SparseWorldChunkStore.key(x, y) });
            }
        }
        coordinates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
        this.wanted = new Set(coordinates.map(coordinate => coordinate.key));

        for (const [key, request] of this.pending) {
            if (!this.wanted.has(key)) request.controller.abort();
        }
        for (const coordinate of coordinates) {
            if (!this.residents.has(coordinate.key) && !this.pending.has(coordinate.key)) {
                void this.requestChunk(coordinate.x, coordinate.y, coordinate.distance).catch(error => {
                    if (error instanceof Error && error.name !== "AbortError") this.handlers.error?.(error);
                });
            }
        }
        this.evictOutsideRetention();
    }

    private requestChunk(chunkX: number, chunkY: number, priority: number): Promise<PackedWorldChunk> {
        const key = SparseWorldChunkStore.key(chunkX, chunkY);
        const resident = this.residents.get(key);
        if (resident) return Promise.resolve(resident);
        const existing = this.pending.get(key);
        if (existing) return existing.promise;

        const controller = new AbortController();
        const promise = this.pool.generateChunk(
            { seed: this.seed, chunkX, chunkY, chunkSize: this.chunkSize },
            { priority, signal: controller.signal }
        ).then(chunk => {
            if (this.disposed || !this.wanted.has(key)) throw new DOMException("Chunk is no longer wanted", "AbortError");
            const coreTiles = this.store.add(chunk);
            this.residents.set(key, chunk);
            try {
                this.handlers.chunkLoaded(chunk, coreTiles);
            } catch (reason) {
                this.residents.delete(key);
                this.store.remove(chunk.chunkX, chunk.chunkY);
                throw reason;
            }
            this.enforceResidentLimit();
            return chunk;
        }).finally(() => {
            this.pending.delete(key);
        });
        this.pending.set(key, { controller, promise });
        return promise;
    }

    private evictOutsideRetention(): void {
        for (const [key, chunk] of this.residents) {
            const dx = chunk.chunkX - this.centerChunkX;
            const dy = chunk.chunkY - this.centerChunkY;
            if (Math.hypot(dx, dy) <= this.retentionRadius + 0.5) continue;
            this.unload(key, chunk);
        }
    }

    private enforceResidentLimit(): void {
        if (this.residents.size <= this.maxResidentChunks) return;
        const candidates = [...this.residents.entries()]
            .filter(([key]) => !this.wanted.has(key))
            .sort((a, b) => {
                const da = Math.hypot(a[1].chunkX - this.centerChunkX, a[1].chunkY - this.centerChunkY);
                const db = Math.hypot(b[1].chunkX - this.centerChunkX, b[1].chunkY - this.centerChunkY);
                return db - da;
            });
        while (this.residents.size > this.maxResidentChunks && candidates.length > 0) {
            const [key, chunk] = candidates.shift()!;
            this.unload(key, chunk);
        }
    }

    private unload(key: string, chunk: PackedWorldChunk): void {
        this.handlers.chunkUnloading(chunk);
        this.residents.delete(key);
        this.store.remove(chunk.chunkX, chunk.chunkY);
    }
}
