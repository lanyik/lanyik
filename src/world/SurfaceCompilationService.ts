import {
    CompiledSurfaceChunk,
    assertCompiledSurfaceChunk,
    compiledSurfaceChunkResidentBytes
} from "./CompiledSurfaceChunk";
import { EffectiveWorldView } from "./EffectiveWorldView";
import {
    RenderChunkKey,
    SurfaceCompileMetrics,
    SurfaceRequestToken,
    createSurfaceRequestToken,
    serializeSurfaceDependencyKey,
    surfaceDependencyKeysEqual,
    surfaceRequestTokensEqual
} from "./SurfaceDependencyKey";
import { SurfaceCompileResult } from "./SurfaceWorkerClient";
import { SurfaceTaskRequestOptions } from "./SurfaceWorkerPool";
import {
    TransferableEffectiveWindow,
    buildTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

export interface SurfaceCompilationPool {
    compileSurfaceChunk(
        options: Readonly<{
            requestToken: SurfaceRequestToken;
            effectiveWindow: TransferableEffectiveWindow;
        }>,
        request?: Readonly<SurfaceTaskRequestOptions>
    ): Promise<SurfaceCompileResult>;
}

export interface SurfaceCompilationServiceOptions {
    readonly worldIdentity: string;
    readonly sessionEpoch: number;
    readonly cacheMaxBytes: number;
    readonly pool: SurfaceCompilationPool;
}

export interface SurfaceCompilationRequest {
    readonly view: EffectiveWorldView;
    readonly key: RenderChunkKey;
    readonly metrics: SurfaceCompileMetrics;
    readonly task?: Readonly<SurfaceTaskRequestOptions>;
}

export interface ResidentSurfaceLease {
    readonly requestToken: SurfaceRequestToken;
    readonly chunk: CompiledSurfaceChunk;
    readonly released: boolean;
    release(): void;
}

export interface SurfaceCompilationServiceStats {
    readonly residentChunks: number;
    readonly residentBytes: number;
    readonly activeLeases: number;
    readonly inFlightRequests: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly completedCompilations: number;
    readonly staleResults: number;
    readonly evictions: number;
}

interface CacheEntry {
    readonly serializedDependencyKey: string;
    readonly chunk: CompiledSurfaceChunk;
    readonly residentBytes: number;
    leases: number;
}

interface ActiveDemand {
    readonly keyIdentity: string;
    readonly key: RenderChunkKey;
    readonly requestToken: SurfaceRequestToken;
    readonly controller: AbortController;
    serializedDependencyKey?: string;
    lease?: ResidentSurfaceLeaseImpl;
}

function abortError(message: string): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

function keyIdentity(key: Readonly<RenderChunkKey>): string {
    chunkOrigin(key.chunkX, key.chunkY, SURFACE_COMPILE_PROFILE.renderChunkSize);
    return `${key.chunkX}:${key.chunkY}`;
}

function assertMetrics(metrics: Readonly<SurfaceCompileMetrics>): void {
    if (!metrics || typeof metrics !== "object"
        || !Number.isFinite(metrics.hexSize) || metrics.hexSize <= 0
        || !Number.isFinite(metrics.heightScale) || metrics.heightScale <= 0) {
        throw new RangeError("surface compilation metrics must use positive finite scales");
    }
}

export class StaleSurfaceCompilationError extends Error {
    public readonly name = "StaleSurfaceCompilationError";

    constructor(public readonly key: RenderChunkKey, message = "surface compilation is no longer current") {
        super(message);
    }
}

export class SurfaceLeaseNotCurrentError extends Error {
    public readonly name = "SurfaceLeaseNotCurrentError";

    constructor(public readonly key: RenderChunkKey) {
        super("resident surface lease is released, foreign, or no longer current");
    }
}

class ResidentSurfaceLeaseImpl implements ResidentSurfaceLease {
    private isReleased = false;

    constructor(
        public readonly requestToken: SurfaceRequestToken,
        public readonly chunk: CompiledSurfaceChunk,
        public readonly owner: SurfaceCompilationService,
        public readonly entry: CacheEntry,
        private readonly onRelease: (lease: ResidentSurfaceLeaseImpl) => void
    ) {}

    public get released(): boolean { return this.isReleased; }

    public release(): void {
        if (this.isReleased) return;
        this.isReleased = true;
        this.onRelease(this);
    }
}

// Owns request generations and the compiled CPU cache for exactly one world
// session. EffectiveWorldView is supplied per request so unaffected dependency
// keys can survive immutable edit snapshots without weakening acceptance.
export class SurfaceCompilationService {
    private readonly pool: SurfaceCompilationPool;
    private readonly worldIdentity: string;
    private readonly sessionEpoch: number;
    private readonly cacheMaxBytes: number;
    private readonly activeDemands = new Map<string, ActiveDemand>();
    private readonly cache = new Map<string, CacheEntry>();
    private nextGeneration = 1;
    private residentBytes = 0;
    private activeLeases = 0;
    private inFlightRequests = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private completedCompilations = 0;
    private staleResults = 0;
    private evictions = 0;
    private disposed = false;

    constructor(options: Readonly<SurfaceCompilationServiceOptions>) {
        if (!options || typeof options !== "object") {
            throw new TypeError("surface compilation service options are required");
        }
        if (typeof options.worldIdentity !== "string" || options.worldIdentity.length === 0
            || options.worldIdentity.length > 16_384) {
            throw new TypeError("surface compilation service world identity is required");
        }
        createSurfaceRequestToken(options.sessionEpoch, 0);
        if (!Number.isSafeInteger(options.cacheMaxBytes) || options.cacheMaxBytes <= 0) {
            throw new RangeError("surface compilation cache budget must be a positive safe integer");
        }
        if (!options.pool || typeof options.pool.compileSurfaceChunk !== "function") {
            throw new TypeError("surface compilation pool is required");
        }
        this.pool = options.pool;
        this.worldIdentity = options.worldIdentity;
        this.sessionEpoch = options.sessionEpoch;
        this.cacheMaxBytes = options.cacheMaxBytes;
    }

    public requestSurface(
        request: Readonly<SurfaceCompilationRequest>
    ): Promise<ResidentSurfaceLease> {
        if (this.disposed) return Promise.reject(new Error("SurfaceCompilationService has been disposed"));
        try {
            this.assertRequest(request);
        } catch (reason) {
            return Promise.reject(reason);
        }
        if (request.task?.signal?.aborted) {
            return Promise.reject(abortError("surface compilation request was aborted"));
        }

        if (!Number.isSafeInteger(this.nextGeneration)) {
            return Promise.reject(new RangeError("surface render chunk generation space is exhausted"));
        }
        const requestSnapshot: SurfaceCompilationRequest = Object.freeze({
            view: request.view,
            key: Object.freeze({ chunkX: request.key.chunkX, chunkY: request.key.chunkY }),
            metrics: Object.freeze({
                hexSize: request.metrics.hexSize,
                heightScale: request.metrics.heightScale
            }),
            task: request.task ? Object.freeze({ ...request.task }) : undefined
        });
        const identity = keyIdentity(requestSnapshot.key);
        const requestToken = createSurfaceRequestToken(this.sessionEpoch, this.nextGeneration);
        this.nextGeneration += 1;
        this.activeDemands.get(identity)?.controller.abort();

        const controller = new AbortController();
        const demand: ActiveDemand = {
            keyIdentity: identity,
            key: requestSnapshot.key,
            requestToken,
            controller
        };
        this.activeDemands.set(identity, demand);
        const externalSignal = requestSnapshot.task?.signal;
        const abortFromExternal = (): void => controller.abort();
        externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
        this.inFlightRequests += 1;

        return this.fulfillRequest(requestSnapshot, demand, controller.signal).finally(() => {
            externalSignal?.removeEventListener("abort", abortFromExternal);
            this.inFlightRequests -= 1;
            if (!demand.lease && this.activeDemands.get(identity) === demand) {
                this.activeDemands.delete(identity);
            }
        });
    }

    public isCurrent(lease: Readonly<ResidentSurfaceLease>): boolean {
        if (this.disposed || !(lease instanceof ResidentSurfaceLeaseImpl)
            || lease.owner !== this || lease.released) return false;
        const identity = keyIdentity(lease.chunk.key);
        const demand = this.activeDemands.get(identity);
        return demand?.lease === lease
            && surfaceRequestTokensEqual(demand.requestToken, lease.requestToken)
            && demand.serializedDependencyKey === lease.entry.serializedDependencyKey;
    }

    public assertCurrent(lease: Readonly<ResidentSurfaceLease>): CompiledSurfaceChunk {
        if (!this.isCurrent(lease)) throw new SurfaceLeaseNotCurrentError(lease.chunk.key);
        return lease.chunk;
    }

    public invalidate(key: Readonly<RenderChunkKey>): void {
        if (this.disposed) throw new Error("SurfaceCompilationService has been disposed");
        const identity = keyIdentity(key);
        const demand = this.activeDemands.get(identity);
        if (!demand) return;
        demand.controller.abort();
        this.activeDemands.delete(identity);
    }

    public get stats(): Readonly<SurfaceCompilationServiceStats> {
        return Object.freeze({
            residentChunks: this.cache.size,
            residentBytes: this.residentBytes,
            activeLeases: this.activeLeases,
            inFlightRequests: this.inFlightRequests,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            completedCompilations: this.completedCompilations,
            staleResults: this.staleResults,
            evictions: this.evictions
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const demand of this.activeDemands.values()) demand.controller.abort();
        this.activeDemands.clear();
        this.cache.clear();
        this.residentBytes = 0;
    }

    private releaseLease(lease: ResidentSurfaceLeaseImpl): void {
        if (lease.owner !== this || lease.entry.leases <= 0 || this.activeLeases <= 0) {
            throw new Error("resident surface lease release does not match this service");
        }
        lease.entry.leases -= 1;
        this.activeLeases -= 1;
        const identity = keyIdentity(lease.chunk.key);
        if (this.activeDemands.get(identity)?.lease === lease) {
            this.activeDemands.delete(identity);
        }
        if (!this.disposed) this.evictToBudget();
    }

    private assertRequest(request: Readonly<SurfaceCompilationRequest>): void {
        if (!request || typeof request !== "object" || !(request.view instanceof EffectiveWorldView)) {
            throw new TypeError("surface compilation request requires an EffectiveWorldView");
        }
        if (request.view.worldIdentity !== this.worldIdentity) {
            throw new TypeError("surface compilation request belongs to a different world session");
        }
        keyIdentity(request.key);
        assertMetrics(request.metrics);
        if (request.task && typeof request.task !== "object") {
            throw new TypeError("surface compilation task options are invalid");
        }
    }

    private async fulfillRequest(
        request: Readonly<SurfaceCompilationRequest>,
        demand: ActiveDemand,
        signal: AbortSignal
    ): Promise<ResidentSurfaceLease> {
        let window: TransferableEffectiveWindow;
        try {
            window = await buildTransferableEffectiveWindow({
                view: request.view,
                renderKey: request.key,
                metrics: request.metrics,
                request: { ...request.task, signal }
            });
        } catch (reason) {
            this.throwCurrentFailure(demand, signal, reason);
        }
        this.assertDemandCurrent(demand);
        const serializedDependencyKey = serializeSurfaceDependencyKey(window!.dependencyKey);
        demand.serializedDependencyKey = serializedDependencyKey;

        const cached = this.cache.get(serializedDependencyKey);
        if (cached) {
            this.cacheHits += 1;
            this.touch(cached);
            return this.createLease(demand, cached);
        }
        this.cacheMisses += 1;

        let result: SurfaceCompileResult;
        try {
            result = await this.pool.compileSurfaceChunk({
                requestToken: demand.requestToken,
                effectiveWindow: window!
            }, { ...request.task, signal });
        } catch (reason) {
            this.throwCurrentFailure(demand, signal, reason);
        }
        this.assertDemandCurrent(demand);
        assertCompiledSurfaceChunk(result!.chunk);
        if (!surfaceRequestTokensEqual(result!.requestToken, demand.requestToken)) {
            this.staleResults += 1;
            throw new StaleSurfaceCompilationError(
                result!.chunk.key,
                "surface compile result returned a mismatched request token"
            );
        }
        if (!surfaceDependencyKeysEqual(result!.chunk.dependencyKey, window!.dependencyKey)
            || serializeSurfaceDependencyKey(result!.chunk.dependencyKey) !== serializedDependencyKey) {
            this.staleResults += 1;
            throw new StaleSurfaceCompilationError(
                result!.chunk.key,
                "surface compile result returned a mismatched dependency key"
            );
        }

        const entry: CacheEntry = {
            serializedDependencyKey,
            chunk: result!.chunk,
            residentBytes: compiledSurfaceChunkResidentBytes(result!.chunk),
            leases: 0
        };
        this.cache.set(serializedDependencyKey, entry);
        this.residentBytes += entry.residentBytes;
        this.completedCompilations += 1;
        const lease = this.createLease(demand, entry);
        this.evictToBudget();
        return lease;
    }

    private throwCurrentFailure(demand: ActiveDemand, signal: AbortSignal, reason: unknown): never {
        if (!this.demandIsCurrent(demand)) {
            this.staleResults += 1;
            throw new StaleSurfaceCompilationError(demand.key);
        }
        if (signal.aborted) throw abortError("surface compilation request was aborted");
        throw reason instanceof Error ? reason : new Error(String(reason));
    }

    private assertDemandCurrent(demand: ActiveDemand): void {
        if (!this.demandIsCurrent(demand)) {
            this.staleResults += 1;
            throw new StaleSurfaceCompilationError(demand.key);
        }
        if (demand.controller.signal.aborted) {
            throw abortError("surface compilation request was aborted");
        }
    }

    private demandIsCurrent(demand: ActiveDemand): boolean {
        return !this.disposed && this.activeDemands.get(demand.keyIdentity) === demand;
    }

    private createLease(demand: ActiveDemand, entry: CacheEntry): ResidentSurfaceLeaseImpl {
        this.assertDemandCurrent(demand);
        const lease = new ResidentSurfaceLeaseImpl(
            demand.requestToken,
            entry.chunk,
            this,
            entry,
            released => this.releaseLease(released)
        );
        entry.leases += 1;
        this.activeLeases += 1;
        demand.lease = lease;
        return lease;
    }

    private touch(entry: CacheEntry): void {
        this.cache.delete(entry.serializedDependencyKey);
        this.cache.set(entry.serializedDependencyKey, entry);
    }

    private evictToBudget(): void {
        if (this.residentBytes <= this.cacheMaxBytes) return;
        for (const [serializedDependencyKey, entry] of this.cache) {
            if (this.residentBytes <= this.cacheMaxBytes) break;
            if (entry.leases !== 0) continue;
            this.cache.delete(serializedDependencyKey);
            this.residentBytes -= entry.residentBytes;
            this.evictions += 1;
        }
    }
}
