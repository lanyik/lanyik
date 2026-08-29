import { describe, expect, test } from "vitest";

import {
    SURFACE_WATER_KIND_NONE,
    SURFACE_WATER_KIND_OCEAN,
    surfaceFieldTexelIndex
} from "../../src/world/CompiledSurfaceField";
import {
    compiledWaterBodyPaletteIndex,
    createCompiledWaterBodyPalette
} from "../../src/world/CompiledWaterBodyPalette";
import { float16BitsToFloat32 } from "../../src/world/HalfFloat";
import { OCEAN_BODY_ID } from "../../src/world/MacroDrainageGraph";
import { SURFACE_COMPILE_PROFILE } from "../../src/world/SurfaceCompileProfile";
import { compileOceanSurfaceField } from "../../src/world/compileOceanSurfaceField";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

describe("compileOceanSurfaceField", () => {
    test("derives antialiased ocean coverage, depth and signed world-space shoreline distance", () => {
        const compiled = compileOceanSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 30_100,
            macroHeight: tileX => 20_000 + tileX * 1_000
        }));
        const deepWater = surfaceFieldTexelIndex(5, 20);
        const wetEdge = surfaceFieldTexelIndex(41, 20);
        const dryEdge = surfaceFieldTexelIndex(42, 20);
        const inland = surfaceFieldTexelIndex(60, 20);

        expect(compiled.waterBodies.entries).toEqual([
            { bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 }
        ]);
        expect(compiled.field.waterCoverage[deepWater]).toBe(255);
        expect(compiled.field.waterKind[deepWater]).toBe(SURFACE_WATER_KIND_OCEAN);
        expect(compiled.field.waterBodyIndex[deepWater]).toBe(1);
        expect(float16BitsToFloat32(compiled.field.waterDepth[deepWater])).toBeGreaterThan(0);
        expect(compiled.field.waterCoverage[wetEdge]).toBeGreaterThanOrEqual(128);
        expect(compiled.field.waterCoverage[wetEdge]).toBe(255);
        expect(compiled.field.waterCoverage[dryEdge]).toBeGreaterThan(0);
        expect(compiled.field.waterCoverage[dryEdge]).toBeLessThan(128);
        expect(compiled.field.waterDepth[dryEdge]).toBe(0);
        expect(float16BitsToFloat32(compiled.field.shorelineDistance[wetEdge])).toBeLessThan(0);
        expect(float16BitsToFloat32(compiled.field.shorelineDistance[dryEdge])).toBeGreaterThan(0);
        expect(compiled.field.waterCoverage[inland]).toBe(0);
        expect(compiled.field.waterKind[inland]).toBe(SURFACE_WATER_KIND_NONE);
    });

    test("uses canonical saturated fields for uniform land and ocean windows", () => {
        const land = compileOceanSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 30_000,
            macroHeight: () => 40_000
        }));
        const ocean = compileOceanSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 30_000,
            macroHeight: () => 20_000
        }));
        const saturation = SURFACE_COMPILE_PROFILE.influenceRadiusTiles * Math.sqrt(3) * 2;

        expect(land.waterBodies.entries).toEqual([]);
        expect(land.field.waterCoverage.every(value => value === 0)).toBe(true);
        expect(float16BitsToFloat32(land.field.shorelineDistance[0])).toBeCloseTo(saturation, 2);
        expect(ocean.waterBodies.entries).toEqual([
            { bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 }
        ]);
        expect(ocean.field.waterCoverage.every(value => value === 255)).toBe(true);
        expect(float16BitsToFloat32(ocean.field.shorelineDistance[0])).toBeCloseTo(-saturation, 2);
    });

    test("produces bit-identical shared columns when a shoreline crosses a chunk seam", () => {
        const macroHeight = (tileX: number): number => 14_500 + tileX * 1_000;
        const left = compileOceanSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 30_000,
            macroHeight
        })).field;
        const right = compileOceanSurfaceField(createSurfaceCompilerTestWindow({
            renderChunkX: 1,
            seaLevel: 30_000,
            macroHeight
        })).field;
        const scalarFields = [
            "groundHeight",
            "waterLevel",
            "waterDepth",
            "shorelineDistance",
            "waterCoverage",
            "waterKind",
            "waterProfile",
            "waterBodyIndex"
        ] as const;
        for (let texelY = -1; texelY <= 64; texelY += 1) {
            for (const [leftX, rightX] of [[63, -1], [64, 0]] as const) {
                const leftIndex = surfaceFieldTexelIndex(leftX, texelY);
                const rightIndex = surfaceFieldTexelIndex(rightX, texelY);
                for (const field of scalarFields) {
                    expect(left[field][leftIndex]).toBe(right[field][rightIndex]);
                }
                expect(left.materialWeights.slice(leftIndex * 4, leftIndex * 4 + 4))
                    .toEqual(right.materialWeights.slice(rightIndex * 4, rightIndex * 4 + 4));
                expect(left.flow.slice(leftIndex * 2, leftIndex * 2 + 2))
                    .toEqual(right.flow.slice(rightIndex * 2, rightIndex * 2 + 2));
            }
        }
    });
});

describe("CompiledWaterBodyPalette", () => {
    test("uses stable one-based field indices and rejects ambiguous ordering", () => {
        const palette = createCompiledWaterBodyPalette([
            { bodyId: "lake:a", kind: "lake", profileIndex: 2 },
            { bodyId: "river:b", kind: "river", profileIndex: 3 }
        ]);
        expect(compiledWaterBodyPaletteIndex(palette, "lake:a")).toBe(1);
        expect(compiledWaterBodyPaletteIndex(palette, "river:b")).toBe(2);
        expect(compiledWaterBodyPaletteIndex(palette, OCEAN_BODY_ID)).toBe(0);
        expect(() => createCompiledWaterBodyPalette([
            { bodyId: "river:b", kind: "river", profileIndex: 3 },
            { bodyId: "lake:a", kind: "lake", profileIndex: 2 }
        ])).toThrow(/ascending/);
    });
});
