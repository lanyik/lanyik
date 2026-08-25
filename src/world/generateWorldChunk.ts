import { Land } from "../enums";
import { getNeighbors } from "../helpers/neighbors";
import { MapInfo, Point, TileInfo } from "../interfaces";
import { fractalNoise2D, randomAt, seedToUint32 } from "./noise";

export const DEFAULT_WORLD_GENERATION_CHUNK_SIZE = 24;
export const MAX_WORLD_GENERATION_CHUNK_SIZE = 128;
export const WORLD_CHUNK_FORMAT_VERSION = 1;
export const WORLD_CHUNK_PADDING = 1;

export interface WorldChunkGenerationOptions {
    seed: string | number;
    chunkX: number;
    chunkY: number;
    chunkSize?: number;
}

//One Uint16 per tile keeps worker transfer and CPU cache compact. Bit layout:
//0..2 terrain, 3 hill, 4 wood, 5 lake, 6..7 tree species.
export interface PackedWorldChunk {
    version: typeof WORLD_CHUNK_FORMAT_VERSION;
    chunkX: number;
    chunkY: number;
    chunkSize: number;
    padding: typeof WORLD_CHUNK_PADDING;
    stride: number;
    tiles: Uint16Array;
}

export function assertPackedWorldChunk(chunk: PackedWorldChunk): void {
    if (!chunk || typeof chunk !== "object"
        || chunk.version !== WORLD_CHUNK_FORMAT_VERSION
        || !Number.isSafeInteger(chunk.chunkX) || !Number.isSafeInteger(chunk.chunkY)
        || !Number.isInteger(chunk.chunkSize) || chunk.chunkSize <= 0
        || chunk.chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE
        || chunk.padding !== WORLD_CHUNK_PADDING
        || chunk.stride !== chunk.chunkSize + chunk.padding * 2
        || !(chunk.tiles instanceof Uint16Array)
        || chunk.tiles.length !== chunk.stride * chunk.stride) {
        throw new TypeError("packed world chunk payload is invalid");
    }
}

const LAND_BY_CODE = [
    Land.sea,
    Land.coastal,
    Land.land,
    Land.sand,
    Land.tundra,
    Land.snow,
    Land.mountain
] as const;

const LAND_CODE = new Map<Land, number>(LAND_BY_CODE.map((land, index) => [land, index]));
const FLAG_HILL = 1 << 3;
const FLAG_WOOD = 1 << 4;
const FLAG_LAKE = 1 << 5;
const TREE_SHIFT = 6;
const TREE_MASK = 0b11 << TREE_SHIFT;
const TREE_MODELS = [undefined, "Assets/models/palm", "Assets/models/pinia", "Assets/models/oak"] as const;
const SEA_LEVEL = 0.43;

interface ClimateSample {
    elevation: number;
    moisture: number;
    temperature: number;
}

function assertChunkCoordinate(name: "chunkX" | "chunkY", value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

function resolveChunkSize(value = DEFAULT_WORLD_GENERATION_CHUNK_SIZE): number {
    if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
        throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
    }
    return value;
}

//All fields sample global integer coordinates, so generation order, worker
//count and chunk boundaries cannot alter the result or create seams.
function sampleClimate(seed: number, x: number, y: number): ClimateSample {
    const continent = fractalNoise2D(seed, x * 0.055, y * 0.055, 5);
    const detail = fractalNoise2D(seed ^ 0xa341316c, x * 0.14, y * 0.14, 3);
    const elevation = continent * 0.78 + detail * 0.22 + 0.03;
    const moisture = fractalNoise2D(seed ^ 0xc8013ea4, x * 0.08, y * 0.08, 4);
    const temperatureNoise = fractalNoise2D(seed ^ 0xad90777d, x * 0.025, y * 0.025, 3);
    const temperature = 0.18 + temperatureNoise * 0.74 - Math.max(0, elevation - 0.55) * 0.8;
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

function baseTerrainAt(seed: number, x: number, y: number): Land {
    return classifyTerrain(sampleClimate(seed, x, y));
}

function isWater(type: Land): boolean {
    return type === Land.sea || type === Land.coastal;
}

function terrainAt(seed: number, x: number, y: number): Land {
    const base = baseTerrainAt(seed, x, y);
    if (base !== Land.sea) return base;
    const touchesLand = getNeighbors(x, y).some(neighbor => !isWater(baseTerrainAt(seed, neighbor.x, neighbor.y)));
    return touchesLand ? Land.coastal : Land.sea;
}

function encodeTile(seed: number, x: number, y: number): number {
    const climate = sampleClimate(seed, x, y);
    const type = terrainAt(seed, x, y);
    let packed = LAND_CODE.get(type) ?? 0;
    if (isWater(type) || type === Land.mountain || type === Land.snow) return packed;

    const lake = type === Land.land
        && climate.elevation > SEA_LEVEL + 0.025
        && climate.elevation < 0.56
        && climate.moisture > 0.74
        && randomAt(seed, x, y, 0x6c8e9cf5) > 0.94;
    if (lake) return packed | FLAG_LAKE;
    if (climate.elevation > 0.62) packed |= FLAG_HILL;

    const forestChance = Math.max(0, Math.min(0.58, (climate.moisture - 0.48) * 1.5));
    if (randomAt(seed, x, y, 0x27d4eb2f) < forestChance) {
        const treeCode = climate.temperature > 0.67 ? 1 : climate.temperature < 0.4 ? 2 : 3;
        packed |= FLAG_WOOD | (treeCode << TREE_SHIFT);
    }
    return packed;
}

export function generateWorldChunk(options: WorldChunkGenerationOptions): PackedWorldChunk {
    assertChunkCoordinate("chunkX", options.chunkX);
    assertChunkCoordinate("chunkY", options.chunkY);
    const chunkSize = resolveChunkSize(options.chunkSize);
    const stride = chunkSize + WORLD_CHUNK_PADDING * 2;
    const tiles = new Uint16Array(stride * stride);
    const seed = seedToUint32(options.seed);
    const originX = options.chunkX * chunkSize - WORLD_CHUNK_PADDING;
    const originY = options.chunkY * chunkSize - WORLD_CHUNK_PADDING;
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)
        || !Number.isSafeInteger(originX + stride - 1) || !Number.isSafeInteger(originY + stride - 1)) {
        throw new RangeError("chunk coordinates exceed the safe integer tile range");
    }

    for (let localX = 0; localX < stride; localX += 1) {
        for (let localY = 0; localY < stride; localY += 1) {
            tiles[localX * stride + localY] = encodeTile(seed, originX + localX, originY + localY);
        }
    }
    return {
        version: WORLD_CHUNK_FORMAT_VERSION,
        chunkX: options.chunkX,
        chunkY: options.chunkY,
        chunkSize,
        padding: WORLD_CHUNK_PADDING,
        stride,
        tiles
    };
}

export function decodeWorldChunkTile(chunk: PackedWorldChunk, localX: number, localY: number): TileInfo {
    if (!Number.isInteger(localX) || !Number.isInteger(localY)
        || localX < -chunk.padding || localX >= chunk.chunkSize + chunk.padding
        || localY < -chunk.padding || localY >= chunk.chunkSize + chunk.padding) {
        throw new RangeError("chunk-local tile coordinate is outside the packed payload");
    }
    const packed = chunk.tiles[(localX + chunk.padding) * chunk.stride + localY + chunk.padding];
    const type = LAND_BY_CODE[packed & 0b111];
    if (!type) throw new Error("packed world chunk contains an unknown terrain code");
    const tile: TileInfo = { type };
    const modifiers: string[] = [];
    if ((packed & FLAG_HILL) !== 0) modifiers.push("hill");
    if ((packed & FLAG_WOOD) !== 0) modifiers.push("wood");
    if ((packed & FLAG_LAKE) !== 0) modifiers.push("lake");
    if (modifiers.length > 0) tile.modifiers = modifiers;
    const treeModel = TREE_MODELS[(packed & TREE_MASK) >> TREE_SHIFT];
    if (treeModel) tile.treeModel = treeModel;
    return tile;
}

export function getWorldChunkCorePoints(chunk: PackedWorldChunk): Point[] {
    const points: Point[] = [];
    const originX = chunk.chunkX * chunk.chunkSize;
    const originY = chunk.chunkY * chunk.chunkSize;
    for (let localX = 0; localX < chunk.chunkSize; localX += 1) {
        for (let localY = 0; localY < chunk.chunkSize; localY += 1) {
            points.push({ x: originX + localX, y: originY + localY });
        }
    }
    return points;
}

export class SparseWorldChunkStore {
    public readonly map: MapInfo;
    private readonly chunks = new Map<string, PackedWorldChunk>();
    private readonly decodedTiles = new Map<number, TileInfo>();
    private chunkSize: number | undefined;

    constructor() {
        //`data` intentionally stays empty. The renderer reaches resident packed
        //tiles through getMapTile() -> tileAt(), avoiding one object, one string
        //key and two reference-count maps per logical cell.
        this.map = {
            data: {},
            w: 1,
            h: 1,
            infinite: true,
            tileAt: (x, y) => this.getTile(x, y),
            forEachTile: visit => this.forEachCoreTile(visit)
        };
    }

    public static key(chunkX: number, chunkY: number): string {
        return `${chunkX},${chunkY}`;
    }

    public add(chunk: PackedWorldChunk): Point[] {
        assertPackedWorldChunk(chunk);
        if (this.chunkSize !== undefined && chunk.chunkSize !== this.chunkSize) {
            throw new TypeError("all sparse world chunks must use the same chunkSize");
        }
        this.chunkSize = chunk.chunkSize;
        const key = SparseWorldChunkStore.key(chunk.chunkX, chunk.chunkY);
        if (this.chunks.has(key)) return getWorldChunkCorePoints(chunk);
        this.chunks.set(key, chunk);
        return getWorldChunkCorePoints(chunk);
    }

    public remove(chunkX: number, chunkY: number): void {
        const key = SparseWorldChunkStore.key(chunkX, chunkY);
        if (!this.chunks.has(key)) return;
        this.chunks.delete(key);
        if (this.chunks.size === 0) this.chunkSize = undefined;
    }

    public hasCoreTile(x: number, y: number): boolean {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === undefined) return false;
        return this.hasChunk(Math.floor(x / this.chunkSize), Math.floor(y / this.chunkSize));
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(SparseWorldChunkStore.key(chunkX, chunkY));
    }

    public get residentChunkCount(): number {
        return this.chunks.size;
    }

    public get residentPayloadBytes(): number {
        let bytes = 0;
        for (const chunk of this.chunks.values()) bytes += chunk.tiles.byteLength;
        return bytes;
    }

    public get decodedTileVariantCount(): number {
        return this.decodedTiles.size;
    }

    private getTile(x: number, y: number): TileInfo | undefined {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === undefined) return undefined;
        const ownerX = Math.floor(x / this.chunkSize);
        const ownerY = Math.floor(y / this.chunkSize);
        const direct = this.tileFromChunk(this.chunks.get(SparseWorldChunkStore.key(ownerX, ownerY)), x, y);
        if (direct) return direct;

        //A core owner can be absent while an adjacent resident chunk still
        //provides this coordinate through its one-cell halo.
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                if (dx === 0 && dy === 0) continue;
                const tile = this.tileFromChunk(
                    this.chunks.get(SparseWorldChunkStore.key(ownerX + dx, ownerY + dy)),
                    x,
                    y
                );
                if (tile) return tile;
            }
        }
        return undefined;
    }

    private tileFromChunk(chunk: PackedWorldChunk | undefined, x: number, y: number): TileInfo | undefined {
        if (!chunk) return undefined;
        const localX = x - chunk.chunkX * chunk.chunkSize;
        const localY = y - chunk.chunkY * chunk.chunkSize;
        if (localX < -chunk.padding || localX >= chunk.chunkSize + chunk.padding
            || localY < -chunk.padding || localY >= chunk.chunkSize + chunk.padding) return undefined;
        const packed = chunk.tiles[(localX + chunk.padding) * chunk.stride + localY + chunk.padding];
        const cached = this.decodedTiles.get(packed);
        if (cached) return cached;
        const decoded = decodeWorldChunkTile(chunk, localX, localY);
        if (decoded.modifiers) Object.freeze(decoded.modifiers);
        Object.freeze(decoded);
        this.decodedTiles.set(packed, decoded);
        return decoded;
    }

    private forEachCoreTile(visit: (tile: TileInfo, x: number, y: number) => void): void {
        for (const chunk of this.chunks.values()) {
            const originX = chunk.chunkX * chunk.chunkSize;
            const originY = chunk.chunkY * chunk.chunkSize;
            for (let localX = 0; localX < chunk.chunkSize; localX += 1) {
                for (let localY = 0; localY < chunk.chunkSize; localY += 1) {
                    visit(this.tileFromChunk(chunk, originX + localX, originY + localY)!, originX + localX, originY + localY);
                }
            }
        }
    }

    public clear(): void {
        this.chunks.clear();
        this.decodedTiles.clear();
        this.chunkSize = undefined;
    }
}
