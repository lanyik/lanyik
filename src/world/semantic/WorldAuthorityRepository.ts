import { BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES, BaseSemanticChunk } from "./BaseSemanticChunk";
import { EffectiveWorldSnapshot, EffectiveWorldView } from "./EffectiveWorldView";
import {
    surfaceHydrologyRegionRequirements,
    surfaceSemanticChunkRequirements
} from "./EffectiveSurfaceWindow";
import { HydrologyRegion, hydrologyRegionVectorBytes } from "./HydrologyRegion";
import { RenderChunkKey } from "./SurfaceDependency";
import {
    HydrologyRegionKey,
    SemanticChunkKey
} from "./WorldSemanticFormat";
import {
    ProceduralWorldDescriptorV2,
    serializeWorldDescriptorV2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";
import type {
    WorldSurfaceWorker,
    WorldSurfaceWorkerRequestOptions
} from "../WorldSurfaceWorkerPool";

export interface WorldAuthorityLoadOptions extends WorldSurfaceWorkerRequestOptions {}

export interface WorldAuthoritySource {
    readonly descriptor: WorldDescriptorV2;
    loadSemanticChunk(key: SemanticChunkKey, options?: WorldAuthorityLoadOptions): Promise<BaseSemanticChunk>;
    loadHydrologyRegion(key: HydrologyRegionKey, options?: WorldAuthorityLoadOptions): Promise<HydrologyRegion>;
    dispose(): void;
}

export interface ProceduralWorldAuthoritySourceOptions {
    readonly descriptor: ProceduralWorldDescriptorV2;
    readonly pool: WorldSurfaceWorker;
    readonly ownsPool?: boolean;
}

export class ProceduralWorldAuthoritySource implements WorldAuthoritySource {
    public readonly descriptor: ProceduralWorldDescriptorV2;
    private readonly pool: WorldSurfaceWorker;
    private readonly ownsPool: boolean;
    private disposed = false;

    constructor(options: ProceduralWorldAuthoritySourceOptions) {
        if (!options || !options.pool || typeof options.pool.generateSemanticChunk !== "function"
            || typeof options.pool.generateHydrologyRegion !== "function") {
            throw new TypeError("ProceduralWorldAuthoritySource options are invalid");
        }
        this.descriptor = options.descriptor;
        this.pool = options.pool;
        this.ownsPool = options.ownsPool ?? false;
    }

    public loadSemanticChunk(key: SemanticChunkKey, options: WorldAuthorityLoadOptions = {}): Promise<BaseSemanticChunk> {
        this.assertReady();
        return this.pool.generateSemanticChunk({ descriptor: this.descriptor, key }, options);
    }

    public loadHydrologyRegion(key: HydrologyRegionKey, options: WorldAuthorityLoadOptions = {}): Promise<HydrologyRegion> {
        this.assertReady();
        return this.pool.generateHydrologyRegion({ descriptor: this.descriptor, key }, options);
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.ownsPool) this.pool.dispose();
    }

    private assertReady(): void {
        if (this.disposed) throw new Error("ProceduralWorldAuthoritySource has been disposed");
    }
}

export interface StaticWorldAuthoritySourceOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly semanticChunks: readonly BaseSemanticChunk[];
    readonly hydrologyRegions: readonly HydrologyRegion[];
}

export class StaticWorldAuthoritySource implements WorldAuthoritySource {
    public readonly descriptor: WorldDescriptorV2;
    private readonly semantic = new Map<string, BaseSemanticChunk>();
    private readonly hydrology = new Map<string, HydrologyRegion>();
    private disposed = false;

    constructor(options: StaticWorldAuthoritySourceOptions) {
        if (!options || options.descriptor.sourceKind !== "static"
            || !Array.isArray(options.semanticChunks) || !Array.isArray(options.hydrologyRegions)) {
            throw new TypeError("StaticWorldAuthoritySource options are invalid");
        }
        this.descriptor = options.descriptor;
        for (const chunk of options.semanticChunks) {
            const key = `${chunk.key.chunkX},${chunk.key.chunkY}`;
            if (this.semantic.has(key)) throw new TypeError("static authority source contains duplicate semantic chunks");
            this.semantic.set(key, chunk);
        }
        for (const region of options.hydrologyRegions) {
            const key = `${region.key.regionX},${region.key.regionY}`;
            if (this.hydrology.has(key)) throw new TypeError("static authority source contains duplicate hydrology regions");
            this.hydrology.set(key, region);
        }
    }

    public loadSemanticChunk(key: SemanticChunkKey): Promise<BaseSemanticChunk> {
        this.assertReady();
        const chunk = this.semantic.get(`${key.chunkX},${key.chunkY}`);
        return chunk ? Promise.resolve(chunk) : Promise.reject(new RangeError("static semantic chunk is missing"));
    }

    public loadHydrologyRegion(key: HydrologyRegionKey): Promise<HydrologyRegion> {
        this.assertReady();
        const region = this.hydrology.get(`${key.regionX},${key.regionY}`);
        return region ? Promise.resolve(region) : Promise.reject(new RangeError("static hydrology region is missing"));
    }

    public dispose(): void {
        this.disposed = true;
        this.semantic.clear();
        this.hydrology.clear();
    }

    private assertReady(): void {
        if (this.disposed) throw new Error("StaticWorldAuthoritySource has been disposed");
    }
}

export interface WorldAuthorityRepositoryOptions {
    readonly source: WorldAuthoritySource;
    readonly view: EffectiveWorldView;
    readonly semanticBudgetBytes: number;
    readonly hydrologyBudgetBytes: number;
}

export interface WorldAuthorityRepositoryStats {
    readonly state: "ready" | "disposed";
    readonly semanticEntries: number;
    readonly semanticBytes: number;
    readonly semanticBudgetBytes: number;
    readonly hydrologyEntries: number;
    readonly hydrologyBytes: number;
    readonly hydrologyBudgetBytes: number;
    readonly pinnedSemanticEntries: number;
    readonly pinnedHydrologyEntries: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly evictions: number;
}

interface CacheEntry<T> {
    readonly key: string;
    readonly value: T;
    readonly bytes: number;
    pins: number;
}

interface InFlight<T> {
    readonly promise: Promise<T>;
}

export interface WorldAuthorityLease {
    readonly key: RenderChunkKey;
    readonly snapshot: EffectiveWorldSnapshot;
    readonly released: boolean;
    release(): boolean;
}

function assertBudget(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
}

function semanticKey(key: SemanticChunkKey): string { return `${key.chunkX},${key.chunkY}`; }
function hydrologyKey(key: HydrologyRegionKey): string { return `${key.regionX},${key.regionY}`; }

export class WorldAuthorityRepository {
    public readonly descriptor: WorldDescriptorV2;
    public readonly worldIdentity: string;
    private readonly source: WorldAuthoritySource;
    private readonly view: EffectiveWorldView;
    private readonly semanticBudgetBytes: number;
    private readonly hydrologyBudgetBytes: number;
    private readonly semantic = new Map<string, CacheEntry<BaseSemanticChunk>>();
    private readonly hydrology = new Map<string, CacheEntry<HydrologyRegion>>();
    private readonly semanticInFlight = new Map<string, InFlight<BaseSemanticChunk>>();
    private readonly hydrologyInFlight = new Map<string, InFlight<HydrologyRegion>>();
    private readonly semanticPendingPins = new Map<string, number>();
    private readonly hydrologyPendingPins = new Map<string, number>();
    private semanticBytes = 0;
    private hydrologyBytes = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private evictionCount = 0;
    private disposed = false;

    constructor(options: WorldAuthorityRepositoryOptions) {
        if (!options || !options.source || !options.view
            || serializeWorldDescriptorV2(options.source.descriptor) !== options.view.worldIdentity) {
            throw new TypeError("WorldAuthorityRepository options are invalid or cross-world");
        }
        assertBudget("semantic authority cache budget", options.semanticBudgetBytes);
        assertBudget("hydrology authority cache budget", options.hydrologyBudgetBytes);
        this.source = options.source;
        this.view = options.view;
        this.descriptor = options.source.descriptor;
        this.worldIdentity = options.view.worldIdentity;
        this.semanticBudgetBytes = options.semanticBudgetBytes;
        this.hydrologyBudgetBytes = options.hydrologyBudgetBytes;
    }

    public async capture(renderKey: RenderChunkKey, options: WorldAuthorityLoadOptions = {}): Promise<EffectiveWorldSnapshot> {
        this.assertReady();
        const semanticKeys = surfaceSemanticChunkRequirements(this.descriptor, renderKey);
        const hydrologyKeys = surfaceHydrologyRegionRequirements(this.descriptor, renderKey);
        const [semanticChunks, hydrologyRegions] = await Promise.all([
            Promise.all(semanticKeys.map(key => this.loadSemantic(key, options))),
            Promise.all(hydrologyKeys.map(key => this.loadHydrology(key, options)))
        ]);
        return this.view.capture({ semanticChunks, hydrologyRegions });
    }

    public async retain(renderKey: RenderChunkKey, options: WorldAuthorityLoadOptions = {}): Promise<WorldAuthorityLease> {
        this.assertReady();
        const semanticKeys = surfaceSemanticChunkRequirements(this.descriptor, renderKey);
        const hydrologyKeys = surfaceHydrologyRegionRequirements(this.descriptor, renderKey);
        const semanticEntries: CacheEntry<BaseSemanticChunk>[] = [];
        const hydrologyEntries: CacheEntry<HydrologyRegion>[] = [];
        try {
            const [semanticChunks, hydrologyRegions] = await Promise.all([
                Promise.all(semanticKeys.map(key => this.acquireSemantic(key, options).then(entry => {
                    semanticEntries.push(entry);
                    return entry.value;
                }))),
                Promise.all(hydrologyKeys.map(key => this.acquireHydrology(key, options).then(entry => {
                    hydrologyEntries.push(entry);
                    return entry.value;
                })))
            ]);
            const snapshot = this.view.capture({ semanticChunks, hydrologyRegions });
            let released = false;
            return Object.freeze({
                key: Object.freeze({ ...renderKey }),
                snapshot,
                get released(): boolean { return released; },
                release: () => {
                    if (released) return false;
                    released = true;
                    for (const entry of semanticEntries) entry.pins -= 1;
                    for (const entry of hydrologyEntries) entry.pins -= 1;
                    this.evictSemantic();
                    this.evictHydrology();
                    return true;
                }
            });
        } catch (reason) {
            for (const entry of semanticEntries) entry.pins -= 1;
            for (const entry of hydrologyEntries) entry.pins -= 1;
            throw reason;
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.semantic.clear();
        this.hydrology.clear();
        this.semanticInFlight.clear();
        this.hydrologyInFlight.clear();
        this.semanticPendingPins.clear();
        this.hydrologyPendingPins.clear();
        this.semanticBytes = 0;
        this.hydrologyBytes = 0;
        this.source.dispose();
    }

    public get stats(): Readonly<WorldAuthorityRepositoryStats> {
        let pinnedSemanticEntries = 0;
        let pinnedHydrologyEntries = 0;
        for (const entry of this.semantic.values()) if (entry.pins > 0) pinnedSemanticEntries += 1;
        for (const entry of this.hydrology.values()) if (entry.pins > 0) pinnedHydrologyEntries += 1;
        return Object.freeze({
            state: this.disposed ? "disposed" : "ready",
            semanticEntries: this.semantic.size,
            semanticBytes: this.semanticBytes,
            semanticBudgetBytes: this.semanticBudgetBytes,
            hydrologyEntries: this.hydrology.size,
            hydrologyBytes: this.hydrologyBytes,
            hydrologyBudgetBytes: this.hydrologyBudgetBytes,
            pinnedSemanticEntries,
            pinnedHydrologyEntries,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            evictions: this.evictionCount
        });
    }

    private loadSemantic(key: SemanticChunkKey, options: WorldAuthorityLoadOptions): Promise<BaseSemanticChunk> {
        const serialized = semanticKey(key);
        const cached = this.semantic.get(serialized);
        if (cached) {
            this.cacheHits += 1;
            this.semantic.delete(serialized);
            this.semantic.set(serialized, cached);
            return Promise.resolve(cached.value);
        }
        const active = this.semanticInFlight.get(serialized);
        if (active) {
            this.cacheHits += 1;
            return active.promise;
        }
        this.cacheMisses += 1;
        const promise = this.source.loadSemanticChunk(key, options).then(value => {
            if (this.disposed) throw new Error("WorldAuthorityRepository was disposed during a semantic load");
            if (value.key.chunkX !== key.chunkX || value.key.chunkY !== key.chunkY) {
                throw new TypeError("authority source returned a mismatched semantic chunk");
            }
            const entry: CacheEntry<BaseSemanticChunk> = {
                key: serialized,
                value,
                bytes: BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES,
                pins: this.semanticPendingPins.get(serialized) ?? 0
            };
            this.semanticPendingPins.delete(serialized);
            this.semantic.set(serialized, entry);
            this.semanticBytes += entry.bytes;
            try {
                this.evictSemantic();
            } catch (reason) {
                if (this.semantic.get(serialized) === entry) {
                    this.semantic.delete(serialized);
                    this.semanticBytes -= entry.bytes;
                }
                throw reason;
            }
            if (!this.semantic.has(serialized)) throw new RangeError("semantic authority cache cannot admit its minimum working item");
            return value;
        }).finally(() => this.semanticInFlight.delete(serialized));
        this.semanticInFlight.set(serialized, { promise });
        return promise;
    }

    private loadHydrology(key: HydrologyRegionKey, options: WorldAuthorityLoadOptions): Promise<HydrologyRegion> {
        const serialized = hydrologyKey(key);
        const cached = this.hydrology.get(serialized);
        if (cached) {
            this.cacheHits += 1;
            this.hydrology.delete(serialized);
            this.hydrology.set(serialized, cached);
            return Promise.resolve(cached.value);
        }
        const active = this.hydrologyInFlight.get(serialized);
        if (active) {
            this.cacheHits += 1;
            return active.promise;
        }
        this.cacheMisses += 1;
        const promise = this.source.loadHydrologyRegion(key, options).then(value => {
            if (this.disposed) throw new Error("WorldAuthorityRepository was disposed during a hydrology load");
            if (value.key.regionX !== key.regionX || value.key.regionY !== key.regionY) {
                throw new TypeError("authority source returned a mismatched hydrology region");
            }
            const entry: CacheEntry<HydrologyRegion> = {
                key: serialized,
                value,
                bytes: hydrologyRegionVectorBytes(value),
                pins: this.hydrologyPendingPins.get(serialized) ?? 0
            };
            this.hydrologyPendingPins.delete(serialized);
            this.hydrology.set(serialized, entry);
            this.hydrologyBytes += entry.bytes;
            try {
                this.evictHydrology();
            } catch (reason) {
                if (this.hydrology.get(serialized) === entry) {
                    this.hydrology.delete(serialized);
                    this.hydrologyBytes -= entry.bytes;
                }
                throw reason;
            }
            if (!this.hydrology.has(serialized)) throw new RangeError("hydrology authority cache cannot admit its minimum working item");
            return value;
        }).finally(() => this.hydrologyInFlight.delete(serialized));
        this.hydrologyInFlight.set(serialized, { promise });
        return promise;
    }

    private async acquireSemantic(
        key: SemanticChunkKey,
        options: WorldAuthorityLoadOptions
    ): Promise<CacheEntry<BaseSemanticChunk>> {
        const serialized = semanticKey(key);
        const cached = this.semantic.get(serialized);
        if (cached) {
            cached.pins += 1;
            this.cacheHits += 1;
            this.semantic.delete(serialized);
            this.semantic.set(serialized, cached);
            return cached;
        }
        this.semanticPendingPins.set(serialized, (this.semanticPendingPins.get(serialized) ?? 0) + 1);
        try {
            await this.loadSemantic(key, options);
            const entry = this.semantic.get(serialized);
            if (!entry) throw new RangeError("semantic authority lease was evicted before admission");
            return entry;
        } catch (reason) {
            const pending = this.semanticPendingPins.get(serialized);
            if (pending !== undefined) {
                if (pending <= 1) this.semanticPendingPins.delete(serialized);
                else this.semanticPendingPins.set(serialized, pending - 1);
            }
            throw reason;
        }
    }

    private async acquireHydrology(
        key: HydrologyRegionKey,
        options: WorldAuthorityLoadOptions
    ): Promise<CacheEntry<HydrologyRegion>> {
        const serialized = hydrologyKey(key);
        const cached = this.hydrology.get(serialized);
        if (cached) {
            cached.pins += 1;
            this.cacheHits += 1;
            this.hydrology.delete(serialized);
            this.hydrology.set(serialized, cached);
            return cached;
        }
        this.hydrologyPendingPins.set(serialized, (this.hydrologyPendingPins.get(serialized) ?? 0) + 1);
        try {
            await this.loadHydrology(key, options);
            const entry = this.hydrology.get(serialized);
            if (!entry) throw new RangeError("hydrology authority lease was evicted before admission");
            return entry;
        } catch (reason) {
            const pending = this.hydrologyPendingPins.get(serialized);
            if (pending !== undefined) {
                if (pending <= 1) this.hydrologyPendingPins.delete(serialized);
                else this.hydrologyPendingPins.set(serialized, pending - 1);
            }
            throw reason;
        }
    }

    private evictSemantic(): void {
        while (this.semanticBytes > this.semanticBudgetBytes) {
            const candidate = [...this.semantic.values()].find(entry => entry.pins === 0);
            if (!candidate) throw new RangeError("semantic authority cache budget is exhausted by active leases");
            this.semantic.delete(candidate.key);
            this.semanticBytes -= candidate.bytes;
            this.evictionCount += 1;
        }
    }

    private evictHydrology(): void {
        while (this.hydrologyBytes > this.hydrologyBudgetBytes) {
            const candidate = [...this.hydrology.values()].find(entry => entry.pins === 0);
            if (!candidate) throw new RangeError("hydrology authority cache budget is exhausted by active leases");
            this.hydrology.delete(candidate.key);
            this.hydrologyBytes -= candidate.bytes;
            this.evictionCount += 1;
        }
    }

    private assertReady(): void {
        if (this.disposed) throw new Error("WorldAuthorityRepository has been disposed");
    }
}
