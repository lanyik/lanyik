import { Land } from "../enums";
import { getNeighbors } from "../helpers/neighbors";
import { Point, TileInfo } from "../interfaces";
import {
    createLandformSamplerForProfile,
    LandformDomain,
    LandformSample,
    LandformSampler
} from "./LandformSampler";
import { randomAt } from "./noise";
import { WORLD_STYLE_PROFILE, WorldStyleProfile } from "./WorldStyleProfile";

export type WorldBiome = "ocean" | "coast" | "temperate" | "dry" | "cold" | "alpine";

export interface WorldBiomeWeights {
    readonly temperate: number;
    readonly dry: number;
    readonly cold: number;
    readonly alpine: number;
}

export interface WorldSurfaceSample {
    readonly baseTerrain: Land;
    readonly relief: number;
    readonly biome: WorldBiome;
    readonly biomeWeights: WorldBiomeWeights;
    readonly vegetationDensity: number;
    readonly vegetationKind?: "palm" | "pinia" | "oak";
    readonly lakePotential: number;
    readonly landform: Readonly<LandformSample>;
}

export interface WorldSurfaceResolverOptions {
    seed: string | number;
    domain?: LandformDomain;
    profile?: Readonly<WorldStyleProfile>;
}

export interface WorldSurfaceResolver {
    readonly seed: string;
    readonly domain: LandformDomain;
    readonly profile: Readonly<WorldStyleProfile>;
    sampleGenerated(x: number, y: number): Readonly<WorldSurfaceSample>;
    resolveGeneratedTile(x: number, y: number): Readonly<TileInfo>;
    createWindow(): WorldSurfaceResolverWindow;
}

const isWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const modulo = (value: number, period: number): number => ((value % period) + period) % period;

function assertTileCoordinates(x: number, y: number): void {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new RangeError("world surface coordinates must be safe integers");
    }
}

function normalizeCoordinates(domain: LandformDomain, x: number, y: number): Point | undefined {
    assertTileCoordinates(x, y);
    if (domain.topology === "infinite") return { x, y };
    if (domain.topology === "toroidal") {
        return { x: modulo(x, domain.width), y: modulo(y, domain.height) };
    }
    return x >= 0 && x < domain.width && y >= 0 && y < domain.height ? { x, y } : undefined;
}

function classifyTerrain(sample: LandformSample, profile: Readonly<WorldStyleProfile>): Land {
    const terrain = profile.terrain;
    if (sample.elevation < terrain.seaLevel) return Land.sea;
    if ((sample.elevation > terrain.mountainElevation && sample.ridge > terrain.mountainRidge)
        || sample.elevation > terrain.mountainPeakElevation) return Land.mountain;
    if (sample.temperature < terrain.snowTemperature) return Land.snow;
    if (sample.temperature < terrain.tundraTemperature) return Land.tundra;
    if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return Land.sand;
    return Land.land;
}

function generatedRelief(
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): number {
    const relief = profile.relief;
    const elevationT = Math.max(0, (sample.elevation - relief.mountainElevationStart) / relief.mountainElevationSpan);
    return Math.min(
        relief.mountainMaximum,
        relief.mountainMinimum + Math.pow(elevationT, relief.mountainPower) * relief.mountainScale
    );
}

function biomeFor(type: Land): WorldBiome {
    if (type === Land.sea || type === Land.coastal) return type === Land.coastal ? "coast" : "ocean";
    if (type === Land.sand) return "dry";
    if (type === Land.tundra || type === Land.snow) return "cold";
    if (type === Land.mountain) return "alpine";
    return "temperate";
}

function biomeWeightsFor(biome: WorldBiome): WorldBiomeWeights {
    return Object.freeze({
        temperate: biome === "temperate" ? 1 : 0,
        dry: biome === "dry" ? 1 : 0,
        cold: biome === "cold" ? 1 : 0,
        alpine: biome === "alpine" ? 1 : 0
    });
}

function vegetationKindFor(
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): "palm" | "pinia" | "oak" {
    return sample.temperature > profile.vegetation.palmTemperature
        ? "palm"
        : sample.temperature < profile.vegetation.piniaTemperature
            ? "pinia"
            : "oak";
}

function sampleSurface(
    sampler: LandformSampler,
    profile: Readonly<WorldStyleProfile>,
    x: number,
    y: number
): Readonly<WorldSurfaceSample> {
    const landform = Object.freeze({ ...sampler.sample(x, y) });
    const baseTerrain = classifyTerrain(landform, profile);
    const biome = biomeFor(baseTerrain);
    const vegetationDensity = isWater(baseTerrain) || baseTerrain === Land.mountain || baseTerrain === Land.snow
        ? 0
        : clamp01(Math.min(
            profile.vegetation.maximumDensity,
            (landform.moisture - profile.vegetation.moistureStart) * profile.vegetation.densityScale
        ));
    const lakePotential = baseTerrain === Land.land
        && landform.elevation > profile.lakes.minimumElevation
        && landform.elevation < profile.lakes.maximumElevation
        && landform.moisture > profile.lakes.minimumMoisture
        ? 1
        : 0;
    return Object.freeze({
        baseTerrain,
        relief: generatedRelief(landform, profile),
        biome,
        biomeWeights: biomeWeightsFor(biome),
        vegetationDensity,
        vegetationKind: vegetationDensity > 0 ? vegetationKindFor(landform, profile) : undefined,
        lakePotential,
        landform
    });
}

type SampleAt = (x: number, y: number) => Readonly<WorldSurfaceSample> | undefined;

function resolveTile(
    numericSeed: number,
    profile: Readonly<WorldStyleProfile>,
    x: number,
    y: number,
    sampleAt: SampleAt
): Readonly<TileInfo> {
    const sample = sampleAt(x, y);
    if (!sample) throw new RangeError("world surface coordinate is outside the generated domain");
    let type = sample.baseTerrain;
    if (type === Land.sea) {
        const touchesLand = getNeighbors(x, y).some(neighbor => {
            const adjacent = sampleAt(neighbor.x, neighbor.y);
            return adjacent !== undefined && adjacent.baseTerrain !== Land.sea;
        });
        if (touchesLand) type = Land.coastal;
    }

    const tile: TileInfo = { type };
    if (isWater(type) || type === Land.mountain || type === Land.snow) return Object.freeze(tile);

    const modifiers: string[] = [];
    const lake = sample.lakePotential > 0
        && randomAt(numericSeed, x, y, profile.lakes.placementSalt) > profile.lakes.placementThreshold;
    if (lake) {
        modifiers.push("lake");
    } else {
        if (sample.landform.elevation > profile.terrain.hillElevation) modifiers.push("hill");
        if (randomAt(numericSeed, x, y, profile.vegetation.placementSalt) < sample.vegetationDensity) {
            modifiers.push("wood");
            tile.treeModel = `Assets/models/${sample.vegetationKind ?? "oak"}`;
        }
    }
    if (modifiers.length > 0) {
        tile.modifiers = modifiers;
        Object.freeze(modifiers);
    }
    return Object.freeze(tile);
}

class FrozenWorldSurfaceResolver implements WorldSurfaceResolver {
    public readonly seed: string;
    public readonly domain: LandformDomain;
    public readonly profile: Readonly<WorldStyleProfile>;
    private readonly sampler: LandformSampler;

    constructor(options: WorldSurfaceResolverOptions) {
        if (!options || typeof options !== "object") throw new TypeError("world surface resolver options are required");
        this.seed = String(options.seed);
        this.profile = options.profile ?? WORLD_STYLE_PROFILE;
        this.sampler = createLandformSamplerForProfile({ seed: options.seed, domain: options.domain }, this.profile);
        this.domain = Object.freeze({ ...this.sampler.domain });
    }

    public sampleGenerated(x: number, y: number): Readonly<WorldSurfaceSample> {
        const point = normalizeCoordinates(this.domain, x, y);
        if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
        return sampleSurface(this.sampler, this.profile, point.x, point.y);
    }

    public resolveGeneratedTile(x: number, y: number): Readonly<TileInfo> {
        const point = normalizeCoordinates(this.domain, x, y);
        if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
        return resolveTile(
            this.sampler.numericSeed,
            this.profile,
            point.x,
            point.y,
            (sampleX, sampleY) => {
                const normalized = normalizeCoordinates(this.domain, sampleX, sampleY);
                return normalized ? sampleSurface(this.sampler, this.profile, normalized.x, normalized.y) : undefined;
            }
        );
    }

    public createWindow(): WorldSurfaceResolverWindow {
        return new WorldSurfaceResolverWindow(this, this.sampler.numericSeed);
    }
}

export class WorldSurfaceResolverWindow {
    private readonly samples = new Map<string, Readonly<WorldSurfaceSample>>();
    private readonly tiles = new Map<string, Readonly<TileInfo>>();

    constructor(private readonly resolver: WorldSurfaceResolver, private readonly numericSeed: number) {}

    public sampleGenerated(x: number, y: number): Readonly<WorldSurfaceSample> | undefined {
        const point = normalizeCoordinates(this.resolver.domain, x, y);
        if (!point) return undefined;
        const key = `${point.x},${point.y}`;
        let sample = this.samples.get(key);
        if (!sample) {
            sample = this.resolver.sampleGenerated(point.x, point.y);
            this.samples.set(key, sample);
        }
        return sample;
    }

    public resolveGeneratedTile(x: number, y: number): Readonly<TileInfo> {
        const point = normalizeCoordinates(this.resolver.domain, x, y);
        if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
        const key = `${point.x},${point.y}`;
        let tile = this.tiles.get(key);
        if (!tile) {
            tile = resolveTile(
                this.numericSeed,
                this.resolver.profile,
                point.x,
                point.y,
                (sampleX, sampleY) => this.sampleGenerated(sampleX, sampleY)
            );
            this.tiles.set(key, tile);
        }
        return tile;
    }

    public clear(): void {
        this.samples.clear();
        this.tiles.clear();
    }
}

export function createWorldSurfaceResolver(options: WorldSurfaceResolverOptions): WorldSurfaceResolver {
    return new FrozenWorldSurfaceResolver(options);
}
