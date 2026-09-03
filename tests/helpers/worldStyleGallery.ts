import { Land } from "../../src/enums";
import {
    getNeighbors,
    NEIGHBOR_DIRECTION_BITS,
    NeighborDirection
} from "../../src/helpers/neighbors";
import { positiveModulo } from "../../src/helpers/topology";
import { createWorldSurfaceResolver, WorldBiome } from "../../src/world/WorldSurfaceResolver";

export type WorldStyleGalleryTopology = "bounded" | "toroidal" | "infinite";

export interface WorldStyleGallerySample {
    readonly id: string;
    readonly seed: string;
    readonly topology: WorldStyleGalleryTopology;
    readonly width: number;
    readonly height: number;
    readonly originX: number;
    readonly originY: number;
    readonly group: "bounded" | "toroidal-512" | "infinite-window" | "stress" | "minimum";
}

const sample = (
    id: string,
    seed: string,
    topology: WorldStyleGalleryTopology,
    width: number,
    height: number,
    group: WorldStyleGallerySample["group"],
    originX = 0,
    originY = 0
): WorldStyleGallerySample => Object.freeze({
    id,
    seed,
    topology,
    width,
    height,
    originX,
    originY,
    group
});

// Stage-5's fixed corpus. Infinite worlds deliberately reuse four seeds at a
// positive and a negative window so coordinate signs cannot become accidental
// generation inputs. Stress samples stay small enough for quick diagnosis and
// deliberately exercise the frozen generator's near-water and highland tails.
export const WORLD_STYLE_GALLERY_SAMPLES: readonly WorldStyleGallerySample[] = Object.freeze([
    sample("bounded-a", "gallery-a", "bounded", 128, 96, "bounded"),
    sample("bounded-b", "surface-v4-bounded", "bounded", 128, 96, "bounded"),
    sample("bounded-c", "gallery-bounded-cold-front", "bounded", 128, 96, "bounded"),
    sample("bounded-d", "gallery-bounded-rift", "bounded", 128, 96, "bounded"),

    sample("toroidal-512-a", "gallery-torus-0", "toroidal", 512, 512, "toroidal-512"),
    sample("toroidal-512-b", "gallery-torus-17", "toroidal", 512, 512, "toroidal-512"),
    sample("toroidal-512-c", "gallery-torus-42", "toroidal", 512, 512, "toroidal-512"),
    sample("toroidal-512-d", "gallery-torus-73", "toroidal", 512, 512, "toroidal-512"),
    sample("toroidal-512-e", "gallery-torus-121", "toroidal", 512, 512, "toroidal-512"),
    sample("toroidal-512-f", "gallery-torus-156", "toroidal", 512, 512, "toroidal-512"),

    sample("infinite-a-negative", "gallery-infinite-a", "infinite", 144, 144, "infinite-window", -720, -480),
    sample("infinite-a-positive", "gallery-infinite-a", "infinite", 144, 144, "infinite-window", 384, 240),
    sample("infinite-b-negative", "gallery-infinite-b", "infinite", 144, 144, "infinite-window", -432, -672),
    sample("infinite-b-positive", "gallery-infinite-b", "infinite", 144, 144, "infinite-window", 624, 336),
    sample("infinite-c-negative", "gallery-infinite-c", "infinite", 144, 144, "infinite-window", -864, -192),
    sample("infinite-c-positive", "gallery-infinite-c", "infinite", 144, 144, "infinite-window", 192, 720),
    sample("infinite-d-negative", "gallery-infinite-d", "infinite", 144, 144, "infinite-window", -288, -816),
    sample("infinite-d-positive", "gallery-infinite-d", "infinite", 144, 144, "infinite-window", 768, 144),

    sample("stress-water", "gallery-torus-8", "toroidal", 64, 64, "stress"),
    sample("stress-highland", "gallery-torus-213", "toroidal", 64, 64, "stress"),
    sample("minimum-bounded", "gallery-minimum-bounded", "bounded", 8, 8, "minimum"),
    sample("minimum-toroidal", "gallery-minimum-toroidal", "toroidal", 8, 8, "minimum")
]);

const TERRAIN_CODES = new Map<Land, number>([
    [Land.sea, 0],
    [Land.coastal, 1],
    [Land.land, 2],
    [Land.sand, 3],
    [Land.tundra, 4],
    [Land.snow, 5],
    [Land.mountain, 6]
]);
const BIOMES: readonly WorldBiome[] = ["ocean", "coast", "temperate", "dry", "cold", "alpine"];
const BIOME_CODES = new Map(BIOMES.map((biome, index) => [biome, index]));
const FLAG_HILL = 1;
const FLAG_FOREST = 2;
const FLAG_LAKE = 4;
const FLAG_RIVER = 8;

export interface WorldStyleComponentMetrics {
    readonly components: number;
    readonly tiles: number;
    readonly isolatedTiles: number;
    readonly isolatedRatio: number;
    readonly meanSize: number;
    readonly medianSize: number;
    readonly p90Size: number;
    readonly maximumSize: number;
    readonly truncatedComponents: number;
}

export interface WorldStyleGalleryPoint {
    readonly x: number;
    readonly y: number;
}

export interface WorldStyleGalleryMetrics {
    readonly id: string;
    readonly seed: string;
    readonly topology: WorldStyleGalleryTopology;
    readonly group: WorldStyleGallerySample["group"];
    readonly window: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly ratios: {
        readonly land: number;
        readonly water: number;
        readonly mountain: number;
        readonly hill: number;
        readonly forest: number;
        readonly lake: number;
        readonly river: number;
    };
    readonly climateRatios: Readonly<Record<WorldBiome, number>>;
    readonly mountains: WorldStyleComponentMetrics;
    readonly forests: WorldStyleComponentMetrics & { readonly adjacencyRatio: number };
    readonly lakes: WorldStyleComponentMetrics & { readonly singleCellRatio: number };
    readonly rivers: WorldStyleComponentMetrics & { readonly connectedRatio: number };
    readonly coastlineEdges: number;
    readonly coastlineEdgesPerThousandTiles: number;
    readonly topologySeamErrors: number;
    readonly anchors: {
        readonly center: WorldStyleGalleryPoint;
        readonly relief: WorldStyleGalleryPoint;
        readonly mountain: WorldStyleGalleryPoint;
        readonly forest: WorldStyleGalleryPoint;
        readonly lake: WorldStyleGalleryPoint;
        readonly river: WorldStyleGalleryPoint;
        readonly coast: WorldStyleGalleryPoint;
    };
}

interface SampleGrid {
    readonly terrain: Uint8Array;
    readonly flags: Uint8Array;
    readonly riverEdges: Int8Array;
    readonly biome: Uint8Array;
    readonly relief: Float32Array;
}

interface ComponentResult extends WorldStyleComponentMetrics {
    readonly anchorIndex: number | undefined;
}

function round(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

function pointFromIndex(sample: WorldStyleGallerySample, index: number | undefined): WorldStyleGalleryPoint {
    if (index === undefined) {
        return {
            x: sample.originX + Math.floor((sample.width - 1) / 2),
            y: sample.originY + Math.floor((sample.height - 1) / 2)
        };
    }
    return {
        x: sample.originX + index % sample.width,
        y: sample.originY + Math.floor(index / sample.width)
    };
}

function localIndex(
    sample: WorldStyleGallerySample,
    x: number,
    y: number
): number | undefined {
    let normalizedX = x;
    let normalizedY = y;
    if (sample.topology === "toroidal") {
        normalizedX = positiveModulo(normalizedX, sample.width);
        normalizedY = positiveModulo(normalizedY, sample.height);
    }
    const localX = normalizedX - sample.originX;
    const localY = normalizedY - sample.originY;
    if (localX < 0 || localX >= sample.width || localY < 0 || localY >= sample.height) return undefined;
    return localX + localY * sample.width;
}

function forEachNeighborIndex(
    sample: WorldStyleGallerySample,
    index: number,
    visit: (neighbor: number | undefined, direction: NeighborDirection) => void
): void {
    const point = pointFromIndex(sample, index);
    for (const neighbor of getNeighbors(point.x, point.y)) {
        visit(localIndex(sample, neighbor.x, neighbor.y), neighbor.direction);
    }
}

function distribution(
    sample: WorldStyleGallerySample,
    mask: (index: number) => boolean,
    anchorScore: Float32Array,
    connects: (from: number, to: number, direction: NeighborDirection) => boolean = () => true
): ComponentResult {
    const total = sample.width * sample.height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    const sizes: number[] = [];
    let tiles = 0;
    let isolatedTiles = 0;
    let truncatedComponents = 0;
    let largestSize = 0;
    let largestAnchor: number | undefined;

    for (let start = 0; start < total; start += 1) {
        if (visited[start] || !mask(start)) continue;
        let read = 0;
        let write = 1;
        let truncated = false;
        let componentAnchor = start;
        queue[0] = start;
        visited[start] = 1;
        while (read < write) {
            const current = queue[read++];
            if (anchorScore[current] > anchorScore[componentAnchor]) componentAnchor = current;
            forEachNeighborIndex(sample, current, (neighbor, direction) => {
                if (neighbor === undefined) {
                    if (sample.topology === "infinite") truncated = true;
                    return;
                }
                if (visited[neighbor] || !mask(neighbor) || !connects(current, neighbor, direction)) return;
                visited[neighbor] = 1;
                queue[write++] = neighbor;
            });
        }
        sizes.push(write);
        tiles += write;
        if (write === 1) isolatedTiles += 1;
        if (truncated) truncatedComponents += 1;
        if (write > largestSize) {
            largestSize = write;
            largestAnchor = componentAnchor;
        }
    }

    sizes.sort((a, b) => a - b);
    const percentile = (value: number): number => sizes.length === 0
        ? 0
        : sizes[Math.floor((sizes.length - 1) * value)];
    return {
        components: sizes.length,
        tiles,
        isolatedTiles,
        isolatedRatio: tiles === 0 ? 0 : round(isolatedTiles / tiles),
        meanSize: sizes.length === 0 ? 0 : round(tiles / sizes.length),
        medianSize: percentile(0.5),
        p90Size: percentile(0.9),
        maximumSize: sizes.length === 0 ? 0 : sizes[sizes.length - 1],
        truncatedComponents,
        anchorIndex: largestAnchor
    };
}

function sameModifiers(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
    const left = a ?? [];
    const right = b ?? [];
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function topologySeamErrors(sample: WorldStyleGallerySample): number {
    if (sample.topology !== "toroidal") return 0;
    const resolver = createWorldSurfaceResolver({
        seed: sample.seed,
        domain: { topology: "toroidal", width: sample.width, height: sample.height }
    });
    let errors = 0;
    const compare = (ax: number, ay: number, bx: number, by: number): void => {
        const aTile = resolver.resolveGeneratedTile(ax, ay);
        const bTile = resolver.resolveGeneratedTile(bx, by);
        const aSample = resolver.sampleGenerated(ax, ay);
        const bSample = resolver.sampleGenerated(bx, by);
        if (aTile.type !== bTile.type || !sameModifiers(aTile.modifiers, bTile.modifiers)
            || aSample.relief !== bSample.relief || aSample.biome !== bSample.biome
            || aSample.vegetationDensity !== bSample.vegetationDensity
            || aSample.lakePotential !== bSample.lakePotential) errors += 1;
    };
    for (let y = 0; y < sample.height; y += 1) {
        compare(-1, y, sample.width - 1, y);
        compare(sample.width, y, 0, y);
    }
    for (let x = 0; x < sample.width; x += 1) {
        compare(x, -1, x, sample.height - 1);
        compare(x, sample.height, x, 0);
    }
    return errors;
}

function createGrid(sample: WorldStyleGallerySample): SampleGrid {
    if (sample.width <= 0 || sample.height <= 0 || sample.topology === "toroidal" && sample.width % 2 !== 0) {
        throw new RangeError("gallery samples require positive dimensions and even toroidal widths");
    }
    if (sample.topology !== "infinite" && (sample.originX !== 0 || sample.originY !== 0)) {
        throw new RangeError("finite gallery samples must cover their canonical domain");
    }
    const domain = sample.topology === "infinite"
        ? { topology: "infinite" as const }
        : { topology: sample.topology, width: sample.width, height: sample.height };
    const resolver = createWorldSurfaceResolver({ seed: sample.seed, domain });
    const total = sample.width * sample.height;
    const terrain = new Uint8Array(total);
    const flags = new Uint8Array(total);
    const riverEdges = new Int8Array(total);
    riverEdges.fill(-1);
    const biome = new Uint8Array(total);
    const relief = new Float32Array(total);
    const blockSize = 24;
    for (let startY = 0; startY < sample.height; startY += blockSize) {
        for (let startX = 0; startX < sample.width; startX += blockSize) {
            const window = resolver.createWindow();
            const endY = Math.min(sample.height, startY + blockSize);
            const endX = Math.min(sample.width, startX + blockSize);
            for (let localY = startY; localY < endY; localY += 1) {
                for (let localX = startX; localX < endX; localX += 1) {
                    const x = sample.originX + localX;
                    const y = sample.originY + localY;
                    const index = localX + localY * sample.width;
                    const surface = window.sampleGenerated(x, y)!;
                    const tile = window.resolveGeneratedTile(x, y);
                    const modifiers = tile.modifiers ?? [];
                    terrain[index] = TERRAIN_CODES.get(tile.type) ?? 255;
                    flags[index] = (modifiers.includes("hill") ? FLAG_HILL : 0)
                        | (modifiers.includes("wood") ? FLAG_FOREST : 0)
                        | (modifiers.includes("lake") ? FLAG_LAKE : 0)
                        | (modifiers.includes("river") ? FLAG_RIVER : 0);
                    if (tile.riverEdges !== undefined) riverEdges[index] = tile.riverEdges;
                    biome[index] = BIOME_CODES.get(surface.biome) ?? 255;
                    relief[index] = surface.relief;
                }
            }
            window.clear();
        }
    }
    return { terrain, flags, riverEdges, biome, relief };
}

export function analyzeWorldStyleGallerySample(sample: WorldStyleGallerySample): WorldStyleGalleryMetrics {
    const grid = createGrid(sample);
    const total = sample.width * sample.height;
    let water = 0;
    let mountains = 0;
    let hills = 0;
    let forests = 0;
    let lakes = 0;
    let rivers = 0;
    let adjacentForests = 0;
    let connectedRivers = 0;
    let coastlineTwice = 0;
    let highestRelief = 0;
    let coastAnchor: number | undefined;
    const climateCounts = new Uint32Array(BIOMES.length);
    const isStandingWater = (index: number): boolean => grid.terrain[index] <= 1
        || Boolean(grid.flags[index] & FLAG_LAKE);
    const isRiver = (index: number): boolean => Boolean(grid.flags[index] & FLAG_RIVER);
    const isWater = (index: number): boolean => isStandingWater(index) || isRiver(index);
    const isMountain = (index: number): boolean => grid.terrain[index] === TERRAIN_CODES.get(Land.mountain);
    const isForest = (index: number): boolean => Boolean(grid.flags[index] & FLAG_FOREST);
    const isLake = (index: number): boolean => Boolean(grid.flags[index] & FLAG_LAKE);

    for (let index = 0; index < total; index += 1) {
        if (isWater(index)) water += 1;
        if (isMountain(index)) mountains += 1;
        if (grid.flags[index] & FLAG_HILL) hills += 1;
        if (isForest(index)) forests += 1;
        if (isLake(index)) lakes += 1;
        if (isRiver(index)) rivers += 1;
        if (grid.biome[index] < climateCounts.length) climateCounts[grid.biome[index]] += 1;
        if (grid.relief[index] > grid.relief[highestRelief]) highestRelief = index;
        let hasForestNeighbor = false;
        let hasRiverConnection = false;
        forEachNeighborIndex(sample, index, (neighbor, direction) => {
            if (neighbor === undefined) return;
            if (isStandingWater(index) !== isStandingWater(neighbor)) {
                coastlineTwice += 1;
                if (coastAnchor === undefined && !isStandingWater(index)) coastAnchor = index;
            }
            if (isForest(index) && isForest(neighbor)) hasForestNeighbor = true;
            const edge = grid.riverEdges[index];
            if (isRiver(index) && edge >= 0
                && (edge & 1 << NEIGHBOR_DIRECTION_BITS[direction]) !== 0
                && (isRiver(neighbor) || isStandingWater(neighbor))) hasRiverConnection = true;
        });
        if (hasForestNeighbor) adjacentForests += 1;
        if (hasRiverConnection) connectedRivers += 1;
    }

    const mountainDistribution = distribution(sample, isMountain, grid.relief);
    const forestDistribution = distribution(sample, isForest, grid.relief);
    const lakeDistribution = distribution(sample, isLake, grid.relief);
    const riverDistribution = distribution(
        sample,
        isRiver,
        grid.relief,
        (from, _to, direction) => (grid.riverEdges[from]
            & 1 << NEIGHBOR_DIRECTION_BITS[direction]) !== 0
    );
    const { anchorIndex: _mountainAnchor, ...mountainMetrics } = mountainDistribution;
    const { anchorIndex: _forestAnchor, ...forestMetrics } = forestDistribution;
    const { anchorIndex: _lakeAnchor, ...lakeMetrics } = lakeDistribution;
    const { anchorIndex: _riverAnchor, ...riverMetrics } = riverDistribution;
    const climateRatios = Object.fromEntries(BIOMES.map((name, index) => [
        name,
        round(climateCounts[index] / total)
    ])) as Record<WorldBiome, number>;
    const coastlineEdges = Math.floor(coastlineTwice / 2);

    return {
        id: sample.id,
        seed: sample.seed,
        topology: sample.topology,
        group: sample.group,
        window: {
            x: sample.originX,
            y: sample.originY,
            width: sample.width,
            height: sample.height
        },
        ratios: {
            land: round((total - water) / total),
            water: round(water / total),
            mountain: round(mountains / total),
            hill: round(hills / total),
            forest: round(forests / total),
            lake: round(lakes / total),
            river: round(rivers / total)
        },
        climateRatios,
        mountains: mountainMetrics,
        forests: {
            ...forestMetrics,
            adjacencyRatio: forests === 0 ? 0 : round(adjacentForests / forests)
        },
        lakes: {
            ...lakeMetrics,
            singleCellRatio: lakes === 0 ? 0 : round(lakeDistribution.isolatedTiles / lakes)
        },
        rivers: {
            ...riverMetrics,
            connectedRatio: rivers === 0 ? 0 : round(connectedRivers / rivers)
        },
        coastlineEdges,
        coastlineEdgesPerThousandTiles: round(coastlineEdges * 1000 / total),
        topologySeamErrors: topologySeamErrors(sample),
        anchors: {
            center: pointFromIndex(sample, undefined),
            relief: pointFromIndex(sample, highestRelief),
            mountain: pointFromIndex(sample, mountainDistribution.anchorIndex ?? highestRelief),
            forest: pointFromIndex(sample, forestDistribution.anchorIndex),
            lake: pointFromIndex(sample, lakeDistribution.anchorIndex),
            river: pointFromIndex(sample, riverDistribution.anchorIndex),
            coast: pointFromIndex(sample, coastAnchor)
        }
    };
}
