import {
    fractalNoise2D,
    periodicFractalNoise2D,
    seedToUint32
} from "./noise";

export const LANDFORM_SEA_LEVEL = 0.43;

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
    if (!Number.isInteger(value) || value < 2) {
        throw new RangeError(`landform ${name} must be an integer >= 2`);
    }
}

function resolveDomain(domain: LandformDomain | undefined): LandformDomain {
    const resolved = domain ?? { topology: "infinite" };
    if (resolved.topology !== "infinite") {
        assertDimension("width", resolved.width);
        assertDimension("height", resolved.height);
    }
    return { ...resolved };
}

function composeSample(
    continent: number,
    detail: number,
    ridgeNoise: number,
    valleyNoise: number,
    roughness: number,
    moistureNoise: number,
    temperatureNoise: number,
    latitude: number | undefined,
    edgeFalloff: number
): LandformSample {
    // Both ridges and valleys start as long, thin bands. Domain warping is
    // applied by the callers before these fields are sampled, which keeps the
    // bands from following the noise lattice and gives them geological bends.
    const landMask = smoothstep(0.38, 0.68, continent);
    const ridge = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), 2.35) * landMask;
    const valley = Math.pow(1 - Math.abs(valleyNoise * 2 - 1), 3.1) * smoothstep(0.34, 0.7, continent);
    const elevation = continent * 0.72
        + detail * 0.16
        + ridge * 0.27
        - valley * 0.075
        + 0.01
        - edgeFalloff;
    const moisture = clamp01(moistureNoise * 0.86 + valley * 0.18 - ridge * 0.08);
    const temperature = clamp01(latitude === undefined
        ? 0.18 + temperatureNoise * 0.74 - Math.max(0, elevation - 0.55) * 0.8
        : 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8
            + (temperatureNoise - 0.5) * 0.18);
    return {
        elevation,
        continentalness: continent,
        ridge,
        valley,
        roughness: clamp01(roughness),
        moisture,
        temperature
    };
}

function sampleOpenLandform(
    seed: number,
    x: number,
    y: number,
    domain: Extract<LandformDomain, { topology: "infinite" | "bounded" }>
): LandformSample {
    const warpX = (fractalNoise2D(seed ^ 0x51ed270b, x * 0.018, y * 0.018, 3) - 0.5) * 15;
    const warpY = (fractalNoise2D(seed ^ 0x68bc21eb, x * 0.018, y * 0.018, 3) - 0.5) * 15;
    const wx = x + warpX;
    const wy = y + warpY;
    const continent = fractalNoise2D(seed, wx * 0.052, wy * 0.052, 5);
    const detail = fractalNoise2D(seed ^ 0xa341316c, wx * 0.145, wy * 0.145, 3);
    const ridgeNoise = fractalNoise2D(seed ^ 0x9e3779b9, wx * 0.032, wy * 0.032, 4);
    const valleyNoise = fractalNoise2D(seed ^ 0x7f4a7c15, wx * 0.024, wy * 0.024, 3);
    const rough = fractalNoise2D(seed ^ 0x94d049bb, wx * 0.31, wy * 0.31, 3);
    const moisture = fractalNoise2D(seed ^ 0xc8013ea4, wx * 0.08, wy * 0.08, 4);
    const temperature = fractalNoise2D(seed ^ 0xad90777d, wx * 0.035, wy * 0.035, 3);

    if (domain.topology === "infinite") {
        return composeSample(continent, detail, ridgeNoise, valleyNoise, rough, moisture, temperature, undefined, 0);
    }
    const nx = (x / (domain.width - 1)) * 2 - 1;
    const ny = (y / (domain.height - 1)) * 2 - 1;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    return composeSample(
        continent,
        detail,
        ridgeNoise,
        valleyNoise,
        rough,
        moisture,
        temperature,
        Math.abs(ny),
        Math.pow(edge, 3) * 0.58
    );
}

function sampleToroidalLandform(
    seed: number,
    x: number,
    y: number,
    domain: Extract<LandformDomain, { topology: "toroidal" }>
): LandformSample {
    const nx = x / domain.width;
    const ny = y / domain.height;
    const cells = (scale: number, dimension: number, minimum: number) =>
        Math.max(minimum, Math.round(dimension * scale));
    const periodic = (salt: number, u: number, v: number, scale: number, minimum: number, octaves: number) =>
        periodicFractalNoise2D(
            seed ^ salt,
            u,
            v,
            cells(scale, domain.width, minimum),
            cells(scale, domain.height, minimum),
            octaves
        );
    const warpX = (periodic(0x51ed270b, nx, ny, 0.022, 2, 3) - 0.5) * 0.12;
    const warpY = (periodic(0x68bc21eb, nx, ny, 0.022, 2, 3) - 0.5) * 0.12;
    const wx = nx + warpX;
    const wy = ny + warpY;
    const continent = periodic(0, wx, wy, 0.052, 2, 5);
    const detail = periodic(0xa341316c, wx, wy, 0.145, 3, 3);
    const ridgeNoise = periodic(0x9e3779b9, wx, wy, 0.032, 2, 4);
    const valleyNoise = periodic(0x7f4a7c15, wx, wy, 0.024, 2, 3);
    const rough = periodic(0x94d049bb, wx, wy, 0.31, 4, 3);
    const moisture = periodic(0xc8013ea4, wx, wy, 0.08, 2, 4);
    const temperature = periodic(0xad90777d, wx, wy, 0.035, 2, 3);
    const latitude = 0.5 + 0.5 * Math.cos(ny * Math.PI * 2);
    return composeSample(continent, detail, ridgeNoise, valleyNoise, rough, moisture, temperature, latitude, 0);
}

export function createLandformSampler(options: LandformSamplerOptions): LandformSampler {
    if (!options || typeof options !== "object") throw new TypeError("landform sampler options are required");
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
                ? sampleToroidalLandform(numericSeed, x, y, domain)
                : sampleOpenLandform(numericSeed, x, y, domain);
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
