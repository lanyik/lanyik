import { SemanticChunkKey } from "./BaseSemanticChunk";
import { AuthoredHydrologyFeatureKind } from "./HydrologyFeatureDelta";
import { HydrologyRegionKey } from "./HydrologyRegion";
import { SURFACE_COMPILER_REVISION } from "./CompiledSurfaceField";
import {
    HYDROLOGY_REGION_SIZE,
    SURFACE_COMPILE_PROFILE,
    SURFACE_COMPILE_PROFILE_VERSION,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

export const SURFACE_DEPENDENCY_KEY_FORMAT_VERSION = 1;
export const MAX_SURFACE_DEPENDENCY_SEMANTIC_CHUNKS = 4;
export const MAX_SURFACE_DEPENDENCY_HYDROLOGY_REGIONS = 4;
export const MAX_SURFACE_DEPENDENCY_HYDROLOGY_FEATURES = 1_024;

export interface RenderChunkKey {
    readonly chunkX: number;
    readonly chunkY: number;
}

export interface SurfaceCompileMetrics {
    readonly hexSize: number;
    readonly heightScale: number;
}

export interface SurfaceSemanticDependency {
    readonly key: SemanticChunkKey;
    readonly baseRevision: number;
    readonly deltaRevision: number;
}

export interface SurfaceHydrologyRegionDependency {
    readonly key: HydrologyRegionKey;
    readonly baseRevision: number;
}

export interface SurfaceHydrologyFeatureDependency {
    readonly featureId: string;
    readonly featureKind: AuthoredHydrologyFeatureKind;
    readonly revision: number;
}

export interface SurfaceDependencyKey {
    readonly formatVersion: typeof SURFACE_DEPENDENCY_KEY_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly renderKey: RenderChunkKey;
    readonly compilerRevision: typeof SURFACE_COMPILER_REVISION;
    readonly compileProfileVersion: typeof SURFACE_COMPILE_PROFILE_VERSION;
    readonly metrics: SurfaceCompileMetrics;
    readonly semantic: readonly SurfaceSemanticDependency[];
    readonly hydrologyRegions: readonly SurfaceHydrologyRegionDependency[];
    readonly hydrologyFeatures: readonly SurfaceHydrologyFeatureDependency[];
}

export interface SurfaceDependencyKeyInput extends Omit<SurfaceDependencyKey,
    "formatVersion" | "compilerRevision" | "compileProfileVersion" | "renderKey" | "metrics"
    | "semantic" | "hydrologyRegions" | "hydrologyFeatures"> {
    readonly renderKey: RenderChunkKey;
    readonly metrics: SurfaceCompileMetrics;
    readonly semantic: readonly SurfaceSemanticDependency[];
    readonly hydrologyRegions: readonly SurfaceHydrologyRegionDependency[];
    readonly hydrologyFeatures: readonly SurfaceHydrologyFeatureDependency[];
}

export interface SurfaceRequestToken {
    readonly sessionEpoch: number;
    readonly renderChunkGeneration: number;
}

function assertRevision(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

function assertFeatureId(featureId: unknown): asserts featureId is string {
    if (typeof featureId !== "string" || featureId.length === 0 || featureId.length > 256
        || featureId.trim() !== featureId || /[\u0000-\u001f\u007f]/u.test(featureId)) {
        throw new TypeError("surface dependency hydrology feature ID is invalid");
    }
}

function assertMetrics(metrics: Readonly<SurfaceCompileMetrics>): void {
    if (!metrics || typeof metrics !== "object"
        || !Number.isFinite(metrics.hexSize) || metrics.hexSize <= 0
        || !Number.isFinite(metrics.heightScale) || metrics.heightScale <= 0) {
        throw new RangeError("surface compile metrics must use positive finite scales");
    }
}

function assertCoordinateOrder<T>(
    name: string,
    values: readonly T[],
    chunkSize: number,
    maximum: number,
    coordinate: (value: T) => Readonly<{ x: number; y: number }>
): void {
    if (!Array.isArray(values) || values.length === 0 || values.length > maximum) {
        throw new RangeError(`${name} dependency count is outside its fixed budget`);
    }
    let previous: T | undefined;
    for (const value of values) {
        if (!value || typeof value !== "object") {
            throw new TypeError(`${name} dependency is invalid`);
        }
        const currentCoordinate = coordinate(value);
        chunkOrigin(currentCoordinate.x, currentCoordinate.y, chunkSize);
        if (previous) {
            const previousCoordinate = coordinate(previous);
            if (previousCoordinate.x > currentCoordinate.x
                || previousCoordinate.x === currentCoordinate.x
                    && previousCoordinate.y >= currentCoordinate.y) {
                throw new Error(`${name} dependencies must use unique ascending keys`);
            }
        }
        previous = value;
    }
}

export function assertSurfaceRequestToken(token: Readonly<SurfaceRequestToken>): void {
    if (!token || typeof token !== "object") throw new TypeError("surface request token is required");
    assertRevision("surface request session epoch", token.sessionEpoch);
    assertRevision("surface request render chunk generation", token.renderChunkGeneration);
}

export function createSurfaceRequestToken(
    sessionEpoch: number,
    renderChunkGeneration: number
): SurfaceRequestToken {
    const token = Object.freeze({ sessionEpoch, renderChunkGeneration });
    assertSurfaceRequestToken(token);
    return token;
}

export function surfaceRequestTokensEqual(
    first: Readonly<SurfaceRequestToken>,
    second: Readonly<SurfaceRequestToken>
): boolean {
    return first.sessionEpoch === second.sessionEpoch
        && first.renderChunkGeneration === second.renderChunkGeneration;
}

export function assertSurfaceDependencyKey(key: Readonly<SurfaceDependencyKey>): void {
    if (!key || typeof key !== "object"
        || key.formatVersion !== SURFACE_DEPENDENCY_KEY_FORMAT_VERSION
        || key.compilerRevision !== SURFACE_COMPILER_REVISION
        || key.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION
        || typeof key.worldIdentity !== "string" || key.worldIdentity.length === 0
        || key.worldIdentity.length > 16_384) {
        throw new TypeError("surface dependency key identity or format is invalid");
    }
    chunkOrigin(key.renderKey.chunkX, key.renderKey.chunkY, SURFACE_COMPILE_PROFILE.renderChunkSize);
    assertMetrics(key.metrics);
    assertCoordinateOrder(
        "surface semantic",
        key.semantic,
        WORLD_SEMANTIC_CHUNK_SIZE,
        MAX_SURFACE_DEPENDENCY_SEMANTIC_CHUNKS,
        dependency => ({ x: dependency.key.chunkX, y: dependency.key.chunkY })
    );
    for (const dependency of key.semantic) {
        assertRevision("surface semantic base revision", dependency.baseRevision);
        assertRevision("surface semantic delta revision", dependency.deltaRevision);
    }
    assertCoordinateOrder(
        "surface hydrology region",
        key.hydrologyRegions,
        HYDROLOGY_REGION_SIZE,
        MAX_SURFACE_DEPENDENCY_HYDROLOGY_REGIONS,
        dependency => ({ x: dependency.key.regionX, y: dependency.key.regionY })
    );
    for (const dependency of key.hydrologyRegions) {
        assertRevision("surface hydrology base revision", dependency.baseRevision);
    }
    if (!Array.isArray(key.hydrologyFeatures)
        || key.hydrologyFeatures.length > MAX_SURFACE_DEPENDENCY_HYDROLOGY_FEATURES) {
        throw new RangeError("surface hydrology feature dependency count exceeds its fixed budget");
    }
    let previousFeatureId: string | undefined;
    for (const dependency of key.hydrologyFeatures) {
        if (!dependency || typeof dependency !== "object") {
            throw new TypeError("surface hydrology feature dependency is invalid");
        }
        assertFeatureId(dependency.featureId);
        if (dependency.featureKind !== "river" && dependency.featureKind !== "lake") {
            throw new TypeError("surface hydrology feature dependency kind is invalid");
        }
        assertRevision("surface hydrology feature revision", dependency.revision);
        if (dependency.revision === 0) {
            throw new RangeError("surface hydrology feature dependency must refer to a delta revision");
        }
        if (previousFeatureId !== undefined && previousFeatureId >= dependency.featureId) {
            throw new Error("surface hydrology feature dependencies must use unique ascending identities");
        }
        previousFeatureId = dependency.featureId;
    }
}

export function createSurfaceDependencyKey(
    input: Readonly<SurfaceDependencyKeyInput>
): SurfaceDependencyKey {
    if (!input || typeof input !== "object") throw new TypeError("surface dependency key input is required");
    const key: SurfaceDependencyKey = Object.freeze({
        formatVersion: SURFACE_DEPENDENCY_KEY_FORMAT_VERSION,
        worldIdentity: input.worldIdentity,
        renderKey: Object.freeze({ chunkX: input.renderKey.chunkX, chunkY: input.renderKey.chunkY }),
        compilerRevision: SURFACE_COMPILER_REVISION,
        compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
        metrics: Object.freeze({ hexSize: input.metrics.hexSize, heightScale: input.metrics.heightScale }),
        semantic: Object.freeze(input.semantic.map(dependency => Object.freeze({
            key: Object.freeze({ chunkX: dependency.key.chunkX, chunkY: dependency.key.chunkY }),
            baseRevision: dependency.baseRevision,
            deltaRevision: dependency.deltaRevision
        }))),
        hydrologyRegions: Object.freeze(input.hydrologyRegions.map(dependency => Object.freeze({
            key: Object.freeze({
                regionX: dependency.key.regionX,
                regionY: dependency.key.regionY
            }),
            baseRevision: dependency.baseRevision
        }))),
        hydrologyFeatures: Object.freeze(input.hydrologyFeatures.map(dependency => Object.freeze({
            featureId: dependency.featureId,
            featureKind: dependency.featureKind,
            revision: dependency.revision
        })))
    });
    assertSurfaceDependencyKey(key);
    return key;
}

export function serializeSurfaceDependencyKey(key: Readonly<SurfaceDependencyKey>): string {
    assertSurfaceDependencyKey(key);
    return JSON.stringify([
        key.formatVersion,
        key.worldIdentity,
        key.renderKey.chunkX,
        key.renderKey.chunkY,
        key.compilerRevision,
        key.compileProfileVersion,
        key.metrics.hexSize,
        key.metrics.heightScale,
        key.semantic.map(dependency => [
            dependency.key.chunkX,
            dependency.key.chunkY,
            dependency.baseRevision,
            dependency.deltaRevision
        ]),
        key.hydrologyRegions.map(dependency => [
            dependency.key.regionX,
            dependency.key.regionY,
            dependency.baseRevision
        ]),
        key.hydrologyFeatures.map(dependency => [
            dependency.featureId,
            dependency.featureKind,
            dependency.revision
        ])
    ]);
}

export function surfaceDependencyKeysEqual(
    first: Readonly<SurfaceDependencyKey>,
    second: Readonly<SurfaceDependencyKey>
): boolean {
    return serializeSurfaceDependencyKey(first) === serializeSurfaceDependencyKey(second);
}
