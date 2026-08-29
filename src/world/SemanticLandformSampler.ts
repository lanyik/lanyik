import { hashSafeIntegerCoordinates } from "./DeterministicHash";
import {
    composeLandformSample,
    LandformDomain,
    LandformSample,
    LandformSampler
} from "./LandformSampler";
import { seedToUint32 } from "./noise";
import {
    assertWorldStyleProfile,
    WorldNoiseFieldProfile,
    WorldStyleProfile
} from "./WorldStyleProfile";

const UINT32_MAX = 0xffff_ffff;

type SemanticLandformDomain = Extract<LandformDomain, { topology: "infinite" | "toroidal" }>;

export interface SemanticLandformSamplerOptions {
    readonly seed: string | number;
    readonly domain?: LandformDomain;
}

export const SEMANTIC_NOISE_BASE_CELL_SHIFTS = Object.freeze({
    warpX: 5,
    warpY: 5,
    continent: 5,
    detail: 3,
    ridge: 5,
    valley: 5,
    roughness: 3,
    moisture: 4,
    temperature: 5,
    forestPatch: 5,
    lakePatch: 5
} as const);

interface AxisPosition {
    readonly cell: number;
    readonly fraction: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

function assertSafeCoordinates(x: number, y: number): void {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new RangeError("semantic landform coordinates must be safe integers");
    }
}

function resolveDomain(domain: LandformDomain | undefined): SemanticLandformDomain {
    if (!domain || domain.topology === "infinite") return Object.freeze({ topology: "infinite" });
    if (domain.topology === "bounded") {
        throw new TypeError("v2 procedural semantic generation does not support a bounded domain");
    }
    if (!Number.isSafeInteger(domain.width) || !Number.isSafeInteger(domain.height)
        || domain.width < 32 || domain.height < 32
        || domain.width % 32 !== 0 || domain.height % 32 !== 0) {
        throw new RangeError("semantic toroidal dimensions must be safe integer multiples of 32");
    }
    return Object.freeze({ topology: "toroidal", width: domain.width, height: domain.height });
}

// The coordinate remains an integer tile identity. Scaling is expressed as a
// power-of-two cell size, so even the extrema of the safe-integer domain never
// need an imprecise x * frequency intermediate.
function axisPosition(coordinate: number, offset: number, cellShift: number): AxisPosition {
    const cellSize = 2 ** cellShift;
    let local = coordinate % cellSize;
    let cell = (coordinate - local) / cellSize;
    if (local < 0) {
        local += cellSize;
        cell -= 1;
    }
    local += offset;
    const crossedCells = Math.floor(local / cellSize);
    cell += crossedCells;
    local -= crossedCells * cellSize;
    if (!Number.isSafeInteger(cell)) {
        throw new RangeError("semantic noise cell escaped the safe-integer domain");
    }
    return { cell, fraction: smooth(local / cellSize) };
}

function safeValueNoise2D(
    seed: number,
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
    cellShift: number,
    wrapWidth?: number,
    wrapHeight?: number
): number {
    const xAxis = axisPosition(x, offsetX, cellShift);
    const yAxis = axisPosition(y, offsetY, cellShift);
    const cellSize = 2 ** cellShift;
    const periodX = wrapWidth === undefined ? undefined : wrapWidth / cellSize;
    const periodY = wrapHeight === undefined ? undefined : wrapHeight / cellSize;
    if ((periodX !== undefined && !Number.isSafeInteger(periodX))
        || (periodY !== undefined && !Number.isSafeInteger(periodY))) {
        throw new Error("semantic toroidal noise period is not aligned to its cell size");
    }
    const randomCell = (cellX: number, cellY: number): number => hashSafeIntegerCoordinates(
        seed,
        periodX === undefined ? cellX : positiveModulo(cellX, periodX),
        periodY === undefined ? cellY : positiveModulo(cellY, periodY)
    ) / UINT32_MAX;
    const top = lerp(
        randomCell(xAxis.cell, yAxis.cell),
        randomCell(xAxis.cell + 1, yAxis.cell),
        xAxis.fraction
    );
    const bottom = lerp(
        randomCell(xAxis.cell, yAxis.cell + 1),
        randomCell(xAxis.cell + 1, yAxis.cell + 1),
        xAxis.fraction
    );
    return lerp(top, bottom, yAxis.fraction);
}

function safeFractalNoise2D(
    seed: number,
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
    field: Readonly<WorldNoiseFieldProfile>,
    baseCellShift: number,
    wrapWidth?: number,
    wrapHeight?: number
): number {
    if (baseCellShift - field.octaves + 1 < 1) {
        throw new Error("semantic noise requires a minimum two-tile cell at its highest octave");
    }
    let amplitude = 1;
    let total = 0;
    let normalization = 0;
    for (let octave = 0; octave < field.octaves; octave += 1) {
        total += safeValueNoise2D(
            (seed + Math.imul(octave, 0x9e37_79b9)) >>> 0,
            x,
            y,
            offsetX,
            offsetY,
            baseCellShift - octave,
            wrapWidth,
            wrapHeight
        ) * amplitude;
        normalization += amplitude;
        amplitude *= 0.5;
    }
    return total / normalization;
}

function sampleSemanticLandform(
    seed: number,
    x: number,
    y: number,
    domain: SemanticLandformDomain,
    profile: Readonly<WorldStyleProfile>
): LandformSample {
    const fields = profile.fields;
    const wrapWidth = domain.topology === "toroidal" ? domain.width : undefined;
    const wrapHeight = domain.topology === "toroidal" ? domain.height : undefined;
    const sampleX = wrapWidth === undefined ? x : positiveModulo(x, wrapWidth);
    const sampleY = wrapHeight === undefined ? y : positiveModulo(y, wrapHeight);
    const field = (
        spec: Readonly<WorldNoiseFieldProfile>,
        shift: number,
        offsetX = 0,
        offsetY = 0
    ) => safeFractalNoise2D(
        (seed ^ spec.salt) >>> 0,
        sampleX,
        sampleY,
        offsetX,
        offsetY,
        spec,
        shift,
        wrapWidth,
        wrapHeight
    );
    const maximumWarpX = domain.topology === "toroidal"
        ? Math.min(fields.openWarpAmplitude, fields.toroidalWarpAmplitude * domain.width)
        : fields.openWarpAmplitude;
    const maximumWarpY = domain.topology === "toroidal"
        ? Math.min(fields.openWarpAmplitude, fields.toroidalWarpAmplitude * domain.height)
        : fields.openWarpAmplitude;
    const warpX = (field(fields.warpX, SEMANTIC_NOISE_BASE_CELL_SHIFTS.warpX) - 0.5) * maximumWarpX;
    const warpY = (field(fields.warpY, SEMANTIC_NOISE_BASE_CELL_SHIFTS.warpY) - 0.5) * maximumWarpY;
    const sample = (spec: Readonly<WorldNoiseFieldProfile>, shift: number) =>
        field(spec, shift, warpX, warpY);
    const continent = sample(fields.continent, SEMANTIC_NOISE_BASE_CELL_SHIFTS.continent);
    const detail = sample(fields.detail, SEMANTIC_NOISE_BASE_CELL_SHIFTS.detail);
    const ridge = sample(fields.ridge, SEMANTIC_NOISE_BASE_CELL_SHIFTS.ridge);
    const valley = sample(fields.valley, SEMANTIC_NOISE_BASE_CELL_SHIFTS.valley);
    const roughness = sample(fields.roughness, SEMANTIC_NOISE_BASE_CELL_SHIFTS.roughness);
    const moisture = sample(fields.moisture, SEMANTIC_NOISE_BASE_CELL_SHIFTS.moisture);
    const temperature = sample(fields.temperature, SEMANTIC_NOISE_BASE_CELL_SHIFTS.temperature);
    const forestPatch = sample(fields.forestPatch, SEMANTIC_NOISE_BASE_CELL_SHIFTS.forestPatch);
    const lakePatch = sample(fields.lakePatch, SEMANTIC_NOISE_BASE_CELL_SHIFTS.lakePatch);
    const latitude = domain.topology === "toroidal"
        ? 0.5 + 0.5 * Math.cos(sampleY / domain.height * Math.PI * 2)
        : undefined;
    return composeLandformSample(
        continent,
        detail,
        ridge,
        valley,
        roughness,
        moisture,
        temperature,
        forestPatch,
        lakePatch,
        latitude,
        0,
        profile
    );
}

export function createSemanticLandformSamplerForProfile(
    options: Readonly<SemanticLandformSamplerOptions>,
    profile: Readonly<WorldStyleProfile>
): LandformSampler {
    if (!options || typeof options !== "object") {
        throw new TypeError("semantic landform sampler options are required");
    }
    if (typeof options.seed !== "string" && typeof options.seed !== "number") {
        throw new TypeError("semantic landform seed must be a string or number");
    }
    if (typeof options.seed === "number" && !Number.isFinite(options.seed)) {
        throw new RangeError("numeric semantic landform seed must be finite");
    }
    assertWorldStyleProfile(profile);
    const numericSeed = seedToUint32(options.seed);
    const domain = resolveDomain(options.domain);
    return Object.freeze({
        numericSeed,
        domain,
        sample(x: number, y: number): LandformSample {
            assertSafeCoordinates(x, y);
            return sampleSemanticLandform(numericSeed, x, y, domain, profile);
        }
    });
}
