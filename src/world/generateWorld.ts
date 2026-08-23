import { Land } from "../enums";
import { getMapNeighbors } from "../helpers/topology";
import { MapInfo, MapInfoData, TileInfo } from "../interfaces";
import { fractalNoise2D, periodicFractalNoise2D, randomAt, seedToUint32 } from "./noise";

export const MIN_WORLD_SIZE = 8;
export const MAX_WORLD_SIZE = 512;

export interface WorldGenerationOptions {
    seed: string | number;
    width: number;
    height: number;
    topology?: WorldTopology;
}

export type WorldTopology = "bounded" | "toroidal";

interface ClimateSample {
    elevation: number;
    moisture: number;
    temperature: number;
}

const SEA_LEVEL = 0.43;
const isWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;

function assertDimension(name: "width" | "height", value: number): void {
    if (!Number.isInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
        throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
    }
}

function sampleBoundedClimate(seed: number, x: number, y: number, width: number, height: number): ClimateSample {
    const nx = width === 1 ? 0 : (x / (width - 1)) * 2 - 1;
    const ny = height === 1 ? 0 : (y / (height - 1)) * 2 - 1;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    const continent = fractalNoise2D(seed, x * 0.055, y * 0.055, 5);
    const detail = fractalNoise2D(seed ^ 0xa341316c, x * 0.14, y * 0.14, 3);
    const elevation = continent * 0.78 + detail * 0.22 + 0.12 - Math.pow(edge, 3) * 0.58;
    const moisture = fractalNoise2D(seed ^ 0xc8013ea4, x * 0.08, y * 0.08, 4);
    const temperatureNoise = fractalNoise2D(seed ^ 0xad90777d, x * 0.07, y * 0.07, 3);
    const latitude = Math.abs(ny);
    const temperature = 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8 + (temperatureNoise - 0.5) * 0.18;
    return { elevation, moisture, temperature };
}

function sampleToroidalClimate(seed: number, x: number, y: number, width: number, height: number): ClimateSample {
    const nx = x / width;
    const ny = y / height;
    const cells = (scale: number, dimension: number, minimum: number) => Math.max(minimum, Math.round(dimension * scale));
    const continent = periodicFractalNoise2D(
        seed,
        nx,
        ny,
        cells(0.055, width, 2),
        cells(0.055, height, 2),
        5
    );
    const detail = periodicFractalNoise2D(
        seed ^ 0xa341316c,
        nx,
        ny,
        cells(0.14, width, 3),
        cells(0.14, height, 3),
        3
    );
    //No edge falloff: the height field joins itself on all four sides.
    const elevation = continent * 0.78 + detail * 0.22 + 0.03;
    const moisture = periodicFractalNoise2D(
        seed ^ 0xc8013ea4,
        nx,
        ny,
        cells(0.08, width, 2),
        cells(0.08, height, 2),
        4
    );
    const temperatureNoise = periodicFractalNoise2D(
        seed ^ 0xad90777d,
        nx,
        ny,
        cells(0.07, width, 2),
        cells(0.07, height, 2),
        3
    );
    //A periodic climate band keeps the top/bottom seam continuous: the cold
    //band straddles the seam and the warm equator runs through the middle.
    const latitude = 0.5 + 0.5 * Math.cos(ny * Math.PI * 2);
    const temperature = 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8 + (temperatureNoise - 0.5) * 0.18;
    return { elevation, moisture, temperature };
}

function classifyTerrain({ elevation, moisture, temperature }: ClimateSample): Land {
    if (elevation < SEA_LEVEL) return Land.sea;
    if (elevation > 0.75) return Land.mountain;
    if (temperature < 0.18) return Land.snow;
    if (temperature < 0.34) return Land.tundra;
    if (temperature > 0.68 && moisture < 0.42) return Land.sand;
    return Land.land;
}

function decorateTile(seed: number, x: number, y: number, climate: ClimateSample, type: Land): TileInfo {
    const tile: TileInfo = { type };
    if (isWater(type) || type === Land.mountain || type === Land.snow) return tile;

    const modifiers: string[] = [];
    const lake = type === Land.land
        && climate.elevation > SEA_LEVEL + 0.025
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

export function generateWorld({ seed, width, height, topology = "bounded" }: WorldGenerationOptions): MapInfo {
    assertDimension("width", width);
    assertDimension("height", height);
    if (topology === "toroidal" && width % 2 !== 0) {
        throw new RangeError("toroidal worlds require an even width");
    }

    const numericSeed = seedToUint32(seed);
    const data: MapInfoData = {};
    const toroidal = topology === "toroidal";

    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) {
            const climate = toroidal
                ? sampleToroidalClimate(numericSeed, x, y, width, height)
                : sampleBoundedClimate(numericSeed, x, y, width, height);
            const type = classifyTerrain(climate);
            data[x][y] = decorateTile(numericSeed, x, y, climate, type);
        }
    }

    const world: MapInfo = { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };

    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1) {
            const tile = data[x][y];
            if (tile.type !== Land.sea) continue;
            const touchesLand = getMapNeighbors(world, x, y).some(({ x: nx, y: ny }) => {
                const neighbor = data[nx]?.[ny];
                return neighbor !== undefined && !isWater(neighbor.type);
            });
            if (touchesLand) tile.type = Land.coastal;
        }
    }

    return world;
}
