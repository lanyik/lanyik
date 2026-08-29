import {
    BaseSemanticChunk,
    SemanticChunkKey
} from "./BaseSemanticChunk";
import { HydrologyRegion } from "./HydrologyRegion";
import { InfiniteHydrologyRegionSource } from "./InfiniteHydrologyRegionSource";
import { buildMacroDrainageGraph } from "./MacroDrainageGraph";
import { MacroDrainageHydrologySource } from "./MacroDrainageHydrologySource";
import {
    SemanticWorldBounds,
    SemanticWorldSource,
    SemanticWorldSourceStats
} from "./SemanticWorldSource";
import { SurfaceTaskRequestOptions } from "./SurfaceWorkerPool";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import {
    BaseSemanticChunkGenerator,
    createBaseSemanticChunkGenerator
} from "./generateBaseSemanticChunk";
import {
    InfiniteWorldDescriptorV2,
    ToroidalWorldDescriptorV2,
    WorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

export type ProceduralHydrologyDescriptorV2 = InfiniteWorldDescriptorV2 | ToroidalWorldDescriptorV2;

export interface ProceduralHydrologyRegionGenerator {
    readonly descriptor: ProceduralHydrologyDescriptorV2;
    readonly identity: string;
    generate(regionX: number, regionY: number): Promise<HydrologyRegion>;
}

export interface CreateProceduralHydrologyRegionGeneratorOptions {
    readonly descriptor: ProceduralHydrologyDescriptorV2;
}

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("local semantic generation was aborted", "AbortError");
    }
    const error = new Error("local semantic generation was aborted");
    error.name = "AbortError";
    return error;
}

function semanticChunkPayloadBytes(chunk: Readonly<BaseSemanticChunk>): number {
    return chunk.substrateClass.byteLength
        + chunk.macroHeight.byteLength
        + chunk.biomeWeights.byteLength
        + chunk.climate.byteLength
        + chunk.vegetationDensity.byteLength
        + chunk.vegetationProfile.byteLength;
}

class GeneratorToroidalSemanticSource implements SemanticWorldSource {
    public readonly descriptor: ToroidalWorldDescriptorV2;
    public readonly worldIdentity: string;
    public readonly bounds: SemanticWorldBounds;
    private readonly generator: BaseSemanticChunkGenerator;
    private readonly leases = new Set<BaseSemanticChunk>();
    private residentBytes = 0;
    private disposed = false;

    constructor(descriptor: ToroidalWorldDescriptorV2, generator: BaseSemanticChunkGenerator) {
        this.descriptor = descriptor;
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
        if (generator.identity !== this.worldIdentity) {
            throw new TypeError("toroidal hydrology semantic generator identity does not match its descriptor");
        }
        this.generator = generator;
        this.bounds = Object.freeze({
            width: descriptor.width,
            height: descriptor.height,
            topology: "toroidal"
        });
    }

    public resolveChunk(chunkX: number, chunkY: number): SemanticChunkKey | undefined {
        if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) return undefined;
        return Object.freeze({
            chunkX: positiveModulo(chunkX, this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE),
            chunkY: positiveModulo(chunkY, this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE)
        });
    }

    public chunkDistance(chunkX: number, chunkY: number, centerChunkX: number, centerChunkY: number): number {
        const first = this.resolveChunk(chunkX, chunkY);
        const second = this.resolveChunk(centerChunkX, centerChunkY);
        if (!first || !second) return Number.POSITIVE_INFINITY;
        const countX = this.descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
        const countY = this.descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
        const distanceX = Math.min(
            Math.abs(first.chunkX - second.chunkX),
            countX - Math.abs(first.chunkX - second.chunkX)
        );
        const distanceY = Math.min(
            Math.abs(first.chunkY - second.chunkY),
            countY - Math.abs(first.chunkY - second.chunkY)
        );
        return Math.hypot(distanceX, distanceY);
    }

    public loadChunk(
        chunkX: number,
        chunkY: number,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<BaseSemanticChunk> {
        if (this.disposed) return Promise.reject(new Error("local toroidal semantic source has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        const key = this.resolveChunk(chunkX, chunkY);
        if (!key || key.chunkX !== chunkX || key.chunkY !== chunkY) {
            return Promise.reject(new RangeError("local toroidal semantic request requires a canonical chunk key"));
        }
        try {
            const chunk = this.generator.generate(chunkX, chunkY);
            this.leases.add(chunk);
            this.residentBytes += semanticChunkPayloadBytes(chunk);
            return Promise.resolve(chunk);
        } catch (reason) {
            return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        if (!this.leases.delete(chunk as BaseSemanticChunk)) {
            throw new Error("local toroidal semantic release does not match an active lease");
        }
        this.residentBytes -= semanticChunkPayloadBytes(chunk);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        for (const chunk of this.leases) {
            if (chunk.key.chunkX === chunkX && chunk.key.chunkY === chunkY) return true;
        }
        return false;
    }

    public get stats(): Readonly<SemanticWorldSourceStats> {
        return Object.freeze({
            residentChunks: this.leases.size,
            residentBytes: this.residentBytes,
            leasedChunks: this.leases.size,
            inFlightChunks: 0,
            cacheHits: 0,
            cacheMisses: 0,
            workers: 0,
            busyWorkers: 0,
            queuedWorkerTasks: 0
        });
    }

    public dispose(): void {
        if (this.leases.size !== 0) {
            throw new Error("local toroidal semantic source cannot dispose active leases");
        }
        this.disposed = true;
    }
}

class InfiniteProceduralHydrologyRegionGenerator implements ProceduralHydrologyRegionGenerator {
    public readonly descriptor: InfiniteWorldDescriptorV2;
    public readonly identity: string;
    private readonly source: InfiniteHydrologyRegionSource;

    constructor(descriptor: InfiniteWorldDescriptorV2) {
        this.descriptor = descriptor;
        this.identity = serializeWorldDescriptorV2(descriptor);
        this.source = new InfiniteHydrologyRegionSource({ descriptor });
    }

    public generate(regionX: number, regionY: number): Promise<HydrologyRegion> {
        try {
            return Promise.resolve(this.source.buildRegion(regionX, regionY));
        } catch (reason) {
            return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
    }
}

class ToroidalProceduralHydrologyRegionGenerator implements ProceduralHydrologyRegionGenerator {
    public readonly descriptor: ToroidalWorldDescriptorV2;
    public readonly identity: string;
    private readonly source: Promise<MacroDrainageHydrologySource>;

    constructor(descriptor: ToroidalWorldDescriptorV2, semanticGenerator: BaseSemanticChunkGenerator) {
        this.descriptor = descriptor;
        this.identity = serializeWorldDescriptorV2(descriptor);
        const semanticSource = new GeneratorToroidalSemanticSource(descriptor, semanticGenerator);
        this.source = buildMacroDrainageGraph(semanticSource)
            .then(graph => new MacroDrainageHydrologySource(graph))
            .finally(() => semanticSource.dispose());
    }

    public async generate(regionX: number, regionY: number): Promise<HydrologyRegion> {
        return (await this.source).buildRegion(regionX, regionY);
    }
}

export function createProceduralHydrologyRegionGenerator(
    options: Readonly<CreateProceduralHydrologyRegionGeneratorOptions>
): ProceduralHydrologyRegionGenerator {
    if (!options || typeof options !== "object") {
        throw new TypeError("procedural hydrology generator options are required");
    }
    assertWorldDescriptorV2(options.descriptor as WorldDescriptorV2);
    if (options.descriptor.sourceKind === "procedural-infinite") {
        return new InfiniteProceduralHydrologyRegionGenerator(options.descriptor);
    }
    return new ToroidalProceduralHydrologyRegionGenerator(
        options.descriptor,
        createBaseSemanticChunkGenerator(options.descriptor)
    );
}
