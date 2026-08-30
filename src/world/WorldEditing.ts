import {
    EffectiveWorldView,
    EffectiveDeltaSnapshot
} from "./semantic/EffectiveWorldView";
import {
    HydrologyFeatureConnection,
    HydrologyRiverSource
} from "./semantic/HydrologyFeatureDelta";
import { HydrologyFeatureId } from "./semantic/MacroDrainageGraph";
import {
    HydrologyAuthorityMutation,
    HydrologyFeatureInput,
    SemanticAuthorityMutation,
    WorldDeltaCheckpoint,
    WorldDeltaCommitResult,
    WorldDeltaStore
} from "./WorldDeltaStore";
import { HYDROLOGY_COORDINATE_SCALE } from "./semantic/WorldSemanticFormat";
import { locateSemanticTile } from "./semantic/WorldSemanticFormat";
import { SemanticOverrideField, sparseSemanticDeltaOverrideOffset } from "./semantic/SparseSemanticDelta";
import { serializeWorldDescriptorV2, WorldDescriptorV2 } from "./semantic/WorldDescriptorV2";
import { TileBounds, WorldChangeSet } from "./semantic/WorldChangeSet";

export type WorldEditWaterPolicy = "reject" | "preserve-channel" | "coupled";
export type WorldEditFalloff = "none" | "smooth";

export type WorldEditArea = Readonly<{
    readonly kind: "rectangle";
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}> | Readonly<{
    readonly kind: "circle";
    readonly centerX: number;
    readonly centerY: number;
    readonly radius: number;
}> | Readonly<{
    readonly kind: "polygon";
    readonly points: readonly Readonly<{ readonly x: number; readonly y: number }>[];
}>;

export interface QuantizedSemanticAuthorityTile {
    readonly substrateClass: number;
    readonly macroHeight: number;
    readonly biomeWeights: readonly [number, number, number, number];
    readonly vegetationDensity: number;
    readonly vegetationProfile: number;
}

export interface HydrologyGroundConstraint {
    readonly featureId: HydrologyFeatureId;
    readonly maximumGroundHeight: number;
}

export interface WorldEditAuthority {
    readSemanticTile(x: number, y: number): QuantizedSemanticAuthorityTile | Promise<QuantizedSemanticAuthorityTile>;
    hydrologyConstraintsAt(x: number, y: number): readonly HydrologyGroundConstraint[]
        | Promise<readonly HydrologyGroundConstraint[]>;
}

export interface HydrologyRebakeResult {
    readonly mutations: readonly HydrologyAuthorityMutation[];
}

export interface HydrologyRebaker {
    rebake(area: WorldEditArea, snapshot: EffectiveDeltaSnapshot): Promise<HydrologyRebakeResult>;
}

export interface WorldEditorOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly store: WorldDeltaStore;
    readonly authority: WorldEditAuthority;
    readonly hydrologyRebaker?: HydrologyRebaker;
    readonly maximumTilesPerTransaction?: number;
}

export interface RaiseTerrainOptions {
    readonly delta: number;
    readonly falloff?: WorldEditFalloff;
    readonly waterPolicy?: WorldEditWaterPolicy;
}

export interface PaintMaterialOptions {
    readonly substrateClass?: number;
    readonly biomeWeights: readonly [number, number, number, number];
}

export interface PaintVegetationOptions {
    readonly density: number;
    readonly profile: number;
}

export interface UpsertRiverOptions {
    readonly expectedRevision: number;
    readonly source: HydrologyRiverSource;
    readonly outlet: HydrologyFeatureConnection;
    readonly width: number | readonly number[];
    readonly dischargeClass: number;
    readonly levelMode: "fit-downhill" | readonly number[];
    readonly minimumDepth?: number;
}

export interface UpsertLakeOptions {
    readonly expectedRevision: number;
    readonly level: number;
    readonly profileIndex: number;
}

interface RaiseTerrainOperation {
    readonly area: WorldEditArea;
    readonly options: Required<RaiseTerrainOptions>;
}

interface PaintMaterialOperation {
    readonly area: WorldEditArea;
    readonly options: PaintMaterialOptions;
}

interface PaintVegetationOperation {
    readonly area: WorldEditArea;
    readonly options: PaintVegetationOptions;
}

interface RebakeOperation {
    readonly area: WorldEditArea;
}

type SemanticOperation = RaiseTerrainOperation | PaintMaterialOperation | PaintVegetationOperation;

interface PendingFitMutation {
    readonly kind: "upsert-pending-fit";
    readonly featureId: HydrologyFeatureId;
    readonly expectedRevision: number;
    readonly source: HydrologyRiverSource;
    readonly outlet: HydrologyFeatureConnection;
    readonly controlPoints: Float64Array;
    readonly widthProfile: Uint8Array;
    readonly dischargeClass: number;
    readonly minimumDepth: number;
}

type PendingHydrologyMutation = HydrologyAuthorityMutation | PendingFitMutation;

function clampUnit(value: number): number {
    if (!Number.isFinite(value)) throw new RangeError("world edit normalized value must be finite");
    return Math.max(0, Math.min(1, value));
}

function quantizeUnit16(value: number): number {
    return Math.floor(clampUnit(value) * 65535 + 0.5);
}

function quantizeUnit8(value: number): number {
    return Math.floor(clampUnit(value) * 255 + 0.5);
}

function assertExpectedRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("expected hydrology feature revision must be a non-negative safe integer");
    }
}

function assertArea(area: WorldEditArea): void {
    if (!area || typeof area !== "object") throw new TypeError("world edit area is required");
    const coordinates: number[] = [];
    if (area.kind === "rectangle") {
        coordinates.push(area.minX, area.minY, area.maxX, area.maxY);
        if (area.minX > area.maxX || area.minY > area.maxY) throw new RangeError("world edit rectangle is inverted");
    } else if (area.kind === "circle") {
        coordinates.push(area.centerX, area.centerY, area.radius);
        if (!Number.isFinite(area.radius) || area.radius < 0) throw new RangeError("world edit circle radius is invalid");
    } else if (area.kind === "polygon") {
        if (!Array.isArray(area.points) || area.points.length < 3) {
            throw new TypeError("world edit polygon requires at least three points");
        }
        for (const point of area.points) coordinates.push(point.x, point.y);
    } else throw new TypeError("world edit area kind is invalid");
    if (coordinates.some(value => !Number.isFinite(value) || !Number.isSafeInteger(value * HYDROLOGY_COORDINATE_SCALE))) {
        throw new RangeError(`world edit area coordinates must be exact 1/${HYDROLOGY_COORDINATE_SCALE}-tile values`);
    }
}

function areaBounds(area: WorldEditArea): TileBounds {
    assertArea(area);
    if (area.kind === "rectangle") return Object.freeze({
        minX: Math.ceil(area.minX),
        minY: Math.ceil(area.minY),
        maxX: Math.floor(area.maxX),
        maxY: Math.floor(area.maxY)
    });
    if (area.kind === "circle") return Object.freeze({
        minX: Math.ceil(area.centerX - area.radius),
        minY: Math.ceil(area.centerY - area.radius),
        maxX: Math.floor(area.centerX + area.radius),
        maxY: Math.floor(area.centerY + area.radius)
    });
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of area.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    return Object.freeze({ minX: Math.ceil(minX), minY: Math.ceil(minY), maxX: Math.floor(maxX), maxY: Math.floor(maxY) });
}

function pointInPolygon(x: number, y: number, polygon: readonly Readonly<{ x: number; y: number }>[]): boolean {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
        const a = polygon[current];
        const b = polygon[previous];
        if ((a.y > y) !== (b.y > y)
            && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

function areaWeight(area: WorldEditArea, x: number, y: number, falloff: WorldEditFalloff): number {
    let inside = false;
    let normalized = 1;
    if (area.kind === "rectangle") {
        inside = x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;
        if (inside && falloff === "smooth") {
            const halfWidth = Math.max(0.5, (area.maxX - area.minX) / 2);
            const halfHeight = Math.max(0.5, (area.maxY - area.minY) / 2);
            const centerX = (area.minX + area.maxX) / 2;
            const centerY = (area.minY + area.maxY) / 2;
            normalized = Math.max(0, 1 - Math.max(Math.abs(x - centerX) / halfWidth, Math.abs(y - centerY) / halfHeight));
        }
    } else if (area.kind === "circle") {
        const distance = Math.hypot(x - area.centerX, y - area.centerY);
        inside = distance <= area.radius;
        if (inside && falloff === "smooth") normalized = area.radius === 0 ? 1 : Math.max(0, 1 - distance / area.radius);
    } else inside = pointInPolygon(x, y, area.points);
    if (!inside) return 0;
    return falloff === "smooth" ? normalized * normalized * (3 - 2 * normalized) : 1;
}

function rasterizeArea(area: WorldEditArea, maximumTiles: number): readonly Readonly<{ x: number; y: number }>[] {
    const bounds = areaBounds(area);
    const width = Math.max(0, bounds.maxX - bounds.minX + 1);
    const height = Math.max(0, bounds.maxY - bounds.minY + 1);
    if (!Number.isSafeInteger(width * height) || width * height > maximumTiles * 4) {
        throw new RangeError("world edit area candidate bounds exceed the transaction limit");
    }
    const points: Array<Readonly<{ x: number; y: number }>> = [];
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
            if (areaWeight(area, x, y, "none") === 0) continue;
            points.push(Object.freeze({ x, y }));
            if (points.length > maximumTiles) throw new RangeError("world edit area exceeds the transaction tile limit");
        }
    }
    return Object.freeze(points);
}

function quantizeBiomeWeights(weights: readonly number[]): readonly [number, number, number, number] {
    if (!Array.isArray(weights) || weights.length !== 4 || weights.some(value => !Number.isFinite(value) || value < 0)) {
        throw new TypeError("material biome weights must contain four non-negative finite values");
    }
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (total <= 0) throw new RangeError("material biome weights must have positive total weight");
    const scaled = weights.map(value => value / total * 255);
    const result = scaled.map(Math.floor);
    let remaining = 255 - result.reduce((sum, value) => sum + value, 0);
    const order = scaled.map((value, index) => ({ index, remainder: value - result[index] }))
        .sort((first, second) => second.remainder - first.remainder || first.index - second.index);
    for (let index = 0; remaining > 0; index += 1, remaining -= 1) result[order[index].index] += 1;
    return Object.freeze(result) as unknown as readonly [number, number, number, number];
}

function quantizedWorldPoints(points: readonly Readonly<{ x: number; y: number }>[], minimum: number): Float64Array {
    if (!Array.isArray(points) || points.length < minimum) {
        throw new TypeError(`hydrology edit requires at least ${minimum} points`);
    }
    const result = new Float64Array(points.length * 2);
    for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            throw new RangeError("hydrology edit point coordinates must be finite");
        }
        result[index * 2] = Math.round(point.x * HYDROLOGY_COORDINATE_SCALE) / HYDROLOGY_COORDINATE_SCALE;
        result[index * 2 + 1] = Math.round(point.y * HYDROLOGY_COORDINATE_SCALE) / HYDROLOGY_COORDINATE_SCALE;
    }
    return result;
}

function profileValues(value: number | readonly number[], count: number, quantize: (candidate: number) => number): Uint8Array {
    const values = typeof value === "number" ? Array<number>(count).fill(value) : [...value];
    if (values.length !== count) throw new RangeError("hydrology profile length must match its control points");
    return Uint8Array.from(values, quantize);
}

function key(x: number, y: number): string { return `${x},${y}`; }

export class WorldEditTransaction {
    private readonly semanticOperations: SemanticOperation[] = [];
    private readonly directSemanticMutations: SemanticAuthorityMutation[] = [];
    private readonly hydrologyMutations: PendingHydrologyMutation[] = [];
    private readonly rebakes: RebakeOperation[] = [];
    private closed = false;

    constructor(private readonly maximumTiles: number) {}

    public raiseTerrain(area: WorldEditArea, options: RaiseTerrainOptions): void {
        this.assertOpen();
        assertArea(area);
        if (!options || !Number.isFinite(options.delta) || options.delta < -1 || options.delta > 1 || options.delta === 0
            || options.falloff !== undefined && options.falloff !== "none" && options.falloff !== "smooth"
            || options.waterPolicy !== undefined && !["reject", "preserve-channel", "coupled"].includes(options.waterPolicy)) {
            throw new TypeError("raiseTerrain options are invalid");
        }
        this.semanticOperations.push({
            area,
            options: {
                delta: options.delta,
                falloff: options.falloff ?? "smooth",
                waterPolicy: options.waterPolicy ?? "reject"
            }
        });
    }

    public paintMaterial(area: WorldEditArea, options: PaintMaterialOptions): void {
        this.assertOpen();
        assertArea(area);
        const biomeWeights = quantizeBiomeWeights(options?.biomeWeights ?? []);
        if (options.substrateClass !== undefined
            && (!Number.isInteger(options.substrateClass) || options.substrateClass < 0 || options.substrateClass > 255)) {
            throw new RangeError("material substrateClass must be a Uint8 value");
        }
        this.semanticOperations.push({ area, options: Object.freeze({ ...options, biomeWeights }) });
    }

    public paintVegetation(area: WorldEditArea, options: PaintVegetationOptions): void {
        this.assertOpen();
        assertArea(area);
        if (!options || !Number.isFinite(options.density) || options.density < 0 || options.density > 1
            || !Number.isInteger(options.profile) || options.profile < 0 || options.profile > 255) {
            throw new TypeError("paintVegetation options are invalid");
        }
        this.semanticOperations.push({ area, options: Object.freeze({ ...options }) });
    }

    public setSemantic(mutation: SemanticAuthorityMutation): void {
        this.assertOpen();
        this.directSemanticMutations.push(Object.freeze({ ...mutation }));
    }

    public upsertHydrology(feature: HydrologyFeatureInput, expectedRevision: number): void {
        this.assertOpen();
        assertExpectedRevision(expectedRevision);
        this.hydrologyMutations.push(Object.freeze({ kind: "upsert", expectedRevision, feature }));
    }

    public deleteHydrology(featureId: HydrologyFeatureId, targetKind: "river" | "lake", expectedRevision: number): void {
        this.assertOpen();
        assertExpectedRevision(expectedRevision);
        this.hydrologyMutations.push(Object.freeze({ kind: "delete", featureId, targetKind, expectedRevision }));
    }

    public upsertRiver(
        featureId: HydrologyFeatureId,
        controlPoints: readonly Readonly<{ x: number; y: number }>[],
        options: UpsertRiverOptions
    ): void {
        this.assertOpen();
        assertExpectedRevision(options.expectedRevision);
        const points = quantizedWorldPoints(controlPoints, 2);
        const widthProfile = profileValues(options.width, controlPoints.length, value => {
            if (!Number.isFinite(value) || value <= 0) throw new RangeError("river width must be positive and finite");
            const quantized = Math.round(value * HYDROLOGY_COORDINATE_SCALE);
            if (quantized < 1 || quantized > 255) throw new RangeError("river width exceeds the authority format");
            return quantized;
        });
        if (options.levelMode === "fit-downhill") {
            this.hydrologyMutations.push(Object.freeze({
                kind: "upsert-pending-fit",
                featureId,
                expectedRevision: options.expectedRevision,
                source: options.source,
                outlet: options.outlet,
                controlPoints: points,
                widthProfile,
                dischargeClass: options.dischargeClass,
                minimumDepth: options.minimumDepth ?? 1 / 65535
            }));
            return;
        }
        const levelProfile = Uint16Array.from(options.levelMode, quantizeUnit16);
        if (levelProfile.length !== controlPoints.length) throw new RangeError("river level profile length is invalid");
        this.upsertHydrology({
            kind: "river",
            featureId,
            source: options.source,
            outlet: options.outlet,
            controlPoints: points,
            widthProfile,
            levelProfile,
            dischargeClass: options.dischargeClass
        }, options.expectedRevision);
    }

    public upsertLake(
        featureId: HydrologyFeatureId,
        boundary: readonly Readonly<{ x: number; y: number }>[],
        options: UpsertLakeOptions
    ): void {
        this.assertOpen();
        this.upsertHydrology({
            kind: "lake",
            featureId,
            boundaryPoints: quantizedWorldPoints(boundary, 3),
            level: quantizeUnit16(options.level),
            profileIndex: options.profileIndex
        }, options.expectedRevision);
    }

    public rebakeHydrology(area: WorldEditArea): void {
        this.assertOpen();
        assertArea(area);
        this.rebakes.push({ area });
    }

    public close(): void { this.closed = true; }

    public get operations(): Readonly<{
        semantic: readonly SemanticOperation[];
        directSemantic: readonly SemanticAuthorityMutation[];
        hydrology: readonly PendingHydrologyMutation[];
        rebakes: readonly RebakeOperation[];
    }> {
        return Object.freeze({
            semantic: Object.freeze([...this.semanticOperations]),
            directSemantic: Object.freeze([...this.directSemanticMutations]),
            hydrology: Object.freeze([...this.hydrologyMutations]),
            rebakes: Object.freeze([...this.rebakes])
        });
    }

    public rasterize(area: WorldEditArea): readonly Readonly<{ x: number; y: number }>[] {
        return rasterizeArea(area, this.maximumTiles);
    }

    private assertOpen(): void {
        if (this.closed) throw new Error("world edit transaction is closed");
    }
}

function isPendingFit(value: PendingHydrologyMutation): value is PendingFitMutation {
    return value.kind === "upsert-pending-fit";
}

export class WorldEditor {
    public readonly descriptor: WorldDescriptorV2;
    public readonly view: EffectiveWorldView;
    private readonly store: WorldDeltaStore;
    private readonly authority: WorldEditAuthority;
    private readonly rebaker: HydrologyRebaker | undefined;
    private readonly maximumTiles: number;
    private pending: Promise<void> = Promise.resolve();
    private readonly listeners = new Set<(changeSet: WorldChangeSet) => void>();
    private disposed = false;

    private constructor(options: WorldEditorOptions, snapshot: EffectiveDeltaSnapshot) {
        this.descriptor = options.descriptor;
        this.store = options.store;
        this.authority = options.authority;
        this.rebaker = options.hydrologyRebaker;
        this.maximumTiles = options.maximumTilesPerTransaction ?? 65_536;
        if (!Number.isSafeInteger(this.maximumTiles) || this.maximumTiles <= 0) {
            throw new RangeError("maximumTilesPerTransaction must be a positive safe integer");
        }
        this.view = new EffectiveWorldView(options.descriptor, snapshot);
    }

    public static async create(options: WorldEditorOptions): Promise<WorldEditor> {
        if (!options || typeof options !== "object" || !options.store || !options.authority
            || typeof options.authority.readSemanticTile !== "function"
            || typeof options.authority.hydrologyConstraintsAt !== "function") {
            throw new TypeError("WorldEditor options are invalid");
        }
        const snapshot = await options.store.load(options.descriptor);
        if (snapshot.worldIdentity !== serializeWorldDescriptorV2(options.descriptor)) {
            throw new TypeError("WorldDeltaStore returned a snapshot for another world");
        }
        return new WorldEditor(options, snapshot);
    }

    public edit(build: (transaction: WorldEditTransaction) => void): Promise<WorldDeltaCommitResult> {
        if (this.disposed) return Promise.reject(new Error("WorldEditor has been disposed"));
        if (typeof build !== "function") return Promise.reject(new TypeError("world edit callback is required"));
        const execute = async (): Promise<WorldDeltaCommitResult> => {
            const expectedRevision = this.view.effectiveRevision;
            const transaction = new WorldEditTransaction(this.maximumTiles);
            build(transaction);
            transaction.close();
            const prepared = await this.prepare(transaction, expectedRevision);
            const result = await this.store.commit({
                descriptor: this.descriptor,
                expectedRevision,
                semanticMutations: prepared.semantic,
                hydrologyMutations: prepared.hydrology
            });
            if (result.changed) {
                this.view.publishDeltaSnapshot(result.snapshot, expectedRevision);
                for (const listener of this.listeners) listener(result.changeSet!);
            }
            return result;
        };
        const result = this.pending.then(execute, execute);
        this.pending = result.then(() => undefined, () => undefined);
        return result;
    }

    public subscribe(listener: (changeSet: WorldChangeSet) => void): () => void {
        if (this.disposed || typeof listener !== "function") throw new TypeError("world editor subscription is invalid");
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    public async saveBarrier(): Promise<WorldDeltaCheckpoint> {
        await this.pending;
        await this.store.flush();
        return this.store.saveBarrier(this.descriptor);
    }

    public async flush(): Promise<void> {
        await this.pending;
        await this.store.flush();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.listeners.clear();
    }

    private async prepare(
        transaction: WorldEditTransaction,
        expectedRevision: number
    ): Promise<Readonly<{ semantic: readonly SemanticAuthorityMutation[]; hydrology: readonly HydrologyAuthorityMutation[] }>> {
        if (expectedRevision !== this.view.effectiveRevision) throw new Error("world edit revision changed while preparing");
        const deltaSnapshot = this.view.captureDeltaSnapshot();
        const operations = transaction.operations;
        const hydrology: HydrologyAuthorityMutation[] = [];
        for (const mutation of operations.hydrology) {
            if (!isPendingFit(mutation)) {
                hydrology.push(mutation);
                continue;
            }
            const pointCount = mutation.controlPoints.length / 2;
            const levels = new Uint16Array(pointCount);
            let previousLevel = 65535;
            const minimumDepth = Math.max(1, quantizeUnit16(mutation.minimumDepth));
            for (let index = 0; index < pointCount; index += 1) {
                const x = Math.round(mutation.controlPoints[index * 2]);
                const y = Math.round(mutation.controlPoints[index * 2 + 1]);
                const tile = await this.authority.readSemanticTile(x, y);
                const fitted = Math.min(65535, tile.macroHeight + minimumDepth, previousLevel);
                levels[index] = fitted;
                previousLevel = fitted;
            }
            hydrology.push(Object.freeze({
                kind: "upsert",
                expectedRevision: mutation.expectedRevision,
                feature: Object.freeze({
                    kind: "river",
                    featureId: mutation.featureId,
                    source: mutation.source,
                    outlet: mutation.outlet,
                    controlPoints: mutation.controlPoints,
                    widthProfile: mutation.widthProfile,
                    levelProfile: levels,
                    dischargeClass: mutation.dischargeClass
                })
            }));
        }
        if (operations.rebakes.length > 0 && !this.rebaker) {
            throw new Error("rebakeHydrology requires an explicit HydrologyRebaker");
        }
        for (const operation of operations.rebakes) {
            const result = await this.rebaker!.rebake(operation.area, deltaSnapshot);
            if (!result || !Array.isArray(result.mutations)) throw new TypeError("HydrologyRebaker returned an invalid result");
            hydrology.push(...result.mutations);
        }

        const coupledFeatures = new Set(hydrology.map(mutation =>
            mutation.kind === "upsert" ? mutation.feature.featureId : mutation.featureId));
        const semantic = new Map<string, SemanticAuthorityMutation>();
        for (const mutation of operations.directSemantic) semantic.set(key(mutation.x, mutation.y), mutation);
        const tileCache = new Map<string, QuantizedSemanticAuthorityTile>();
        const readTile = async (x: number, y: number): Promise<QuantizedSemanticAuthorityTile> => {
            const serialized = key(x, y);
            let tile = tileCache.get(serialized);
            if (!tile) {
                const base = await this.authority.readSemanticTile(x, y);
                const location = locateSemanticTile(x, y);
                const delta = deltaSnapshot.semanticDeltas.find(candidate =>
                    candidate.key.chunkX === location.key.chunkX && candidate.key.chunkY === location.key.chunkY);
                const offset = delta ? sparseSemanticDeltaOverrideOffset(
                    delta,
                    location.localX * 32 + location.localY
                ) : -1;
                if (!delta || offset < 0) tile = base;
                else {
                    const mask = delta.masks[offset];
                    const biomeOffset = offset * 4;
                    tile = Object.freeze({
                        substrateClass: mask & SemanticOverrideField.Substrate
                            ? delta.substrateClass[offset] : base.substrateClass,
                        macroHeight: mask & SemanticOverrideField.MacroHeight
                            ? delta.macroHeight[offset] : base.macroHeight,
                        biomeWeights: mask & SemanticOverrideField.BiomeWeights
                            ? Object.freeze([
                                delta.biomeWeights[biomeOffset],
                                delta.biomeWeights[biomeOffset + 1],
                                delta.biomeWeights[biomeOffset + 2],
                                delta.biomeWeights[biomeOffset + 3]
                            ]) as readonly [number, number, number, number]
                            : base.biomeWeights,
                        vegetationDensity: mask & SemanticOverrideField.VegetationDensity
                            ? delta.vegetationDensity[offset] : base.vegetationDensity,
                        vegetationProfile: mask & SemanticOverrideField.VegetationProfile
                            ? delta.vegetationProfile[offset] : base.vegetationProfile
                    });
                }
                tileCache.set(serialized, tile);
            }
            return tile;
        };

        for (const operation of operations.semantic) {
            const points = transaction.rasterize(operation.area);
            if ("delta" in operation.options) {
                for (const point of points) {
                    const weight = areaWeight(operation.area, point.x, point.y, operation.options.falloff);
                    if (weight <= 0) continue;
                    const previous = semantic.get(key(point.x, point.y));
                    const current = previous?.macroHeight ?? (await readTile(point.x, point.y)).macroHeight;
                    let requested = Math.max(0, Math.min(65535, Math.round(current + operation.options.delta * weight * 65535)));
                    const constraints = await this.authority.hydrologyConstraintsAt(point.x, point.y);
                    for (const constraint of constraints) {
                        if (!Number.isInteger(constraint.maximumGroundHeight)
                            || constraint.maximumGroundHeight < 0 || constraint.maximumGroundHeight > 65535) {
                            throw new TypeError("hydrology authority returned an invalid ground constraint");
                        }
                        if (requested <= constraint.maximumGroundHeight) continue;
                        if (operation.options.waterPolicy === "reject") {
                            throw new Error(`terrain edit conflicts with hydrology feature ${constraint.featureId}`);
                        }
                        if (operation.options.waterPolicy === "coupled") {
                            if (!coupledFeatures.has(constraint.featureId)) {
                                throw new Error(`coupled terrain edit does not mutate hydrology feature ${constraint.featureId}`);
                            }
                            continue;
                        }
                        requested = constraint.maximumGroundHeight;
                    }
                    semantic.set(key(point.x, point.y), Object.freeze({ ...previous, x: point.x, y: point.y, macroHeight: requested }));
                }
            } else if ("biomeWeights" in operation.options) {
                for (const point of points) {
                    const previous = semantic.get(key(point.x, point.y));
                    semantic.set(key(point.x, point.y), Object.freeze({
                        ...previous,
                        x: point.x,
                        y: point.y,
                        substrateClass: operation.options.substrateClass,
                        biomeWeights: operation.options.biomeWeights
                    }));
                }
            } else {
                for (const point of points) {
                    const previous = semantic.get(key(point.x, point.y));
                    semantic.set(key(point.x, point.y), Object.freeze({
                        ...previous,
                        x: point.x,
                        y: point.y,
                        vegetationDensity: quantizeUnit8(operation.options.density),
                        vegetationProfile: operation.options.profile
                    }));
                }
            }
        }
        return Object.freeze({
            semantic: Object.freeze([...semantic.values()].sort((first, second) => first.x - second.x || first.y - second.y)),
            hydrology: Object.freeze(hydrology)
        });
    }
}
