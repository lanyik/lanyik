import { describe, expect, test } from "vitest";

import {
    COMPILED_SURFACE_TEXEL_COUNT,
    compiledSurfaceFieldResidentBytes,
    surfaceFieldTexelIndex
} from "../../src/world/CompiledSurfaceField";
import { finiteFloat16Bits, float16BitsToFloat32 } from "../../src/world/HalfFloat";
import {
    SURFACE_FIELD_CPU_BYTES,
    surfaceInfluenceRadiusWorld
} from "../../src/world/SurfaceCompileProfile";
import { compileSemanticSurfaceField } from "../../src/world/compileSemanticSurfaceField";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

describe("compileSemanticSurfaceField", () => {
    test("compiles a valid fixed-size dry field with continuous semantic interpolation", () => {
        const compiled = compileSemanticSurfaceField(createSurfaceCompilerTestWindow());
        expect(compiled.groundHeight).toHaveLength(COMPILED_SURFACE_TEXEL_COUNT);
        expect(compiledSurfaceFieldResidentBytes(compiled)).toBe(SURFACE_FIELD_CPU_BYTES);
        expect(compiled.waterCoverage.every(value => value === 0)).toBe(true);
        expect(float16BitsToFloat32(compiled.shorelineDistance[0]))
            .toBeCloseTo(surfaceInfluenceRadiusWorld(2), 3);
        const center = surfaceFieldTexelIndex(2, 2);
        expect(float16BitsToFloat32(compiled.groundHeight[center])).toBeGreaterThan(0);
        const materialOffset = center * 4;
        expect(compiled.materialWeights[materialOffset]
            + compiled.materialWeights[materialOffset + 1]
            + compiled.materialWeights[materialOffset + 2]
            + compiled.materialWeights[materialOffset + 3]).toBe(255);
    });

    test("produces bit-identical shared texel columns for adjacent and negative chunks", () => {
        const left = compileSemanticSurfaceField(createSurfaceCompilerTestWindow());
        const right = compileSemanticSurfaceField(createSurfaceCompilerTestWindow({ renderChunkX: 1 }));
        const negative = compileSemanticSurfaceField(createSurfaceCompilerTestWindow({ renderChunkX: -1 }));
        for (let texelY = -1; texelY <= 64; texelY += 1) {
            for (const [leftX, rightX] of [[63, -1], [64, 0]] as const) {
                const leftIndex = surfaceFieldTexelIndex(leftX, texelY);
                const rightIndex = surfaceFieldTexelIndex(rightX, texelY);
                expect(left.groundHeight[leftIndex]).toBe(right.groundHeight[rightIndex]);
                expect(left.materialWeights.slice(leftIndex * 4, leftIndex * 4 + 4))
                    .toEqual(right.materialWeights.slice(rightIndex * 4, rightIndex * 4 + 4));
            }
            for (const [negativeX, zeroX] of [[63, -1], [64, 0]] as const) {
                const negativeIndex = surfaceFieldTexelIndex(negativeX, texelY);
                const zeroIndex = surfaceFieldTexelIndex(zeroX, texelY);
                expect(negative.groundHeight[negativeIndex]).toBe(left.groundHeight[zeroIndex]);
            }
        }
    });

    test("renormalizes finite-edge samples without reading canonical zero padding as terrain", () => {
        const compiled = compileSemanticSurfaceField(createSurfaceCompilerTestWindow({
            tileIsValid: (tileX, tileY) => tileX >= 0 && tileY >= 0
        }));
        const edge = surfaceFieldTexelIndex(-1, -1);
        const expected = 27_040 / 0xffff * 10;
        expect(compiled.groundHeight[edge]).toBe(finiteFloat16Bits("expected edge height", expected));
        expect(compiled.materialWeights.slice(edge * 4, edge * 4 + 4)).toEqual(new Uint8Array([200, 55, 0, 0]));
    });
});
