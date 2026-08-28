import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";

export interface WorldNoiseFieldProfile {
    readonly salt: number;
    readonly openScale: number;
    readonly toroidalScale: number;
    readonly octaves: number;
    readonly minimumToroidalCells: number;
}

export interface WorldStyleProfile {
    readonly generatorVersion: typeof WORLD_GENERATOR_VERSION;
    readonly fields: {
        readonly warpX: WorldNoiseFieldProfile;
        readonly warpY: WorldNoiseFieldProfile;
        readonly continent: WorldNoiseFieldProfile;
        readonly detail: WorldNoiseFieldProfile;
        readonly ridge: WorldNoiseFieldProfile;
        readonly valley: WorldNoiseFieldProfile;
        readonly roughness: WorldNoiseFieldProfile;
        readonly moisture: WorldNoiseFieldProfile;
        readonly temperature: WorldNoiseFieldProfile;
        readonly openWarpAmplitude: number;
        readonly toroidalWarpAmplitude: number;
        readonly continentWeight: number;
        readonly detailWeight: number;
        readonly landMaskStart: number;
        readonly landMaskEnd: number;
        readonly ridgeExponent: number;
        readonly ridgeWeight: number;
        readonly valleyMaskStart: number;
        readonly valleyMaskEnd: number;
        readonly valleyExponent: number;
        readonly valleyWeight: number;
        readonly elevationBias: number;
        readonly moistureNoiseWeight: number;
        readonly moistureValleyWeight: number;
        readonly moistureRidgeWeight: number;
        readonly temperatureNoiseMinimum: number;
        readonly temperatureNoiseWeight: number;
        readonly temperatureLatitudeWeight: number;
        readonly temperatureElevationStart: number;
        readonly temperatureElevationWeight: number;
        readonly temperatureLatitudeNoiseWeight: number;
        readonly boundedEdgePower: number;
        readonly boundedEdgeFalloff: number;
    };
    readonly terrain: {
        readonly seaLevel: number;
        readonly mountainElevation: number;
        readonly mountainRidge: number;
        readonly mountainPeakElevation: number;
        readonly snowTemperature: number;
        readonly tundraTemperature: number;
        readonly sandTemperature: number;
        readonly sandMoisture: number;
        readonly hillElevation: number;
    };
    readonly relief: {
        readonly shoreline: number;
        readonly staticMountain: number;
        readonly mountainElevationStart: number;
        readonly mountainElevationSpan: number;
        readonly mountainMinimum: number;
        readonly mountainPower: number;
        readonly mountainScale: number;
        readonly mountainMaximum: number;
    };
    readonly vegetation: {
        readonly moistureStart: number;
        readonly densityScale: number;
        readonly maximumDensity: number;
        readonly placementSalt: number;
        readonly palmTemperature: number;
        readonly piniaTemperature: number;
    };
    readonly lakes: {
        readonly minimumElevation: number;
        readonly maximumElevation: number;
        readonly minimumMoisture: number;
        readonly placementThreshold: number;
        readonly placementSalt: number;
    };
}

const field = (
    salt: number,
    openScale: number,
    toroidalScale: number,
    octaves: number,
    minimumToroidalCells: number
): WorldNoiseFieldProfile => Object.freeze({
    salt,
    openScale,
    toroidalScale,
    octaves,
    minimumToroidalCells
});

// Generator v3's constants are centralized without changing their values.
// The next intentional generator upgrade replaces this single profile rather
// than growing a second set of thresholds inside individual call sites.
export const WORLD_STYLE_PROFILE: Readonly<WorldStyleProfile> = Object.freeze({
    generatorVersion: WORLD_GENERATOR_VERSION,
    fields: Object.freeze({
        warpX: field(0x51ed270b, 0.018, 0.022, 3, 2),
        warpY: field(0x68bc21eb, 0.018, 0.022, 3, 2),
        continent: field(0, 0.052, 0.052, 5, 2),
        detail: field(0xa341316c, 0.145, 0.145, 3, 3),
        ridge: field(0x9e3779b9, 0.032, 0.032, 4, 2),
        valley: field(0x7f4a7c15, 0.024, 0.024, 3, 2),
        roughness: field(0x94d049bb, 0.31, 0.31, 3, 4),
        moisture: field(0xc8013ea4, 0.08, 0.08, 4, 2),
        temperature: field(0xad90777d, 0.035, 0.035, 3, 2),
        openWarpAmplitude: 15,
        toroidalWarpAmplitude: 0.12,
        continentWeight: 0.72,
        detailWeight: 0.16,
        landMaskStart: 0.38,
        landMaskEnd: 0.68,
        ridgeExponent: 2.35,
        ridgeWeight: 0.27,
        valleyMaskStart: 0.34,
        valleyMaskEnd: 0.7,
        valleyExponent: 3.1,
        valleyWeight: 0.075,
        elevationBias: 0.01,
        moistureNoiseWeight: 0.86,
        moistureValleyWeight: 0.18,
        moistureRidgeWeight: 0.08,
        temperatureNoiseMinimum: 0.18,
        temperatureNoiseWeight: 0.74,
        temperatureLatitudeWeight: 0.82,
        temperatureElevationStart: 0.55,
        temperatureElevationWeight: 0.8,
        temperatureLatitudeNoiseWeight: 0.18,
        boundedEdgePower: 3,
        boundedEdgeFalloff: 0.58
    }),
    terrain: Object.freeze({
        seaLevel: 0.43,
        mountainElevation: 0.7,
        mountainRidge: 0.2,
        mountainPeakElevation: 0.82,
        snowTemperature: 0.18,
        tundraTemperature: 0.34,
        sandTemperature: 0.68,
        sandMoisture: 0.42,
        hillElevation: 0.62
    }),
    relief: Object.freeze({
        shoreline: 0,
        staticMountain: 1,
        mountainElevationStart: 0.68,
        mountainElevationSpan: 0.22,
        mountainMinimum: 0.08,
        mountainPower: 1.3,
        mountainScale: 1.12,
        mountainMaximum: 1.35
    }),
    vegetation: Object.freeze({
        moistureStart: 0.48,
        densityScale: 1.5,
        maximumDensity: 0.58,
        placementSalt: 0x27d4eb2f,
        palmTemperature: 0.67,
        piniaTemperature: 0.4
    }),
    lakes: Object.freeze({
        minimumElevation: 0.455,
        maximumElevation: 0.56,
        minimumMoisture: 0.74,
        placementThreshold: 0.94,
        placementSalt: 0x6c8e9cf5
    })
});

const finite = (name: string, value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
    }
    return value;
};

const positive = (name: string, value: unknown): number => {
    const number = finite(name, value);
    if (number <= 0) throw new RangeError(`${name} must be positive`);
    return number;
};

const nonNegative = (name: string, value: unknown): number => {
    const number = finite(name, value);
    if (number < 0) throw new RangeError(`${name} must be non-negative`);
    return number;
};

const unitInterval = (name: string, value: unknown): number => {
    const number = finite(name, value);
    if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
    return number;
};

function assertFiniteNumbers(value: object, path: string): void {
    for (const [name, candidate] of Object.entries(value)) {
        const key = path ? `${path}.${name}` : name;
        if (typeof candidate === "number") finite(key, candidate);
        else if (candidate && typeof candidate === "object") assertFiniteNumbers(candidate, key);
    }
}

export function assertWorldStyleProfile(value: unknown): asserts value is WorldStyleProfile {
    if (!value || typeof value !== "object") throw new TypeError("world style profile must be an object");
    const profile = value as Partial<WorldStyleProfile>;
    if (profile.generatorVersion !== WORLD_GENERATOR_VERSION) {
        throw new RangeError("world style profile generatorVersion is unsupported");
    }
    if (!profile.fields || !profile.terrain || !profile.relief || !profile.vegetation || !profile.lakes) {
        throw new TypeError("world style profile groups are required");
    }
    assertFiniteNumbers(profile as object, "");
    const noiseFieldNames = [
        "warpX", "warpY", "continent", "detail", "ridge",
        "valley", "roughness", "moisture", "temperature"
    ] as const;
    for (const name of noiseFieldNames) {
        const candidate = profile.fields[name];
        if (!candidate || typeof candidate !== "object") {
            throw new TypeError(`fields.${name} must be a noise field profile`);
        }
        const noise = candidate as Partial<WorldNoiseFieldProfile>;
        positive(`fields.${name}.openScale`, noise.openScale);
        positive(`fields.${name}.toroidalScale`, noise.toroidalScale);
        if (!Number.isInteger(noise.octaves) || (noise.octaves as number) <= 0) {
            throw new RangeError(`fields.${name}.octaves must be a positive integer`);
        }
        if (!Number.isInteger(noise.minimumToroidalCells) || (noise.minimumToroidalCells as number) <= 0) {
            throw new RangeError(`fields.${name}.minimumToroidalCells must be a positive integer`);
        }
        if (!Number.isSafeInteger(noise.salt)) throw new RangeError(`fields.${name}.salt must be a safe integer`);
    }
    const nonNegativeFieldNames = [
        "openWarpAmplitude", "toroidalWarpAmplitude", "continentWeight", "detailWeight",
        "ridgeWeight", "valleyWeight", "moistureNoiseWeight", "moistureValleyWeight",
        "moistureRidgeWeight", "temperatureNoiseMinimum", "temperatureNoiseWeight",
        "temperatureLatitudeWeight", "temperatureElevationStart", "temperatureElevationWeight",
        "temperatureLatitudeNoiseWeight", "boundedEdgeFalloff"
    ] as const;
    for (const name of nonNegativeFieldNames) nonNegative(`fields.${name}`, profile.fields[name]);
    finite("fields.elevationBias", profile.fields.elevationBias);
    unitInterval("fields.landMaskStart", profile.fields.landMaskStart);
    unitInterval("fields.landMaskEnd", profile.fields.landMaskEnd);
    unitInterval("fields.valleyMaskStart", profile.fields.valleyMaskStart);
    unitInterval("fields.valleyMaskEnd", profile.fields.valleyMaskEnd);
    if (!(profile.fields.landMaskStart < profile.fields.landMaskEnd)
        || !(profile.fields.valleyMaskStart < profile.fields.valleyMaskEnd)) {
        throw new RangeError("world style field mask thresholds must be ordered");
    }
    positive("fields.ridgeExponent", profile.fields.ridgeExponent);
    positive("fields.valleyExponent", profile.fields.valleyExponent);
    positive("fields.boundedEdgePower", profile.fields.boundedEdgePower);
    const terrain = profile.terrain;
    const terrainNames = [
        "seaLevel", "mountainElevation", "mountainRidge", "mountainPeakElevation",
        "snowTemperature", "tundraTemperature", "sandTemperature", "sandMoisture", "hillElevation"
    ] as const;
    for (const name of terrainNames) unitInterval(`terrain.${name}`, terrain[name]);
    if (!(finite("terrain.mountainElevation", terrain.mountainElevation)
        < finite("terrain.mountainPeakElevation", terrain.mountainPeakElevation))) {
        throw new RangeError("terrain mountain thresholds must be ordered");
    }
    if (!(finite("terrain.snowTemperature", terrain.snowTemperature)
        < finite("terrain.tundraTemperature", terrain.tundraTemperature))) {
        throw new RangeError("terrain temperature thresholds must be ordered");
    }
    const relief = profile.relief;
    if (finite("relief.shoreline", relief.shoreline) < 0
        || finite("relief.staticMountain", relief.staticMountain) < 0
        || finite("relief.mountainMinimum", relief.mountainMinimum) < 0
        || finite("relief.mountainMaximum", relief.mountainMaximum) < 0) {
        throw new RangeError("relief heights must be non-negative");
    }
    positive("relief.mountainElevationSpan", relief.mountainElevationSpan);
    positive("relief.mountainPower", relief.mountainPower);
    positive("relief.mountainScale", relief.mountainScale);
    unitInterval("relief.mountainElevationStart", relief.mountainElevationStart);
    if (finite("relief.mountainMinimum", relief.mountainMinimum)
        > finite("relief.mountainMaximum", relief.mountainMaximum)) {
        throw new RangeError("relief mountain range must be ordered");
    }
    const lakes = profile.lakes;
    unitInterval("lakes.minimumElevation", lakes.minimumElevation);
    unitInterval("lakes.maximumElevation", lakes.maximumElevation);
    unitInterval("lakes.minimumMoisture", lakes.minimumMoisture);
    unitInterval("lakes.placementThreshold", lakes.placementThreshold);
    if (!(finite("lakes.minimumElevation", lakes.minimumElevation)
        < finite("lakes.maximumElevation", lakes.maximumElevation))) {
        throw new RangeError("lake elevation thresholds must be ordered");
    }
    unitInterval("vegetation.moistureStart", profile.vegetation.moistureStart);
    unitInterval("vegetation.maximumDensity", profile.vegetation.maximumDensity);
    unitInterval("vegetation.palmTemperature", profile.vegetation.palmTemperature);
    unitInterval("vegetation.piniaTemperature", profile.vegetation.piniaTemperature);
    positive("vegetation.densityScale", profile.vegetation.densityScale);
    if (!(profile.vegetation.piniaTemperature < profile.vegetation.palmTemperature)) {
        throw new RangeError("vegetation temperature thresholds must be ordered");
    }
    if (!Number.isSafeInteger(profile.vegetation.placementSalt)
        || !Number.isSafeInteger(profile.lakes.placementSalt)) {
        throw new RangeError("world style placement salts must be safe integers");
    }
}

assertWorldStyleProfile(WORLD_STYLE_PROFILE);
