import { Land } from "../enums";
import { getNeighbors } from "../helpers/neighbors";
import { getMapNeighbors } from "../helpers/topology";
import { MapInfo, MapInfoData, TileInfo } from "../interfaces";
import {
    createLandformSampler,
    LANDFORM_SEA_LEVEL,
    LandformSample,
    LandformSampler
} from "./LandformSampler";
import { randomAt, seedToUint32 } from "./noise";

export const MIN_WORLD_SIZE = 8;
export const MAX_WORLD_SIZE = 512;

export interface WorldGenerationOptions {
    seed: string | number;
    width: number;
    height: number;
    topology?: WorldTopology;
}

export type WorldTopology = "bounded" | "toroidal";

const isWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;

function assertDimension(name: "width" | "height", value: number): void {
    if (!Number.isInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
        throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
    }
}

function classifyTerrain({ elevation, ridge, moisture, temperature }: LandformSample): Land {
    if (elevation < LANDFORM_SEA_LEVEL) return Land.sea;
    //A high point becomes a mountain only when it belongs to the continuous
    //ridge field. Very high isolated samples remain mountains as a safety net,
    //but the common case now forms chains instead of scattered single peaks.
    if ((elevation > 0.7 && ridge > 0.2) || elevation > 0.82) return Land.mountain;
    if (temperature < 0.18) return Land.snow;
    if (temperature < 0.34) return Land.tundra;
    if (temperature > 0.68 && moisture < 0.42) return Land.sand;
    return Land.land;
}

function decorateTile(seed: number, x: number, y: number, climate: LandformSample, type: Land): TileInfo {
    const tile: TileInfo = { type };
    if (isWater(type) || type === Land.mountain || type === Land.snow) return tile;

    const modifiers: string[] = [];
    const lake = type === Land.land
        && climate.elevation > LANDFORM_SEA_LEVEL + 0.025
        && climate.elevation < 0.56
        && climate.moisture > 0.74
        && randomAt(seed, x, y, 0x6c8e9cf5) > 0.94;

    if (lake) {
        modifiers.push("lake");
    } else {
        if (climate.elevation > 0.62) modifiers.push("hill");
        const forestChance = Math.max(0, Math.min(0.58, (climate.moisture - 0.48) * 1.5));
        if (randomAt(seed, x, y, 0x27d4eb2f) < forestChance) {
            modifiers.push("wood");
            tile.treeModel = climate.temperature > 0.67
                ? "Assets/models/palm"
                : climate.temperature < 0.4
                    ? "Assets/models/pinia"
                    : "Assets/models/oak";
        }
    }

    if (modifiers.length > 0) tile.modifiers = modifiers;
    return tile;
}

const modulo = (value: number, period: number): number => ((value % period) + period) % period;

// Generates one canonical cell of a finite toroidal world without requiring
// the other width*height TileInfo objects to exist. Chunk workers use the same
// function as eager generation, which keeps both APIs byte-for-byte equivalent.
export function generateToroidalWorldTile(
    seed: string | number,
    x: number,
    y: number,
    width: number,
    height: number,
    sampler = createLandformSampler({
        seed,
        domain: { topology: "toroidal", width, height }
    })
): TileInfo {
    const numericSeed = seedToUint32(seed);
    const canonicalX = modulo(x, width);
    const canonicalY = modulo(y, height);
    const climate = sampler.sample(canonicalX, canonicalY);
    let type = classifyTerrain(climate);
    if (type === Land.sea) {
        const touchesLand = getNeighbors(canonicalX, canonicalY).some(neighbor => {
            const nx = modulo(neighbor.x, width);
            const ny = modulo(neighbor.y, height);
            return !isWater(classifyTerrain(sampler.sample(nx, ny)));
        });
        if (touchesLand) type = Land.coastal;
    }
    return decorateTile(numericSeed, canonicalX, canonicalY, climate, type);
}

export function generateWorld({ seed, width, height, topology = "bounded" }: WorldGenerationOptions): MapInfo {
    assertDimension("width", width);
    assertDimension("height", height);
    if (topology !== "bounded" && topology !== "toroidal") {
        throw new RangeError('topology must be either "bounded" or "toroidal"');
    }
    if (topology === "toroidal" && width % 2 !== 0) {
        throw new RangeError("toroidal worlds require an even width");
    }

    const numericSeed = seedToUint32(seed);
    const data: MapInfoData = {};
    const toroidal = topology === "toroidal";
    const sampler: LandformSampler = createLandformSampler({
        seed,
        domain: toroidal
            ? { topology: "toroidal", width, height }
            : { topology: "bounded", width, height }
    });

    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) {
            if (toroidal) {
                data[x][y] = generateToroidalWorldTile(seed, x, y, width, height, sampler);
                continue;
            }
            const climate = sampler.sample(x, y);
            data[x][y] = decorateTile(numericSeed, x, y, climate, classifyTerrain(climate));
        }
    }

    const world: MapInfo = { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };

    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1) {
            const tile = data[x][y];
            if (toroidal || tile.type !== Land.sea) continue;
            const touchesLand = getMapNeighbors(world, x, y).some(({ x: nx, y: ny }) => {
                const neighbor = data[nx]?.[ny];
                return neighbor !== undefined && !isWater(neighbor.type);
            });
            if (touchesLand) tile.type = Land.coastal;
        }
    }

    return world;
}
