import {
    SemanticChunkKey,
    semanticCatalogLimits
} from "./BaseSemanticChunk";
import {
    AuthoredHydrologyFeature,
    AuthoredHydrologyFeatureKind,
    AuthoredRiverOutlet,
    AuthoredRiverSource,
    HydrologyFeatureDelta,
    createHydrologyFeatureDelta
} from "./HydrologyFeatureDelta";
import {
    SparseSemanticDelta,
    SparseSemanticDeltaInput,
    createSparseSemanticDelta
} from "./SparseSemanticDelta";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";
import {
    WorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

export const SURFACE_DELTA_TRANSACTION_FORMAT_VERSION = 1;
export const MAX_SURFACE_DELTA_TRANSACTION_MUTATIONS = 4_096;
export const MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL = 1_048_576;

export type SurfaceSemanticDeltaPayload = Omit<SparseSemanticDeltaInput,
    "worldIdentity" | "key" | "revision">;

interface SurfaceSemanticMutationBase {
    readonly key: SemanticChunkKey;
    readonly expectedRevision: number;
}

export interface SurfaceSemanticUpsertMutation extends SurfaceSemanticMutationBase {
    readonly operation: "upsert";
    readonly payload: SurfaceSemanticDeltaPayload;
}

export interface SurfaceSemanticDeleteMutation extends SurfaceSemanticMutationBase {
    readonly operation: "delete";
}

export type SurfaceSemanticMutation = SurfaceSemanticUpsertMutation | SurfaceSemanticDeleteMutation;

interface SurfaceHydrologyMutationBase {
    readonly featureId: string;
    readonly featureKind: AuthoredHydrologyFeatureKind;
    readonly expectedRevision: number;
}

export interface SurfaceHydrologyUpsertMutation extends SurfaceHydrologyMutationBase {
    readonly operation: "upsert";
    readonly feature: AuthoredHydrologyFeature;
}

export interface SurfaceHydrologyDeleteMutation extends SurfaceHydrologyMutationBase {
    readonly operation: "delete";
}

export type SurfaceHydrologyMutation = SurfaceHydrologyUpsertMutation | SurfaceHydrologyDeleteMutation;

export interface SurfaceDeltaTransactionInput {
    readonly worldIdentity: string;
    readonly semanticMutations: readonly SurfaceSemanticMutation[];
    readonly hydrologyMutations: readonly SurfaceHydrologyMutation[];
}

export interface SurfaceSemanticUpsertChange {
    readonly operation: "upsert";
    readonly expectedRevision: number;
    readonly delta: SparseSemanticDelta;
}

export interface SurfaceSemanticDeleteChange {
    readonly operation: "delete";
    readonly key: SemanticChunkKey;
    readonly expectedRevision: number;
    readonly revision: number;
}

export type SurfaceSemanticChange = SurfaceSemanticUpsertChange | SurfaceSemanticDeleteChange;

export interface SurfaceHydrologyChange {
    readonly expectedRevision: number;
    readonly delta: HydrologyFeatureDelta;
}

export interface SurfaceDeltaCommit {
    readonly formatVersion: typeof SURFACE_DELTA_TRANSACTION_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly revision: number;
    readonly transactionId: bigint;
    readonly semanticChanges: readonly SurfaceSemanticChange[];
    readonly hydrologyChanges: readonly SurfaceHydrologyChange[];
}

export interface SurfaceSemanticDeltaState {
    readonly key: SemanticChunkKey;
    readonly revision: number;
    readonly delta?: SparseSemanticDelta;
}

export type EffectiveHydrologyGraphNode = Readonly<
    { readonly kind: "lake"; readonly featureId: string; readonly level: number }
    | {
        readonly kind: "river";
        readonly featureId: string;
        readonly source: AuthoredRiverSource;
        readonly outlet: AuthoredRiverOutlet;
        readonly sourceLevel: number;
        readonly outletLevel: number;
    }
>;

/**
 * Provides immutable base-graph metadata. referencesTo() must return every base
 * river whose source or outlet names featureId, in unique ascending ID order.
 */
export interface BaseHydrologyFeatureIndex {
    resolveFeature(featureId: string): EffectiveHydrologyGraphNode | undefined;
    referencesTo(featureId: string): readonly string[];
}

export class SurfaceDeltaConflictError extends Error {
    public readonly name = "SurfaceDeltaConflictError";

    constructor(
        public readonly targetKind: "semantic" | "hydrology",
        public readonly targetId: string,
        public readonly expectedRevision: number,
        public readonly actualRevision: number
    ) {
        super(`${targetKind} delta revision conflict for ${targetId}: expected ${expectedRevision}, received ${actualRevision}`);
    }
}

interface SnapshotState {
    readonly semanticByKey: ReadonlyMap<string, SurfaceSemanticDeltaState>;
    readonly hydrologyById: ReadonlyMap<string, HydrologyFeatureDelta>;
}

function semanticKeyIdentity(key: Readonly<SemanticChunkKey>): string {
    return `${key.chunkX}:${key.chunkY}`;
}

function compareSemanticKeys(first: Readonly<SemanticChunkKey>, second: Readonly<SemanticChunkKey>): number {
    return first.chunkX - second.chunkX || first.chunkY - second.chunkY;
}

function assertRevision(name: string, revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

function assertFeatureId(name: string, featureId: unknown): asserts featureId is string {
    if (typeof featureId !== "string" || featureId.length === 0 || featureId.length > 256
        || featureId.trim() !== featureId || /[\u0000-\u001f\u007f]/u.test(featureId)) {
        throw new TypeError(`${name} must be a canonical stable identity`);
    }
}

function assertCanonicalSemanticKey(descriptor: WorldDescriptorV2, key: Readonly<SemanticChunkKey>): void {
    if (!key || typeof key !== "object") throw new TypeError("semantic mutation key is required");
    const origin = chunkOrigin(key.chunkX, key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    if (descriptor.sourceKind === "procedural-infinite") return;
    const chunkCountX = Math.ceil(descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE);
    const chunkCountY = Math.ceil(descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE);
    if (key.chunkX < 0 || key.chunkX >= chunkCountX || key.chunkY < 0 || key.chunkY >= chunkCountY
        || origin.x < 0 || origin.y < 0) {
        throw new RangeError("semantic mutation must use a canonical in-domain chunk key");
    }
}

function assertSemanticDeltaBounds(
    descriptor: WorldDescriptorV2,
    delta: Readonly<SparseSemanticDelta>
): void {
    if (descriptor.sourceKind !== "static") return;
    const origin = chunkOrigin(delta.key.chunkX, delta.key.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    const validWidth = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, descriptor.width - origin.x);
    const validHeight = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, descriptor.height - origin.y);
    for (const tileIndex of delta.tileIndex) {
        const localX = Math.floor(tileIndex / WORLD_SEMANTIC_CHUNK_SIZE);
        const localY = tileIndex - localX * WORLD_SEMANTIC_CHUNK_SIZE;
        if (localX >= validWidth || localY >= validHeight) {
            throw new RangeError("semantic mutation tile lies outside the finite world");
        }
    }
}

function authoredGraphNode(feature: Readonly<AuthoredHydrologyFeature>): EffectiveHydrologyGraphNode {
    if (feature.kind === "lake") {
        return Object.freeze({ kind: "lake", featureId: feature.featureId, level: feature.level });
    }
    return Object.freeze({
        kind: "river",
        featureId: feature.featureId,
        source: feature.source,
        outlet: feature.outlet,
        sourceLevel: feature.levelProfile[0],
        outletLevel: feature.levelProfile[feature.levelProfile.length - 1]
    });
}

function ownedSemanticPayload(payload: Readonly<SurfaceSemanticDeltaPayload>): SurfaceSemanticDeltaPayload {
    return {
        tileIndex: payload.tileIndex.slice(),
        fieldMask: payload.fieldMask.slice(),
        macroHeight: payload.macroHeight.slice(),
        substrateClass: payload.substrateClass.slice(),
        biomeWeights: payload.biomeWeights.slice(),
        vegetationDensity: payload.vegetationDensity.slice(),
        vegetationProfile: payload.vegetationProfile.slice()
    };
}

function ownedHydrologyFeature(feature: Readonly<AuthoredHydrologyFeature>): AuthoredHydrologyFeature {
    return feature.kind === "river" ? {
        ...feature,
        source: feature.source.kind === "spring"
            ? Object.freeze({ kind: "spring", sourceId: feature.source.sourceId })
            : Object.freeze({ kind: "river", riverId: feature.source.riverId }),
        outlet: feature.outlet.kind === "river"
            ? Object.freeze({ kind: "river", riverId: feature.outlet.riverId })
            : feature.outlet.kind === "lake"
                ? Object.freeze({ kind: "lake", bodyId: feature.outlet.bodyId })
                : Object.freeze({ kind: "ocean", bodyId: feature.outlet.bodyId }),
        controlPoints: feature.controlPoints.slice(),
        widthProfile: feature.widthProfile.slice(),
        levelProfile: feature.levelProfile.slice()
    } : {
        ...feature,
        polygon: feature.polygon.slice()
    };
}

function stringBytes(value: string): number {
    const bytes = value.length * 2;
    if (!Number.isSafeInteger(bytes)) throw new RangeError("surface delta string size exceeds safe integers");
    return bytes;
}

function arraysEqual(first: ArrayLike<number>, second: ArrayLike<number>): boolean {
    if (first.length !== second.length) return false;
    for (let index = 0; index < first.length; index += 1) {
        if (first[index] !== second[index]) return false;
    }
    return true;
}

function semanticDeltaContentEqual(
    first: Readonly<SparseSemanticDelta>,
    second: Readonly<SparseSemanticDelta>
): boolean {
    return arraysEqual(first.tileIndex, second.tileIndex)
        && arraysEqual(first.fieldMask, second.fieldMask)
        && arraysEqual(first.macroHeight, second.macroHeight)
        && arraysEqual(first.substrateClass, second.substrateClass)
        && arraysEqual(first.biomeWeights, second.biomeWeights)
        && arraysEqual(first.vegetationDensity, second.vegetationDensity)
        && arraysEqual(first.vegetationProfile, second.vegetationProfile);
}

function hydrologyFeatureContentEqual(
    first: Readonly<AuthoredHydrologyFeature>,
    second: Readonly<AuthoredHydrologyFeature>
): boolean {
    if (first.kind !== second.kind || first.featureId !== second.featureId) return false;
    if (first.kind === "lake" || second.kind === "lake") {
        return first.kind === "lake" && second.kind === "lake"
            && first.level === second.level && first.profileIndex === second.profileIndex
            && arraysEqual(first.polygon, second.polygon);
    }
    const sourceEqual = first.source.kind === second.source.kind
        && (first.source.kind === "spring" && second.source.kind === "spring"
            ? first.source.sourceId === second.source.sourceId
            : first.source.kind === "river" && second.source.kind === "river"
                && first.source.riverId === second.source.riverId);
    const outletEqual = first.outlet.kind === second.outlet.kind
        && (first.outlet.kind === "river" && second.outlet.kind === "river"
            ? first.outlet.riverId === second.outlet.riverId
            : first.outlet.kind !== "river" && second.outlet.kind !== "river"
                && first.outlet.bodyId === second.outlet.bodyId);
    return sourceEqual && outletEqual
        && first.dischargeClass === second.dischargeClass
        && first.profileIndex === second.profileIndex
        && arraysEqual(first.controlPoints, second.controlPoints)
        && arraysEqual(first.widthProfile, second.widthProfile)
        && arraysEqual(first.levelProfile, second.levelProfile);
}

export function surfaceDeltaTransactionResidentBytes(
    input: Readonly<SurfaceDeltaTransactionInput>
): number {
    if (!input || typeof input !== "object"
        || !Array.isArray(input.semanticMutations) || !Array.isArray(input.hydrologyMutations)) {
        throw new TypeError("surface delta transaction is required for byte accounting");
    }
    let bytes = 256 + stringBytes(input.worldIdentity);
    for (const mutation of input.semanticMutations) {
        bytes += 96;
        if (mutation.operation === "upsert") {
            const payload = mutation.payload;
            bytes += payload.tileIndex.byteLength + payload.fieldMask.byteLength
                + payload.macroHeight.byteLength + payload.substrateClass.byteLength
                + payload.biomeWeights.byteLength + payload.vegetationDensity.byteLength
                + payload.vegetationProfile.byteLength;
        }
    }
    for (const mutation of input.hydrologyMutations) {
        bytes += 128 + stringBytes(mutation.featureId);
        if (mutation.operation === "upsert") {
            const feature = mutation.feature;
            if (feature.kind === "river") {
                bytes += stringBytes(feature.source.kind === "spring"
                    ? feature.source.sourceId : feature.source.riverId);
                bytes += stringBytes(feature.outlet.kind === "river"
                    ? feature.outlet.riverId : feature.outlet.bodyId);
                bytes += feature.controlPoints.byteLength + feature.widthProfile.byteLength
                    + feature.levelProfile.byteLength;
            } else bytes += feature.polygon.byteLength;
        }
    }
    if (!Number.isSafeInteger(bytes)) {
        throw new RangeError("surface delta transaction byte accounting exceeds safe integers");
    }
    return bytes;
}

function assertGraphNode(node: Readonly<EffectiveHydrologyGraphNode>, expectedId: string): void {
    if (!node || typeof node !== "object" || node.featureId !== expectedId) {
        throw new TypeError("base hydrology feature index returned a mismatched feature identity");
    }
    assertFeatureId("base hydrology feature", node.featureId);
    if (node.kind === "lake") {
        if (!Number.isInteger(node.level) || node.level < 0 || node.level > 0xffff) {
            throw new RangeError("base hydrology lake level must be a uint16 value");
        }
        return;
    }
    if (node.kind !== "river" || !Number.isInteger(node.sourceLevel)
        || node.sourceLevel < 0 || node.sourceLevel > 0xffff
        || !Number.isInteger(node.outletLevel) || node.outletLevel < 0 || node.outletLevel > 0xffff
        || node.outletLevel > node.sourceLevel) {
        throw new RangeError("base hydrology river levels or kind are invalid");
    }
    if (!node.source || typeof node.source !== "object" || !node.outlet || typeof node.outlet !== "object") {
        throw new TypeError("base hydrology river source and outlet are required");
    }
    if (node.source.kind === "spring") assertFeatureId("base hydrology spring", node.source.sourceId);
    else if (node.source.kind === "river") assertFeatureId("base hydrology source river", node.source.riverId);
    else throw new TypeError("base hydrology river source kind is invalid");
    if (node.outlet.kind === "ocean") {
        if (node.outlet.bodyId !== "ocean") throw new Error("base hydrology ocean outlet must use ocean");
    } else if (node.outlet.kind === "lake") assertFeatureId("base hydrology outlet lake", node.outlet.bodyId);
    else if (node.outlet.kind === "river") assertFeatureId("base hydrology outlet river", node.outlet.riverId);
    else throw new TypeError("base hydrology river outlet kind is invalid");
}

function assertCanonicalReferences(featureId: string, references: readonly string[]): void {
    if (!Array.isArray(references)) {
        throw new TypeError("base hydrology reverse references must be an array");
    }
    let previous: string | undefined;
    for (const reference of references) {
        assertFeatureId("base hydrology reverse reference", reference);
        if (previous !== undefined && previous >= reference) {
            throw new Error("base hydrology reverse references must use unique ascending identities");
        }
        previous = reference;
    }
    if (references.includes(featureId)) {
        throw new Error("base hydrology feature cannot reverse-reference itself");
    }
}

export class SurfaceDeltaSnapshot {
    public readonly worldIdentity: string;
    public readonly effectiveRevision: number;
    public readonly semanticStates: readonly SurfaceSemanticDeltaState[];
    public readonly hydrologyDeltas: readonly HydrologyFeatureDelta[];
    private readonly state: SnapshotState;

    constructor(worldIdentity: string, effectiveRevision: number, state: SnapshotState) {
        this.worldIdentity = worldIdentity;
        this.effectiveRevision = effectiveRevision;
        this.state = state;
        this.semanticStates = Object.freeze([...state.semanticByKey.values()]
            .sort((first, second) => compareSemanticKeys(first.key, second.key)));
        this.hydrologyDeltas = Object.freeze([...state.hydrologyById.values()]
            .sort((first, second) => first.featureId < second.featureId ? -1 : first.featureId > second.featureId ? 1 : 0));
        Object.freeze(this);
    }

    public getSemanticDelta(chunkX: number, chunkY: number): SparseSemanticDelta | undefined {
        chunkOrigin(chunkX, chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
        return this.state.semanticByKey.get(semanticKeyIdentity({ chunkX, chunkY }))?.delta;
    }

    public getSemanticRevision(chunkX: number, chunkY: number): number {
        chunkOrigin(chunkX, chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
        return this.state.semanticByKey.get(semanticKeyIdentity({ chunkX, chunkY }))?.revision ?? 0;
    }

    public getHydrologyDelta(featureId: string): HydrologyFeatureDelta | undefined {
        assertFeatureId("hydrology snapshot feature", featureId);
        return this.state.hydrologyById.get(featureId);
    }

    public getHydrologyRevision(featureId: string): number {
        return this.getHydrologyDelta(featureId)?.revision ?? 0;
    }
}

export interface SurfaceDeltaStore {
    readonly descriptor: WorldDescriptorV2;
    readonly worldIdentity: string;
    snapshot(): SurfaceDeltaSnapshot;
    commit(input: Readonly<SurfaceDeltaTransactionInput>): Promise<SurfaceDeltaCommit>;
    flush(): Promise<void>;
}

export interface PreparedSurfaceDeltaCommit {
    readonly commit: SurfaceDeltaCommit;
    readonly snapshot: SurfaceDeltaSnapshot;
}

export class MemorySurfaceDeltaStore implements SurfaceDeltaStore {
    public readonly descriptor: WorldDescriptorV2;
    public readonly worldIdentity: string;
    protected readonly baseHydrology: BaseHydrologyFeatureIndex;
    protected current: SurfaceDeltaSnapshot;

    constructor(descriptor: WorldDescriptorV2, baseHydrology: BaseHydrologyFeatureIndex) {
        assertWorldDescriptorV2(descriptor);
        if (!baseHydrology || typeof baseHydrology.resolveFeature !== "function"
            || typeof baseHydrology.referencesTo !== "function") {
            throw new TypeError("surface delta store requires a valid base hydrology feature index");
        }
        this.descriptor = descriptor;
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
        this.baseHydrology = baseHydrology;
        this.current = new SurfaceDeltaSnapshot(this.worldIdentity, 0, {
            semanticByKey: new Map(),
            hydrologyById: new Map()
        });
    }

    public snapshot(): SurfaceDeltaSnapshot {
        return this.current;
    }

    public commit(input: Readonly<SurfaceDeltaTransactionInput>): Promise<SurfaceDeltaCommit> {
        try {
            const prepared = this.prepareCommit(input);
            this.publishPreparedCommit(prepared);
            return Promise.resolve(prepared.commit);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public flush(): Promise<void> { return Promise.resolve(); }

    protected prepareCommit(
        input: Readonly<SurfaceDeltaTransactionInput>,
        ownsInput = false
    ): PreparedSurfaceDeltaCommit {
        this.assertTransaction(input);
        if (this.current.effectiveRevision >= Number.MAX_SAFE_INTEGER) {
            throw new RangeError("surface delta revision space is exhausted");
        }
        const revision = this.current.effectiveRevision + 1;
        const semanticByKey = new Map<string, SurfaceSemanticDeltaState>();
        for (const state of this.current.semanticStates) semanticByKey.set(semanticKeyIdentity(state.key), state);
        const hydrologyById = new Map<string, HydrologyFeatureDelta>();
        for (const delta of this.current.hydrologyDeltas) hydrologyById.set(delta.featureId, delta);

        const semanticMutations = [...input.semanticMutations]
            .sort((first, second) => compareSemanticKeys(first.key, second.key));
        const hydrologyMutations = [...input.hydrologyMutations]
            .sort((first, second) => first.featureId < second.featureId ? -1 : first.featureId > second.featureId ? 1 : 0);
        const semanticChanges = semanticMutations.map(mutation => this.applySemanticMutation(
            semanticByKey,
            mutation,
            revision,
            ownsInput
        ));
        const hydrologyChanges = hydrologyMutations.map(mutation => this.applyHydrologyMutation(
            hydrologyById,
            mutation,
            revision,
            ownsInput
        ));

        this.assertEffectiveHydrologyGraph(
            hydrologyById,
            hydrologyMutations.map(mutation => mutation.featureId)
        );
        const next = new SurfaceDeltaSnapshot(this.worldIdentity, revision, {
            semanticByKey,
            hydrologyById
        });
        const commit: SurfaceDeltaCommit = Object.freeze({
            formatVersion: SURFACE_DELTA_TRANSACTION_FORMAT_VERSION,
            worldIdentity: this.worldIdentity,
            revision,
            transactionId: BigInt(revision),
            semanticChanges: Object.freeze(semanticChanges),
            hydrologyChanges: Object.freeze(hydrologyChanges)
        });
        return Object.freeze({ commit, snapshot: next });
    }

    protected publishPreparedCommit(prepared: Readonly<PreparedSurfaceDeltaCommit>): void {
        if (prepared.snapshot.effectiveRevision !== this.current.effectiveRevision + 1
            || prepared.commit.revision !== prepared.snapshot.effectiveRevision
            || prepared.commit.worldIdentity !== this.worldIdentity
            || prepared.snapshot.worldIdentity !== this.worldIdentity) {
            throw new Error("prepared surface delta commit no longer follows the current snapshot");
        }
        this.current = prepared.snapshot;
    }

    protected installSnapshot(
        effectiveRevision: number,
        semanticStates: readonly SurfaceSemanticDeltaState[],
        hydrologyDeltas: readonly HydrologyFeatureDelta[]
    ): void {
        assertRevision("surface delta snapshot revision", effectiveRevision);
        const semanticByKey = new Map<string, SurfaceSemanticDeltaState>();
        const hydrologyById = new Map<string, HydrologyFeatureDelta>();
        let maximumRevision = 0;
        for (const state of semanticStates) {
            if (!state || typeof state !== "object") {
                throw new TypeError("persisted surface semantic state is invalid");
            }
            assertCanonicalSemanticKey(this.descriptor, state.key);
            if (!Number.isSafeInteger(state.revision) || state.revision <= 0
                || state.revision > effectiveRevision) {
                throw new RangeError("persisted surface semantic revision is invalid");
            }
            const identity = semanticKeyIdentity(state.key);
            if (semanticByKey.has(identity)) {
                throw new Error("persisted surface snapshot contains duplicate semantic keys");
            }
            if (state.delta) {
                const delta = createSparseSemanticDelta(state.delta, semanticCatalogLimits(this.descriptor));
                if (delta.worldIdentity !== this.worldIdentity
                    || delta.key.chunkX !== state.key.chunkX || delta.key.chunkY !== state.key.chunkY
                    || delta.revision !== state.revision) {
                    throw new Error("persisted sparse semantic delta does not match its state record");
                }
                assertSemanticDeltaBounds(this.descriptor, delta);
                semanticByKey.set(identity, Object.freeze({
                    key: delta.key,
                    revision: state.revision,
                    delta
                }));
            } else {
                semanticByKey.set(identity, Object.freeze({
                    key: Object.freeze({ chunkX: state.key.chunkX, chunkY: state.key.chunkY }),
                    revision: state.revision
                }));
            }
            maximumRevision = Math.max(maximumRevision, state.revision);
        }
        for (const input of hydrologyDeltas) {
            const delta = createHydrologyFeatureDelta(input);
            if (delta.worldIdentity !== this.worldIdentity || delta.revision > effectiveRevision) {
                throw new Error("persisted hydrology delta does not match its snapshot");
            }
            if (hydrologyById.has(delta.featureId)) {
                throw new Error("persisted surface snapshot contains duplicate hydrology features");
            }
            hydrologyById.set(delta.featureId, delta);
            maximumRevision = Math.max(maximumRevision, delta.revision);
        }
        if (maximumRevision !== effectiveRevision) {
            throw new Error("persisted surface snapshot revision has no matching committed mutation");
        }
        this.assertEffectiveHydrologyGraph(hydrologyById, [...hydrologyById.keys()]);
        this.current = new SurfaceDeltaSnapshot(this.worldIdentity, effectiveRevision, {
            semanticByKey,
            hydrologyById
        });
    }

    protected assertTransaction(input: Readonly<SurfaceDeltaTransactionInput>): void {
        if (!input || typeof input !== "object" || input.worldIdentity !== this.worldIdentity) {
            throw new TypeError("surface delta transaction world identity is invalid");
        }
        if (!Array.isArray(input.semanticMutations) || !Array.isArray(input.hydrologyMutations)) {
            throw new TypeError("surface delta transaction mutation lists are required");
        }
        const mutationCount = input.semanticMutations.length + input.hydrologyMutations.length;
        if (mutationCount <= 0 || mutationCount > MAX_SURFACE_DELTA_TRANSACTION_MUTATIONS) {
            throw new RangeError("surface delta transaction mutation count is outside its fixed budget");
        }
        const semanticKeys = new Set<string>();
        for (const mutation of input.semanticMutations) {
            if (!mutation || typeof mutation !== "object"
                || (mutation.operation !== "upsert" && mutation.operation !== "delete")) {
                throw new TypeError("surface semantic mutation operation is invalid");
            }
            assertCanonicalSemanticKey(this.descriptor, mutation.key);
            assertRevision("surface semantic expected revision", mutation.expectedRevision);
            const identity = semanticKeyIdentity(mutation.key);
            if (semanticKeys.has(identity)) throw new Error("surface delta transaction contains duplicate semantic chunks");
            semanticKeys.add(identity);
        }
        const featureIds = new Set<string>();
        for (const mutation of input.hydrologyMutations) {
            if (!mutation || typeof mutation !== "object"
                || (mutation.operation !== "upsert" && mutation.operation !== "delete")) {
                throw new TypeError("surface hydrology mutation operation is invalid");
            }
            assertFeatureId("surface hydrology mutation", mutation.featureId);
            if (mutation.featureKind !== "river" && mutation.featureKind !== "lake") {
                throw new TypeError("surface hydrology mutation kind is invalid");
            }
            assertRevision("surface hydrology expected revision", mutation.expectedRevision);
            if (featureIds.has(mutation.featureId)) {
                throw new Error("surface delta transaction contains duplicate hydrology features");
            }
            featureIds.add(mutation.featureId);
        }
    }

    protected snapshotTransactionInput(
        input: Readonly<SurfaceDeltaTransactionInput>
    ): SurfaceDeltaTransactionInput {
        this.assertTransaction(input);
        const semanticMutations = input.semanticMutations.map(mutation => Object.freeze(
            mutation.operation === "upsert" ? {
                operation: mutation.operation,
                key: Object.freeze({ chunkX: mutation.key.chunkX, chunkY: mutation.key.chunkY }),
                expectedRevision: mutation.expectedRevision,
                payload: Object.freeze(ownedSemanticPayload(mutation.payload))
            } : {
                operation: mutation.operation,
                key: Object.freeze({ chunkX: mutation.key.chunkX, chunkY: mutation.key.chunkY }),
                expectedRevision: mutation.expectedRevision
            }
        ));
        const hydrologyMutations = input.hydrologyMutations.map(mutation => Object.freeze(
            mutation.operation === "upsert" ? {
                operation: mutation.operation,
                featureId: mutation.featureId,
                featureKind: mutation.featureKind,
                expectedRevision: mutation.expectedRevision,
                feature: Object.freeze(ownedHydrologyFeature(mutation.feature))
            } : {
                operation: mutation.operation,
                featureId: mutation.featureId,
                featureKind: mutation.featureKind,
                expectedRevision: mutation.expectedRevision
            }
        ));
        const snapshot: SurfaceDeltaTransactionInput = Object.freeze({
            worldIdentity: input.worldIdentity,
            semanticMutations: Object.freeze(semanticMutations),
            hydrologyMutations: Object.freeze(hydrologyMutations)
        });
        surfaceDeltaTransactionResidentBytes(snapshot);
        return snapshot;
    }

    private applySemanticMutation(
        semanticByKey: Map<string, SurfaceSemanticDeltaState>,
        mutation: Readonly<SurfaceSemanticMutation>,
        revision: number,
        ownsInput: boolean
    ): SurfaceSemanticChange {
        const identity = semanticKeyIdentity(mutation.key);
        const current = semanticByKey.get(identity);
        const actualRevision = current?.revision ?? 0;
        if (actualRevision !== mutation.expectedRevision) {
            throw new SurfaceDeltaConflictError("semantic", identity, mutation.expectedRevision, actualRevision);
        }
        const key = Object.freeze({ chunkX: mutation.key.chunkX, chunkY: mutation.key.chunkY });
        if (mutation.operation === "delete") {
            if (!current?.delta) throw new Error("cannot delete an absent semantic delta");
            const state = Object.freeze({ key, revision });
            semanticByKey.set(identity, state);
            return Object.freeze({
                operation: "delete",
                key,
                expectedRevision: mutation.expectedRevision,
                revision
            });
        }
        if (!mutation.payload || typeof mutation.payload !== "object") {
            throw new TypeError("semantic upsert requires a complete sparse delta payload");
        }
        const delta = createSparseSemanticDelta({
            ...(ownsInput ? mutation.payload : ownedSemanticPayload(mutation.payload)),
            worldIdentity: this.worldIdentity,
            key,
            revision
        }, semanticCatalogLimits(this.descriptor));
        assertSemanticDeltaBounds(this.descriptor, delta);
        if (current?.delta && semanticDeltaContentEqual(current.delta, delta)) {
            throw new Error("semantic upsert does not change authoritative content");
        }
        semanticByKey.set(identity, Object.freeze({ key, revision, delta }));
        return Object.freeze({ operation: "upsert", expectedRevision: mutation.expectedRevision, delta });
    }

    private applyHydrologyMutation(
        hydrologyById: Map<string, HydrologyFeatureDelta>,
        mutation: Readonly<SurfaceHydrologyMutation>,
        revision: number,
        ownsInput: boolean
    ): SurfaceHydrologyChange {
        const currentDelta = hydrologyById.get(mutation.featureId);
        const actualRevision = currentDelta?.revision ?? 0;
        if (actualRevision !== mutation.expectedRevision) {
            throw new SurfaceDeltaConflictError(
                "hydrology",
                mutation.featureId,
                mutation.expectedRevision,
                actualRevision
            );
        }
        const currentFeature = this.resolveEffectiveHydrologyFeature(mutation.featureId, hydrologyById);
        if (mutation.operation === "delete") {
            if (!currentFeature) throw new Error("cannot delete an absent hydrology feature");
            if (currentFeature.kind !== mutation.featureKind) {
                throw new Error("hydrology delete kind does not match the effective feature");
            }
        } else {
            if (!mutation.feature || mutation.feature.featureId !== mutation.featureId
                || mutation.feature.kind !== mutation.featureKind) {
                throw new Error("hydrology upsert identity or kind does not match its complete feature");
            }
            if (currentFeature && currentFeature.kind !== mutation.featureKind) {
                throw new Error("hydrology feature kind cannot change under a stable identity");
            }
        }
        const delta = createHydrologyFeatureDelta(mutation.operation === "upsert" ? {
            worldIdentity: this.worldIdentity,
            revision,
            featureId: mutation.featureId,
            featureKind: mutation.featureKind,
            operation: "upsert",
            feature: ownsInput ? mutation.feature : ownedHydrologyFeature(mutation.feature)
        } : {
            worldIdentity: this.worldIdentity,
            revision,
            featureId: mutation.featureId,
            featureKind: mutation.featureKind,
            operation: "delete"
        });
        if (currentDelta?.operation === "upsert" && delta.operation === "upsert"
            && hydrologyFeatureContentEqual(currentDelta.feature, delta.feature)) {
            throw new Error("hydrology upsert does not change authoritative content");
        }
        hydrologyById.set(mutation.featureId, delta);
        return Object.freeze({ expectedRevision: mutation.expectedRevision, delta });
    }

    private resolveEffectiveHydrologyFeature(
        featureId: string,
        hydrologyById: ReadonlyMap<string, HydrologyFeatureDelta>
    ): EffectiveHydrologyGraphNode | undefined {
        const delta = hydrologyById.get(featureId);
        if (delta) return delta.operation === "upsert" ? authoredGraphNode(delta.feature) : undefined;
        const base = this.baseHydrology.resolveFeature(featureId);
        if (base) assertGraphNode(base, featureId);
        return base;
    }

    private assertEffectiveHydrologyGraph(
        hydrologyById: ReadonlyMap<string, HydrologyFeatureDelta>,
        changedFeatureIds: readonly string[]
    ): void {
        const ids = new Set<string>();
        for (const delta of hydrologyById.values()) {
            if (delta.operation === "upsert") ids.add(delta.featureId);
        }
        for (const changedFeatureId of changedFeatureIds) {
            const references = this.baseHydrology.referencesTo(changedFeatureId);
            assertCanonicalReferences(changedFeatureId, references);
            for (const featureId of references) ids.add(featureId);
            if (this.resolveEffectiveHydrologyFeature(changedFeatureId, hydrologyById)) {
                ids.add(changedFeatureId);
            }
        }
        const orderedIds = [...ids].sort();
        for (const featureId of orderedIds) {
            const node = this.resolveEffectiveHydrologyFeature(featureId, hydrologyById);
            if (node) this.assertHydrologyConnections(node, hydrologyById);
        }
        for (const featureId of orderedIds) {
            const node = this.resolveEffectiveHydrologyFeature(featureId, hydrologyById);
            if (node?.kind === "river") this.assertHydrologyOutletAcyclic(featureId, hydrologyById);
        }
    }

    private assertHydrologyConnections(
        node: Readonly<EffectiveHydrologyGraphNode>,
        hydrologyById: ReadonlyMap<string, HydrologyFeatureDelta>
    ): void {
        if (node.kind === "lake") return;
        if (node.source.kind === "river") {
            const source = this.resolveEffectiveHydrologyFeature(node.source.riverId, hydrologyById);
            if (!source || source.kind !== "river") {
                throw new Error(`hydrology river ${node.featureId} has a missing river source`);
            }
            if (source.outlet.kind !== "river" || source.outlet.riverId !== node.featureId) {
                throw new Error(`hydrology river ${node.featureId} source does not outlet to it`);
            }
            if (source.outletLevel < node.sourceLevel) {
                throw new Error(`hydrology river ${node.featureId} rises above its source river`);
            }
        }
        if (node.outlet.kind === "ocean") {
            if (node.outletLevel < this.descriptor.seaLevel) {
                throw new Error(`hydrology river ${node.featureId} reaches ocean below sea level`);
            }
            return;
        }
        const outletId = node.outlet.kind === "lake" ? node.outlet.bodyId : node.outlet.riverId;
        const outlet = this.resolveEffectiveHydrologyFeature(outletId, hydrologyById);
        if (!outlet || outlet.kind !== node.outlet.kind) {
            throw new Error(`hydrology river ${node.featureId} has a missing or mismatched outlet`);
        }
        const outletLevel = outlet.kind === "lake" ? outlet.level : outlet.sourceLevel;
        if (node.outletLevel < outletLevel) {
            throw new Error(`hydrology river ${node.featureId} rises at its outlet`);
        }
    }

    private assertHydrologyOutletAcyclic(
        startId: string,
        hydrologyById: ReadonlyMap<string, HydrologyFeatureDelta>
    ): void {
        const visited = new Set<string>();
        let featureId = startId;
        for (let count = 0; count < MAX_EFFECTIVE_HYDROLOGY_GRAPH_TRAVERSAL; count += 1) {
            if (visited.has(featureId)) throw new Error("effective hydrology outlet graph contains a cycle");
            visited.add(featureId);
            const node = this.resolveEffectiveHydrologyFeature(featureId, hydrologyById);
            if (!node || node.kind !== "river" || node.outlet.kind !== "river") return;
            featureId = node.outlet.riverId;
        }
        throw new RangeError("effective hydrology graph exceeds its fixed traversal budget");
    }
}
