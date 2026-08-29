import { Land } from "../enums";
import { getMapTile } from "../helpers/topology";
import { MapInfo, TileInfo } from "../interfaces";
import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BaseSemanticChunk,
    createBaseSemanticChunk,
    semanticCatalogLimits,
    semanticTileIndex
} from "./BaseSemanticChunk";
import {
    CoreSubstrateClass,
    CoreVegetationProfile,
    assertCoreWorldSemanticsV2
} from "./SemanticCatalogsV2";
import { WORLD_SEMANTIC_CHUNK_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";
import {
    StaticWorldDescriptorV2,
    assertWorldDescriptorV2
} from "./WorldDescriptorV2";

const STATIC_PLAIN_HEIGHT = 32_768;
const STATIC_HILL_HEIGHT = 39_321;
const STATIC_MOUNTAIN_HEIGHT = 52_428;
const STATIC_WOOD_DENSITY = 140;
const ALLOWED_MODIFIERS = new Set(["hill", "wood", "lake", "river"]);
const LAND_TYPES = new Set<string>(Object.values(Land));

export interface CompileStaticSemanticChunkOptions {
    readonly map: MapInfo;
    readonly descriptor: StaticWorldDescriptorV2;
    readonly chunkX: number;
    readonly chunkY: number;
}

function assertStaticInputs(map: MapInfo, descriptor: StaticWorldDescriptorV2): void {
    assertWorldDescriptorV2(descriptor);
    assertCoreWorldSemanticsV2(descriptor);
    if (descriptor.sourceKind !== "static" || descriptor.topology !== "finite") {
        throw new TypeError("static semantic compiler requires a static finite descriptor");
    }
    if (!map || typeof map !== "object" || map.infinite || map.wrapX || map.wrapY
        || map.w !== descriptor.width || map.h !== descriptor.height) {
        throw new TypeError("static MapInfo topology does not match its v2 descriptor");
    }
}

function assertStaticTile(tile: TileInfo, x: number, y: number): void {
    if (!tile || typeof tile !== "object" || !LAND_TYPES.has(tile.type)) {
        throw new TypeError(`static semantic tile ${x},${y} has an invalid terrain type`);
    }
    if (tile.modifiers !== undefined) {
        if (!Array.isArray(tile.modifiers)
            || tile.modifiers.some(modifier => typeof modifier !== "string" || !ALLOWED_MODIFIERS.has(modifier))
            || new Set(tile.modifiers).size !== tile.modifiers.length) {
            throw new TypeError(`static semantic tile ${x},${y} has invalid or duplicate modifiers`);
        }
    }
    if (tile.treeModel !== undefined && typeof tile.treeModel !== "string") {
        throw new TypeError(`static semantic tile ${x},${y} has an invalid tree model identity`);
    }
}

function macroHeightFor(tile: Readonly<TileInfo>, seaLevel: number): number {
    if (tile.type === Land.sea) return Math.max(0, seaLevel - 4_096);
    if (tile.type === Land.coastal) return Math.max(0, seaLevel - 1);
    if (tile.type === Land.mountain) return STATIC_MOUNTAIN_HEIGHT;
    if (tile.modifiers?.includes("hill")) return STATIC_HILL_HEIGHT;
    return STATIC_PLAIN_HEIGHT;
}

function substrateFor(tile: Readonly<TileInfo>): CoreSubstrateClass {
    if (tile.type === Land.mountain) return CoreSubstrateClass.Rock;
    if (tile.type === Land.sand || tile.type === Land.coastal || tile.type === Land.sea) {
        return CoreSubstrateClass.Sand;
    }
    return CoreSubstrateClass.Soil;
}

function vegetationProfileFor(tile: Readonly<TileInfo>): CoreVegetationProfile {
    const model = tile.treeModel?.toLowerCase() ?? "";
    if (tile.type === Land.mountain || tile.type === Land.snow) return CoreVegetationProfile.Alpine;
    if (model.includes("palm") || tile.type === Land.sand) return CoreVegetationProfile.Tropical;
    if (model.includes("pinia") || model.includes("pine") || tile.type === Land.tundra) {
        return CoreVegetationProfile.Boreal;
    }
    return CoreVegetationProfile.Temperate;
}

function writeBiomeAndClimate(
    tile: Readonly<TileInfo>,
    tileIndex: number,
    biomeWeights: Uint8Array,
    climate: Uint8Array
): void {
    const biomeOffset = tileIndex * 4;
    const climateOffset = tileIndex * 2;
    if (tile.type === Land.mountain) {
        biomeWeights[biomeOffset + 3] = 255;
        climate[climateOffset] = 72;
        climate[climateOffset + 1] = 96;
    } else if (tile.type === Land.snow) {
        biomeWeights[biomeOffset + 2] = 180;
        biomeWeights[biomeOffset + 3] = 75;
        climate[climateOffset] = 24;
        climate[climateOffset + 1] = 128;
    } else if (tile.type === Land.tundra) {
        biomeWeights[biomeOffset + 2] = 255;
        climate[climateOffset] = 72;
        climate[climateOffset + 1] = 128;
    } else if (tile.type === Land.sand || tile.type === Land.coastal || tile.type === Land.sea) {
        biomeWeights[biomeOffset + 1] = 255;
        climate[climateOffset] = tile.type === Land.sand ? 224 : 160;
        climate[climateOffset + 1] = tile.type === Land.sand ? 48 : 255;
    } else {
        biomeWeights[biomeOffset] = 255;
        climate[climateOffset] = 152;
        climate[climateOffset + 1] = 152;
    }
}

export function compileStaticSemanticChunk(
    options: Readonly<CompileStaticSemanticChunkOptions>
): BaseSemanticChunk {
    if (!options || typeof options !== "object") throw new TypeError("static semantic compile options are required");
    assertStaticInputs(options.map, options.descriptor);
    const origin = chunkOrigin(options.chunkX, options.chunkY, WORLD_SEMANTIC_CHUNK_SIZE);
    if (origin.x < 0 || origin.y < 0 || origin.x >= options.descriptor.width || origin.y >= options.descriptor.height) {
        throw new RangeError("static semantic chunk key is outside the finite world");
    }
    const validWidth = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, options.descriptor.width - origin.x);
    const validHeight = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, options.descriptor.height - origin.y);
    const substrateClass = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
    const climate = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const vegetationProfile = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    for (let localX = 0; localX < validWidth; localX += 1) {
        for (let localY = 0; localY < validHeight; localY += 1) {
            const worldX = origin.x + localX;
            const worldY = origin.y + localY;
            const tile = getMapTile(options.map, worldX, worldY);
            if (!tile) throw new TypeError(`static semantic map is missing tile ${worldX},${worldY}`);
            assertStaticTile(tile, worldX, worldY);
            const tileIndex = semanticTileIndex(localX, localY);
            substrateClass[tileIndex] = substrateFor(tile);
            macroHeight[tileIndex] = macroHeightFor(tile, options.descriptor.seaLevel);
            writeBiomeAndClimate(tile, tileIndex, biomeWeights, climate);
            vegetationDensity[tileIndex] = tile.modifiers?.includes("wood") ? STATIC_WOOD_DENSITY : 0;
            vegetationProfile[tileIndex] = vegetationProfileFor(tile);
        }
    }
    return createBaseSemanticChunk({
        key: { chunkX: options.chunkX, chunkY: options.chunkY },
        revision: 0,
        validBounds: {
            minX: 0,
            minY: 0,
            maxXExclusive: validWidth,
            maxYExclusive: validHeight
        },
        substrateClass,
        macroHeight,
        biomeWeights,
        climate,
        vegetationDensity,
        vegetationProfile
    }, semanticCatalogLimits(options.descriptor));
}

