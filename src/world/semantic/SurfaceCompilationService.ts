import type { WorkLane } from "../../runtime/PriorityTaskQueue";
import { EffectiveWorldSnapshot } from "./EffectiveWorldView";
import {
    createTransferableEffectiveWindow,
    effectiveSurfaceWindowTransferables,
    surfaceHydrologyRegionRequirements,
    surfaceSemanticChunkRequirements,
    SurfaceWindowBufferAllocator,
    TransferableEffectiveWindow
} from "./EffectiveSurfaceWindow";
import {
    assertCompiledSurfaceChunk,
    CompiledSurfaceChunk
} from "./SurfaceCompiler";
import {
    RenderChunkKey,
    canonicalizeRenderChunkKey,
    serializeSurfaceDependencyKey,
    SurfaceDependencyBinding,
    SurfaceDependencyKey,
    SurfaceRequestToken,
    SurfaceRequestTracker,
    surfaceDependencyKeysEqual
} from "./SurfaceDependency";
import {
    SurfaceWorkerCompilation,
    SurfaceWorkerCompilationError
} from "./SurfaceWorkerProtocol";
import {
    serializeWorldDescriptorV2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";

export interface SurfaceCompilationWorkerRequestOptions {
    readonly priority?: number;
    readonly lane?: WorkLane;
    readonly weight?: number;
    readonly signal?: AbortSignal;
}

export interface SurfaceCompilationWorker {
    compileSurfaceChunk(
        effectiveWindow: TransferableEffectiveWindow,
        request?: SurfaceCompilationWorkerRequestOptions
    ): Promise<SurfaceWorkerCompilation>;
}

export interface SurfaceCompilationServiceOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly sessionEpoch: number;
    readonly worker: SurfaceCompilationWorker;
    readonly cpuCacheBudgetBytes: number;
    readonly retainedWindowBufferBudgetBytes: number;
}

export interface SurfaceCompilationRequestOptions {
    readonly priority?: number;
    readonly lane?: WorkLane;
    readonly weight?: number;
    readonly signal?: AbortSignal;
}

export interface ResidentSurfaceLease {
    readonly requestToken: SurfaceRequestToken;
    readonly effectiveRevision: number;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly chunk: CompiledSurfaceChunk;
    readonly released: boolean;
    isCurrent(): boolean;
    release(): boolean;
}

export interface ReadySurfaceCompilation {
    readonly status: "ready";
    readonly requestToken: SurfaceRequestToken;
    readonly lease: ResidentSurfaceLease;
}

export interface StaleSurfaceCompilation {
    readonly status: "stale";
    readonly requestToken: SurfaceRequestToken;
}

export type SurfaceCompilationOutcome = ReadySurfaceCompilation | StaleSurfaceCompilation;

export interface SurfaceCompilationRequest {
    readonly key: RenderChunkKey;
    readonly requestToken: SurfaceRequestToken;
    readonly result: Promise<SurfaceCompilationOutcome>;
    cancel(): boolean;
}

export interface SurfaceWindowBufferPoolStats {
    readonly state: "ready" | "disposed";
    readonly retainedBuffers: number;
    readonly retainedBytes: number;
    readonly retainedBudgetBytes: number;
    readonly allocations: number;
    readonly reuses: number;
    readonly discardedBuffers: number;
}

export interface SurfaceCompilationServiceStats {
    readonly state: "ready" | "disposed";
    readonly activeRequests: number;
    readonly activeLeases: number;
    readonly inFlightCompilations: number;
    readonly inFlightWindowBytes: number;
    readonly cacheEntries: number;
    readonly cacheBytes: number;
    readonly cacheBudgetBytes: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly cacheEvictions: number;
    readonly workerCompilations: number;
    readonly coalescedRequests: number;
    readonly acceptedResults: number;
    readonly staleResults: number;
    readonly cancelledRequests: number;
    readonly workerFailures: number;
    readonly windowBuffers: SurfaceWindowBufferPoolStats;
}

interface CompiledCacheEntry {
    readonly serializedKey: string;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly chunk: CompiledSurfaceChunk;
    readonly byteLength: number;
    leases: number;
}

interface CompilationJob {
    readonly dependencyKey: SurfaceDependencyKey;
    readonly controller: AbortController;
    readonly subscribers: Set<number>;
    readonly windowBytes: number;
    readonly promise: Promise<CompiledCacheEntry>;
}

interface ActiveSurfaceRequest {
    readonly key: RenderChunkKey;
    readonly requestToken: SurfaceRequestToken;
    readonly binding: SurfaceDependencyBinding;
    job?: CompilationJob;
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

function renderKeyString(key: RenderChunkKey): string {
    return `${key.chunkX},${key.chunkY}`;
}

function tokensEqual(first: SurfaceRequestToken, second: SurfaceRequestToken): boolean {
    return first.sessionEpoch === second.sessionEpoch
        && first.renderChunkGeneration === second.renderChunkGeneration;
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("Surface compilation request was aborted", "AbortError");
    }
    const error = new Error("Surface compilation request was aborted");
    error.name = "AbortError";
    return error;
}

function isAbortSignal(value: unknown): value is AbortSignal {
    if (!value || typeof value !== "object") return false;
    const signal = value as AbortSignal;
    return typeof signal.aborted === "boolean"
        && typeof signal.addEventListener === "function"
        && typeof signal.removeEventListener === "function";
}

export class SurfaceWindowBufferPool implements SurfaceWindowBufferAllocator {
    private readonly buffersByByteLength = new Map<number, ArrayBuffer[]>();
    private readonly retained = new Set<ArrayBuffer>();
    private retainedByteCount = 0;
    private allocationCount = 0;
    private reuseCount = 0;
    private discardedBufferCount = 0;
    private stateValue: "ready" | "disposed" = "ready";

    constructor(public readonly retainedBudgetBytes: number) {
        assertNonNegativeSafeInteger("surface window retained buffer budget", retainedBudgetBytes);
    }

    public acquire(byteLength: number): ArrayBuffer {
        if (this.stateValue === "disposed") throw new TypeError("surface window buffer pool is disposed");
        if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
            throw new RangeError("surface window buffer length must be a positive safe integer");
        }
        const bin = this.buffersByByteLength.get(byteLength);
        const reused = bin?.pop();
        if (reused) {
            this.retained.delete(reused);
            this.retainedByteCount -= byteLength;
            if (bin!.length === 0) this.buffersByByteLength.delete(byteLength);
            this.reuseCount += 1;
            return reused;
        }
        this.allocationCount += 1;
        return new ArrayBuffer(byteLength);
    }

    public release(buffers: readonly ArrayBuffer[]): void {
        if (!Array.isArray(buffers) || new Set(buffers).size !== buffers.length
            || buffers.some(buffer => !(buffer instanceof ArrayBuffer) || buffer.byteLength <= 0
                || this.retained.has(buffer))) {
            throw new TypeError("surface window buffer release contains invalid or duplicate buffers");
        }
        for (const buffer of buffers) {
            if (this.stateValue === "disposed"
                || this.retainedByteCount + buffer.byteLength > this.retainedBudgetBytes) {
                this.discardedBufferCount += 1;
                continue;
            }
            const bin = this.buffersByByteLength.get(buffer.byteLength) ?? [];
            bin.push(buffer);
            this.buffersByByteLength.set(buffer.byteLength, bin);
            this.retained.add(buffer);
            this.retainedByteCount += buffer.byteLength;
        }
    }

    public clear(): void {
        this.buffersByByteLength.clear();
        this.retained.clear();
        this.retainedByteCount = 0;
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        this.clear();
        this.stateValue = "disposed";
    }

    public get stats(): Readonly<SurfaceWindowBufferPoolStats> {
        return Object.freeze({
            state: this.stateValue,
            retainedBuffers: this.retained.size,
            retainedBytes: this.retainedByteCount,
            retainedBudgetBytes: this.retainedBudgetBytes,
            allocations: this.allocationCount,
            reuses: this.reuseCount,
            discardedBuffers: this.discardedBufferCount
        });
    }
}

export class SurfaceCompilationService {
    private readonly worldIdentity: string;
    private readonly requestTracker: SurfaceRequestTracker;
    private readonly worker: SurfaceCompilationWorker;
    private readonly cpuCacheBudgetBytes: number;
    private readonly windowBufferPool: SurfaceWindowBufferPool;
    private readonly activeByRenderKey = new Map<string, ActiveSurfaceRequest>();
    private readonly jobsByDependency = new Map<string, CompilationJob>();
    private readonly cacheByDependency = new Map<string, CompiledCacheEntry>();
    private readonly liveLeaseReleasers = new Set<() => void>();
    private cacheByteCount = 0;
    private activeLeaseCount = 0;
    private cacheHitCount = 0;
    private cacheMissCount = 0;
    private cacheEvictionCount = 0;
    private workerCompilationCount = 0;
    private coalescedRequestCount = 0;
    private acceptedResultCount = 0;
    private staleResultCount = 0;
    private cancelledRequestCount = 0;
    private workerFailureCount = 0;
    private latestEffectiveRevision = -1;
    private disposed = false;

    constructor(options: SurfaceCompilationServiceOptions) {
        if (!options || typeof options !== "object"
            || Object.getOwnPropertyNames(options).some(name => ![
                "descriptor", "sessionEpoch", "worker", "cpuCacheBudgetBytes",
                "retainedWindowBufferBudgetBytes"
            ].includes(name))
            || !options.worker || typeof options.worker.compileSurfaceChunk !== "function") {
            throw new TypeError("surface compilation service options are invalid");
        }
        assertNonNegativeSafeInteger("surface compiled CPU cache budget", options.cpuCacheBudgetBytes);
        this.worldIdentity = serializeWorldDescriptorV2(options.descriptor);
        this.requestTracker = new SurfaceRequestTracker(options.descriptor, options.sessionEpoch);
        this.worker = options.worker;
        this.cpuCacheBudgetBytes = options.cpuCacheBudgetBytes;
        this.windowBufferPool = new SurfaceWindowBufferPool(options.retainedWindowBufferBudgetBytes);
    }

    public request(
        snapshot: EffectiveWorldSnapshot,
        renderKey: RenderChunkKey,
        options: SurfaceCompilationRequestOptions = {}
    ): Readonly<SurfaceCompilationRequest> {
        this.assertReady();
        this.assertRequestOptions(options);
        if (snapshot.worldIdentity !== this.worldIdentity) {
            throw new TypeError("surface compilation request belongs to another world identity");
        }
        if (snapshot.effectiveRevision < this.latestEffectiveRevision) {
            throw new RangeError("surface compilation request cannot move effective revision backwards");
        }
        if (options.signal?.aborted) throw abortError();

        const effectiveWindow = createTransferableEffectiveWindow(snapshot, renderKey, {
            bufferAllocator: this.windowBufferPool
        });
        this.latestEffectiveRevision = snapshot.effectiveRevision;
        const key = effectiveWindow.key;
        const keyString = renderKeyString(key);
        const serializedKey = serializeSurfaceDependencyKey(effectiveWindow.dependencyKey);
        const binding: SurfaceDependencyBinding = Object.freeze({
            effectiveRevision: effectiveWindow.effectiveRevision,
            dependencyKey: effectiveWindow.dependencyKey
        });
        const requestToken = this.requestTracker.issue(key);
        const cached = this.findCacheEntry(serializedKey, effectiveWindow.dependencyKey);
        let job: CompilationJob | undefined;
        let entryPromise: Promise<CompiledCacheEntry>;
        if (cached) {
            this.cacheHitCount += 1;
            this.windowBufferPool.release(effectiveSurfaceWindowTransferables(effectiveWindow));
            entryPromise = Promise.resolve(cached);
        } else {
            this.cacheMissCount += 1;
            job = this.jobsByDependency.get(serializedKey);
            if (job) {
                if (!surfaceDependencyKeysEqual(job.dependencyKey, effectiveWindow.dependencyKey)) {
                    this.windowBufferPool.release(effectiveSurfaceWindowTransferables(effectiveWindow));
                    throw new TypeError("serialized surface dependency key collision");
                }
                this.coalescedRequestCount += 1;
                this.windowBufferPool.release(effectiveSurfaceWindowTransferables(effectiveWindow));
            } else {
                job = this.createCompilationJob(effectiveWindow, serializedKey, options);
            }
            job.subscribers.add(requestToken.renderChunkGeneration);
            entryPromise = job.promise;
        }

        const previous = this.activeByRenderKey.get(keyString);
        if (previous?.job) this.removeJobSubscriber(previous.job, previous.requestToken);
        const active: ActiveSurfaceRequest = { key, requestToken, binding, job };
        this.activeByRenderKey.set(keyString, active);

        let leaseValue: ResidentSurfaceLease | undefined;
        const result = entryPromise.then(entry => {
            job?.subscribers.delete(requestToken.renderChunkGeneration);
            active.job = undefined;
            if (!this.isCurrentActive(keyString, requestToken, binding, entry.chunk)) {
                this.staleResultCount += 1;
                return Object.freeze({ status: "stale" as const, requestToken });
            }
            leaseValue = this.createLease(entry, active);
            this.acceptedResultCount += 1;
            return Object.freeze({ status: "ready" as const, requestToken, lease: leaseValue });
        }).catch(reason => {
            job?.subscribers.delete(requestToken.renderChunkGeneration);
            active.job = undefined;
            if (this.disposed) throw new Error("surface compilation service is disposed");
            const current = this.activeByRenderKey.get(keyString);
            if (!current || !tokensEqual(current.requestToken, requestToken)) {
                this.staleResultCount += 1;
                return Object.freeze({ status: "stale" as const, requestToken });
            }
            this.activeByRenderKey.delete(keyString);
            this.requestTracker.release(key, requestToken);
            throw reason;
        });

        const abort = options.signal ? () => {
            if (!leaseValue && this.cancelPending(keyString, active)) {
                this.cancelledRequestCount += 1;
            } else if (leaseValue?.release()) {
                this.cancelledRequestCount += 1;
            }
        } : undefined;
        options.signal?.addEventListener("abort", abort!, { once: true });
        const removeAbortListener = (): void => {
            if (abort) options.signal?.removeEventListener("abort", abort);
        };
        void result.then(removeAbortListener, removeAbortListener);

        return Object.freeze({
            key,
            requestToken,
            result,
            cancel: () => {
                if (leaseValue) return leaseValue.release();
                const cancelled = this.cancelPending(keyString, active);
                if (cancelled) this.cancelledRequestCount += 1;
                return cancelled;
            }
        });
    }

    public requestBatch(
        snapshot: EffectiveWorldSnapshot,
        renderKeys: readonly RenderChunkKey[],
        options: SurfaceCompilationRequestOptions = {}
    ): readonly Readonly<SurfaceCompilationRequest>[] {
        this.assertReady();
        this.assertRequestOptions(options);
        if (!Array.isArray(renderKeys) || renderKeys.length === 0) {
            throw new TypeError("surface compilation batch requires render chunk keys");
        }
        const canonicalKeys = renderKeys.map(key => canonicalizeRenderChunkKey(snapshot.descriptor, key));
        const serializedRenderKeys = canonicalKeys.map(renderKeyString);
        if (new Set(serializedRenderKeys).size !== serializedRenderKeys.length) {
            throw new TypeError("surface compilation batch contains duplicate render chunk keys");
        }
        const exactSnapshots = canonicalKeys.map(key => new EffectiveWorldSnapshot(
            snapshot.descriptor,
            snapshot.worldIdentity,
            snapshot.effectiveRevision,
            Object.freeze(surfaceSemanticChunkRequirements(snapshot.descriptor, key)
                .map(required => snapshot.getSemanticChunk(required))),
            Object.freeze(surfaceHydrologyRegionRequirements(snapshot.descriptor, key)
                .map(required => snapshot.getHydrologyRegion(required)))
        ));
        const requests: Readonly<SurfaceCompilationRequest>[] = [];
        try {
            for (let index = 0; index < canonicalKeys.length; index += 1) {
                requests.push(this.request(exactSnapshots[index], canonicalKeys[index], options));
            }
            return Object.freeze(requests);
        } catch (reason) {
            for (const request of requests) request.cancel();
            throw reason;
        }
    }

    public invalidate(renderKeys: readonly RenderChunkKey[]): number {
        this.assertReady();
        if (!Array.isArray(renderKeys)) throw new TypeError("surface invalidation keys must be an array");
        let invalidated = 0;
        for (const renderKey of renderKeys) {
            const canonical = canonicalizeRenderChunkKey(this.requestTracker.descriptor, renderKey);
            const serialized = renderKeyString(canonical);
            const active = this.activeByRenderKey.get(serialized);
            if (!active) continue;
            this.activeByRenderKey.delete(serialized);
            this.requestTracker.release(active.key, active.requestToken);
            if (active.job) this.removeJobSubscriber(active.job, active.requestToken);
            invalidated += 1;
        }
        return invalidated;
    }

    public clearUnusedCache(): number {
        this.assertReady();
        let removed = 0;
        for (const entry of [...this.cacheByDependency.values()]) {
            if (entry.leases !== 0) continue;
            this.deleteCacheEntry(entry);
            removed += 1;
        }
        return removed;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const job of this.jobsByDependency.values()) job.controller.abort();
        this.jobsByDependency.clear();
        this.activeByRenderKey.clear();
        this.requestTracker.dispose();
        for (const release of [...this.liveLeaseReleasers]) release();
        this.liveLeaseReleasers.clear();
        this.cacheByDependency.clear();
        this.cacheByteCount = 0;
        this.windowBufferPool.dispose();
    }

    public get stats(): Readonly<SurfaceCompilationServiceStats> {
        let inFlightWindowBytes = 0;
        for (const job of this.jobsByDependency.values()) inFlightWindowBytes += job.windowBytes;
        return Object.freeze({
            state: this.disposed ? "disposed" : "ready",
            activeRequests: this.activeByRenderKey.size,
            activeLeases: this.activeLeaseCount,
            inFlightCompilations: this.jobsByDependency.size,
            inFlightWindowBytes,
            cacheEntries: this.cacheByDependency.size,
            cacheBytes: this.cacheByteCount,
            cacheBudgetBytes: this.cpuCacheBudgetBytes,
            cacheHits: this.cacheHitCount,
            cacheMisses: this.cacheMissCount,
            cacheEvictions: this.cacheEvictionCount,
            workerCompilations: this.workerCompilationCount,
            coalescedRequests: this.coalescedRequestCount,
            acceptedResults: this.acceptedResultCount,
            staleResults: this.staleResultCount,
            cancelledRequests: this.cancelledRequestCount,
            workerFailures: this.workerFailureCount,
            windowBuffers: this.windowBufferPool.stats
        });
    }

    private createCompilationJob(
        effectiveWindow: TransferableEffectiveWindow,
        serializedKey: string,
        options: SurfaceCompilationRequestOptions
    ): CompilationJob {
        const sourceBuffers = effectiveSurfaceWindowTransferables(effectiveWindow);
        const windowBytes = sourceBuffers.reduce((total, buffer) => total + buffer.byteLength, 0);
        const controller = new AbortController();
        const subscribers = new Set<number>();
        const job = {} as CompilationJob;
        let buffersReclaimed = false;
        const promise = Promise.resolve().then(() => this.worker.compileSurfaceChunk(effectiveWindow, {
            priority: options.priority,
            lane: options.lane,
            weight: options.weight,
            signal: controller.signal
        })).then(result => {
            this.windowBufferPool.release(result.reclaimedWindowBuffers);
            buffersReclaimed = true;
            assertCompiledSurfaceChunk(result.chunk);
            if (!surfaceDependencyKeysEqual(result.chunk.dependencyKey, effectiveWindow.dependencyKey)) {
                throw new TypeError("surface compilation worker returned a mismatched dependency key");
            }
            return this.storeCacheEntry(result.chunk);
        }).catch(reason => {
            if (!buffersReclaimed && reason instanceof SurfaceWorkerCompilationError) {
                this.windowBufferPool.release(reason.reclaimedWindowBuffers);
                buffersReclaimed = true;
            } else if (!buffersReclaimed) {
                const attached = sourceBuffers.filter(buffer => buffer.byteLength > 0);
                if (attached.length > 0) {
                    this.windowBufferPool.release(attached);
                    buffersReclaimed = true;
                }
            }
            if (!(reason instanceof Error && reason.name === "AbortError")) {
                this.workerFailureCount += 1;
            }
            throw reason;
        }).finally(() => {
            if (this.jobsByDependency.get(serializedKey) === job) {
                this.jobsByDependency.delete(serializedKey);
            }
        });
        Object.assign(job, {
            dependencyKey: effectiveWindow.dependencyKey,
            controller,
            subscribers,
            windowBytes,
            promise
        });
        this.jobsByDependency.set(serializedKey, job);
        this.workerCompilationCount += 1;
        return job;
    }

    private findCacheEntry(
        serializedKey: string,
        dependencyKey: SurfaceDependencyKey
    ): CompiledCacheEntry | undefined {
        const entry = this.cacheByDependency.get(serializedKey);
        if (!entry) return undefined;
        if (!surfaceDependencyKeysEqual(entry.dependencyKey, dependencyKey)) {
            throw new TypeError("serialized surface dependency key collision");
        }
        this.cacheByDependency.delete(serializedKey);
        this.cacheByDependency.set(serializedKey, entry);
        return entry;
    }

    private storeCacheEntry(chunk: CompiledSurfaceChunk): CompiledCacheEntry {
        if (this.disposed) throw new Error("surface compilation service is disposed");
        const serializedKey = serializeSurfaceDependencyKey(chunk.dependencyKey);
        const existing = this.findCacheEntry(serializedKey, chunk.dependencyKey);
        if (existing) return existing;
        if (chunk.byteLength > this.cpuCacheBudgetBytes) {
            throw new RangeError("compiled surface chunk exceeds the CPU cache byte budget");
        }
        while (this.cacheByteCount + chunk.byteLength > this.cpuCacheBudgetBytes) {
            const candidate = [...this.cacheByDependency.values()].find(entry => entry.leases === 0);
            if (!candidate) {
                throw new RangeError("compiled surface CPU cache budget is exhausted by active leases");
            }
            this.deleteCacheEntry(candidate);
            this.cacheEvictionCount += 1;
        }
        const entry: CompiledCacheEntry = {
            serializedKey,
            dependencyKey: chunk.dependencyKey,
            chunk,
            byteLength: chunk.byteLength,
            leases: 0
        };
        this.cacheByDependency.set(serializedKey, entry);
        this.cacheByteCount += entry.byteLength;
        return entry;
    }

    private deleteCacheEntry(entry: CompiledCacheEntry): void {
        if (this.cacheByDependency.get(entry.serializedKey) !== entry) return;
        this.cacheByDependency.delete(entry.serializedKey);
        this.cacheByteCount -= entry.byteLength;
    }

    private createLease(entry: CompiledCacheEntry, active: ActiveSurfaceRequest): ResidentSurfaceLease {
        entry.leases += 1;
        this.activeLeaseCount += 1;
        let released = false;
        let lease: ResidentSurfaceLease;
        const releaseInternal = (): void => {
            if (released) return;
            released = true;
            entry.leases -= 1;
            this.activeLeaseCount -= 1;
            this.liveLeaseReleasers.delete(releaseInternal);
            const keyString = renderKeyString(active.key);
            const current = this.activeByRenderKey.get(keyString);
            if (current && tokensEqual(current.requestToken, active.requestToken)) {
                this.activeByRenderKey.delete(keyString);
                this.requestTracker.release(active.key, active.requestToken);
            }
        };
        lease = Object.freeze({
            requestToken: active.requestToken,
            effectiveRevision: active.binding.effectiveRevision,
            dependencyKey: entry.dependencyKey,
            chunk: entry.chunk,
            get released(): boolean { return released; },
            isCurrent: () => !released && this.requestTracker.isCurrent(active.key, active.requestToken),
            release: () => {
                if (released) return false;
                releaseInternal();
                return true;
            }
        });
        this.liveLeaseReleasers.add(releaseInternal);
        return lease;
    }

    private isCurrentActive(
        keyString: string,
        requestToken: SurfaceRequestToken,
        binding: SurfaceDependencyBinding,
        chunk: CompiledSurfaceChunk
    ): boolean {
        const current = this.activeByRenderKey.get(keyString);
        if (!current || !tokensEqual(current.requestToken, requestToken)) return false;
        return this.requestTracker.canAccept(current.key, {
            requestToken,
            effectiveRevision: chunk.effectiveRevision,
            dependencyKey: chunk.dependencyKey
        }, binding);
    }

    private cancelPending(keyString: string, active: ActiveSurfaceRequest): boolean {
        const current = this.activeByRenderKey.get(keyString);
        if (!current || !tokensEqual(current.requestToken, active.requestToken)) return false;
        this.activeByRenderKey.delete(keyString);
        this.requestTracker.release(active.key, active.requestToken);
        if (active.job) this.removeJobSubscriber(active.job, active.requestToken);
        return true;
    }

    private removeJobSubscriber(job: CompilationJob, token: SurfaceRequestToken): void {
        job.subscribers.delete(token.renderChunkGeneration);
        if (job.subscribers.size === 0) job.controller.abort();
    }

    private assertRequestOptions(options: SurfaceCompilationRequestOptions): void {
        if (!options || typeof options !== "object"
            || Object.getOwnPropertyNames(options).some(name => ![
                "priority", "lane", "weight", "signal"
            ].includes(name))
            || options.priority !== undefined && !Number.isFinite(options.priority)
            || options.lane !== undefined && ![
                "critical", "interactive", "visible", "prefetch", "background"
            ].includes(options.lane)
            || options.weight !== undefined && (!Number.isSafeInteger(options.weight) || options.weight <= 0)
            || options.signal !== undefined && !isAbortSignal(options.signal)) {
            throw new TypeError("surface compilation request options are invalid");
        }
    }

    private assertReady(): void {
        if (this.disposed) throw new TypeError("surface compilation service is disposed");
    }
}
