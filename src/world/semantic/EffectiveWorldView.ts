import {
    assertBaseSemanticChunk,
    BaseSemanticChunk,
    BaseSemanticTileView,
    readValidatedBaseSemanticTile
} from "./BaseSemanticChunk";
import {
    assertHydrologyFeatureDelta,
    cloneHydrologyFeatureDelta,
    HydrologyFeatureDelta
} from "./HydrologyFeatureDelta";
import { assertHydrologyRegion, HydrologyRegion } from "./HydrologyRegion";
import { HydrologyFeatureId } from "./MacroDrainageGraph";
import {
    assertSparseSemanticDelta,
    cloneSparseSemanticDelta,
    SemanticOverrideField,
    SparseSemanticDelta,
    sparseSemanticDeltaOverrideOffset
} from "./SparseSemanticDelta";
import { SubstrateClass } from "./WorldSemanticCatalog";
import {
    canonicalizeHydrologyRegionKey,
    canonicalizeSemanticChunkKey,
    serializeWorldDescriptorV2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";
import {
    HydrologyRegionKey,
    localBoundsContain,
    locateSemanticTile,
    SemanticChunkKey,
    semanticChunkLocalIndex,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./WorldSemanticFormat";

export interface HydrologyRegionFeatureIndex {
    readonly key: HydrologyRegionKey;
    readonly featureIds: readonly HydrologyFeatureId[];
}

export interface EffectiveDeltaSnapshot {
    readonly worldIdentity: string;
    readonly effectiveRevision: number;
    readonly semanticDeltas: readonly SparseSemanticDelta[];
    readonly hydrologyFeatures: readonly HydrologyFeatureDelta[];
    readonly hydrologyRegionFeatures: readonly HydrologyRegionFeatureIndex[];
}

export interface CreateEffectiveDeltaSnapshotOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly effectiveRevision: number;
    readonly semanticDeltas?: readonly SparseSemanticDelta[];
    readonly hydrologyFeatures?: readonly HydrologyFeatureDelta[];
    readonly hydrologyRegionFeatures?: readonly HydrologyRegionFeatureIndex[];
}

export interface CaptureEffectiveWorldSnapshotOptions {
    readonly semanticChunks?: readonly BaseSemanticChunk[];
    readonly hydrologyRegions?: readonly HydrologyRegion[];
}

interface PublishedEffectiveState {
    readonly snapshot: EffectiveDeltaSnapshot;
    readonly semanticDeltaByKey: ReadonlyMap<string, SparseSemanticDelta>;
    readonly hydrologyFeatureById: ReadonlyMap<HydrologyFeatureId, HydrologyFeatureDelta>;
    readonly hydrologyRegionIndexByKey: ReadonlyMap<string, HydrologyRegionFeatureIndex>;
}

const validatedBaseSemanticChunks = new WeakSet<BaseSemanticChunk>();
const validatedSparseSemanticDeltas = new WeakSet<SparseSemanticDelta>();
const validatedHydrologyRegions = new WeakSet<HydrologyRegion>();
const validatedHydrologyFeatureDeltas = new WeakSet<HydrologyFeatureDelta>();

export interface EffectiveSemanticTileView extends BaseSemanticTileView {
    readonly substrateClass: SubstrateClass;
}

function semanticKey(key: SemanticChunkKey): string {
    return `${key.chunkX},${key.chunkY}`;
}

function hydrologyKey(key: HydrologyRegionKey): string {
    return `${key.regionX},${key.regionY}`;
}

function assertBaseSemanticChunkOnce(value: BaseSemanticChunk): void {
    if (validatedBaseSemanticChunks.has(value)) return;
    assertBaseSemanticChunk(value);
    validatedBaseSemanticChunks.add(value);
}

function assertSparseSemanticDeltaOnce(value: SparseSemanticDelta): void {
    if (validatedSparseSemanticDeltas.has(value)) return;
    assertSparseSemanticDelta(value);
    validatedSparseSemanticDeltas.add(value);
}

function assertHydrologyRegionOnce(value: HydrologyRegion): void {
    if (validatedHydrologyRegions.has(value)) return;
    assertHydrologyRegion(value);
    validatedHydrologyRegions.add(value);
}

function assertHydrologyFeatureDeltaOnce(value: HydrologyFeatureDelta): void {
    if (validatedHydrologyFeatureDeltas.has(value)) return;
    assertHydrologyFeatureDelta(value);
    validatedHydrologyFeatureDeltas.add(value);
}

function compareSemanticKeys(first: SemanticChunkKey, second: SemanticChunkKey): number {
    return first.chunkX - second.chunkX || first.chunkY - second.chunkY;
}

function compareHydrologyKeys(first: HydrologyRegionKey, second: HydrologyRegionKey): number {
    return first.regionX - second.regionX || first.regionY - second.regionY;
}

function assertEffectiveRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("effective revision must be a non-negative safe integer");
    }
}

function canonicalSemanticKey(descriptor: WorldDescriptorV2, key: SemanticChunkKey): SemanticChunkKey {
    const canonical = canonicalizeSemanticChunkKey(descriptor, key);
    if (canonical.chunkX !== key.chunkX || canonical.chunkY !== key.chunkY) {
        throw new TypeError("effective semantic dependencies must use canonical chunk keys");
    }
    return Object.freeze(canonical);
}

function canonicalHydrologyKey(descriptor: WorldDescriptorV2, key: HydrologyRegionKey): HydrologyRegionKey {
    const canonical = canonicalizeHydrologyRegionKey(descriptor, key);
    if (canonical.regionX !== key.regionX || canonical.regionY !== key.regionY) {
        throw new TypeError("effective hydrology dependencies must use canonical region keys");
    }
    return Object.freeze(canonical);
}

function normalizeSemanticDeltas(
    descriptor: WorldDescriptorV2,
    effectiveRevision: number,
    values: readonly SparseSemanticDelta[]
): readonly SparseSemanticDelta[] {
    if (!Array.isArray(values)) throw new TypeError("effective semantic deltas must be an array");
    const result = values.map(value => {
        assertSparseSemanticDelta(value);
        canonicalSemanticKey(descriptor, value.key);
        if (value.revision > effectiveRevision) {
            throw new RangeError("semantic delta revision cannot exceed the effective revision");
        }
        return cloneSparseSemanticDelta(value);
    }).sort((first, second) => compareSemanticKeys(first.key, second.key));
    for (let index = 1; index < result.length; index += 1) {
        if (semanticKey(result[index - 1].key) === semanticKey(result[index].key)) {
            throw new TypeError("effective delta snapshot contains duplicate semantic chunks");
        }
    }
    return Object.freeze(result);
}

function normalizeHydrologyFeatures(
    effectiveRevision: number,
    values: readonly HydrologyFeatureDelta[]
): readonly HydrologyFeatureDelta[] {
    if (!Array.isArray(values)) throw new TypeError("effective hydrology features must be an array");
    const result = values.map(value => {
        assertHydrologyFeatureDelta(value);
        if (value.revision > effectiveRevision) {
            throw new RangeError("hydrology feature revision cannot exceed the effective revision");
        }
        return cloneHydrologyFeatureDelta(value);
    }).sort((first, second) => first.featureId.localeCompare(second.featureId));
    for (let index = 1; index < result.length; index += 1) {
        if (result[index - 1].featureId === result[index].featureId) {
            throw new TypeError("effective delta snapshot contains duplicate hydrology features");
        }
    }
    return Object.freeze(result);
}

function normalizeHydrologyRegionFeatures(
    descriptor: WorldDescriptorV2,
    values: readonly HydrologyRegionFeatureIndex[],
    featureById: ReadonlyMap<HydrologyFeatureId, HydrologyFeatureDelta>
): readonly HydrologyRegionFeatureIndex[] {
    if (!Array.isArray(values)) throw new TypeError("hydrology region feature indices must be an array");
    const referenced = new Set<HydrologyFeatureId>();
    const result = values.map(value => {
        if (!value || typeof value !== "object"
            || Object.getOwnPropertyNames(value).some(name => name !== "key" && name !== "featureIds")
            || !Array.isArray(value.featureIds) || value.featureIds.length === 0) {
            throw new TypeError("hydrology region feature index is invalid");
        }
        const key = canonicalHydrologyKey(descriptor, value.key);
        const featureIds = [...value.featureIds].sort((first, second) => first.localeCompare(second));
        for (let index = 0; index < featureIds.length; index += 1) {
            const featureId = featureIds[index];
            if (!featureById.has(featureId)) {
                throw new TypeError("hydrology region index references an unknown feature delta");
            }
            if (index > 0 && featureId === featureIds[index - 1]) {
                throw new TypeError("hydrology region index contains a duplicate feature ID");
            }
            referenced.add(featureId);
        }
        return Object.freeze({ key, featureIds: Object.freeze(featureIds) });
    }).sort((first, second) => compareHydrologyKeys(first.key, second.key));
    for (let index = 1; index < result.length; index += 1) {
        if (hydrologyKey(result[index - 1].key) === hydrologyKey(result[index].key)) {
            throw new TypeError("effective delta snapshot contains duplicate hydrology region indices");
        }
    }
    if (referenced.size !== featureById.size) {
        throw new TypeError("every hydrology feature delta must be indexed by at least one region");
    }
    return Object.freeze(result);
}

export function createEffectiveDeltaSnapshot(
    options: CreateEffectiveDeltaSnapshotOptions
): EffectiveDeltaSnapshot {
    if (!options || typeof options !== "object") throw new TypeError("effective delta snapshot options are required");
    const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
    assertEffectiveRevision(options.effectiveRevision);
    const semanticDeltas = normalizeSemanticDeltas(
        options.descriptor,
        options.effectiveRevision,
        options.semanticDeltas ?? []
    );
    const hydrologyFeatures = normalizeHydrologyFeatures(
        options.effectiveRevision,
        options.hydrologyFeatures ?? []
    );
    const featureById = new Map(hydrologyFeatures.map(feature => [feature.featureId, feature]));
    const hydrologyRegionFeatures = normalizeHydrologyRegionFeatures(
        options.descriptor,
        options.hydrologyRegionFeatures ?? [],
        featureById
    );
    if (options.effectiveRevision === 0
        && (semanticDeltas.length > 0 || hydrologyFeatures.length > 0 || hydrologyRegionFeatures.length > 0)) {
        throw new TypeError("effective revision zero is reserved for an empty delta snapshot");
    }
    return Object.freeze({
        worldIdentity,
        effectiveRevision: options.effectiveRevision,
        semanticDeltas,
        hydrologyFeatures,
        hydrologyRegionFeatures
    });
}

function normalizeEffectiveDeltaSnapshot(
    descriptor: WorldDescriptorV2,
    value: EffectiveDeltaSnapshot
): EffectiveDeltaSnapshot {
    if (!value || typeof value !== "object") throw new TypeError("effective delta snapshot must be an object");
    const allowedFields = new Set([
        "worldIdentity",
        "effectiveRevision",
        "semanticDeltas",
        "hydrologyFeatures",
        "hydrologyRegionFeatures"
    ]);
    const expectedIdentity = serializeWorldDescriptorV2(descriptor);
    if (Object.getOwnPropertyNames(value).some(name => !allowedFields.has(name))
        || value.worldIdentity !== expectedIdentity) {
        throw new TypeError("effective delta snapshot belongs to a different or invalid world identity");
    }
    return createEffectiveDeltaSnapshot({
        descriptor,
        effectiveRevision: value.effectiveRevision,
        semanticDeltas: value.semanticDeltas,
        hydrologyFeatures: value.hydrologyFeatures,
        hydrologyRegionFeatures: value.hydrologyRegionFeatures
    });
}

function createPublishedEffectiveState(snapshot: EffectiveDeltaSnapshot): PublishedEffectiveState {
    return Object.freeze({
        snapshot,
        semanticDeltaByKey: new Map(snapshot.semanticDeltas.map(delta => [semanticKey(delta.key), delta])),
        hydrologyFeatureById: new Map(snapshot.hydrologyFeatures.map(feature => [feature.featureId, feature])),
        hydrologyRegionIndexByKey: new Map(snapshot.hydrologyRegionFeatures.map(index => [hydrologyKey(index.key), index]))
    });
}

export class EffectiveSemanticChunkSnapshot {
    constructor(
        public readonly base: BaseSemanticChunk,
        public readonly delta: SparseSemanticDelta | undefined
    ) {
        assertBaseSemanticChunkOnce(base);
        if (delta) {
            assertSparseSemanticDeltaOnce(delta);
            if (semanticKey(base.key) !== semanticKey(delta.key)) {
                throw new TypeError("semantic base chunk and delta keys do not match");
            }
            for (const index of delta.indices) {
                const localX = Math.floor(index / WORLD_SEMANTIC_CHUNK_SIZE);
                const localY = index % WORLD_SEMANTIC_CHUNK_SIZE;
                if (!localBoundsContain(base.validBounds, localX, localY)) {
                    throw new RangeError("semantic delta overrides a tile outside base validBounds");
                }
            }
        }
        Object.freeze(this);
    }

    public getTile(localX: number, localY: number): Readonly<EffectiveSemanticTileView> {
        const base = readValidatedBaseSemanticTile(this.base, localX, localY);
        if (!this.delta) return base;
        const tileIndex = semanticChunkLocalIndex(localX, localY);
        const offset = sparseSemanticDeltaOverrideOffset(this.delta, tileIndex);
        if (offset < 0) return base;
        const mask = this.delta.masks[offset];
        const biomeOffset = offset * 4;
        return Object.freeze({
            ...base,
            substrateClass: mask & SemanticOverrideField.Substrate
                ? this.delta.substrateClass[offset] as SubstrateClass : base.substrateClass,
            macroHeight: mask & SemanticOverrideField.MacroHeight
                ? this.delta.macroHeight[offset] / 65535 : base.macroHeight,
            biomeWeights: mask & SemanticOverrideField.BiomeWeights
                ? Object.freeze([
                    this.delta.biomeWeights[biomeOffset] / 255,
                    this.delta.biomeWeights[biomeOffset + 1] / 255,
                    this.delta.biomeWeights[biomeOffset + 2] / 255,
                    this.delta.biomeWeights[biomeOffset + 3] / 255
                ] as [number, number, number, number])
                : base.biomeWeights,
            vegetationDensity: mask & SemanticOverrideField.VegetationDensity
                ? this.delta.vegetationDensity[offset] / 255 : base.vegetationDensity,
            vegetationProfile: mask & SemanticOverrideField.VegetationProfile
                ? this.delta.vegetationProfile[offset] : base.vegetationProfile
        });
    }
}

export class EffectiveHydrologyRegionSnapshot {
    public readonly featureDeltas: readonly HydrologyFeatureDelta[];

    constructor(
        public readonly base: HydrologyRegion,
        featureDeltas: readonly HydrologyFeatureDelta[]
    ) {
        assertHydrologyRegionOnce(base);
        for (const feature of featureDeltas) assertHydrologyFeatureDeltaOnce(feature);
        this.featureDeltas = Object.freeze([...featureDeltas]);
        Object.freeze(this);
    }

    public suppressesBaseRiver(riverId: HydrologyFeatureId): boolean {
        return this.featureDeltas.some(feature => feature.featureId === riverId
            && (feature.kind === "river" || feature.kind === "tombstone" && feature.targetKind === "river"));
    }

    public suppressesBaseLake(bodyId: HydrologyFeatureId): boolean {
        return this.featureDeltas.some(feature => feature.featureId === bodyId
            && (feature.kind === "lake" || feature.kind === "tombstone" && feature.targetKind === "lake"));
    }
}

export class EffectiveWorldSnapshot {
    private readonly semanticByKey: ReadonlyMap<string, EffectiveSemanticChunkSnapshot>;
    private readonly hydrologyByKey: ReadonlyMap<string, EffectiveHydrologyRegionSnapshot>;

    constructor(
        public readonly descriptor: WorldDescriptorV2,
        public readonly worldIdentity: string,
        public readonly effectiveRevision: number,
        public readonly semanticChunks: readonly EffectiveSemanticChunkSnapshot[],
        public readonly hydrologyRegions: readonly EffectiveHydrologyRegionSnapshot[]
    ) {
        this.semanticByKey = new Map(semanticChunks.map(chunk => [semanticKey(chunk.base.key), chunk]));
        this.hydrologyByKey = new Map(hydrologyRegions.map(region => [hydrologyKey(region.base.key), region]));
        Object.freeze(this);
    }

    public getSemanticChunk(key: SemanticChunkKey): EffectiveSemanticChunkSnapshot {
        const canonical = canonicalizeSemanticChunkKey(this.descriptor, key);
        const chunk = this.semanticByKey.get(semanticKey(canonical));
        if (!chunk) throw new RangeError("effective snapshot does not contain the requested semantic chunk");
        return chunk;
    }

    public getHydrologyRegion(key: HydrologyRegionKey): EffectiveHydrologyRegionSnapshot {
        const canonical = canonicalizeHydrologyRegionKey(this.descriptor, key);
        const region = this.hydrologyByKey.get(hydrologyKey(canonical));
        if (!region) throw new RangeError("effective snapshot does not contain the requested hydrology region");
        return region;
    }

    public getTile(tileX: number, tileY: number): Readonly<EffectiveSemanticTileView> {
        const location = locateSemanticTile(tileX, tileY);
        return this.getSemanticChunk(location.key).getTile(location.localX, location.localY);
    }
}

export class EffectiveWorldView {
    public readonly descriptor: WorldDescriptorV2;
    public readonly worldIdentity: string;
    private publishedState: PublishedEffectiveState;

    constructor(descriptor: WorldDescriptorV2, initialDeltaSnapshot?: EffectiveDeltaSnapshot) {
        this.descriptor = descriptor;
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
        const snapshot = initialDeltaSnapshot
            ? normalizeEffectiveDeltaSnapshot(descriptor, initialDeltaSnapshot)
            : createEffectiveDeltaSnapshot({ descriptor, effectiveRevision: 0 });
        this.publishedState = createPublishedEffectiveState(snapshot);
    }

    public get effectiveRevision(): number { return this.publishedState.snapshot.effectiveRevision; }

    public publishDeltaSnapshot(next: EffectiveDeltaSnapshot, expectedRevision: number): void {
        assertEffectiveRevision(expectedRevision);
        if (next?.worldIdentity !== this.worldIdentity) {
            throw new TypeError("cannot publish an effective delta snapshot from another world identity");
        }
        if (expectedRevision !== this.publishedState.snapshot.effectiveRevision) {
            throw new RangeError(
                `effective snapshot conflict: expected ${expectedRevision}, received ${this.publishedState.snapshot.effectiveRevision}`
            );
        }
        if (next.effectiveRevision !== expectedRevision + 1) {
            throw new RangeError("effective snapshot revision must advance exactly once");
        }
        const normalized = normalizeEffectiveDeltaSnapshot(this.descriptor, next);
        this.publishedState = createPublishedEffectiveState(normalized);
    }

    public capture(options: CaptureEffectiveWorldSnapshotOptions): EffectiveWorldSnapshot {
        if (!options || typeof options !== "object") throw new TypeError("effective snapshot capture options are required");
        if (Object.getOwnPropertyNames(options).some(name =>
            name !== "semanticChunks" && name !== "hydrologyRegions")) {
            throw new TypeError("effective snapshot capture contains unknown dependency fields");
        }
        const state = this.publishedState;
        const deltaSnapshot = state.snapshot;
        if (options.semanticChunks !== undefined && !Array.isArray(options.semanticChunks)
            || options.hydrologyRegions !== undefined && !Array.isArray(options.hydrologyRegions)) {
            throw new TypeError("effective snapshot dependencies must be arrays");
        }
        const semanticChunks = (options.semanticChunks ?? []).map(base => {
            canonicalSemanticKey(this.descriptor, base.key);
            return new EffectiveSemanticChunkSnapshot(
                base,
                state.semanticDeltaByKey.get(semanticKey(base.key))
            );
        }).sort((first, second) => compareSemanticKeys(first.base.key, second.base.key));
        for (let index = 1; index < semanticChunks.length; index += 1) {
            if (semanticKey(semanticChunks[index - 1].base.key) === semanticKey(semanticChunks[index].base.key)) {
                throw new TypeError("effective snapshot capture contains duplicate semantic chunks");
            }
        }

        const hydrologyRegions = (options.hydrologyRegions ?? []).map(base => {
            canonicalHydrologyKey(this.descriptor, base.key);
            const index = state.hydrologyRegionIndexByKey.get(hydrologyKey(base.key));
            const features = index?.featureIds.map(featureId =>
                state.hydrologyFeatureById.get(featureId) as HydrologyFeatureDelta) ?? [];
            return new EffectiveHydrologyRegionSnapshot(base, features);
        }).sort((first, second) => compareHydrologyKeys(first.base.key, second.base.key));
        for (let index = 1; index < hydrologyRegions.length; index += 1) {
            if (hydrologyKey(hydrologyRegions[index - 1].base.key) === hydrologyKey(hydrologyRegions[index].base.key)) {
                throw new TypeError("effective snapshot capture contains duplicate hydrology regions");
            }
        }

        return new EffectiveWorldSnapshot(
            this.descriptor,
            this.worldIdentity,
            deltaSnapshot.effectiveRevision,
            Object.freeze(semanticChunks),
            Object.freeze(hydrologyRegions)
        );
    }
}
