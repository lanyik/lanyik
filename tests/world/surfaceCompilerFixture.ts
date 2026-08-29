import { createSurfaceDependencyKey } from "../../src/world/SurfaceDependencyKey";
import { HydrologyFeatureUpsertDelta } from "../../src/world/HydrologyFeatureDelta";
import {
    EFFECTIVE_WINDOW_TILE_COUNT,
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow,
    TransferableHydrologyRegionSlice,
    TransferableWorldDomain
} from "../../src/world/TransferableEffectiveWindow";

export const SURFACE_COMPILER_TEST_WORLD_IDENTITY = "world:surface-compiler-test";

interface SurfaceCompilerTestWindowOptions {
    readonly renderChunkX?: number;
    readonly renderChunkY?: number;
    readonly seaLevel?: number;
    readonly domain?: TransferableWorldDomain;
    readonly tileIsValid?: (tileX: number, tileY: number) => boolean;
    readonly macroHeight?: (tileX: number, tileY: number) => number;
    readonly hydrologyRegions?: readonly TransferableHydrologyRegionSlice[];
    readonly authoredHydrology?: readonly HydrologyFeatureUpsertDelta[];
}

function axisKeys(origin: number, chunkSize: number): number[] {
    const first = Math.floor(origin / chunkSize);
    const last = Math.floor((origin + EFFECTIVE_WINDOW_TILE_SIZE - 1) / chunkSize);
    return first === last ? [first] : [first, last];
}

function emptyHydrologyRegion(
    regionX: number,
    regionY: number,
    topology: TransferableWorldDomain["topology"]
): TransferableHydrologyRegionSlice {
    return Object.freeze({
        key: Object.freeze({ regionX, regionY }),
        topology,
        validBounds: Object.freeze({
            minX: 0 as const,
            minY: 0 as const,
            maxXExclusive: 128,
            maxYExclusive: 128
        }),
        baseRevision: 0,
        suppressedBaseFeatureIds: Object.freeze([]),
        boundaryPorts: Object.freeze([]),
        rivers: Object.freeze([]),
        lakes: Object.freeze([]),
        mouths: Object.freeze([]),
        bodies: Object.freeze([])
    });
}

export function createSurfaceCompilerTestWindow(
    options: Readonly<SurfaceCompilerTestWindowOptions> = {}
): TransferableEffectiveWindow {
    const renderChunkX = options.renderChunkX ?? 0;
    const renderChunkY = options.renderChunkY ?? 0;
    const domain = options.domain ?? Object.freeze({ topology: "infinite" as const });
    const originTileX = renderChunkX * 16 - 2;
    const originTileY = renderChunkY * 16 - 2;
    const tileIsValid = options.tileIsValid ?? (() => true);
    const macroHeightFor = options.macroHeight
        ?? ((tileX: number, tileY: number) => 20_000 + (tileX + 64) * 100 + (tileY + 64) * 10);
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
            const tileX = originTileX + localX;
            const tileY = originTileY + localY;
            if (!tileIsValid(tileX, tileY)) continue;
            const height = macroHeightFor(tileX, tileY);
            if (!Number.isInteger(height) || height < 0 || height > 0xffff) {
                throw new RangeError("test surface macro height must be a uint16 value");
            }
            valid[index] = 1;
            macroHeight[index] = height;
            const first = ((tileX + tileY) & 1) === 0 ? 200 : 50;
            biomeWeights[index * 4] = first;
            biomeWeights[index * 4 + 1] = 255 - first;
        }
    }
    const semantic = axisKeys(originTileX, 32).flatMap(chunkX =>
        axisKeys(originTileY, 32).map(chunkY => ({
            key: { chunkX, chunkY }, baseRevision: 0, deltaRevision: 0
        })));
    const hydrologyRegions = options.hydrologyRegions ?? axisKeys(originTileX, 128).flatMap(regionX =>
        axisKeys(originTileY, 128).map(regionY => emptyHydrologyRegion(regionX, regionY, domain.topology)));
    const authoredHydrology = options.authoredHydrology ?? [];
    const featureDependencies = new Map<string, {
        featureId: string;
        featureKind: "river" | "lake";
        revision: number;
    }>();
    for (const region of hydrologyRegions) {
        for (const featureId of region.suppressedBaseFeatureIds) {
            const delta = authoredHydrology.find(candidate => candidate.featureId === featureId);
            if (!delta) throw new Error("test suppressed feature requires its authored upsert");
            featureDependencies.set(featureId, {
                featureId,
                featureKind: delta.featureKind,
                revision: delta.revision
            });
        }
    }
    for (const delta of authoredHydrology) featureDependencies.set(delta.featureId, {
        featureId: delta.featureId,
        featureKind: delta.featureKind,
        revision: delta.revision
    });
    const effectiveRevision = authoredHydrology.reduce(
        (revision, delta) => Math.max(revision, delta.revision),
        0
    );
    const dependencyKey = createSurfaceDependencyKey({
        worldIdentity: SURFACE_COMPILER_TEST_WORLD_IDENTITY,
        renderKey: { chunkX: renderChunkX, chunkY: renderChunkY },
        metrics: { hexSize: 2, heightScale: 10 },
        semantic,
        hydrologyRegions: hydrologyRegions.map(region => ({ key: region.key, baseRevision: 0 })),
        hydrologyFeatures: [...featureDependencies.values()]
            .sort((first, second) => first.featureId < second.featureId ? -1 : 1)
    });
    return Object.freeze({
        formatVersion: 1 as const,
        worldIdentity: dependencyKey.worldIdentity,
        effectiveRevision,
        seaLevel: options.seaLevel ?? 28_180,
        domain,
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
        hydrologyRegions: Object.freeze(hydrologyRegions),
        authoredHydrology: Object.freeze([...authoredHydrology]),
        dependencyKey
    });
}
