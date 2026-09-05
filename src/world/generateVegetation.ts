import { Land } from "../enums";
import { CoastClearanceOptions, isInCoastalShore, isInLakeShore } from "../helpers/coast";
import {
    getWorldChunkOrigin,
    groupTilesByWorldChunk,
    WorldChunkLod
} from "../helpers/chunks";
import { getHexCenter } from "../helpers/helpers";
import {
    isInTileWater,
    isLakeTile,
    lakeNeighborEdgeValue,
    riverLakeMouthEdgeValue,
    riverSeaMouthEdgeValue,
    WaterClearanceOptions,
    waterEdgeValue
} from "../helpers/rivers";
import { getMapNeighbors, getMapTile } from "../helpers/topology";
import { MapInfo, MapInfoData, Point, TileInfo } from "../interfaces";

import { VegetationSampling, vegetationRandom as stableRandom } from "./VegetationSampling";

export const WORLD_VEGETATION_FORMAT_VERSION = 1;

export interface WorldVegetationMapSnapshot {
    data: MapInfoData;
    w: number;
    h: number;
    wrapX?: boolean;
    wrapY?: boolean;
    infinite?: boolean;
}

export interface WorldVegetationGenerationOptions {
    map: WorldVegetationMapSnapshot;
    points: readonly Point[];
    size: number;
    grassDensity: number;
    grassBladeWidth: number;
    grassBladeHeight: number;
    grassHeightVariation?: number;
    treesPerTile: number;
    treeScale: number;
    treeModel: string;
    riverWidth: number;
    riverBankWidth: number;
    riverCurvature: number;
    lakeShoreWidth: number;
    beachWidth: number;
    waterCornerRounding: number;
    coastCurvature: number;
}

export interface WorldVegetationGrassLodLayout {
    lod: WorldChunkLod;
    instanceCount: number;
    tiles: Point[];
    ranges: Uint32Array;
    offsets: Float32Array;
    tileOffsets: Float32Array;
    angles: Float32Array;
    scales: Float32Array;
    phases: Float32Array;
    shades: Float32Array;
}

export interface WorldVegetationGrassChunkLayout {
    chunkKey: string;
    lods: WorldVegetationGrassLodLayout[];
}

export interface WorldVegetationForestLodLayout {
    lod: WorldChunkLod;
    instanceCount: number;
    tiles: Point[];
    ranges: Uint32Array;
    matrices: Float32Array;
}

export interface WorldVegetationForestChunkLayout {
    chunkKey: string;
    modelPath: string;
    lods: WorldVegetationForestLodLayout[];
}

export interface WorldVegetationLayout {
    version: typeof WORLD_VEGETATION_FORMAT_VERSION;
    grass: WorldVegetationGrassChunkLayout[];
    forest: WorldVegetationForestChunkLayout[];
}

const LODS: readonly WorldChunkLod[] = [0, 1, 2];
const GRASS_DENSITY = [1, 0.38, 0.14] as const;
const FOREST_DENSITY = [1, 0.5, 0.2] as const;

function cloneTile(tile: TileInfo): TileInfo {
    return {
        ...tile,
        modifiers: tile.modifiers?.slice(),
        rivers: tile.rivers?.map(river => ({ ...river })),
        city: tile.city ? { ...tile.city } : undefined
    };
}

//Only the core tiles and their one-ring halo are needed by river/lake/coast
//clearance. Keeping the snapshot compact prevents a resident sparse world from
//being structured-cloned in full for every decoration request.
export function createWorldVegetationMapSnapshot(
    map: MapInfo,
    points: readonly Point[]
): WorldVegetationMapSnapshot {
    const data: MapInfoData = {};
    const selected = new Map<string, Point>();
    for (const point of points) {
        selected.set(`${point.x},${point.y}`, point);
        for (const neighbor of getMapNeighbors(map, point.x, point.y)) {
            selected.set(`${neighbor.x},${neighbor.y}`, neighbor);
        }
    }
    for (const point of selected.values()) {
        const tile = getMapTile(map, point.x, point.y);
        if (!tile) continue;
        data[point.x] ??= {};
        data[point.x][point.y] = cloneTile(tile);
    }
    return {
        data,
        w: map.w,
        h: map.h,
        wrapX: map.wrapX,
        wrapY: map.wrapY,
        infinite: map.infinite
    };
}

function assertOptions(options: WorldVegetationGenerationOptions): void {
    if (!options || typeof options !== "object" || !options.map || !Array.isArray(options.points)) {
        throw new TypeError("vegetation generation options are invalid");
    }
    if (!Number.isFinite(options.size) || options.size <= 0) {
        throw new RangeError("vegetation tile size must be a positive finite number");
    }
    for (const [name, value] of [
        ["grassDensity", options.grassDensity],
        ["treesPerTile", options.treesPerTile]
    ] as const) {
        if (!Number.isInteger(value) || value < 0) {
            throw new RangeError(`${name} must be a non-negative integer`);
        }
    }
    if (!Number.isFinite(options.treeScale) || options.treeScale < 0) {
        throw new RangeError("treeScale must be a non-negative finite number");
    }
    for (const point of options.points) {
        if (!Number.isSafeInteger(point?.x) || !Number.isSafeInteger(point?.y)) {
            throw new RangeError("vegetation points must use safe integer coordinates");
        }
    }
}

function grassTiles(map: MapInfo, points: readonly Point[]): Point[] {
    return points.filter(({ x, y }) => {
        const tile = getMapTile(map, x, y);
        return tile?.type === Land.land && !tile.city && !isLakeTile(tile);
    }).map(point => ({ x: point.x, y: point.y }));
}

export function buildGrassLod(
    map: MapInfo,
    chunkKey: string,
    tiles: Point[],
    lod: WorldChunkLod,
    options: Pick<WorldVegetationGenerationOptions, "size" | "grassDensity" | "grassBladeWidth" | "grassBladeHeight" | "grassHeightVariation">,
    waterOptions: WaterClearanceOptions,
    coastOptions: CoastClearanceOptions
): WorldVegetationGrassLodLayout {
    const area = options.size * options.size * 3 * Math.sqrt(3) / 2;
    const sampling = new VegetationSampling(map, options.size, Math.sqrt(area / options.grassDensity), 0.49, 701);
    const capacity = tiles.length * sampling.tileCapacity;
    const offsets = new Float32Array(capacity * 2);
    const tileOffsets = new Float32Array(capacity * 2);
    const angles = new Float32Array(capacity);
    const scales = new Float32Array(capacity * 2);
    const phases = new Float32Array(capacity);
    const shades = new Float32Array(capacity);
    const ranges = new Uint32Array(tiles.length * 2);
    const origin = getWorldChunkOrigin(chunkKey, options.size);
    const heightVariation = options.grassHeightVariation ?? 0.4;
    let instance = 0;

    tiles.forEach((tile, tileIndex) => {
        const center = getHexCenter(tile.x, tile.y, options.size);
        const start = instance;
        const waterValue = waterEdgeValue(map, tile.x, tile.y);
        const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
        const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
        const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);

        sampling.forTile(tile, (x, z, sx, sz) => {
            if (stableRandom(sx, sz, 709) >= GRASS_DENSITY[lod]) return;
            const lx = x - center.x;
            const ly = z - center.y;
            if (isInTileWater(lx, ly, waterValue, options.size, waterOptions,
                seaMouthValue, lakeMouthValue, lakeNeighborValue)) return;
            if (isInCoastalShore(map, tile.x, tile.y, lx, ly, x, z, options.size, coastOptions)
                || isInLakeShore(map, tile.x, tile.y, lx, ly, x, z, options.size, coastOptions)) return;

            offsets[instance * 2] = center.x + lx - origin.x;
            offsets[instance * 2 + 1] = center.y + ly - origin.y;
            tileOffsets[instance * 2] = center.x - origin.x;
            tileOffsets[instance * 2 + 1] = center.y - origin.y;
            angles[instance] = stableRandom(sx, sz, 741) * Math.PI * 2;
            const heightJitter = 1 - heightVariation * 0.5
                + stableRandom(sx, sz, 743) * heightVariation;
            scales[instance * 2] = options.grassBladeWidth
                * (0.8 + stableRandom(sx, sz, 747) * 0.4);
            scales[instance * 2 + 1] = options.grassBladeHeight * heightJitter;
            phases[instance] = stableRandom(sx, sz, 753) * Math.PI * 2;
            shades[instance] = 0.75 + stableRandom(sx, sz, 759) * 0.35;
            instance += 1;
        });
        ranges[tileIndex * 2] = start;
        ranges[tileIndex * 2 + 1] = instance - start;
    });

    return {
        lod,
        instanceCount: instance,
        tiles,
        ranges,
        offsets: offsets.slice(0, instance * 2),
        tileOffsets: tileOffsets.slice(0, instance * 2),
        angles: angles.slice(0, instance),
        scales: scales.slice(0, instance * 2),
        phases: phases.slice(0, instance),
        shades: shades.slice(0, instance)
    };
}

function buildGrass(
    map: MapInfo,
    options: WorldVegetationGenerationOptions,
    waterOptions: WaterClearanceOptions,
    coastOptions: CoastClearanceOptions
): WorldVegetationGrassChunkLayout[] {
    if (options.grassDensity <= 0) return [];
    return [...groupTilesByWorldChunk(grassTiles(map, options.points))].map(([chunkKey, tiles]) => ({
        chunkKey,
        lods: LODS.map(lod => buildGrassLod(map, chunkKey, tiles, lod, options, waterOptions, coastOptions))
    }));
}

function writeTreeMatrix(
    target: Float32Array,
    index: number,
    angle: number,
    scale: number,
    x: number,
    z: number
): void {
    const offset = index * 16;
    const cosine = Math.cos(angle) * scale;
    const sine = Math.sin(angle) * scale;
    target.set([
        cosine, 0, -sine, 0,
        0, scale, 0, 0,
        sine, 0, cosine, 0,
        x, 0, z, 1
    ], offset);
}

export function buildForestLod(
    map: MapInfo,
    chunkKey: string,
    tiles: Point[],
    lod: WorldChunkLod,
    options: Pick<WorldVegetationGenerationOptions, "size" | "treesPerTile" | "treeScale">,
    waterOptions: WaterClearanceOptions,
    coastOptions: CoastClearanceOptions
): WorldVegetationForestLodLayout {
    const area = options.size * options.size * 3 * Math.sqrt(3) / 2;
    // The jitter leaves >= 56% of a cell between trunks, across every tile,
    // model and source chunk. Scaling trees increases their spacing too.
    const spacing = Math.max(Math.sqrt(area / options.treesPerTile), options.size * options.treeScale * 0.5);
    const sampling = new VegetationSampling(map, options.size, spacing, 0.22, 1701);
    const matrices = new Float32Array(tiles.length * sampling.tileCapacity * 16);
    const ranges = new Uint32Array(tiles.length * 2);
    const origin = getWorldChunkOrigin(chunkKey, options.size);
    let instance = 0;

    tiles.forEach((tile, tileIndex) => {
        const center = getHexCenter(tile.x, tile.y, options.size);
        const start = instance;
        const waterValue = waterEdgeValue(map, tile.x, tile.y);
        const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
        const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
        const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);

        const candidates: { x: number; z: number; sx: number; sz: number; priority: number }[] = [];
        sampling.forTile(tile, (x, z, sx, sz) => {
            if (stableRandom(sx, sz, 1709) >= FOREST_DENSITY[lod]) return;
            const lx = x - center.x;
            const ly = z - center.y;
            if (isInTileWater(
                lx,
                ly,
                waterValue,
                options.size,
                waterOptions,
                seaMouthValue,
                lakeMouthValue,
                lakeNeighborValue
            )) return;
            if (isInCoastalShore(
                map,
                tile.x,
                tile.y,
                lx,
                ly,
                center.x + lx,
                center.y + ly,
                options.size,
                coastOptions
            )) return;
            if (isInLakeShore(
                map,
                tile.x,
                tile.y,
                lx,
                ly,
                center.x + lx,
                center.y + ly,
                options.size,
                coastOptions
            )) return;
            candidates.push({ x, z, sx, sz, priority: stableRandom(sx, sz, 1709) });
        });
        // Effective density takes a prefix on upload. Random priority avoids
        // directional bands, and makes every coarser LOD a stable subset.
        candidates.sort((a, b) => a.priority - b.priority);
        for (const { x, z, sx, sz } of candidates) {
            const scale = options.treeScale * (0.8 + stableRandom(sx, sz, 1713) * 0.4);
            writeTreeMatrix(
                matrices,
                instance,
                stableRandom(sx, sz, 1715) * Math.PI * 2,
                scale,
                x - origin.x,
                z - origin.y
            );
            instance += 1;
        }
        ranges[tileIndex * 2] = start;
        ranges[tileIndex * 2 + 1] = instance - start;
    });

    return { lod, instanceCount: instance, tiles, ranges, matrices: matrices.slice(0, instance * 16) };
}

function buildForest(
    map: MapInfo,
    options: WorldVegetationGenerationOptions,
    waterOptions: WaterClearanceOptions,
    coastOptions: CoastClearanceOptions
): WorldVegetationForestChunkLayout[] {
    if (options.treesPerTile <= 0 || options.treeScale === 0) return [];
    const tilesByModel = new Map<string, Point[]>();
    for (const point of options.points) {
        const tile = getMapTile(map, point.x, point.y);
        if (!tile?.modifiers?.includes("wood") || tile.city || isLakeTile(tile)) continue;
        const modelPath = tile.treeModel ?? options.treeModel;
        const tiles = tilesByModel.get(modelPath) ?? [];
        tiles.push({ x: point.x, y: point.y });
        tilesByModel.set(modelPath, tiles);
    }

    const layouts: WorldVegetationForestChunkLayout[] = [];
    for (const [modelPath, tiles] of tilesByModel) {
        for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
            layouts.push({
                chunkKey,
                modelPath,
                lods: LODS.map(lod => buildForestLod(
                    map,
                    chunkKey,
                    chunkTiles,
                    lod,
                    options,
                    waterOptions,
                    coastOptions
                ))
            });
        }
    }
    return layouts;
}

export function generateWorldVegetation(options: WorldVegetationGenerationOptions): WorldVegetationLayout {
    assertOptions(options);
    const map: MapInfo = options.map;
    const waterOptions: WaterClearanceOptions = {
        riverWidth: options.riverWidth,
        riverBankWidth: options.riverBankWidth,
        riverCurvature: options.riverCurvature,
        lakeShoreWidth: options.lakeShoreWidth
    };
    const coastOptions: CoastClearanceOptions = {
        beachWidth: options.beachWidth,
        lakeShoreWidth: options.lakeShoreWidth,
        waterCornerRounding: options.waterCornerRounding,
        coastCurvature: options.coastCurvature
    };
    return {
        version: WORLD_VEGETATION_FORMAT_VERSION,
        grass: buildGrass(map, options, waterOptions, coastOptions),
        forest: buildForest(map, options, waterOptions, coastOptions)
    };
}

export function assertWorldVegetationLayout(layout: WorldVegetationLayout): void {
    if (!layout || typeof layout !== "object" || layout.version !== WORLD_VEGETATION_FORMAT_VERSION
        || !Array.isArray(layout.grass) || !Array.isArray(layout.forest)) {
        throw new TypeError("world vegetation layout is invalid");
    }
    for (const chunk of layout.grass) {
        if (typeof chunk?.chunkKey !== "string" || !Array.isArray(chunk.lods) || chunk.lods.length !== 3) {
            throw new TypeError("world grass layout is invalid");
        }
        for (const lod of chunk.lods) {
            if (!(lod.ranges instanceof Uint32Array) || !(lod.offsets instanceof Float32Array)
                || !(lod.tileOffsets instanceof Float32Array) || !(lod.angles instanceof Float32Array)
                || !(lod.scales instanceof Float32Array) || !(lod.phases instanceof Float32Array)
                || !(lod.shades instanceof Float32Array) || !Array.isArray(lod.tiles)
                || lod.ranges.length !== lod.tiles.length * 2
                || lod.offsets.length !== lod.instanceCount * 2
                || lod.tileOffsets.length !== lod.instanceCount * 2
                || lod.angles.length !== lod.instanceCount
                || lod.scales.length !== lod.instanceCount * 2
                || lod.phases.length !== lod.instanceCount
                || lod.shades.length !== lod.instanceCount) {
                throw new TypeError("world grass LOD layout is invalid");
            }
        }
    }
    for (const chunk of layout.forest) {
        if (typeof chunk?.chunkKey !== "string" || typeof chunk.modelPath !== "string"
            || !Array.isArray(chunk.lods) || chunk.lods.length !== 3) {
            throw new TypeError("world forest layout is invalid");
        }
        for (const lod of chunk.lods) {
            if (!(lod.ranges instanceof Uint32Array) || !(lod.matrices instanceof Float32Array)
                || !Array.isArray(lod.tiles) || lod.ranges.length !== lod.tiles.length * 2
                || lod.matrices.length !== lod.instanceCount * 16) {
                throw new TypeError("world forest LOD layout is invalid");
            }
        }
    }
}

export function worldVegetationTransferables(layout: WorldVegetationLayout): Transferable[] {
    const buffers = new Set<ArrayBuffer>();
    for (const chunk of layout.grass) for (const lod of chunk.lods) {
        for (const array of [
            lod.ranges,
            lod.offsets,
            lod.tileOffsets,
            lod.angles,
            lod.scales,
            lod.phases,
            lod.shades
        ]) buffers.add(array.buffer as ArrayBuffer);
    }
    for (const chunk of layout.forest) for (const lod of chunk.lods) {
        buffers.add(lod.ranges.buffer as ArrayBuffer);
        buffers.add(lod.matrices.buffer as ArrayBuffer);
    }
    return [...buffers];
}
