const UINT32_MAX = 0xffffffff;

export function seedToUint32(seed: string | number): number {
    const text = String(seed);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function randomGridValue(seed: number, x: number, y: number): number {
    let hash = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
    hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
    return ((hash ^ (hash >>> 15)) >>> 0) / UINT32_MAX;
}

const smooth = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

export function valueNoise2D(seed: number, x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const top = lerp(randomGridValue(seed, x0, y0), randomGridValue(seed, x0 + 1, y0), tx);
    const bottom = lerp(randomGridValue(seed, x0, y0 + 1), randomGridValue(seed, x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
}

export function fractalNoise2D(seed: number, x: number, y: number, octaves: number): number {
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let normalization = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
        total += valueNoise2D((seed + Math.imul(octave, 0x9e3779b9)) >>> 0, x * frequency, y * frequency) * amplitude;
        normalization += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return total / normalization;
}

//Value noise whose integer lattice repeats after periodX/periodY cells. The
//periods are integer by design, which makes samples at x and x + periodX (and
//the equivalent Y positions) exactly identical rather than merely similar.
export function periodicValueNoise2D(
    seed: number,
    x: number,
    y: number,
    periodX: number,
    periodY: number
): number {
    const px = Math.max(1, Math.round(periodX));
    const py = Math.max(1, Math.round(periodY));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const sample = (gx: number, gy: number) => randomGridValue(
        seed,
        positiveModulo(gx, px),
        positiveModulo(gy, py)
    );
    const top = lerp(sample(x0, y0), sample(x0 + 1, y0), tx);
    const bottom = lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
}

//Periodic fractal noise sampled in normalized world coordinates (0..1). Each
//octave doubles an integer lattice, preserving the exact period on both axes.
export function periodicFractalNoise2D(
    seed: number,
    normalizedX: number,
    normalizedY: number,
    cellsX: number,
    cellsY: number,
    octaves: number
): number {
    const baseCellsX = Math.max(1, Math.round(cellsX));
    const baseCellsY = Math.max(1, Math.round(cellsY));
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let normalization = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
        const periodX = baseCellsX * frequency;
        const periodY = baseCellsY * frequency;
        total += periodicValueNoise2D(
            (seed + Math.imul(octave, 0x9e3779b9)) >>> 0,
            normalizedX * periodX,
            normalizedY * periodY,
            periodX,
            periodY
        ) * amplitude;
        normalization += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return total / normalization;
}

export function randomAt(seed: number, x: number, y: number, salt: number): number {
    return randomGridValue((seed ^ salt) >>> 0, x, y);
}
