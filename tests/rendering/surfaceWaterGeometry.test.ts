import { describe, expect, test, vi } from "vitest";

import { SurfaceGroundGeometrySet } from "../../src/rendering/SurfaceGroundGeometry";
import { SurfaceWaterGeometryBinding } from "../../src/rendering/SurfaceWaterGeometry";
import { compileWaterGeometry } from "../../src/world/CompiledWaterGeometry";
import { compileSurfaceField } from "../../src/world/compileSurfaceField";
import { createSurfaceCompilerTestWindow } from "../world/surfaceCompilerFixture";

describe("SurfaceWaterGeometryBinding", () => {
    test("uses no geometry for dry chunks and borrows the shared near patch for full water", () => {
        const shared = new SurfaceGroundGeometrySet();
        const dryCompiled = compileWaterGeometry(compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000
        })).field);
        const fullCompiled = compileWaterGeometry(compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 40_000,
            macroHeight: () => 20_000
        })).field);
        const dry = new SurfaceWaterGeometryBinding(dryCompiled, shared);
        const full = new SurfaceWaterGeometryBinding(fullCompiled, shared);
        expect(dry.geometry).toBeUndefined();
        expect(dry.ownsGeometry).toBe(false);
        expect(full.geometry).toBe(shared.get("near"));
        expect(full.ownsGeometry).toBe(false);
        full.dispose();
        expect(shared.get("near")).toBe(full.geometry);
        shared.dispose();
    });

    test("owns and disposes only a chunk-local coverage BufferGeometry", () => {
        const shared = new SurfaceGroundGeometrySet();
        const compiled = compileWaterGeometry(compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 35_000,
            macroHeight: (_tileX, tileY) => Math.max(0, Math.min(0xffff, 20_000 + tileY * 2_000))
        })).field);
        const binding = new SurfaceWaterGeometryBinding(compiled, shared);
        expect(binding.kind).toBe("coverage");
        expect(binding.ownsGeometry).toBe(true);
        const geometry = binding.geometry;
        if (!geometry || compiled.kind !== "coverage") throw new Error("test expected coverage geometry");
        expect(geometry.getAttribute("position").array).toBe(compiled.positions);
        expect(geometry.getAttribute("surfaceFieldCoordinate").array)
            .toBe(compiled.surfaceFieldCoordinates);
        expect(geometry.getIndex()?.array).toBe(compiled.indices);
        const dispose = vi.fn();
        geometry.addEventListener("dispose", dispose);
        binding.dispose();
        binding.dispose();
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(binding.isDisposed).toBe(true);
        expect(shared.get("near")).toBeDefined();
        shared.dispose();
    });
});
