import { describe, expect, test } from "vitest";

import {
    HYDROLOGY_REGION_SIZE,
    SURFACE_COMPILE_PROFILE,
    SURFACE_CORE_TEXELS,
    SURFACE_FIELD_CPU_BYTES,
    SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL,
    WORLD_SEMANTIC_CHUNK_SIZE,
    assertSurfaceCompileProfile,
    surfaceInfluenceRadiusWorld
} from "../../src/world/SurfaceCompileProfile";

describe("SurfaceCompileProfile v1", () => {
    test("freezes the aligned world and compiler dimensions", () => {
        expect(WORLD_SEMANTIC_CHUNK_SIZE).toBe(32);
        expect(HYDROLOGY_REGION_SIZE).toBe(128);
        expect(SURFACE_COMPILE_PROFILE).toEqual({
            version: 1,
            renderChunkSize: 16,
            samplesPerTileInterval: 4,
            gutterTexels: 1,
            influenceRadiusTiles: 2,
            textureLayerSize: 66,
            pageLayers: 128,
            waterGeometryCoverageThreshold: 0.5,
            waterFullPatchCoverage: 128
        });
        expect(Object.isFrozen(SURFACE_COMPILE_PROFILE)).toBe(true);
        expect(SURFACE_CORE_TEXELS).toBe(64);
        expect(HYDROLOGY_REGION_SIZE / WORLD_SEMANTIC_CHUNK_SIZE).toBe(4);
        expect(WORLD_SEMANTIC_CHUNK_SIZE / SURFACE_COMPILE_PROFILE.renderChunkSize).toBe(2);
        expect(surfaceInfluenceRadiusWorld(3)).toBe(6);
        expect(() => surfaceInfluenceRadiusWorld(0)).toThrow(/positive finite/);
    });

    test("keeps the logical static field below the contracted 80 KiB budget", () => {
        expect(SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL).toBe(18);
        expect(SURFACE_FIELD_CPU_BYTES).toBe(78_408);
        expect(SURFACE_FIELD_CPU_BYTES).toBeLessThan(80 * 1024);
    });

    test("rejects profiles that split the frozen configuration", () => {
        expect(() => assertSurfaceCompileProfile({
            ...SURFACE_COMPILE_PROFILE,
            renderChunkSize: 15
        })).toThrow(/align/);
        expect(() => assertSurfaceCompileProfile({
            ...SURFACE_COMPILE_PROFILE,
            textureLayerSize: 65
        })).toThrow(/core and gutter/);
        expect(() => assertSurfaceCompileProfile({
            ...SURFACE_COMPILE_PROFILE,
            pageLayers: 129
        })).toThrow(/layer budget/);
        expect(() => assertSurfaceCompileProfile({
            ...SURFACE_COMPILE_PROFILE,
            pageLayers: 64
        })).toThrow(/frozen profile v1/);
    });
});
