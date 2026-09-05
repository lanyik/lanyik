import {
    fractalNoise2D,
    periodicFractalNoise2D,
    seedToUint32
} from "./noise";
import {
    assertWorldStyleProfile,
    WORLD_STYLE_PROFILE,
    WorldNoiseFieldProfile,
    WorldStyleProfile
} from "./WorldStyleProfile";

export const LANDFORM_SEA_LEVEL = WORLD_STYLE_PROFILE.terrain.seaLevel;

export type LandformDomain =
    | { topology: "infinite" }
    | { topology: "bounded"; width: number; height: number }
    | { topology: "toroidal"; width: number; height: number };

export interface LandformSamplerOptions {
    seed: string | number;
    domain?: LandformDomain;
}

export interface LandformSample {
    /** Normalized macro height. Values may extend slightly beyond 0..1 at extremes. */
    elevation: number;
    /** Broad continental mass before ridge uplift and valley erosion. */
    continentalness: number;
    /** Continuous mountain-chain signal, 0 away from a ridge and 1 on its spine. */
    ridge: number;
    /** Continuous erosion/valley signal used by later hydrology work. */
    valley: number;
    /** High-frequency surface variation, independent of terrain classification. */
    roughness: number;
    moisture: number;
    temperature: number;
    /** Low-frequency regional forest suitability field. */
    forestPatch: number;
    /** Continent-scale standing-water field; lower values are open sea. */
    ocean: number;
}

export interface LandformSampler {
    readonly numericSeed: number;
    readonly domain: LandformDomain;
    sample(x: number, y: number): LandformSample;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
};

function assertDimension(name: "width" | "height", value: number): void {
    if (!Number.isSafeInteger(value) || value < 2) {
        throw new RangeError(`landform ${name} must be a safe integer >= 2`);
    }
}

function resolveDomain(domain: LandformDomain | undefined): LandformDomain {
    const resolved = domain ?? { topology: "infinite" };
    if (resolved.topology !== "infinite" && resolved.topology !== "bounded" && resolved.topology !== "toroidal") {
        throw new TypeError("landform topology must be infinite, bounded or toroidal");
    }
    if (resolved.topology !== "infinite") {
        assertDimension("width", resolved.width);
        assertDimension("height", resolved.height);
    }
    return Object.freeze({ ...resolved });
}

function composeSample(
    continent: number,
    detail: number,
    ridgeNoise: number,
    valleyNoise: number,
    roughness: number,
    moistureNoise: number,
    temperatureNoise: number,
    forestPatch: number,
    oceanNoise: number,
    latitude: number | undefined,
    edgeFalloff: number,
    profile: Readonly<WorldStyleProfile>
): LandformSample {
    // Both ridges and valleys start as long, thin bands. Domain warping is
    // applied by the callers before these fields are sampled, which keeps the
    // bands from following the noise lattice and gives them geological bends.
    const fields = profile.fields;
    const landMask = smoothstep(fields.landMaskStart, fields.landMaskEnd, continent);
    const ridge = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), fields.ridgeExponent) * landMask;
    const valley = Math.pow(1 - Math.abs(valleyNoise * 2 - 1), fields.valleyExponent)
        * smoothstep(fields.valleyMaskStart, fields.valleyMaskEnd, continent);
    const elevation = continent * fields.continentWeight
        + detail * fields.detailWeight
        + ridge * fields.ridgeWeight
        - valley * fields.valleyWeight
        + fields.elevationBias
        - edgeFalloff;
    const moisture = clamp01(moistureNoise * fields.moistureNoiseWeight
        + valley * fields.moistureValleyWeight
        - ridge * fields.moistureRidgeWeight);
    const temperature = clamp01(latitude === undefined
        ? fields.temperatureNoiseMinimum + temperatureNoise * fields.temperatureNoiseWeight
            - Math.max(0, elevation - fields.temperatureElevationStart) * fields.temperatureElevationWeight
        : 1 - latitude * fields.temperatureLatitudeWeight
            - Math.max(0, elevation - fields.temperatureElevationStart) * fields.temperatureElevationWeight
            + (temperatureNoise - 0.5) * fields.temperatureLatitudeNoiseWeight);
    return {
        elevation,
        continentalness: continent,
        ridge,
        valley,
        roughness: clamp01(roughness),
        moisture,
        temperature,
        forestPatch: clamp01(forestPatch),
        ocean: oceanNoise - edgeFalloff
    };
}

function sampleOpenLandform(
    seed: number,
    x: number,
    y: number,
    domain: Extract<LandformDomain, { topology: "infinite" | "bounded" }>,
    profile: Readonly<WorldStyleProfile>
): LandformSample {
    const fields = profile.fields;
    const open = (field: WorldNoiseFieldProfile, sampleX: number, sampleY: number) =>
        fractalNoise2D(seed ^ field.salt, sampleX * field.openScale, sampleY * field.openScale, field.octaves);
    const warpX = (open(fields.warpX, x, y) - 0.5) * fields.openWarpAmplitude;
    const warpY = (open(fields.warpY, x, y) - 0.5) * fields.openWarpAmplitude;
    const wx = x + warpX;
    const wy = y + warpY;
    const continent = open(fields.continent, wx, wy);
    const detail = open(fields.detail, wx, wy);
    const ridgeNoise = open(fields.ridge, wx, wy);
    const valleyNoise = open(fields.valley, wx, wy);
    const rough = open(fields.roughness, wx, wy);
    const moisture = open(fields.moisture, wx, wy);
    const temperature = open(fields.temperature, wx, wy);
    const forestPatch = open(fields.forestPatch, wx, wy);
    // Coastlines use unwarped world coordinates and their own much broader
    // field. Terrain detail can shape relief near a shore but cannot fragment
    // the ocean mask into high-frequency noise.
    const ocean = open(fields.ocean, x, y);

    if (domain.topology === "infinite") {
        return composeSample(
            continent, detail, ridgeNoise, valleyNoise, rough, moisture, temperature,
            forestPatch, ocean, undefined, 0, profile
        );
    }
    const nx = (x / (domain.width - 1)) * 2 - 1;
    const ny = (y / (domain.height - 1)) * 2 - 1;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    const boundedOcean = ocean + (1 - edge * edge) * fields.boundedCenterOceanLift;
    return composeSample(
        continent,
        detail,
        ridgeNoise,
        valleyNoise,
        rough,
        moisture,
        temperature,
        forestPatch,
        boundedOcean,
        Math.abs(ny),
        Math.pow(edge, fields.boundedEdgePower) * fields.boundedEdgeFalloff,
        profile
    );
}

function sampleToroidalLandform(
    seed: number,
    x: number,
    y: number,
    domain: Extract<LandformDomain, { topology: "toroidal" }>,
    profile: Readonly<WorldStyleProfile>
): LandformSample {
    const fields = profile.fields;
    const nx = x / domain.width;
    const ny = y / domain.height;
    const periodic = (field: WorldNoiseFieldProfile, u: number, v: number) =>
        periodicFractalNoise2D(
            seed ^ field.salt,
            u,
            v,
            Math.max(field.minimumToroidalCells, Math.round(domain.width * field.toroidalScale)),
            Math.max(field.minimumToroidalCells, Math.round(domain.height * field.toroidalScale)),
            field.octaves
        );
    const warpX = (periodic(fields.warpX, nx, ny) - 0.5) * fields.toroidalWarpAmplitude;
    const warpY = (periodic(fields.warpY, nx, ny) - 0.5) * fields.toroidalWarpAmplitude;
    const wx = nx + warpX;
    const wy = ny + warpY;
    const continent = periodic(fields.continent, wx, wy);
    const detail = periodic(fields.detail, wx, wy);
    const ridgeNoise = periodic(fields.ridge, wx, wy);
    const valleyNoise = periodic(fields.valley, wx, wy);
    const rough = periodic(fields.roughness, wx, wy);
    const moisture = periodic(fields.moisture, wx, wy);
    const temperature = periodic(fields.temperature, wx, wy);
    const forestPatch = periodic(fields.forestPatch, wx, wy);
    const ocean = periodic(fields.ocean, nx, ny);
    const latitude = 0.5 + 0.5 * Math.cos(ny * Math.PI * 2);
    return composeSample(
        continent, detail, ridgeNoise, valleyNoise, rough, moisture, temperature,
        forestPatch, ocean, latitude, 0, profile
    );
}

export function createLandformSampler(options: LandformSamplerOptions): LandformSampler {
    return createLandformSamplerForProfile(options, WORLD_STYLE_PROFILE);
}

export function createLandformSamplerForProfile(
    options: LandformSamplerOptions,
    profile: Readonly<WorldStyleProfile>
): LandformSampler {
    if (!options || typeof options !== "object") throw new TypeError("landform sampler options are required");
    if (typeof options.seed !== "string" && typeof options.seed !== "number") {
        throw new TypeError("landform seed must be a string or number");
    }
    if (typeof options.seed === "number" && !Number.isFinite(options.seed)) {
        throw new RangeError("numeric landform seed must be finite");
    }
    assertWorldStyleProfile(profile);
    const numericSeed = seedToUint32(options.seed);
    const domain = resolveDomain(options.domain);
    return {
        numericSeed,
        domain,
        sample(x: number, y: number): LandformSample {
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                throw new RangeError("landform coordinates must be finite numbers");
            }
            return domain.topology === "toroidal"
                ? sampleToroidalLandform(numericSeed, x, y, domain, profile)
                : sampleOpenLandform(numericSeed, x, y, domain, profile);
        }
    };
}

export function sampleLandform(
    seed: string | number,
    x: number,
    y: number,
    domain?: LandformDomain
): LandformSample {
    return createLandformSampler({ seed, domain }).sample(x, y);
}
