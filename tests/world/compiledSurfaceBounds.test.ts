import { describe, expect, test } from "vitest";

import {
    assertCompiledSurfaceBounds,
    compileSurfaceBounds
} from "../../src/world/CompiledSurfaceBounds";
import { compileWaterGeometry } from "../../src/world/CompiledWaterGeometry";
import { float16BitsToFloat32 } from "../../src/world/HalfFloat";
import { compileSurfaceField } from "../../src/world/compileSurfaceField";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

function compileUniform(seaLevel: number, macroHeight: number, hexSize = 2) {
    const compilation = compileSurfaceField(createSurfaceCompilerTestWindow({
        seaLevel,
        macroHeight: () => macroHeight
    }));
    const geometry = compileWaterGeometry(compilation.field);
    return {
        compilation,
        geometry,
        bounds: compileSurfaceBounds(compilation.field, geometry, hexSize)
    };
}

describe("CompiledSurfaceBounds", () => {
    test("computes exact canonical ground bounds and no water range for dry chunks", () => {
        const compiled = compileUniform(10_000, 20_000);
        expect(compiled.geometry.kind).toBe("none");
        const expectedGround = float16BitsToFloat32(compiled.compilation.field.groundHeight[0]);
        expect(compiled.bounds.minimumGroundHeight).toBe(expectedGround);
        expect(compiled.bounds.maximumGroundHeight).toBe(expectedGround);
        expect(compiled.bounds.minimumWaterHeight).toBeNull();
        expect(compiled.bounds.maximumWaterHeight).toBeNull();
        expect(compiled.bounds.minimumBaseHeight).toBe(expectedGround);
        expect(compiled.bounds.maximumBaseHeight).toBe(expectedGround);
        expect(compiled.bounds.groundMaximumDisplacement).toBe(0.05);
        expect(compiled.bounds.waterMaximumDisplacement).toBe(0);
        expect(compiled.bounds.minimumVisualHeight).toBe(expectedGround - 0.05);
        expect(compiled.bounds.maximumVisualHeight).toBe(expectedGround + 0.05);
        assertCompiledSurfaceBounds(compiled.bounds);
    });

    test("includes sampled full-patch and coverage water heights", () => {
        const full = compileUniform(40_000, 20_000);
        expect(full.geometry.kind).toBe("fullPatch");
        const expectedWater = float16BitsToFloat32(full.compilation.field.waterLevel[0]);
        expect(full.bounds.minimumWaterHeight).toBe(expectedWater);
        expect(full.bounds.maximumWaterHeight).toBe(expectedWater);
        expect(full.bounds.maximumBaseHeight).toBe(expectedWater);
        expect(full.bounds.waterMaximumDisplacement).toBe(0.24);
        expect(full.bounds.maximumVisualHeight).toBe(expectedWater + 0.24);

        const coastline = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 35_000,
            macroHeight: (_tileX, tileY) => Math.max(0, Math.min(0xffff, 20_000 + tileY * 2_000))
        }));
        const geometry = compileWaterGeometry(coastline.field);
        expect(geometry.kind).toBe("coverage");
        const bounds = compileSurfaceBounds(coastline.field, geometry, 2);
        expect(bounds.minimumWaterHeight).not.toBeNull();
        expect(bounds.maximumWaterHeight).toBe(bounds.minimumWaterHeight);
        expect(bounds.maximumBaseHeight).toBeGreaterThanOrEqual(bounds.maximumGroundHeight);
    });

    test("scales local world-XZ and bounded visual displacement with hex size", () => {
        const compiled = compileUniform(10_000, 20_000, 1);
        const doubled = compileSurfaceBounds(compiled.compilation.field, compiled.geometry, 2);
        expect(doubled.minimumX).toBeCloseTo(compiled.bounds.minimumX * 2, 12);
        expect(doubled.maximumX).toBeCloseTo(compiled.bounds.maximumX * 2, 12);
        expect(doubled.minimumZ).toBeCloseTo(compiled.bounds.minimumZ * 2, 12);
        expect(doubled.maximumZ).toBeCloseTo(compiled.bounds.maximumZ * 2, 12);
        expect(doubled.minimumGroundHeight).toBe(compiled.bounds.minimumGroundHeight);
        expect(doubled.maximumGroundHeight).toBe(compiled.bounds.maximumGroundHeight);
        expect(doubled.groundMaximumDisplacement)
            .toBe(compiled.bounds.groundMaximumDisplacement * 2);
    });

    test("rejects a base range that does not exactly enclose its components", () => {
        const bounds = compileUniform(40_000, 20_000).bounds;
        expect(() => assertCompiledSurfaceBounds({
            ...bounds,
            maximumBaseHeight: bounds.maximumBaseHeight + 1
        })).toThrow(/exactly/);
        expect(() => assertCompiledSurfaceBounds({
            ...bounds,
            maximumVisualHeight: bounds.maximumVisualHeight + 1
        })).toThrow(/visual height/);
    });
});
