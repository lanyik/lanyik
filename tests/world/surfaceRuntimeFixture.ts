import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BaseSemanticChunk,
    createBaseSemanticChunk,
    semanticCatalogLimits
} from "../../src/world/BaseSemanticChunk";
import { HydrologyRegion, createHydrologyRegion } from "../../src/world/HydrologyRegion";
import { HydrologyWorldSource, HydrologyWorldSourceStats } from "../../src/world/HydrologyWorldSource";
import { SemanticWorldSource, SemanticWorldSourceStats } from "../../src/world/SemanticWorldSource";
import { SurfaceRequestToken } from "../../src/world/SurfaceDependencyKey";
import { SurfaceCompilationPool } from "../../src/world/SurfaceCompilationService";
import { BaseHydrologyFeatureIndex } from "../../src/world/SurfaceDeltaStore";
import { SurfaceCompileResult } from "../../src/world/SurfaceWorkerClient";
import { TransferableEffectiveWindow } from "../../src/world/TransferableEffectiveWindow";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { compileSurfaceChunk } from "../../src/world/compileSurfaceChunk";

const SEMANTIC_STATS: Readonly<SemanticWorldSourceStats> = Object.freeze({
    residentChunks: 0,
    residentBytes: 0,
    leasedChunks: 0,
    inFlightChunks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

const HYDROLOGY_STATS: Readonly<HydrologyWorldSourceStats> = Object.freeze({
    residentRegions: 0,
    residentBytes: 0,
    leasedRegions: 0,
    inFlightRegions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

export class FlatSemanticSource implements SemanticWorldSource {
    public readonly worldIdentity: string;
    public readonly bounds = undefined;
    public readonly stats = SEMANTIC_STATS;
    private readonly chunks = new Map<string, BaseSemanticChunk>();
    private readonly references = new Map<BaseSemanticChunk, number>();

    constructor(public readonly descriptor: WorldDescriptorV2, private readonly height: number) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveChunk(chunkX: number, chunkY: number) {
        return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY)
            ? { chunkX, chunkY } : undefined;
    }

    public chunkDistance(): number { return 0; }

    public loadChunk(chunkX: number, chunkY: number): Promise<BaseSemanticChunk> {
        const identity = `${chunkX}:${chunkY}`;
        let chunk = this.chunks.get(identity);
        if (!chunk) {
            const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
            for (let index = 0; index < BASE_SEMANTIC_CHUNK_TILE_COUNT; index += 1) {
                biomeWeights[index * 4] = 255;
            }
            chunk = createBaseSemanticChunk({
                key: { chunkX, chunkY },
                revision: 0,
                substrateClass: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
                macroHeight: new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT).fill(this.height),
                biomeWeights,
                climate: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2),
                vegetationDensity: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
                vegetationProfile: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT)
            }, semanticCatalogLimits(this.descriptor));
            this.chunks.set(identity, chunk);
        }
        this.references.set(chunk, (this.references.get(chunk) ?? 0) + 1);
        return Promise.resolve(chunk);
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        const owned = chunk as BaseSemanticChunk;
        const count = this.references.get(owned) ?? 0;
        if (count <= 0) throw new Error("semantic runtime fixture lease mismatch");
        this.references.set(owned, count - 1);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(`${chunkX}:${chunkY}`);
    }

    public dispose(): void {}
}

export class EmptyHydrologySource implements HydrologyWorldSource {
    public readonly worldIdentity: string;
    public readonly stats = HYDROLOGY_STATS;
    private readonly regions = new Map<string, HydrologyRegion>();
    private readonly references = new Map<HydrologyRegion, number>();

    constructor(public readonly descriptor: WorldDescriptorV2) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveRegion(regionX: number, regionY: number) {
        return Number.isSafeInteger(regionX) && Number.isSafeInteger(regionY)
            ? { regionX, regionY } : undefined;
    }

    public regionDistance(): number { return 0; }

    public loadRegion(regionX: number, regionY: number): Promise<HydrologyRegion> {
        const identity = `${regionX}:${regionY}`;
        let region = this.regions.get(identity);
        if (!region) {
            region = createHydrologyRegion({
                worldIdentity: this.worldIdentity,
                topology: "infinite",
                key: { regionX, regionY },
                revision: 0,
                validBounds: { minX: 0, minY: 0, maxXExclusive: 128, maxYExclusive: 128 },
                boundaryPorts: [],
                rivers: [],
                lakes: [],
                mouths: [],
                bodies: []
            });
            this.regions.set(identity, region);
        }
        this.references.set(region, (this.references.get(region) ?? 0) + 1);
        return Promise.resolve(region);
    }

    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        const owned = region as HydrologyRegion;
        const count = this.references.get(owned) ?? 0;
        if (count <= 0) throw new Error("hydrology runtime fixture lease mismatch");
        this.references.set(owned, count - 1);
    }

    public hasRegion(regionX: number, regionY: number): boolean {
        return this.regions.has(`${regionX}:${regionY}`);
    }

    public dispose(): void {}
}

export interface DeferredSurfaceCall {
    readonly requestToken: SurfaceRequestToken;
    readonly effectiveWindow: TransferableEffectiveWindow;
    resolve(result: SurfaceCompileResult): void;
}

export class DeferredSurfaceCompilationPool implements SurfaceCompilationPool {
    public readonly calls: DeferredSurfaceCall[] = [];

    public compileSurfaceChunk(options: Readonly<{
        requestToken: SurfaceRequestToken;
        effectiveWindow: TransferableEffectiveWindow;
    }>): Promise<SurfaceCompileResult> {
        return new Promise(resolve => this.calls.push({ ...options, resolve }));
    }

    public resolve(index: number): void {
        const call = this.calls[index];
        call.resolve({
            requestToken: call.requestToken,
            chunk: compileSurfaceChunk(call.effectiveWindow)
        });
    }
}

export const EMPTY_BASE_HYDROLOGY_INDEX: BaseHydrologyFeatureIndex = Object.freeze({
    resolveFeature: () => undefined,
    referencesTo: () => []
});
