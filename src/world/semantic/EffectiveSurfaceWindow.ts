import type { EffectiveWorldSnapshot } from "./EffectiveWorldView";
import type { HydrologyFeatureDelta } from "./HydrologyFeatureDelta";
import type { HydrologyRegionKey, SemanticChunkKey } from "./WorldSemanticFormat";
import {
    HYDROLOGY_COORDINATE_SCALE,
    hydrologyRegionCoordinate,
    hydrologyRegionOrigin,
    locateSemanticTile,
    positiveIntegerModulo,
    semanticChunkCoordinate,
    semanticChunkLocalIndex
} from "./WorldSemanticFormat";
import {
    canonicalizeHydrologyRegionKey,
    canonicalizeSemanticChunkKey,
    WorldDescriptorV2
} from "./WorldDescriptorV2";
import {
    SemanticOverrideField,
    sparseSemanticDeltaOverrideOffset
} from "./SparseSemanticDelta";
import {
    createSurfaceDependencyBinding,
    assertSurfaceDependencyKey,
    RenderChunkKey,
    SurfaceDependencyKey,
    canonicalizeRenderChunkKey
} from "./SurfaceDependency";
import {
    SURFACE_EFFECTIVE_WINDOW_SIZE,
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_INFLUENCE_RADIUS_TILES,
    SURFACE_RENDER_CHUNK_SIZE
} from "./SurfaceCompileProfile";
import { surfaceLatticeTexelLocalCoordinate } from "./SurfaceLattice";
import { OCEAN_BODY_ID } from "./MacroDrainageGraph";
import {
    WORLD_SUBSTRATE_CATALOG,
    WORLD_VEGETATION_PROFILE_CATALOG
} from "./WorldSemanticCatalog";

export interface SurfaceWindowValidBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

export interface SurfaceWindowRiver {
    readonly kind: "river";
    readonly featureKey: string;
    readonly bodyId: string;
    readonly revision: number;
    readonly profileIndex: number;
    readonly controlPoints: Float64Array;
    readonly widthProfile: Uint8Array;
    readonly levelProfile: Uint16Array;
}

export interface SurfaceWindowLake {
    readonly kind: "lake";
    readonly featureKey: string;
    readonly bodyId: string;
    readonly revision: number;
    readonly profileIndex: number;
    readonly boundaryPoints: Float64Array;
    readonly level: number;
}

export interface TransferableEffectiveWindow {
    readonly worldIdentity: string;
    readonly effectiveRevision: number;
    readonly key: RenderChunkKey;
    readonly dependencyKey: SurfaceDependencyKey;
    readonly validBounds: SurfaceWindowValidBounds;
    readonly substrateClass: Uint8Array;
    readonly macroHeight: Uint16Array;
    readonly biomeWeights: Uint8Array;
    readonly climate: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationProfile: Uint8Array;
    readonly rivers: readonly SurfaceWindowRiver[];
    readonly lakes: readonly SurfaceWindowLake[];
}

export interface SurfaceWindowBufferAllocator {
    acquire(byteLength: number): ArrayBuffer;
    release(buffers: readonly ArrayBuffer[]): void;
}

export interface CreateTransferableEffectiveWindowOptions {
    readonly bufferAllocator?: SurfaceWindowBufferAllocator;
}

const HYDROLOGY_MAX_HALF_WIDTH_TILES = 255 / (HYDROLOGY_COORDINATE_SCALE * 2);
const HYDROLOGY_REQUIREMENT_RADIUS_TILES = Math.ceil(
    HYDROLOGY_MAX_HALF_WIDTH_TILES + SURFACE_INFLUENCE_RADIUS_TILES
);
const FEATURE_ID_PATTERN = /^[a-z][a-z0-9-]*:[a-f0-9]{32}$/;

function semanticKey(value: SemanticChunkKey): string {
    return `${value.chunkX},${value.chunkY}`;
}

function hydrologyKey(value: HydrologyRegionKey): string {
    return `${value.regionX},${value.regionY}`;
}

function compareSemanticKeys(first: SemanticChunkKey, second: SemanticChunkKey): number {
    return first.chunkX - second.chunkX || first.chunkY - second.chunkY;
}

function compareHydrologyKeys(first: HydrologyRegionKey, second: HydrologyRegionKey): number {
    return first.regionX - second.regionX || first.regionY - second.regionY;
}

function renderOrigin(key: RenderChunkKey): Readonly<{ x: number; y: number }> {
    return {
        x: key.chunkX * SURFACE_RENDER_CHUNK_SIZE,
        y: key.chunkY * SURFACE_RENDER_CHUNK_SIZE
    };
}

function canonicalReadCoordinate(
    descriptor: WorldDescriptorV2,
    coordinate: number,
    axis: "x" | "y"
): number {
    if (!Number.isInteger(coordinate)) throw new RangeError("surface window tile coordinate must be an integer");
    if (descriptor.topology === "toroidal") {
        return positiveIntegerModulo(coordinate, axis === "x" ? descriptor.width : descriptor.height);
    }
    if (descriptor.topology === "bounded") {
        const maximum = (axis === "x" ? descriptor.width : descriptor.height) - 1;
        return Math.max(0, Math.min(maximum, coordinate));
    }
    return Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, coordinate));
}

export function surfaceSemanticChunkRequirements(
    descriptor: WorldDescriptorV2,
    renderKey: RenderChunkKey
): readonly SemanticChunkKey[] {
    const key = canonicalizeRenderChunkKey(descriptor, renderKey);
    const origin = renderOrigin(key);
    const chunkXs = new Set<number>();
    const chunkYs = new Set<number>();
    for (let local = -SURFACE_INFLUENCE_RADIUS_TILES;
        local < SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES;
        local += 1) {
        chunkXs.add(semanticChunkCoordinate(canonicalReadCoordinate(descriptor, origin.x + local, "x")));
        chunkYs.add(semanticChunkCoordinate(canonicalReadCoordinate(descriptor, origin.y + local, "y")));
    }
    const result: SemanticChunkKey[] = [];
    for (const chunkX of chunkXs) for (const chunkY of chunkYs) {
        result.push(Object.freeze(canonicalizeSemanticChunkKey(descriptor, { chunkX, chunkY })));
    }
    return Object.freeze(result.sort(compareSemanticKeys));
}

export function surfaceHydrologyRegionRequirements(
    descriptor: WorldDescriptorV2,
    renderKey: RenderChunkKey
): readonly HydrologyRegionKey[] {
    const key = canonicalizeRenderChunkKey(descriptor, renderKey);
    const origin = renderOrigin(key);
    const regionXs = new Set<number>();
    const regionYs = new Set<number>();
    for (let local = -HYDROLOGY_REQUIREMENT_RADIUS_TILES;
        local < SURFACE_RENDER_CHUNK_SIZE + HYDROLOGY_REQUIREMENT_RADIUS_TILES;
        local += 1) {
        regionXs.add(hydrologyRegionCoordinate(canonicalReadCoordinate(descriptor, origin.x + local, "x")));
        regionYs.add(hydrologyRegionCoordinate(canonicalReadCoordinate(descriptor, origin.y + local, "y")));
    }
    const result: HydrologyRegionKey[] = [];
    for (const regionX of regionXs) for (const regionY of regionYs) {
        result.push(Object.freeze(canonicalizeHydrologyRegionKey(descriptor, { regionX, regionY })));
    }
    return Object.freeze(result.sort(compareHydrologyKeys));
}

function assertExactDependencies(snapshot: EffectiveWorldSnapshot, key: RenderChunkKey): void {
    const semantic = surfaceSemanticChunkRequirements(snapshot.descriptor, key);
    const hydrology = surfaceHydrologyRegionRequirements(snapshot.descriptor, key);
    if (snapshot.semanticChunks.length !== semantic.length
        || snapshot.semanticChunks.some((chunk, index) =>
            semanticKey(chunk.base.key) !== semanticKey(semantic[index]))) {
        throw new TypeError("effective surface window requires the exact semantic chunk dependency set");
    }
    if (snapshot.hydrologyRegions.length !== hydrology.length
        || snapshot.hydrologyRegions.some((region, index) =>
            hydrologyKey(region.base.key) !== hydrologyKey(hydrology[index]))) {
        throw new TypeError("effective surface window requires the exact hydrology region dependency set");
    }
}

function validCoreBounds(descriptor: WorldDescriptorV2, key: RenderChunkKey): SurfaceWindowValidBounds {
    if (descriptor.topology === "toroidal") {
        return Object.freeze({
            minX: 0,
            minY: 0,
            maxXExclusive: SURFACE_RENDER_CHUNK_SIZE,
            maxYExclusive: SURFACE_RENDER_CHUNK_SIZE
        });
    }
    const origin = renderOrigin(key);
    const validX: number[] = [];
    const validY: number[] = [];
    for (let local = 0; local < SURFACE_RENDER_CHUNK_SIZE; local += 1) {
        const x = origin.x + local;
        const y = origin.y + local;
        if (Number.isSafeInteger(x) && (descriptor.topology !== "bounded" || x >= 0 && x < descriptor.width)) {
            validX.push(local);
        }
        if (Number.isSafeInteger(y) && (descriptor.topology !== "bounded" || y >= 0 && y < descriptor.height)) {
            validY.push(local);
        }
    }
    if (validX.length === 0 || validY.length === 0) {
        throw new RangeError("render chunk does not contain any valid world tiles");
    }
    return Object.freeze({
        minX: validX[0],
        minY: validY[0],
        maxXExclusive: validX[validX.length - 1] + 1,
        maxYExclusive: validY[validY.length - 1] + 1
    });
}

function acquireBuffer(
    byteLength: number,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): ArrayBuffer {
    const buffer = allocator?.acquire(byteLength) ?? new ArrayBuffer(byteLength);
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== byteLength) {
        throw new TypeError("surface window buffer allocator returned an invalid buffer");
    }
    acquired.push(buffer);
    return buffer;
}

function uint8Array(
    length: number,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Uint8Array {
    return new Uint8Array(acquireBuffer(length, allocator, acquired));
}

function uint16Array(
    length: number,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Uint16Array {
    return new Uint16Array(acquireBuffer(length * Uint16Array.BYTES_PER_ELEMENT, allocator, acquired));
}

function float64Array(
    length: number,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Float64Array {
    return new Float64Array(acquireBuffer(length * Float64Array.BYTES_PER_ELEMENT, allocator, acquired));
}

function copyUint8Array(
    source: Uint8Array,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Uint8Array {
    const result = uint8Array(source.length, allocator, acquired);
    result.set(source);
    return result;
}

function copyUint16Array(
    source: Uint16Array,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Uint16Array {
    const result = uint16Array(source.length, allocator, acquired);
    result.set(source);
    return result;
}

function releaseUnusedArray(
    value: ArrayBufferView,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): void {
    if (!(value.buffer instanceof ArrayBuffer)) return;
    const index = acquired.lastIndexOf(value.buffer);
    if (index >= 0) acquired.splice(index, 1);
    allocator?.release([value.buffer]);
}

function copySemanticWindow(
    snapshot: EffectiveWorldSnapshot,
    key: RenderChunkKey,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Pick<
    TransferableEffectiveWindow,
    "substrateClass" | "macroHeight" | "biomeWeights" | "climate"
    | "vegetationDensity" | "vegetationProfile"
> {
    const tileCount = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
    const substrateClass = uint8Array(tileCount, allocator, acquired);
    const macroHeight = uint16Array(tileCount, allocator, acquired);
    const biomeWeights = uint8Array(tileCount * 4, allocator, acquired);
    const climate = uint8Array(tileCount * 2, allocator, acquired);
    const vegetationDensity = uint8Array(tileCount, allocator, acquired);
    const vegetationProfile = uint8Array(tileCount, allocator, acquired);
    const origin = renderOrigin(key);
    for (let windowX = 0; windowX < SURFACE_EFFECTIVE_WINDOW_SIZE; windowX += 1) {
        const tileX = canonicalReadCoordinate(
            snapshot.descriptor,
            origin.x + windowX - SURFACE_INFLUENCE_RADIUS_TILES,
            "x"
        );
        for (let windowY = 0; windowY < SURFACE_EFFECTIVE_WINDOW_SIZE; windowY += 1) {
            const tileY = canonicalReadCoordinate(
                snapshot.descriptor,
                origin.y + windowY - SURFACE_INFLUENCE_RADIUS_TILES,
                "y"
            );
            const location = locateSemanticTile(tileX, tileY);
            const chunk = snapshot.getSemanticChunk(location.key);
            const baseIndex = semanticChunkLocalIndex(location.localX, location.localY);
            const deltaOffset = chunk.delta
                ? sparseSemanticDeltaOverrideOffset(chunk.delta, baseIndex) : -1;
            const mask = deltaOffset >= 0 ? chunk.delta!.masks[deltaOffset] : 0;
            const windowIndex = windowX * SURFACE_EFFECTIVE_WINDOW_SIZE + windowY;
            substrateClass[windowIndex] = mask & SemanticOverrideField.Substrate
                ? chunk.delta!.substrateClass[deltaOffset] : chunk.base.substrateClass[baseIndex];
            macroHeight[windowIndex] = mask & SemanticOverrideField.MacroHeight
                ? chunk.delta!.macroHeight[deltaOffset] : chunk.base.macroHeight[baseIndex];
            const sourceBiomeOffset = mask & SemanticOverrideField.BiomeWeights
                ? deltaOffset * 4 : baseIndex * 4;
            const sourceBiome = mask & SemanticOverrideField.BiomeWeights
                ? chunk.delta!.biomeWeights : chunk.base.biomeWeights;
            biomeWeights.set(sourceBiome.subarray(sourceBiomeOffset, sourceBiomeOffset + 4), windowIndex * 4);
            climate.set(chunk.base.climate.subarray(baseIndex * 2, baseIndex * 2 + 2), windowIndex * 2);
            vegetationDensity[windowIndex] = mask & SemanticOverrideField.VegetationDensity
                ? chunk.delta!.vegetationDensity[deltaOffset] : chunk.base.vegetationDensity[baseIndex];
            vegetationProfile[windowIndex] = mask & SemanticOverrideField.VegetationProfile
                ? chunk.delta!.vegetationProfile[deltaOffset] : chunk.base.vegetationProfile[baseIndex];
        }
    }
    return { substrateClass, macroHeight, biomeWeights, climate, vegetationDensity, vegetationProfile };
}

function nearestWrappedCoordinate(value: number, reference: number, period: number): number {
    return value + Math.floor((reference - value) / period + 0.5) * period;
}

function localizePointsIfRelevant(
    descriptor: WorldDescriptorV2,
    rawPoints: ArrayLike<number>,
    origin: Readonly<{ x: number; y: number }>,
    expansion: number,
    sourceOrigin: Readonly<{ x: number; y: number }> | undefined,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Float64Array | undefined {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let previousX = origin.x + SURFACE_RENDER_CHUNK_SIZE / 2;
    let previousY = origin.y + SURFACE_RENDER_CHUNK_SIZE / 2;
    for (let index = 0; index < rawPoints.length; index += 2) {
        let x = sourceOrigin
            ? sourceOrigin.x + rawPoints[index] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index];
        let y = sourceOrigin
            ? sourceOrigin.y + rawPoints[index + 1] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index + 1];
        if (descriptor.topology === "toroidal") {
            x = nearestWrappedCoordinate(x, previousX, descriptor.width);
            y = nearestWrappedCoordinate(y, previousY, descriptor.height);
        }
        const localX = x - origin.x;
        const localY = y - origin.y;
        minX = Math.min(minX, localX);
        minY = Math.min(minY, localY);
        maxX = Math.max(maxX, localX);
        maxY = Math.max(maxY, localY);
        previousX = x;
        previousY = y;
    }
    if (maxX + expansion < FIELD_MIN || minX - expansion > FIELD_MAX
        || maxY + expansion < FIELD_MIN || minY - expansion > FIELD_MAX) return undefined;

    const result = float64Array(rawPoints.length, allocator, acquired);
    previousX = origin.x + SURFACE_RENDER_CHUNK_SIZE / 2;
    previousY = origin.y + SURFACE_RENDER_CHUNK_SIZE / 2;
    for (let index = 0; index < rawPoints.length; index += 2) {
        let x = sourceOrigin
            ? sourceOrigin.x + rawPoints[index] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index];
        let y = sourceOrigin
            ? sourceOrigin.y + rawPoints[index + 1] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index + 1];
        if (descriptor.topology === "toroidal") {
            x = nearestWrappedCoordinate(x, previousX, descriptor.width);
            y = nearestWrappedCoordinate(y, previousY, descriptor.height);
        }
        result[index] = x - origin.x;
        result[index + 1] = y - origin.y;
        previousX = x;
        previousY = y;
    }
    return result;
}

const FIELD_MIN = surfaceLatticeTexelLocalCoordinate(0, 0).u;
const FIELD_MAX = surfaceLatticeTexelLocalCoordinate(
    SURFACE_FIELD_TEXTURE_SIZE - 1,
    SURFACE_FIELD_TEXTURE_SIZE - 1
).u;

function maximumSurfaceFeatureWidth(values: Uint8Array): number {
    let maximum = 0;
    for (const value of values) maximum = Math.max(maximum, value);
    return maximum;
}

function collectHydrology(
    snapshot: EffectiveWorldSnapshot,
    key: RenderChunkKey,
    allocator: SurfaceWindowBufferAllocator | undefined,
    acquired: ArrayBuffer[]
): Readonly<{
    rivers: readonly SurfaceWindowRiver[];
    lakes: readonly SurfaceWindowLake[];
    dependencyFeatureIds: ReadonlySet<string>;
}> {
    const origin = renderOrigin(key);
    const deltaById = new Map<string, HydrologyFeatureDelta>();
    for (const region of snapshot.hydrologyRegions) {
        for (const delta of region.featureDeltas) deltaById.set(delta.featureId, delta);
    }
    const dependencyFeatureIds = new Set<string>();
    const rivers: SurfaceWindowRiver[] = [];
    const lakes: SurfaceWindowLake[] = [];

    for (const region of snapshot.hydrologyRegions) {
        const bodyProfiles = new Map(region.base.bodies.map(body => [body.bodyId, body.profileIndex]));
        const regionOrigin = hydrologyRegionOrigin(region.base.key);
        for (const segment of region.base.rivers) {
            const expansion = maximumSurfaceFeatureWidth(segment.widthProfile)
                / (HYDROLOGY_COORDINATE_SCALE * 2)
                + SURFACE_INFLUENCE_RADIUS_TILES;
            const points = localizePointsIfRelevant(
                snapshot.descriptor,
                segment.controlPoints,
                origin,
                expansion,
                regionOrigin,
                allocator,
                acquired
            );
            if (!points) continue;
            const suppressor = deltaById.get(segment.riverId);
            if (suppressor) {
                dependencyFeatureIds.add(suppressor.featureId);
                releaseUnusedArray(points, allocator, acquired);
                continue;
            }
            rivers.push(Object.freeze({
                kind: "river" as const,
                featureKey: segment.segmentId,
                bodyId: segment.riverId,
                revision: 0,
                profileIndex: bodyProfiles.get(segment.riverId) ?? segment.dischargeClass,
                controlPoints: points,
                widthProfile: copyUint8Array(segment.widthProfile, allocator, acquired),
                levelProfile: copyUint16Array(segment.levelProfile, allocator, acquired)
            }));
        }
        for (const lake of region.base.lakes) {
            const points = localizePointsIfRelevant(
                snapshot.descriptor,
                lake.boundaryPoints,
                origin,
                SURFACE_INFLUENCE_RADIUS_TILES,
                regionOrigin,
                allocator,
                acquired
            );
            if (!points) continue;
            const suppressor = deltaById.get(lake.bodyId);
            if (suppressor) {
                dependencyFeatureIds.add(suppressor.featureId);
                releaseUnusedArray(points, allocator, acquired);
                continue;
            }
            lakes.push(Object.freeze({
                kind: "lake" as const,
                featureKey: lake.lakeId,
                bodyId: lake.bodyId,
                revision: 0,
                profileIndex: lake.profileIndex,
                boundaryPoints: points,
                level: lake.level
            }));
        }
    }

    for (const delta of deltaById.values()) {
        if (delta.kind === "tombstone") continue;
        const sourcePoints = delta.kind === "river" ? delta.controlPoints : delta.boundaryPoints;
        const expansion = delta.kind === "river"
            ? maximumSurfaceFeatureWidth(delta.widthProfile) / (HYDROLOGY_COORDINATE_SCALE * 2)
                + SURFACE_INFLUENCE_RADIUS_TILES
            : SURFACE_INFLUENCE_RADIUS_TILES;
        const points = localizePointsIfRelevant(
            snapshot.descriptor,
            sourcePoints,
            origin,
            expansion,
            undefined,
            allocator,
            acquired
        );
        if (!points) continue;
        dependencyFeatureIds.add(delta.featureId);
        if (delta.kind === "river") {
            rivers.push(Object.freeze({
                kind: "river" as const,
                featureKey: delta.featureId,
                bodyId: delta.featureId,
                revision: delta.revision,
                profileIndex: Math.min(255, delta.dischargeClass),
                controlPoints: points,
                widthProfile: copyUint8Array(delta.widthProfile, allocator, acquired),
                levelProfile: copyUint16Array(delta.levelProfile, allocator, acquired)
            }));
        } else {
            lakes.push(Object.freeze({
                kind: "lake" as const,
                featureKey: delta.featureId,
                bodyId: delta.featureId,
                revision: delta.revision,
                profileIndex: delta.profileIndex,
                boundaryPoints: points,
                level: delta.level
            }));
        }
    }

    rivers.sort((first, second) => first.featureKey.localeCompare(second.featureKey));
    lakes.sort((first, second) => first.featureKey.localeCompare(second.featureKey));
    return Object.freeze({
        rivers: Object.freeze(rivers),
        lakes: Object.freeze(lakes),
        dependencyFeatureIds
    });
}

function assertValidBounds(value: SurfaceWindowValidBounds): void {
    if (!value || typeof value !== "object"
        || Object.getOwnPropertyNames(value).some(name =>
            name !== "minX" && name !== "minY" && name !== "maxXExclusive" && name !== "maxYExclusive")
        || !Number.isInteger(value.minX) || !Number.isInteger(value.minY)
        || !Number.isInteger(value.maxXExclusive) || !Number.isInteger(value.maxYExclusive)
        || value.minX < 0 || value.minY < 0
        || value.maxXExclusive > SURFACE_RENDER_CHUNK_SIZE
        || value.maxYExclusive > SURFACE_RENDER_CHUNK_SIZE
        || value.minX >= value.maxXExclusive || value.minY >= value.maxYExclusive) {
        throw new RangeError("effective surface window validBounds are invalid");
    }
}

function assertFeatureId(name: string, value: unknown): asserts value is string {
    if (typeof value !== "string" || !FEATURE_ID_PATTERN.test(value) || value === OCEAN_BODY_ID) {
        throw new TypeError(`${name} must be a stable non-ocean feature ID`);
    }
}

function assertPoints(name: string, value: Float64Array, minimumPairs: number): void {
    if (!(value instanceof Float64Array) || value.length < minimumPairs * 2 || value.length % 2 !== 0) {
        throw new TypeError(`${name} must contain the required Float64 coordinate pairs`);
    }
    for (const coordinate of value) {
        if (!Number.isFinite(coordinate)
            || !Number.isInteger(coordinate * HYDROLOGY_COORDINATE_SCALE)) {
            throw new RangeError(`${name} must use exact localized 1/${HYDROLOGY_COORDINATE_SCALE}-tile coordinates`);
        }
    }
}

function assertRiver(value: SurfaceWindowRiver): void {
    if (!value || value.kind !== "river"
        || Object.getOwnPropertyNames(value).some(name => ![
            "kind", "featureKey", "bodyId", "revision", "profileIndex",
            "controlPoints", "widthProfile", "levelProfile"
        ].includes(name))) throw new TypeError("effective surface river is invalid");
    assertFeatureId("surface river featureKey", value.featureKey);
    assertFeatureId("surface river bodyId", value.bodyId);
    if (!Number.isSafeInteger(value.revision) || value.revision < 0
        || !Number.isInteger(value.profileIndex) || value.profileIndex < 0 || value.profileIndex > 255) {
        throw new RangeError("effective surface river metadata is invalid");
    }
    assertPoints("surface river controlPoints", value.controlPoints, 2);
    const count = value.controlPoints.length / 2;
    if (!(value.widthProfile instanceof Uint8Array) || value.widthProfile.length !== count
        || value.widthProfile.some(width => width === 0)
        || !(value.levelProfile instanceof Uint16Array) || value.levelProfile.length !== count) {
        throw new TypeError("effective surface river profiles are invalid");
    }
    for (let index = 1; index < value.levelProfile.length; index += 1) {
        if (value.levelProfile[index] > value.levelProfile[index - 1]) {
            throw new TypeError("effective surface river level must not rise downstream");
        }
    }
}

function assertLake(value: SurfaceWindowLake): void {
    if (!value || value.kind !== "lake"
        || Object.getOwnPropertyNames(value).some(name => ![
            "kind", "featureKey", "bodyId", "revision", "profileIndex", "boundaryPoints", "level"
        ].includes(name))) throw new TypeError("effective surface lake is invalid");
    assertFeatureId("surface lake featureKey", value.featureKey);
    assertFeatureId("surface lake bodyId", value.bodyId);
    if (!Number.isSafeInteger(value.revision) || value.revision < 0
        || !Number.isInteger(value.profileIndex) || value.profileIndex < 0 || value.profileIndex > 255
        || !Number.isInteger(value.level) || value.level < 0 || value.level > 65535) {
        throw new RangeError("effective surface lake metadata is invalid");
    }
    assertPoints("surface lake boundaryPoints", value.boundaryPoints, 3);
}

export function assertTransferableEffectiveWindow(
    value: unknown
): asserts value is TransferableEffectiveWindow {
    if (!value || typeof value !== "object") throw new TypeError("effective surface window must be an object");
    const window = value as TransferableEffectiveWindow;
    const allowed = new Set([
        "worldIdentity", "effectiveRevision", "key", "dependencyKey", "validBounds",
        "substrateClass", "macroHeight", "biomeWeights", "climate",
        "vegetationDensity", "vegetationProfile", "rivers", "lakes"
    ]);
    if (Object.getOwnPropertyNames(window).some(name => !allowed.has(name))
        || typeof window.worldIdentity !== "string" || window.worldIdentity.length === 0
        || !Number.isSafeInteger(window.effectiveRevision) || window.effectiveRevision < 0
        || !window.key || Object.getOwnPropertyNames(window.key).some(name => name !== "chunkX" && name !== "chunkY")
        || !Number.isSafeInteger(window.key.chunkX) || !Number.isSafeInteger(window.key.chunkY)
        || window.dependencyKey.worldIdentity !== window.worldIdentity
        || window.dependencyKey.renderKey.chunkX !== window.key.chunkX
        || window.dependencyKey.renderKey.chunkY !== window.key.chunkY) {
        throw new TypeError("effective surface window identity is invalid");
    }
    assertSurfaceDependencyKey(window.dependencyKey);
    assertValidBounds(window.validBounds);
    const count = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
    if (!(window.substrateClass instanceof Uint8Array) || window.substrateClass.length !== count
        || !(window.macroHeight instanceof Uint16Array) || window.macroHeight.length !== count
        || !(window.biomeWeights instanceof Uint8Array) || window.biomeWeights.length !== count * 4
        || !(window.climate instanceof Uint8Array) || window.climate.length !== count * 2
        || !(window.vegetationDensity instanceof Uint8Array) || window.vegetationDensity.length !== count
        || !(window.vegetationProfile instanceof Uint8Array) || window.vegetationProfile.length !== count
        || !Array.isArray(window.rivers) || !Array.isArray(window.lakes)) {
        throw new TypeError("effective surface window column lengths are invalid");
    }
    for (let index = 0; index < count; index += 1) {
        const biomeOffset = index * 4;
        if (window.substrateClass[index] >= WORLD_SUBSTRATE_CATALOG.length
            || window.vegetationProfile[index] >= WORLD_VEGETATION_PROFILE_CATALOG.length
            || window.biomeWeights[biomeOffset] + window.biomeWeights[biomeOffset + 1]
            + window.biomeWeights[biomeOffset + 2] + window.biomeWeights[biomeOffset + 3] !== 255) {
            throw new TypeError("effective surface window semantic values are invalid");
        }
    }
    for (const river of window.rivers) assertRiver(river);
    for (const lake of window.lakes) assertLake(lake);
    const featureRevisions = new Map(window.dependencyKey.hydrologyRegions.flatMap(region =>
        region.features.map(feature => [feature.featureId, feature.revision] as const)));
    for (const feature of [...window.rivers, ...window.lakes]) {
        if (feature.revision > 0 && featureRevisions.get(feature.bodyId) !== feature.revision) {
            throw new TypeError("effective surface feature revision is missing from the dependency key");
        }
    }
    for (let index = 1; index < window.rivers.length; index += 1) {
        if (window.rivers[index - 1].featureKey.localeCompare(window.rivers[index].featureKey) >= 0) {
            throw new TypeError("effective surface rivers must be strictly ordered");
        }
    }
    for (let index = 1; index < window.lakes.length; index += 1) {
        if (window.lakes[index - 1].featureKey.localeCompare(window.lakes[index].featureKey) >= 0) {
            throw new TypeError("effective surface lakes must be strictly ordered");
        }
    }
}

export function createTransferableEffectiveWindow(
    snapshot: EffectiveWorldSnapshot,
    renderKey: RenderChunkKey,
    options: CreateTransferableEffectiveWindowOptions = {}
): TransferableEffectiveWindow {
    if (!options || typeof options !== "object"
        || Object.getOwnPropertyNames(options).some(name => name !== "bufferAllocator")
        || options.bufferAllocator !== undefined
        && (typeof options.bufferAllocator.acquire !== "function"
            || typeof options.bufferAllocator.release !== "function")) {
        throw new TypeError("effective surface window options are invalid");
    }
    const acquired: ArrayBuffer[] = [];
    try {
        const key = canonicalizeRenderChunkKey(snapshot.descriptor, renderKey);
        assertExactDependencies(snapshot, key);
        const semantic = copySemanticWindow(snapshot, key, options.bufferAllocator, acquired);
        const hydrology = collectHydrology(snapshot, key, options.bufferAllocator, acquired);
        const binding = createSurfaceDependencyBinding(snapshot, key, {
            hydrologyFeatureIds: hydrology.dependencyFeatureIds
        });
        const window: TransferableEffectiveWindow = Object.freeze({
            worldIdentity: snapshot.worldIdentity,
            effectiveRevision: snapshot.effectiveRevision,
            key,
            dependencyKey: binding.dependencyKey,
            validBounds: validCoreBounds(snapshot.descriptor, key),
            ...semantic,
            rivers: hydrology.rivers,
            lakes: hydrology.lakes
        });
        // The descriptor is intentionally not transferred; identity and the canonical key
        // freeze all topology-sensitive preparation before the Worker boundary.
        assertWindowWithoutDescriptor(window);
        return window;
    } catch (reason) {
        if (acquired.length > 0) options.bufferAllocator?.release(acquired);
        throw reason;
    }
}

function assertWindowWithoutDescriptor(window: TransferableEffectiveWindow): void {
    assertValidBounds(window.validBounds);
    const count = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
    if (window.substrateClass.length !== count || window.macroHeight.length !== count
        || window.biomeWeights.length !== count * 4 || window.climate.length !== count * 2
        || window.vegetationDensity.length !== count || window.vegetationProfile.length !== count) {
        throw new TypeError("effective surface window has inconsistent semantic columns");
    }
    for (const river of window.rivers) assertRiver(river);
    for (const lake of window.lakes) assertLake(lake);
}

export function effectiveSurfaceWindowTransferables(
    window: TransferableEffectiveWindow
): readonly ArrayBuffer[] {
    assertWindowWithoutDescriptor(window);
    const candidates = [
        window.substrateClass.buffer,
        window.macroHeight.buffer,
        window.biomeWeights.buffer,
        window.climate.buffer,
        window.vegetationDensity.buffer,
        window.vegetationProfile.buffer
    ];
    for (const river of window.rivers) {
        candidates.push(river.controlPoints.buffer, river.widthProfile.buffer, river.levelProfile.buffer);
    }
    for (const lake of window.lakes) candidates.push(lake.boundaryPoints.buffer);
    if (candidates.some(buffer => !(buffer instanceof ArrayBuffer))) {
        throw new TypeError("effective surface window buffers must be transferable ArrayBuffers");
    }
    const buffers = candidates as ArrayBuffer[];
    if (new Set(buffers).size !== buffers.length) {
        throw new TypeError("effective surface window must own distinct transferable buffers");
    }
    return Object.freeze(buffers);
}
