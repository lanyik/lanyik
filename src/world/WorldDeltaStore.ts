import {
    createEffectiveDeltaSnapshot,
    EffectiveDeltaSnapshot,
    HydrologyRegionFeatureIndex
} from "./semantic/EffectiveWorldView";
import {
    assertHydrologyFeatureDelta,
    cloneHydrologyFeatureDelta,
    hydrologyFeatureBounds,
    HydrologyFeatureDelta
} from "./semantic/HydrologyFeatureDelta";
import { HydrologyFeatureId } from "./semantic/MacroDrainageGraph";
import {
    createSparseSemanticDelta,
    SemanticOverrideField,
    SparseSemanticDelta,
    SparseSemanticTileOverride
} from "./semantic/SparseSemanticDelta";
import {
    HYDROLOGY_REGION_SIZE,
    locateSemanticTile,
    semanticChunkLocalIndex,
    SemanticChunkKey
} from "./semantic/WorldSemanticFormat";
import {
    assertWorldDescriptorV2,
    canonicalizeHydrologyRegionKey,
    canonicalizeSemanticChunkKey,
    serializeWorldDescriptorV2,
    WorldDescriptorV2
} from "./semantic/WorldDescriptorV2";
import {
    createWorldChangeSet,
    HydrologyFeatureChange,
    SemanticChangePoint,
    WorldChangeDomain,
    WorldChangeSet
} from "./semantic/WorldChangeSet";

export const WORLD_DELTA_FORMAT_VERSION = 3;
export const WORLD_DELTA_CHECKPOINT_FORMAT_VERSION = 1;

export interface SemanticAuthorityMutation {
    readonly x: number;
    readonly y: number;
    readonly substrateClass?: number | null;
    readonly macroHeight?: number | null;
    readonly biomeWeights?: readonly [number, number, number, number] | null;
    readonly vegetationDensity?: number | null;
    readonly vegetationProfile?: number | null;
}

export interface HydrologyFeatureUpsertMutation {
    readonly kind: "upsert";
    readonly expectedRevision: number;
    readonly feature: HydrologyFeatureInput;
}

type WithoutRevision<T> = T extends unknown ? Omit<T, "revision"> : never;
export type HydrologyFeatureInput = WithoutRevision<HydrologyFeatureDelta>;

export interface HydrologyFeatureDeleteMutation {
    readonly kind: "delete";
    readonly featureId: HydrologyFeatureId;
    readonly targetKind: "river" | "lake";
    readonly expectedRevision: number;
}

export type HydrologyAuthorityMutation = HydrologyFeatureUpsertMutation | HydrologyFeatureDeleteMutation;

export interface WorldDeltaCommitRequest {
    readonly descriptor: WorldDescriptorV2;
    readonly expectedRevision: number;
    readonly semanticMutations?: readonly SemanticAuthorityMutation[];
    readonly hydrologyMutations?: readonly HydrologyAuthorityMutation[];
}

export interface WorldDeltaCommitRecord {
    readonly formatVersion: typeof WORLD_DELTA_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly transactionId: bigint;
    readonly revision: number;
    readonly semanticMutationCount: number;
    readonly hydrologyMutationCount: number;
    readonly byteLength: number;
}

export interface WorldDeltaCommitResult {
    readonly changed: boolean;
    readonly snapshot: EffectiveDeltaSnapshot;
    readonly commit?: WorldDeltaCommitRecord;
    readonly changeSet?: WorldChangeSet;
}

export interface WorldDeltaCheckpoint {
    readonly formatVersion: typeof WORLD_DELTA_FORMAT_VERSION;
    readonly checkpointVersion: typeof WORLD_DELTA_CHECKPOINT_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly revision: number;
    readonly semanticDeltas: readonly SparseSemanticDelta[];
    readonly hydrologyFeatures: readonly HydrologyFeatureDelta[];
    readonly hydrologyRegionFeatures: readonly HydrologyRegionFeatureIndex[];
}

export interface WorldDeltaStoreStats {
    readonly state: "ready" | "disposed";
    readonly worlds: number;
    readonly commits: number;
    readonly pendingCommitBytes: number;
    readonly checkpoints: number;
    readonly conflicts: number;
}

export interface WorldDeltaStore {
    load(descriptor: WorldDescriptorV2): Promise<EffectiveDeltaSnapshot>;
    commit(request: WorldDeltaCommitRequest): Promise<WorldDeltaCommitResult>;
    saveBarrier(descriptor: WorldDescriptorV2): Promise<WorldDeltaCheckpoint>;
    restoreBarrier(descriptor: WorldDescriptorV2, checkpoint: WorldDeltaCheckpoint): Promise<void>;
    subscribe(worldIdentity: string, listener: (result: WorldDeltaCommitResult) => void): () => void;
    flush(): Promise<void>;
    readonly stats: Readonly<WorldDeltaStoreStats>;
    dispose(): void;
}

export class WorldDeltaRevisionConflictError extends Error {
    public readonly name = "WorldDeltaRevisionConflictError";

    constructor(
        public readonly scope: "world" | "hydrology-feature",
        public readonly expectedRevision: number,
        public readonly actualRevision: number,
        public readonly featureId?: HydrologyFeatureId
    ) {
        super(scope === "world"
            ? `World delta revision conflict: expected ${expectedRevision}, received ${actualRevision}`
            : `Hydrology feature ${featureId} revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
    }
}

interface MutableWorldDeltaState {
    descriptor: WorldDescriptorV2;
    snapshot: EffectiveDeltaSnapshot;
    commits: WorldDeltaCommitRecord[];
    pendingCommitBytes: number;
}

interface StoredWorldDeltaState {
    readonly key: string;
    readonly descriptor: WorldDescriptorV2;
    readonly snapshot: EffectiveDeltaSnapshot;
    readonly commits: readonly WorldDeltaCommitRecord[];
    readonly pendingCommitBytes: number;
}

interface MutableSemanticTile {
    localX: number;
    localY: number;
    substrateClass?: number;
    macroHeight?: number;
    biomeWeights?: readonly [number, number, number, number];
    vegetationDensity?: number;
    vegetationProfile?: number;
}

const SEMANTIC_FIELDS = [
    "substrateClass",
    "macroHeight",
    "biomeWeights",
    "vegetationDensity",
    "vegetationProfile"
] as const;

type SemanticField = typeof SEMANTIC_FIELDS[number];

function assertRevision(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

function semanticKey(key: SemanticChunkKey): string {
    return `${key.chunkX},${key.chunkY}`;
}

function cloneDescriptor<T extends WorldDescriptorV2>(descriptor: T): T {
    assertWorldDescriptorV2(descriptor);
    return structuredClone(descriptor) as T;
}

function semanticDomain(mutation: SemanticAuthorityMutation): number {
    let domains = 0;
    if (mutation.macroHeight !== undefined) domains |= WorldChangeDomain.Height | WorldChangeDomain.Navigation;
    if (mutation.substrateClass !== undefined || mutation.biomeWeights !== undefined) domains |= WorldChangeDomain.Material;
    if (mutation.vegetationDensity !== undefined || mutation.vegetationProfile !== undefined) {
        domains |= WorldChangeDomain.Vegetation;
    }
    return domains;
}

function assertSemanticMutation(value: SemanticAuthorityMutation): void {
    if (!value || typeof value !== "object"
        || Object.getOwnPropertyNames(value).some(name => ![
            "x", "y", "substrateClass", "macroHeight", "biomeWeights",
            "vegetationDensity", "vegetationProfile"
        ].includes(name))
        || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) {
        throw new TypeError("semantic authority mutation is invalid");
    }
    if (semanticDomain(value) === 0) throw new TypeError("semantic authority mutation is empty");
    for (const field of ["substrateClass", "vegetationDensity", "vegetationProfile"] as const) {
        const candidate = value[field];
        if (candidate !== undefined && candidate !== null
            && (!Number.isInteger(candidate) || candidate < 0 || candidate > 255)) {
            throw new RangeError(`semantic ${field} mutation must be a Uint8 value or null`);
        }
    }
    if (value.macroHeight !== undefined && value.macroHeight !== null
        && (!Number.isInteger(value.macroHeight) || value.macroHeight < 0 || value.macroHeight > 65535)) {
        throw new RangeError("semantic macroHeight mutation must be a Uint16 value or null");
    }
    if (value.biomeWeights !== undefined && value.biomeWeights !== null
        && (!Array.isArray(value.biomeWeights) || value.biomeWeights.length !== 4
            || value.biomeWeights.some(weight => !Number.isInteger(weight) || weight < 0 || weight > 255)
            || value.biomeWeights.reduce((sum, weight) => sum + weight, 0) !== 255)) {
        throw new RangeError("semantic biomeWeights mutation must contain four Uint8 values summing to 255 or null");
    }
}

function decodeSemanticDelta(delta: SparseSemanticDelta): Map<number, MutableSemanticTile> {
    const result = new Map<number, MutableSemanticTile>();
    for (let offset = 0; offset < delta.indices.length; offset += 1) {
        const index = delta.indices[offset];
        const mask = delta.masks[offset];
        const tile: MutableSemanticTile = {
            localX: Math.floor(index / 32),
            localY: index % 32
        };
        if (mask & SemanticOverrideField.Substrate) tile.substrateClass = delta.substrateClass[offset];
        if (mask & SemanticOverrideField.MacroHeight) tile.macroHeight = delta.macroHeight[offset];
        if (mask & SemanticOverrideField.BiomeWeights) {
            const start = offset * 4;
            tile.biomeWeights = [
                delta.biomeWeights[start],
                delta.biomeWeights[start + 1],
                delta.biomeWeights[start + 2],
                delta.biomeWeights[start + 3]
            ];
        }
        if (mask & SemanticOverrideField.VegetationDensity) {
            tile.vegetationDensity = delta.vegetationDensity[offset];
        }
        if (mask & SemanticOverrideField.VegetationProfile) {
            tile.vegetationProfile = delta.vegetationProfile[offset];
        }
        result.set(index, tile);
    }
    return result;
}

function hasSemanticFields(tile: MutableSemanticTile): boolean {
    return SEMANTIC_FIELDS.some(field => tile[field] !== undefined);
}

function applySemanticMutations(
    descriptor: WorldDescriptorV2,
    current: readonly SparseSemanticDelta[],
    mutations: readonly SemanticAuthorityMutation[],
    revision: number
): readonly SparseSemanticDelta[] {
    const byChunk = new Map<string, { key: SemanticChunkKey; tiles: Map<number, MutableSemanticTile> }>();
    const touched = new Set<string>();
    for (const delta of current) byChunk.set(semanticKey(delta.key), { key: delta.key, tiles: decodeSemanticDelta(delta) });
    for (const mutation of mutations) {
        if (descriptor.topology === "bounded"
            && (mutation.x < 0 || mutation.y < 0 || mutation.x >= descriptor.width || mutation.y >= descriptor.height)) {
            throw new RangeError("semantic authority mutation lies outside bounded topology");
        }
        const location = locateSemanticTile(mutation.x, mutation.y);
        const key = canonicalizeSemanticChunkKey(descriptor, location.key);
        const localX = descriptor.topology === "toroidal"
            ? ((mutation.x % descriptor.width) + descriptor.width) % descriptor.width - key.chunkX * 32
            : location.localX;
        const localY = descriptor.topology === "toroidal"
            ? ((mutation.y % descriptor.height) + descriptor.height) % descriptor.height - key.chunkY * 32
            : location.localY;
        const index = semanticChunkLocalIndex(localX, localY);
        const bucketKey = semanticKey(key);
        touched.add(bucketKey);
        let bucket = byChunk.get(bucketKey);
        if (!bucket) {
            bucket = { key, tiles: new Map() };
            byChunk.set(bucketKey, bucket);
        }
        const tile = bucket.tiles.get(index) ?? { localX, localY };
        for (const field of SEMANTIC_FIELDS) {
            const value = mutation[field];
            if (value === undefined) continue;
            if (value === null) delete tile[field];
            else if (field === "biomeWeights") {
                tile.biomeWeights = Object.freeze([...(value as readonly number[])]) as unknown as readonly [number, number, number, number];
            } else (tile as Record<SemanticField, unknown>)[field] = value;
        }
        if (hasSemanticFields(tile)) bucket.tiles.set(index, tile);
        else bucket.tiles.delete(index);
    }
    const result: SparseSemanticDelta[] = [];
    for (const bucket of byChunk.values()) {
        if (bucket.tiles.size === 0) continue;
        const overrides = [...bucket.tiles.values()].sort((first, second) =>
            semanticChunkLocalIndex(first.localX, first.localY) - semanticChunkLocalIndex(second.localX, second.localY)
        ).map(tile => ({ ...tile } satisfies SparseSemanticTileOverride));
        const previous = current.find(delta => semanticKey(delta.key) === semanticKey(bucket.key));
        result.push(createSparseSemanticDelta({
            key: bucket.key,
            revision: touched.has(semanticKey(bucket.key)) ? revision : previous!.revision,
            overrides
        }));
    }
    result.sort((first, second) => first.key.chunkX - second.key.chunkX || first.key.chunkY - second.key.chunkY);
    return Object.freeze(result);
}

function hydrologyInputWithRevision(
    mutation: HydrologyAuthorityMutation,
    revision: number
): HydrologyFeatureDelta {
    const value: HydrologyFeatureDelta = mutation.kind === "delete"
        ? Object.freeze({
            kind: "tombstone",
            featureId: mutation.featureId,
            targetKind: mutation.targetKind,
            revision
        })
        : Object.freeze({ ...mutation.feature, revision }) as HydrologyFeatureDelta;
    assertHydrologyFeatureDelta(value);
    return cloneHydrologyFeatureDelta(value);
}

function featureRegions(descriptor: WorldDescriptorV2, feature: HydrologyFeatureDelta): readonly string[] {
    if (feature.kind === "tombstone") return Object.freeze([]);
    const bounds = hydrologyFeatureBounds(feature);
    const width = feature.kind === "river"
        ? Math.max(...feature.widthProfile) / 16
        : 0;
    const minX = Math.floor((bounds.minX - width) / HYDROLOGY_REGION_SIZE);
    const minY = Math.floor((bounds.minY - width) / HYDROLOGY_REGION_SIZE);
    const maxX = Math.floor((bounds.maxX + width) / HYDROLOGY_REGION_SIZE);
    const maxY = Math.floor((bounds.maxY + width) / HYDROLOGY_REGION_SIZE);
    const result = new Set<string>();
    for (let regionX = minX; regionX <= maxX; regionX += 1) {
        for (let regionY = minY; regionY <= maxY; regionY += 1) {
            if (descriptor.topology === "bounded"
                && (regionX < 0 || regionY < 0
                    || regionX * HYDROLOGY_REGION_SIZE >= descriptor.width
                    || regionY * HYDROLOGY_REGION_SIZE >= descriptor.height)) continue;
            try {
                const key = canonicalizeHydrologyRegionKey(descriptor, { regionX, regionY });
                result.add(`${key.regionX},${key.regionY}`);
            } catch (reason) {
                if (descriptor.topology !== "bounded" || !(reason instanceof RangeError)) throw reason;
            }
        }
    }
    return Object.freeze([...result].sort((first, second) => {
        const [ax, ay] = first.split(",").map(Number);
        const [bx, by] = second.split(",").map(Number);
        return ax - bx || ay - by;
    }));
}

function validateHydrologyDeltaGraph(features: ReadonlyMap<HydrologyFeatureId, HydrologyFeatureDelta>): void {
    for (const feature of features.values()) {
        if (feature.kind !== "river") continue;
        for (const connection of [feature.source.kind === "source" ? undefined : feature.source, feature.outlet]) {
            if (!connection) continue;
            const target = features.get(connection.featureId);
            if (!target) continue;
            if (target.kind === "tombstone") {
                throw new TypeError("hydrology feature connects to a tombstoned edited feature");
            }
            if (connection.kind === "river" && target.kind !== "river"
                || connection.kind === "body" && target.kind !== "lake") {
                throw new TypeError("hydrology feature connection kind does not match its edited target");
            }
        }
    }
    const complete = new Set<HydrologyFeatureId>();
    for (const feature of features.values()) {
        if (feature.kind !== "river" || complete.has(feature.featureId)) continue;
        const path = new Set<HydrologyFeatureId>();
        let current: HydrologyFeatureDelta | undefined = feature;
        while (current?.kind === "river" && current.outlet.kind === "river") {
            if (path.has(current.featureId)) throw new TypeError("edited hydrology river graph contains a cycle");
            path.add(current.featureId);
            const next = features.get(current.outlet.featureId);
            if (!next) break;
            current = next;
        }
        for (const featureId of path) complete.add(featureId);
    }
}

function applyHydrologyMutations(
    descriptor: WorldDescriptorV2,
    snapshot: EffectiveDeltaSnapshot,
    mutations: readonly HydrologyAuthorityMutation[]
): { readonly features: readonly HydrologyFeatureDelta[]; readonly indices: readonly HydrologyRegionFeatureIndex[]; readonly changes: readonly HydrologyFeatureChange[] } {
    const features = new Map(snapshot.hydrologyFeatures.map(feature => [feature.featureId, feature]));
    const regionsByFeature = new Map<HydrologyFeatureId, readonly string[]>();
    for (const index of snapshot.hydrologyRegionFeatures) {
        const serialized = `${index.key.regionX},${index.key.regionY}`;
        for (const featureId of index.featureIds) {
            const list = regionsByFeature.get(featureId) ?? [];
            regionsByFeature.set(featureId, Object.freeze([...list, serialized]));
        }
    }
    const changes: HydrologyFeatureChange[] = [];
    for (const mutation of mutations) {
        const featureId = mutation.kind === "upsert" ? mutation.feature.featureId : mutation.featureId;
        const previous = features.get(featureId);
        const actualRevision = previous?.revision ?? 0;
        if (mutation.expectedRevision !== actualRevision) {
            throw new WorldDeltaRevisionConflictError(
                "hydrology-feature",
                mutation.expectedRevision,
                actualRevision,
                featureId
            );
        }
        if (mutation.kind === "delete" && (!previous || previous.kind === "tombstone")) {
            throw new TypeError("cannot delete a missing or already tombstoned hydrology feature");
        }
        const next = hydrologyInputWithRevision(mutation, actualRevision + 1);
        features.set(featureId, next);
        if (next.kind !== "tombstone") regionsByFeature.set(featureId, featureRegions(descriptor, next));
        else if (!regionsByFeature.has(featureId)) {
            throw new TypeError("cannot tombstone an unindexed hydrology feature");
        }
        changes.push({
            featureId,
            previous: previous && previous.kind !== "tombstone" ? previous : undefined,
            next: next.kind !== "tombstone" ? next : undefined
        });
    }
    validateHydrologyDeltaGraph(features);
    const idsByRegion = new Map<string, HydrologyFeatureId[]>();
    for (const [featureId, featureRegionsValue] of regionsByFeature) {
        if (!features.has(featureId)) continue;
        for (const region of featureRegionsValue) {
            const ids = idsByRegion.get(region) ?? [];
            ids.push(featureId);
            idsByRegion.set(region, ids);
        }
    }
    const indices = [...idsByRegion].map(([key, featureIds]) => {
        const [regionX, regionY] = key.split(",").map(Number);
        featureIds.sort((first, second) => first.localeCompare(second));
        return Object.freeze({
            key: Object.freeze({ regionX, regionY }),
            featureIds: Object.freeze(featureIds)
        });
    }).sort((first, second) => first.key.regionX - second.key.regionX || first.key.regionY - second.key.regionY);
    return Object.freeze({
        features: Object.freeze([...features.values()].sort((first, second) => first.featureId.localeCompare(second.featureId))),
        indices: Object.freeze(indices),
        changes: Object.freeze(changes)
    });
}

function assertHydrologyMutation(value: HydrologyAuthorityMutation): void {
    if (!value || typeof value !== "object" || (value.kind !== "upsert" && value.kind !== "delete")) {
        throw new TypeError("hydrology authority mutation is invalid");
    }
    assertRevision("hydrology expected revision", value.expectedRevision);
    if (value.kind === "delete") {
        hydrologyInputWithRevision(value, 1);
        return;
    }
    hydrologyInputWithRevision(value, 1);
}

function cloneSnapshot(descriptor: WorldDescriptorV2, snapshot: EffectiveDeltaSnapshot): EffectiveDeltaSnapshot {
    return createEffectiveDeltaSnapshot({
        descriptor,
        effectiveRevision: snapshot.effectiveRevision,
        semanticDeltas: snapshot.semanticDeltas,
        hydrologyFeatures: snapshot.hydrologyFeatures,
        hydrologyRegionFeatures: snapshot.hydrologyRegionFeatures
    });
}

function createEmptyState(descriptor: WorldDescriptorV2): MutableWorldDeltaState {
    const ownedDescriptor = cloneDescriptor(descriptor);
    return {
        descriptor: ownedDescriptor,
        snapshot: createEffectiveDeltaSnapshot({ descriptor: ownedDescriptor, effectiveRevision: 0 }),
        commits: [],
        pendingCommitBytes: 0
    };
}

function estimateCommitBytes(
    semanticMutations: readonly SemanticAuthorityMutation[],
    hydrologyMutations: readonly HydrologyAuthorityMutation[]
): number {
    let bytes = 64 + semanticMutations.length * 32;
    for (const mutation of hydrologyMutations) {
        bytes += 64;
        if (mutation.kind === "upsert") {
            const feature = mutation.feature;
            if (feature.kind === "river") {
                bytes += feature.controlPoints.byteLength + feature.widthProfile.byteLength + feature.levelProfile.byteLength;
            } else if (feature.kind === "lake") bytes += feature.boundaryPoints.byteLength;
        }
    }
    return bytes;
}

function applyCommit(state: MutableWorldDeltaState, request: WorldDeltaCommitRequest): WorldDeltaCommitResult {
    assertWorldDescriptorV2(request.descriptor);
    if (serializeWorldDescriptorV2(request.descriptor) !== serializeWorldDescriptorV2(state.descriptor)) {
        throw new TypeError("world delta commit descriptor does not match its store state");
    }
    assertRevision("expected world revision", request.expectedRevision);
    if (request.expectedRevision !== state.snapshot.effectiveRevision) {
        throw new WorldDeltaRevisionConflictError("world", request.expectedRevision, state.snapshot.effectiveRevision);
    }
    const semanticMutations = request.semanticMutations ?? [];
    const hydrologyMutations = request.hydrologyMutations ?? [];
    if (!Array.isArray(semanticMutations) || !Array.isArray(hydrologyMutations)) {
        throw new TypeError("world delta mutations must be arrays");
    }
    for (const mutation of semanticMutations) assertSemanticMutation(mutation);
    for (const mutation of hydrologyMutations) assertHydrologyMutation(mutation);
    if (semanticMutations.length === 0 && hydrologyMutations.length === 0) {
        return Object.freeze({ changed: false, snapshot: cloneSnapshot(state.descriptor, state.snapshot) });
    }
    const nextRevision = state.snapshot.effectiveRevision + 1;
    const hydrology = applyHydrologyMutations(state.descriptor, state.snapshot, hydrologyMutations);
    const semanticDeltas = applySemanticMutations(
        state.descriptor,
        state.snapshot.semanticDeltas,
        semanticMutations,
        nextRevision
    );
    const snapshot = createEffectiveDeltaSnapshot({
        descriptor: state.descriptor,
        effectiveRevision: nextRevision,
        semanticDeltas,
        hydrologyFeatures: hydrology.features,
        hydrologyRegionFeatures: hydrology.indices
    });
    const transactionId = BigInt(nextRevision);
    const semanticChanges: SemanticChangePoint[] = semanticMutations.map(mutation => ({
        x: mutation.x,
        y: mutation.y,
        domains: semanticDomain(mutation)
    }));
    const changeSet = createWorldChangeSet({
        descriptor: state.descriptor,
        transactionId,
        revision: nextRevision,
        semanticChanges,
        hydrologyChanges: hydrology.changes
    });
    const commit = Object.freeze({
        formatVersion: WORLD_DELTA_FORMAT_VERSION,
        worldIdentity: snapshot.worldIdentity,
        transactionId,
        revision: nextRevision,
        semanticMutationCount: semanticMutations.length,
        hydrologyMutationCount: hydrologyMutations.length,
        byteLength: estimateCommitBytes(semanticMutations, hydrologyMutations)
    });
    state.snapshot = snapshot;
    state.commits.push(commit);
    state.pendingCommitBytes += commit.byteLength;
    return Object.freeze({ changed: true, snapshot: cloneSnapshot(state.descriptor, snapshot), commit, changeSet });
}

function checkpointFor(state: MutableWorldDeltaState): WorldDeltaCheckpoint {
    const snapshot = cloneSnapshot(state.descriptor, state.snapshot);
    return Object.freeze({
        formatVersion: WORLD_DELTA_FORMAT_VERSION,
        checkpointVersion: WORLD_DELTA_CHECKPOINT_FORMAT_VERSION,
        worldIdentity: snapshot.worldIdentity,
        revision: snapshot.effectiveRevision,
        semanticDeltas: snapshot.semanticDeltas,
        hydrologyFeatures: snapshot.hydrologyFeatures,
        hydrologyRegionFeatures: snapshot.hydrologyRegionFeatures
    });
}

function stateFromCheckpoint(descriptor: WorldDescriptorV2, checkpoint: WorldDeltaCheckpoint): MutableWorldDeltaState {
    const worldIdentity = serializeWorldDescriptorV2(descriptor);
    if (!checkpoint || checkpoint.formatVersion !== WORLD_DELTA_FORMAT_VERSION
        || checkpoint.checkpointVersion !== WORLD_DELTA_CHECKPOINT_FORMAT_VERSION
        || checkpoint.worldIdentity !== worldIdentity) {
        throw new TypeError("world delta checkpoint is invalid or belongs to another world");
    }
    assertRevision("world delta checkpoint revision", checkpoint.revision);
    const ownedDescriptor = cloneDescriptor(descriptor);
    return {
        descriptor: ownedDescriptor,
        snapshot: createEffectiveDeltaSnapshot({
            descriptor: ownedDescriptor,
            effectiveRevision: checkpoint.revision,
            semanticDeltas: checkpoint.semanticDeltas,
            hydrologyFeatures: checkpoint.hydrologyFeatures,
            hydrologyRegionFeatures: checkpoint.hydrologyRegionFeatures
        }),
        commits: [],
        pendingCommitBytes: 0
    };
}

function cloneState(state: Readonly<{
    descriptor: WorldDescriptorV2;
    snapshot: EffectiveDeltaSnapshot;
    commits: readonly WorldDeltaCommitRecord[];
    pendingCommitBytes: number;
}>): MutableWorldDeltaState {
    const descriptor = cloneDescriptor(state.descriptor);
    return {
        descriptor,
        snapshot: cloneSnapshot(descriptor, state.snapshot),
        commits: state.commits.map(commit => Object.freeze({ ...commit })),
        pendingCommitBytes: state.pendingCommitBytes
    };
}

export class MemoryWorldDeltaStore implements WorldDeltaStore {
    protected readonly worlds = new Map<string, MutableWorldDeltaState>();
    protected readonly listeners = new Map<string, Set<(result: WorldDeltaCommitResult) => void>>();
    protected disposed = false;
    protected commitCount = 0;
    protected checkpointCount = 0;
    protected conflictCount = 0;

    public load(descriptor: WorldDescriptorV2): Promise<EffectiveDeltaSnapshot> {
        try {
            this.assertReady();
            const state = this.state(descriptor);
            return Promise.resolve(cloneSnapshot(state.descriptor, state.snapshot));
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public commit(request: WorldDeltaCommitRequest): Promise<WorldDeltaCommitResult> {
        try {
            this.assertReady();
            const state = this.state(request.descriptor);
            const result = applyCommit(state, request);
            if (result.changed) {
                this.commitCount += 1;
                this.publish(result);
            }
            return Promise.resolve(result);
        } catch (reason) {
            if (reason instanceof WorldDeltaRevisionConflictError) this.conflictCount += 1;
            return Promise.reject(reason);
        }
    }

    public saveBarrier(descriptor: WorldDescriptorV2): Promise<WorldDeltaCheckpoint> {
        try {
            this.assertReady();
            const state = this.state(descriptor);
            const checkpoint = checkpointFor(state);
            state.commits.length = 0;
            state.pendingCommitBytes = 0;
            this.checkpointCount += 1;
            return Promise.resolve(checkpoint);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public restoreBarrier(descriptor: WorldDescriptorV2, checkpoint: WorldDeltaCheckpoint): Promise<void> {
        try {
            this.assertReady();
            const worldIdentity = serializeWorldDescriptorV2(descriptor);
            this.worlds.set(worldIdentity, stateFromCheckpoint(descriptor, checkpoint));
            return Promise.resolve();
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public subscribe(worldIdentity: string, listener: (result: WorldDeltaCommitResult) => void): () => void {
        this.assertReady();
        if (typeof worldIdentity !== "string" || worldIdentity.length === 0 || typeof listener !== "function") {
            throw new TypeError("world delta subscription is invalid");
        }
        const listeners = this.listeners.get(worldIdentity) ?? new Set();
        listeners.add(listener);
        this.listeners.set(worldIdentity, listeners);
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            listeners.delete(listener);
            if (listeners.size === 0) this.listeners.delete(worldIdentity);
        };
    }

    public flush(): Promise<void> { return Promise.resolve(); }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.worlds.clear();
        this.listeners.clear();
    }

    public get stats(): Readonly<WorldDeltaStoreStats> {
        let pendingCommitBytes = 0;
        for (const state of this.worlds.values()) pendingCommitBytes += state.pendingCommitBytes;
        return Object.freeze({
            state: this.disposed ? "disposed" : "ready",
            worlds: this.worlds.size,
            commits: this.commitCount,
            pendingCommitBytes,
            checkpoints: this.checkpointCount,
            conflicts: this.conflictCount
        });
    }

    protected state(descriptor: WorldDescriptorV2): MutableWorldDeltaState {
        assertWorldDescriptorV2(descriptor);
        const identity = serializeWorldDescriptorV2(descriptor);
        let state = this.worlds.get(identity);
        if (!state) {
            state = createEmptyState(descriptor);
            this.worlds.set(identity, state);
        }
        return state;
    }

    protected assertReady(): void {
        if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
    }

    protected publish(result: WorldDeltaCommitResult): void {
        for (const listener of this.listeners.get(result.snapshot.worldIdentity) ?? []) {
            try { listener(result); } catch { /* committed state is never rolled back by observers */ }
        }
    }
}

export interface IndexedDbWorldDeltaStoreOptions {
    readonly databaseName?: string;
    readonly openTimeoutMs?: number;
}

const DEFAULT_DATABASE_NAME = "three-hex-map-world-deltas-v3";
const DATABASE_VERSION = 1;
const WORLD_STORE = "worlds";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
        transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
    });
}

export class IndexedDbWorldDeltaStore extends MemoryWorldDeltaStore {
    private readonly databaseName: string;
    private readonly openTimeoutMs: number;
    private databasePromise: Promise<IDBDatabase> | undefined;
    private pending: Promise<void> = Promise.resolve();
    private pendingError: unknown;

    constructor(options: IndexedDbWorldDeltaStoreOptions = {}) {
        super();
        this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
        this.openTimeoutMs = options.openTimeoutMs ?? 5_000;
        if (!this.databaseName.trim() || !Number.isSafeInteger(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
            throw new TypeError("IndexedDbWorldDeltaStore options are invalid");
        }
    }

    public override load(descriptor: WorldDescriptorV2): Promise<EffectiveDeltaSnapshot> {
        this.assertReady();
        return this.enqueue(async () => {
            const identity = serializeWorldDescriptorV2(descriptor);
            const database = await this.open();
            const transaction = database.transaction(WORLD_STORE, "readonly");
            const record = await requestResult(transaction.objectStore(WORLD_STORE).get(identity)) as StoredWorldDeltaState | undefined;
            await transactionComplete(transaction);
            const state = record ? cloneState(record) : createEmptyState(descriptor);
            if (serializeWorldDescriptorV2(state.descriptor) !== identity) {
                throw new TypeError("stored world delta state has a mismatched descriptor identity");
            }
            this.worlds.set(identity, state);
            return cloneSnapshot(state.descriptor, state.snapshot);
        });
    }

    public override commit(request: WorldDeltaCommitRequest): Promise<WorldDeltaCommitResult> {
        this.assertReady();
        return this.enqueue(async () => {
            const identity = serializeWorldDescriptorV2(request.descriptor);
            const database = await this.open();
            const transaction = database.transaction(WORLD_STORE, "readwrite");
            const completion = transactionComplete(transaction);
            try {
                const store = transaction.objectStore(WORLD_STORE);
                const record = await requestResult(store.get(identity)) as StoredWorldDeltaState | undefined;
                const state = record ? cloneState(record) : createEmptyState(request.descriptor);
                const result = applyCommit(state, request);
                if (result.changed) store.put({ key: identity, ...cloneState(state) } satisfies StoredWorldDeltaState);
                await completion;
                this.worlds.set(identity, state);
                if (result.changed) {
                    this.commitCount += 1;
                    this.publish(result);
                }
                return result;
            } catch (reason) {
                try { transaction.abort(); } catch { /* already settled */ }
                await completion.catch(() => undefined);
                if (reason instanceof WorldDeltaRevisionConflictError) this.conflictCount += 1;
                throw reason;
            }
        });
    }

    public override saveBarrier(descriptor: WorldDescriptorV2): Promise<WorldDeltaCheckpoint> {
        this.assertReady();
        return this.enqueue(async () => {
            const identity = serializeWorldDescriptorV2(descriptor);
            const database = await this.open();
            const transaction = database.transaction(WORLD_STORE, "readwrite");
            const store = transaction.objectStore(WORLD_STORE);
            const record = await requestResult(store.get(identity)) as StoredWorldDeltaState | undefined;
            const state = record ? cloneState(record) : createEmptyState(descriptor);
            const checkpoint = checkpointFor(state);
            state.commits.length = 0;
            state.pendingCommitBytes = 0;
            store.put({ key: identity, ...cloneState(state) } satisfies StoredWorldDeltaState);
            await transactionComplete(transaction);
            this.worlds.set(identity, state);
            this.checkpointCount += 1;
            return checkpoint;
        });
    }

    public override restoreBarrier(descriptor: WorldDescriptorV2, checkpoint: WorldDeltaCheckpoint): Promise<void> {
        this.assertReady();
        return this.enqueue(async () => {
            const identity = serializeWorldDescriptorV2(descriptor);
            const state = stateFromCheckpoint(descriptor, checkpoint);
            const database = await this.open();
            const transaction = database.transaction(WORLD_STORE, "readwrite");
            transaction.objectStore(WORLD_STORE).put({ key: identity, ...cloneState(state) } satisfies StoredWorldDeltaState);
            await transactionComplete(transaction);
            this.worlds.set(identity, state);
        });
    }

    public override async flush(): Promise<void> {
        await this.pending;
        if (this.pendingError !== undefined) {
            const error = this.pendingError;
            this.pendingError = undefined;
            throw error;
        }
    }

    public override dispose(): void {
        if (this.disposed) return;
        void this.flush().finally(() => this.databasePromise?.then(database => database.close(), () => undefined));
        super.dispose();
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const result = this.pending.then(task, task);
        this.pending = result.then(() => undefined, error => { this.pendingError ??= error; });
        return result;
    }

    private open(): Promise<IDBDatabase> {
        if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
        this.databasePromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error("Opening the v3 world delta database timed out"));
            }, this.openTimeoutMs);
            const finish = <T>(callback: (value: T) => void, value: T): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback(value);
            };
            request.addEventListener("upgradeneeded", () => {
                if (!request.result.objectStoreNames.contains(WORLD_STORE)) {
                    request.result.createObjectStore(WORLD_STORE, { keyPath: "key" });
                }
            });
            request.addEventListener("success", () => {
                if (settled) {
                    request.result.close();
                    return;
                }
                request.result.addEventListener("versionchange", () => request.result.close());
                finish(resolve, request.result);
            }, { once: true });
            request.addEventListener("error", () => finish(reject, request.error ?? new Error("Opening IndexedDB failed")), { once: true });
            request.addEventListener("blocked", () => finish(reject, new Error("Opening IndexedDB was blocked")), { once: true });
        });
        return this.databasePromise;
    }
}
