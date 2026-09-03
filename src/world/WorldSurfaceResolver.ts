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
import { createWorldWaterSampler, WorldWaterSampler } from "./WorldWaterSampler";

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
    visitGeneratedWaterTiles(
        originX: number,
        originY: number,
        width: number,
        height: number,
        visit: (x: number, y: number) => void
    ): void;
    createWindow(): WorldSurfaceResolverWindow;
}

const isWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
};
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
    // Permanent snow follows a climate-dependent elevation line instead of
    // turning every cold lowland cell white. Deep cold lowers the line towards
    // the foothills, but never to the shoreline; mountain summits receive their
    // finer, continuous snow cover in the terrain shader.
    const snowColdness = terrain.snowTemperature > 0
        ? clamp01((terrain.snowTemperature - sample.temperature) / terrain.snowTemperature)
        : 0;
    const minimumSnowElevation = terrain.seaLevel
        + (terrain.hillElevation - terrain.seaLevel) * 0.45;
    const snowElevation = terrain.hillElevation
        - (terrain.hillElevation - minimumSnowElevation) * snowColdness;
    if (sample.temperature < terrain.snowTemperature
        && sample.elevation > snowElevation) return Land.snow;
    if (sample.temperature < terrain.tundraTemperature) return Land.tundra;
    if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return Land.sand;
    return Land.land;
}

function generatedRelief(
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): number {
    const relief = profile.relief;
    if (sample.elevation < profile.terrain.seaLevel) return relief.shoreline;
    const landElevation = Math.max(0, sample.elevation - profile.terrain.seaLevel);
    const plain = relief.plainMinimum
        + landElevation * relief.plainElevationScale
        + sample.roughness * relief.plainRoughnessScale
        - sample.valley * relief.valleyDepth;
    const hill = smoothstep(relief.hillElevationStart, relief.hillElevationEnd, sample.elevation)
        * relief.hillScale;
    const mountainT = Math.max(
        0,
        (sample.elevation - relief.mountainElevationStart) / relief.mountainElevationSpan
    );
    const mountain = Math.pow(mountainT, relief.mountainPower) * relief.mountainScale
        + sample.ridge * clamp01(mountainT) * relief.mountainRidgeScale;
    return Math.max(
        relief.shoreline,
        Math.min(relief.mountainMaximum, plain + hill + mountain)
    );
}

function biomeWeightsFor(
    type: Land,
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): WorldBiomeWeights {
    if (isWater(type)) return Object.freeze({ temperate: 0, dry: 0, cold: 0, alpine: 0 });
    const terrain = profile.terrain;
    const transition = terrain.climateTransition;
    const cold = 1 - smoothstep(
        terrain.snowTemperature - transition,
        terrain.tundraTemperature + transition,
        sample.temperature
    );
    const dry = smoothstep(
        terrain.sandTemperature - transition,
        terrain.sandTemperature + transition,
        sample.temperature
    ) * (1 - smoothstep(
        terrain.sandMoisture - transition,
        terrain.sandMoisture + transition,
        sample.moisture
    ));
    const alpine = clamp01(Math.max(
        type === Land.mountain ? 0.7 : 0,
        smoothstep(
            terrain.mountainElevation - transition,
            terrain.mountainPeakElevation,
            sample.elevation
        ) * (0.45 + sample.ridge * 0.55)
    ));
    const temperate = Math.max(0.02, (1 - cold) * (1 - dry) * (1 - alpine));
    const sum = temperate + dry + cold + alpine;
    return Object.freeze({
        temperate: temperate / sum,
        dry: dry / sum,
        cold: cold / sum,
        alpine: alpine / sum
    });
}

function biomeFor(type: Land, weights: WorldBiomeWeights): WorldBiome {
    if (type === Land.sea || type === Land.coastal) return type === Land.coastal ? "coast" : "ocean";
    const weighted: Array<[WorldBiome, number]> = [
        ["temperate", weights.temperate],
        ["dry", weights.dry],
        ["cold", weights.cold],
        ["alpine", weights.alpine]
    ];
    return weighted.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

function vegetationDensityFor(
    type: Land,
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): number {
    if (isWater(type) || type === Land.mountain || type === Land.snow) return 0;
    const vegetation = profile.vegetation;
    const moisture = smoothstep(vegetation.moistureStart, vegetation.moistureFull, sample.moisture);
    const cold = smoothstep(
        vegetation.temperatureMinimum - vegetation.temperatureTransition,
        vegetation.temperatureMinimum + vegetation.temperatureTransition,
        sample.temperature
    );
    const heat = 1 - smoothstep(
        vegetation.temperatureMaximum - vegetation.temperatureTransition,
        vegetation.temperatureMaximum + vegetation.temperatureTransition,
        sample.temperature
    );
    const patch = vegetation.patchMinimum + (1 - vegetation.patchMinimum)
        * smoothstep(vegetation.patchStart, vegetation.patchFull, sample.forestPatch);
    const slope = clamp01(1
        - sample.ridge * vegetation.ridgePenalty
        - sample.roughness * vegetation.roughnessPenalty);
    return Math.min(
        vegetation.maximumDensity,
        moisture * cold * heat * patch * slope * vegetation.densityScale
    );
}

function lakePotentialFor(
    type: Land,
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): number {
    if (isWater(type) || type === Land.mountain || type === Land.snow) return 0;
    const lakes = profile.lakes;
    const elevation = smoothstep(lakes.minimumElevation, lakes.minimumElevation + 0.035, sample.elevation)
        * (1 - smoothstep(lakes.maximumElevation - 0.05, lakes.maximumElevation, sample.elevation));
    const moisture = smoothstep(lakes.minimumMoisture, lakes.fullMoisture, sample.moisture);
    const valley = smoothstep(lakes.valleyStart, lakes.valleyFull, sample.valley);
    const patch = smoothstep(lakes.patchStart, lakes.patchFull, sample.lakePatch);
    return clamp01(elevation * moisture * valley * patch);
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
    const biomeWeights = biomeWeightsFor(baseTerrain, landform, profile);
    const biome = biomeFor(baseTerrain, biomeWeights);
    const vegetationDensity = vegetationDensityFor(baseTerrain, landform, profile);
    const lakePotential = lakePotentialFor(baseTerrain, landform, profile);
    return Object.freeze({
        baseTerrain,
        relief: generatedRelief(landform, profile),
        biome,
        biomeWeights,
        vegetationDensity,
        vegetationKind: vegetationDensity > 0 ? vegetationKindFor(landform, profile) : undefined,
        lakePotential,
        landform
    });
}

type SampleAt = (x: number, y: number) => Readonly<WorldSurfaceSample> | undefined;
type WaterAt = (x: number, y: number) => boolean;

function isGeneratedLake(
    numericSeed: number,
    profile: Readonly<WorldStyleProfile>,
    x: number,
    y: number,
    sampleAt: SampleAt,
    waterAt: WaterAt,
    sample: Readonly<WorldSurfaceSample> | undefined = sampleAt(x, y)
): boolean {
    if (!sample) return false;
    const lakes = profile.lakes;
    const isCandidate = (
        candidate: Readonly<WorldSurfaceSample> | undefined,
        tileX: number,
        tileY: number
    ): boolean => Boolean(candidate && !waterAt(tileX, tileY)
        && candidate.lakePotential >= lakes.minimumPotential
        && randomAt(numericSeed, tileX, tileY, lakes.placementSalt)
            < candidate.lakePotential * lakes.placementScale);
    if (!isCandidate(sample, x, y)) return false;
    const lakeNeighbors = getNeighbors(x, y).reduce((count, neighbor) => {
        const adjacent = sampleAt(neighbor.x, neighbor.y);
        return count + (isCandidate(adjacent, neighbor.x, neighbor.y) ? 1 : 0);
    }, 0);
    return lakeNeighbors >= lakes.minimumNeighbors;
}

function resolveTile(
    numericSeed: number,
    profile: Readonly<WorldStyleProfile>,
    x: number,
    y: number,
    sampleAt: SampleAt,
    waterAt: WaterAt
): Readonly<TileInfo> {
    const sample = sampleAt(x, y);
    if (!sample) throw new RangeError("world surface coordinate is outside the generated domain");
    let type = sample.baseTerrain;
    if (isWater(type) || waterAt(x, y)) {
        const touchesLand = getNeighbors(x, y).some(neighbor => {
            const adjacent = sampleAt(neighbor.x, neighbor.y);
            return adjacent !== undefined && !isWater(adjacent.baseTerrain)
                && !waterAt(neighbor.x, neighbor.y);
        });
        type = touchesLand ? Land.coastal : Land.sea;
    }

    const tile: TileInfo = { type };
    if (isWater(type) || type === Land.mountain) return Object.freeze(tile);

    const modifiers: string[] = [];
    if (type === Land.snow) {
        // Generated snow is constrained to foothills and higher, so it must
        // retain hill relief instead of being flattened by the ordinary-land
        // clamp.
        modifiers.push("hill");
        tile.modifiers = modifiers;
        Object.freeze(modifiers);
        return Object.freeze(tile);
    }
    const lake = isGeneratedLake(numericSeed, profile, x, y, sampleAt, waterAt, sample);
    if (lake) {
        modifiers.push("lake");
    } else {
        if (sample.landform.elevation > profile.terrain.hillElevation) modifiers.push("hill");
        const forest = sample.vegetationDensity
            + (randomAt(numericSeed, x, y, profile.vegetation.placementSalt) - 0.5)
                * profile.vegetation.placementJitter
            >= profile.vegetation.placementThreshold;
        if (forest) {
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
    private readonly waterSampler: WorldWaterSampler;

    constructor(options: WorldSurfaceResolverOptions) {
        if (!options || typeof options !== "object") throw new TypeError("world surface resolver options are required");
        this.seed = String(options.seed);
        this.profile = options.profile ?? WORLD_STYLE_PROFILE;
        this.sampler = createLandformSamplerForProfile({ seed: options.seed, domain: options.domain }, this.profile);
        this.domain = Object.freeze({ ...this.sampler.domain });
        this.waterSampler = createWorldWaterSampler(this.sampler.numericSeed, this.domain, this.profile);
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
            },
            (waterX, waterY) => this.waterSampler.isWaterTile(waterX, waterY)
        );
    }

    public visitGeneratedWaterTiles(
        originX: number,
        originY: number,
        width: number,
        height: number,
        visit: (x: number, y: number) => void
    ): void {
        if (typeof visit !== "function") throw new TypeError("generated water visitor must be a function");
        const window = this.createWindow();
        try {
            this.waterSampler.forEachWaterTile(originX, originY, width, height, (x, y) => {
                const sample = window.sampleGenerated(x, y);
                if (sample && !isWater(sample.baseTerrain)) visit(x, y);
            });
        } finally {
            window.clear();
        }
    }

    public createWindow(): WorldSurfaceResolverWindow {
        return new WorldSurfaceResolverWindow(this, this.sampler.numericSeed, this.waterSampler);
    }
}

export class WorldSurfaceResolverWindow {
    private readonly samples = new Map<string, Readonly<WorldSurfaceSample>>();
    private readonly tiles = new Map<string, Readonly<TileInfo>>();

    constructor(
        private readonly resolver: WorldSurfaceResolver,
        private readonly numericSeed: number,
        private readonly waterSampler: WorldWaterSampler
    ) {}

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
                (sampleX, sampleY) => this.sampleGenerated(sampleX, sampleY),
                (waterX, waterY) => this.waterSampler.isWaterTile(waterX, waterY)
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
