import type { EffectiveWorldSnapshot } from "./EffectiveWorldView";
import {
    canonicalizeHydrologyRegionKey,
    canonicalizeSemanticChunkKey,
    serializeWorldDescriptorV2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";
import {
    assertHydrologyRegionKey,
    assertSemanticChunkKey,
    positiveIntegerModulo,
    SemanticChunkKey,
    HydrologyRegionKey
} from "./WorldSemanticFormat";

export const SURFACE_RENDER_CHUNK_SIZE = 16;
export const SURFACE_COMPILER_REVISION = 1;
export const SURFACE_COMPILE_PROFILE_VERSION = 1;

export interface RenderChunkKey {
    readonly chunkX: number;
    readonly chunkY: number;
}

export interface SurfaceSemanticDependency {
    readonly key: SemanticChunkKey;
    readonly baseRevision: number;
    readonly deltaRevision: number;
}

export interface SurfaceHydrologyFeatureDependency {
    readonly featureId: string;
    readonly revision: number;
}

export interface SurfaceHydrologyDependency {
    readonly key: HydrologyRegionKey;
    readonly baseRevision: number;
    readonly features: readonly SurfaceHydrologyFeatureDependency[];
}

export interface SurfaceDependencyKey {
    readonly worldIdentity: string;
    readonly renderKey: RenderChunkKey;
    readonly compilerRevision: number;
    readonly compileProfileVersion: number;
    readonly semanticChunks: readonly SurfaceSemanticDependency[];
    readonly hydrologyRegions: readonly SurfaceHydrologyDependency[];
}

export interface SurfaceDependencyBinding {
    readonly effectiveRevision: number;
    readonly dependencyKey: SurfaceDependencyKey;
}

export interface SurfaceRequestToken {
    readonly sessionEpoch: number;
    readonly renderChunkGeneration: number;
}

export interface SurfaceRequestIdentity extends SurfaceDependencyBinding {
    readonly requestToken: SurfaceRequestToken;
}

function assertNonNegativeRevision(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

function assertPositiveVersion(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive safe integer`);
    }
}

function assertRenderChunkKey(value: RenderChunkKey): void {
    if (!value || typeof value !== "object"
        || Object.getOwnPropertyNames(value).some(name => name !== "chunkX" && name !== "chunkY")
        || !Number.isSafeInteger(value.chunkX) || !Number.isSafeInteger(value.chunkY)) {
        throw new TypeError("render chunk key must contain safe integer coordinates");
    }
    const originX = value.chunkX * SURFACE_RENDER_CHUNK_SIZE;
    const originY = value.chunkY * SURFACE_RENDER_CHUNK_SIZE;
    const endX = originX + SURFACE_RENDER_CHUNK_SIZE - 1;
    const endY = originY + SURFACE_RENDER_CHUNK_SIZE - 1;
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)
        || !Number.isSafeInteger(endX) || !Number.isSafeInteger(endY)) {
        throw new RangeError("render chunk key exceeds the safe integer tile range");
    }
}

export function canonicalizeRenderChunkKey(
    descriptor: WorldDescriptorV2,
    key: RenderChunkKey
): RenderChunkKey {
    serializeWorldDescriptorV2(descriptor);
    assertRenderChunkKey(key);
    if (descriptor.topology === "toroidal") {
        return Object.freeze({
            chunkX: positiveIntegerModulo(key.chunkX, descriptor.width / SURFACE_RENDER_CHUNK_SIZE),
            chunkY: positiveIntegerModulo(key.chunkY, descriptor.height / SURFACE_RENDER_CHUNK_SIZE)
        });
    }
    if (descriptor.topology === "bounded") {
        const originX = key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
        const originY = key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
        if (originX < 0 || originY < 0 || originX >= descriptor.width || originY >= descriptor.height) {
            throw new RangeError("render chunk key lies outside the bounded world");
        }
    }
    return Object.freeze({ chunkX: key.chunkX, chunkY: key.chunkY });
}

function assertCanonicalSemanticDependencies(values: readonly SurfaceSemanticDependency[]): void {
    if (!Array.isArray(values)) throw new TypeError("surface semantic dependencies must be an array");
    for (let index = 0; index < values.length; index += 1) {
        const dependency = values[index];
        if (!dependency || typeof dependency !== "object"
            || Object.getOwnPropertyNames(dependency).some(name =>
                name !== "key" && name !== "baseRevision" && name !== "deltaRevision")) {
            throw new TypeError("surface semantic dependency is invalid");
        }
        assertSemanticChunkKey(dependency.key);
        assertNonNegativeRevision("semantic base revision", dependency.baseRevision);
        assertNonNegativeRevision("semantic delta revision", dependency.deltaRevision);
        if (index > 0) {
            const previous = values[index - 1].key;
            if (previous.chunkX > dependency.key.chunkX
                || previous.chunkX === dependency.key.chunkX && previous.chunkY >= dependency.key.chunkY) {
                throw new TypeError("surface semantic dependencies must be strictly ordered");
            }
        }
    }
}

function assertCanonicalHydrologyDependencies(values: readonly SurfaceHydrologyDependency[]): void {
    if (!Array.isArray(values)) throw new TypeError("surface hydrology dependencies must be an array");
    for (let index = 0; index < values.length; index += 1) {
        const dependency = values[index];
        if (!dependency || typeof dependency !== "object"
            || Object.getOwnPropertyNames(dependency).some(name =>
                name !== "key" && name !== "baseRevision" && name !== "features")) {
            throw new TypeError("surface hydrology dependency is invalid");
        }
        assertHydrologyRegionKey(dependency.key);
        assertNonNegativeRevision("hydrology base revision", dependency.baseRevision);
        if (!Array.isArray(dependency.features)) {
            throw new TypeError("surface hydrology feature dependencies must be an array");
        }
        for (let featureIndex = 0; featureIndex < dependency.features.length; featureIndex += 1) {
            const feature = dependency.features[featureIndex];
            if (!feature || typeof feature.featureId !== "string"
                || Object.getOwnPropertyNames(feature).some(name => name !== "featureId" && name !== "revision")) {
                throw new TypeError("surface hydrology feature dependency is invalid");
            }
            assertPositiveVersion("hydrology feature revision", feature.revision);
            if (featureIndex > 0
                && dependency.features[featureIndex - 1].featureId.localeCompare(feature.featureId) >= 0) {
                throw new TypeError("surface hydrology feature dependencies must be strictly ordered");
            }
        }
        if (index > 0) {
            const previous = values[index - 1].key;
            if (previous.regionX > dependency.key.regionX
                || previous.regionX === dependency.key.regionX && previous.regionY >= dependency.key.regionY) {
                throw new TypeError("surface hydrology dependencies must be strictly ordered");
            }
        }
    }
}

export function assertSurfaceDependencyKey(value: unknown): asserts value is SurfaceDependencyKey {
    if (!value || typeof value !== "object") throw new TypeError("surface dependency key must be an object");
    const key = value as SurfaceDependencyKey;
    const allowedFields = new Set([
        "worldIdentity",
        "renderKey",
        "compilerRevision",
        "compileProfileVersion",
        "semanticChunks",
        "hydrologyRegions"
    ]);
    if (Object.getOwnPropertyNames(key).some(name => !allowedFields.has(name))
        || typeof key.worldIdentity !== "string" || key.worldIdentity.length === 0) {
        throw new TypeError("surface dependency key header is invalid");
    }
    assertRenderChunkKey(key.renderKey);
    assertPositiveVersion("surface compiler revision", key.compilerRevision);
    assertPositiveVersion("surface compile profile version", key.compileProfileVersion);
    assertCanonicalSemanticDependencies(key.semanticChunks);
    assertCanonicalHydrologyDependencies(key.hydrologyRegions);
}

export function createSurfaceDependencyBinding(
    snapshot: EffectiveWorldSnapshot,
    renderKey: RenderChunkKey,
    options: {
        readonly compilerRevision?: number;
        readonly compileProfileVersion?: number;
    } = {}
): SurfaceDependencyBinding {
    const canonicalRenderKey = canonicalizeRenderChunkKey(snapshot.descriptor, renderKey);
    const compilerRevision = options.compilerRevision ?? SURFACE_COMPILER_REVISION;
    const compileProfileVersion = options.compileProfileVersion ?? SURFACE_COMPILE_PROFILE_VERSION;
    assertPositiveVersion("surface compiler revision", compilerRevision);
    assertPositiveVersion("surface compile profile version", compileProfileVersion);
    if (snapshot.worldIdentity !== serializeWorldDescriptorV2(snapshot.descriptor)) {
        throw new TypeError("effective snapshot world identity is inconsistent with its descriptor");
    }
    const semanticChunks = Object.freeze(snapshot.semanticChunks.map(chunk => Object.freeze({
        key: Object.freeze(canonicalizeSemanticChunkKey(snapshot.descriptor, chunk.base.key)),
        baseRevision: chunk.base.revision,
        deltaRevision: chunk.delta?.revision ?? 0
    })));
    const hydrologyRegions = Object.freeze(snapshot.hydrologyRegions.map(region => Object.freeze({
        key: Object.freeze(canonicalizeHydrologyRegionKey(snapshot.descriptor, region.base.key)),
        baseRevision: region.base.revision,
        features: Object.freeze(region.featureDeltas.map(feature => Object.freeze({
            featureId: feature.featureId,
            revision: feature.revision
        })))
    })));
    const dependencyKey: SurfaceDependencyKey = Object.freeze({
        worldIdentity: snapshot.worldIdentity,
        renderKey: canonicalRenderKey,
        compilerRevision,
        compileProfileVersion,
        semanticChunks,
        hydrologyRegions
    });
    assertSurfaceDependencyKey(dependencyKey);
    return Object.freeze({
        effectiveRevision: snapshot.effectiveRevision,
        dependencyKey
    });
}

export function surfaceDependencyKeysEqual(
    first: SurfaceDependencyKey,
    second: SurfaceDependencyKey
): boolean {
    assertSurfaceDependencyKey(first);
    assertSurfaceDependencyKey(second);
    if (first === second) return true;
    if (first.worldIdentity !== second.worldIdentity
        || first.renderKey.chunkX !== second.renderKey.chunkX
        || first.renderKey.chunkY !== second.renderKey.chunkY
        || first.compilerRevision !== second.compilerRevision
        || first.compileProfileVersion !== second.compileProfileVersion
        || first.semanticChunks.length !== second.semanticChunks.length
        || first.hydrologyRegions.length !== second.hydrologyRegions.length) return false;
    for (let index = 0; index < first.semanticChunks.length; index += 1) {
        const left = first.semanticChunks[index];
        const right = second.semanticChunks[index];
        if (left.key.chunkX !== right.key.chunkX || left.key.chunkY !== right.key.chunkY
            || left.baseRevision !== right.baseRevision || left.deltaRevision !== right.deltaRevision) return false;
    }
    for (let index = 0; index < first.hydrologyRegions.length; index += 1) {
        const left = first.hydrologyRegions[index];
        const right = second.hydrologyRegions[index];
        if (left.key.regionX !== right.key.regionX || left.key.regionY !== right.key.regionY
            || left.baseRevision !== right.baseRevision || left.features.length !== right.features.length) return false;
        for (let featureIndex = 0; featureIndex < left.features.length; featureIndex += 1) {
            if (left.features[featureIndex].featureId !== right.features[featureIndex].featureId
                || left.features[featureIndex].revision !== right.features[featureIndex].revision) return false;
        }
    }
    return true;
}

export function serializeSurfaceDependencyKey(key: SurfaceDependencyKey): string {
    assertSurfaceDependencyKey(key);
    return JSON.stringify([
        key.worldIdentity,
        [key.renderKey.chunkX, key.renderKey.chunkY],
        key.compilerRevision,
        key.compileProfileVersion,
        key.semanticChunks.map(dependency => [
            dependency.key.chunkX,
            dependency.key.chunkY,
            dependency.baseRevision,
            dependency.deltaRevision
        ]),
        key.hydrologyRegions.map(dependency => [
            dependency.key.regionX,
            dependency.key.regionY,
            dependency.baseRevision,
            dependency.features.map(feature => [feature.featureId, feature.revision])
        ])
    ]);
}

export function assertSurfaceRequestToken(value: unknown): asserts value is SurfaceRequestToken {
    if (!value || typeof value !== "object") throw new TypeError("surface request token must be an object");
    const token = value as SurfaceRequestToken;
    if (Object.getOwnPropertyNames(token).some(name =>
        name !== "sessionEpoch" && name !== "renderChunkGeneration")) {
        throw new TypeError("surface request token contains unknown fields");
    }
    assertPositiveVersion("surface request sessionEpoch", token.sessionEpoch);
    assertPositiveVersion("surface request renderChunkGeneration", token.renderChunkGeneration);
}

function renderKeyString(key: RenderChunkKey): string {
    return `${key.chunkX},${key.chunkY}`;
}

export class SurfaceRequestTracker {
    private readonly currentByRenderKey = new Map<string, SurfaceRequestToken>();
    private readonly worldIdentity: string;
    private nextGeneration = 0;
    private disposed = false;

    constructor(
        public readonly descriptor: WorldDescriptorV2,
        public readonly sessionEpoch: number
    ) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
        assertPositiveVersion("surface request sessionEpoch", sessionEpoch);
    }

    public get activeRequestCount(): number { return this.currentByRenderKey.size; }

    public issue(renderKey: RenderChunkKey): SurfaceRequestToken {
        if (this.disposed) throw new Error("surface request tracker has been disposed");
        const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
        if (this.nextGeneration >= Number.MAX_SAFE_INTEGER) {
            throw new RangeError("surface request generation space is exhausted");
        }
        this.nextGeneration += 1;
        const token = Object.freeze({
            sessionEpoch: this.sessionEpoch,
            renderChunkGeneration: this.nextGeneration
        });
        this.currentByRenderKey.set(renderKeyString(canonical), token);
        return token;
    }

    public issueRequest(
        snapshot: EffectiveWorldSnapshot,
        renderKey: RenderChunkKey,
        options: {
            readonly compilerRevision?: number;
            readonly compileProfileVersion?: number;
        } = {}
    ): SurfaceRequestIdentity {
        if (snapshot.worldIdentity !== this.worldIdentity) {
            throw new TypeError("cannot issue a surface request for another world identity");
        }
        const binding = createSurfaceDependencyBinding(snapshot, renderKey, options);
        return Object.freeze({
            ...binding,
            requestToken: this.issue(renderKey)
        });
    }

    public current(renderKey: RenderChunkKey): SurfaceRequestToken | undefined {
        if (this.disposed) return undefined;
        const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
        return this.currentByRenderKey.get(renderKeyString(canonical));
    }

    public isCurrent(renderKey: RenderChunkKey, token: SurfaceRequestToken): boolean {
        assertSurfaceRequestToken(token);
        const current = this.current(renderKey);
        return current !== undefined
            && current.sessionEpoch === token.sessionEpoch
            && current.renderChunkGeneration === token.renderChunkGeneration;
    }

    public canAccept(
        renderKey: RenderChunkKey,
        result: SurfaceRequestIdentity,
        currentBinding: SurfaceDependencyBinding
    ): boolean {
        assertSurfaceRequestToken(result.requestToken);
        assertNonNegativeRevision("surface result effective revision", result.effectiveRevision);
        assertNonNegativeRevision("current effective revision", currentBinding.effectiveRevision);
        assertSurfaceDependencyKey(result.dependencyKey);
        assertSurfaceDependencyKey(currentBinding.dependencyKey);
        const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
        if (result.dependencyKey.renderKey.chunkX !== canonical.chunkX
            || result.dependencyKey.renderKey.chunkY !== canonical.chunkY
            || currentBinding.dependencyKey.renderKey.chunkX !== canonical.chunkX
            || currentBinding.dependencyKey.renderKey.chunkY !== canonical.chunkY
            || result.dependencyKey.worldIdentity !== this.worldIdentity
            || currentBinding.dependencyKey.worldIdentity !== this.worldIdentity
            || result.effectiveRevision > currentBinding.effectiveRevision) return false;
        return this.isCurrent(canonical, result.requestToken)
            && surfaceDependencyKeysEqual(result.dependencyKey, currentBinding.dependencyKey);
    }

    public release(renderKey: RenderChunkKey, token: SurfaceRequestToken): boolean {
        if (!this.isCurrent(renderKey, token)) return false;
        const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
        return this.currentByRenderKey.delete(renderKeyString(canonical));
    }

    public dispose(): void {
        this.disposed = true;
        this.currentByRenderKey.clear();
    }
}
