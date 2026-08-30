function roundToNearestEven(value: number): number {
    const lower = Math.floor(value);
    const fraction = value - lower;
    if (fraction > 0.5 || fraction === 0.5 && lower % 2 !== 0) return lower + 1;
    return lower;
}

export function encodeFloat16(value: number): number {
    if (Number.isNaN(value)) return 0x7e00;
    const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
    const magnitude = Math.abs(value);
    if (magnitude === Number.POSITIVE_INFINITY) return sign | 0x7c00;
    if (magnitude === 0) return sign;

    if (magnitude < 2 ** -14) {
        const subnormal = roundToNearestEven(magnitude / 2 ** -24);
        return subnormal >= 1024 ? sign | 0x0400 : sign | subnormal;
    }

    let exponent = Math.floor(Math.log2(magnitude));
    if (exponent > 15) return sign | 0x7c00;
    let significand = roundToNearestEven(magnitude / 2 ** (exponent - 10));
    if (significand === 2048) {
        exponent += 1;
        significand = 1024;
        if (exponent > 15) return sign | 0x7c00;
    }
    return sign | (exponent + 15) << 10 | significand - 1024;
}

export function decodeFloat16(bits: number): number {
    if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) {
        throw new RangeError("binary16 bits must be a Uint16 value");
    }
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = bits >>> 10 & 0x1f;
    const fraction = bits & 0x03ff;
    if (exponent === 0) {
        if (fraction === 0) return sign < 0 ? -0 : 0;
        return sign * fraction * 2 ** -24;
    }
    if (exponent === 0x1f) return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
    return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

export function quantizeFloat16(value: number): number {
    return decodeFloat16(encodeFloat16(value));
}
