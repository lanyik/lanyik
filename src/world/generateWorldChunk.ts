import { Land } from "../enums";
import { MapInfo, Point, TileInfo } from "../interfaces";
import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";
import {
    createWorldSurfaceResolver,
    WorldSurfaceResolver
} from "./WorldSurfaceResolver";

export const DEFAULT_WORLD_GENERATION_CHUNK_SIZE = 24;
export const MAX_WORLD_GENERATION_CHUNK_SIZE = 128;
export const WORLD_CHUNK_FORMAT_VERSION = 2;
export const WORLD_CHUNK_PADDING = 1;
export { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";

export interface BoundedWorldChunkGeneration {
    width: number;
    height: number;
    topology: "toroidal";
}

export interface WorldChunkGenerationOptions {
    seed: string | number;
    chunkX: number;
    chunkY: number;
    chunkSize?: number;
    world?: BoundedWorldChunkGeneration;
}

// The direct synchronous API is commonly called once per neighboring chunk.
// Retaining only its most recent exact resolver avoids rebuilding the same
// bounded water mask for every call while keeping residency independent of the
// number of seeds/worlds visited. Workers own an equivalent resolver per active
// descriptor in generateWorld.worker.ts.
let recentChunkResolver: WorldSurfaceResolver | undefined;

function resolverMatchesOptions(
    resolver: WorldSurfaceResolver,
    options: WorldChunkGenerationOptions
): boolean {
    if (resolver.seed !== String(options.seed)) return false;
    if (!options.world) return resolver.domain.topology === "infinite";
    return resolver.domain.topology === "toroidal"
        && resolver.domain.width === options.world.width
        && resolver.domain.height === options.world.height;
}

function resolverForSynchronousGeneration(options: WorldChunkGenerationOptions): WorldSurfaceResolver {
    if (!recentChunkResolver || !resolverMatchesOptions(recentChunkResolver, options)) {
        recentChunkResolver = createWorldChunkSurfaceResolver(options);
    }
    return recentChunkResolver;
}

//One Uint16 per tile keeps worker transfer and CPU cache compact. Bit layout:
//0..2 terrain, 3 hill, 4 wood, 5 lake, 6..7 tree species, 8 river,
//9..14 explicit river-edge mask, 15 explicit river-edge flag.
export interface PackedWorldChunk {
    version: typeof WORLD_CHUNK_FORMAT_VERSION;
    chunkX: number;
    chunkY: number;
    chunkSize: number;
    padding: typeof WORLD_CHUNK_PADDING;
    stride: number;
    tiles: Uint16Array;
}

//Packed terrain variants remain shared and immutable. Applications can attach
//coordinate-specific state without materializing every tile by storing only
//the fields that differ from the generated base tile.
export type WorldTileOverride = Partial<TileInfo>;

export interface WorldTileOverrideChange {
    x: number;
    y: number;
    changes: WorldTileOverride;
}

export function cloneWorldTileOverride(value: WorldTileOverride): WorldTileOverride {
    const copy: WorldTileOverride = { ...value };
    if (value.modifiers) copy.modifiers = [...value.modifiers];
    if (value.rivers) copy.rivers = value.rivers.map(river => ({ ...river }));
    if (value.city) copy.city = { ...value.city };
    return copy;
}

export function worldTileOverridesEqual(
    first: WorldTileOverride | undefined,
    second: WorldTileOverride | undefined
): boolean {
    if (first === second) return true;
    if (!first || !second) return !hasWorldTileOverride(first) && !hasWorldTileOverride(second);
    if (first.type !== second.type || first.treeModel !== second.treeModel
        || first.riverEdges !== second.riverEdges
        || first.unit !== second.unit || first.city?.name !== second.city?.name
        || first.city?.model !== second.city?.model
        || Boolean(first.city) !== Boolean(second.city)) return false;
    const firstModifiers = first.modifiers;
    const secondModifiers = second.modifiers;
    if (firstModifiers?.length !== secondModifiers?.length
        || firstModifiers?.some((value, index) => value !== secondModifiers?.[index])) return false;
    const firstRivers = first.rivers;
    const secondRivers = second.rivers;
    return firstRivers?.length === secondRivers?.length
        && !firstRivers?.some((value, index) => value.riverIndex !== secondRivers?.[index]?.riverIndex
            || value.riverTileIndex !== secondRivers?.[index]?.riverTileIndex);
}

export function hasWorldTileOverride(value: WorldTileOverride | undefined): boolean {
    return !!value && (value.type !== undefined || value.modifiers !== undefined
        || value.treeModel !== undefined || value.riverEdges !== undefined || value.rivers !== undefined
        || value.unit !== undefined || value.city !== undefined);
}

export function assertWorldTileOverride(value: WorldTileOverride): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("tile override must be an object");
    }
    if (value.type !== undefined && !Object.values(Land).includes(value.type)) {
        throw new TypeError("tile override type is invalid");
    }
    if (value.modifiers !== undefined
        && (!Array.isArray(value.modifiers) || value.modifiers.some(item => typeof item !== "string"))) {
        throw new TypeError("tile override modifiers must be strings");
    }
    if (value.treeModel !== undefined && typeof value.treeModel !== "string") {
        throw new TypeError("tile override treeModel must be a string");
    }
    if (value.riverEdges !== undefined
        && (!Number.isInteger(value.riverEdges) || value.riverEdges < 0 || value.riverEdges > 0b11_1111)) {
        throw new RangeError("tile override riverEdges must be an integer between 0 and 63");
    }
    if (value.unit !== undefined && typeof value.unit !== "string") {
        throw new TypeError("tile override unit must be a string");
    }
    if (value.rivers !== undefined && (!Array.isArray(value.rivers) || value.rivers.some(river =>
        !river || !Number.isSafeInteger(river.riverIndex) || !Number.isSafeInteger(river.riverTileIndex)))) {
        throw new TypeError("tile override rivers are invalid");
    }
    if (value.city !== undefined && (!value.city || typeof value.city !== "object" || Array.isArray(value.city)
        || (value.city.name !== undefined && typeof value.city.name !== "string")
        || (value.city.model !== undefined && typeof value.city.model !== "string"))) {
        throw new TypeError("tile override city is invalid");
    }
}

export interface SparseWorldChunkStoreOptions {
    width?: number;
    height?: number;
    wrapX?: boolean;
    wrapY?: boolean;
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
const FLAG_RIVER = 1 << 8;
const RIVER_EDGES_SHIFT = 9;
const RIVER_EDGES_MASK = 0b11_1111 << RIVER_EDGES_SHIFT;
const FLAG_EXPLICIT_RIVER_EDGES = 1 << 15;
const TREE_MODELS = [undefined, "Assets/models/palm", "Assets/models/pinia", "Assets/models/oak"] as const;
function assertChunkCoordinate(name: "chunkX" | "chunkY", value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

function resolveChunkSize(value = DEFAULT_WORLD_GENERATION_CHUNK_SIZE): number {
    if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
        throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
    }
    return value;
}

function encodeTileInfo(tile: TileInfo): number {
    let packed = LAND_CODE.get(tile.type) ?? 0;
    if (tile.modifiers?.includes("hill")) packed |= FLAG_HILL;
    if (tile.modifiers?.includes("wood")) packed |= FLAG_WOOD;
    if (tile.modifiers?.includes("lake")) packed |= FLAG_LAKE;
    if (tile.modifiers?.includes("river")) packed |= FLAG_RIVER;
    if (tile.riverEdges !== undefined) {
        if (!Number.isInteger(tile.riverEdges) || tile.riverEdges < 0 || tile.riverEdges > 0b11_1111) {
            throw new RangeError("tile riverEdges must be an integer between 0 and 63");
        }
        packed |= FLAG_EXPLICIT_RIVER_EDGES | tile.riverEdges << RIVER_EDGES_SHIFT;
    }
    const treeCode = TREE_MODELS.indexOf(tile.treeModel as typeof TREE_MODELS[number]);
    if (treeCode > 0) packed |= treeCode << TREE_SHIFT;
    return packed;
}

function validateBoundedWorld(world: BoundedWorldChunkGeneration | undefined): void {
    if (!world) return;
    if (world.topology !== "toroidal"
        || !Number.isInteger(world.width) || world.width < 8
        || !Number.isInteger(world.height) || world.height < 8
        || world.width % 2 !== 0) {
        throw new RangeError("bounded chunk generation requires an even-width toroidal world of at least 8x8");
    }
}

export function generateWorldChunk(options: WorldChunkGenerationOptions): PackedWorldChunk {
    assertChunkCoordinate("chunkX", options.chunkX);
    assertChunkCoordinate("chunkY", options.chunkY);
    validateBoundedWorld(options.world);
    const chunkSize = resolveChunkSize(options.chunkSize);
    const resolver = resolverForSynchronousGeneration(options);
    return generateWorldChunkWithResolver(options, resolver, chunkSize);
}

export function createWorldChunkSurfaceResolver(options: WorldChunkGenerationOptions): WorldSurfaceResolver {
    if (!options || typeof options !== "object") throw new TypeError("world chunk generation options are required");
    validateBoundedWorld(options.world);
    return createWorldSurfaceResolver({
        seed: options.seed,
        domain: options.world
            ? { topology: "toroidal", width: options.world.width, height: options.world.height }
            : { topology: "infinite" }
    });
}

export function generateWorldChunkWithResolver(
    options: WorldChunkGenerationOptions,
    resolver: WorldSurfaceResolver,
    resolvedChunkSize?: number
): PackedWorldChunk {
    assertChunkCoordinate("chunkX", options.chunkX);
    assertChunkCoordinate("chunkY", options.chunkY);
    validateBoundedWorld(options.world);
    const chunkSize = resolvedChunkSize ?? resolveChunkSize(options.chunkSize);
    const stride = chunkSize + WORLD_CHUNK_PADDING * 2;
    const tiles = new Uint16Array(stride * stride);
    const expectedDomain = options.world
        ? { topology: "toroidal" as const, width: options.world.width, height: options.world.height }
        : { topology: "infinite" as const };
    if (!resolver || resolver.seed !== String(options.seed)
        || resolver.domain.topology !== expectedDomain.topology
        || (expectedDomain.topology === "toroidal"
            && (resolver.domain.topology !== "toroidal"
                || resolver.domain.width !== expectedDomain.width
                || resolver.domain.height !== expectedDomain.height))) {
        throw new TypeError("world surface resolver does not match the chunk request");
    }
    const window = resolver.createWindow();
    const originX = options.chunkX * chunkSize - WORLD_CHUNK_PADDING;
    const originY = options.chunkY * chunkSize - WORLD_CHUNK_PADDING;
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)
        || !Number.isSafeInteger(originX + stride - 1) || !Number.isSafeInteger(originY + stride - 1)) {
        throw new RangeError("chunk coordinates exceed the safe integer tile range");
    }

    for (let localX = 0; localX < stride; localX += 1) {
        for (let localY = 0; localY < stride; localY += 1) {
            const x = originX + localX;
            const y = originY + localY;
            tiles[localX * stride + localY] = encodeTileInfo(window.resolveGeneratedTile(x, y));
        }
    }
    window.clear();
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
    if ((packed & FLAG_RIVER) !== 0) modifiers.push("river");
    if (modifiers.length > 0) tile.modifiers = modifiers;
    if ((packed & FLAG_EXPLICIT_RIVER_EDGES) !== 0) {
        tile.riverEdges = (packed & RIVER_EDGES_MASK) >> RIVER_EDGES_SHIFT;
    }
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
    private readonly tileOverrides = new Map<string, WorldTileOverride>();
    private readonly overriddenTiles = new Map<string, { packed: number; tile: TileInfo }>();
    private readonly bounds: { width: number; height: number; wrapX: boolean; wrapY: boolean } | undefined;
    private chunkSize: number | undefined;

    constructor(options: SparseWorldChunkStoreOptions = {}) {
        const bounded = options.width !== undefined || options.height !== undefined;
        if (bounded) {
            if (!Number.isInteger(options.width) || (options.width as number) <= 0
                || !Number.isInteger(options.height) || (options.height as number) <= 0) {
                throw new RangeError("bounded sparse stores require positive integer width and height");
            }
            this.bounds = {
                width: options.width as number,
                height: options.height as number,
                wrapX: options.wrapX ?? false,
                wrapY: options.wrapY ?? false
            };
        }
        //`data` intentionally stays empty. The renderer reaches resident packed
        //tiles through getMapTile() -> tileAt(), avoiding one object, one string
        //key and two reference-count maps per logical cell.
        this.map = this.bounds
            ? {
                data: {},
                w: this.bounds.width,
                h: this.bounds.height,
                wrapX: this.bounds.wrapX,
                wrapY: this.bounds.wrapY,
                tileAt: (x, y) => this.getTile(x, y),
                forEachTile: visit => this.forEachCoreTile(visit)
            }
            : {
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

    public static tileKey(x: number, y: number): string {
        return `${x},${y}`;
    }

    public add(chunk: PackedWorldChunk): Point[] {
        assertPackedWorldChunk(chunk);
        if (this.chunkSize !== undefined && chunk.chunkSize !== this.chunkSize) {
            throw new TypeError("all sparse world chunks must use the same chunkSize");
        }
        this.chunkSize = chunk.chunkSize;
        const key = SparseWorldChunkStore.key(chunk.chunkX, chunk.chunkY);
        if (this.chunks.has(key)) return this.corePoints(chunk);
        this.chunks.set(key, chunk);
        return this.corePoints(chunk);
    }

    public remove(chunkX: number, chunkY: number): void {
        const key = SparseWorldChunkStore.key(chunkX, chunkY);
        if (!this.chunks.has(key)) return;
        this.chunks.delete(key);
        if (this.chunks.size === 0) this.chunkSize = undefined;
    }

    public hasCoreTile(x: number, y: number): boolean {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === undefined) return false;
        const point = this.normalizePoint(x, y);
        if (!point) return false;
        return this.hasChunk(Math.floor(point.x / this.chunkSize), Math.floor(point.y / this.chunkSize));
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

    public get tileOverrideCount(): number {
        return this.tileOverrides.size;
    }

    public getTileOverride(x: number, y: number): WorldTileOverride | undefined {
        const value = this.tileOverrides.get(SparseWorldChunkStore.tileKey(x, y));
        return value ? cloneWorldTileOverride(value) : undefined;
    }

    public setTileOverride(x: number, y: number, changes: WorldTileOverride): boolean {
        return this.setTileOverrides([{ x, y, changes }]).length > 0;
    }

    public setTileOverrides(changes: readonly WorldTileOverrideChange[]): Point[] {
        if (!Array.isArray(changes)) throw new TypeError("tile override changes must be an array");
        const prepared = new Map<string, { x: number; y: number; value: WorldTileOverride | undefined }>();
        //Validate and reduce the complete batch before mutating storage. This
        //makes duplicate-coordinate edits atomic and lets net-zero batches
        //avoid cache invalidation, persistence and revision bumps.
        for (const change of changes) {
            if (!change || typeof change !== "object") {
                throw new TypeError("tile override change must be an object");
            }
            const { x, y } = change;
            if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
                throw new RangeError("tile override coordinates must be safe integers");
            }
            assertWorldTileOverride(change.changes);
            const key = SparseWorldChunkStore.tileKey(x, y);
            const previous = prepared.has(key) ? prepared.get(key)!.value : this.tileOverrides.get(key);
            const merged = { ...previous, ...cloneWorldTileOverride(change.changes) };
            prepared.set(key, { x, y, value: hasWorldTileOverride(merged) ? merged : undefined });
        }

        const changed: Point[] = [];
        for (const [key, next] of prepared) {
            if (worldTileOverridesEqual(this.tileOverrides.get(key), next.value)) continue;
            if (next.value) this.tileOverrides.set(key, next.value);
            else this.tileOverrides.delete(key);
            this.overriddenTiles.delete(key);
            changed.push({ x: next.x, y: next.y });
        }
        return changed;
    }

    public clearTileOverride(x: number, y: number): boolean {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
        const key = SparseWorldChunkStore.tileKey(x, y);
        this.overriddenTiles.delete(key);
        return this.tileOverrides.delete(key);
    }

    public clearTileOverrides(): void {
        this.tileOverrides.clear();
        this.overriddenTiles.clear();
    }

    private getTile(x: number, y: number): TileInfo | undefined {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === undefined) return undefined;
        const point = this.normalizePoint(x, y);
        if (!point) return undefined;
        const ownerX = Math.floor(point.x / this.chunkSize);
        const ownerY = Math.floor(point.y / this.chunkSize);
        const direct = this.tileFromChunk(this.chunks.get(SparseWorldChunkStore.key(ownerX, ownerY)), point.x, point.y);
        if (direct) return direct;

        //A core owner can be absent while an adjacent resident chunk still
        //provides this coordinate through its one-cell halo.
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                if (dx === 0 && dy === 0) continue;
                const candidate = this.resolveChunk(ownerX + dx, ownerY + dy);
                if (!candidate) continue;
                const tile = this.tileFromChunk(
                    this.chunks.get(SparseWorldChunkStore.key(candidate.x, candidate.y)),
                    point.x,
                    point.y
                );
                if (tile) return tile;
            }
        }
        return undefined;
    }

    private tileFromChunk(chunk: PackedWorldChunk | undefined, x: number, y: number): TileInfo | undefined {
        if (!chunk) return undefined;
        const xSamples = this.bounds?.wrapX ? [x, x - this.bounds.width, x + this.bounds.width] : [x];
        const ySamples = this.bounds?.wrapY ? [y, y - this.bounds.height, y + this.bounds.height] : [y];
        const originX = chunk.chunkX * chunk.chunkSize;
        const originY = chunk.chunkY * chunk.chunkSize;
        //The final chunk of a bounded world may contain fewer core cells than
        //chunkSize. Its packed payload is still square, but the unused slots are
        //generation/storage padding rather than resident cells. Restrict lookup
        //to the real core extent plus the one-cell halo so wrapped samples cannot
        //expose several unloaded cells at the opposite world edge.
        const coreWidth = this.bounds
            ? Math.max(0, Math.min(chunk.chunkSize, this.bounds.width - originX))
            : chunk.chunkSize;
        const coreHeight = this.bounds
            ? Math.max(0, Math.min(chunk.chunkSize, this.bounds.height - originY))
            : chunk.chunkSize;
        let packed: number | undefined;
        let localX = 0;
        let localY = 0;
        outer: for (const sampleX of xSamples) {
            for (const sampleY of ySamples) {
                const candidateX = sampleX - originX;
                const candidateY = sampleY - originY;
                if (candidateX < -chunk.padding || candidateX >= coreWidth + chunk.padding
                    || candidateY < -chunk.padding || candidateY >= coreHeight + chunk.padding) continue;
                localX = candidateX;
                localY = candidateY;
                packed = chunk.tiles[(localX + chunk.padding) * chunk.stride + localY + chunk.padding];
                break outer;
            }
        }
        if (packed === undefined) return undefined;
        let base = this.decodedTiles.get(packed);
        if (!base) {
            base = decodeWorldChunkTile(chunk, localX, localY);
            if (base.modifiers) Object.freeze(base.modifiers);
            Object.freeze(base);
            this.decodedTiles.set(packed, base);
        }
        const key = SparseWorldChunkStore.tileKey(x, y);
        const changes = this.tileOverrides.get(key);
        if (!changes) return base;
        const cached = this.overriddenTiles.get(key);
        if (cached?.packed === packed) return cached.tile;
        const tile: TileInfo = { ...base, ...changes };
        if (tile.modifiers) tile.modifiers = [...tile.modifiers];
        if (tile.rivers) tile.rivers = tile.rivers.map(river => ({ ...river }));
        if (tile.city) tile.city = { ...tile.city };
        if (tile.modifiers) Object.freeze(tile.modifiers);
        if (tile.rivers) {
            for (const river of tile.rivers) Object.freeze(river);
            Object.freeze(tile.rivers);
        }
        if (tile.city) Object.freeze(tile.city);
        Object.freeze(tile);
        this.overriddenTiles.set(key, { packed, tile });
        return tile;
    }

    private forEachCoreTile(visit: (tile: TileInfo, x: number, y: number) => void): void {
        for (const chunk of this.chunks.values()) {
            const originX = chunk.chunkX * chunk.chunkSize;
            const originY = chunk.chunkY * chunk.chunkSize;
            const width = this.bounds ? Math.min(chunk.chunkSize, this.bounds.width - originX) : chunk.chunkSize;
            const height = this.bounds ? Math.min(chunk.chunkSize, this.bounds.height - originY) : chunk.chunkSize;
            for (let localX = 0; localX < width; localX += 1) {
                for (let localY = 0; localY < height; localY += 1) {
                    visit(this.tileFromChunk(chunk, originX + localX, originY + localY)!, originX + localX, originY + localY);
                }
            }
        }
    }

    private corePoints(chunk: PackedWorldChunk): Point[] {
        if (!this.bounds) return getWorldChunkCorePoints(chunk);
        const originX = chunk.chunkX * chunk.chunkSize;
        const originY = chunk.chunkY * chunk.chunkSize;
        const width = Math.max(0, Math.min(chunk.chunkSize, this.bounds.width - originX));
        const height = Math.max(0, Math.min(chunk.chunkSize, this.bounds.height - originY));
        const points: Point[] = [];
        for (let localX = 0; localX < width; localX += 1) {
            for (let localY = 0; localY < height; localY += 1) {
                points.push({ x: originX + localX, y: originY + localY });
            }
        }
        return points;
    }

    private normalizePoint(x: number, y: number): Point | undefined {
        if (!this.bounds) return { x, y };
        const nx = this.bounds.wrapX ? ((x % this.bounds.width) + this.bounds.width) % this.bounds.width : x;
        const ny = this.bounds.wrapY ? ((y % this.bounds.height) + this.bounds.height) % this.bounds.height : y;
        if (nx < 0 || nx >= this.bounds.width || ny < 0 || ny >= this.bounds.height) return undefined;
        return { x: nx, y: ny };
    }

    private resolveChunk(chunkX: number, chunkY: number): Point | undefined {
        if (!this.bounds || this.chunkSize === undefined) return { x: chunkX, y: chunkY };
        const countX = Math.ceil(this.bounds.width / this.chunkSize);
        const countY = Math.ceil(this.bounds.height / this.chunkSize);
        const x = this.bounds.wrapX ? ((chunkX % countX) + countX) % countX : chunkX;
        const y = this.bounds.wrapY ? ((chunkY % countY) + countY) % countY : chunkY;
        if (x < 0 || x >= countX || y < 0 || y >= countY) return undefined;
        return { x, y };
    }

    public clear(): void {
        this.chunks.clear();
        this.decodedTiles.clear();
        this.tileOverrides.clear();
        this.overriddenTiles.clear();
        this.chunkSize = undefined;
    }
}
