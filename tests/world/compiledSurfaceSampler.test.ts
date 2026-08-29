import { describe, expect, test } from "vitest";

import {
    COMPILED_SURFACE_TEXEL_COUNT,
    createCompiledSurfaceField
} from "../../src/world/CompiledSurfaceField";
import {
    CompiledSurfaceSampler,
    createCompiledSurfaceSample
} from "../../src/world/CompiledSurfaceSampler";
import { finiteFloat16Bits } from "../../src/world/HalfFloat";
import { SURFACE_COMPILE_PROFILE } from "../../src/world/SurfaceCompileProfile";
import { compileSurfaceField } from "../../src/world/compileSurfaceField";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

function materialField(): Uint8Array {
    const materialWeights = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT * 4);
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        materialWeights[index * 4] = 255;
    }
    return materialWeights;
}

function nonlinearGroundField() {
    const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
    const groundHeight = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    shorelineDistance.fill(finiteFloat16Bits("test shoreline", 2));
    for (let x = 0; x < size; x += 1) {
        for (let y = 0; y < size; y += 1) {
            groundHeight[x * size + y] = finiteFloat16Bits("test nonlinear ground", x * y / 16);
        }
    }
    return createCompiledSurfaceField({
        groundHeight,
        materialWeights: materialField(),
        waterLevel: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterDepth: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        shorelineDistance,
        flow: new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2),
        waterCoverage: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterKind: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterProfile: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterBodyIndex: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT)
    });
}

function mixedBodyField() {
    const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
    const waterLevel = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterDepth = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterCoverage = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterKind = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterProfile = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const flow = new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2);
    const setWater = (
        x: number,
        y: number,
        body: number,
        coverage: number,
        level: number,
        kind: number,
        profile: number
    ): void => {
        const index = x * size + y;
        waterLevel[index] = finiteFloat16Bits("test water level", level);
        waterDepth[index] = finiteFloat16Bits("test water depth", level);
        waterCoverage[index] = coverage;
        waterKind[index] = kind;
        waterProfile[index] = profile;
        waterBodyIndex[index] = body;
        if (kind === 3) flow[index * 2] = 127;
    };
    setWater(2, 2, 1, 255, 10, 3, 4);
    setWater(2, 3, 2, 255, 30, 2, 9);
    setWater(3, 2, 1, 128, 14, 3, 4);
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    shorelineDistance.fill(finiteFloat16Bits("test shoreline", 1));
    return createCompiledSurfaceField({
        groundHeight: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        materialWeights: materialField(),
        waterLevel,
        waterDepth,
        shorelineDistance,
        flow,
        waterCoverage,
        waterKind,
        waterProfile,
        waterBodyIndex
    });
}

describe("CompiledSurfaceSampler", () => {
    test("samples X-major fields and then applies the canonical near-grid diagonal", () => {
        const sampler = new CompiledSurfaceSampler(nonlinearGroundField());
        const output = createCompiledSurfaceSample();
        const step = 1 / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
        const bottomLeftU = -0.5 + 10 * step;
        const bottomLeftV = -0.5 + 20 * step;
        const localU = bottomLeftU + step * 0.75;
        const localV = bottomLeftV + step * 0.25;
        const bottomLeft = sampler.sampleBilinear(bottomLeftU, bottomLeftV, output).groundHeight;
        const bottomRight = sampler.sampleBilinear(bottomLeftU + step, bottomLeftV, output).groundHeight;
        const topRight = sampler.sampleBilinear(bottomLeftU + step, bottomLeftV + step, output).groundHeight;
        const expected = bottomLeft * 0.25 + bottomRight * 0.5 + topRight * 0.25;
        const directBilinear = sampler.sampleBilinear(localU, localV, output).groundHeight;
        expect(sampler.sampleGroundHeight(localU, localV)).toBeCloseTo(expected, 12);
        expect(sampler.sampleGroundHeight(localU, localV)).not.toBeCloseTo(directBilinear, 12);
        expect(sampler.sampleSurface(localU, localV, output)).toBe(output);
        expect(output.groundHeight).toBeCloseTo(expected, 12);
    });

    test("selects a stable body and excludes dry or competing payload from water interpolation", () => {
        const sampler = new CompiledSurfaceSampler(mixedBodyField());
        const output = sampler.sampleBilinear(0, 0, createCompiledSurfaceSample());
        const firstWeight = 0.25;
        const thirdWeight = 0.25 * 128 / 255;
        expect(output.waterCoverage).toBeCloseTo((255 + 255 + 128) / (4 * 255), 12);
        expect(output.waterBodyIndex).toBe(1);
        expect(output.waterKind).toBe(3);
        expect(output.waterProfile).toBe(4);
        expect(output.waterLevel).toBeCloseTo(
            (10 * firstWeight + 14 * thirdWeight) / (firstWeight + thirdWeight),
            12
        );
        expect(output.waterDepth).toBeCloseTo(output.waterLevel, 12);
        expect(output.flow).toEqual(new Float32Array([1, 0]));
        expect(output.materialWeights).toEqual(new Float32Array([1, 0, 0, 0]));
    });

    test("returns identical shared-edge samples from adjacent compiled chunks", () => {
        const options = {
            seaLevel: 35_000,
            macroHeight: (tileX: number, tileY: number) => Math.max(
                0,
                Math.min(0xffff, 20_000 + tileX * 500 + tileY * 700)
            )
        };
        const first = new CompiledSurfaceSampler(compileSurfaceField(createSurfaceCompilerTestWindow({
            ...options,
            renderChunkX: 0
        })).field);
        const second = new CompiledSurfaceSampler(compileSurfaceField(createSurfaceCompilerTestWindow({
            ...options,
            renderChunkX: 1
        })).field);
        const firstOutput = first.sampleSurface(15.5, 4.375, createCompiledSurfaceSample());
        const secondOutput = second.sampleSurface(-0.5, 4.375, createCompiledSurfaceSample());
        expect(secondOutput).toEqual(firstOutput);
    });

    test("rejects coordinates outside the half-open core closure", () => {
        const sampler = new CompiledSurfaceSampler(nonlinearGroundField());
        const output = createCompiledSurfaceSample();
        expect(() => sampler.sampleBilinear(-0.5001, 0, output)).toThrow(/outside/);
        expect(() => sampler.sampleGroundHeight(15.5001, 0)).toThrow(/outside/);
    });
});
