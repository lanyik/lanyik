import { BaseSemanticChunk, SemanticChunkKey } from "./BaseSemanticChunk";
import {
    EffectiveSemanticChunk,
    createEffectiveSemanticChunk
} from "./EffectiveSemanticChunk";
import {
    HydrologyFeatureSpatialIndex
} from "./HydrologyFeatureSpatialIndex";
import {
    HydrologyFeatureUpsertDelta
} from "./HydrologyFeatureDelta";
import {
    HydrologyRegion,
    HydrologyRegionKey,
    assertHydrologyRegion
} from "./HydrologyRegion";
import {
    HydrologyWorldSource,
    assertHydrologyWorldSource
} from "./HydrologyWorldSource";
import {
    SemanticWorldSource,
    assertSemanticWorldSource
} from "./SemanticWorldSource";
import { SurfaceDeltaSnapshot } from "./SurfaceDeltaStore";
import { SurfaceTaskRequestOptions } from "./SurfaceWorkerPool";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "./WorldDescriptorV2";

export interface EffectiveHydrologyRegion {
    readonly worldIdentity: string;
    readonly key: HydrologyRegionKey;
    readonly effectiveRevision: number;
    readonly baseRevision: number;
    readonly base: HydrologyRegion;
    readonly effectiveBase: EffectiveBaseHydrologySlices;
    readonly suppressedBaseFeatureIds: readonly string[];
    readonly authoredFeatures: readonly HydrologyFeatureUpsertDelta[];
}

export interface EffectiveBaseHydrologySlices {
    readonly boundaryPorts: HydrologyRegion["boundaryPorts"];
    readonly rivers: HydrologyRegion["rivers"];
    readonly lakes: HydrologyRegion["lakes"];
    readonly mouths: HydrologyRegion["mouths"];
    readonly bodies: HydrologyRegion["bodies"];
}

export interface CreateEffectiveHydrologyRegionOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly base: HydrologyRegion;
    readonly deltaSnapshot: SurfaceDeltaSnapshot;
    readonly featureIndex: HydrologyFeatureSpatialIndex;
}

export interface EffectiveWorldViewOptions {
    readonly semanticSource: SemanticWorldSource;
    readonly hydrologySource: HydrologyWorldSource;
    readonly deltaSnapshot: SurfaceDeltaSnapshot;
}

export interface EffectiveWorldViewStats {
    readonly effectiveRevision: number;
    readonly leasedSemanticChunks: number;
    readonly leasedHydrologyRegions: number;
    readonly authoredHydrologyFeatures: number;
    readonly authoredHydrologyIndexItems: number;
}

function compareIdentity(first: string, second: string): number {
    return first < second ? -1 : first > second ? 1 : 0;
}

function collectBaseFeatureIds(region: Readonly<HydrologyRegion>): readonly string[] {
    const featureIds = new Set<string>();
    for (const port of region.boundaryPorts) featureIds.add(port.riverId);
    for (const river of region.rivers) featureIds.add(river.riverId);
    for (const lake of region.lakes) featureIds.add(lake.bodyId);
    for (const mouth of region.mouths) featureIds.add(mouth.riverId);
    for (const body of region.bodies) if (body.bodyId !== "ocean") featureIds.add(body.bodyId);
    return Object.freeze([...featureIds].sort(compareIdentity));
}

function effectiveBaseSlices(
    region: Readonly<HydrologyRegion>,
    suppressedFeatureIds: ReadonlySet<string>
): EffectiveBaseHydrologySlices {
    if (suppressedFeatureIds.size === 0) {
        return Object.freeze({
            boundaryPorts: region.boundaryPorts,
            rivers: region.rivers,
            lakes: region.lakes,
            mouths: region.mouths,
            bodies: region.bodies
        });
    }
    return Object.freeze({
        boundaryPorts: Object.freeze(region.boundaryPorts
            .filter(port => !suppressedFeatureIds.has(port.riverId))),
        rivers: Object.freeze(region.rivers
            .filter(river => !suppressedFeatureIds.has(river.riverId))),
        lakes: Object.freeze(region.lakes
            .filter(lake => !suppressedFeatureIds.has(lake.bodyId))),
        mouths: Object.freeze(region.mouths
            .filter(mouth => !suppressedFeatureIds.has(mouth.riverId))),
        bodies: Object.freeze(region.bodies
            .filter(body => body.bodyId === "ocean" || !suppressedFeatureIds.has(body.bodyId)))
    });
}

export function createEffectiveHydrologyRegion(
    options: Readonly<CreateEffectiveHydrologyRegionOptions>
): EffectiveHydrologyRegion {
    if (!options || typeof options !== "object") {
        throw new TypeError("effective hydrology region options are required");
    }
    assertHydrologyRegion(options.base);
    const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
    if (options.base.worldIdentity !== worldIdentity
        || options.deltaSnapshot.worldIdentity !== worldIdentity
        || options.featureIndex.worldIdentity !== worldIdentity) {
        throw new TypeError("effective hydrology inputs belong to different worlds");
    }
    if (options.base.topology !== options.descriptor.topology) {
        throw new TypeError("effective hydrology base topology does not match its descriptor");
    }
    if (options.base.revision > options.deltaSnapshot.effectiveRevision) {
        throw new RangeError("base hydrology region is newer than its effective snapshot");
    }
    const suppressedBaseFeatureIds = collectBaseFeatureIds(options.base)
        .filter(featureId => options.deltaSnapshot.getHydrologyDelta(featureId) !== undefined);
    const suppressedFeatureIds = new Set(suppressedBaseFeatureIds);
    const authoredFeatures = options.featureIndex.queryRegion(options.base);
    for (const delta of authoredFeatures) {
        if (delta.revision > options.deltaSnapshot.effectiveRevision) {
            throw new RangeError("authored hydrology feature is newer than its effective snapshot");
        }
    }
    return Object.freeze({
        worldIdentity,
        key: options.base.key,
        effectiveRevision: options.deltaSnapshot.effectiveRevision,
        baseRevision: options.base.revision,
        base: options.base,
        effectiveBase: effectiveBaseSlices(options.base, suppressedFeatureIds),
        suppressedBaseFeatureIds: Object.freeze(suppressedBaseFeatureIds),
        authoredFeatures
    });
}

export function effectiveHydrologySuppressesBaseFeature(
    region: Readonly<EffectiveHydrologyRegion>,
    featureId: string
): boolean {
    if (typeof featureId !== "string" || featureId.length === 0) {
        throw new TypeError("effective hydrology base feature identity is required");
    }
    let minimum = 0;
    let maximum = region.suppressedBaseFeatureIds.length - 1;
    while (minimum <= maximum) {
        const middle = (minimum + maximum) >>> 1;
        const candidate = region.suppressedBaseFeatureIds[middle];
        if (candidate === featureId) return true;
        if (candidate < featureId) minimum = middle + 1;
        else maximum = middle - 1;
    }
    return false;
}

export class EffectiveWorldView {
    public readonly descriptor: WorldDescriptorV2;
    public readonly worldIdentity: string;
    public readonly effectiveRevision: number;
    public readonly deltaSnapshot: SurfaceDeltaSnapshot;
    private readonly semanticSource: SemanticWorldSource;
    private readonly hydrologySource: HydrologyWorldSource;
    private readonly featureIndex: HydrologyFeatureSpatialIndex;
    private readonly semanticLeases = new Map<EffectiveSemanticChunk, BaseSemanticChunk>();
    private readonly hydrologyLeases = new Map<EffectiveHydrologyRegion, HydrologyRegion>();
    private disposed = false;

    constructor(options: Readonly<EffectiveWorldViewOptions>) {
        if (!options || typeof options !== "object") {
            throw new TypeError("effective world view options are required");
        }
        assertSemanticWorldSource(options.semanticSource);
        assertHydrologyWorldSource(options.hydrologySource);
        const worldIdentity = options.semanticSource.worldIdentity;
        if (options.hydrologySource.worldIdentity !== worldIdentity
            || options.deltaSnapshot.worldIdentity !== worldIdentity) {
            throw new TypeError("effective world view sources and delta snapshot belong to different worlds");
        }
        this.descriptor = options.semanticSource.descriptor;
        this.worldIdentity = worldIdentity;
        this.effectiveRevision = options.deltaSnapshot.effectiveRevision;
        this.deltaSnapshot = options.deltaSnapshot;
        this.semanticSource = options.semanticSource;
        this.hydrologySource = options.hydrologySource;
        this.featureIndex = new HydrologyFeatureSpatialIndex(
            this.descriptor,
            this.deltaSnapshot.hydrologyDeltas
        );
    }

    public resolveSemanticChunk(chunkX: number, chunkY: number): SemanticChunkKey | undefined {
        this.assertActive();
        return this.semanticSource.resolveChunk(chunkX, chunkY);
    }

    public resolveHydrologyRegion(regionX: number, regionY: number): HydrologyRegionKey | undefined {
        this.assertActive();
        return this.hydrologySource.resolveRegion(regionX, regionY);
    }

    public async loadSemanticChunk(
        chunkX: number,
        chunkY: number,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<EffectiveSemanticChunk> {
        this.assertActive();
        const resolved = this.semanticSource.resolveChunk(chunkX, chunkY);
        if (!resolved || resolved.chunkX !== chunkX || resolved.chunkY !== chunkY) {
            throw new RangeError("effective semantic request must use a canonical in-domain key");
        }
        const base = await this.semanticSource.loadChunk(chunkX, chunkY, request);
        if (this.disposed) {
            this.semanticSource.releaseChunk(base);
            throw new Error("effective world view was disposed during semantic loading");
        }
        try {
            const effective = createEffectiveSemanticChunk({
                descriptor: this.descriptor,
                base,
                delta: this.deltaSnapshot.getSemanticDelta(chunkX, chunkY),
                effectiveRevision: this.effectiveRevision
            });
            this.semanticLeases.set(effective, base);
            return effective;
        } catch (reason) {
            this.semanticSource.releaseChunk(base);
            throw reason;
        }
    }

    public releaseSemanticChunk(chunk: Readonly<EffectiveSemanticChunk>): void {
        const base = this.semanticLeases.get(chunk as EffectiveSemanticChunk);
        if (!base) throw new Error("effective semantic release does not match an active view lease");
        this.semanticLeases.delete(chunk as EffectiveSemanticChunk);
        this.semanticSource.releaseChunk(base);
    }

    public async loadHydrologyRegion(
        regionX: number,
        regionY: number,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<EffectiveHydrologyRegion> {
        this.assertActive();
        const resolved = this.hydrologySource.resolveRegion(regionX, regionY);
        if (!resolved || resolved.regionX !== regionX || resolved.regionY !== regionY) {
            throw new RangeError("effective hydrology request must use a canonical in-domain key");
        }
        const base = await this.hydrologySource.loadRegion(regionX, regionY, request);
        if (this.disposed) {
            this.hydrologySource.releaseRegion(base);
            throw new Error("effective world view was disposed during hydrology loading");
        }
        try {
            const effective = createEffectiveHydrologyRegion({
                descriptor: this.descriptor,
                base,
                deltaSnapshot: this.deltaSnapshot,
                featureIndex: this.featureIndex
            });
            this.hydrologyLeases.set(effective, base);
            return effective;
        } catch (reason) {
            this.hydrologySource.releaseRegion(base);
            throw reason;
        }
    }

    public releaseHydrologyRegion(region: Readonly<EffectiveHydrologyRegion>): void {
        const base = this.hydrologyLeases.get(region as EffectiveHydrologyRegion);
        if (!base) throw new Error("effective hydrology release does not match an active view lease");
        this.hydrologyLeases.delete(region as EffectiveHydrologyRegion);
        this.hydrologySource.releaseRegion(base);
    }

    public get stats(): Readonly<EffectiveWorldViewStats> {
        return Object.freeze({
            effectiveRevision: this.effectiveRevision,
            leasedSemanticChunks: this.semanticLeases.size,
            leasedHydrologyRegions: this.hydrologyLeases.size,
            authoredHydrologyFeatures: this.featureIndex.featureCount,
            authoredHydrologyIndexItems: this.featureIndex.itemCount
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const base of this.semanticLeases.values()) this.semanticSource.releaseChunk(base);
        for (const base of this.hydrologyLeases.values()) this.hydrologySource.releaseRegion(base);
        this.semanticLeases.clear();
        this.hydrologyLeases.clear();
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("effective world view has been disposed");
    }
}
