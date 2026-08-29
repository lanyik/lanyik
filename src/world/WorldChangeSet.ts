import { SemanticChunkKey, semanticCatalogLimits } from "./BaseSemanticChunk";
import {
    AuthoredHydrologyFeatureKind,
    HydrologyFeatureDelta
} from "./HydrologyFeatureDelta";
import {
    HydrologyFeatureBoundsQ64,
    authoredHydrologyFeatureBoundsQ64,
    projectHydrologyBoundsQ64
} from "./HydrologyFeatureSpatialIndex";
import { HYDROLOGY_POINT_QUANTIZATION, HydrologyRegionKey } from "./HydrologyRegion";
import {
    SEMANTIC_DELTA_FIELD_BIOME,
    SEMANTIC_DELTA_FIELD_HEIGHT,
    SEMANTIC_DELTA_FIELD_SUBSTRATE,
    SEMANTIC_DELTA_FIELD_VEGETATION,
    SparseSemanticDelta,
    assertSparseSemanticDelta
} from "./SparseSemanticDelta";
import {
    BaseHydrologyFeatureIndex,
    EffectiveHydrologyGraphNode,
    MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL,
    SurfaceDeltaCommit,
    SurfaceDeltaSnapshot
} from "./SurfaceDeltaStore";
import { RenderChunkKey } from "./SurfaceDependencyKey";
import {
    HYDROLOGY_REGION_SIZE,
    SURFACE_COMPILE_PROFILE,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";
import {
    WorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

export const WORLD_CHANGE_DOMAIN_HEIGHT = 1 << 0;
export const WORLD_CHANGE_DOMAIN_MATERIAL = 1 << 1;
export const WORLD_CHANGE_DOMAIN_HYDROLOGY = 1 << 2;
export const WORLD_CHANGE_DOMAIN_VEGETATION = 1 << 3;
export const WORLD_CHANGE_DOMAIN_NAVIGATION = 1 << 4;
export const WORLD_CHANGE_DOMAIN_FOG = 1 << 5;
export const WORLD_CHANGE_DOMAIN_APPLICATION = 1 << 6;
export const WORLD_CHANGE_DOMAIN_ALL = WORLD_CHANGE_DOMAIN_HEIGHT
    | WORLD_CHANGE_DOMAIN_MATERIAL
    | WORLD_CHANGE_DOMAIN_HYDROLOGY
    | WORLD_CHANGE_DOMAIN_VEGETATION
    | WORLD_CHANGE_DOMAIN_NAVIGATION
    | WORLD_CHANGE_DOMAIN_FOG
    | WORLD_CHANGE_DOMAIN_APPLICATION;

const SURFACE_DELTA_CHANGE_DOMAINS = WORLD_CHANGE_DOMAIN_HEIGHT
    | WORLD_CHANGE_DOMAIN_MATERIAL
    | WORLD_CHANGE_DOMAIN_HYDROLOGY
    | WORLD_CHANGE_DOMAIN_VEGETATION;

export interface TileBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

export interface DirtySemanticDomainBounds {
    readonly domain: number;
    readonly localBounds: TileBounds;
}

export interface DirtySemanticChunk {
    readonly key: SemanticChunkKey;
    readonly domains: number;
    readonly localBounds: TileBounds;
    readonly domainBounds: readonly DirtySemanticDomainBounds[];
}

export interface DirtyHydrologyFeature {
    readonly featureId: string;
    readonly featureKind: AuthoredHydrologyFeatureKind;
    readonly operation: "upsert" | "delete";
    readonly previousBounds: readonly HydrologyFeatureBoundsQ64[];
    readonly nextBounds: readonly HydrologyFeatureBoundsQ64[];
}

export interface DirtyHydrologyRegion {
    readonly key: HydrologyRegionKey;
    readonly domains: typeof WORLD_CHANGE_DOMAIN_HYDROLOGY;
}

export interface DirtyRenderChunk {
    readonly key: RenderChunkKey;
    readonly domains: number;
}

export interface WorldChangeSet {
    readonly worldIdentity: string;
    readonly revision: number;
    readonly transactionId: bigint;
    readonly domains: number;
    readonly semanticChunks: readonly DirtySemanticChunk[];
    readonly hydrologyFeatures: readonly DirtyHydrologyFeature[];
    readonly hydrologyRegions: readonly DirtyHydrologyRegion[];
    readonly renderChunks: readonly DirtyRenderChunk[];
}

export interface BaseHydrologyChangeIndex extends BaseHydrologyFeatureIndex {
    resolveBoundsQ64(featureId: string): HydrologyFeatureBoundsQ64 | undefined;
}

export interface WorldChangeResidency {
    readonly hydrologyRegions: readonly HydrologyRegionKey[];
    readonly renderChunks: readonly RenderChunkKey[];
}

export interface CreateWorldChangeSetOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly baseHydrology: BaseHydrologyChangeIndex;
    readonly before: SurfaceDeltaSnapshot;
    readonly commit: SurfaceDeltaCommit;
    readonly residency: WorldChangeResidency;
}

interface MutableTileBounds {
    minX: number;
    minY: number;
    maxXExclusive: number;
    maxYExclusive: number;
}

interface SemanticImpact {
    readonly domain: number;
    readonly bounds: readonly HydrologyFeatureBoundsQ64[];
}

function includeTile(bounds: MutableTileBounds | undefined, tileIndex: number): MutableTileBounds {
    const x = Math.floor(tileIndex / WORLD_SEMANTIC_CHUNK_SIZE);
    const y = tileIndex - x * WORLD_SEMANTIC_CHUNK_SIZE;
    if (!bounds) return { minX: x, minY: y, maxXExclusive: x + 1, maxYExclusive: y + 1 };
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxXExclusive = Math.max(bounds.maxXExclusive, x + 1);
    bounds.maxYExclusive = Math.max(bounds.maxYExclusive, y + 1);
    return bounds;
}

function frozenTileBounds(bounds: MutableTileBounds): TileBounds {
    return Object.freeze({ ...bounds });
}

function entryHas(delta: SparseSemanticDelta | undefined, index: number, field: number): boolean {
    return delta !== undefined && index >= 0 && (delta.fieldMask[index] & field) !== 0;
}

function scalarFieldChanged(
    before: SparseSemanticDelta | undefined,
    beforeIndex: number,
    after: SparseSemanticDelta | undefined,
    afterIndex: number,
    field: number,
    values: (delta: SparseSemanticDelta) => Uint8Array | Uint16Array
): boolean {
    const beforePresent = entryHas(before, beforeIndex, field);
    const afterPresent = entryHas(after, afterIndex, field);
    if (beforePresent !== afterPresent) return true;
    return beforePresent && values(before!)[beforeIndex] !== values(after!)[afterIndex];
}

function biomeFieldChanged(
    before: SparseSemanticDelta | undefined,
    beforeIndex: number,
    after: SparseSemanticDelta | undefined,
    afterIndex: number
): boolean {
    const beforePresent = entryHas(before, beforeIndex, SEMANTIC_DELTA_FIELD_BIOME);
    const afterPresent = entryHas(after, afterIndex, SEMANTIC_DELTA_FIELD_BIOME);
    if (beforePresent !== afterPresent) return true;
    if (!beforePresent) return false;
    for (let basis = 0; basis < 4; basis += 1) {
        if (before!.biomeWeights[beforeIndex * 4 + basis]
            !== after!.biomeWeights[afterIndex * 4 + basis]) return true;
    }
    return false;
}

function vegetationFieldChanged(
    before: SparseSemanticDelta | undefined,
    beforeIndex: number,
    after: SparseSemanticDelta | undefined,
    afterIndex: number
): boolean {
    const beforePresent = entryHas(before, beforeIndex, SEMANTIC_DELTA_FIELD_VEGETATION);
    const afterPresent = entryHas(after, afterIndex, SEMANTIC_DELTA_FIELD_VEGETATION);
    if (beforePresent !== afterPresent) return true;
    return beforePresent && (before!.vegetationDensity[beforeIndex]
        !== after!.vegetationDensity[afterIndex]
        || before!.vegetationProfile[beforeIndex] !== after!.vegetationProfile[afterIndex]);
}

function semanticDirtyChunk(
    descriptor: WorldDescriptorV2,
    key: SemanticChunkKey,
    before: SparseSemanticDelta | undefined,
    after: SparseSemanticDelta | undefined
): DirtySemanticChunk {
    if (before) assertSparseSemanticDelta(before, semanticCatalogLimits(descriptor));
    if (after) assertSparseSemanticDelta(after, semanticCatalogLimits(descriptor));
    const domainBounds = new Map<number, MutableTileBounds>();
    let beforeIndex = 0;
    let afterIndex = 0;
    while (beforeIndex < (before?.tileIndex.length ?? 0)
        || afterIndex < (after?.tileIndex.length ?? 0)) {
        const beforeTile = beforeIndex < (before?.tileIndex.length ?? 0)
            ? before!.tileIndex[beforeIndex] : Number.POSITIVE_INFINITY;
        const afterTile = afterIndex < (after?.tileIndex.length ?? 0)
            ? after!.tileIndex[afterIndex] : Number.POSITIVE_INFINITY;
        const tileIndex = Math.min(beforeTile, afterTile);
        const currentBefore = beforeTile === tileIndex ? beforeIndex : -1;
        const currentAfter = afterTile === tileIndex ? afterIndex : -1;
        if (scalarFieldChanged(
            before,
            currentBefore,
            after,
            currentAfter,
            SEMANTIC_DELTA_FIELD_HEIGHT,
            delta => delta.macroHeight
        )) {
            domainBounds.set(
                WORLD_CHANGE_DOMAIN_HEIGHT,
                includeTile(domainBounds.get(WORLD_CHANGE_DOMAIN_HEIGHT), tileIndex)
            );
        }
        const substrateChanged = scalarFieldChanged(
            before,
            currentBefore,
            after,
            currentAfter,
            SEMANTIC_DELTA_FIELD_SUBSTRATE,
            delta => delta.substrateClass
        );
        if (substrateChanged || biomeFieldChanged(before, currentBefore, after, currentAfter)) {
            domainBounds.set(
                WORLD_CHANGE_DOMAIN_MATERIAL,
                includeTile(domainBounds.get(WORLD_CHANGE_DOMAIN_MATERIAL), tileIndex)
            );
        }
        if (vegetationFieldChanged(before, currentBefore, after, currentAfter)) {
            domainBounds.set(
                WORLD_CHANGE_DOMAIN_VEGETATION,
                includeTile(domainBounds.get(WORLD_CHANGE_DOMAIN_VEGETATION), tileIndex)
            );
        }
        if (beforeTile === tileIndex) beforeIndex += 1;
        if (afterTile === tileIndex) afterIndex += 1;
    }
    if (domainBounds.size === 0) {
        throw new Error("surface semantic commit changed only revision without changing authoritative fields");
    }
    let domains = 0;
    let union: MutableTileBounds | undefined;
    const orderedDomainBounds: DirtySemanticDomainBounds[] = [];
    for (const domain of [
        WORLD_CHANGE_DOMAIN_HEIGHT,
        WORLD_CHANGE_DOMAIN_MATERIAL,
        WORLD_CHANGE_DOMAIN_VEGETATION
    ]) {
        const bounds = domainBounds.get(domain);
        if (!bounds) continue;
        domains |= domain;
        union = union
            ? {
                minX: Math.min(union.minX, bounds.minX),
                minY: Math.min(union.minY, bounds.minY),
                maxXExclusive: Math.max(union.maxXExclusive, bounds.maxXExclusive),
                maxYExclusive: Math.max(union.maxYExclusive, bounds.maxYExclusive)
            }
            : { ...bounds };
        orderedDomainBounds.push(Object.freeze({ domain, localBounds: frozenTileBounds(bounds) }));
    }
    return Object.freeze({
        key: Object.freeze({ chunkX: key.chunkX, chunkY: key.chunkY }),
        domains,
        localBounds: frozenTileBounds(union!),
        domainBounds: Object.freeze(orderedDomainBounds)
    });
}

function projectedTileBounds(
    descriptor: WorldDescriptorV2,
    chunkKey: SemanticChunkKey,
    localBounds: TileBounds
): readonly HydrologyFeatureBoundsQ64[] {
    const origin = chunkOrigin(chunkKey.chunkX, chunkKey.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    const half = HYDROLOGY_POINT_QUANTIZATION / 2;
    return projectHydrologyBoundsQ64(descriptor, {
        minX: (origin.x + localBounds.minX) * HYDROLOGY_POINT_QUANTIZATION - half,
        minY: (origin.y + localBounds.minY) * HYDROLOGY_POINT_QUANTIZATION - half,
        maxX: (origin.x + localBounds.maxXExclusive) * HYDROLOGY_POINT_QUANTIZATION - half,
        maxY: (origin.y + localBounds.maxYExclusive) * HYDROLOGY_POINT_QUANTIZATION - half
    });
}

function intersects(
    first: Readonly<HydrologyFeatureBoundsQ64>,
    second: Readonly<HydrologyFeatureBoundsQ64>
): boolean {
    return first.minX <= second.maxX && first.maxX >= second.minX
        && first.minY <= second.maxY && first.maxY >= second.minY;
}

function projectedRenderDependencyBounds(
    descriptor: WorldDescriptorV2,
    key: Readonly<RenderChunkKey>
): readonly HydrologyFeatureBoundsQ64[] {
    const origin = chunkOrigin(
        key.chunkX,
        key.chunkY,
        SURFACE_COMPILE_PROFILE.renderChunkSize
    );
    const radius = SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
    const half = HYDROLOGY_POINT_QUANTIZATION / 2;
    return projectHydrologyBoundsQ64(descriptor, {
        minX: (origin.x - radius) * HYDROLOGY_POINT_QUANTIZATION - half,
        minY: (origin.y - radius) * HYDROLOGY_POINT_QUANTIZATION - half,
        maxX: (origin.x + SURFACE_COMPILE_PROFILE.renderChunkSize + radius)
            * HYDROLOGY_POINT_QUANTIZATION - half,
        maxY: (origin.y + SURFACE_COMPILE_PROFILE.renderChunkSize + radius)
            * HYDROLOGY_POINT_QUANTIZATION - half
    });
}

function projectedRegionBounds(
    descriptor: WorldDescriptorV2,
    key: Readonly<HydrologyRegionKey>
): readonly HydrologyFeatureBoundsQ64[] {
    const origin = chunkOrigin(key.regionX, key.regionY, HYDROLOGY_REGION_SIZE);
    let width = HYDROLOGY_REGION_SIZE;
    let height = HYDROLOGY_REGION_SIZE;
    if (descriptor.sourceKind !== "procedural-infinite") {
        width = Math.min(width, descriptor.width - origin.x);
        height = Math.min(height, descriptor.height - origin.y);
        if (origin.x < 0 || origin.y < 0 || width <= 0 || height <= 0) {
            throw new RangeError("resident hydrology region key is outside the canonical world domain");
        }
    }
    const half = HYDROLOGY_POINT_QUANTIZATION / 2;
    return projectHydrologyBoundsQ64(descriptor, {
        minX: origin.x * HYDROLOGY_POINT_QUANTIZATION - half,
        minY: origin.y * HYDROLOGY_POINT_QUANTIZATION - half,
        maxX: (origin.x + width) * HYDROLOGY_POINT_QUANTIZATION - half,
        maxY: (origin.y + height) * HYDROLOGY_POINT_QUANTIZATION - half
    });
}

function anyIntersection(
    first: readonly HydrologyFeatureBoundsQ64[],
    second: readonly HydrologyFeatureBoundsQ64[]
): boolean {
    for (const left of first) for (const right of second) if (intersects(left, right)) return true;
    return false;
}

function effectiveDeltaMap(snapshot: SurfaceDeltaSnapshot): Map<string, HydrologyFeatureDelta> {
    return new Map(snapshot.hydrologyDeltas.map(delta => [delta.featureId, delta]));
}

function effectiveNode(
    featureId: string,
    deltas: ReadonlyMap<string, HydrologyFeatureDelta>,
    base: BaseHydrologyChangeIndex
): EffectiveHydrologyGraphNode | undefined {
    const delta = deltas.get(featureId);
    if (delta) {
        if (delta.operation === "delete") return undefined;
        const feature = delta.feature;
        return feature.kind === "lake" ? {
            kind: "lake",
            featureId,
            level: feature.level
        } : {
            kind: "river",
            featureId,
            source: feature.source,
            outlet: feature.outlet,
            sourceLevel: feature.levelProfile[0],
            outletLevel: feature.levelProfile[feature.levelProfile.length - 1]
        };
    }
    return base.resolveFeature(featureId);
}

function effectiveRawBounds(
    featureId: string,
    deltas: ReadonlyMap<string, HydrologyFeatureDelta>,
    base: BaseHydrologyChangeIndex
): HydrologyFeatureBoundsQ64 | undefined {
    const delta = deltas.get(featureId);
    if (delta) return delta.operation === "upsert"
        ? authoredHydrologyFeatureBoundsQ64(delta.feature) : undefined;
    const node = base.resolveFeature(featureId);
    if (!node) return undefined;
    const bounds = base.resolveBoundsQ64(featureId);
    if (!bounds) throw new Error(`base hydrology feature ${featureId} is missing change bounds`);
    return bounds;
}

function nodeReferences(node: EffectiveHydrologyGraphNode | undefined, targetId: string): boolean {
    return node?.kind === "river" && (node.source.kind === "river" && node.source.riverId === targetId
        || node.outlet.kind === "river" && node.outlet.riverId === targetId
        || node.outlet.kind === "lake" && node.outlet.bodyId === targetId);
}

function authoredReverseReferences(
    deltas: ReadonlyMap<string, HydrologyFeatureDelta>
): Map<string, string[]> {
    const reverse = new Map<string, string[]>();
    const include = (target: string, featureId: string): void => {
        const values = reverse.get(target);
        if (values) values.push(featureId);
        else reverse.set(target, [featureId]);
    };
    for (const delta of deltas.values()) {
        if (delta.operation !== "upsert" || delta.feature.kind !== "river") continue;
        if (delta.feature.source.kind === "river") {
            include(delta.feature.source.riverId, delta.featureId);
        }
        if (delta.feature.outlet.kind === "river") {
            include(delta.feature.outlet.riverId, delta.featureId);
        } else if (delta.feature.outlet.kind === "lake") {
            include(delta.feature.outlet.bodyId, delta.featureId);
        }
    }
    for (const values of reverse.values()) values.sort();
    return reverse;
}

function addReverseReferences(
    output: Map<string, boolean>,
    targetId: string,
    deltas: ReadonlyMap<string, HydrologyFeatureDelta>,
    authoredReverse: ReadonlyMap<string, readonly string[]>,
    base: BaseHydrologyChangeIndex
): void {
    for (const featureId of authoredReverse.get(targetId) ?? []) {
        if (nodeReferences(effectiveNode(featureId, deltas, base), targetId)) output.set(featureId, true);
    }
    const baseReferences = base.referencesTo(targetId);
    let previous: string | undefined;
    for (const featureId of baseReferences) {
        if (typeof featureId !== "string" || featureId.length === 0
            || previous !== undefined && previous >= featureId) {
            throw new Error("base hydrology reverse references must be unique ascending identities");
        }
        previous = featureId;
        if (nodeReferences(effectiveNode(featureId, deltas, base), targetId)) output.set(featureId, true);
    }
}

function projectedEffectiveBounds(
    descriptor: WorldDescriptorV2,
    featureId: string,
    deltas: ReadonlyMap<string, HydrologyFeatureDelta>,
    base: BaseHydrologyChangeIndex
): readonly HydrologyFeatureBoundsQ64[] {
    const bounds = effectiveRawBounds(featureId, deltas, base);
    return bounds ? projectHydrologyBoundsQ64(descriptor, bounds) : Object.freeze([]);
}

function hydrologyImpacts(
    descriptor: WorldDescriptorV2,
    before: ReadonlyMap<string, HydrologyFeatureDelta>,
    after: ReadonlyMap<string, HydrologyFeatureDelta>,
    changedIds: readonly string[],
    base: BaseHydrologyChangeIndex
): readonly HydrologyFeatureBoundsQ64[] {
    const beforeReverse = authoredReverseReferences(before);
    const afterReverse = authoredReverseReferences(after);
    const visited = new Map<string, boolean>();
    const queue = [...changedIds].sort();
    for (const id of queue) visited.set(id, true);
    const bounds: HydrologyFeatureBoundsQ64[] = [];
    for (let index = 0; index < queue.length; index += 1) {
        if (index >= MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL) {
            throw new RangeError("hydrology change dependency closure exceeds its fixed traversal budget");
        }
        const featureId = queue[index];
        bounds.push(...projectedEffectiveBounds(descriptor, featureId, before, base));
        bounds.push(...projectedEffectiveBounds(descriptor, featureId, after, base));
        const references = new Map<string, boolean>();
        addReverseReferences(references, featureId, before, beforeReverse, base);
        addReverseReferences(references, featureId, after, afterReverse, base);
        for (const reference of [...references.keys()].sort()) {
            if (visited.has(reference)) continue;
            visited.set(reference, true);
            queue.push(reference);
        }
    }
    return Object.freeze(bounds);
}

function validateResidencyKey(
    descriptor: WorldDescriptorV2,
    key: Readonly<RenderChunkKey>,
    chunkSize: number,
    name: string
): void {
    const origin = chunkOrigin(key.chunkX, key.chunkY, chunkSize);
    if (descriptor.sourceKind === "procedural-infinite") return;
    if (origin.x < 0 || origin.y < 0 || origin.x >= descriptor.width || origin.y >= descriptor.height) {
        throw new RangeError(`${name} is outside the canonical world domain`);
    }
}

function sortedUniqueRenderKeys(
    descriptor: WorldDescriptorV2,
    keys: readonly RenderChunkKey[],
    chunkSize: number,
    name: string
): readonly RenderChunkKey[] {
    if (!Array.isArray(keys)) throw new TypeError(`${name} residency must be an array`);
    const sorted = keys.map(key => {
        if (!key || typeof key !== "object") throw new TypeError(`${name} residency key is invalid`);
        validateResidencyKey(descriptor, key, chunkSize, name);
        return Object.freeze({ chunkX: key.chunkX, chunkY: key.chunkY });
    }).sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY);
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index - 1].chunkX === sorted[index].chunkX
            && sorted[index - 1].chunkY === sorted[index].chunkY) {
            throw new Error(`${name} residency contains a duplicate key`);
        }
    }
    return Object.freeze(sorted);
}

export function createWorldChangeSet(
    options: Readonly<CreateWorldChangeSetOptions>
): WorldChangeSet {
    if (!options || typeof options !== "object") {
        throw new TypeError("world change set options are required");
    }
    assertWorldDescriptorV2(options.descriptor);
    const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
    if (!options.baseHydrology || typeof options.baseHydrology.resolveFeature !== "function"
        || typeof options.baseHydrology.referencesTo !== "function"
        || typeof options.baseHydrology.resolveBoundsQ64 !== "function") {
        throw new TypeError("world change set requires a base hydrology change index");
    }
    if (!options.before || options.before.worldIdentity !== worldIdentity
        || !options.commit || options.commit.worldIdentity !== worldIdentity
        || options.commit.revision !== options.before.effectiveRevision + 1
        || options.commit.transactionId !== BigInt(options.commit.revision)) {
        throw new Error("world change set snapshot and commit are not one atomic revision");
    }
    const semanticChunks: DirtySemanticChunk[] = [];
    const semanticImpacts: SemanticImpact[] = [];
    let domains = 0;
    for (const change of options.commit.semanticChanges) {
        const key = change.operation === "upsert" ? change.delta.key : change.key;
        if (change.expectedRevision !== options.before.getSemanticRevision(key.chunkX, key.chunkY)) {
            throw new Error("world change semantic CAS does not match its before snapshot");
        }
        const beforeDelta = options.before.getSemanticDelta(key.chunkX, key.chunkY);
        const afterDelta = change.operation === "upsert" ? change.delta : undefined;
        const dirty = semanticDirtyChunk(options.descriptor, key, beforeDelta, afterDelta);
        semanticChunks.push(dirty);
        domains |= dirty.domains;
        for (const domainBounds of dirty.domainBounds) {
            semanticImpacts.push({
                domain: domainBounds.domain,
                bounds: projectedTileBounds(options.descriptor, dirty.key, domainBounds.localBounds)
            });
        }
    }
    semanticChunks.sort((first, second) => first.key.chunkX - second.key.chunkX
        || first.key.chunkY - second.key.chunkY);

    const beforeHydrology = effectiveDeltaMap(options.before);
    const afterHydrology = new Map(beforeHydrology);
    const hydrologyFeatures: DirtyHydrologyFeature[] = [];
    const changedHydrologyIds: string[] = [];
    for (const change of options.commit.hydrologyChanges) {
        const delta = change.delta;
        if (change.expectedRevision !== options.before.getHydrologyRevision(delta.featureId)) {
            throw new Error("world change hydrology CAS does not match its before snapshot");
        }
        const previousBounds = projectedEffectiveBounds(
            options.descriptor,
            delta.featureId,
            beforeHydrology,
            options.baseHydrology
        );
        afterHydrology.set(delta.featureId, delta);
        const nextBounds = projectedEffectiveBounds(
            options.descriptor,
            delta.featureId,
            afterHydrology,
            options.baseHydrology
        );
        hydrologyFeatures.push(Object.freeze({
            featureId: delta.featureId,
            featureKind: delta.featureKind,
            operation: delta.operation,
            previousBounds,
            nextBounds
        }));
        changedHydrologyIds.push(delta.featureId);
        domains |= WORLD_CHANGE_DOMAIN_HYDROLOGY;
    }
    hydrologyFeatures.sort((first, second) => first.featureId < second.featureId ? -1
        : first.featureId > second.featureId ? 1 : 0);
    const hydrologyImpactBounds = hydrologyImpacts(
        options.descriptor,
        beforeHydrology,
        afterHydrology,
        changedHydrologyIds,
        options.baseHydrology
    );

    const residentRegions = sortedUniqueRenderKeys(
        options.descriptor,
        options.residency.hydrologyRegions.map(key => ({
            chunkX: key.regionX,
            chunkY: key.regionY
        })),
        HYDROLOGY_REGION_SIZE,
        "hydrology region"
    );
    const hydrologyRegions: DirtyHydrologyRegion[] = [];
    for (const key of residentRegions) {
        const regionKey = Object.freeze({ regionX: key.chunkX, regionY: key.chunkY });
        if (anyIntersection(
            projectedRegionBounds(options.descriptor, regionKey),
            hydrologyImpactBounds
        )) {
            hydrologyRegions.push(Object.freeze({
                key: regionKey,
                domains: WORLD_CHANGE_DOMAIN_HYDROLOGY
            }));
        }
    }

    const residentRenderChunks = sortedUniqueRenderKeys(
        options.descriptor,
        options.residency.renderChunks,
        SURFACE_COMPILE_PROFILE.renderChunkSize,
        "render chunk"
    );
    const renderChunks: DirtyRenderChunk[] = [];
    for (const key of residentRenderChunks) {
        const dependencyBounds = projectedRenderDependencyBounds(options.descriptor, key);
        let renderDomains = 0;
        for (const impact of semanticImpacts) {
            if (anyIntersection(dependencyBounds, impact.bounds)) renderDomains |= impact.domain;
        }
        if (anyIntersection(dependencyBounds, hydrologyImpactBounds)) {
            renderDomains |= WORLD_CHANGE_DOMAIN_HYDROLOGY;
        }
        renderDomains &= SURFACE_DELTA_CHANGE_DOMAINS;
        if (renderDomains !== 0) renderChunks.push(Object.freeze({ key, domains: renderDomains }));
    }
    return Object.freeze({
        worldIdentity,
        revision: options.commit.revision,
        transactionId: options.commit.transactionId,
        domains,
        semanticChunks: Object.freeze(semanticChunks),
        hydrologyFeatures: Object.freeze(hydrologyFeatures),
        hydrologyRegions: Object.freeze(hydrologyRegions),
        renderChunks: Object.freeze(renderChunks)
    });
}
