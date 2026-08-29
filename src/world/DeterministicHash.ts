const UINT32_RANGE = 0x1_0000_0000;

function mixUint32(hash: number, word: number): number {
    let mixed = (hash ^ word) >>> 0;
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
    return (mixed ^ (mixed >>> 16)) >>> 0;
}

function safeIntegerWords(value: number): readonly [low: number, high: number, sign: number] {
    if (!Number.isSafeInteger(value)) {
        throw new RangeError("deterministic coordinate hash requires safe integers");
    }
    const magnitude = Math.abs(value);
    const high = Math.floor(magnitude / UINT32_RANGE);
    const low = magnitude - high * UINT32_RANGE;
    return [low >>> 0, high >>> 0, value < 0 ? 1 : 0];
}

// Unlike the v1 noise hash, this function does not truncate coordinates to
// signed 32-bit values before mixing. It is suitable for deterministic v2
// identities and random choices over the complete safe-integer tile domain.
export function hashSafeIntegerCoordinates(
    seed: number,
    x: number,
    y: number,
    salt = 0
): number {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
        throw new RangeError("deterministic coordinate hash seed must be a uint32");
    }
    if (!Number.isInteger(salt) || salt < 0 || salt > 0xffff_ffff) {
        throw new RangeError("deterministic coordinate hash salt must be a uint32");
    }
    const xWords = safeIntegerWords(x);
    const yWords = safeIntegerWords(y);
    let hash = mixUint32((seed ^ 0x9e37_79b9) >>> 0, salt >>> 0);
    hash = mixUint32(hash, xWords[0]);
    hash = mixUint32(hash, xWords[1]);
    hash = mixUint32(hash, xWords[2]);
    hash = mixUint32(hash, yWords[0]);
    hash = mixUint32(hash, yWords[1]);
    return mixUint32(hash, yWords[2]);
}
