const FLOAT32 = new Float32Array(1);
const UINT32 = new Uint32Array(FLOAT32.buffer);

export const HALF_FLOAT_POSITIVE_INFINITY = 0x7c00;
export const HALF_FLOAT_CANONICAL_NAN = 0x7e00;
export const HALF_FLOAT_MAX_FINITE = 65_504;

function roundToNearestEven(value: number, remainder: number, halfway: number): number {
    return remainder > halfway || remainder === halfway && (value & 1) !== 0 ? value + 1 : value;
}

export function float32ToFloat16Bits(value: number): number {
    FLOAT32[0] = value;
    const bits = UINT32[0];
    const sign = (bits >>> 16) & 0x8000;
    const exponent = (bits >>> 23) & 0xff;
    const mantissa = bits & 0x7f_ffff;
    if (exponent === 0xff) {
        return mantissa === 0 ? sign | HALF_FLOAT_POSITIVE_INFINITY : sign | HALF_FLOAT_CANONICAL_NAN;
    }

    let halfExponent = exponent - 127 + 15;
    if (halfExponent >= 0x1f) return sign | HALF_FLOAT_POSITIVE_INFINITY;
    if (halfExponent <= 0) {
        if (halfExponent < -10) return sign;
        const significand = mantissa | 0x80_0000;
        const shift = 14 - halfExponent;
        let halfMantissa = significand >>> shift;
        const remainderMask = 2 ** shift - 1;
        halfMantissa = roundToNearestEven(
            halfMantissa,
            significand & remainderMask,
            2 ** (shift - 1)
        );
        return sign | halfMantissa;
    }

    let halfMantissa = mantissa >>> 13;
    halfMantissa = roundToNearestEven(halfMantissa, mantissa & 0x1fff, 0x1000);
    if (halfMantissa === 0x400) {
        halfMantissa = 0;
        halfExponent += 1;
        if (halfExponent >= 0x1f) return sign | HALF_FLOAT_POSITIVE_INFINITY;
    }
    return sign | halfExponent << 10 | halfMantissa;
}

export function float16BitsToFloat32(bits: number): number {
    if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) {
        throw new RangeError("binary16 bits must be a uint16 value");
    }
    const sign = (bits & 0x8000) !== 0 ? -1 : 1;
    const exponent = (bits >>> 10) & 0x1f;
    const mantissa = bits & 0x03ff;
    if (exponent === 0x1f) return mantissa === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
    if (exponent === 0) {
        if (mantissa === 0) return sign < 0 ? -0 : 0;
        return sign * 2 ** -14 * (mantissa / 1024);
    }
    return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

export function finiteFloat16Bits(name: string, value: number): number {
    if (!Number.isFinite(value) || Math.abs(value) > HALF_FLOAT_MAX_FINITE) {
        throw new RangeError(`${name} must be finite and representable as binary16`);
    }
    const bits = float32ToFloat16Bits(value);
    if (!Number.isFinite(float16BitsToFloat32(bits))) {
        throw new RangeError(`${name} rounded outside finite binary16`);
    }
    return bits;
}
