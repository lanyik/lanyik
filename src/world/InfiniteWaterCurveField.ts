export interface WaterCurvePoint {
    readonly x: number;
    readonly y: number;
    readonly width: number;
}

export interface WaterCurvePath {
    readonly featureKey: number;
    readonly familyIndex: number;
    readonly ownerCellX: number;
    readonly ownerCellY: number;
    readonly ownerSlot: number;
    readonly pathIndex: number;
    readonly branch: boolean;
    readonly kind: "curve" | "polyline" | "branch";
    readonly points: readonly WaterCurvePoint[];
}

export interface WaterCurveBounds {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
}

export interface WaterBasinProfile {
    readonly density: number;
    readonly candidateCellSize: number;
    readonly minimumSeparation: number;
    readonly minimumMajorRadius: number;
    readonly maximumMajorRadius: number;
    readonly minimumMinorRatio: number;
    readonly maximumMinorRatio: number;
}

export interface WaterBasin {
    readonly featureKey: number;
    readonly ownerCellX: number;
    readonly ownerCellY: number;
    readonly centerX: number;
    readonly centerY: number;
    readonly cosine: number;
    readonly sine: number;
    readonly majorRadius: number;
    readonly minorRadius: number;
    readonly waveA: number;
    readonly waveB: number;
    readonly waveC: number;
    readonly phaseA: number;
    readonly phaseB: number;
    readonly phaseC: number;
}

export interface WaterCurveFamilyProfile {
    readonly cellSize: number;
    readonly slots: number;
    readonly spawnScale: number;
    readonly minimumLength: number;
    readonly maximumLength: number;
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly minimumControlStep: number;
    readonly maximumControlStep: number;
    readonly maximumBranches: number;
}

export interface InfiniteWaterCurveProfile {
    readonly density: number;
    readonly curvature: number;
    readonly polylineChance: number;
    readonly sampleSpacing: number;
    readonly minimumBranchLength: number;
    readonly maximumBranchLength: number;
    readonly broadDensityScale: number;
    readonly regionalDensityScale: number;
    readonly families: readonly WaterCurveFamilyProfile[];
    readonly basins: WaterBasinProfile;
}

export interface InfiniteWaterCurveField {
    readonly maximumReach: number;
    readonly maximumWidth: number;
    readonly maximumBasinReach: number;
    forEachPathIntersecting(bounds: WaterCurveBounds, visit: (path: WaterCurvePath) => void): void;
    forEachPathOwnedBy(bounds: WaterCurveBounds, visit: (path: WaterCurvePath) => void): void;
    forEachBasinIntersecting(bounds: WaterCurveBounds, visit: (basin: WaterBasin) => void): void;
    forEachBasinOwnedBy(bounds: WaterCurveBounds, visit: (basin: WaterBasin) => void): void;
}

const UINT32_RANGE = 0x1_0000_0000;
const TAU = Math.PI * 2;
const BASIN_WAVE_A_MINIMUM = 0.07;
const BASIN_WAVE_A_SPAN = 0.05;
const BASIN_WAVE_B_MINIMUM = 0.035;
const BASIN_WAVE_B_SPAN = 0.035;
const BASIN_WAVE_C_MINIMUM = 0.02;
const BASIN_WAVE_C_SPAN = 0.03;
const BASIN_MAXIMUM_BOUNDARY_SCALE = 1
    + BASIN_WAVE_A_MINIMUM + BASIN_WAVE_A_SPAN
    + BASIN_WAVE_B_MINIMUM + BASIN_WAVE_B_SPAN
    + BASIN_WAVE_C_MINIMUM + BASIN_WAVE_C_SPAN;

const REFERENCE_FAMILIES: readonly WaterCurveFamilyProfile[] = Object.freeze([
    Object.freeze({
        cellSize: 950 / 28,
        slots: 2,
        spawnScale: 0.34,
        minimumLength: 700 / 28,
        maximumLength: 2_600 / 28,
        minimumWidth: 27 / 28,
        maximumWidth: 42 / 28,
        minimumControlStep: 65 / 28,
        maximumControlStep: 125 / 28,
        maximumBranches: 1
    }),
    Object.freeze({
        cellSize: 2_300 / 28,
        slots: 2,
        spawnScale: 0.52,
        minimumLength: 2_200 / 28,
        maximumLength: 7_200 / 28,
        minimumWidth: 38 / 28,
        maximumWidth: 78 / 28,
        minimumControlStep: 115 / 28,
        maximumControlStep: 210 / 28,
        maximumBranches: 3
    }),
    Object.freeze({
        cellSize: 5_900 / 28,
        slots: 1,
        spawnScale: 0.62,
        minimumLength: 7_200 / 28,
        maximumLength: 17_000 / 28,
        minimumWidth: 76 / 28,
        maximumWidth: 162 / 28,
        minimumControlStep: 190 / 28,
        maximumControlStep: 310 / 28,
        maximumBranches: 5
    })
]);

const REFERENCE_BASINS: Readonly<WaterBasinProfile> = Object.freeze({
    // These values reproduce the inspector's reviewed 58% basin setting in
    // radius-one hex units. Basin diameters span several 24-cell source chunks
    // while Poisson separation preserves deterministic land corridors.
    density: 0.12 + 0.58 * 0.55,
    candidateCellSize: 2_600 / 28,
    minimumSeparation: 5_600 / 28,
    minimumMajorRadius: 1_250 * (0.82 + 0.58 * 0.22) / 28,
    maximumMajorRadius: 2_050 * (0.82 + 0.58 * 0.22) / 28,
    minimumMinorRatio: 0.55,
    maximumMinorRatio: 0.82
});

// These are the original infinite-water prototype's curve proportions in
// radius-one hex world units. Both the prototype and production world sampler
// consume this exact profile; only an explicit spatial scale may differ.
export const INFINITE_WATER_CURVE_REFERENCE_PROFILE: Readonly<InfiniteWaterCurveProfile>
    = Object.freeze({
        density: 0.46,
        curvature: 0.68,
        polylineChance: 0.34,
        sampleSpacing: 0.64,
        minimumBranchLength: 280 / 28,
        maximumBranchLength: 860 / 28,
        broadDensityScale: 11_000 / 28,
        regionalDensityScale: 4_800 / 28,
        families: REFERENCE_FAMILIES,
        basins: REFERENCE_BASINS
    });

function finite(name: string, value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
    }
    return value;
}

function positive(name: string, value: unknown): number {
    const number = finite(name, value);
    if (number <= 0) throw new RangeError(`${name} must be positive`);
    return number;
}

function unitInterval(name: string, value: unknown): number {
    const number = finite(name, value);
    if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
    return number;
}

export function assertInfiniteWaterCurveProfile(
    value: unknown
): asserts value is InfiniteWaterCurveProfile {
    if (!value || typeof value !== "object") throw new TypeError("water curve profile must be an object");
    const profile = value as Partial<InfiniteWaterCurveProfile>;
    unitInterval("waterCurve.density", profile.density);
    unitInterval("waterCurve.curvature", profile.curvature);
    unitInterval("waterCurve.polylineChance", profile.polylineChance);
    positive("waterCurve.sampleSpacing", profile.sampleSpacing);
    positive("waterCurve.minimumBranchLength", profile.minimumBranchLength);
    positive("waterCurve.maximumBranchLength", profile.maximumBranchLength);
    positive("waterCurve.broadDensityScale", profile.broadDensityScale);
    positive("waterCurve.regionalDensityScale", profile.regionalDensityScale);
    if (!(profile.minimumBranchLength! < profile.maximumBranchLength!)) {
        throw new RangeError("water curve branch length range must be ordered");
    }
    if (!Array.isArray(profile.families) || profile.families.length === 0) {
        throw new RangeError("water curve profile must contain at least one family");
    }
    for (const [index, family] of profile.families.entries()) {
        if (!family || typeof family !== "object") {
            throw new TypeError(`waterCurve.families.${index} must be an object`);
        }
        positive(`waterCurve.families.${index}.cellSize`, family.cellSize);
        positive(`waterCurve.families.${index}.minimumLength`, family.minimumLength);
        positive(`waterCurve.families.${index}.maximumLength`, family.maximumLength);
        positive(`waterCurve.families.${index}.minimumWidth`, family.minimumWidth);
        positive(`waterCurve.families.${index}.maximumWidth`, family.maximumWidth);
        positive(`waterCurve.families.${index}.minimumControlStep`, family.minimumControlStep);
        positive(`waterCurve.families.${index}.maximumControlStep`, family.maximumControlStep);
        unitInterval(`waterCurve.families.${index}.spawnScale`, family.spawnScale);
        if (!Number.isInteger(family.slots) || family.slots <= 0) {
            throw new RangeError(`waterCurve.families.${index}.slots must be a positive integer`);
        }
        if (!Number.isInteger(family.maximumBranches) || family.maximumBranches < 0) {
            throw new RangeError(`waterCurve.families.${index}.maximumBranches must be a non-negative integer`);
        }
        if (!(family.minimumLength < family.maximumLength)
            || !(family.minimumWidth < family.maximumWidth)
            || !(family.minimumControlStep < family.maximumControlStep)) {
            throw new RangeError(`waterCurve.families.${index} ranges must be ordered`);
        }
    }
    if (!profile.basins || typeof profile.basins !== "object") {
        throw new TypeError("waterCurve.basins must be an object");
    }
    const basins = profile.basins;
    unitInterval("waterCurve.basins.density", basins.density);
    positive("waterCurve.basins.candidateCellSize", basins.candidateCellSize);
    positive("waterCurve.basins.minimumSeparation", basins.minimumSeparation);
    positive("waterCurve.basins.minimumMajorRadius", basins.minimumMajorRadius);
    positive("waterCurve.basins.maximumMajorRadius", basins.maximumMajorRadius);
    unitInterval("waterCurve.basins.minimumMinorRatio", basins.minimumMinorRatio);
    unitInterval("waterCurve.basins.maximumMinorRatio", basins.maximumMinorRatio);
    if (!(basins.minimumMajorRadius < basins.maximumMajorRadius)
        || !(basins.minimumMinorRatio < basins.maximumMinorRatio)) {
        throw new RangeError("water curve basin ranges must be ordered");
    }
    if (basins.minimumMinorRatio <= 0) {
        throw new RangeError("water curve basin minor ratios must be positive");
    }
    const maximumBasinReach = basins.maximumMajorRadius * BASIN_MAXIMUM_BOUNDARY_SCALE;
    if (basins.minimumSeparation <= maximumBasinReach * 2) {
        throw new RangeError("water curve basins must preserve a positive land corridor");
    }
}

function assertBounds(bounds: WaterCurveBounds): void {
    if (!bounds || typeof bounds !== "object") throw new TypeError("water curve bounds are required");
    for (const name of ["minX", "maxX", "minY", "maxY"] as const) {
        finite(`water curve bounds.${name}`, bounds[name]);
    }
    if (!(bounds.minX <= bounds.maxX) || !(bounds.minY <= bounds.maxY)) {
        throw new RangeError("water curve bounds must be ordered");
    }
}

function mix32(value: number): number {
    let mixed = value >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x7feb352d);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x846ca68b);
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
}

export function waterCurveSeedToUint32(seed: string | number): number {
    const text = String(seed);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function featureKey(seed: number, familyIndex: number, cellX: number, cellY: number, slot: number): number {
    return mix32(
        seed
        ^ Math.imul(cellX, 0x632be5ab)
        ^ Math.imul(cellY, 0x85157af5)
        ^ Math.imul(familyIndex, 0x9e3779b1)
        ^ Math.imul(slot, 0x85ebca77)
    );
}

function random(seed: number, x: number, y: number, salt: number): number {
    return mix32(
        seed
        ^ Math.imul(x, 0x9e3779b1)
        ^ Math.imul(y, 0x85ebca77)
        ^ Math.imul(salt, 0xc2b2ae3d)
    ) / UINT32_RANGE;
}

function randomForFeature(seed: number, key: number, salt: number): number {
    return mix32(seed ^ key ^ Math.imul(salt, 0x27d4eb2d)) / UINT32_RANGE;
}

interface WaterBasinCandidate {
    readonly ownerCellX: number;
    readonly ownerCellY: number;
    readonly key: number;
    readonly centerX: number;
    readonly centerY: number;
    readonly priority: number;
}

function buildBasinCandidate(
    seed: number,
    profile: Readonly<WaterBasinProfile>,
    cellX: number,
    cellY: number
): WaterBasinCandidate | undefined {
    const key = featureKey(seed, 101, cellX, cellY, 0);
    if (randomForFeature(seed, key, 1001) >= profile.density) return undefined;
    return {
        ownerCellX: cellX,
        ownerCellY: cellY,
        key,
        centerX: (cellX + 0.05 + randomForFeature(seed, key, 1019) * 0.9)
            * profile.candidateCellSize,
        centerY: (cellY + 0.05 + randomForFeature(seed, key, 1021) * 0.9)
            * profile.candidateCellSize,
        priority: randomForFeature(seed, key, 1003)
    };
}

function buildBasin(
    seed: number,
    profile: Readonly<WaterBasinProfile>,
    cellX: number,
    cellY: number,
    candidateAt: (candidateX: number, candidateY: number) => WaterBasinCandidate | undefined
): WaterBasin | undefined {
    const candidate = candidateAt(cellX, cellY);
    if (!candidate) return undefined;
    const neighborRadius = Math.ceil(profile.minimumSeparation / profile.candidateCellSize);
    const minimumSquaredDistance = profile.minimumSeparation ** 2;
    for (let neighborX = cellX - neighborRadius; neighborX <= cellX + neighborRadius; neighborX += 1) {
        for (let neighborY = cellY - neighborRadius; neighborY <= cellY + neighborRadius; neighborY += 1) {
            if (neighborX === cellX && neighborY === cellY) continue;
            const neighbor = candidateAt(neighborX, neighborY);
            if (!neighbor) continue;
            const squaredDistance = (neighbor.centerX - candidate.centerX) ** 2
                + (neighbor.centerY - candidate.centerY) ** 2;
            const neighborWins = neighbor.priority < candidate.priority
                || (neighbor.priority === candidate.priority
                    && (neighborX < cellX || (neighborX === cellX && neighborY < cellY)));
            if (squaredDistance < minimumSquaredDistance && neighborWins) return undefined;
        }
    }

    const majorRadius = profile.minimumMajorRadius
        + randomForFeature(seed, candidate.key, 1009)
            * (profile.maximumMajorRadius - profile.minimumMajorRadius);
    const minorRadius = majorRadius * (
        profile.minimumMinorRatio
        + randomForFeature(seed, candidate.key, 1013)
            * (profile.maximumMinorRatio - profile.minimumMinorRatio)
    );
    const angle = randomForFeature(seed, candidate.key, 1031) * TAU;
    return Object.freeze({
        featureKey: candidate.key,
        ownerCellX: cellX,
        ownerCellY: cellY,
        centerX: candidate.centerX,
        centerY: candidate.centerY,
        cosine: Math.cos(angle),
        sine: Math.sin(angle),
        majorRadius,
        minorRadius,
        waveA: BASIN_WAVE_A_MINIMUM + randomForFeature(seed, candidate.key, 1033) * BASIN_WAVE_A_SPAN,
        waveB: BASIN_WAVE_B_MINIMUM + randomForFeature(seed, candidate.key, 1039) * BASIN_WAVE_B_SPAN,
        waveC: BASIN_WAVE_C_MINIMUM + randomForFeature(seed, candidate.key, 1049) * BASIN_WAVE_C_SPAN,
        phaseA: randomForFeature(seed, candidate.key, 1051) * TAU,
        phaseB: randomForFeature(seed, candidate.key, 1061) * TAU,
        phaseC: randomForFeature(seed, candidate.key, 1063) * TAU
    });
}

export function waterBasinValue(x: number, y: number, basin: Readonly<WaterBasin>): number {
    finite("water basin x", x);
    finite("water basin y", y);
    const deltaX = x - basin.centerX;
    const deltaY = y - basin.centerY;
    const localX = deltaX * basin.cosine + deltaY * basin.sine;
    const localY = -deltaX * basin.sine + deltaY * basin.cosine;
    const angle = Math.atan2(localY / basin.minorRadius, localX / basin.majorRadius);
    const boundary = 1
        + Math.sin(angle * 3 + basin.phaseA) * basin.waveA
        + Math.sin(angle * 5 + basin.phaseB) * basin.waveB
        + Math.sin(angle * 8 + basin.phaseC) * basin.waveC;
    return Math.hypot(localX / basin.majorRadius, localY / basin.minorRadius) / boundary - 1;
}

export function isPointInsideWaterBasin(
    x: number,
    y: number,
    basin: Readonly<WaterBasin>,
    footprintExpansion = 0
): boolean {
    const expansion = finite("water basin footprint expansion", footprintExpansion);
    if (expansion < 0) throw new RangeError("water basin footprint expansion must be non-negative");
    return waterBasinValue(x, y, basin) <= expansion / basin.minorRadius;
}

function basinReach(basin: Readonly<WaterBasin>): number {
    return basin.majorRadius * (1 + basin.waveA + basin.waveB + basin.waveC);
}

function basinIntersects(basin: Readonly<WaterBasin>, bounds: WaterCurveBounds): boolean {
    const reach = basinReach(basin);
    return basin.centerX + reach >= bounds.minX && basin.centerX - reach <= bounds.maxX
        && basin.centerY + reach >= bounds.minY && basin.centerY - reach <= bounds.maxY;
}

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

function valueNoise1D(seed: number, x: number, key: number, salt: number): number {
    const cell = Math.floor(x);
    const amount = smoothstep(x - cell);
    const first = random(seed, cell, key, salt) * 2 - 1;
    const second = random(seed, cell + 1, key, salt) * 2 - 1;
    return first + (second - first) * amount;
}

function valueNoise2D(seed: number, x: number, y: number, salt: number): number {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const amountX = smoothstep(x - cellX);
    const amountY = smoothstep(y - cellY);
    const topLeft = random(seed, cellX, cellY, salt) * 2 - 1;
    const topRight = random(seed, cellX + 1, cellY, salt) * 2 - 1;
    const bottomLeft = random(seed, cellX, cellY + 1, salt) * 2 - 1;
    const bottomRight = random(seed, cellX + 1, cellY + 1, salt) * 2 - 1;
    const top = topLeft + (topRight - topLeft) * amountX;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * amountX;
    return top + (bottom - top) * amountY;
}

function localDensity(seed: number, profile: InfiniteWaterCurveProfile, x: number, y: number): number {
    const broad = valueNoise2D(seed, x / profile.broadDensityScale, y / profile.broadDensityScale, 61)
        * 0.5 + 0.5;
    const regional = valueNoise2D(
        seed,
        x / profile.regionalDensityScale,
        y / profile.regionalDensityScale,
        67
    ) * 0.5 + 0.5;
    const clustered = Math.max(0, Math.min(1, (broad * 0.72 + regional * 0.28 - 0.36) / 0.44));
    // Keep broad regional variation without allowing continent-sized curve
    // deserts. The old visual prototype's 0.02 floor could legitimately yield
    // no macro water geometry across an entire camera-sized query.
    return 0.22 + smoothstep(clustered) * 0.78;
}

function turnAt(seed: number, key: number, parameter: number, turnScale: number): number {
    const broad = valueNoise1D(seed, parameter / 8.2, key, 101);
    const middle = valueNoise1D(seed, parameter / 3.3, key, 211);
    const detail = valueNoise1D(seed, parameter / 1.45, key, 307);
    return turnScale * (broad * 0.58 + middle * 0.29 + detail * 0.13);
}

interface ControlPoint {
    readonly x: number;
    readonly y: number;
    readonly width: number;
}

interface MainCurve {
    readonly familyIndex: number;
    readonly family: WaterCurveFamilyProfile;
    readonly key: number;
    readonly ownerCellX: number;
    readonly ownerCellY: number;
    readonly ownerSlot: number;
    readonly polyline: boolean;
    readonly controls: readonly ControlPoint[];
}

function buildMainCurve(
    seed: number,
    profile: InfiniteWaterCurveProfile,
    familyIndex: number,
    cellX: number,
    cellY: number,
    slot: number
): MainCurve | undefined {
    const family = profile.families[familyIndex];
    const key = featureKey(seed, familyIndex, cellX, cellY, slot);
    const centerX = (cellX + 0.5) * family.cellSize;
    const centerY = (cellY + 0.5) * family.cellSize;
    const spawnChance = profile.density * family.spawnScale * localDensity(seed, profile, centerX, centerY);
    if (randomForFeature(seed, key, 17) >= spawnChance) return undefined;

    const origin = {
        x: (cellX + 0.04 + randomForFeature(seed, key, 23) * 0.92) * family.cellSize,
        y: (cellY + 0.04 + randomForFeature(seed, key, 29) * 0.92) * family.cellSize
    };
    const baseAngle = randomForFeature(seed, key, 31) * TAU;
    const lengthAmount = randomForFeature(seed, key, 37) ** 1.35;
    const totalLength = family.minimumLength
        + lengthAmount * (family.maximumLength - family.minimumLength);
    const controlStep = family.minimumControlStep
        + randomForFeature(seed, key, 41)
            * (family.maximumControlStep - family.minimumControlStep);
    const halfSteps = Math.ceil(totalLength / (controlStep * 2));
    const baseWidth = family.minimumWidth
        + randomForFeature(seed, key, 43) * (family.maximumWidth - family.minimumWidth);
    const turnScale = (0.035 + profile.curvature * 0.24)
        * (0.78 + randomForFeature(seed, key, 47) * 0.72);
    const widthAt = (parameter: number): number => {
        const progress = (parameter + halfSteps) / (halfSteps * 2);
        const growth = 0.38 + smoothstep(progress) * 0.78;
        const variation = 1 + valueNoise1D(seed, parameter / 5.5, key, 401) * 0.24;
        return Math.max(family.minimumWidth, baseWidth * growth * variation);
    };
    const before: ControlPoint[] = [];
    const after: ControlPoint[] = [];
    let current = { ...origin };
    let heading = baseAngle;
    for (let step = 1; step <= halfSteps; step += 1) {
        heading -= turnAt(seed, key, -step + 0.5, turnScale);
        current = {
            x: current.x - Math.cos(heading) * controlStep,
            y: current.y - Math.sin(heading) * controlStep
        };
        before.push({ ...current, width: widthAt(-step) });
    }
    current = { ...origin };
    heading = baseAngle;
    for (let step = 1; step <= halfSteps; step += 1) {
        heading += turnAt(seed, key, step - 0.5, turnScale);
        current = {
            x: current.x + Math.cos(heading) * controlStep,
            y: current.y + Math.sin(heading) * controlStep
        };
        after.push({ ...current, width: widthAt(step) });
    }
    return {
        familyIndex,
        family,
        key,
        ownerCellX: cellX,
        ownerCellY: cellY,
        ownerSlot: slot,
        polyline: randomForFeature(seed, key, 59) < profile.polylineChance,
        controls: [...before.reverse(), { ...origin, width: widthAt(0) }, ...after]
    };
}

function catmullRomPoint(
    first: ControlPoint,
    second: ControlPoint,
    third: ControlPoint,
    fourth: ControlPoint,
    amount: number
): WaterCurvePoint {
    const squared = amount * amount;
    const cubed = squared * amount;
    const interpolate = (a: number, b: number, c: number, d: number): number => 0.5 * (
        2 * b
        + (-a + c) * amount
        + (2 * a - 5 * b + 4 * c - d) * squared
        + (-a + 3 * b - 3 * c + d) * cubed
    );
    return {
        x: interpolate(first.x, second.x, third.x, fourth.x),
        y: interpolate(first.y, second.y, third.y, fourth.y),
        width: second.width + (third.width - second.width) * smoothstep(amount)
    };
}

function linearPoint(first: ControlPoint, second: ControlPoint, amount: number): WaterCurvePoint {
    return {
        x: first.x + (second.x - first.x) * amount,
        y: first.y + (second.y - first.y) * amount,
        width: first.width + (second.width - first.width) * smoothstep(amount)
    };
}

function sampleMain(profile: InfiniteWaterCurveProfile, main: MainCurve): WaterCurvePath {
    const points: WaterCurvePoint[] = [];
    for (let index = 0; index < main.controls.length - 1; index += 1) {
        const first = main.controls[Math.max(0, index - 1)];
        const second = main.controls[index];
        const third = main.controls[index + 1];
        const fourth = main.controls[Math.min(main.controls.length - 1, index + 2)];
        const distance = Math.hypot(third.x - second.x, third.y - second.y);
        const samples = Math.max(1, Math.ceil(distance / profile.sampleSpacing));
        for (let sample = 0; sample < samples; sample += 1) {
            const amount = sample / samples;
            points.push(main.polyline
                ? linearPoint(second, third, amount)
                : catmullRomPoint(first, second, third, fourth, amount));
        }
    }
    points.push(main.controls[main.controls.length - 1]);
    return Object.freeze({
        featureKey: main.key,
        familyIndex: main.familyIndex,
        ownerCellX: main.ownerCellX,
        ownerCellY: main.ownerCellY,
        ownerSlot: main.ownerSlot,
        pathIndex: 0,
        branch: false,
        kind: main.polyline ? "polyline" : "curve",
        points: Object.freeze(points)
    });
}

function cubicPoint(points: readonly ControlPoint[], amount: number): WaterCurvePoint {
    const inverse = 1 - amount;
    const first = inverse ** 3;
    const second = 3 * inverse ** 2 * amount;
    const third = 3 * inverse * amount ** 2;
    const fourth = amount ** 3;
    return {
        x: points[0].x * first + points[1].x * second + points[2].x * third + points[3].x * fourth,
        y: points[0].y * first + points[1].y * second + points[2].y * third + points[3].y * fourth,
        width: points[0].width * first + points[1].width * second
            + points[2].width * third + points[3].width * fourth
    };
}

function buildBranch(
    seed: number,
    profile: InfiniteWaterCurveProfile,
    main: MainCurve,
    branchIndex: number
): WaterCurvePath {
    const controls = main.controls;
    const joinIndex = Math.min(
        controls.length - 2,
        2 + Math.floor(random(seed, main.key, branchIndex, 503) * Math.max(1, controls.length - 4))
    );
    const join = controls[joinIndex];
    const previous = controls[joinIndex - 1];
    const next = controls[joinIndex + 1];
    const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
    const tangent = {
        x: (next.x - previous.x) / tangentLength,
        y: (next.y - previous.y) / tangentLength
    };
    const normal = { x: -tangent.y, y: tangent.x };
    const side = random(seed, main.key, branchIndex, 509) < 0.5 ? -1 : 1;
    const length = profile.minimumBranchLength
        + random(seed, main.key, branchIndex, 521)
            * (profile.maximumBranchLength - profile.minimumBranchLength);
    const upstream = length * (0.34 + random(seed, main.key, branchIndex, 523) * 0.28);
    const lateral = length * (0.48 + random(seed, main.key, branchIndex, 541) * 0.38) * side;
    const sourceWidth = Math.max(
        main.family.minimumWidth,
        main.family.minimumWidth * (0.9 + random(seed, main.key, branchIndex, 547) * 0.5)
    );
    const targetWidth = Math.max(
        main.family.minimumWidth,
        Math.min(main.family.maximumWidth * 0.62, join.width * 0.62)
    );
    const source = {
        x: join.x - tangent.x * upstream + normal.x * lateral,
        y: join.y - tangent.y * upstream + normal.y * lateral,
        width: sourceWidth
    };
    const branchControls: readonly ControlPoint[] = [
        source,
        {
            x: source.x + tangent.x * length * 0.23 - normal.x * lateral * 0.12,
            y: source.y + tangent.y * length * 0.23 - normal.y * lateral * 0.12,
            width: sourceWidth + (targetWidth - sourceWidth) * 0.33
        },
        {
            x: join.x - tangent.x * length * 0.22,
            y: join.y - tangent.y * length * 0.22,
            width: sourceWidth + (targetWidth - sourceWidth) * 0.75
        },
        { x: join.x, y: join.y, width: targetWidth }
    ];
    const samples = Math.max(2, Math.ceil(length / profile.sampleSpacing));
    const points: WaterCurvePoint[] = [];
    for (let index = 0; index <= samples; index += 1) {
        points.push(cubicPoint(branchControls, index / samples));
    }
    return Object.freeze({
        featureKey: main.key,
        familyIndex: main.familyIndex,
        ownerCellX: main.ownerCellX,
        ownerCellY: main.ownerCellY,
        ownerSlot: main.ownerSlot,
        pathIndex: branchIndex + 1,
        branch: true,
        kind: "branch",
        points: Object.freeze(points)
    });
}

function intersects(points: readonly WaterCurvePoint[] | readonly ControlPoint[], bounds: WaterCurveBounds, margin: number): boolean {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }
    return maxX >= bounds.minX - margin && minX <= bounds.maxX + margin
        && maxY >= bounds.minY - margin && minY <= bounds.maxY + margin;
}

function scaledFamily(family: WaterCurveFamilyProfile, scale: number): WaterCurveFamilyProfile {
    return Object.freeze({
        cellSize: family.cellSize * scale,
        slots: family.slots,
        spawnScale: family.spawnScale,
        minimumLength: family.minimumLength * scale,
        maximumLength: family.maximumLength * scale,
        minimumWidth: family.minimumWidth * scale,
        maximumWidth: family.maximumWidth * scale,
        minimumControlStep: family.minimumControlStep * scale,
        maximumControlStep: family.maximumControlStep * scale,
        maximumBranches: family.maximumBranches
    });
}

function scaledBasins(profile: Readonly<WaterBasinProfile>, scale: number): WaterBasinProfile {
    return Object.freeze({
        density: profile.density,
        candidateCellSize: profile.candidateCellSize * scale,
        minimumSeparation: profile.minimumSeparation * scale,
        minimumMajorRadius: profile.minimumMajorRadius * scale,
        maximumMajorRadius: profile.maximumMajorRadius * scale,
        minimumMinorRatio: profile.minimumMinorRatio,
        maximumMinorRatio: profile.maximumMinorRatio
    });
}

export function scaleInfiniteWaterCurveProfile(
    profile: Readonly<InfiniteWaterCurveProfile>,
    scale: number
): Readonly<InfiniteWaterCurveProfile> {
    assertInfiniteWaterCurveProfile(profile);
    positive("water curve spatial scale", scale);
    return Object.freeze({
        density: profile.density,
        curvature: profile.curvature,
        polylineChance: profile.polylineChance,
        sampleSpacing: profile.sampleSpacing * scale,
        minimumBranchLength: profile.minimumBranchLength * scale,
        maximumBranchLength: profile.maximumBranchLength * scale,
        broadDensityScale: profile.broadDensityScale * scale,
        regionalDensityScale: profile.regionalDensityScale * scale,
        families: Object.freeze(profile.families.map(family => scaledFamily(family, scale))),
        basins: scaledBasins(profile.basins, scale)
    });
}

class DeterministicInfiniteWaterCurveField implements InfiniteWaterCurveField {
    public readonly maximumReach: number;
    public readonly maximumWidth: number;
    public readonly maximumBasinReach: number;

    constructor(
        private readonly numericSeed: number,
        private readonly profile: Readonly<InfiniteWaterCurveProfile>
    ) {
        this.maximumReach = profile.families.reduce((maximum, family) => Math.max(
            maximum,
            family.maximumLength / 2
                + family.maximumControlStep * 2
                + profile.maximumBranchLength
        ), 0);
        this.maximumWidth = profile.families.reduce(
            (maximum, family) => Math.max(maximum, family.maximumWidth),
            0
        );
        this.maximumBasinReach = profile.basins.maximumMajorRadius * BASIN_MAXIMUM_BOUNDARY_SCALE;
    }

    public forEachPathIntersecting(bounds: WaterCurveBounds, visit: (path: WaterCurvePath) => void): void {
        assertBounds(bounds);
        if (typeof visit !== "function") throw new TypeError("water curve visitor must be a function");
        this.forEachCandidate(bounds, true, visit);
    }

    public forEachPathOwnedBy(bounds: WaterCurveBounds, visit: (path: WaterCurvePath) => void): void {
        assertBounds(bounds);
        if (typeof visit !== "function") throw new TypeError("water curve visitor must be a function");
        this.forEachCandidate(bounds, false, visit);
    }

    public forEachBasinIntersecting(bounds: WaterCurveBounds, visit: (basin: WaterBasin) => void): void {
        assertBounds(bounds);
        if (typeof visit !== "function") throw new TypeError("water basin visitor must be a function");
        this.forEachBasinCandidate(bounds, true, visit);
    }

    public forEachBasinOwnedBy(bounds: WaterCurveBounds, visit: (basin: WaterBasin) => void): void {
        assertBounds(bounds);
        if (typeof visit !== "function") throw new TypeError("water basin visitor must be a function");
        this.forEachBasinCandidate(bounds, false, visit);
    }

    private forEachCandidate(
        bounds: WaterCurveBounds,
        intersecting: boolean,
        visit: (path: WaterCurvePath) => void
    ): void {
        for (let familyIndex = 0; familyIndex < this.profile.families.length; familyIndex += 1) {
            const family = this.profile.families[familyIndex];
            const reach = intersecting
                ? family.maximumLength / 2
                    + family.maximumControlStep * 2
                    + this.profile.maximumBranchLength
                : 0;
            const firstCellX = Math.floor((bounds.minX - reach) / family.cellSize);
            const lastCellX = intersecting
                ? Math.floor((bounds.maxX + reach) / family.cellSize)
                : Math.ceil(bounds.maxX / family.cellSize) - 1;
            const firstCellY = Math.floor((bounds.minY - reach) / family.cellSize);
            const lastCellY = intersecting
                ? Math.floor((bounds.maxY + reach) / family.cellSize)
                : Math.ceil(bounds.maxY / family.cellSize) - 1;
            for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
                for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
                    for (let slot = 0; slot < family.slots; slot += 1) {
                        const main = buildMainCurve(
                            this.numericSeed,
                            this.profile,
                            familyIndex,
                            cellX,
                            cellY,
                            slot
                        );
                        if (!main) continue;
                        if (intersecting && !intersects(
                            main.controls,
                            bounds,
                            this.profile.maximumBranchLength + family.maximumControlStep
                        )) continue;
                        const sampledMain = sampleMain(this.profile, main);
                        if (!intersecting || intersects(sampledMain.points, bounds, this.profile.sampleSpacing * 2)) {
                            visit(sampledMain);
                        }
                        const branchCount = Math.floor(
                            randomForFeature(this.numericSeed, main.key, 557) * (family.maximumBranches + 1)
                        );
                        for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
                            const branch = buildBranch(this.numericSeed, this.profile, main, branchIndex);
                            if (!intersecting || intersects(branch.points, bounds, this.profile.sampleSpacing * 2)) {
                                visit(branch);
                            }
                        }
                    }
                }
            }
        }
    }

    private forEachBasinCandidate(
        bounds: WaterCurveBounds,
        intersecting: boolean,
        visit: (basin: WaterBasin) => void
    ): void {
        const profile = this.profile.basins;
        if (profile.density === 0) return;
        const reach = intersecting ? this.maximumBasinReach : 0;
        const firstCellX = Math.floor((bounds.minX - reach) / profile.candidateCellSize);
        const lastCellX = intersecting
            ? Math.floor((bounds.maxX + reach) / profile.candidateCellSize)
            : Math.ceil(bounds.maxX / profile.candidateCellSize) - 1;
        const firstCellY = Math.floor((bounds.minY - reach) / profile.candidateCellSize);
        const lastCellY = intersecting
            ? Math.floor((bounds.maxY + reach) / profile.candidateCellSize)
            : Math.ceil(bounds.maxY / profile.candidateCellSize) - 1;
        const candidates = new Map<string, WaterBasinCandidate | undefined>();
        const candidateAt = (cellX: number, cellY: number): WaterBasinCandidate | undefined => {
            const key = `${cellX},${cellY}`;
            if (!candidates.has(key)) {
                candidates.set(key, buildBasinCandidate(this.numericSeed, profile, cellX, cellY));
            }
            return candidates.get(key);
        };
        for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
            for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
                const basin = buildBasin(this.numericSeed, profile, cellX, cellY, candidateAt);
                if (basin && (!intersecting || basinIntersects(basin, bounds))) visit(basin);
            }
        }
    }
}

export function createInfiniteWaterCurveField(
    seed: string | number,
    profile: Readonly<InfiniteWaterCurveProfile> = INFINITE_WATER_CURVE_REFERENCE_PROFILE
): InfiniteWaterCurveField {
    return createInfiniteWaterCurveFieldFromUint32(waterCurveSeedToUint32(seed), profile);
}

export function createInfiniteWaterCurveFieldFromUint32(
    numericSeed: number,
    profile: Readonly<InfiniteWaterCurveProfile> = INFINITE_WATER_CURVE_REFERENCE_PROFILE
): InfiniteWaterCurveField {
    if (!Number.isInteger(numericSeed) || numericSeed < 0 || numericSeed > 0xffff_ffff) {
        throw new RangeError("water curve numeric seed must be an unsigned 32-bit integer");
    }
    assertInfiniteWaterCurveProfile(profile);
    return new DeterministicInfiniteWaterCurveField(numericSeed, profile);
}
