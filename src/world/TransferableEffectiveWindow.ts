import {
    BaseSemanticChunk
} from "./BaseSemanticChunk";
import { EffectiveHydrologyRegion, EffectiveWorldView } from "./EffectiveWorldView";
import { EffectiveSemanticChunk, getEffectiveSemanticTile } from "./EffectiveSemanticChunk";
import {
    AuthoredHydrologyFeature,
    HydrologyFeatureUpsertDelta,
    assertHydrologyFeatureDelta,
    createHydrologyFeatureDelta
} from "./HydrologyFeatureDelta";
import {
    HydrologyRegion,
    HydrologyRegionKey,
    assertHydrologyRegion
} from "./HydrologyRegion";
import {
    RenderChunkKey,
    SurfaceCompileMetrics,
    SurfaceDependencyKey,
    assertSurfaceDependencyKey,
    createSurfaceDependencyKey
} from "./SurfaceDependencyKey";
import {
    HYDROLOGY_REGION_SIZE,
    SURFACE_COMPILE_PROFILE,
    WORLD_SEMANTIC_CHUNK_SIZE
} from "./SurfaceCompileProfile";
import { SurfaceTaskRequestOptions } from "./SurfaceWorkerPool";
import { chunkLocation, chunkOrigin } from "./WorldGrid";
import { HYDROLOGY_REGION_FORMAT_VERSION } from "./WorldDescriptorV2";

export const TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION = 1;
export const EFFECTIVE_WINDOW_TILE_SIZE = SURFACE_COMPILE_PROFILE.renderChunkSize
    + SURFACE_COMPILE_PROFILE.influenceRadiusTiles * 2;
export const EFFECTIVE_WINDOW_TILE_COUNT = EFFECTIVE_WINDOW_TILE_SIZE * EFFECTIVE_WINDOW_TILE_SIZE;

export interface TransferableHydrologyRegionSlice {
    readonly key: HydrologyRegionKey;
    readonly topology: HydrologyRegion["topology"];
    readonly validBounds: HydrologyRegion["validBounds"];
    readonly baseRevision: number;
    readonly suppressedBaseFeatureIds: readonly string[];
    readonly boundaryPorts: HydrologyRegion["boundaryPorts"];
    readonly rivers: HydrologyRegion["rivers"];
    readonly lakes: HydrologyRegion["lakes"];
    readonly mouths: HydrologyRegion["mouths"];
    readonly bodies: HydrologyRegion["bodies"];
}

export interface TransferableEffectiveWindow {
    readonly formatVersion: typeof TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly effectiveRevision: number;
    readonly renderKey: RenderChunkKey;
    readonly originTileX: number;
    readonly originTileY: number;
    readonly valid: Uint8Array;
    readonly substrateClass: Uint8Array;
    readonly macroHeight: Uint16Array;
    readonly biomeWeights: Uint8Array;
    readonly climate: Uint8Array;
    readonly vegetationDensity: Uint8Array;
    readonly vegetationProfile: Uint8Array;
    readonly hydrologyRegions: readonly TransferableHydrologyRegionSlice[];
    readonly authoredHydrology: readonly HydrologyFeatureUpsertDelta[];
    readonly dependencyKey: SurfaceDependencyKey;
}

export interface BuildTransferableEffectiveWindowOptions {
    readonly view: EffectiveWorldView;
    readonly renderKey: RenderChunkKey;
    readonly metrics: SurfaceCompileMetrics;
    readonly request?: Readonly<SurfaceTaskRequestOptions>;
}

interface CanonicalTile {
    readonly x: number;
    readonly y: number;
}

function coordinateIdentity(x: number, y: number): string {
    return `${x}:${y}`;
}

function compareCoordinate(
    first: Readonly<{ x: number; y: number }>,
    second: Readonly<{ x: number; y: number }>
): number {
    return first.x - second.x || first.y - second.y;
}

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function canonicalTile(view: EffectiveWorldView, tileX: number, tileY: number): CanonicalTile | undefined {
    const descriptor = view.descriptor;
    if (descriptor.sourceKind === "procedural-infinite") return { x: tileX, y: tileY };
    if (descriptor.sourceKind === "procedural-toroidal") {
        return {
            x: positiveModulo(tileX, descriptor.width),
            y: positiveModulo(tileY, descriptor.height)
        };
    }
    return tileX >= 0 && tileX < descriptor.width && tileY >= 0 && tileY < descriptor.height
        ? { x: tileX, y: tileY } : undefined;
}

function assertCanonicalRenderKey(view: EffectiveWorldView, key: Readonly<RenderChunkKey>): void {
    const origin = chunkOrigin(key.chunkX, key.chunkY, SURFACE_COMPILE_PROFILE.renderChunkSize);
    const descriptor = view.descriptor;
    if (descriptor.sourceKind === "procedural-infinite") return;
    const countX = Math.ceil(descriptor.width / SURFACE_COMPILE_PROFILE.renderChunkSize);
    const countY = Math.ceil(descriptor.height / SURFACE_COMPILE_PROFILE.renderChunkSize);
    if (key.chunkX < 0 || key.chunkX >= countX || key.chunkY < 0 || key.chunkY >= countY
        || origin.x < 0 || origin.y < 0) {
        throw new RangeError("effective window render key must be canonical and inside its world");
    }
}

async function loadSemanticLeases(
    view: EffectiveWorldView,
    keys: readonly CanonicalTile[],
    request: Readonly<SurfaceTaskRequestOptions> | undefined
): Promise<EffectiveSemanticChunk[]> {
    const settled = await Promise.allSettled(keys.map(key => view.loadSemanticChunk(key.x, key.y, request)));
    const loaded = settled.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    const failed = settled.find(result => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) {
        for (const chunk of loaded) view.releaseSemanticChunk(chunk);
        throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
    }
    return loaded;
}

async function loadHydrologyLeases(
    view: EffectiveWorldView,
    keys: readonly CanonicalTile[],
    request: Readonly<SurfaceTaskRequestOptions> | undefined
): Promise<EffectiveHydrologyRegion[]> {
    const settled = await Promise.allSettled(keys.map(key => view.loadHydrologyRegion(key.x, key.y, request)));
    const loaded = settled.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    const failed = settled.find(result => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) {
        for (const region of loaded) view.releaseHydrologyRegion(region);
        throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
    }
    return loaded;
}

function cloneHydrologySlice(region: Readonly<EffectiveHydrologyRegion>): TransferableHydrologyRegionSlice {
    const base = region.base;
    return Object.freeze({
        key: Object.freeze({ regionX: region.key.regionX, regionY: region.key.regionY }),
        topology: region.base.topology,
        validBounds: Object.freeze({
            minX: 0 as const,
            minY: 0 as const,
            maxXExclusive: region.base.validBounds.maxXExclusive,
            maxYExclusive: region.base.validBounds.maxYExclusive
        }),
        baseRevision: region.baseRevision,
        suppressedBaseFeatureIds: Object.freeze([...region.suppressedBaseFeatureIds]),
        boundaryPorts: Object.freeze(base.boundaryPorts.map(port => Object.freeze({
            ...port,
            point: port.point.slice(),
            flowDirection: port.flowDirection.slice()
        }))),
        rivers: Object.freeze(base.rivers.map(river => Object.freeze({
            ...river,
            entry: Object.freeze({ ...river.entry }),
            exit: Object.freeze({ ...river.exit }),
            controlPoints: river.controlPoints.slice(),
            widthProfile: river.widthProfile.slice(),
            levelProfile: river.levelProfile.slice()
        }))),
        lakes: Object.freeze(base.lakes.map(lake => Object.freeze({
            ...lake,
            center: lake.center.slice()
        }))),
        mouths: Object.freeze(base.mouths.map(mouth => Object.freeze({
            ...mouth,
            point: mouth.point.slice()
        }))),
        bodies: Object.freeze(base.bodies.map(body => Object.freeze({ ...body })))
    });
}

function ownedFeature(feature: Readonly<AuthoredHydrologyFeature>): AuthoredHydrologyFeature {
    return feature.kind === "river" ? {
        ...feature,
        controlPoints: feature.controlPoints.slice(),
        widthProfile: feature.widthProfile.slice(),
        levelProfile: feature.levelProfile.slice()
    } : {
        ...feature,
        polygon: feature.polygon.slice()
    };
}

function cloneAuthoredDelta(delta: Readonly<HydrologyFeatureUpsertDelta>): HydrologyFeatureUpsertDelta {
    return createHydrologyFeatureDelta({
        worldIdentity: delta.worldIdentity,
        revision: delta.revision,
        featureId: delta.featureId,
        featureKind: delta.featureKind,
        operation: "upsert",
        feature: ownedFeature(delta.feature)
    }) as HydrologyFeatureUpsertDelta;
}

function addBuffer(buffers: Set<ArrayBuffer>, value: ArrayBufferLike): void {
    if (!(value instanceof ArrayBuffer)) {
        throw new TypeError("effective transfer window requires owned ArrayBuffer payloads");
    }
    if (buffers.has(value)) throw new Error("effective transfer window typed arrays must not alias buffers");
    buffers.add(value);
}

export function transferableEffectiveWindowTransferables(
    window: Readonly<TransferableEffectiveWindow>
): readonly ArrayBuffer[] {
    assertTransferableEffectiveWindow(window);
    const buffers = new Set<ArrayBuffer>();
    for (const array of [
        window.valid,
        window.substrateClass,
        window.macroHeight,
        window.biomeWeights,
        window.climate,
        window.vegetationDensity,
        window.vegetationProfile
    ]) addBuffer(buffers, array.buffer);
    for (const region of window.hydrologyRegions) {
        for (const port of region.boundaryPorts) {
            addBuffer(buffers, port.point.buffer);
            addBuffer(buffers, port.flowDirection.buffer);
        }
        for (const river of region.rivers) {
            addBuffer(buffers, river.controlPoints.buffer);
            addBuffer(buffers, river.widthProfile.buffer);
            addBuffer(buffers, river.levelProfile.buffer);
        }
        for (const lake of region.lakes) addBuffer(buffers, lake.center.buffer);
        for (const mouth of region.mouths) addBuffer(buffers, mouth.point.buffer);
    }
    for (const delta of window.authoredHydrology) {
        if (delta.feature.kind === "river") {
            addBuffer(buffers, delta.feature.controlPoints.buffer);
            addBuffer(buffers, delta.feature.widthProfile.buffer);
            addBuffer(buffers, delta.feature.levelProfile.buffer);
        } else addBuffer(buffers, delta.feature.polygon.buffer);
    }
    return Object.freeze([...buffers]);
}

export function assertTransferableEffectiveWindow(window: Readonly<TransferableEffectiveWindow>): void {
    if (!window || typeof window !== "object"
        || window.formatVersion !== TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION
        || window.worldIdentity !== window.dependencyKey.worldIdentity
        || window.renderKey.chunkX !== window.dependencyKey.renderKey.chunkX
        || window.renderKey.chunkY !== window.dependencyKey.renderKey.chunkY
        || !Number.isSafeInteger(window.effectiveRevision) || window.effectiveRevision < 0) {
        throw new TypeError("transferable effective window identity, key or revision is invalid");
    }
    assertSurfaceDependencyKey(window.dependencyKey);
    const expectedOrigin = chunkOrigin(
        window.renderKey.chunkX,
        window.renderKey.chunkY,
        SURFACE_COMPILE_PROFILE.renderChunkSize
    );
    if (window.originTileX !== expectedOrigin.x - SURFACE_COMPILE_PROFILE.influenceRadiusTiles
        || window.originTileY !== expectedOrigin.y - SURFACE_COMPILE_PROFILE.influenceRadiusTiles) {
        throw new Error("transferable effective window origin does not match its render key and halo");
    }
    const length = EFFECTIVE_WINDOW_TILE_COUNT;
    if (!(window.valid instanceof Uint8Array) || window.valid.length !== length
        || !(window.substrateClass instanceof Uint8Array) || window.substrateClass.length !== length
        || !(window.macroHeight instanceof Uint16Array) || window.macroHeight.length !== length
        || !(window.biomeWeights instanceof Uint8Array) || window.biomeWeights.length !== length * 4
        || !(window.climate instanceof Uint8Array) || window.climate.length !== length * 2
        || !(window.vegetationDensity instanceof Uint8Array) || window.vegetationDensity.length !== length
        || !(window.vegetationProfile instanceof Uint8Array) || window.vegetationProfile.length !== length) {
        throw new TypeError("transferable effective semantic arrays do not match the fixed 20x20 layout");
    }
    for (let index = 0; index < length; index += 1) {
        if (window.valid[index] > 1) throw new RangeError("effective window valid mask must be binary");
        if (window.valid[index] === 0) {
            const biomeOffset = index * 4;
            const climateOffset = index * 2;
            if (window.substrateClass[index] !== 0 || window.macroHeight[index] !== 0
                || window.biomeWeights[biomeOffset] !== 0 || window.biomeWeights[biomeOffset + 1] !== 0
                || window.biomeWeights[biomeOffset + 2] !== 0 || window.biomeWeights[biomeOffset + 3] !== 0
                || window.climate[climateOffset] !== 0 || window.climate[climateOffset + 1] !== 0
                || window.vegetationDensity[index] !== 0 || window.vegetationProfile[index] !== 0) {
                throw new Error("invalid effective window tiles must use canonical zero semantic payload");
            }
        }
    }
    if (!Array.isArray(window.hydrologyRegions) || !Array.isArray(window.authoredHydrology)) {
        throw new TypeError("transferable effective hydrology lists are required");
    }
    const featureDependencyById = new Map(window.dependencyKey.hydrologyFeatures
        .map(dependency => [dependency.featureId, dependency] as const));
    let previousRegion: TransferableHydrologyRegionSlice | undefined;
    for (let regionIndex = 0; regionIndex < window.hydrologyRegions.length; regionIndex += 1) {
        const region = window.hydrologyRegions[regionIndex];
        if (previousRegion && (previousRegion.key.regionX > region.key.regionX
            || previousRegion.key.regionX === region.key.regionX
                && previousRegion.key.regionY >= region.key.regionY)) {
            throw new Error("effective window hydrology regions must use unique ascending keys");
        }
        const dependency = window.dependencyKey.hydrologyRegions[regionIndex];
        if (!dependency || dependency.key.regionX !== region.key.regionX
            || dependency.key.regionY !== region.key.regionY
            || dependency.baseRevision !== region.baseRevision) {
            throw new Error("effective window hydrology region does not match its dependency key");
        }
        assertHydrologyRegion({
            formatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
            worldIdentity: window.worldIdentity,
            topology: region.topology,
            key: region.key,
            revision: region.baseRevision,
            validBounds: region.validBounds,
            boundaryPorts: region.boundaryPorts,
            rivers: region.rivers,
            lakes: region.lakes,
            mouths: region.mouths,
            bodies: region.bodies
        });
        let previousSuppressedId: string | undefined;
        for (const featureId of region.suppressedBaseFeatureIds) {
            if (previousSuppressedId !== undefined && previousSuppressedId >= featureId) {
                throw new Error("effective window suppressed feature IDs must be unique ascending identities");
            }
            if (!featureDependencyById.has(featureId)) {
                throw new Error("effective window suppressed feature is missing from its dependency key");
            }
            previousSuppressedId = featureId;
        }
        previousRegion = region;
    }
    if (window.hydrologyRegions.length !== window.dependencyKey.hydrologyRegions.length) {
        throw new Error("effective window hydrology region dependency count is inconsistent");
    }
    let previousFeatureId: string | undefined;
    for (const delta of window.authoredHydrology) {
        assertHydrologyFeatureDelta(delta);
        if (delta.operation !== "upsert" || delta.worldIdentity !== window.worldIdentity
            || delta.revision > window.effectiveRevision
            || previousFeatureId !== undefined && previousFeatureId >= delta.featureId) {
            throw new Error("effective window authored hydrology is invalid or unordered");
        }
        const dependency = featureDependencyById.get(delta.featureId);
        if (!dependency || dependency.featureKind !== delta.featureKind
            || dependency.revision !== delta.revision) {
            throw new Error("effective window authored feature does not match its dependency key");
        }
        previousFeatureId = delta.featureId;
    }
    for (const dependency of window.dependencyKey.semantic) {
        if (dependency.baseRevision > window.effectiveRevision
            || dependency.deltaRevision > window.effectiveRevision) {
            throw new RangeError("effective window semantic dependency is newer than its snapshot");
        }
    }
    for (const dependency of window.dependencyKey.hydrologyFeatures) {
        if (dependency.revision > window.effectiveRevision) {
            throw new RangeError("effective window hydrology dependency is newer than its snapshot");
        }
    }
}

export async function buildTransferableEffectiveWindow(
    options: Readonly<BuildTransferableEffectiveWindowOptions>
): Promise<TransferableEffectiveWindow> {
    if (!options || typeof options !== "object") {
        throw new TypeError("transferable effective window options are required");
    }
    assertCanonicalRenderKey(options.view, options.renderKey);
    const renderOrigin = chunkOrigin(
        options.renderKey.chunkX,
        options.renderKey.chunkY,
        SURFACE_COMPILE_PROFILE.renderChunkSize
    );
    const originTileX = renderOrigin.x - SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
    const originTileY = renderOrigin.y - SURFACE_COMPILE_PROFILE.influenceRadiusTiles;
    const semanticKeyMap = new Map<string, CanonicalTile>();
    const hydrologyKeyMap = new Map<string, CanonicalTile>();
    for (let localX = 0; localX < EFFECTIVE_WINDOW_TILE_SIZE; localX += 1) {
        for (let localY = 0; localY < EFFECTIVE_WINDOW_TILE_SIZE; localY += 1) {
            const canonical = canonicalTile(options.view, originTileX + localX, originTileY + localY);
            if (!canonical) continue;
            const semanticLocation = chunkLocation(canonical.x, canonical.y, WORLD_SEMANTIC_CHUNK_SIZE);
            semanticKeyMap.set(
                coordinateIdentity(semanticLocation.chunkX, semanticLocation.chunkY),
                { x: semanticLocation.chunkX, y: semanticLocation.chunkY }
            );
            const hydrologyLocation = chunkLocation(canonical.x, canonical.y, HYDROLOGY_REGION_SIZE);
            hydrologyKeyMap.set(
                coordinateIdentity(hydrologyLocation.chunkX, hydrologyLocation.chunkY),
                { x: hydrologyLocation.chunkX, y: hydrologyLocation.chunkY }
            );
        }
    }
    const semanticKeys = [...semanticKeyMap.values()].sort(compareCoordinate);
    const hydrologyKeys = [...hydrologyKeyMap.values()].sort(compareCoordinate);
    const semanticLeases = await loadSemanticLeases(options.view, semanticKeys, options.request);
    let hydrologyLeases: EffectiveHydrologyRegion[] = [];
    try {
        hydrologyLeases = await loadHydrologyLeases(options.view, hydrologyKeys, options.request);
        const semanticByKey = new Map(semanticLeases.map(chunk => [
            coordinateIdentity(chunk.key.chunkX, chunk.key.chunkY),
            chunk
        ]));
        const valid = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
        const substrateClass = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
        const macroHeight = new Uint16Array(EFFECTIVE_WINDOW_TILE_COUNT);
        const biomeWeights = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT * 4);
        const climate = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT * 2);
        const vegetationDensity = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
        const vegetationProfile = new Uint8Array(EFFECTIVE_WINDOW_TILE_COUNT);
        for (let localX = 0; localX < EFFECTIVE_WINDOW_TILE_SIZE; localX += 1) {
            for (let localY = 0; localY < EFFECTIVE_WINDOW_TILE_SIZE; localY += 1) {
                const index = localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
                const canonical = canonicalTile(options.view, originTileX + localX, originTileY + localY);
                if (!canonical) continue;
                const location = chunkLocation(canonical.x, canonical.y, WORLD_SEMANTIC_CHUNK_SIZE);
                const chunk = semanticByKey.get(coordinateIdentity(location.chunkX, location.chunkY));
                if (!chunk) throw new Error("effective semantic window lost one loaded chunk lease");
                const tile = getEffectiveSemanticTile(chunk, location.localX, location.localY);
                valid[index] = 1;
                substrateClass[index] = tile.substrateClass;
                macroHeight[index] = tile.macroHeight;
                biomeWeights.set(tile.biomeWeights, index * 4);
                climate[index * 2] = tile.temperature;
                climate[index * 2 + 1] = tile.moisture;
                vegetationDensity[index] = tile.vegetationDensity;
                vegetationProfile[index] = tile.vegetationProfile;
            }
        }

        const authoredById = new Map<string, HydrologyFeatureUpsertDelta>();
        const featureDependencyIds = new Set<string>();
        for (const region of hydrologyLeases) {
            for (const delta of region.authoredFeatures) authoredById.set(delta.featureId, delta);
            for (const featureId of region.suppressedBaseFeatureIds) featureDependencyIds.add(featureId);
        }
        for (const featureId of authoredById.keys()) featureDependencyIds.add(featureId);
        const authoredHydrology = Object.freeze([...authoredById.values()]
            .sort((first, second) => first.featureId < second.featureId ? -1 : 1)
            .map(cloneAuthoredDelta));
        const hydrologyRegions = Object.freeze(hydrologyLeases
            .slice()
            .sort((first, second) => first.key.regionX - second.key.regionX
                || first.key.regionY - second.key.regionY)
            .map(cloneHydrologySlice));
        const dependencyKey = createSurfaceDependencyKey({
            worldIdentity: options.view.worldIdentity,
            renderKey: options.renderKey,
            metrics: options.metrics,
            semantic: semanticLeases
                .map(chunk => ({
                    key: chunk.key,
                    baseRevision: chunk.baseRevision,
                    deltaRevision: chunk.deltaRevision
                }))
                .sort((first, second) => first.key.chunkX - second.key.chunkX
                    || first.key.chunkY - second.key.chunkY),
            hydrologyRegions: hydrologyLeases
                .map(region => ({ key: region.key, baseRevision: region.baseRevision }))
                .sort((first, second) => first.key.regionX - second.key.regionX
                    || first.key.regionY - second.key.regionY),
            hydrologyFeatures: [...featureDependencyIds]
                .sort()
                .map(featureId => {
                    const delta = options.view.deltaSnapshot.getHydrologyDelta(featureId);
                    if (!delta) throw new Error("effective window lost a hydrology feature dependency");
                    return {
                        featureId,
                        featureKind: delta.featureKind,
                        revision: delta.revision
                    };
                })
        });
        const window: TransferableEffectiveWindow = Object.freeze({
            formatVersion: TRANSFERABLE_EFFECTIVE_WINDOW_FORMAT_VERSION,
            worldIdentity: options.view.worldIdentity,
            effectiveRevision: options.view.effectiveRevision,
            renderKey: dependencyKey.renderKey,
            originTileX,
            originTileY,
            valid,
            substrateClass,
            macroHeight,
            biomeWeights,
            climate,
            vegetationDensity,
            vegetationProfile,
            hydrologyRegions,
            authoredHydrology,
            dependencyKey
        });
        assertTransferableEffectiveWindow(window);
        transferableEffectiveWindowTransferables(window);
        return window;
    } finally {
        for (const chunk of semanticLeases) options.view.releaseSemanticChunk(chunk);
        for (const region of hydrologyLeases) options.view.releaseHydrologyRegion(region);
    }
}
