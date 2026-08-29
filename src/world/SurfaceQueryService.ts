import { positiveModulo } from "../helpers/topology";
import {
    CompiledSurfaceSampler,
    MutableCompiledSurfaceSample,
    createCompiledSurfaceSample
} from "./CompiledSurfaceSampler";
import { CompiledSurfaceChunk } from "./CompiledSurfaceChunk";
import { CompiledWaterBodyKind } from "./CompiledWaterBodyPalette";
import { EffectiveWorldView } from "./EffectiveWorldView";
import {
    HydrologyWorldSource,
    assertHydrologyWorldSource
} from "./HydrologyWorldSource";
import {
    SemanticWorldSource,
    assertSemanticWorldSource
} from "./SemanticWorldSource";
import { SurfaceCompileMetrics } from "./SurfaceDependencyKey";
import {
    ResidentSurfaceLease,
    StaleSurfaceCompilationError,
    SurfaceCompilationService,
    SurfaceLeaseNotCurrentError
} from "./SurfaceCompilationService";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";
import {
    SurfaceRenderChunkLocation,
    surfaceRenderChunkLocation,
    worldToSurface
} from "./SurfaceLattice";
import { SurfaceDeltaSnapshot, SurfaceDeltaStore } from "./SurfaceDeltaStore";
import { WorldDescriptorV2 } from "./WorldDescriptorV2";

export const MAX_SURFACE_QUERY_REVISION_ATTEMPTS = 4;

export interface SurfaceQueryServiceOptions {
    readonly store: SurfaceDeltaStore;
    readonly semanticSource: SemanticWorldSource;
    readonly hydrologySource: HydrologyWorldSource;
    readonly compilation: SurfaceCompilationService;
    readonly metrics: SurfaceCompileMetrics;
}

export interface SurfaceQueryRequestOptions {
    readonly signal?: AbortSignal;
}

export interface SurfaceWaterQueryResult {
    readonly bodyId: string;
    readonly kind: CompiledWaterBodyKind;
    readonly profileIndex: number;
    readonly level: number;
    readonly depth: number;
    readonly coverage: number;
    readonly flow: readonly [number, number];
}

export interface SurfaceQueryResult {
    readonly effectiveRevision: number;
    readonly logicalU: number;
    readonly logicalV: number;
    readonly renderKey: Readonly<{ chunkX: number; chunkY: number }>;
    readonly groundHeight: number;
    readonly shorelineDistance: number;
    readonly materialWeights: readonly [number, number, number, number];
    readonly water: SurfaceWaterQueryResult | null;
}

export interface SurfaceQueryServiceStats {
    readonly pendingChunks: number;
    readonly pendingWaiters: number;
    readonly completedQueries: number;
    readonly sharedWaits: number;
    readonly retainedCurrentLeases: number;
    readonly compilationRequests: number;
    readonly revisionRetries: number;
    readonly supersededFailures: number;
}

export class SurfaceQuerySupersededError extends Error {
    public readonly name = "SurfaceQuerySupersededError";

    constructor(public readonly attempts: number = MAX_SURFACE_QUERY_REVISION_ATTEMPTS) {
        super(`surface query could not observe a current revision after ${attempts} attempts`);
    }
}

class QueryCandidateSupersededError extends Error {
    public readonly name = "QueryCandidateSupersededError";
}

interface ReadyQueryChunk {
    readonly lease: ResidentSurfaceLease;
    readonly sampler: CompiledSurfaceSampler;
}

interface PendingQueryChunk {
    readonly snapshot: SurfaceDeltaSnapshot;
    readonly location: SurfaceRenderChunkLocation;
    readonly controller: AbortController;
    promise: Promise<ReadyQueryChunk>;
    waiters: number;
    ready?: ReadyQueryChunk;
    closed: boolean;
}

function abortError(message: string): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

function assertMetrics(metrics: Readonly<SurfaceCompileMetrics>): void {
    if (!metrics || typeof metrics !== "object"
        || !Number.isFinite(metrics.hexSize) || metrics.hexSize <= 0
        || !Number.isFinite(metrics.heightScale) || metrics.heightScale <= 0) {
        throw new RangeError("surface query metrics must use positive finite scales");
    }
}

function canonicalAxis(
    descriptor: Readonly<WorldDescriptorV2>,
    name: string,
    coordinate: number,
    axis: "width" | "height"
): number {
    if (!Number.isFinite(coordinate)) throw new RangeError(`${name} must be finite`);
    if (descriptor.sourceKind === "procedural-infinite") return coordinate;
    const extent = descriptor[axis];
    if (descriptor.sourceKind === "procedural-toroidal") {
        return positiveModulo(coordinate + 0.5, extent) - 0.5;
    }
    if (coordinate < -0.5 || coordinate >= extent - 0.5) {
        throw new RangeError(`${name} is outside the finite surface domain`);
    }
    return coordinate;
}

function canonicalLocation(
    descriptor: Readonly<WorldDescriptorV2>,
    u: number,
    v: number
): SurfaceRenderChunkLocation {
    return surfaceRenderChunkLocation(
        canonicalAxis(descriptor, "surface u coordinate", u, "width"),
        canonicalAxis(descriptor, "surface v coordinate", v, "height")
    );
}

function waitForCaller<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError("surface query was aborted"));
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (operation: () => void): void => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            operation();
        };
        const onAbort = (): void => finish(() => reject(abortError("surface query was aborted")));
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            value => finish(() => resolve(value)),
            reason => finish(() => reject(reason))
        );
    });
}

function isRetryableSupersession(reason: unknown): boolean {
    return reason instanceof QueryCandidateSupersededError
        || reason instanceof StaleSurfaceCompilationError
        || reason instanceof SurfaceLeaseNotCurrentError;
}

function frozenMaterialWeights(
    sample: Readonly<MutableCompiledSurfaceSample>
): readonly [number, number, number, number] {
    return Object.freeze([
        sample.materialWeights[0],
        sample.materialWeights[1],
        sample.materialWeights[2],
        sample.materialWeights[3]
    ]);
}

// The only public compiled-field query boundary. It owns no renderer or GPU
// object, shares in-flight CPU work per immutable snapshot/chunk, and accepts a
// result only while both its service token and store snapshot are current.
export class SurfaceQueryService {
    public readonly descriptor: WorldDescriptorV2;
    public readonly worldIdentity: string;
    public readonly metrics: SurfaceCompileMetrics;
    private readonly store: SurfaceDeltaStore;
    private readonly semanticSource: SemanticWorldSource;
    private readonly hydrologySource: HydrologyWorldSource;
    private readonly compilation: SurfaceCompilationService;
    private readonly scratch = createCompiledSurfaceSample();
    private readonly samplers = new WeakMap<CompiledSurfaceChunk, CompiledSurfaceSampler>();
    private readonly pendingBySnapshot = new WeakMap<
        SurfaceDeltaSnapshot,
        Map<number, Map<number, PendingQueryChunk>>
    >();
    private readonly active = new Set<PendingQueryChunk>();
    private completedQueries = 0;
    private sharedWaits = 0;
    private retainedCurrentLeases = 0;
    private compilationRequests = 0;
    private revisionRetries = 0;
    private supersededFailures = 0;
    private disposed = false;

    constructor(options: Readonly<SurfaceQueryServiceOptions>) {
        if (!options || typeof options !== "object") {
            throw new TypeError("surface query service options are required");
        }
        assertSemanticWorldSource(options.semanticSource);
        assertHydrologyWorldSource(options.hydrologySource);
        if (!(options.compilation instanceof SurfaceCompilationService)) {
            throw new TypeError("surface query service requires a SurfaceCompilationService");
        }
        if (!options.store || typeof options.store.snapshot !== "function") {
            throw new TypeError("surface query service requires a surface delta store");
        }
        assertMetrics(options.metrics);
        const worldIdentity = options.store.worldIdentity;
        if (options.semanticSource.worldIdentity !== worldIdentity
            || options.hydrologySource.worldIdentity !== worldIdentity
            || options.compilation.worldIdentity !== worldIdentity) {
            throw new TypeError("surface query inputs belong to different worlds");
        }
        this.store = options.store;
        this.semanticSource = options.semanticSource;
        this.hydrologySource = options.hydrologySource;
        this.compilation = options.compilation;
        this.descriptor = options.store.descriptor;
        this.worldIdentity = worldIdentity;
        this.metrics = Object.freeze({
            hexSize: options.metrics.hexSize,
            heightScale: options.metrics.heightScale
        });
    }

    public queryLogical(
        u: number,
        v: number,
        request: Readonly<SurfaceQueryRequestOptions> = {}
    ): Promise<SurfaceQueryResult> {
        try {
            this.assertActive();
            if (!request || typeof request !== "object") {
                throw new TypeError("surface query request options are invalid");
            }
            const location = canonicalLocation(this.descriptor, u, v);
            return this.queryCurrent(location, request.signal);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public queryWorld(
        x: number,
        z: number,
        request: Readonly<SurfaceQueryRequestOptions> = {}
    ): Promise<SurfaceQueryResult> {
        try {
            this.assertActive();
            const logical = worldToSurface(x, z, this.metrics.hexSize);
            return this.queryLogical(logical.u, logical.v, request);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public get stats(): Readonly<SurfaceQueryServiceStats> {
        let pendingWaiters = 0;
        for (const entry of this.active) pendingWaiters += entry.waiters;
        return Object.freeze({
            pendingChunks: this.active.size,
            pendingWaiters,
            completedQueries: this.completedQueries,
            sharedWaits: this.sharedWaits,
            retainedCurrentLeases: this.retainedCurrentLeases,
            compilationRequests: this.compilationRequests,
            revisionRetries: this.revisionRetries,
            supersededFailures: this.supersededFailures
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const entry of [...this.active]) this.closeEntry(entry);
    }

    private async queryCurrent(
        location: Readonly<SurfaceRenderChunkLocation>,
        signal: AbortSignal | undefined
    ): Promise<SurfaceQueryResult> {
        for (let attempt = 0; attempt < MAX_SURFACE_QUERY_REVISION_ATTEMPTS; attempt += 1) {
            this.assertActive();
            if (signal?.aborted) throw abortError("surface query was aborted");
            const snapshot = this.store.snapshot();
            const entry = this.acquireEntry(snapshot, location);
            try {
                const ready = await waitForCaller(entry.promise, signal);
                this.assertActive();
                if (this.store.snapshot() !== snapshot) throw new QueryCandidateSupersededError();
                const chunk = this.compilation.assertCurrent(ready.lease);
                ready.sampler.sampleSurface(location.localU, location.localV, this.scratch);
                if (this.store.snapshot() !== snapshot) throw new QueryCandidateSupersededError();
                const result = this.publishResult(snapshot, location, chunk, this.scratch);
                this.completedQueries += 1;
                return result;
            } catch (reason) {
                if (signal?.aborted) throw abortError("surface query was aborted");
                if (!isRetryableSupersession(reason)) throw reason;
                this.revisionRetries += 1;
            } finally {
                this.releaseEntry(entry);
            }
        }
        this.supersededFailures += 1;
        throw new SurfaceQuerySupersededError();
    }

    private acquireEntry(
        snapshot: SurfaceDeltaSnapshot,
        location: Readonly<SurfaceRenderChunkLocation>
    ): PendingQueryChunk {
        let byX = this.pendingBySnapshot.get(snapshot);
        if (!byX) {
            byX = new Map();
            this.pendingBySnapshot.set(snapshot, byX);
        }
        let byY = byX.get(location.chunkX);
        if (!byY) {
            byY = new Map();
            byX.set(location.chunkX, byY);
        }
        const existing = byY.get(location.chunkY);
        if (existing && !existing.closed) {
            existing.waiters += 1;
            this.sharedWaits += 1;
            return existing;
        }

        const controller = new AbortController();
        let entry: PendingQueryChunk;
        const promise = Promise.resolve().then(() => this.prepareChunk(entry));
        entry = {
            snapshot,
            location: Object.freeze({ ...location }),
            controller,
            promise,
            waiters: 1,
            closed: false
        };
        entry.promise = promise.then(ready => {
            entry.ready = ready;
            if (entry.closed) ready.lease.release();
            return ready;
        });
        void entry.promise.catch(() => undefined);
        byY.set(location.chunkY, entry);
        this.active.add(entry);
        return entry;
    }

    private async prepareChunk(entry: PendingQueryChunk): Promise<ReadyQueryChunk> {
        const key = Object.freeze({
            chunkX: entry.location.chunkX,
            chunkY: entry.location.chunkY
        });
        const retained = this.compilation.retainCurrentSurface(
            key,
            entry.snapshot.effectiveRevision
        );
        if (retained) {
            this.retainedCurrentLeases += 1;
            return this.readyForLease(retained);
        }

        const view = new EffectiveWorldView({
            semanticSource: this.semanticSource,
            hydrologySource: this.hydrologySource,
            deltaSnapshot: entry.snapshot
        });
        this.compilationRequests += 1;
        let lease: ResidentSurfaceLease | undefined;
        try {
            lease = await this.compilation.requestSurface({
                view,
                key,
                metrics: this.metrics,
                task: { signal: entry.controller.signal, lane: "interactive" }
            });
        } finally {
            view.dispose();
        }
        if (this.store.snapshot() !== entry.snapshot) {
            lease.release();
            throw new QueryCandidateSupersededError();
        }
        return this.readyForLease(lease);
    }

    private readyForLease(lease: ResidentSurfaceLease): ReadyQueryChunk {
        try {
            return Object.freeze({ lease, sampler: this.samplerFor(lease.chunk) });
        } catch (reason) {
            lease.release();
            throw reason;
        }
    }

    private samplerFor(chunk: CompiledSurfaceChunk): CompiledSurfaceSampler {
        let sampler = this.samplers.get(chunk);
        if (!sampler) {
            sampler = new CompiledSurfaceSampler(chunk.field);
            this.samplers.set(chunk, sampler);
        }
        return sampler;
    }

    private publishResult(
        snapshot: Readonly<SurfaceDeltaSnapshot>,
        location: Readonly<SurfaceRenderChunkLocation>,
        chunk: Readonly<CompiledSurfaceChunk>,
        sample: Readonly<MutableCompiledSurfaceSample>
    ): SurfaceQueryResult {
        let water: SurfaceWaterQueryResult | null = null;
        if (sample.waterBodyIndex !== 0) {
            const body = chunk.waterBodies.entries[sample.waterBodyIndex - 1];
            if (!body) throw new Error("compiled surface query resolved an absent water body palette entry");
            water = Object.freeze({
                bodyId: body.bodyId,
                kind: body.kind,
                profileIndex: body.profileIndex,
                level: sample.waterLevel,
                depth: sample.waterDepth,
                coverage: sample.waterCoverage,
                flow: Object.freeze([sample.flow[0], sample.flow[1]]) as readonly [number, number]
            });
        }
        return Object.freeze({
            effectiveRevision: snapshot.effectiveRevision,
            logicalU: location.u,
            logicalV: location.v,
            renderKey: Object.freeze({ chunkX: location.chunkX, chunkY: location.chunkY }),
            groundHeight: sample.groundHeight,
            shorelineDistance: sample.shorelineDistance,
            materialWeights: frozenMaterialWeights(sample),
            water
        });
    }

    private releaseEntry(entry: PendingQueryChunk): void {
        if (entry.closed) return;
        if (entry.waiters <= 0) throw new Error("surface query pending waiter accounting underflowed");
        entry.waiters -= 1;
        if (entry.waiters === 0) this.closeEntry(entry);
    }

    private closeEntry(entry: PendingQueryChunk): void {
        if (entry.closed) return;
        entry.closed = true;
        this.active.delete(entry);
        entry.controller.abort();
        entry.ready?.lease.release();
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("SurfaceQueryService has been disposed");
    }
}

if (SURFACE_COMPILE_PROFILE.renderChunkSize !== 16
    || MAX_SURFACE_QUERY_REVISION_ATTEMPTS !== 4) {
    throw new Error("surface query service constants drifted from the frozen profile");
}
