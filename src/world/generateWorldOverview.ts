import { Land } from "../enums";
import { getMapTile } from "../helpers/topology";
import { MapInfo, TileInfo } from "../interfaces";
import { assertWorldDescriptor, WorldDescriptor } from "./WorldDescriptor";
import { WorldSurfaceResolver } from "./WorldSurfaceResolver";

export const WORLD_OVERVIEW_FORMAT_VERSION = 1;
export const MAX_WORLD_OVERVIEW_RASTER_SIZE = 256;
export const MAX_WORLD_OVERVIEW_TILE_SPAN = 16_384;

export interface WorldOverviewPreparationOptions {
    originX: number;
    originY: number;
    tileSpanX: number;
    tileSpanY: number;
    pixelWidth: number;
    pixelHeight: number;
}

export interface WorldOverviewGenerationOptions extends WorldOverviewPreparationOptions {
    descriptor: WorldDescriptor;
}

export interface WorldOverviewRaster extends WorldOverviewPreparationOptions {
    version: typeof WORLD_OVERVIEW_FORMAT_VERSION;
    pixels: Uint8ClampedArray;
}

type Rgb = readonly [number, number, number];

const PALETTE = {
    deepWater: [13, 48, 76] as Rgb,
    coast: [70, 139, 137] as Rgb,
    temperate: [91, 139, 73] as Rgb,
    dry: [169, 148, 86] as Rgb,
    cold: [126, 146, 126] as Rgb,
    alpine: [113, 119, 116] as Rgb,
    sand: [188, 166, 102] as Rgb,
    tundra: [151, 166, 157] as Rgb,
    snow: [225, 233, 235] as Rgb,
    mountain: [105, 108, 109] as Rgb,
    lake: [35, 105, 129] as Rgb,
    river: [28, 142, 174] as Rgb
} as const;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function assertSafeExtentCoordinate(name: string, value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

export function assertWorldOverviewPreparationOptions(
    options: WorldOverviewPreparationOptions
): void {
    if (!options || typeof options !== "object") throw new TypeError("world overview options are required");
    assertSafeExtentCoordinate("originX", options.originX);
    assertSafeExtentCoordinate("originY", options.originY);
    for (const [name, value] of [
        ["tileSpanX", options.tileSpanX],
        ["tileSpanY", options.tileSpanY]
    ] as const) {
        if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_WORLD_OVERVIEW_TILE_SPAN) {
            throw new RangeError(`${name} must be an integer between 1 and ${MAX_WORLD_OVERVIEW_TILE_SPAN}`);
        }
    }
    for (const [name, value] of [
        ["pixelWidth", options.pixelWidth],
        ["pixelHeight", options.pixelHeight]
    ] as const) {
        if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_OVERVIEW_RASTER_SIZE) {
            throw new RangeError(`${name} must be an integer between 1 and ${MAX_WORLD_OVERVIEW_RASTER_SIZE}`);
        }
    }
    if (!Number.isSafeInteger(options.originX + options.tileSpanX - 1)
        || !Number.isSafeInteger(options.originY + options.tileSpanY - 1)) {
        throw new RangeError("world overview extent exceeds safe integer coordinates");
    }
}

export function assertWorldOverviewRaster(value: unknown): asserts value is WorldOverviewRaster {
    if (!value || typeof value !== "object") throw new TypeError("world overview raster must be an object");
    const raster = value as Partial<WorldOverviewRaster>;
    if (raster.version !== WORLD_OVERVIEW_FORMAT_VERSION) {
        throw new TypeError(`unsupported world overview format ${String(raster.version)}`);
    }
    assertWorldOverviewPreparationOptions(raster as WorldOverviewPreparationOptions);
    if (!(raster.pixels instanceof Uint8ClampedArray)
        || raster.pixels.length !== raster.pixelWidth! * raster.pixelHeight! * 4) {
        throw new TypeError("world overview pixels are invalid");
    }
}

function mix(first: Rgb, second: Rgb, amount: number): Rgb {
    const t = clamp01(amount);
    return [
        first[0] + (second[0] - first[0]) * t,
        first[1] + (second[1] - first[1]) * t,
        first[2] + (second[2] - first[2]) * t
    ];
}

function shadeRgb(color: Rgb, amount: number): Rgb {
    return [color[0] * amount, color[1] * amount, color[2] * amount];
}

function writePixel(pixels: Uint8ClampedArray, offset: number, color: Rgb): void {
    pixels[offset] = Math.round(color[0]);
    pixels[offset + 1] = Math.round(color[1]);
    pixels[offset + 2] = Math.round(color[2]);
    pixels[offset + 3] = 255;
}

function overviewTileCoordinate(origin: number, span: number, pixel: number, pixels: number): number {
    return origin + Math.min(span - 1, Math.floor((pixel + 0.5) * span / pixels));
}

function staticTileColor(tile: Readonly<TileInfo>): Rgb {
    if (tile.modifiers?.includes("lake")) return PALETTE.lake;
    if (tile.modifiers?.includes("river")) return PALETTE.river;
    if (tile.type === Land.sea) return PALETTE.deepWater;
    if (tile.type === Land.coastal) return PALETTE.coast;
    if (tile.type === Land.sand) return PALETTE.sand;
    if (tile.type === Land.tundra) return PALETTE.tundra;
    if (tile.type === Land.snow) return PALETTE.snow;
    if (tile.type === Land.mountain) return PALETTE.mountain;
    return shadeRgb(PALETTE.temperate, tile.modifiers?.includes("wood") ? 0.78 : 1);
}

function generatedWaterCoverage(
    options: WorldOverviewPreparationOptions,
    resolver: WorldSurfaceResolver
): Uint8Array {
    const coverage = new Uint8Array(options.pixelWidth * options.pixelHeight);
    resolver.visitGeneratedWaterTiles(
        options.originX,
        options.originY,
        options.tileSpanX,
        options.tileSpanY,
        (x, y) => {
            // Overview pixels represent an area, not one center sample. Marking
            // any generated water cell in that footprint preserves waterway
            // courses and carved-basin edges when many hexes collapse into one pixel.
            const px = Math.min(
                options.pixelWidth - 1,
                Math.floor((x - options.originX) * options.pixelWidth / options.tileSpanX)
            );
            const py = Math.min(
                options.pixelHeight - 1,
                Math.floor((y - options.originY) * options.pixelHeight / options.tileSpanY)
            );
            coverage[py * options.pixelWidth + px] = 1;
        }
    );
    return coverage;
}

export function generateWorldOverviewWithResolver(
    options: WorldOverviewGenerationOptions,
    resolver: WorldSurfaceResolver
): WorldOverviewRaster {
    assertWorldOverviewPreparationOptions(options);
    assertWorldDescriptor(options.descriptor);
    const expectedTopology = options.descriptor.topology;
    if (resolver.seed !== options.descriptor.seed || resolver.domain.topology !== expectedTopology
        || (expectedTopology === "toroidal" && (resolver.domain.topology !== "toroidal"
            || resolver.domain.width !== options.descriptor.width
            || resolver.domain.height !== options.descriptor.height))) {
        throw new TypeError("world overview resolver does not match its descriptor");
    }

    const pixels = new Uint8ClampedArray(options.pixelWidth * options.pixelHeight * 4);
    const waterCoverage = generatedWaterCoverage(options, resolver);
    const terrain = resolver.profile.terrain;
    let offset = 0;
    for (let py = 0; py < options.pixelHeight; py += 1) {
        const tileY = overviewTileCoordinate(options.originY, options.tileSpanY, py, options.pixelHeight);
        for (let px = 0; px < options.pixelWidth; px += 1) {
            const tileX = overviewTileCoordinate(options.originX, options.tileSpanX, px, options.pixelWidth);
            const sample = resolver.sampleGenerated(tileX, tileY);
            let color: Rgb;
            if (sample.baseTerrain === Land.sand) {
                color = PALETTE.sand;
            } else if (sample.baseTerrain === Land.tundra) {
                color = PALETTE.tundra;
            } else if (sample.baseTerrain === Land.snow) {
                color = PALETTE.snow;
            } else if (sample.baseTerrain === Land.mountain) {
                color = mix(PALETTE.mountain, PALETTE.snow, sample.biomeWeights.alpine * 0.22);
            } else {
                const weights = sample.biomeWeights;
                const dryCold = mix(PALETTE.dry, PALETTE.cold, weights.cold / Math.max(0.001, weights.dry + weights.cold));
                const nonTemperate = mix(dryCold, PALETTE.alpine, weights.alpine);
                color = mix(nonTemperate, PALETTE.temperate, weights.temperate);
            }
            const reliefShade = 0.88
                + clamp01((sample.landform.elevation - terrain.seaLevel) * 1.7) * 0.18
                - sample.vegetationDensity * 0.13
                - sample.landform.valley * 0.035;
            const pixelIndex = py * options.pixelWidth + px;
            if (waterCoverage[pixelIndex]) {
                const resolved = resolver.resolveGeneratedTile(tileX, tileY);
                color = resolved.type === Land.sea
                    ? PALETTE.deepWater
                    : resolved.type === Land.coastal
                        ? PALETTE.coast
                        : PALETTE.river;
            } else {
                color = shadeRgb(color, reliefShade);
            }
            writePixel(pixels, offset, color);
            offset += 4;
        }
    }
    return {
        version: WORLD_OVERVIEW_FORMAT_VERSION,
        originX: options.originX,
        originY: options.originY,
        tileSpanX: options.tileSpanX,
        tileSpanY: options.tileSpanY,
        pixelWidth: options.pixelWidth,
        pixelHeight: options.pixelHeight,
        pixels
    };
}

export function generateStaticWorldOverview(
    map: MapInfo,
    options: WorldOverviewPreparationOptions
): WorldOverviewRaster {
    assertWorldOverviewPreparationOptions(options);
    const pixels = new Uint8ClampedArray(options.pixelWidth * options.pixelHeight * 4);
    let offset = 0;
    for (let py = 0; py < options.pixelHeight; py += 1) {
        const tileY = overviewTileCoordinate(options.originY, options.tileSpanY, py, options.pixelHeight);
        for (let px = 0; px < options.pixelWidth; px += 1) {
            const tileX = overviewTileCoordinate(options.originX, options.tileSpanX, px, options.pixelWidth);
            const tile = getMapTile(map, tileX, tileY);
            if (tile) writePixel(pixels, offset, staticTileColor(tile));
            offset += 4;
        }
    }
    return {
        version: WORLD_OVERVIEW_FORMAT_VERSION,
        ...options,
        pixels
    };
}

export function worldOverviewTransferables(overview: WorldOverviewRaster): Transferable[] {
    assertWorldOverviewRaster(overview);
    return [overview.pixels.buffer];
}
