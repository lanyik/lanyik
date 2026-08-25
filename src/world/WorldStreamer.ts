import { Point } from "../interfaces";
import { positiveModulo } from "../helpers/topology";
import { assertWorldChunk, assertWorldSource, WorldChunk, WorldSource } from "./WorldSource";

export interface WorldStreamerOptions {
    loadRadius?: number;
    retentionRadius?: number;
    maxResidentChunks?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
}

export interface WorldStreamerHandlers {
    chunkLoaded(chunk: WorldChunk): void;
    chunkUnloading(chunk: WorldChunk): void;
    error?(error: Error): void;
}

export interface WorldStreamingStats {
    centerChunkX: number;
    centerChunkY: number;
    residentChunks: number;
    pendingChunks: number;
    queuedChunks: number;
    busyWorkers: number;
    completedChunks: number;
    retriedChunkRequests: number;
    failedChunks: number;
    cacheHits: number;
    cacheMisses: number;
    cachedChunks: number;
    cachedBytes: number;
    cacheErrors: number;
}

interface PendingChunk {
    controller: AbortController;
    promise: Promise<WorldChunk>;
}

interface ChunkCoordinate extends Point {
    distance: number;
    key: string;
}

function integerOption(name: string, value: number, minimum: number): void {
    if (!Number.isInteger(value) || value < minimum) {
        throw new RangeError(`${name} must be an integer >= ${minimum}`);
    }
}

function abortError(message: string): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(abortError("Chunk retry was aborted"));
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, delayMs);
        const abort = () => {
            clearTimeout(timeout);
            reject(abortError("Chunk retry was aborted"));
        };
        signal.addEventListener("abort", abort, { once: true });
    });
}

//The single residency controller used by bounded, wrapped and unbounded
//worlds. WorldSource handles storage/I/O; this class handles camera demand,
//priority, cancellation and eviction without knowing how a chunk was made.
export class WorldStreamer {
    private readonly loadRadius: number;
    private readonly retentionRadius: number;
    private readonly maxResidentChunks: number;
    private readonly maxRetries: number;
    private readonly retryBaseDelayMs: number;
    private readonly residents = new Map<string, WorldChunk>();
    private readonly pending = new Map<string, PendingChunk>();
    private wanted = new Set<string>();
    private centerChunkX = 0;
    private centerChunkY = 0;
    private predictedChunkX = 0;
    private predictedChunkY = 0;
    private disposed = false;
    private completed = 0;
    private retried = 0;
    private failed = 0;

    constructor(
        public readonly source: WorldSource,
        private readonly handlers: WorldStreamerHandlers,
        options: WorldStreamerOptions = {}
    ) {
        assertWorldSource(source);
        this.loadRadius = options.loadRadius ?? 3;
        this.retentionRadius = options.retentionRadius ?? this.loadRadius + 1;
        this.maxResidentChunks = options.maxResidentChunks ?? (this.retentionRadius * 2 + 1) ** 2;
        this.maxRetries = options.maxRetries ?? 2;
        this.retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
        integerOption("loadRadius", this.loadRadius, 0);
        integerOption("retentionRadius", this.retentionRadius, this.loadRadius);
        integerOption("maxResidentChunks", this.maxResidentChunks, 1);
        integerOption("maxRetries", this.maxRetries, 0);
        integerOption("retryBaseDelayMs", this.retryBaseDelayMs, 0);
    }

    public setCenterTile(x: number, y: number, predictedTile?: Point): Promise<WorldChunk> {
        if (this.disposed) return Promise.reject(new Error("WorldStreamer has been disposed"));
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
            return Promise.reject(new RangeError("streaming center must use safe integer tile coordinates"));
        }
        const center = this.resolveTileChunk(x, y);
        if (!center) return Promise.reject(new RangeError("streaming center is outside the world bounds"));
        let predicted = center;
        if (predictedTile) {
            if (!Number.isSafeInteger(predictedTile.x) || !Number.isSafeInteger(predictedTile.y)) {
                return Promise.reject(new RangeError("predicted streaming tile must use safe integer coordinates"));
            }
            const candidate = this.resolveTileChunk(predictedTile.x, predictedTile.y);
            // Prediction may extend only into the retention margin. This keeps
            // speculative chunks from evicting the guaranteed current radius.
            const maximumAhead = Math.max(0, this.retentionRadius - this.loadRadius);
            if (candidate && this.source.chunkDistance(candidate.x, candidate.y, center.x, center.y) <= maximumAhead) {
                predicted = candidate;
            }
        }
        const changed = center.x !== this.centerChunkX || center.y !== this.centerChunkY
            || predicted.x !== this.predictedChunkX || predicted.y !== this.predictedChunkY
            || this.wanted.size === 0;
        this.centerChunkX = center.x;
        this.centerChunkY = center.y;
        this.predictedChunkX = predicted.x;
        this.predictedChunkY = predicted.y;
        if (changed) this.refreshDemand();
        return this.requestChunk(center.x, center.y, 0);
    }

    public get stats(): Readonly<WorldStreamingStats> {
        const source = this.source.stats;
        return {
            centerChunkX: this.centerChunkX,
            centerChunkY: this.centerChunkY,
            residentChunks: this.residents.size,
            pendingChunks: this.pending.size,
            queuedChunks: source?.queued ?? 0,
            busyWorkers: source?.busyWorkers ?? 0,
            completedChunks: source?.completed ?? this.completed,
            retriedChunkRequests: this.retried,
            failedChunks: this.failed,
            cacheHits: source?.cacheHits ?? 0,
            cacheMisses: source?.cacheMisses ?? 0,
            cachedChunks: source?.cachedChunks ?? 0,
            cachedBytes: source?.cachedBytes ?? 0,
            cacheErrors: source?.cacheErrors ?? 0
        };
    }

    public get residentChunks(): readonly WorldChunk[] {
        return [...this.residents.values()];
    }

    public hasResident(chunkX: number, chunkY: number): boolean {
        return this.residents.has(WorldStreamer.key(chunkX, chunkY));
    }

    public dispose(disposeSource = true): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const request of this.pending.values()) request.controller.abort();
        this.pending.clear();
        for (const chunk of this.residents.values()) this.unload(chunk);
        this.residents.clear();
        if (disposeSource) this.source.dispose();
    }

    private resolveTileChunk(tileX: number, tileY: number): Point | undefined {
        const bounds = this.source.bounds;
        let x = tileX;
        let y = tileY;
        if (bounds) {
            if (bounds.wrapX) x = positiveModulo(x, bounds.width);
            else if (x < 0 || x >= bounds.width) return undefined;
            if (bounds.wrapY) y = positiveModulo(y, bounds.height);
            else if (y < 0 || y >= bounds.height) return undefined;
        }
        return this.source.resolveChunk(
            Math.floor(x / this.source.chunkSize),
            Math.floor(y / this.source.chunkSize)
        );
    }

    private refreshDemand(): void {
        const coordinateByKey = new Map<string, ChunkCoordinate>();
        const collect = (originX: number, originY: number, predictionPenalty: number) => {
            for (let dx = -this.loadRadius; dx <= this.loadRadius; dx += 1) {
                for (let dy = -this.loadRadius; dy <= this.loadRadius; dy += 1) {
                    const radialDistance = Math.hypot(dx, dy);
                    if (radialDistance > this.loadRadius + 0.5) continue;
                    const resolved = this.source.resolveChunk(originX + dx, originY + dy);
                    if (!resolved) continue;
                    const key = WorldStreamer.key(resolved.x, resolved.y);
                    const distance = radialDistance + predictionPenalty;
                    const existing = coordinateByKey.get(key);
                    if (!existing || distance < existing.distance) {
                        coordinateByKey.set(key, { ...resolved, distance, key });
                    }
                }
            }
        };
        collect(this.centerChunkX, this.centerChunkY, 0);
        if (this.predictedChunkX !== this.centerChunkX || this.predictedChunkY !== this.centerChunkY) {
            // Current-area requests win ties; predicted work fills idle workers.
            collect(this.predictedChunkX, this.predictedChunkY, 0.35);
        }
        //maxResidentChunks is a hard source-residency limit. Restrict demand to
        //the nearest chunks up front instead of loading a larger wanted set that
        //cannot be evicted without immediately requesting it again.
        const coordinates = [...coordinateByKey.values()]
            .sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y)
            .slice(0, this.maxResidentChunks);
        this.wanted = new Set(coordinates.map(coordinate => coordinate.key));

        for (const [key, request] of this.pending) {
            if (!this.wanted.has(key)) request.controller.abort();
        }
        for (const coordinate of coordinates) {
            if (!this.residents.has(coordinate.key) && !this.pending.has(coordinate.key)) {
                void this.requestChunk(coordinate.x, coordinate.y, coordinate.distance).catch(error => {
                    if (error instanceof Error && error.name !== "AbortError") this.reportError(error);
                });
            }
        }
        this.evictOutsideRetention();
    }

    private requestChunk(chunkX: number, chunkY: number, priority: number): Promise<WorldChunk> {
        const key = WorldStreamer.key(chunkX, chunkY);
        const resident = this.residents.get(key);
        if (resident) return Promise.resolve(resident);
        const existing = this.pending.get(key);
        if (existing && !existing.controller.signal.aborted) return existing.promise;
        //An aborted promise settles on a microtask. A caller can move away and
        //back before its finally handler runs, so detach it now and allow the
        //new demand to create a fresh request for the same key.
        if (existing) this.pending.delete(key);

        const controller = new AbortController();
        let pending: PendingChunk;
        const promise = this.loadWithRetry(chunkX, chunkY, priority, controller.signal).then(chunk => {
            if (this.disposed || !this.wanted.has(key)) {
                this.source.releaseChunk(chunk);
                throw abortError("Chunk is no longer wanted");
            }
            this.residents.set(key, chunk);
            try {
                this.handlers.chunkLoaded(chunk);
            } catch (reason) {
                this.residents.delete(key);
                this.unload(chunk);
                throw reason;
            }
            this.completed += 1;
            this.enforceResidentLimit();
            return chunk;
        }).finally(() => {
            //A superseded aborted request must not delete its replacement.
            if (this.pending.get(key) === pending) this.pending.delete(key);
        });
        pending = { controller, promise };
        this.pending.set(key, pending);
        return promise;
    }

    private async loadWithRetry(
        chunkX: number,
        chunkY: number,
        priority: number,
        signal: AbortSignal
    ): Promise<WorldChunk> {
        for (let attempt = 0; ; attempt += 1) {
            try {
                const chunk = await this.source.loadChunk(chunkX, chunkY, { priority, signal });
                if (signal.aborted) {
                    this.source.releaseChunk(chunk);
                    throw abortError("Chunk load completed after cancellation");
                }
                try {
                    assertWorldChunk(this.source, chunk, chunkX, chunkY);
                } catch (reason) {
                    this.source.releaseChunk(chunk);
                    throw reason;
                }
                return chunk;
            } catch (reason) {
                const error = reason instanceof Error ? reason : new Error(String(reason));
                if (signal.aborted || error.name === "AbortError") throw error;
                if (error instanceof TypeError || attempt >= this.maxRetries) {
                    this.failed += 1;
                    throw error;
                }
                this.retried += 1;
                this.reportError(error);
                await waitForRetry(this.retryBaseDelayMs * 2 ** attempt, signal);
            }
        }
    }

    private evictOutsideRetention(): void {
        for (const [key, chunk] of this.residents) {
            const distance = this.source.chunkDistance(
                chunk.chunkX,
                chunk.chunkY,
                this.centerChunkX,
                this.centerChunkY
            );
            if (distance <= this.retentionRadius + 0.5) continue;
            this.residents.delete(key);
            this.unload(chunk);
        }
    }

    private enforceResidentLimit(): void {
        if (this.residents.size <= this.maxResidentChunks) return;
        const candidates = [...this.residents.entries()]
            .filter(([key]) => !this.wanted.has(key))
            .sort((a, b) => this.distanceFromCenter(b[1]) - this.distanceFromCenter(a[1]));
        while (this.residents.size > this.maxResidentChunks && candidates.length > 0) {
            const [key, chunk] = candidates.shift()!;
            this.residents.delete(key);
            this.unload(chunk);
        }
    }

    private distanceFromCenter(chunk: WorldChunk): number {
        return this.source.chunkDistance(chunk.chunkX, chunk.chunkY, this.centerChunkX, this.centerChunkY);
    }

    private unload(chunk: WorldChunk): void {
        try {
            this.handlers.chunkUnloading(chunk);
        } catch (reason) {
            this.reportError(reason);
        }
        try {
            this.source.releaseChunk(chunk);
        } catch (reason) {
            this.reportError(reason);
        }
    }

    private reportError(reason: unknown): void {
        try {
            this.handlers.error?.(reason instanceof Error ? reason : new Error(String(reason)));
        } catch {
            //An observer must not break retries or resource cleanup.
        }
    }

    public static key(chunkX: number, chunkY: number): string {
        return `${chunkX},${chunkY}`;
    }
}
