import { Land } from "../enums";
import { getHexCenter } from "../helpers/helpers";
import { getNeighborCoords } from "../helpers/neighbors";
import { assertWrappableMap, getMapTile, normalizeMapCoordinates } from "../helpers/topology";
import { MapInfo, Point, TileInfo } from "../interfaces";
import {
    WorldSurfaceResolver,
    WorldSurfaceResolverWindow,
    WorldSurfaceSample
} from "./WorldSurfaceResolver";
import { WORLD_STYLE_PROFILE } from "./WorldStyleProfile";

export interface WorldSurfaceAnchor {
    readonly revision: number;
    readonly minimumHeight: number;
    readonly maximumHeight: number;
    getTileCenterHeight(x: number, y: number): number;
    /** Logical X/Z coordinates before floating-origin render translation. */
    getWorldHeight(worldX: number, worldZ: number): number;
}

export interface WorldSurfaceView extends WorldSurfaceAnchor {
    readonly map: MapInfo;
    readonly resolver?: WorldSurfaceResolver;
    readonly tileSize: number;
    readonly mountainHeight: number;
    getEffectiveRelief(x: number, y: number): number;
    getEffectiveVegetationDensity(x: number, y: number): number;
    createWindow(): WorldSurfaceWindow;
    setMountainHeight(value: number): boolean;
    invalidate(): number;
}

export interface WorldSurfaceViewOptions {
    map: MapInfo;
    resolver?: WorldSurfaceResolver;
    tileSize: number;
    mountainHeight: number;
}

interface SurfaceContribution {
    readonly shoreline: boolean;
    readonly relief: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
    Math.max(minimum, Math.min(maximum, value));

const CORNER_DIRECTIONS = [
    ["NE", "SE"],
    ["SE", "S"],
    ["S", "SW"],
    ["SW", "NW"],
    ["NW", "N"],
    ["N", "NE"]
] as const;

const CORNER_VECTORS = [
    { x: 1, y: 0 },
    { x: 0.5, y: Math.sqrt(3) / 2 },
    { x: -0.5, y: Math.sqrt(3) / 2 },
    { x: -1, y: 0 },
    { x: -0.5, y: -Math.sqrt(3) / 2 },
    { x: 0.5, y: -Math.sqrt(3) / 2 }
] as const;

function assertTileCoordinates(x: number, y: number): void {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new RangeError("world surface tile coordinates must be safe integers");
    }
}

function assertMapMatchesResolver(map: MapInfo, resolver: WorldSurfaceResolver | undefined): void {
    if (!resolver) return;
    const domain = resolver.domain;
    if (domain.topology === "infinite") {
        if (!map.infinite || map.wrapX || map.wrapY) {
            throw new TypeError("infinite surface resolver does not match the map topology");
        }
        return;
    }
    if (map.infinite || map.w !== domain.width || map.h !== domain.height) {
        throw new TypeError("surface resolver dimensions do not match the map");
    }
    const toroidal = domain.topology === "toroidal";
    if (Boolean(map.wrapX) !== toroidal || Boolean(map.wrapY) !== toroidal) {
        throw new TypeError("surface resolver wrapping does not match the map topology");
    }
}

function isShoreline(tile: TileInfo | undefined): boolean {
    return !tile || tile.type === Land.sea || tile.type === Land.coastal
        || Boolean(tile.modifiers?.includes("lake"));
}

function nearestTile(worldX: number, worldZ: number, size: number): Point {
    const approximateX = worldX / (size * 1.5);
    const approximateY = worldZ / (size * Math.sqrt(3));
    const x0 = Math.floor(approximateX);
    const y0 = Math.floor(approximateY);
    let best = { x: x0, y: y0 };
    let bestDistance = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
            const candidate = { x: x0 + dx, y: y0 + dy };
            const center = getHexCenter(candidate.x, candidate.y, size);
            const distance = (center.x - worldX) ** 2 + (center.y - worldZ) ** 2;
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }
    }
    return best;
}

class MutableWorldSurfaceView implements WorldSurfaceView {
    public readonly map: MapInfo;
    public readonly resolver?: WorldSurfaceResolver;
    public readonly tileSize: number;
    private displayRevision = 0;
    private displayMountainHeight: number;

    constructor(options: WorldSurfaceViewOptions) {
        if (!options || typeof options !== "object" || !options.map) {
            throw new TypeError("world surface view options with a map are required");
        }
        if (!Number.isFinite(options.tileSize) || options.tileSize <= 0) {
            throw new RangeError("world surface tileSize must be a positive finite number");
        }
        if (!Number.isFinite(options.mountainHeight) || options.mountainHeight < 0) {
            throw new RangeError("world surface mountainHeight must be a non-negative finite number");
        }
        assertWrappableMap(options.map);
        assertMapMatchesResolver(options.map, options.resolver);
        this.map = options.map;
        this.resolver = options.resolver;
        this.tileSize = options.tileSize;
        this.displayMountainHeight = options.mountainHeight;
    }

    public get revision(): number { return this.displayRevision; }
    public get mountainHeight(): number { return this.displayMountainHeight; }
    public get minimumHeight(): number { return 0; }
    public get maximumHeight(): number {
        return this.displayMountainHeight * (this.resolver?.profile.relief.mountainMaximum ?? 1);
    }

    public setMountainHeight(value: number): boolean {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError("world surface mountainHeight must be a non-negative finite number");
        }
        if (value === this.displayMountainHeight) return false;
        this.displayMountainHeight = value;
        this.displayRevision += 1;
        return true;
    }

    public invalidate(): number {
        this.displayRevision += 1;
        return this.displayRevision;
    }

    public getEffectiveRelief(x: number, y: number): number {
        return this.createWindow().getEffectiveRelief(x, y);
    }

    public getEffectiveVegetationDensity(x: number, y: number): number {
        return this.createWindow().getEffectiveVegetationDensity(x, y);
    }

    public getTileCenterHeight(x: number, y: number): number {
        return this.createWindow().getTileCenterHeight(x, y);
    }

    public getWorldHeight(worldX: number, worldZ: number): number {
        if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
            throw new RangeError("world surface coordinates must be finite numbers");
        }
        return this.createWindow().getWorldHeight(worldX, worldZ);
    }

    public createWindow(): WorldSurfaceWindow {
        return new WorldSurfaceWindow(this);
    }
}

export class WorldSurfaceWindow {
    private readonly contributions = new Map<string, SurfaceContribution>();
    private readonly corners = new Map<string, readonly number[]>();
    private readonly samples = new Map<string, Readonly<WorldSurfaceSample>>();
    private readonly generatedTiles = new Map<string, Readonly<TileInfo>>();
    private readonly vegetation = new Map<string, number>();
    private readonly resolverWindow?: WorldSurfaceResolverWindow;

    constructor(private readonly surface: WorldSurfaceView) {
        this.resolverWindow = surface.resolver?.createWindow();
    }

    private key(x: number, y: number): string {
        const point = normalizeMapCoordinates(this.surface.map, x, y);
        return point ? `${point.x},${point.y}` : `outside:${x},${y}`;
    }

    public sampleGenerated(x: number, y: number): Readonly<WorldSurfaceSample> | undefined {
        assertTileCoordinates(x, y);
        const resolver = this.surface.resolver;
        if (!resolver) return undefined;
        const point = normalizeMapCoordinates(this.surface.map, x, y);
        if (!point) return undefined;
        const key = `${point.x},${point.y}`;
        let sample = this.samples.get(key);
        if (!sample) {
            sample = this.resolverWindow!.sampleGenerated(point.x, point.y)!;
            this.samples.set(key, sample);
        }
        return sample;
    }

    private resolveGeneratedTile(x: number, y: number): Readonly<TileInfo> | undefined {
        const resolver = this.surface.resolver;
        if (!resolver) return undefined;
        const point = normalizeMapCoordinates(this.surface.map, x, y);
        if (!point) return undefined;
        const key = `${point.x},${point.y}`;
        let tile = this.generatedTiles.get(key);
        if (!tile) {
            tile = this.resolverWindow!.resolveGeneratedTile(point.x, point.y);
            this.generatedTiles.set(key, tile);
        }
        return tile;
    }

    private contribution(x: number, y: number): SurfaceContribution {
        assertTileCoordinates(x, y);
        const key = this.key(x, y);
        let contribution = this.contributions.get(key);
        if (contribution) return contribution;
        const tile = getMapTile(this.surface.map, x, y);
        const sample = this.sampleGenerated(x, y);
        const profile = this.surface.resolver?.profile ?? WORLD_STYLE_PROFILE;
        if (isShoreline(tile)) {
            contribution = { shoreline: true, relief: 0 };
        } else if (tile?.type === Land.mountain) {
            contribution = {
                shoreline: false,
                relief: sample
                    ? clamp(sample.relief, profile.relief.mountainMinimum, profile.relief.mountainMaximum)
                    : profile.relief.staticMountain
            };
        } else if (tile?.modifiers?.includes("hill")) {
            contribution = {
                shoreline: false,
                relief: sample
                    ? clamp(sample.relief, profile.relief.hillMinimum, profile.relief.hillMaximum)
                    : profile.relief.staticHill
            };
        } else {
            contribution = {
                shoreline: false,
                relief: sample
                    ? clamp(sample.relief, profile.relief.plainMinimum, profile.relief.plainMaximum)
                    : 0
            };
        }
        this.contributions.set(key, contribution);
        return contribution;
    }

    public getEffectiveRelief(x: number, y: number): number {
        return this.contribution(x, y).relief;
    }

    public getEffectiveVegetationDensity(x: number, y: number): number {
        assertTileCoordinates(x, y);
        const key = this.key(x, y);
        const cached = this.vegetation.get(key);
        if (cached !== undefined) return cached;
        const tile = getMapTile(this.surface.map, x, y);
        let density = 0;
        if (!isShoreline(tile) && tile?.type !== Land.mountain && tile?.type !== Land.snow
            && tile?.modifiers?.includes("wood")) {
            const sample = this.sampleGenerated(x, y);
            const profile = this.surface.resolver?.profile ?? WORLD_STYLE_PROFILE;
            const generatedWood = this.resolveGeneratedTile(x, y)?.modifiers?.includes("wood") === true;
            density = generatedWood
                ? sample?.vegetationDensity ?? profile.vegetation.neutralDensity
                : Math.max(sample?.vegetationDensity ?? 0, profile.vegetation.neutralDensity);
        }
        density = clamp(density, 0, 1);
        this.vegetation.set(key, density);
        return density;
    }

    public isShoreline(x: number, y: number): boolean {
        return this.contribution(x, y).shoreline;
    }

    public getCornerReliefs(x: number, y: number): readonly number[] {
        const key = this.key(x, y);
        let values = this.corners.get(key);
        if (values) return values;
        const center = this.contribution(x, y);
        values = Object.freeze(CORNER_DIRECTIONS.map(([firstDirection, secondDirection]) => {
            const first = getNeighborCoords(x, y, firstDirection);
            const second = getNeighborCoords(x, y, secondDirection);
            const firstContribution = this.contribution(first.x, first.y);
            const secondContribution = this.contribution(second.x, second.y);
            if (center.shoreline || firstContribution.shoreline || secondContribution.shoreline) return 0;
            return (center.relief + firstContribution.relief + secondContribution.relief) / 3;
        }));
        this.corners.set(key, values);
        return values;
    }

    public getTileCenterHeight(x: number, y: number): number {
        const corners = this.getCornerReliefs(x, y);
        return corners.reduce((sum, height) => sum + height, 0) / corners.length * this.surface.mountainHeight;
    }

    public getWorldHeight(worldX: number, worldZ: number): number {
        const tile = nearestTile(worldX, worldZ, this.surface.tileSize);
        if (!getMapTile(this.surface.map, tile.x, tile.y)) return this.surface.minimumHeight;
        const center = getHexCenter(tile.x, tile.y, this.surface.tileSize);
        const localX = (worldX - center.x) / this.surface.tileSize;
        const localZ = (worldZ - center.y) / this.surface.tileSize;
        let angle = Math.atan2(localZ, localX);
        if (angle < 0) angle += Math.PI * 2;
        const cornerIndex = Math.min(5, Math.floor(angle / (Math.PI / 3)));
        const nextCornerIndex = (cornerIndex + 1) % 6;
        const first = CORNER_VECTORS[cornerIndex];
        const second = CORNER_VECTORS[nextCornerIndex];
        const determinant = first.x * second.y - first.y * second.x;
        const firstWeight = (localX * second.y - localZ * second.x) / determinant;
        const secondWeight = (first.x * localZ - first.y * localX) / determinant;
        const corners = this.getCornerReliefs(tile.x, tile.y);
        const centerRelief = corners.reduce((sum, height) => sum + height, 0) / corners.length;
        const relief = centerRelief * (1 - firstWeight - secondWeight)
            + corners[cornerIndex] * firstWeight
            + corners[nextCornerIndex] * secondWeight;
        return Math.max(0, relief) * this.surface.mountainHeight;
    }

    public clear(): void {
        this.contributions.clear();
        this.corners.clear();
        this.samples.clear();
        this.generatedTiles.clear();
        this.vegetation.clear();
        this.resolverWindow?.clear();
    }
}

export function createWorldSurfaceView(options: WorldSurfaceViewOptions): WorldSurfaceView {
    return new MutableWorldSurfaceView(options);
}
