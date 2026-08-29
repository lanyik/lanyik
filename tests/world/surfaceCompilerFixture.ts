import { createSurfaceDependencyKey } from "../../src/world/SurfaceDependencyKey";
import {
    EFFECTIVE_WINDOW_TILE_COUNT,
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow,
    TransferableHydrologyRegionSlice
} from "../../src/world/TransferableEffectiveWindow";

interface SurfaceCompilerTestWindowOptions {
    readonly renderChunkX?: number;
    readonly renderChunkY?: number;
    readonly seaLevel?: number;
    readonly tileIsValid?: (tileX: number, tileY: number) => boolean;
    readonly macroHeight?: (tileX: number, tileY: number) => number;
}

function axisKeys(origin: number, chunkSize: number): number[] {
    const first = Math.floor(origin / chunkSize);
    const last = Math.floor((origin + EFFECTIVE_WINDOW_TILE_SIZE - 1) / chunkSize);
    return first === last ? [first] : [first, last];
}

function emptyHydrologyRegion(regionX: number, regionY: number): TransferableHydrologyRegionSlice {
    return Object.freeze({
        key: Object.freeze({ regionX, regionY }),
        topology: "infinite" as const,
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
    const hydrologyRegions = axisKeys(originTileX, 128).flatMap(regionX =>
        axisKeys(originTileY, 128).map(regionY => emptyHydrologyRegion(regionX, regionY)));
    const dependencyKey = createSurfaceDependencyKey({
        worldIdentity: "world:surface-compiler-test",
        renderKey: { chunkX: renderChunkX, chunkY: renderChunkY },
        metrics: { hexSize: 2, heightScale: 10 },
        semantic,
        hydrologyRegions: hydrologyRegions.map(region => ({ key: region.key, baseRevision: 0 })),
        hydrologyFeatures: []
    });
    return Object.freeze({
        formatVersion: 1 as const,
        worldIdentity: dependencyKey.worldIdentity,
        effectiveRevision: 0,
        seaLevel: options.seaLevel ?? 28_180,
        domain: Object.freeze({ topology: "infinite" as const }),
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
        authoredHydrology: Object.freeze([]),
        dependencyKey
    });
}
