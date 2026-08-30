import {
    createLandformSamplerForProfile,
    LandformDomain,
    LandformSample,
    LandformSampler
} from "./LandformSampler";
import { WORLD_STYLE_PROFILE, WorldStyleProfile } from "./WorldStyleProfile";

export type WorldBiome = "ocean" | "coast" | "temperate" | "dry" | "cold" | "alpine";
export type GeneratedTerrainClass = "sea" | "coastal" | "land" | "sand" | "tundra" | "snow" | "mountain";

export interface WorldBiomeWeights {
    readonly temperate: number;
    readonly dry: number;
    readonly cold: number;
    readonly alpine: number;
}

export interface WorldSurfaceSample {
    readonly baseTerrain: GeneratedTerrainClass;
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
}

const isWater = (type: GeneratedTerrainClass): boolean => type === "sea" || type === "coastal";
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

function normalizeCoordinates(
    domain: LandformDomain,
    x: number,
    y: number
): Readonly<{ x: number; y: number }> | undefined {
    assertTileCoordinates(x, y);
    if (domain.topology === "infinite") return { x, y };
    if (domain.topology === "toroidal") {
        return { x: modulo(x, domain.width), y: modulo(y, domain.height) };
    }
    return x >= 0 && x < domain.width && y >= 0 && y < domain.height ? { x, y } : undefined;
}

function classifyTerrain(sample: LandformSample, profile: Readonly<WorldStyleProfile>): GeneratedTerrainClass {
    const terrain = profile.terrain;
    if (sample.elevation < terrain.seaLevel) return "sea";
    if ((sample.elevation > terrain.mountainElevation && sample.ridge > terrain.mountainRidge)
        || sample.elevation > terrain.mountainPeakElevation) return "mountain";
    if (sample.temperature < terrain.snowTemperature) return "snow";
    if (sample.temperature < terrain.tundraTemperature) return "tundra";
    if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return "sand";
    return "land";
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
    type: GeneratedTerrainClass,
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
        type === "mountain" ? 0.7 : 0,
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

function biomeFor(type: GeneratedTerrainClass, weights: WorldBiomeWeights): WorldBiome {
    if (type === "sea" || type === "coastal") return type === "coastal" ? "coast" : "ocean";
    const weighted: Array<[WorldBiome, number]> = [
        ["temperate", weights.temperate],
        ["dry", weights.dry],
        ["cold", weights.cold],
        ["alpine", weights.alpine]
    ];
    return weighted.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

function vegetationDensityFor(
    type: GeneratedTerrainClass,
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): number {
    if (isWater(type) || type === "mountain" || type === "snow") return 0;
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
    type: GeneratedTerrainClass,
    sample: LandformSample,
    profile: Readonly<WorldStyleProfile>
): number {
    if (isWater(type) || type === "mountain" || type === "snow") return 0;
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

}

export function createWorldSurfaceResolver(options: WorldSurfaceResolverOptions): WorldSurfaceResolver {
    return new FrozenWorldSurfaceResolver(options);
}
