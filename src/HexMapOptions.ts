import { ColorRepresentation } from "three";

import { Land, LandColor } from "./enums";
import type { Point } from "./interfaces";
import type { LandformDebugMode } from "./objects/TerrainMesh";
import type { WorldSource } from "./world/WorldSource";

export interface HexMapOptions {
    /** CSS selector for the canvas owned by this map. */
    element: string;
    /** Hex radius in world units. Defaults to 40. */
    size?: number;
    /** Device-pixel-ratio ceiling. Defaults to 2. */
    maxPixelRatio?: number;
    /** Minimum camera-to-target distance in world units. Defaults to 100. */
    cameraMinDistance?: number;
    /** Maximum camera-to-target distance. Defaults to 800; world loading starts at the range midpoint. */
    cameraMaxDistance?: number;
    antialias?: boolean;
    terrainShaderQuality?: "full" | "fast";
    skyVisible?: boolean;
    /** Folder containing terrain assets and land-atlas.json. */
    texturesBaseUrl?: string;
    gridVisible?: boolean;
    gridColor?: ColorRepresentation;
    gridWidth?: number;
    gridOpacity?: number;
    selectorColor?: ColorRepresentation;
    pointerColor?: ColorRepresentation;
    /** Average near-LOD candidates per hex area, before spacing/biome limits. Defaults to 12. */
    treesPerTile?: number;

    // Animated sea/coast surface. waterDepth defaults to size * 0.25.
    waterColorShallow?: ColorRepresentation;
    waterColorDeep?: ColorRepresentation;
    waterWaveAmplitude?: number;
    waterWaveFrequency?: number;
    waterWaveSpeed?: number;
    waterSparkleIntensity?: number;
    waterFresnelIntensity?: number;
    coastalWavesEnabled?: boolean;
    coastalWaveColor?: ColorRepresentation;
    coastalWaveCount?: number;
    coastalWaveSpeed?: number;
    coastalWaveWidth?: number;
    coastalWaveRange?: number;
    coastalWaveDistortion?: number;
    coastalWaveOpacity?: number;
    waterDepth?: number;
    beachWidth?: number;

    // Organic land/coast transition controls; normalized values are [0, 1].
    landBlendWidth?: number;
    landBlendEnabled?: boolean;
    waterCornerRounding?: number;
    coastCurvature?: number;
    landBlendCurvature?: number;
    /** World-space vertical scale for generated relief. Defaults to 80. */
    mountainHeight?: number;
    landformDebugMode?: LandformDebugMode;
    /** Atlas texture detail span in hex rows/columns. Defaults to 2. */
    terrainTextureRegionSize?: number;

    // Rivers and lakes use normalized width/curvature controls. River colours
    // inherit the corresponding sea colours when omitted.
    riverWidth?: number;
    riverBankWidth?: number;
    riverCurvature?: number;
    riverColorShallow?: ColorRepresentation;
    riverColorDeep?: ColorRepresentation;
    riverBankColor?: ColorRepresentation;
    riverFlowSpeed?: number;
    riverDepth?: number;
    lakeShoreWidth?: number;

    // Model values are folder paths containing model.glb and info.json. Tree
    // metadata also declares forestLods.middle/far and forestAlbedoScale.
    treeModel?: string;
    /** Model size multiplier (default 1.6); also increases minimum trunk spacing. */
    treeScale?: number;
    cityModel?: string;
    cityScale?: number;

    // Decorative grass. Size-derived width/height defaults follow hex size.
    grassEnabled?: boolean;
    /** Average grass candidates per hex area, before water/shore clearance. */
    grassDensity?: number;
    grassBladeWidth?: number;
    grassBladeHeight?: number;
    grassWindStrength?: number;
    grassWindSpeed?: number;

    // Fog is opt-in at runtime; every tile starts visible.
    fogTexture?: string;
    fogDarkenFactor?: number;
    fogTextureSize?: number;

    // Streaming and LOD. Count ceilings remain compatibility safeguards;
    // byte ceilings are the authoritative inactive-resource budgets.
    renderDistance?: number;
    /** Atmospheric blend starts at this camera-depth distance. Derived from renderDistance by default. */
    horizonFogStart?: number;
    /** Atmospheric blend is fully opaque before the hard render-distance cut. */
    horizonFogEnd?: number;
    /** Shared horizon/clear color used by terrain, vegetation and standard Three.js materials. */
    horizonFogColor?: ColorRepresentation;
    lodEnabled?: boolean;
    lodNearDistance?: number;
    lodFarDistance?: number;
    vegetationRenderDistance?: number;
    chunkLodHysteresis?: number;
    gpuChunkCacheSize?: number;
    cpuChunkCacheSize?: number;
    /** GPU byte budget. Defaults to 256 MiB. */
    gpuChunkCacheBytes?: number;
    /** CPU byte budget. Defaults to 384 MiB. */
    cpuChunkCacheBytes?: number;
    /** Decoded model LRU budget across CPU and estimated GPU copies. Defaults to 64 MiB. */
    modelAssetCacheBytes?: number;
    /** Maximum cooperative drain time for a replaced world. Defaults to 15s. */
    worldSessionDrainTimeoutMs?: number;
}

export interface WorldLoadOptions {
    source: WorldSource;
    initialTile?: Point;
    /** Radius that must be loaded around the camera. */
    loadRadius?: number;
    /** Larger radius retained to absorb camera movement. */
    retentionRadius?: number;
    maxResidentChunks?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    frameBudgetMs?: number;
    maxMountsPerFrame?: number;
    /** Seconds of camera velocity used for speculative demand. */
    predictionSeconds?: number;
    predictionMaxChunks?: number;
    floatingOriginThreshold?: number;
    adaptiveStreaming?: boolean;
    targetFrameMs?: number;
    adaptiveMinWorkerCount?: number;
    adaptiveDegradeFrames?: number;
    adaptiveRecoverFrames?: number;
    adaptiveCooldownFrames?: number;
}

export type ResolvedHexMapOptions = Required<Omit<
    HexMapOptions,
    | "element"
    | "waterDepth"
    | "fogTextureSize"
    | "riverColorShallow"
    | "riverColorDeep"
    | "riverDepth"
    | "horizonFogStart"
    | "horizonFogEnd"
>> & {
    element: string;
    waterDepth: number;
    fogTextureSize: number;
    riverColorShallow: ColorRepresentation;
    riverColorDeep: ColorRepresentation;
    riverDepth: number;
    horizonFogStart: number;
    horizonFogEnd: number;
};

// Derived defaults (water depth, fog scale, horizon band, river colours/depth)
// are resolved in resolveHexMapOptions because they depend on caller values.
export const DEFAULT_HEX_MAP_OPTIONS: Readonly<Omit<ResolvedHexMapOptions,
    | "element"
    | "waterDepth"
    | "fogTextureSize"
    | "riverColorShallow"
    | "riverColorDeep"
    | "riverDepth"
    | "horizonFogStart"
    | "horizonFogEnd"
>> = {
    size: 40,
    maxPixelRatio: 2,
    cameraMinDistance: 100,
    cameraMaxDistance: 800,
    antialias: true,
    terrainShaderQuality: "full",
    skyVisible: true,
    texturesBaseUrl: "textures/",
    gridVisible: false,
    gridColor: 0x42322b,
    gridWidth: 0.04,
    gridOpacity: 0.35,
    selectorColor: 0xffff00,
    pointerColor: 0xeeeeee,
    treesPerTile: 12,
    waterColorShallow: LandColor[Land.coastal],
    waterColorDeep: LandColor[Land.sea],
    waterWaveAmplitude: 1.6,
    waterWaveFrequency: 1,
    waterWaveSpeed: 1,
    waterSparkleIntensity: 1,
    waterFresnelIntensity: 1,
    coastalWavesEnabled: true,
    coastalWaveColor: 0xffffff,
    coastalWaveCount: 3,
    coastalWaveSpeed: 0.6,
    coastalWaveWidth: 0.3,
    coastalWaveRange: 0.8,
    coastalWaveDistortion: 0.5,
    coastalWaveOpacity: 0.85,
    beachWidth: 0.35,
    landBlendWidth: 0.5,
    landBlendEnabled: true,
    waterCornerRounding: 0.4,
    coastCurvature: 0.5,
    landBlendCurvature: 0.5,
    mountainHeight: 80,
    landformDebugMode: "off",
    terrainTextureRegionSize: 2,
    riverWidth: 0.28,
    riverBankWidth: 0.14,
    riverCurvature: 0.5,
    riverBankColor: 0xa8bf6a,
    riverFlowSpeed: 1,
    lakeShoreWidth: 0.18,
    treeModel: "Assets/models/pinia",
    treeScale: 1.6,
    cityModel: "Assets/models/monument",
    cityScale: 1,
    grassEnabled: true,
    grassDensity: 60,
    grassBladeWidth: 1.2,
    grassBladeHeight: 7.2,
    grassWindStrength: 2.5,
    grassWindSpeed: 1.2,
    fogTexture: "war-fog.jpg",
    fogDarkenFactor: 0.45,
    renderDistance: 2850,
    horizonFogColor: 0xe8f0f2,
    lodEnabled: true,
    lodNearDistance: 900,
    lodFarDistance: 1650,
    vegetationRenderDistance: 1450,
    chunkLodHysteresis: 120,
    gpuChunkCacheSize: 128,
    cpuChunkCacheSize: 192,
    gpuChunkCacheBytes: 256 * 1024 * 1024,
    cpuChunkCacheBytes: 384 * 1024 * 1024,
    modelAssetCacheBytes: 64 * 1024 * 1024,
    worldSessionDrainTimeoutMs: 15_000
};

export function resolveHexMapOptions(options: HexMapOptions): ResolvedHexMapOptions {
    if (!options || typeof options !== "object") throw new TypeError("HexMap options are required");
    const size = options.size ?? DEFAULT_HEX_MAP_OPTIONS.size;
    const grassBladeHeight = options.grassBladeHeight ?? size * 0.18;
    const waterDepth = options.waterDepth ?? size * 0.25;
    const renderDistance = options.renderDistance ?? DEFAULT_HEX_MAP_OPTIONS.renderDistance;
    const resolved: ResolvedHexMapOptions = {
        ...DEFAULT_HEX_MAP_OPTIONS,
        ...options,
        renderDistance,
        waterDepth,
        fogTextureSize: options.fogTextureSize ?? size * 8,
        riverColorShallow: options.riverColorShallow
            ?? options.waterColorShallow
            ?? DEFAULT_HEX_MAP_OPTIONS.waterColorShallow,
        riverColorDeep: options.riverColorDeep
            ?? options.waterColorDeep
            ?? DEFAULT_HEX_MAP_OPTIONS.waterColorDeep,
        riverDepth: options.riverDepth ?? waterDepth * 0.6,
        mountainHeight: options.mountainHeight ?? DEFAULT_HEX_MAP_OPTIONS.mountainHeight,
        grassBladeWidth: options.grassBladeWidth ?? size * 0.03,
        grassBladeHeight,
        grassWindStrength: options.grassWindStrength ?? grassBladeHeight * 0.35,
        horizonFogStart: options.horizonFogStart ?? renderDistance * 0.78,
        horizonFogEnd: options.horizonFogEnd ?? renderDistance * 0.95
    };
    validateHexMapOptions(resolved);
    return resolved;
}

export function validateHexMapOptions(options: ResolvedHexMapOptions): void {
    if (typeof options.element !== "string" || options.element.trim().length === 0) {
        throw new TypeError("HexMap element must be a non-empty CSS selector");
    }
    if (!["off", "elevation", "ridge", "valley", "roughness"].includes(options.landformDebugMode)) {
        throw new RangeError("landformDebugMode is invalid");
    }
    const positive = (name: string, value: number): void => {
        if (!Number.isFinite(value) || value <= 0) {
            throw new RangeError(`${name} must be a positive finite number`);
        }
    };
    const nonNegativeSafeInteger = (name: string, value: number): void => {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new RangeError(`${name} must be a non-negative safe integer`);
        }
    };
    positive("size", options.size);
    positive("terrainTextureRegionSize", options.terrainTextureRegionSize);
    positive("renderDistance", options.renderDistance);
    if (!Number.isFinite(options.horizonFogStart) || options.horizonFogStart < 0) {
        throw new RangeError("horizonFogStart must be a non-negative finite number");
    }
    if (!Number.isFinite(options.horizonFogEnd)
        || options.horizonFogEnd <= options.horizonFogStart
        || options.horizonFogEnd > options.renderDistance) {
        throw new RangeError("horizonFogEnd must be finite, greater than horizonFogStart, and <= renderDistance");
    }
    positive("maxPixelRatio", options.maxPixelRatio);
    positive("cameraMinDistance", options.cameraMinDistance);
    positive("cameraMaxDistance", options.cameraMaxDistance);
    if (options.cameraMaxDistance < options.cameraMinDistance) {
        throw new RangeError("cameraMaxDistance must be >= cameraMinDistance");
    }
    if (options.terrainShaderQuality !== "full" && options.terrainShaderQuality !== "fast") {
        throw new RangeError('terrainShaderQuality must be "full" or "fast"');
    }
    if (options.lodNearDistance < 0 || options.lodFarDistance < options.lodNearDistance) {
        throw new RangeError("LOD distances must be non-negative and lodFarDistance must be >= lodNearDistance");
    }
    if (options.vegetationRenderDistance < 0 || options.chunkLodHysteresis < 0) {
        throw new RangeError("vegetationRenderDistance and chunkLodHysteresis must be non-negative");
    }
    nonNegativeSafeInteger("gpuChunkCacheSize", options.gpuChunkCacheSize);
    nonNegativeSafeInteger("cpuChunkCacheSize", options.cpuChunkCacheSize);
    nonNegativeSafeInteger("gpuChunkCacheBytes", options.gpuChunkCacheBytes);
    nonNegativeSafeInteger("cpuChunkCacheBytes", options.cpuChunkCacheBytes);
    nonNegativeSafeInteger("modelAssetCacheBytes", options.modelAssetCacheBytes);
    positive("worldSessionDrainTimeoutMs", options.worldSessionDrainTimeoutMs);
    nonNegativeSafeInteger("treesPerTile", options.treesPerTile);
    nonNegativeSafeInteger("grassDensity", options.grassDensity);
    positive("grassBladeWidth", options.grassBladeWidth);
    positive("grassBladeHeight", options.grassBladeHeight);
    if (!Number.isFinite(options.treeScale) || options.treeScale < 0) {
        throw new RangeError("treeScale must be a non-negative finite number");
    }
    for (const [name, value] of [
        ["waterCornerRounding", options.waterCornerRounding],
        ["coastCurvature", options.coastCurvature],
        ["landBlendCurvature", options.landBlendCurvature],
        ["coastalWaveWidth", options.coastalWaveWidth],
        ["coastalWaveRange", options.coastalWaveRange],
        ["coastalWaveDistortion", options.coastalWaveDistortion],
        ["coastalWaveOpacity", options.coastalWaveOpacity],
        ["riverCurvature", options.riverCurvature],
        ["lakeShoreWidth", options.lakeShoreWidth]
    ] as const) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new RangeError(`${name} must be a finite number between 0 and 1`);
        }
    }
}
