import { CoordinatePairMap } from "./CoordinatePairMap";
import {
    HYDROLOGY_REGION_REVISION,
    HydrologyRegion,
    HydrologyRegionKey,
    assertHydrologyRegion
} from "./HydrologyRegion";
import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import {
    SurfaceTaskRequestOptions,
    SurfaceWorkerPool,
    SurfaceWorkerPoolOptions,
    SurfaceWorkerPoolStats
} from "./SurfaceWorkerPool";
import {
    InfiniteWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    WorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";
import { chunkOrigin } from "./WorldGrid";

export const DEFAULT_HYDROLOGY_REGION_CACHE_BYTES = 16 * 1024 * 1024;
export const HYDROLOGY_REGION_BASE_RESIDENT_BYTES = 256;
export const HYDROLOGY_PORT_RESIDENT_BYTES = 128;
export const HYDROLOGY_RIVER_RESIDENT_BYTES = 160;
export const HYDROLOGY_LAKE_RESIDENT_BYTES = 96;
export const HYDROLOGY_MOUTH_RESIDENT_BYTES = 96;
export const HYDROLOGY_BODY_RESIDENT_BYTES = 64;

export type ProceduralHydrologyWorldDescriptorV2 = InfiniteWorldDescriptorV2 | ToroidalWorldDescriptorV2;

export interface HydrologyRegionPool {
    generateHydrologyRegion(
        options: {
            readonly descriptor: ProceduralHydrologyWorldDescriptorV2;
            readonly key: HydrologyRegionKey;
        },
        request?: Readonly<SurfaceTaskRequestOptions>
    ): Promise<HydrologyRegion>;
    readonly stats: Readonly<SurfaceWorkerPoolStats>;
    dispose(): void;
}

export interface ProceduralHydrologyWorldSourceOptions {
    readonly descriptor: ProceduralHydrologyWorldDescriptorV2;
    readonly workerUrl?: string | URL;
    readonly workerPool?: HydrologyRegionPool;
    readonly workerPoolOptions?: Readonly<SurfaceWorkerPoolOptions>;
    readonly cacheMaxBytes?: number;
}

export interface HydrologyWorldSourceStats {
    readonly residentRegions: number;
    readonly residentBytes: number;
    readonly leasedRegions: number;
    readonly inFlightRegions: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly workers: number;
    readonly busyWorkers: number;
    readonly queuedWorkerTasks: number;
}

export interface HydrologyWorldSource {
    readonly descriptor: WorldDescriptorV2;
    readonly worldIdentity: string;
    readonly stats: Readonly<HydrologyWorldSourceStats>;
    resolveRegion(regionX: number, regionY: number): HydrologyRegionKey | undefined;
    regionDistance(regionX: number, regionY: number, centerRegionX: number, centerRegionY: number): number;
    loadRegion(
        regionX: number,
        regionY: number,
        request?: Readonly<SurfaceTaskRequestOptions>
    ): Promise<HydrologyRegion>;
    releaseRegion(region: Readonly<HydrologyRegion>): void;
    hasRegion(regionX: number, regionY: number): boolean;
    dispose(): void;
}

interface CacheEntry {
    readonly region: HydrologyRegion;
    readonly bytes: number;
    references: number;
    lastUsed: number;
}

interface PendingRegion {
    readonly controller: AbortController;
    readonly promise: Promise<HydrologyRegion>;
    waiters: number;
    settled: boolean;
}

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("hydrology region request was aborted", "AbortError");
    }
    const error = new Error("hydrology region request was aborted");
    error.name = "AbortError";
    return error;
}

function stringPayloadBytes(value: string): number {
    const bytes = value.length * 2;
    if (!Number.isSafeInteger(bytes)) throw new RangeError("hydrology string size exceeds safe integers");
    return bytes;
}

function endpointPayloadBytes(endpoint: HydrologyRegion["rivers"][number]["entry"]): number {
    return stringPayloadBytes(endpoint.kind === "node"
        ? endpoint.nodeId : endpoint.kind === "port" ? endpoint.connectionId : endpoint.bodyId);
}

export function hydrologyRegionResidentBytes(region: Readonly<HydrologyRegion>): number {
    assertHydrologyRegion(region);
    let bytes = HYDROLOGY_REGION_BASE_RESIDENT_BYTES
        + region.boundaryPorts.length * HYDROLOGY_PORT_RESIDENT_BYTES
        + region.rivers.length * HYDROLOGY_RIVER_RESIDENT_BYTES
        + region.lakes.length * HYDROLOGY_LAKE_RESIDENT_BYTES
        + region.mouths.length * HYDROLOGY_MOUTH_RESIDENT_BYTES
        + region.bodies.length * HYDROLOGY_BODY_RESIDENT_BYTES
        + stringPayloadBytes(region.worldIdentity);
    for (const port of region.boundaryPorts) {
        bytes += port.point.byteLength + port.flowDirection.byteLength;
        bytes += stringPayloadBytes(port.connectionId)
            + stringPayloadBytes(port.riverId) + stringPayloadBytes(port.segmentId);
    }
    for (const river of region.rivers) {
        bytes += river.controlPoints.byteLength + river.widthProfile.byteLength + river.levelProfile.byteLength;
        bytes += stringPayloadBytes(river.riverId) + stringPayloadBytes(river.segmentId)
            + endpointPayloadBytes(river.entry) + endpointPayloadBytes(river.exit);
    }
    for (const lake of region.lakes) {
        bytes += lake.center.byteLength
            + stringPayloadBytes(lake.featureId) + stringPayloadBytes(lake.bodyId);
    }
    for (const mouth of region.mouths) {
        bytes += mouth.point.byteLength + stringPayloadBytes(mouth.mouthId)
            + stringPayloadBytes(mouth.riverId) + stringPayloadBytes(mouth.segmentId)
            + stringPayloadBytes(mouth.targetBodyId);
    }
    for (const body of region.bodies) bytes += stringPayloadBytes(body.bodyId);
    if (!Number.isSafeInteger(bytes)) throw new RangeError("hydrology region resident size exceeds safe integers");
    return bytes;
}

function validateRegionContract(
    region: Readonly<HydrologyRegion>,
    descriptor: ProceduralHydrologyWorldDescriptorV2,
    key: Readonly<HydrologyRegionKey>
): void {
    assertHydrologyRegion(region);
    const expectedWidth = descriptor.sourceKind === "procedural-toroidal"
        ? Math.min(HYDROLOGY_REGION_SIZE, descriptor.width - key.regionX * HYDROLOGY_REGION_SIZE)
        : HYDROLOGY_REGION_SIZE;
    const expectedHeight = descriptor.sourceKind === "procedural-toroidal"
        ? Math.min(HYDROLOGY_REGION_SIZE, descriptor.height - key.regionY * HYDROLOGY_REGION_SIZE)
        : HYDROLOGY_REGION_SIZE;
    if (region.worldIdentity !== serializeWorldDescriptorV2(descriptor)
        || region.topology !== descriptor.topology
        || region.key.regionX !== key.regionX || region.key.regionY !== key.regionY
        || region.revision !== HYDROLOGY_REGION_REVISION
        || region.validBounds.minX !== 0 || region.validBounds.minY !== 0
        || region.validBounds.maxXExclusive !== expectedWidth
        || region.validBounds.maxYExclusive !== expectedHeight) {
        throw new TypeError("hydrology pool returned a region outside its requested world contract");
    }
}

export class ProceduralHydrologyWorldSource implements HydrologyWorldSource {
    public readonly descriptor: ProceduralHydrologyWorldDescriptorV2;
    public readonly worldIdentity: string;
    public readonly regionCountX?: number;
    public readonly regionCountY?: number;
    private readonly pool: HydrologyRegionPool;
    private readonly ownsPool: boolean;
    private readonly cacheMaxBytes: number;
    private readonly cache = new CoordinatePairMap<CacheEntry>();
    private readonly inFlight = new CoordinatePairMap<PendingRegion>();
    private cacheBytes = 0;
    private cacheClock = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private disposed = false;

    constructor(options: Readonly<ProceduralHydrologyWorldSourceOptions>) {
        if (!options || typeof options !== "object" || !options.descriptor
            || (options.descriptor.sourceKind !== "procedural-infinite"
                && options.descriptor.sourceKind !== "procedural-toroidal")) {
            throw new TypeError("procedural hydrology source requires a procedural descriptor");
        }
        this.descriptor = options.descriptor;
        this.worldIdentity = serializeWorldDescriptorV2(options.descriptor);
        if (options.descriptor.sourceKind === "procedural-toroidal") {
            this.regionCountX = Math.ceil(options.descriptor.width / HYDROLOGY_REGION_SIZE);
            this.regionCountY = Math.ceil(options.descriptor.height / HYDROLOGY_REGION_SIZE);
        }
        this.cacheMaxBytes = options.cacheMaxBytes ?? DEFAULT_HYDROLOGY_REGION_CACHE_BYTES;
        const minimumCacheBytes = HYDROLOGY_REGION_BASE_RESIDENT_BYTES
            + stringPayloadBytes(this.worldIdentity);
        if (!Number.isSafeInteger(this.cacheMaxBytes)
            || this.cacheMaxBytes < minimumCacheBytes) {
            throw new RangeError("hydrology region cache must hold at least one empty region");
        }
        if (options.workerPool) {
            if (options.workerUrl !== undefined || options.workerPoolOptions !== undefined) {
                throw new TypeError("external hydrology workerPool cannot be combined with worker URL or options");
            }
            this.pool = options.workerPool;
            this.ownsPool = false;
        } else {
            if (!options.workerUrl) throw new TypeError("procedural hydrology source requires a surface worker URL");
            if ((options.workerPoolOptions?.size !== undefined && options.workerPoolOptions.size !== 1)
                || (options.workerPoolOptions?.maxWorkers !== undefined
                    && options.workerPoolOptions.maxWorkers !== 1)) {
                throw new RangeError("owned hydrology worker pool must use exactly one affinity worker");
            }
            this.pool = new SurfaceWorkerPool(options.workerUrl, {
                ...options.workerPoolOptions,
                size: 1,
                maxWorkers: 1
            });
            this.ownsPool = true;
        }
    }

    public resolveRegion(regionX: number, regionY: number): HydrologyRegionKey | undefined {
        if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return undefined;
        if (this.descriptor.sourceKind === "procedural-toroidal") {
            return Object.freeze({
                regionX: positiveModulo(regionX, this.regionCountX as number),
                regionY: positiveModulo(regionY, this.regionCountY as number)
            });
        }
        try {
            chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
            return Object.freeze({ regionX, regionY });
        } catch {
            return undefined;
        }
    }

    public regionDistance(regionX: number, regionY: number, centerRegionX: number, centerRegionY: number): number {
        const first = this.resolveRegion(regionX, regionY);
        const second = this.resolveRegion(centerRegionX, centerRegionY);
        if (!first || !second) return Number.POSITIVE_INFINITY;
        if (this.descriptor.sourceKind === "procedural-infinite") {
            return Math.hypot(first.regionX - second.regionX, first.regionY - second.regionY);
        }
        const distanceX = Math.min(
            Math.abs(first.regionX - second.regionX),
            (this.regionCountX as number) - Math.abs(first.regionX - second.regionX)
        );
        const distanceY = Math.min(
            Math.abs(first.regionY - second.regionY),
            (this.regionCountY as number) - Math.abs(first.regionY - second.regionY)
        );
        return Math.hypot(distanceX, distanceY);
    }

    public loadRegion(
        regionX: number,
        regionY: number,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<HydrologyRegion> {
        if (this.disposed) return Promise.reject(new Error("procedural hydrology source has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        const key = this.resolveRegion(regionX, regionY);
        if (!key || key.regionX !== regionX || key.regionY !== regionY) {
            return Promise.reject(new RangeError("hydrology region request must use a canonical in-domain key"));
        }
        const cached = this.cache.get(regionX, regionY);
        if (cached) {
            this.cacheHits += 1;
            cached.references += 1;
            this.touch(cached);
            return Promise.resolve(cached.region);
        }
        this.cacheMisses += 1;
        let pending = this.inFlight.get(regionX, regionY);
        if (!pending) {
            const controller = new AbortController();
            const created = {
                controller,
                waiters: 0,
                settled: false,
                promise: undefined as unknown as Promise<HydrologyRegion>
            };
            created.promise = this.pool.generateHydrologyRegion({
                descriptor: this.descriptor,
                key
            }, {
                priority: request.priority,
                lane: request.lane,
                weight: request.weight,
                signal: controller.signal
            }).then(region => {
                if (this.disposed) throw new Error("hydrology source was disposed during generation");
                validateRegionContract(region, this.descriptor, key);
                this.insert(region);
                return region;
            }).finally(() => {
                created.settled = true;
                this.inFlight.delete(regionX, regionY);
                if (created.waiters === 0) this.evictUnleased();
            });
            pending = created;
            this.inFlight.set(regionX, regionY, pending);
        }
        return this.waitFor(pending, request.signal);
    }

    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        const entry = this.cache.get(region.key.regionX, region.key.regionY);
        if (!entry || entry.region !== region || entry.references <= 0) {
            throw new Error("hydrology region release does not match an active source lease");
        }
        entry.references -= 1;
        this.touch(entry);
        this.evictUnleased();
    }

    public hasRegion(regionX: number, regionY: number): boolean {
        return this.cache.has(regionX, regionY);
    }

    public get stats(): Readonly<HydrologyWorldSourceStats> {
        const worker = this.pool.stats;
        let leasedRegions = 0;
        for (const entry of this.cache.values()) {
            if (entry.references > 0) leasedRegions += 1;
        }
        return Object.freeze({
            residentRegions: this.cache.size,
            residentBytes: this.cacheBytes,
            leasedRegions,
            inFlightRegions: this.inFlight.size,
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

    private waitFor(pending: PendingRegion, signal: AbortSignal | undefined): Promise<HydrologyRegion> {
        pending.waiters += 1;
        return new Promise<HydrologyRegion>((resolve, reject) => {
            let settled = false;
            const finish = (): void => {
                if (settled) return;
                settled = true;
                pending.waiters -= 1;
                if (signal) signal.removeEventListener("abort", abort);
                if (pending.waiters === 0 && !pending.settled) pending.controller.abort();
            };
            const abort = (): void => {
                finish();
                reject(abortError());
            };
            if (signal) signal.addEventListener("abort", abort, { once: true });
            pending.promise.then(region => {
                if (settled) return;
                finish();
                const entry = this.cache.get(region.key.regionX, region.key.regionY);
                if (!entry || entry.region !== region) {
                    reject(new Error("generated hydrology region was not published to its source cache"));
                    return;
                }
                entry.references += 1;
                this.touch(entry);
                this.evictUnleased();
                resolve(region);
            }, reason => {
                if (settled) return;
                finish();
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            });
            if (signal?.aborted) abort();
        });
    }

    private insert(region: HydrologyRegion): void {
        const existing = this.cache.get(region.key.regionX, region.key.regionY);
        if (existing) throw new Error("hydrology source generated a duplicate resident region");
        const bytes = hydrologyRegionResidentBytes(region);
        const entry: CacheEntry = { region, bytes, references: 0, lastUsed: 0 };
        this.touch(entry);
        this.cache.set(region.key.regionX, region.key.regionY, entry);
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
            this.cache.delete(candidate.region.key.regionX, candidate.region.key.regionY);
            this.cacheBytes -= candidate.bytes;
        }
    }
}

export function assertHydrologyWorldSource(source: HydrologyWorldSource): void {
    if (!source || typeof source !== "object"
        || source.worldIdentity !== serializeWorldDescriptorV2(source.descriptor)
        || typeof source.resolveRegion !== "function"
        || typeof source.regionDistance !== "function"
        || typeof source.loadRegion !== "function"
        || typeof source.releaseRegion !== "function"
        || typeof source.hasRegion !== "function"
        || typeof source.dispose !== "function") {
        throw new TypeError("hydrology world source does not satisfy the v2 runtime contract");
    }
}
