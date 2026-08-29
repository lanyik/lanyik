import { describe, expect, test } from "vitest";

import {
    COMPILED_SURFACE_TEXEL_COUNT,
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_RIVER,
    assertCompiledSurfaceField,
    compiledSurfaceFieldResidentBytes,
    compiledSurfaceFieldTransferables,
    createCompiledSurfaceField,
    surfaceFieldTexelIndex
} from "../../src/world/CompiledSurfaceField";
import {
    HALF_FLOAT_CANONICAL_NAN,
    finiteFloat16Bits,
    float16BitsToFloat32,
    float32ToFloat16Bits
} from "../../src/world/HalfFloat";
import { SURFACE_FIELD_CPU_BYTES } from "../../src/world/SurfaceCompileProfile";

function validFieldInput() {
    const groundHeight = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    groundHeight.fill(finiteFloat16Bits("ground", 0.25));
    const materialWeights = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT * 4);
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        materialWeights[index * 4] = 255;
    }
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    shorelineDistance.fill(finiteFloat16Bits("shoreline", 2));
    return {
        groundHeight,
        materialWeights,
        waterLevel: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterDepth: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        shorelineDistance,
        flow: new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2),
        waterCoverage: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterKind: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterProfile: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterBodyIndex: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT)
    };
}

describe("binary16 codec", () => {
    test("uses canonical IEEE 754 encodings and round-to-nearest-even", () => {
        expect(float32ToFloat16Bits(0)).toBe(0x0000);
        expect(float32ToFloat16Bits(-0)).toBe(0x8000);
        expect(float32ToFloat16Bits(1)).toBe(0x3c00);
        expect(float32ToFloat16Bits(-2)).toBe(0xc000);
        expect(float32ToFloat16Bits(65_504)).toBe(0x7bff);
        expect(float32ToFloat16Bits(Number.NaN)).toBe(HALF_FLOAT_CANONICAL_NAN);
        expect(float16BitsToFloat32(0x0001)).toBe(2 ** -24);
        expect(float16BitsToFloat32(0x3c00)).toBe(1);
        expect(float16BitsToFloat32(0x7bff)).toBe(65_504);
        expect(Object.is(float16BitsToFloat32(0x8000), -0)).toBe(true);

        const tieAtEven = 1 + 2 ** -11;
        const tieAtOdd = 1 + 3 * 2 ** -11;
        expect(float32ToFloat16Bits(tieAtEven)).toBe(0x3c00);
        expect(float32ToFloat16Bits(tieAtOdd)).toBe(0x3c02);
        expect(() => finiteFloat16Bits("overflow", 70_000)).toThrow(/representable/);
    });
});

describe("CompiledSurfaceField", () => {
    test("publishes the fixed 66x66 SoA layout with distinct transfer buffers", () => {
        const input = validFieldInput();
        const lake = surfaceFieldTexelIndex(0, 0);
        input.waterCoverage[lake] = 255;
        input.waterKind[lake] = SURFACE_WATER_KIND_LAKE;
        input.waterProfile[lake] = 1;
        input.waterBodyIndex[lake] = 1;
        input.waterLevel[lake] = finiteFloat16Bits("lake level", 0.5);
        input.waterDepth[lake] = finiteFloat16Bits("lake depth", 0.25);
        input.shorelineDistance[lake] = finiteFloat16Bits("shoreline", -1);
        const river = surfaceFieldTexelIndex(1, 1);
        input.waterCoverage[river] = 128;
        input.waterKind[river] = SURFACE_WATER_KIND_RIVER;
        input.waterProfile[river] = 2;
        input.waterBodyIndex[river] = 2;
        input.waterLevel[river] = finiteFloat16Bits("river level", 0.375);
        input.waterDepth[river] = finiteFloat16Bits("river depth", 0.125);
        input.flow[river * 2] = 127;

        const field = createCompiledSurfaceField(input);
        assertCompiledSurfaceField(field);
        expect(compiledSurfaceFieldResidentBytes(field)).toBe(SURFACE_FIELD_CPU_BYTES);
        expect(compiledSurfaceFieldTransferables(field)).toHaveLength(10);
        expect(new Set(compiledSurfaceFieldTransferables(field)).size).toBe(10);
        expect(surfaceFieldTexelIndex(-1, -1)).toBe(0);
        expect(surfaceFieldTexelIndex(64, 64)).toBe(COMPILED_SURFACE_TEXEL_COUNT - 1);
    });

    test("rejects non-canonical weights, half values, dry payload and SNORM codes", () => {
        const badWeights = validFieldInput();
        badWeights.materialWeights[0] = 254;
        expect(() => createCompiledSurfaceField(badWeights)).toThrow(/sum/);

        const badHalf = validFieldInput();
        badHalf.groundHeight[0] = HALF_FLOAT_CANONICAL_NAN;
        expect(() => createCompiledSurfaceField(badHalf)).toThrow(/finite/);

        const badDry = validFieldInput();
        badDry.waterBodyIndex[0] = 1;
        expect(() => createCompiledSurfaceField(badDry)).toThrow(/canonical zero/);

        const badFlow = validFieldInput();
        badFlow.flow[0] = -128;
        expect(() => createCompiledSurfaceField(badFlow)).toThrow(/-128/);
    });
});
