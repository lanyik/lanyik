import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow
} from "./TransferableEffectiveWindow";

export interface EffectiveWindowSemanticSample {
    groundHeight: number;
    biome0: number;
    biome1: number;
    biome2: number;
    biome3: number;
}

function windowIndex(window: Readonly<TransferableEffectiveWindow>, tileX: number, tileY: number): number {
    const localX = tileX - window.originTileX;
    const localY = tileY - window.originTileY;
    if (localX < 0 || localX >= EFFECTIVE_WINDOW_TILE_SIZE
        || localY < 0 || localY >= EFFECTIVE_WINDOW_TILE_SIZE) return -1;
    return localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
}

export function sampleEffectiveWindowSemantic(
    window: Readonly<TransferableEffectiveWindow>,
    u: number,
    v: number,
    heightScale: number,
    output: EffectiveWindowSemanticSample
): boolean {
    if (!Number.isFinite(u) || !Number.isFinite(v)
        || !Number.isFinite(heightScale) || heightScale <= 0) {
        throw new RangeError("effective window sample coordinates or height scale are invalid");
    }
    const tileX = Math.floor(u);
    const tileY = Math.floor(v);
    const fractionX = u - tileX;
    const fractionY = v - tileY;
    let validWeight = 0;
    let macroHeight = 0;
    let biome0 = 0;
    let biome1 = 0;
    let biome2 = 0;
    let biome3 = 0;
    for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
        const weightX = offsetX === 0 ? 1 - fractionX : fractionX;
        for (let offsetY = 0; offsetY <= 1; offsetY += 1) {
            const index = windowIndex(window, tileX + offsetX, tileY + offsetY);
            if (index < 0 || window.valid[index] === 0) continue;
            const weight = weightX * (offsetY === 0 ? 1 - fractionY : fractionY);
            const biomeOffset = index * 4;
            validWeight += weight;
            macroHeight += window.macroHeight[index] * weight;
            biome0 += window.biomeWeights[biomeOffset] * weight;
            biome1 += window.biomeWeights[biomeOffset + 1] * weight;
            biome2 += window.biomeWeights[biomeOffset + 2] * weight;
            biome3 += window.biomeWeights[biomeOffset + 3] * weight;
        }
    }
    if (validWeight <= 0) return false;
    const inverseWeight = 1 / validWeight;
    output.groundHeight = macroHeight * inverseWeight / 0xffff * heightScale;
    output.biome0 = biome0 * inverseWeight;
    output.biome1 = biome1 * inverseWeight;
    output.biome2 = biome2 * inverseWeight;
    output.biome3 = biome3 * inverseWeight;
    return true;
}

function sampleVegetationDensity(
    window: Readonly<TransferableEffectiveWindow>,
    tileX: number,
    tileY: number,
    fractionX: number,
    fractionY: number
): number | undefined {
    let validWeight = 0;
    let density = 0;
    for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
        const weightX = offsetX === 0 ? 1 - fractionX : fractionX;
        for (let offsetY = 0; offsetY <= 1; offsetY += 1) {
            const index = windowIndex(window, tileX + offsetX, tileY + offsetY);
            if (index < 0 || window.valid[index] === 0) continue;
            const weight = weightX * (offsetY === 0 ? 1 - fractionY : fractionY);
            validWeight += weight;
            density += window.vegetationDensity[index] * weight;
        }
    }
    return validWeight > 0 ? density / validWeight / 255 : undefined;
}

export function sampleEffectiveWindowVegetationDensity(
    window: Readonly<TransferableEffectiveWindow>,
    u: number,
    v: number
): number | undefined {
    if (!Number.isFinite(u) || !Number.isFinite(v)
        || !Number.isSafeInteger(Math.floor(u)) || !Number.isSafeInteger(Math.floor(v))) {
        throw new RangeError("effective vegetation sample coordinates are invalid");
    }
    const tileX = Math.floor(u);
    const tileY = Math.floor(v);
    return sampleVegetationDensity(window, tileX, tileY, u - tileX, v - tileY);
}

// Window-local sampling preserves the fractional phase next to the extrema of
// the safe-integer tile domain, where a global Number cannot represent both a
// large integer coordinate and the fixed sub-tile candidate lattice.
export function sampleEffectiveWindowVegetationDensityLocal(
    window: Readonly<TransferableEffectiveWindow>,
    offsetU: number,
    offsetV: number
): number | undefined {
    if (!Number.isFinite(offsetU) || !Number.isFinite(offsetV)) {
        throw new RangeError("local effective vegetation sample coordinates are invalid");
    }
    const localTileX = Math.floor(offsetU);
    const localTileY = Math.floor(offsetV);
    const tileX = window.originTileX + localTileX;
    const tileY = window.originTileY + localTileY;
    if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
        throw new RangeError("local effective vegetation sample escaped the safe-integer domain");
    }
    return sampleVegetationDensity(
        window,
        tileX,
        tileY,
        offsetU - localTileX,
        offsetV - localTileY
    );
}
