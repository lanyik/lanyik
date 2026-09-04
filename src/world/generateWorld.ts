import { MapInfo, MapInfoData, TileInfo } from "../interfaces";
import { createWorldSurfaceResolver, WorldSurfaceResolver } from "./WorldSurfaceResolver";
import { WorldWaterGenerationStyle } from "./WorldStyleProfile";

export const MIN_WORLD_SIZE = 8;
export const MAX_WORLD_SIZE = 512;

export interface WorldGenerationOptions {
    seed: string | number;
    width: number;
    height: number;
    topology?: WorldTopology;
    waterStyle?: Readonly<WorldWaterGenerationStyle>;
}

export type WorldTopology = "bounded" | "toroidal";

function assertDimension(name: "width" | "height", value: number): void {
    if (!Number.isInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
        throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
    }
}

function cloneGeneratedTile(tile: Readonly<TileInfo>): TileInfo {
    return {
        ...tile,
        modifiers: tile.modifiers ? [...tile.modifiers] : undefined,
        rivers: tile.rivers?.map(river => ({ ...river })),
        city: tile.city ? { ...tile.city } : undefined
    };
}

// Generates one canonical cell of a finite toroidal world without requiring
// the other width*height TileInfo objects to exist. Chunk workers use the same
// function as eager generation, which keeps both APIs byte-for-byte equivalent.
export function generateToroidalWorldTile(
    seed: string | number,
    x: number,
    y: number,
    width: number,
    height: number,
    resolver: WorldSurfaceResolver = createWorldSurfaceResolver({
        seed,
        domain: { topology: "toroidal", width, height }
    })
): TileInfo {
    if (resolver.domain.topology !== "toroidal"
        || resolver.domain.width !== width || resolver.domain.height !== height
        || resolver.seed !== String(seed)) {
        throw new TypeError("toroidal resolver does not match the requested world");
    }
    return cloneGeneratedTile(resolver.resolveGeneratedTile(x, y));
}

export function generateWorld({
    seed,
    width,
    height,
    topology = "bounded",
    waterStyle
}: WorldGenerationOptions): MapInfo {
    assertDimension("width", width);
    assertDimension("height", height);
    if (topology !== "bounded" && topology !== "toroidal") {
        throw new RangeError('topology must be either "bounded" or "toroidal"');
    }
    if (topology === "toroidal" && width % 2 !== 0) {
        throw new RangeError("toroidal worlds require an even width");
    }

    const data: MapInfoData = {};
    const toroidal = topology === "toroidal";
    const resolver = createWorldSurfaceResolver({
        seed,
        waterStyle,
        domain: toroidal
            ? { topology: "toroidal", width, height }
            : { topology: "bounded", width, height }
    });

    // A bounded window per generation block deduplicates the one-ring coast
    // samples without retaining a second width*height world representation.
    const windowSize = 24;
    for (let startX = 0; startX < width; startX += windowSize) {
        for (let startY = 0; startY < height; startY += windowSize) {
            const window = resolver.createWindow();
            const endX = Math.min(width, startX + windowSize);
            const endY = Math.min(height, startY + windowSize);
            for (let x = startX; x < endX; x += 1) {
                data[x] ??= {};
                for (let y = startY; y < endY; y += 1) {
                    data[x][y] = cloneGeneratedTile(window.resolveGeneratedTile(x, y));
                }
            }
            window.clear();
        }
    }

    return { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };
}
