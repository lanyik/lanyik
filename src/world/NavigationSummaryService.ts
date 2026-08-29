import { EffectiveWorldView } from "./EffectiveWorldView";
import { EffectiveSemanticChunk } from "./EffectiveSemanticChunk";
import { HydrologyWorldSource, assertHydrologyWorldSource } from "./HydrologyWorldSource";
import {
    NAVIGATION_CHUNK_SUMMARY_FORMAT_VERSION,
    NavigationChunkSummary,
    NavigationMovementProfile,
    assertNavigationMovementProfile,
    compileNavigationChunkSummary,
    navigationChunkSummaryResidentBytes,
    rebaseNavigationChunkSummary
} from "./NavigationChunkSummary";
import {
    NavigationOverrideSection,
    assertNavigationOverrideSection,
    serializeNavigationOverrideSection
} from "./NavigationOverrideSection";
import { SemanticWorldSource, assertSemanticWorldSource } from "./SemanticWorldSource";
import { RenderChunkKey, SurfaceCompileMetrics, serializeSurfaceDependencyKey } from "./SurfaceDependencyKey";
import {
    ResidentSurfaceLease,
    StaleSurfaceCompilationError,
    SurfaceCompilationService,
    SurfaceLeaseNotCurrentError
} from "./SurfaceCompilationService";
import { SurfaceDeltaSnapshot, SurfaceDeltaStore } from "./SurfaceDeltaStore";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

export const NAVIGATION_SUMMARY_REQUEST_TOKEN_FORMAT_VERSION = 1;
export const MAX_NAVIGATION_SUMMARY_REVISION_ATTEMPTS = 4;

export interface NavigationSummaryRequestToken {
    readonly formatVersion: typeof NAVIGATION_SUMMARY_REQUEST_TOKEN_FORMAT_VERSION;
    readonly sessionEpoch: number;
    readonly generation: number;
}

export interface NavigationSummaryServiceOptions {
    readonly store: SurfaceDeltaStore;
    readonly semanticSource: SemanticWorldSource;
    readonly hydrologySource: HydrologyWorldSource;
    readonly compilation: SurfaceCompilationService;
    readonly metrics: SurfaceCompileMetrics;
    readonly sessionEpoch: number;
    readonly cacheMaxBytes: number;
}

export interface NavigationSummaryRequest {
    readonly key: Readonly<{ chunkX: number; chunkY: number }>;
    readonly profile: NavigationMovementProfile;
    readonly override?: NavigationOverrideSection;
    readonly signal?: AbortSignal;
}

export interface NavigationSummaryLease {
    readonly requestToken: NavigationSummaryRequestToken;
    readonly summary: NavigationChunkSummary;
    readonly released: boolean;
    release(): void;
}

export interface NavigationSummaryServiceStats {
    readonly residentSummaries: number;
    readonly residentBytes: number;
    readonly activeLeases: number;
    readonly activeDemands: number;
    readonly pendingWaiters: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly completedCompilations: number;
    readonly revisionRetries: number;
    readonly supersededFailures: number;
    readonly evictions: number;
}

export class NavigationSummarySupersededError extends Error {
    public readonly name = "NavigationSummarySupersededError";

    constructor(public readonly attempts: number = MAX_NAVIGATION_SUMMARY_REVISION_ATTEMPTS) {
        super(`navigation summary could not observe a current revision after ${attempts} attempts`);
    }
}

export class NavigationSummaryLeaseNotCurrentError extends Error {
    public readonly name = "NavigationSummaryLeaseNotCurrentError";

    constructor(public readonly key: Readonly<{ chunkX: number; chunkY: number }>) {
        super("navigation summary lease is released, foreign, or no longer current");
    }
}

class StaleNavigationSummaryBuildError extends Error {
    public readonly name = "StaleNavigationSummaryBuildError";
}

interface CacheEntry {
    readonly identity: string;
    readonly summary: NavigationChunkSummary;
    readonly residentBytes: number;
    leases: number;
}

interface PreparedSummary {
    readonly entry: CacheEntry;
    readonly summary: NavigationChunkSummary;
}

interface ActiveDemand {
    readonly key: Readonly<{ chunkX: number; chunkY: number }>;
    readonly profile: NavigationMovementProfile;
    readonly profileIdentity: string;
    readonly override?: NavigationOverrideSection;
    readonly overrideIdentity: string;
    readonly snapshot: SurfaceDeltaSnapshot;
    readonly requestToken: NavigationSummaryRequestToken;
    readonly controller: AbortController;
    readonly leases: Set<NavigationSummaryLeaseImpl>;
    readonly promise: Promise<PreparedSummary>;
    waiters: number;
}

interface ReadyNavigationInputs {
    readonly view: EffectiveWorldView;
    readonly semantic: EffectiveSemanticChunk;
    readonly surfaceLeases: readonly ResidentSurfaceLease[];
}

interface PendingNavigationInputs {
    readonly snapshot: SurfaceDeltaSnapshot;
    readonly key: Readonly<{ chunkX: number; chunkY: number }>;
    readonly controller: AbortController;
    promise: Promise<ReadyNavigationInputs>;
    references: number;
    ready?: ReadyNavigationInputs;
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
        throw new RangeError("navigation summary metrics must use positive finite scales");
    }
}

function createRequestToken(sessionEpoch: number, generation: number): NavigationSummaryRequestToken {
    if (!Number.isSafeInteger(sessionEpoch) || sessionEpoch < 0
        || !Number.isSafeInteger(generation) || generation <= 0) {
        throw new RangeError("navigation summary request token fields are invalid");
    }
    return Object.freeze({
        formatVersion: NAVIGATION_SUMMARY_REQUEST_TOKEN_FORMAT_VERSION,
        sessionEpoch,
        generation
    });
}

function serializeProfile(profile: Readonly<NavigationMovementProfile>): string {
    assertNavigationMovementProfile(profile);
    return JSON.stringify([
        profile.id,
        profile.maximumGroundSlope,
        profile.dryCost,
        profile.slopeCostScale,
        profile.oceanCost,
        profile.lakeCost,
        profile.riverCost
    ]);
}

function cacheIdentity(
    worldIdentity: string,
    key: Readonly<{ chunkX: number; chunkY: number }>,
    baseRevision: number,
    deltaRevision: number,
    profile: Readonly<NavigationMovementProfile>,
    surfaceDependencies: readonly ReturnType<typeof serializeSurfaceDependencyKey>[],
    overrideIdentity: string
): string {
    return JSON.stringify([
        NAVIGATION_CHUNK_SUMMARY_FORMAT_VERSION,
        worldIdentity,
        key.chunkX,
        key.chunkY,
        baseRevision,
        deltaRevision,
        serializeProfile(profile),
        overrideIdentity,
        surfaceDependencies
    ]);
}

function waitForCaller<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError("navigation summary request was aborted"));
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (operation: () => void): void => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            operation();
        };
        const onAbort = (): void => finish(() => reject(abortError("navigation summary request was aborted")));
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            value => finish(() => resolve(value)),
            reason => finish(() => reject(reason))
        );
    });
}

function surfaceKeys(
    key: Readonly<{ chunkX: number; chunkY: number }>,
    bounds: Readonly<{ minX: number; minY: number; maxXExclusive: number; maxYExclusive: number }>
): readonly RenderChunkKey[] {
    const originX = key.chunkX * 2;
    const originY = key.chunkY * 2;
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) {
        throw new RangeError("navigation summary key exceeds aligned render coordinates");
    }
    const keys: RenderChunkKey[] = [];
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const localX = Math.floor(quadrant / 2) * 16;
        const localY = (quadrant % 2) * 16;
        if (bounds.minX >= localX + 16 || bounds.maxXExclusive <= localX
            || bounds.minY >= localY + 16 || bounds.maxYExclusive <= localY) continue;
        keys.push(Object.freeze({
            chunkX: originX + Math.floor(quadrant / 2),
            chunkY: originY + quadrant % 2
        }));
    }
    return Object.freeze(keys);
}

class NavigationSummaryLeaseImpl implements NavigationSummaryLease {
    private isReleased = false;

    constructor(
        public readonly requestToken: NavigationSummaryRequestToken,
        public readonly summary: NavigationChunkSummary,
        public readonly owner: NavigationSummaryService,
        public readonly demand: ActiveDemand,
        public readonly entry: CacheEntry,
        private readonly onRelease: (lease: NavigationSummaryLeaseImpl) => void
    ) {}

    public get released(): boolean { return this.isReleased; }

    public release(): void {
        if (this.isReleased) return;
        this.isReleased = true;
        this.onRelease(this);
    }
}

// Owns only derived CPU summaries and their leases. Semantic/hydrology sources,
// the delta store, and SurfaceCompilationService remain session owners outside
// this service; no renderer or GPU resource is accepted by this API.
export class NavigationSummaryService {
    public readonly worldIdentity: string;
    public readonly metrics: SurfaceCompileMetrics;
    private readonly store: SurfaceDeltaStore;
    private readonly semanticSource: SemanticWorldSource;
    private readonly hydrologySource: HydrologyWorldSource;
    private readonly compilation: SurfaceCompilationService;
    private readonly sessionEpoch: number;
    private readonly cacheMaxBytes: number;
    private readonly profiles = new Map<string, string>();
    private readonly demands = new Map<number, Map<number, Map<string, ActiveDemand>>>();
    private readonly inputsBySnapshot = new WeakMap<
        SurfaceDeltaSnapshot,
        Map<number, Map<number, PendingNavigationInputs>>
    >();
    private readonly activeInputs = new Set<PendingNavigationInputs>();
    private readonly cache = new Map<string, CacheEntry>();
    private nextGeneration = 1;
    private residentBytes = 0;
    private activeLeases = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private completedCompilations = 0;
    private revisionRetries = 0;
    private supersededFailures = 0;
    private evictions = 0;
    private disposed = false;

    constructor(options: Readonly<NavigationSummaryServiceOptions>) {
        if (!options || typeof options !== "object") {
            throw new TypeError("navigation summary service options are required");
        }
        assertSemanticWorldSource(options.semanticSource);
        assertHydrologyWorldSource(options.hydrologySource);
        if (!(options.compilation instanceof SurfaceCompilationService)
            || !options.store || typeof options.store.snapshot !== "function") {
            throw new TypeError("navigation summary service requires v2 store and compilation owners");
        }
        assertMetrics(options.metrics);
        createRequestToken(options.sessionEpoch, 1);
        if (!Number.isSafeInteger(options.cacheMaxBytes) || options.cacheMaxBytes <= 0) {
            throw new RangeError("navigation summary cache budget must be a positive safe integer");
        }
        const worldIdentity = options.store.worldIdentity;
        if (options.semanticSource.worldIdentity !== worldIdentity
            || options.hydrologySource.worldIdentity !== worldIdentity
            || options.compilation.worldIdentity !== worldIdentity) {
            throw new TypeError("navigation summary service inputs belong to different worlds");
        }
        this.store = options.store;
        this.semanticSource = options.semanticSource;
        this.hydrologySource = options.hydrologySource;
        this.compilation = options.compilation;
        this.sessionEpoch = options.sessionEpoch;
        this.cacheMaxBytes = options.cacheMaxBytes;
        this.worldIdentity = worldIdentity;
        this.metrics = Object.freeze({
            hexSize: options.metrics.hexSize,
            heightScale: options.metrics.heightScale
        });
    }

    public requestSummary(request: Readonly<NavigationSummaryRequest>): Promise<NavigationSummaryLease> {
        try {
            this.assertActive();
            if (!request || typeof request !== "object") {
                throw new TypeError("navigation summary request is required");
            }
            const resolved = this.semanticSource.resolveChunk(request.key?.chunkX, request.key?.chunkY);
            if (!resolved) throw new RangeError("navigation summary key is outside the world domain");
            chunkOrigin(resolved.chunkX, resolved.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
            const key = Object.freeze({ chunkX: resolved.chunkX, chunkY: resolved.chunkY });
            const profile = Object.freeze({ ...request.profile });
            const profileIdentity = serializeProfile(profile);
            let override: NavigationOverrideSection | undefined;
            if (request.override) {
                assertNavigationOverrideSection(request.override);
                if (request.override.worldIdentity !== this.worldIdentity
                    || request.override.key.chunkX !== key.chunkX
                    || request.override.key.chunkY !== key.chunkY) {
                    throw new TypeError("navigation summary override does not match its canonical request key");
                }
                override = request.override;
            }
            const existingProfile = this.profiles.get(profile.id);
            if (existingProfile !== undefined && existingProfile !== profileIdentity) {
                throw new Error(`navigation movement profile "${profile.id}" changed within one service session`);
            }
            this.profiles.set(profile.id, profileIdentity);
            return this.requestCurrent({
                key,
                profile,
                profileIdentity,
                override,
                overrideIdentity: serializeNavigationOverrideSection(override),
                signal: request.signal
            });
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public isCurrent(lease: Readonly<NavigationSummaryLease>): boolean {
        if (this.disposed || !(lease instanceof NavigationSummaryLeaseImpl)
            || lease.owner !== this || lease.released
            || this.store.snapshot() !== lease.demand.snapshot) return false;
        return this.getDemand(lease.demand.key, lease.demand.profile.id) === lease.demand
            && lease.demand.leases.has(lease)
            && lease.requestToken === lease.demand.requestToken;
    }

    public assertCurrent(lease: Readonly<NavigationSummaryLease>): NavigationChunkSummary {
        if (!this.isCurrent(lease)) throw new NavigationSummaryLeaseNotCurrentError(lease.summary.key);
        return lease.summary;
    }

    public get stats(): Readonly<NavigationSummaryServiceStats> {
        let activeDemands = 0;
        let pendingWaiters = 0;
        for (const byY of this.demands.values()) for (const byProfile of byY.values()) {
            activeDemands += byProfile.size;
            for (const demand of byProfile.values()) pendingWaiters += demand.waiters;
        }
        return Object.freeze({
            residentSummaries: this.cache.size,
            residentBytes: this.residentBytes,
            activeLeases: this.activeLeases,
            activeDemands,
            pendingWaiters,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            completedCompilations: this.completedCompilations,
            revisionRetries: this.revisionRetries,
            supersededFailures: this.supersededFailures,
            evictions: this.evictions
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const byY of this.demands.values()) for (const byProfile of byY.values()) {
            for (const demand of byProfile.values()) demand.controller.abort();
        }
        for (const inputs of [...this.activeInputs]) this.closeInputs(inputs);
        this.demands.clear();
        this.cache.clear();
        this.residentBytes = 0;
    }

    private async requestCurrent(input: Readonly<{
        key: Readonly<{ chunkX: number; chunkY: number }>;
        profile: NavigationMovementProfile;
        profileIdentity: string;
        override?: NavigationOverrideSection;
        overrideIdentity: string;
        signal?: AbortSignal;
    }>): Promise<NavigationSummaryLease> {
        for (let attempt = 0; attempt < MAX_NAVIGATION_SUMMARY_REVISION_ATTEMPTS; attempt += 1) {
            this.assertActive();
            if (input.signal?.aborted) throw abortError("navigation summary request was aborted");
            const snapshot = this.store.snapshot();
            const demand = this.acquireDemand({ ...input, snapshot });
            try {
                const prepared = await waitForCaller(demand.promise, input.signal);
                if (!this.demandIsCurrent(demand) || this.store.snapshot() !== snapshot) {
                    throw new StaleNavigationSummaryBuildError();
                }
                return this.createLease(demand, prepared);
            } catch (reason) {
                if (input.signal?.aborted) throw abortError("navigation summary request was aborted");
                if (!this.retryable(reason)) throw reason;
                this.revisionRetries += 1;
            } finally {
                this.releaseWaiter(demand);
            }
        }
        this.supersededFailures += 1;
        throw new NavigationSummarySupersededError();
    }

    private acquireDemand(input: Readonly<{
        key: Readonly<{ chunkX: number; chunkY: number }>;
        profile: NavigationMovementProfile;
        profileIdentity: string;
        override?: NavigationOverrideSection;
        overrideIdentity: string;
        snapshot: SurfaceDeltaSnapshot;
    }>): ActiveDemand {
        const existing = this.getDemand(input.key, input.profile.id);
        if (existing && existing.snapshot === input.snapshot
            && existing.profileIdentity === input.profileIdentity
            && existing.overrideIdentity === input.overrideIdentity
            && !existing.controller.signal.aborted) {
            existing.waiters += 1;
            return existing;
        }
        if (!Number.isSafeInteger(this.nextGeneration)) {
            throw new RangeError("navigation summary generation space is exhausted");
        }
        if (existing) existing.controller.abort();
        const controller = new AbortController();
        let demand: ActiveDemand;
        const promise = Promise.resolve().then(() => this.prepareDemand(demand));
        demand = {
            key: input.key,
            profile: input.profile,
            profileIdentity: input.profileIdentity,
            override: input.override,
            overrideIdentity: input.overrideIdentity,
            snapshot: input.snapshot,
            requestToken: createRequestToken(this.sessionEpoch, this.nextGeneration),
            controller,
            leases: new Set(),
            promise,
            waiters: 1
        };
        this.nextGeneration += 1;
        void promise.catch(() => undefined);
        this.setDemand(demand);
        return demand;
    }

    private async prepareDemand(demand: ActiveDemand): Promise<PreparedSummary> {
        const inputs = this.acquireInputs(demand.snapshot, demand.key);
        try {
            const ready = await waitForCaller(inputs.promise, demand.controller.signal);
            this.assertDemandSnapshot(demand);
            const surfaces = ready.surfaceLeases.map(lease => this.compilation.assertCurrent(lease));
            const identity = cacheIdentity(
                this.worldIdentity,
                demand.key,
                ready.semantic.baseRevision,
                ready.semantic.deltaRevision,
                demand.profile,
                surfaces.map(surface => serializeSurfaceDependencyKey(surface.dependencyKey)),
                demand.overrideIdentity
            );
            let entry = this.cache.get(identity);
            if (entry) {
                this.cacheHits += 1;
                this.cache.delete(identity);
                this.cache.set(identity, entry);
            } else {
                const candidate = compileNavigationChunkSummary({
                    descriptor: ready.view.descriptor,
                    semantic: ready.semantic,
                    surfaces,
                    profile: demand.profile,
                    ...(demand.override ? { override: demand.override } : {})
                });
                this.assertDemandSnapshot(demand);
                this.cacheMisses += 1;
                entry = {
                    identity,
                    summary: candidate,
                    residentBytes: navigationChunkSummaryResidentBytes(candidate),
                    leases: 0
                };
                this.cache.set(identity, entry);
                this.residentBytes += entry.residentBytes;
                this.completedCompilations += 1;
            }
            return Object.freeze({
                entry,
                summary: rebaseNavigationChunkSummary(
                    entry.summary,
                    demand.snapshot.effectiveRevision
                )
            });
        } catch (reason) {
            if (!this.demandIsCurrent(demand)
                || reason instanceof StaleSurfaceCompilationError
                || reason instanceof SurfaceLeaseNotCurrentError) {
                throw new StaleNavigationSummaryBuildError();
            }
            if (demand.controller.signal.aborted) {
                throw abortError("navigation summary build was aborted");
            }
            throw reason instanceof Error ? reason : new Error(String(reason));
        } finally {
            this.releaseInputs(inputs);
        }
    }

    private acquireInputs(
        snapshot: SurfaceDeltaSnapshot,
        key: Readonly<{ chunkX: number; chunkY: number }>
    ): PendingNavigationInputs {
        let byX = this.inputsBySnapshot.get(snapshot);
        if (!byX) {
            byX = new Map();
            this.inputsBySnapshot.set(snapshot, byX);
        }
        let byY = byX.get(key.chunkX);
        if (!byY) {
            byY = new Map();
            byX.set(key.chunkX, byY);
        }
        const existing = byY.get(key.chunkY);
        if (existing && !existing.closed) {
            existing.references += 1;
            return existing;
        }
        const controller = new AbortController();
        let inputs: PendingNavigationInputs;
        const preparing = Promise.resolve().then(() => this.prepareInputs(inputs));
        inputs = {
            snapshot,
            key,
            controller,
            promise: preparing,
            references: 1,
            closed: false
        };
        inputs.promise = preparing.then(ready => {
            inputs.ready = ready;
            if (inputs.closed) this.disposeReadyInputs(inputs);
            return ready;
        });
        void inputs.promise.catch(() => undefined);
        byY.set(key.chunkY, inputs);
        this.activeInputs.add(inputs);
        return inputs;
    }

    private async prepareInputs(inputs: PendingNavigationInputs): Promise<ReadyNavigationInputs> {
        const view = new EffectiveWorldView({
            semanticSource: this.semanticSource,
            hydrologySource: this.hydrologySource,
            deltaSnapshot: inputs.snapshot
        });
        const surfaceLeases: ResidentSurfaceLease[] = [];
        try {
            const semantic = await view.loadSemanticChunk(
                inputs.key.chunkX,
                inputs.key.chunkY,
                { signal: inputs.controller.signal, lane: "interactive" }
            );
            const settled = await Promise.allSettled(surfaceKeys(
                inputs.key,
                semantic.validBounds
            ).map(async key => {
                const retained = this.compilation.retainCurrentSurface(
                    key,
                    inputs.snapshot.effectiveRevision
                );
                return retained ?? this.compilation.requestSurface({
                    view,
                    key,
                    metrics: this.metrics,
                    task: { signal: inputs.controller.signal, lane: "interactive" }
                });
            }));
            const failure = settled.find(result => result.status === "rejected") as
                PromiseRejectedResult | undefined;
            for (const result of settled) if (result.status === "fulfilled") {
                surfaceLeases.push(result.value);
            }
            if (failure) throw failure.reason;
            if (this.store.snapshot() !== inputs.snapshot) throw new StaleNavigationSummaryBuildError();
            return Object.freeze({
                view,
                semantic,
                surfaceLeases: Object.freeze(surfaceLeases)
            });
        } catch (reason) {
            for (const lease of surfaceLeases) lease.release();
            view.dispose();
            throw reason;
        }
    }

    private releaseInputs(inputs: PendingNavigationInputs): void {
        if (inputs.closed) return;
        if (inputs.references <= 0) throw new Error("navigation input reference accounting underflowed");
        inputs.references -= 1;
        if (inputs.references === 0) this.closeInputs(inputs);
    }

    private closeInputs(inputs: PendingNavigationInputs): void {
        if (inputs.closed) return;
        inputs.closed = true;
        inputs.controller.abort();
        this.activeInputs.delete(inputs);
        this.disposeReadyInputs(inputs);
    }

    private disposeReadyInputs(inputs: PendingNavigationInputs): void {
        const ready = inputs.ready;
        if (!ready) return;
        inputs.ready = undefined;
        for (const lease of ready.surfaceLeases) lease.release();
        ready.view.dispose();
    }

    private createLease(demand: ActiveDemand, prepared: PreparedSummary): NavigationSummaryLeaseImpl {
        if (!this.demandIsCurrent(demand)) throw new StaleNavigationSummaryBuildError();
        const lease = new NavigationSummaryLeaseImpl(
            demand.requestToken,
            prepared.summary,
            this,
            demand,
            prepared.entry,
            released => this.releaseLease(released)
        );
        demand.leases.add(lease);
        prepared.entry.leases += 1;
        this.activeLeases += 1;
        this.evictToBudget();
        return lease;
    }

    private releaseLease(lease: NavigationSummaryLeaseImpl): void {
        if (lease.owner !== this || !lease.demand.leases.has(lease)
            || lease.entry.leases <= 0 || this.activeLeases <= 0) {
            throw new Error("navigation summary lease release does not match this service");
        }
        lease.demand.leases.delete(lease);
        lease.entry.leases -= 1;
        this.activeLeases -= 1;
        this.deleteDemandIfUnused(lease.demand);
        if (!this.disposed) this.evictToBudget();
    }

    private releaseWaiter(demand: ActiveDemand): void {
        if (demand.waiters <= 0) throw new Error("navigation summary waiter accounting underflowed");
        demand.waiters -= 1;
        this.deleteDemandIfUnused(demand);
        if (!this.disposed) this.evictToBudget();
    }

    private deleteDemandIfUnused(demand: ActiveDemand): void {
        if (demand.waiters !== 0 || demand.leases.size !== 0) return;
        if (this.getDemand(demand.key, demand.profile.id) === demand) this.deleteDemand(demand);
        demand.controller.abort();
    }

    private assertDemandSnapshot(demand: ActiveDemand): void {
        if (!this.demandIsCurrent(demand) || this.store.snapshot() !== demand.snapshot) {
            throw new StaleNavigationSummaryBuildError();
        }
    }

    private demandIsCurrent(demand: ActiveDemand): boolean {
        return !this.disposed
            && this.getDemand(demand.key, demand.profile.id) === demand
            && !demand.controller.signal.aborted;
    }

    private retryable(reason: unknown): boolean {
        return reason instanceof StaleNavigationSummaryBuildError
            || reason instanceof StaleSurfaceCompilationError
            || reason instanceof SurfaceLeaseNotCurrentError;
    }

    private getDemand(
        key: Readonly<{ chunkX: number; chunkY: number }>,
        profileId: string
    ): ActiveDemand | undefined {
        return this.demands.get(key.chunkX)?.get(key.chunkY)?.get(profileId);
    }

    private setDemand(demand: ActiveDemand): void {
        let byY = this.demands.get(demand.key.chunkX);
        if (!byY) {
            byY = new Map();
            this.demands.set(demand.key.chunkX, byY);
        }
        let byProfile = byY.get(demand.key.chunkY);
        if (!byProfile) {
            byProfile = new Map();
            byY.set(demand.key.chunkY, byProfile);
        }
        byProfile.set(demand.profile.id, demand);
    }

    private deleteDemand(demand: ActiveDemand): void {
        const byY = this.demands.get(demand.key.chunkX);
        const byProfile = byY?.get(demand.key.chunkY);
        if (!byY || !byProfile || byProfile.get(demand.profile.id) !== demand) return;
        byProfile.delete(demand.profile.id);
        if (byProfile.size === 0) byY.delete(demand.key.chunkY);
        if (byY.size === 0) this.demands.delete(demand.key.chunkX);
    }

    private evictToBudget(): void {
        if (this.residentBytes <= this.cacheMaxBytes) return;
        for (const [identity, entry] of this.cache) {
            if (this.residentBytes <= this.cacheMaxBytes) break;
            if (entry.leases !== 0) continue;
            this.cache.delete(identity);
            this.residentBytes -= entry.residentBytes;
            this.evictions += 1;
        }
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("NavigationSummaryService has been disposed");
    }
}

if (MAX_NAVIGATION_SUMMARY_REVISION_ATTEMPTS !== 4) {
    throw new Error("navigation summary retry budget drifted from its frozen contract");
}
