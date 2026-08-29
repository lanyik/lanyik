import { positiveModulo } from "../helpers/topology";
import {
    SemanticChunkKey,
    semanticBiomeWeightIndex,
    semanticTileIndex
} from "./BaseSemanticChunk";
import {
    COMPILED_SURFACE_TEXEL_COUNT,
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_RIVER,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import { EffectiveWorldView } from "./EffectiveWorldView";
import { getEffectiveSemanticTile } from "./EffectiveSemanticChunk";
import { float16BitsToFloat32 } from "./HalfFloat";
import {
    AuthoredHydrologyFeature,
    AuthoredHydrologyFeatureKind,
    createAuthoredLakeFeature,
    createAuthoredRiverFeature
} from "./HydrologyFeatureDelta";
import {
    HydrologyFeatureBoundsQ64,
    authoredHydrologyFeatureBoundsQ64,
    projectHydrologyBoundsQ64
} from "./HydrologyFeatureSpatialIndex";
import { HYDROLOGY_POINT_QUANTIZATION } from "./HydrologyRegion";
import { HydrologyWorldSource } from "./HydrologyWorldSource";
import { SemanticWorldSource } from "./SemanticWorldSource";
import {
    SEMANTIC_DELTA_FIELD_BIOME,
    SEMANTIC_DELTA_FIELD_HEIGHT,
    SEMANTIC_DELTA_FIELD_SUBSTRATE,
    SEMANTIC_DELTA_FIELD_VEGETATION,
    SparseSemanticDelta
} from "./SparseSemanticDelta";
import {
    BaseHydrologyChangeIndex,
    WorldChangeResidency,
    WorldChangeSet,
    createWorldChangeSet
} from "./WorldChangeSet";
import {
    SurfaceDeltaSnapshot,
    SurfaceDeltaStore,
    SurfaceDeltaTransactionInput,
    SurfaceHydrologyMutation,
    SurfaceSemanticDeltaPayload,
    SurfaceSemanticMutation
} from "./SurfaceDeltaStore";
import { SurfaceCompileMetrics } from "./SurfaceDependencyKey";
import {
    SURFACE_COMPILE_PROFILE,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";
import { surfaceTexelCenterAxis } from "./SurfaceLattice";
import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow,
    buildTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "./WorldDescriptorV2";
import { renderChunkLocation, semanticChunkLocation } from "./WorldGrid";
import {
    SurfaceFieldCompilation,
    collectSurfaceHydrologyDepthViolations,
    compileSurfaceField
} from "./compileSurfaceField";

export const MAX_SURFACE_EDIT_AREA_SAMPLES = 65_536;
export const MAX_SURFACE_EDIT_VALIDATION_RENDER_CHUNKS = 4_096;
export const MAX_PRESERVE_CHANNEL_PASSES = 8;
export const MAX_SURFACE_EDIT_CONFLICT_DETAILS = 1_024;
export const MAX_SURFACE_EDIT_LAKE_CONNECTIVITY_CELLS = 1_048_576;
const MAX_INTERNAL_SURFACE_EDIT_CONFLICTS = 131_072;

export type SurfaceWaterConflictPolicy = "reject" | "preserve-channel" | "coupled";
export type SurfaceEditFalloff = "constant" | "linear" | "smooth";

export interface SurfaceEditAreaSample {
    readonly tileX: number;
    readonly tileY: number;
    readonly strength: number;
}

export interface SurfaceEditArea {
    readonly samples: readonly SurfaceEditAreaSample[];
}

export interface RaiseTerrainOptions {
    readonly delta: number;
    readonly falloff: SurfaceEditFalloff;
    readonly waterPolicy: SurfaceWaterConflictPolicy;
}

export interface PaintMaterialOptions {
    readonly substrateClass?: number;
    readonly biomeWeights?: readonly [number, number, number, number];
}

export interface PaintVegetationOptions {
    readonly density: number;
    readonly profile: number;
}

export interface SurfaceEditTransaction {
    raiseTerrain(area: Readonly<SurfaceEditArea>, options: Readonly<RaiseTerrainOptions>): void;
    paintMaterial(area: Readonly<SurfaceEditArea>, options: Readonly<PaintMaterialOptions>): void;
    paintVegetation(area: Readonly<SurfaceEditArea>, options: Readonly<PaintVegetationOptions>): void;
    upsertHydrology(feature: Readonly<AuthoredHydrologyFeature>): void;
    deleteHydrology(featureId: string, featureKind: AuthoredHydrologyFeatureKind): void;
}

export interface SurfaceWorldEditorOptions {
    readonly store: SurfaceDeltaStore;
    readonly semanticSource: SemanticWorldSource;
    readonly hydrologySource: HydrologyWorldSource;
    readonly baseHydrology: BaseHydrologyChangeIndex;
    readonly metrics: SurfaceCompileMetrics;
    readonly minimumExplicitWaterDepth: number;
    readonly residency: () => Readonly<WorldChangeResidency>;
}

export interface SurfaceEditConflictDetail {
    readonly kind: "river-depth" | "explicit-depth" | "explicit-continuity"
        | "feature-dry" | "lake-disconnected";
    readonly featureId: string;
    readonly renderChunkX: number;
    readonly renderChunkY: number;
    readonly u?: number;
    readonly v?: number;
    readonly groundHeight?: number;
    readonly waterLevel?: number;
    readonly minimumDepth: number;
}

export class SurfaceEditConflictError extends Error {
    public readonly name = "SurfaceEditConflictError";

    constructor(
        public readonly policy: SurfaceWaterConflictPolicy,
        public readonly conflictCount: number,
        public readonly details: readonly SurfaceEditConflictDetail[]
    ) {
        super(`surface ${policy} edit has ${conflictCount} hydrology conflict(s)`);
    }
}

export class SurfaceEditBusyError extends Error {
    public readonly name = "SurfaceEditBusyError";

    constructor() {
        super("surface editor already has an in-flight transaction");
    }
}

interface RaiseTerrainOperation {
    readonly kind: "raise-terrain";
    readonly area: SurfaceEditArea;
    readonly options: RaiseTerrainOptions;
}

interface PaintMaterialOperation {
    readonly kind: "paint-material";
    readonly area: SurfaceEditArea;
    readonly options: PaintMaterialOptions;
}

interface PaintVegetationOperation {
    readonly kind: "paint-vegetation";
    readonly area: SurfaceEditArea;
    readonly options: PaintVegetationOptions;
}

interface UpsertHydrologyOperation {
    readonly kind: "upsert-hydrology";
    readonly feature: AuthoredHydrologyFeature;
}

interface DeleteHydrologyOperation {
    readonly kind: "delete-hydrology";
    readonly featureId: string;
    readonly featureKind: AuthoredHydrologyFeatureKind;
}

type SurfaceEditOperation = RaiseTerrainOperation | PaintMaterialOperation
    | PaintVegetationOperation | UpsertHydrologyOperation | DeleteHydrologyOperation;

interface SurfaceEditPlan {
    readonly operations: readonly SurfaceEditOperation[];
    readonly waterPolicy?: SurfaceWaterConflictPolicy;
    readonly hasHeightEdits: boolean;
    readonly hasHydrologyEdits: boolean;
}

function assertUint8(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new RangeError(`${name} must be a uint8 value`);
    }
}

function assertFeatureIdentity(featureId: unknown): asserts featureId is string {
    if (typeof featureId !== "string" || featureId.length === 0 || featureId.length > 256
        || featureId.trim() !== featureId || /[\u0000-\u001f\u007f]/u.test(featureId)) {
        throw new TypeError("surface edit feature ID must be a canonical stable identity");
    }
}

export function createSurfaceEditArea(
    samples: readonly Readonly<SurfaceEditAreaSample>[]
): SurfaceEditArea {
    if (!Array.isArray(samples) || samples.length === 0
        || samples.length > MAX_SURFACE_EDIT_AREA_SAMPLES) {
        throw new RangeError("surface edit area must contain a bounded non-empty sample array");
    }
    const owned = samples.map(sample => {
        if (!sample || typeof sample !== "object"
            || !Number.isSafeInteger(sample.tileX) || !Number.isSafeInteger(sample.tileY)) {
            throw new RangeError("surface edit area coordinates must be safe integers");
        }
        if (!Number.isInteger(sample.strength) || sample.strength <= 0 || sample.strength > 0xff) {
            throw new RangeError("surface edit area strength must be an integer from 1 through 255");
        }
        return Object.freeze({ tileX: sample.tileX, tileY: sample.tileY, strength: sample.strength });
    }).sort((first, second) => first.tileX - second.tileX || first.tileY - second.tileY);
    for (let index = 1; index < owned.length; index += 1) {
        if (owned[index - 1].tileX === owned[index].tileX
            && owned[index - 1].tileY === owned[index].tileY) {
            throw new Error("surface edit area contains duplicate tile coordinates");
        }
    }
    return Object.freeze({ samples: Object.freeze(owned) });
}

function cloneArea(area: Readonly<SurfaceEditArea>): SurfaceEditArea {
    if (!area || typeof area !== "object") throw new TypeError("surface edit area is required");
    return createSurfaceEditArea(area.samples);
}

function cloneExactPaintArea(area: Readonly<SurfaceEditArea>): SurfaceEditArea {
    const owned = cloneArea(area);
    if (owned.samples.some(sample => sample.strength !== 0xff)) {
        throw new RangeError("absolute material and vegetation edits require strength 255 samples");
    }
    return owned;
}

class MutableSurfaceEditTransaction implements SurfaceEditTransaction {
    private readonly operations: SurfaceEditOperation[] = [];
    private sealed = false;

    public raiseTerrain(area: Readonly<SurfaceEditArea>, options: Readonly<RaiseTerrainOptions>): void {
        this.assertOpen();
        if (!options || typeof options !== "object" || !Number.isFinite(options.delta)
            || options.delta === 0 || options.delta < -1 || options.delta > 1) {
            throw new RangeError("terrain delta must be a finite non-zero normalized value in [-1, 1]");
        }
        if (options.falloff !== "constant" && options.falloff !== "linear" && options.falloff !== "smooth") {
            throw new TypeError("terrain edit falloff is invalid");
        }
        if (options.waterPolicy !== "reject" && options.waterPolicy !== "preserve-channel"
            && options.waterPolicy !== "coupled") {
            throw new TypeError("terrain edit water policy is invalid");
        }
        this.operations.push(Object.freeze({
            kind: "raise-terrain",
            area: cloneArea(area),
            options: Object.freeze({ ...options })
        }));
    }

    public paintMaterial(area: Readonly<SurfaceEditArea>, options: Readonly<PaintMaterialOptions>): void {
        this.assertOpen();
        if (!options || typeof options !== "object"
            || options.substrateClass === undefined && options.biomeWeights === undefined) {
            throw new TypeError("material edit requires substrateClass or biomeWeights");
        }
        if (options.substrateClass !== undefined) assertUint8("material substrate class", options.substrateClass);
        let biomeWeights: readonly [number, number, number, number] | undefined;
        if (options.biomeWeights !== undefined) {
            if (!Array.isArray(options.biomeWeights) || options.biomeWeights.length !== 4) {
                throw new TypeError("material biome weights must contain four uint8 values");
            }
            for (const value of options.biomeWeights) assertUint8("material biome weight", value);
            if (options.biomeWeights.reduce((sum, value) => sum + value, 0) !== 255) {
                throw new RangeError("material biome weights must sum to 255");
            }
            biomeWeights = Object.freeze([...options.biomeWeights]) as readonly [number, number, number, number];
        }
        this.operations.push(Object.freeze({
            kind: "paint-material",
            area: cloneExactPaintArea(area),
            options: Object.freeze({
                ...(options.substrateClass !== undefined ? { substrateClass: options.substrateClass } : {}),
                ...(biomeWeights ? { biomeWeights } : {})
            })
        }));
    }

    public paintVegetation(
        area: Readonly<SurfaceEditArea>,
        options: Readonly<PaintVegetationOptions>
    ): void {
        this.assertOpen();
        if (!options || typeof options !== "object") throw new TypeError("vegetation edit options are required");
        assertUint8("vegetation density", options.density);
        assertUint8("vegetation profile", options.profile);
        this.operations.push(Object.freeze({
            kind: "paint-vegetation",
            area: cloneExactPaintArea(area),
            options: Object.freeze({ density: options.density, profile: options.profile })
        }));
    }

    public upsertHydrology(feature: Readonly<AuthoredHydrologyFeature>): void {
        this.assertOpen();
        if (!feature || typeof feature !== "object") throw new TypeError("hydrology edit feature is required");
        const owned = feature.kind === "river"
            ? createAuthoredRiverFeature({
                ...feature,
                controlPoints: feature.controlPoints.slice(),
                widthProfile: feature.widthProfile.slice(),
                levelProfile: feature.levelProfile.slice()
            })
            : feature.kind === "lake" ? createAuthoredLakeFeature(feature)
                : (() => { throw new TypeError("hydrology edit feature kind is invalid"); })();
        this.operations.push(Object.freeze({ kind: "upsert-hydrology", feature: owned }));
    }

    public deleteHydrology(featureId: string, featureKind: AuthoredHydrologyFeatureKind): void {
        this.assertOpen();
        assertFeatureIdentity(featureId);
        if (featureKind !== "river" && featureKind !== "lake") {
            throw new TypeError("hydrology delete kind is invalid");
        }
        this.operations.push(Object.freeze({ kind: "delete-hydrology", featureId, featureKind }));
    }

    public finish(): SurfaceEditPlan {
        this.assertOpen();
        this.sealed = true;
        if (this.operations.length === 0) throw new Error("surface edit transaction cannot be empty");
        const policies = new Set(this.operations.flatMap(operation => operation.kind === "raise-terrain"
            ? [operation.options.waterPolicy] : []));
        if (policies.size > 1) {
            throw new Error("all height operations in one surface transaction must use one water policy");
        }
        const hasHeightEdits = policies.size === 1;
        const hasHydrologyEdits = this.operations.some(operation => operation.kind === "upsert-hydrology"
            || operation.kind === "delete-hydrology");
        const waterPolicy = policies.values().next().value as SurfaceWaterConflictPolicy | undefined;
        if (hasHeightEdits && hasHydrologyEdits && waterPolicy !== "coupled") {
            throw new Error("height and hydrology mutations in one transaction require the coupled policy");
        }
        if (waterPolicy === "coupled" && !hasHydrologyEdits) {
            throw new Error("coupled terrain edits require at least one hydrology mutation");
        }
        return Object.freeze({
            operations: Object.freeze([...this.operations]),
            ...(waterPolicy ? { waterPolicy } : {}),
            hasHeightEdits,
            hasHydrologyEdits
        });
    }

    private assertOpen(): void {
        if (this.sealed) throw new Error("surface edit transaction has already been finalized");
    }
}

interface CanonicalAreaSample extends SurfaceEditAreaSample {
    readonly tileKey: string;
}

interface MutableSemanticEntry {
    fieldMask: number;
    macroHeight: number;
    substrateClass: number;
    biome0: number;
    biome1: number;
    biome2: number;
    biome3: number;
    vegetationDensity: number;
    vegetationProfile: number;
}

interface SemanticBaseFields {
    readonly substrateClass: number;
    readonly macroHeight: number;
    readonly biomeWeights: readonly [number, number, number, number];
    readonly vegetationDensity: number;
    readonly vegetationProfile: number;
}

interface MutableSemanticChunk {
    readonly key: SemanticChunkKey;
    readonly before?: SparseSemanticDelta;
    readonly expectedRevision: number;
    readonly entries: Map<number, MutableSemanticEntry>;
}

interface HeightEditState {
    readonly tileX: number;
    readonly tileY: number;
    readonly tileKey: string;
    readonly tileIndex: number;
    readonly chunk: MutableSemanticChunk;
    readonly entry: MutableSemanticEntry;
    readonly baseHeight: number;
    readonly beforeHeight: number;
}

interface ChunkSemanticTask {
    readonly operation: RaiseTerrainOperation | PaintMaterialOperation | PaintVegetationOperation;
    readonly sample: CanonicalAreaSample;
}

interface MaterializedSurfaceEdit {
    readonly before: SurfaceDeltaSnapshot;
    readonly chunks: readonly MutableSemanticChunk[];
    readonly heightEdits: ReadonlyMap<string, HeightEditState>;
    readonly hydrologyMutations: readonly SurfaceHydrologyMutation[];
    readonly changedHydrologyIds: ReadonlySet<string>;
    readonly hydrologyBounds: readonly HydrologyFeatureBoundsQ64[];
    buildInput(): SurfaceDeltaTransactionInput;
}

function chunkIdentity(key: Readonly<SemanticChunkKey>): string {
    return `${key.chunkX}:${key.chunkY}`;
}

function tileIdentity(tileX: number, tileY: number): string {
    return `${tileX}:${tileY}`;
}

function renderIdentity(chunkX: number, chunkY: number): string {
    return `${chunkX}:${chunkY}`;
}

function mutableEntries(delta: SparseSemanticDelta | undefined): Map<number, MutableSemanticEntry> {
    const entries = new Map<number, MutableSemanticEntry>();
    if (!delta) return entries;
    for (let index = 0; index < delta.tileIndex.length; index += 1) {
        const biomeOffset = index * 4;
        entries.set(delta.tileIndex[index], {
            fieldMask: delta.fieldMask[index],
            macroHeight: delta.macroHeight[index],
            substrateClass: delta.substrateClass[index],
            biome0: delta.biomeWeights[biomeOffset],
            biome1: delta.biomeWeights[biomeOffset + 1],
            biome2: delta.biomeWeights[biomeOffset + 2],
            biome3: delta.biomeWeights[biomeOffset + 3],
            vegetationDensity: delta.vegetationDensity[index],
            vegetationProfile: delta.vegetationProfile[index]
        });
    }
    return entries;
}

function semanticPayload(chunk: Readonly<MutableSemanticChunk>): SurfaceSemanticDeltaPayload | undefined {
    const ordered = [...chunk.entries.entries()]
        .filter(([, entry]) => entry.fieldMask !== 0)
        .sort((first, second) => first[0] - second[0]);
    if (ordered.length === 0) return undefined;
    const payload: SurfaceSemanticDeltaPayload = {
        tileIndex: new Uint16Array(ordered.length),
        fieldMask: new Uint8Array(ordered.length),
        macroHeight: new Uint16Array(ordered.length),
        substrateClass: new Uint8Array(ordered.length),
        biomeWeights: new Uint8Array(ordered.length * 4),
        vegetationDensity: new Uint8Array(ordered.length),
        vegetationProfile: new Uint8Array(ordered.length)
    };
    ordered.forEach(([tileIndex, entry], index) => {
        payload.tileIndex[index] = tileIndex;
        payload.fieldMask[index] = entry.fieldMask;
        payload.macroHeight[index] = entry.macroHeight;
        payload.substrateClass[index] = entry.substrateClass;
        payload.biomeWeights[index * 4] = entry.biome0;
        payload.biomeWeights[index * 4 + 1] = entry.biome1;
        payload.biomeWeights[index * 4 + 2] = entry.biome2;
        payload.biomeWeights[index * 4 + 3] = entry.biome3;
        payload.vegetationDensity[index] = entry.vegetationDensity;
        payload.vegetationProfile[index] = entry.vegetationProfile;
    });
    return payload;
}

function arraysEqual(first: ArrayLike<number>, second: ArrayLike<number>): boolean {
    if (first.length !== second.length) return false;
    for (let index = 0; index < first.length; index += 1) if (first[index] !== second[index]) return false;
    return true;
}

function payloadEqualsDelta(
    payload: Readonly<SurfaceSemanticDeltaPayload> | undefined,
    delta: Readonly<SparseSemanticDelta> | undefined
): boolean {
    if (!payload || !delta) return payload === undefined && delta === undefined;
    return arraysEqual(payload.tileIndex, delta.tileIndex)
        && arraysEqual(payload.fieldMask, delta.fieldMask)
        && arraysEqual(payload.macroHeight, delta.macroHeight)
        && arraysEqual(payload.substrateClass, delta.substrateClass)
        && arraysEqual(payload.biomeWeights, delta.biomeWeights)
        && arraysEqual(payload.vegetationDensity, delta.vegetationDensity)
        && arraysEqual(payload.vegetationProfile, delta.vegetationProfile);
}

function semanticMutations(chunks: readonly MutableSemanticChunk[]): readonly SurfaceSemanticMutation[] {
    const mutations: SurfaceSemanticMutation[] = [];
    for (const chunk of chunks) {
        const payload = semanticPayload(chunk);
        if (payloadEqualsDelta(payload, chunk.before)) continue;
        mutations.push(payload ? {
            operation: "upsert",
            key: chunk.key,
            expectedRevision: chunk.expectedRevision,
            payload
        } : {
            operation: "delete",
            key: chunk.key,
            expectedRevision: chunk.expectedRevision
        });
    }
    return Object.freeze(mutations);
}

function falloffAmount(strength: number, falloff: SurfaceEditFalloff): number {
    if (falloff === "constant") return 1;
    const normalized = strength / 0xff;
    return falloff === "linear" ? normalized : normalized * normalized * (3 - 2 * normalized);
}

function quantizedHeightDelta(delta: number, strength: number, falloff: SurfaceEditFalloff): number {
    const magnitude = Math.round(Math.abs(delta) * 0xffff * falloffAmount(strength, falloff));
    return delta < 0 ? -magnitude : magnitude;
}

interface InternalConflict extends SurfaceEditConflictDetail {
    readonly window?: TransferableEffectiveWindow;
}

interface ValidationResult {
    readonly conflicts: readonly InternalConflict[];
    readonly conflictCount: number;
    readonly changedBodiesSeen: ReadonlySet<string>;
}

interface LakeConnectivityCell {
    readonly gridU: number;
    readonly gridV: number;
}

interface ConflictAccumulator {
    readonly conflicts: InternalConflict[];
    conflictCount: number;
}

function bodyIdAt(
    compilation: Readonly<SurfaceFieldCompilation>,
    index: number
): string | undefined {
    const paletteIndex = compilation.field.waterBodyIndex[index];
    if (paletteIndex === 0) return undefined;
    return compilation.waterBodies.entries[paletteIndex - 1]?.bodyId;
}

function freezeConflict(conflict: InternalConflict): InternalConflict {
    return Object.freeze(conflict);
}

export class SurfaceWorldEditor {
    public readonly worldIdentity: string;
    private readonly descriptor: WorldDescriptorV2;
    private readonly store: SurfaceDeltaStore;
    private readonly semanticSource: SemanticWorldSource;
    private readonly hydrologySource: HydrologyWorldSource;
    private readonly baseHydrology: BaseHydrologyChangeIndex;
    private readonly metrics: SurfaceCompileMetrics;
    private readonly minimumDepth: number;
    private readonly residency: () => Readonly<WorldChangeResidency>;
    private busy = false;

    constructor(options: Readonly<SurfaceWorldEditorOptions>) {
        if (!options || typeof options !== "object") throw new TypeError("surface world editor options are required");
        this.worldIdentity = options.store.worldIdentity;
        if (options.semanticSource.worldIdentity !== this.worldIdentity
            || options.hydrologySource.worldIdentity !== this.worldIdentity
            || serializeWorldDescriptorV2(options.store.descriptor) !== this.worldIdentity) {
            throw new TypeError("surface world editor inputs belong to different worlds");
        }
        if (!options.baseHydrology || typeof options.baseHydrology.resolveFeature !== "function"
            || typeof options.baseHydrology.referencesTo !== "function"
            || typeof options.baseHydrology.resolveBoundsQ64 !== "function") {
            throw new TypeError("surface world editor requires a base hydrology change index");
        }
        if (!options.metrics || !Number.isFinite(options.metrics.hexSize) || options.metrics.hexSize <= 0
            || !Number.isFinite(options.metrics.heightScale) || options.metrics.heightScale <= 0) {
            throw new RangeError("surface world editor metrics must be positive and finite");
        }
        if (!Number.isFinite(options.minimumExplicitWaterDepth)
            || options.minimumExplicitWaterDepth < 0
            || options.minimumExplicitWaterDepth > options.metrics.heightScale) {
            throw new RangeError("surface world editor minimum water depth is outside the height scale");
        }
        if (typeof options.residency !== "function") {
            throw new TypeError("surface world editor requires an explicit residency provider");
        }
        this.descriptor = options.store.descriptor;
        this.store = options.store;
        this.semanticSource = options.semanticSource;
        this.hydrologySource = options.hydrologySource;
        this.baseHydrology = options.baseHydrology;
        this.metrics = Object.freeze({ ...options.metrics });
        this.minimumDepth = options.minimumExplicitWaterDepth;
        this.residency = options.residency;
    }

    public edit(callback: (transaction: SurfaceEditTransaction) => void): Promise<WorldChangeSet> {
        if (this.busy) return Promise.reject(new SurfaceEditBusyError());
        if (typeof callback !== "function") return Promise.reject(new TypeError("surface edit callback is required"));
        this.busy = true;
        return this.executeEdit(callback).finally(() => { this.busy = false; });
    }

    private async executeEdit(callback: (transaction: SurfaceEditTransaction) => void): Promise<WorldChangeSet> {
        await this.store.flush();
        const transaction = new MutableSurfaceEditTransaction();
        const callbackResult: unknown = callback(transaction);
        if (callbackResult && typeof (callbackResult as { then?: unknown }).then === "function") {
            throw new TypeError("surface edit callback must be synchronous");
        }
        const plan = transaction.finish();
        const before = this.store.snapshot();
        const materialized = await this.materialize(plan, before);
        let prepared = await this.store.preview(materialized.buildInput());
        if (prepared.before !== before) {
            throw new Error("surface edit base changed while its authoritative mutations were materialized");
        }
        if (plan.hasHeightEdits || plan.hasHydrologyEdits) {
            if (plan.waterPolicy === "preserve-channel") {
                prepared = await this.preserveChannels(materialized, prepared);
            } else {
                const validation = await this.validateCandidate(materialized, prepared.snapshot, plan.hasHeightEdits);
                if (validation.conflictCount > 0) {
                    throw this.conflictError(
                        plan.waterPolicy ?? "coupled",
                        validation.conflictCount,
                        validation.conflicts
                    );
                }
            }
        }
        const changeSet = createWorldChangeSet({
            descriptor: this.descriptor,
            baseHydrology: this.baseHydrology,
            before: prepared.before,
            commit: prepared.commit,
            residency: this.residency()
        });
        await this.store.commitPrepared(prepared);
        return changeSet;
    }

    private canonicalTile(tileX: number, tileY: number): { x: number; y: number } {
        if (this.descriptor.sourceKind === "procedural-infinite") return { x: tileX, y: tileY };
        if (this.descriptor.topology === "toroidal") {
            return {
                x: positiveModulo(tileX, this.descriptor.width),
                y: positiveModulo(tileY, this.descriptor.height)
            };
        }
        if (tileX < 0 || tileX >= this.descriptor.width || tileY < 0 || tileY >= this.descriptor.height) {
            throw new RangeError("surface edit area contains a tile outside the finite world");
        }
        return { x: tileX, y: tileY };
    }

    private canonicalArea(area: Readonly<SurfaceEditArea>): readonly CanonicalAreaSample[] {
        const seen = new Set<string>();
        return Object.freeze(area.samples.map(sample => {
            const canonical = this.canonicalTile(sample.tileX, sample.tileY);
            const tileKey = tileIdentity(canonical.x, canonical.y);
            if (seen.has(tileKey)) {
                throw new Error("surface edit area aliases one canonical tile more than once");
            }
            seen.add(tileKey);
            return Object.freeze({
                tileX: canonical.x,
                tileY: canonical.y,
                strength: sample.strength,
                tileKey
            });
        }));
    }

    private async materialize(
        plan: Readonly<SurfaceEditPlan>,
        before: SurfaceDeltaSnapshot
    ): Promise<MaterializedSurfaceEdit> {
        const tasksByChunk = new Map<string, { key: SemanticChunkKey; tasks: ChunkSemanticTask[] }>();
        const hydrologyOperations: (UpsertHydrologyOperation | DeleteHydrologyOperation)[] = [];
        for (const operation of plan.operations) {
            if (operation.kind === "upsert-hydrology" || operation.kind === "delete-hydrology") {
                hydrologyOperations.push(operation);
                continue;
            }
            for (const sample of this.canonicalArea(operation.area)) {
                const location = semanticChunkLocation(sample.tileX, sample.tileY);
                const key = Object.freeze({ chunkX: location.chunkX, chunkY: location.chunkY });
                const identity = chunkIdentity(key);
                let group = tasksByChunk.get(identity);
                if (!group) {
                    group = { key, tasks: [] };
                    tasksByChunk.set(identity, group);
                }
                group.tasks.push({ operation, sample });
            }
        }

        const view = new EffectiveWorldView({
            semanticSource: this.semanticSource,
            hydrologySource: this.hydrologySource,
            deltaSnapshot: before
        });
        const chunks: MutableSemanticChunk[] = [];
        const heightEdits = new Map<string, HeightEditState>();
        try {
            const groups = [...tasksByChunk.values()].sort((first, second) =>
                first.key.chunkX - second.key.chunkX || first.key.chunkY - second.key.chunkY);
            for (const group of groups) {
                const effective = await view.loadSemanticChunk(group.key.chunkX, group.key.chunkY);
                try {
                    const beforeDelta = before.getSemanticDelta(group.key.chunkX, group.key.chunkY);
                    const chunk: MutableSemanticChunk = {
                        key: group.key,
                        before: beforeDelta,
                        expectedRevision: before.getSemanticRevision(group.key.chunkX, group.key.chunkY),
                        entries: mutableEntries(beforeDelta)
                    };
                    for (const task of group.tasks) {
                        const location = semanticChunkLocation(task.sample.tileX, task.sample.tileY);
                        const tileIndex = semanticTileIndex(location.localX, location.localY);
                        const baseBiomeOffset = semanticBiomeWeightIndex(tileIndex, 0);
                        const base: SemanticBaseFields = Object.freeze({
                            substrateClass: effective.base.substrateClass[tileIndex],
                            macroHeight: effective.base.macroHeight[tileIndex],
                            biomeWeights: Object.freeze([
                                effective.base.biomeWeights[baseBiomeOffset],
                                effective.base.biomeWeights[baseBiomeOffset + 1],
                                effective.base.biomeWeights[baseBiomeOffset + 2],
                                effective.base.biomeWeights[baseBiomeOffset + 3]
                            ]) as readonly [number, number, number, number],
                            vegetationDensity: effective.base.vegetationDensity[tileIndex],
                            vegetationProfile: effective.base.vegetationProfile[tileIndex]
                        });
                        let entry = chunk.entries.get(tileIndex);
                        if (!entry) {
                            entry = {
                                fieldMask: 0,
                                macroHeight: 0,
                                substrateClass: 0,
                                biome0: 0,
                                biome1: 0,
                                biome2: 0,
                                biome3: 0,
                                vegetationDensity: 0,
                                vegetationProfile: 0
                            };
                            chunk.entries.set(tileIndex, entry);
                        }
                        if (task.operation.kind === "raise-terrain") {
                            const effectiveBefore = getEffectiveSemanticTile(
                                effective,
                                location.localX,
                                location.localY
                            ).macroHeight;
                            if (!heightEdits.has(task.sample.tileKey)) {
                                heightEdits.set(task.sample.tileKey, {
                                    tileX: task.sample.tileX,
                                    tileY: task.sample.tileY,
                                    tileKey: task.sample.tileKey,
                                    tileIndex,
                                    chunk,
                                    entry,
                                    baseHeight: base.macroHeight,
                                    beforeHeight: effectiveBefore
                                });
                            }
                            const current = (entry.fieldMask & SEMANTIC_DELTA_FIELD_HEIGHT) !== 0
                                ? entry.macroHeight : base.macroHeight;
                            const increment = quantizedHeightDelta(
                                task.operation.options.delta,
                                task.sample.strength,
                                task.operation.options.falloff
                            );
                            const next = Math.max(0, Math.min(0xffff, current + increment));
                            if (next === base.macroHeight) {
                                entry.macroHeight = 0;
                                entry.fieldMask &= ~SEMANTIC_DELTA_FIELD_HEIGHT;
                            } else {
                                entry.macroHeight = next;
                                entry.fieldMask |= SEMANTIC_DELTA_FIELD_HEIGHT;
                            }
                        } else if (task.operation.kind === "paint-material") {
                            const options = task.operation.options;
                            if (options.substrateClass !== undefined) {
                                if (options.substrateClass === base.substrateClass) {
                                    entry.substrateClass = 0;
                                    entry.fieldMask &= ~SEMANTIC_DELTA_FIELD_SUBSTRATE;
                                } else {
                                    entry.substrateClass = options.substrateClass;
                                    entry.fieldMask |= SEMANTIC_DELTA_FIELD_SUBSTRATE;
                                }
                            }
                            if (options.biomeWeights) {
                                if (arraysEqual(options.biomeWeights, base.biomeWeights)) {
                                    entry.biome0 = 0;
                                    entry.biome1 = 0;
                                    entry.biome2 = 0;
                                    entry.biome3 = 0;
                                    entry.fieldMask &= ~SEMANTIC_DELTA_FIELD_BIOME;
                                } else {
                                    [entry.biome0, entry.biome1, entry.biome2, entry.biome3]
                                        = options.biomeWeights;
                                    entry.fieldMask |= SEMANTIC_DELTA_FIELD_BIOME;
                                }
                            }
                        } else {
                            if (task.operation.options.density === base.vegetationDensity
                                && task.operation.options.profile === base.vegetationProfile) {
                                entry.vegetationDensity = 0;
                                entry.vegetationProfile = 0;
                                entry.fieldMask &= ~SEMANTIC_DELTA_FIELD_VEGETATION;
                            } else {
                                entry.vegetationDensity = task.operation.options.density;
                                entry.vegetationProfile = task.operation.options.profile;
                                entry.fieldMask |= SEMANTIC_DELTA_FIELD_VEGETATION;
                            }
                        }
                    }
                    chunks.push(chunk);
                } finally {
                    view.releaseSemanticChunk(effective);
                }
            }
        } finally {
            view.dispose();
        }

        const hydrologyMutations: SurfaceHydrologyMutation[] = [];
        const changedHydrologyIds = new Set<string>();
        const hydrologyBounds: HydrologyFeatureBoundsQ64[] = [];
        for (const operation of hydrologyOperations) {
            const featureId = operation.kind === "upsert-hydrology"
                ? operation.feature.featureId : operation.featureId;
            assertFeatureIdentity(featureId);
            if (changedHydrologyIds.has(featureId)) {
                throw new Error("surface edit transaction contains duplicate hydrology features");
            }
            changedHydrologyIds.add(featureId);
            const previous = before.getHydrologyDelta(featureId);
            const previousBounds = previous
                ? previous.operation === "upsert"
                    ? authoredHydrologyFeatureBoundsQ64(previous.feature) : undefined
                : this.baseHydrology.resolveBoundsQ64(featureId);
            if (previousBounds) hydrologyBounds.push(...projectHydrologyBoundsQ64(this.descriptor, previousBounds));
            if (operation.kind === "upsert-hydrology") {
                hydrologyBounds.push(...projectHydrologyBoundsQ64(
                    this.descriptor,
                    authoredHydrologyFeatureBoundsQ64(operation.feature)
                ));
                hydrologyMutations.push({
                    operation: "upsert",
                    featureId,
                    featureKind: operation.feature.kind,
                    expectedRevision: before.getHydrologyRevision(featureId),
                    feature: operation.feature
                });
            } else {
                hydrologyMutations.push({
                    operation: "delete",
                    featureId,
                    featureKind: operation.featureKind,
                    expectedRevision: before.getHydrologyRevision(featureId)
                });
            }
        }
        const buildInput = (): SurfaceDeltaTransactionInput => {
            const currentSemanticMutations = semanticMutations(chunks);
            if (currentSemanticMutations.length === 0 && hydrologyMutations.length === 0) {
                throw new Error("surface edit transaction does not change authoritative content");
            }
            return {
                worldIdentity: this.worldIdentity,
                semanticMutations: currentSemanticMutations,
                hydrologyMutations
            };
        };
        return Object.freeze({
            before,
            chunks: Object.freeze(chunks),
            heightEdits,
            hydrologyMutations: Object.freeze(hydrologyMutations),
            changedHydrologyIds,
            hydrologyBounds: Object.freeze(hydrologyBounds),
            buildInput
        });
    }

    private validationRenderKeys(edit: Readonly<MaterializedSurfaceEdit>): readonly { chunkX: number; chunkY: number }[] {
        const keys = new Map<string, { chunkX: number; chunkY: number }>();
        const add = (chunkX: number, chunkY: number): void => {
            let canonicalX = chunkX;
            let canonicalY = chunkY;
            if (this.descriptor.sourceKind !== "procedural-infinite") {
                const countX = Math.ceil(this.descriptor.width / SURFACE_COMPILE_PROFILE.renderChunkSize);
                const countY = Math.ceil(this.descriptor.height / SURFACE_COMPILE_PROFILE.renderChunkSize);
                if (this.descriptor.topology === "toroidal") {
                    canonicalX = positiveModulo(chunkX, countX);
                    canonicalY = positiveModulo(chunkY, countY);
                } else if (chunkX < 0 || chunkX >= countX || chunkY < 0 || chunkY >= countY) return;
            }
            const identity = renderIdentity(canonicalX, canonicalY);
            if (keys.has(identity)) return;
            if (keys.size >= MAX_SURFACE_EDIT_VALIDATION_RENDER_CHUNKS) {
                throw new RangeError("surface edit validation exceeds its fixed render-chunk budget");
            }
            keys.set(identity, Object.freeze({ chunkX: canonicalX, chunkY: canonicalY }));
        };
        for (const state of edit.heightEdits.values()) {
            for (let offsetX = -SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
                offsetX <= SURFACE_COMPILE_PROFILE.influenceRadiusTiles; offsetX += 1) {
                for (let offsetY = -SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
                    offsetY <= SURFACE_COMPILE_PROFILE.influenceRadiusTiles; offsetY += 1) {
                    const location = renderChunkLocation(state.tileX + offsetX, state.tileY + offsetY);
                    add(location.chunkX, location.chunkY);
                }
            }
        }
        for (const bounds of edit.hydrologyBounds) {
            const minimumTileX = Math.floor(bounds.minX / HYDROLOGY_POINT_QUANTIZATION)
                - SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
            const minimumTileY = Math.floor(bounds.minY / HYDROLOGY_POINT_QUANTIZATION)
                - SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
            const maximumTileX = Math.ceil(bounds.maxX / HYDROLOGY_POINT_QUANTIZATION)
                + SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
            const maximumTileY = Math.ceil(bounds.maxY / HYDROLOGY_POINT_QUANTIZATION)
                + SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
            const minimumChunk = renderChunkLocation(minimumTileX, minimumTileY);
            const maximumChunk = renderChunkLocation(maximumTileX, maximumTileY);
            for (let chunkX = minimumChunk.chunkX; chunkX <= maximumChunk.chunkX; chunkX += 1) {
                for (let chunkY = minimumChunk.chunkY; chunkY <= maximumChunk.chunkY; chunkY += 1) {
                    add(chunkX, chunkY);
                }
            }
        }
        return Object.freeze([...keys.values()].sort((first, second) =>
            first.chunkX - second.chunkX || first.chunkY - second.chunkY));
    }

    private addConflict(output: ConflictAccumulator, conflict: InternalConflict): void {
        output.conflictCount += 1;
        if (output.conflictCount > MAX_INTERNAL_SURFACE_EDIT_CONFLICTS) {
            throw new RangeError("surface edit conflicts exceed the fixed validation budget");
        }
        output.conflicts.push(freezeConflict(conflict));
    }

    private inspectCompiledTransition(
        renderKey: Readonly<{ chunkX: number; chunkY: number }>,
        before: Readonly<SurfaceFieldCompilation> | undefined,
        after: Readonly<SurfaceFieldCompilation>,
        afterWindow: TransferableEffectiveWindow,
        changedHydrologyIds: ReadonlySet<string>,
        conflicts: ConflictAccumulator,
        changedBodiesSeen: Set<string>,
        changedLakeCells: ReadonlyMap<string, Map<string, LakeConnectivityCell>>,
        lakeCellCount: { value: number }
    ): void {
        for (let texelX = 0; texelX < SURFACE_COMPILE_PROFILE.renderChunkSize
            * SURFACE_COMPILE_PROFILE.samplesPerTileInterval; texelX += 1) {
            const u = surfaceTexelCenterAxis(renderKey.chunkX, texelX);
            for (let texelY = 0; texelY < SURFACE_COMPILE_PROFILE.renderChunkSize
                * SURFACE_COMPILE_PROFILE.samplesPerTileInterval; texelY += 1) {
                const index = surfaceFieldTexelIndex(texelX, texelY);
                const v = surfaceTexelCenterAxis(renderKey.chunkY, texelY);
                const afterKind = after.field.waterKind[index];
                const afterBody = bodyIdAt(after, index);
                if (after.field.waterCoverage[index] >= 128
                    && (afterKind === SURFACE_WATER_KIND_LAKE || afterKind === SURFACE_WATER_KIND_RIVER)
                    && afterBody) {
                    if (changedHydrologyIds.has(afterBody)) changedBodiesSeen.add(afterBody);
                    const lakeCells = afterKind === SURFACE_WATER_KIND_LAKE
                        ? changedLakeCells.get(afterBody) : undefined;
                    if (lakeCells) {
                        let gridU = Math.round(u * 8);
                        let gridV = Math.round(v * 8);
                        if (this.descriptor.topology === "toroidal") {
                            gridU = positiveModulo(gridU, this.descriptor.width * 8);
                            gridV = positiveModulo(gridV, this.descriptor.height * 8);
                        }
                        const identity = `${gridU}:${gridV}`;
                        if (!lakeCells.has(identity)) {
                            lakeCellCount.value += 1;
                            if (lakeCellCount.value > MAX_SURFACE_EDIT_LAKE_CONNECTIVITY_CELLS) {
                                throw new RangeError(
                                    "surface edit lake connectivity exceeds its fixed cell budget"
                                );
                            }
                            lakeCells.set(identity, Object.freeze({ gridU, gridV }));
                        }
                    }
                    const depth = float16BitsToFloat32(after.field.waterDepth[index]);
                    if (depth < this.minimumDepth) {
                        this.addConflict(conflicts, {
                            kind: "explicit-depth",
                            featureId: afterBody,
                            renderChunkX: renderKey.chunkX,
                            renderChunkY: renderKey.chunkY,
                            u,
                            v,
                            groundHeight: float16BitsToFloat32(after.field.groundHeight[index]),
                            waterLevel: float16BitsToFloat32(after.field.waterLevel[index]),
                            minimumDepth: this.minimumDepth,
                            window: afterWindow
                        });
                    }
                }
                if (!before || before.field.waterCoverage[index] < 128) continue;
                const beforeKind = before.field.waterKind[index];
                if (beforeKind !== SURFACE_WATER_KIND_LAKE && beforeKind !== SURFACE_WATER_KIND_RIVER) continue;
                const beforeBody = bodyIdAt(before, index);
                if (!beforeBody || changedHydrologyIds.has(beforeBody)) continue;
                if (after.field.waterCoverage[index] < 128 || afterBody !== beforeBody) {
                    this.addConflict(conflicts, {
                        kind: "explicit-continuity",
                        featureId: beforeBody,
                        renderChunkX: renderKey.chunkX,
                        renderChunkY: renderKey.chunkY,
                        u,
                        v,
                        groundHeight: float16BitsToFloat32(after.field.groundHeight[index]),
                        waterLevel: float16BitsToFloat32(before.field.waterLevel[index]),
                        minimumDepth: this.minimumDepth,
                        window: afterWindow
                    });
                }
            }
        }
    }

    private async validateCandidate(
        edit: Readonly<MaterializedSurfaceEdit>,
        candidate: SurfaceDeltaSnapshot,
        compareBefore: boolean
    ): Promise<ValidationResult> {
        const renderKeys = this.validationRenderKeys(edit);
        const beforeView = compareBefore ? new EffectiveWorldView({
            semanticSource: this.semanticSource,
            hydrologySource: this.hydrologySource,
            deltaSnapshot: edit.before
        }) : undefined;
        const afterView = new EffectiveWorldView({
            semanticSource: this.semanticSource,
            hydrologySource: this.hydrologySource,
            deltaSnapshot: candidate
        });
        const conflicts: ConflictAccumulator = { conflicts: [], conflictCount: 0 };
        const changedBodiesSeen = new Set<string>();
        const changedLakeCells = new Map<string, Map<string, LakeConnectivityCell>>();
        for (const mutation of edit.hydrologyMutations) {
            if (mutation.operation === "upsert" && mutation.feature.kind === "lake") {
                changedLakeCells.set(mutation.featureId, new Map());
            }
        }
        const lakeCellCount = { value: 0 };
        try {
            for (const renderKey of renderKeys) {
                const afterWindow = await buildTransferableEffectiveWindow({
                    view: afterView,
                    renderKey,
                    metrics: this.metrics
                });
                const afterCompilation = compileSurfaceField(afterWindow);
                let beforeCompilation: SurfaceFieldCompilation | undefined;
                if (beforeView) {
                    const beforeWindow = await buildTransferableEffectiveWindow({
                        view: beforeView,
                        renderKey,
                        metrics: this.metrics
                    });
                    beforeCompilation = compileSurfaceField(beforeWindow);
                }
                this.inspectCompiledTransition(
                    renderKey,
                    beforeCompilation,
                    afterCompilation,
                    afterWindow,
                    edit.changedHydrologyIds,
                    conflicts,
                    changedBodiesSeen,
                    changedLakeCells,
                    lakeCellCount
                );
                for (const violation of collectSurfaceHydrologyDepthViolations(
                    afterWindow,
                    this.minimumDepth
                )) {
                    this.addConflict(conflicts, {
                        kind: "river-depth",
                        featureId: violation.featureId,
                        renderChunkX: renderKey.chunkX,
                        renderChunkY: renderKey.chunkY,
                        u: violation.u,
                        v: violation.v,
                        groundHeight: violation.groundHeight,
                        waterLevel: violation.waterLevel,
                        minimumDepth: violation.minimumDepth,
                        window: afterWindow
                    });
                }
            }
            for (const mutation of edit.hydrologyMutations) {
                if (mutation.operation === "delete" || changedBodiesSeen.has(mutation.featureId)) continue;
                this.addConflict(conflicts, {
                    kind: "feature-dry",
                    featureId: mutation.featureId,
                    renderChunkX: 0,
                    renderChunkY: 0,
                    minimumDepth: this.minimumDepth
                });
            }
            for (const [featureId, cells] of changedLakeCells) {
                if (cells.size <= 1 || this.lakeCellsAreConnected(cells)) continue;
                const first = cells.values().next().value as LakeConnectivityCell;
                this.addConflict(conflicts, {
                    kind: "lake-disconnected",
                    featureId,
                    renderChunkX: Math.floor(first.gridU / 8 / SURFACE_COMPILE_PROFILE.renderChunkSize),
                    renderChunkY: Math.floor(first.gridV / 8 / SURFACE_COMPILE_PROFILE.renderChunkSize),
                    u: first.gridU / 8,
                    v: first.gridV / 8,
                    minimumDepth: this.minimumDepth
                });
            }
            return Object.freeze({
                conflicts: Object.freeze(conflicts.conflicts),
                conflictCount: conflicts.conflictCount,
                changedBodiesSeen
            });
        } finally {
            beforeView?.dispose();
            afterView.dispose();
        }
    }

    private lakeCellsAreConnected(cells: ReadonlyMap<string, LakeConnectivityCell>): boolean {
        const first = cells.values().next().value as LakeConnectivityCell | undefined;
        if (!first) return false;
        const visited = new Set<string>();
        const queue: LakeConnectivityCell[] = [first];
        const periodU = this.descriptor.sourceKind === "procedural-infinite"
            ? undefined : this.descriptor.width * 8;
        const periodV = this.descriptor.sourceKind === "procedural-infinite"
            ? undefined : this.descriptor.height * 8;
        for (let index = 0; index < queue.length; index += 1) {
            const cell = queue[index];
            const identity = `${cell.gridU}:${cell.gridV}`;
            if (visited.has(identity)) continue;
            visited.add(identity);
            for (let offsetU = -2; offsetU <= 2; offsetU += 2) {
                for (let offsetV = -2; offsetV <= 2; offsetV += 2) {
                    if (offsetU === 0 && offsetV === 0) continue;
                    let gridU = cell.gridU + offsetU;
                    let gridV = cell.gridV + offsetV;
                    if (this.descriptor.topology === "toroidal") {
                        gridU = positiveModulo(gridU, periodU!);
                        gridV = positiveModulo(gridV, periodV!);
                    }
                    const neighbor = cells.get(`${gridU}:${gridV}`);
                    if (neighbor && !visited.has(`${gridU}:${gridV}`)) queue.push(neighbor);
                }
            }
        }
        return visited.size === cells.size;
    }

    private conflictError(
        policy: SurfaceWaterConflictPolicy,
        conflictCount: number,
        conflicts: readonly InternalConflict[]
    ): SurfaceEditConflictError {
        const details = conflicts.slice(0, MAX_SURFACE_EDIT_CONFLICT_DETAILS).map(conflict => {
            const { window: _window, ...detail } = conflict;
            return Object.freeze(detail);
        });
        return new SurfaceEditConflictError(policy, conflictCount, Object.freeze(details));
    }

    private capPreservedHeights(
        edit: Readonly<MaterializedSurfaceEdit>,
        conflicts: readonly InternalConflict[]
    ): boolean {
        const caps = new Map<string, number>();
        for (const conflict of conflicts) {
            if (conflict.u === undefined || conflict.v === undefined
                || conflict.waterLevel === undefined || !conflict.window) continue;
            const window = conflict.window;
            const tileX = Math.floor(conflict.u);
            const tileY = Math.floor(conflict.v);
            const fractionX = conflict.u - tileX;
            const fractionY = conflict.v - tileY;
            let validWeight = 0;
            let currentHeight = 0;
            let weightedIncrement = 0;
            const adjustable: { state: HeightEditState; weight: number; current: number }[] = [];
            for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
                const weightX = offsetX === 0 ? 1 - fractionX : fractionX;
                for (let offsetY = 0; offsetY <= 1; offsetY += 1) {
                    const localX = tileX + offsetX - window.originTileX;
                    const localY = tileY + offsetY - window.originTileY;
                    if (localX < 0 || localX >= EFFECTIVE_WINDOW_TILE_SIZE
                        || localY < 0 || localY >= EFFECTIVE_WINDOW_TILE_SIZE) continue;
                    const index = localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
                    if (window.valid[index] === 0) continue;
                    const weight = weightX * (offsetY === 0 ? 1 - fractionY : fractionY);
                    validWeight += weight;
                    currentHeight += window.macroHeight[index] * weight;
                    const canonical = this.canonicalTile(tileX + offsetX, tileY + offsetY);
                    const state = edit.heightEdits.get(tileIdentity(canonical.x, canonical.y));
                    if (!state) continue;
                    const current = (state.entry.fieldMask & SEMANTIC_DELTA_FIELD_HEIGHT) !== 0
                        ? state.entry.macroHeight : state.baseHeight;
                    if (current <= state.beforeHeight) continue;
                    weightedIncrement += (current - state.beforeHeight) * weight;
                    adjustable.push({ state, weight, current });
                }
            }
            if (validWeight <= 0 || adjustable.length === 0) continue;
            currentHeight /= validWeight;
            weightedIncrement /= validWeight;
            const targetHeight = (conflict.waterLevel - conflict.minimumDepth)
                / this.metrics.heightScale * 0xffff;
            const baselineHeight = currentHeight - weightedIncrement;
            if (baselineHeight > targetHeight || weightedIncrement <= 0) continue;
            const scale = Math.max(0, Math.min(1, (targetHeight - baselineHeight) / weightedIncrement));
            for (const item of adjustable) {
                const cap = Math.max(item.state.beforeHeight, Math.floor(
                    item.state.beforeHeight + (item.current - item.state.beforeHeight) * scale
                ));
                caps.set(item.state.tileKey, Math.min(caps.get(item.state.tileKey) ?? 0xffff, cap));
            }
        }
        let changed = false;
        for (const [tileKey, cap] of caps) {
            const state = edit.heightEdits.get(tileKey)!;
            const current = (state.entry.fieldMask & SEMANTIC_DELTA_FIELD_HEIGHT) !== 0
                ? state.entry.macroHeight : state.baseHeight;
            if (cap >= current) continue;
            state.entry.macroHeight = cap;
            if (cap === state.baseHeight) {
                state.entry.macroHeight = 0;
                state.entry.fieldMask &= ~SEMANTIC_DELTA_FIELD_HEIGHT;
            } else {
                state.entry.fieldMask |= SEMANTIC_DELTA_FIELD_HEIGHT;
            }
            changed = true;
        }
        return changed;
    }

    private async preserveChannels(
        edit: Readonly<MaterializedSurfaceEdit>,
        initial: Awaited<ReturnType<SurfaceDeltaStore["preview"]>>
    ): Promise<Awaited<ReturnType<SurfaceDeltaStore["preview"]>>> {
        let prepared = initial;
        for (let pass = 0; pass < MAX_PRESERVE_CHANNEL_PASSES; pass += 1) {
            const validation = await this.validateCandidate(edit, prepared.snapshot, true);
            if (validation.conflictCount === 0) return prepared;
            if (!this.capPreservedHeights(edit, validation.conflicts)) {
                throw this.conflictError(
                    "preserve-channel",
                    validation.conflictCount,
                    validation.conflicts
                );
            }
            let input: SurfaceDeltaTransactionInput;
            try {
                input = edit.buildInput();
            } catch (reason) {
                if (reason instanceof Error && /does not change authoritative content/u.test(reason.message)) {
                    throw this.conflictError(
                        "preserve-channel",
                        validation.conflictCount,
                        validation.conflicts
                    );
                }
                throw reason;
            }
            prepared = await this.store.preview(input);
            if (prepared.before !== edit.before) {
                throw new Error("surface edit base changed during preserve-channel validation");
            }
        }
        const finalValidation = await this.validateCandidate(edit, prepared.snapshot, true);
        if (finalValidation.conflictCount > 0) {
            throw this.conflictError(
                "preserve-channel",
                finalValidation.conflictCount,
                finalValidation.conflicts
            );
        }
        return prepared;
    }
}

if (COMPILED_SURFACE_TEXEL_COUNT !== SURFACE_COMPILE_PROFILE.textureLayerSize ** 2) {
    throw new Error("surface editor compile profile drifted from the compiled field layout");
}
