import { describe, expect, test } from "vitest";

import {
    COMPILED_SURFACE_TEXEL_COUNT,
    createCompiledSurfaceField
} from "../../src/world/CompiledSurfaceField";
import {
    assertCompiledWaterGeometry,
    compileWaterGeometry,
    compiledWaterGeometryTransferables
} from "../../src/world/CompiledWaterGeometry";
import { finiteFloat16Bits } from "../../src/world/HalfFloat";
import { SURFACE_COMPILE_PROFILE } from "../../src/world/SurfaceCompileProfile";
import { compileSurfaceField } from "../../src/world/compileSurfaceField";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

function isolatedMinimumCoverageField() {
    const materialWeights = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT * 4);
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        materialWeights[index * 4] = 255;
    }
    const waterCoverage = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterKind = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const marker = 20 * SURFACE_COMPILE_PROFILE.textureLayerSize + 20;
    waterCoverage[marker] = 1;
    waterKind[marker] = 1;
    waterBodyIndex[marker] = 1;
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    shorelineDistance.fill(finiteFloat16Bits("test dry shoreline", 1));
    return createCompiledSurfaceField({
        groundHeight: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        materialWeights,
        waterLevel: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterDepth: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        shorelineDistance,
        flow: new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2),
        waterCoverage,
        waterKind,
        waterProfile: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterBodyIndex
    });
}

function boundaryValues(
    positions: Float32Array,
    boundaryU: number
): number[] {
    const output: number[] = [];
    for (let index = 0; index < positions.length / 3; index += 1) {
        if (positions[index * 3] === boundaryU) output.push(positions[index * 3 + 2]);
    }
    return output.sort((first, second) => first - second);
}

describe("compiled water geometry", () => {
    test("uses no allocation for dry core and a shared marker for a wet-majority core", () => {
        const dry = compileWaterGeometry(compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000
        })).field);
        const full = compileWaterGeometry(compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 40_000,
            macroHeight: () => 20_000
        })).field);
        expect(dry).toEqual({ formatVersion: 1, kind: "none" });
        expect(full).toEqual({ formatVersion: 1, kind: "fullPatch" });
        expect(compiledWaterGeometryTransferables(dry)).toEqual([]);
        expect(compiledWaterGeometryTransferables(full)).toEqual([]);
    });

    test("keeps even the minimum non-zero quantized coverage", () => {
        const geometry = compileWaterGeometry(isolatedMinimumCoverageField());
        expect(geometry.kind).toBe("coverage");
        if (geometry.kind !== "coverage") throw new Error("test expected coverage geometry");
        expect(geometry.indices.length).toBeGreaterThan(0);
        assertCompiledWaterGeometry(geometry);
    });

    test("builds deterministic transferable coastline geometry with positive-Y winding", () => {
        const field = compileSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 35_000,
            macroHeight: (_tileX, tileY) => Math.max(0, Math.min(0xffff, 20_000 + tileY * 2_000))
        })).field;
        const first = compileWaterGeometry(field);
        const second = compileWaterGeometry(field);
        expect(first.kind).toBe("coverage");
        expect(second.kind).toBe("coverage");
        if (first.kind !== "coverage" || second.kind !== "coverage") {
            throw new Error("test expected coverage geometry");
        }
        expect(first.positions).toEqual(second.positions);
        expect(first.surfaceFieldCoordinates).toEqual(second.surfaceFieldCoordinates);
        expect(first.indices).toEqual(second.indices);
        const transfer = compiledWaterGeometryTransferables(first);
        expect(transfer).toHaveLength(3);
        const cloned = structuredClone(first, { transfer: [...transfer] }) as typeof first;
        expect(first.positions.byteLength).toBe(0);
        expect(first.surfaceFieldCoordinates.byteLength).toBe(0);
        expect(first.indices.byteLength).toBe(0);
        assertCompiledWaterGeometry(cloned);
    });

    test("locks identical contour vertices on adjacent render chunk boundaries", () => {
        const options = {
            seaLevel: 35_000,
            macroHeight: (_tileX: number, tileY: number) => Math.max(
                0,
                Math.min(0xffff, 20_000 + tileY * 2_000)
            )
        };
        const first = compileWaterGeometry(compileSurfaceField(createSurfaceCompilerTestWindow({
            ...options,
            renderChunkX: 0
        })).field);
        const second = compileWaterGeometry(compileSurfaceField(createSurfaceCompilerTestWindow({
            ...options,
            renderChunkX: 1
        })).field);
        if (first.kind !== "coverage" || second.kind !== "coverage") {
            throw new Error("test expected adjacent coverage geometry");
        }
        const firstBoundary = boundaryValues(
            first.positions,
            SURFACE_COMPILE_PROFILE.renderChunkSize - 0.5
        );
        const secondBoundary = boundaryValues(second.positions, -0.5);
        expect(firstBoundary.length).toBeGreaterThan(0);
        expect(secondBoundary).toEqual(firstBoundary);
    });

    test("rejects corrupted coverage winding", () => {
        const geometry = compileWaterGeometry(isolatedMinimumCoverageField());
        if (geometry.kind !== "coverage") throw new Error("test expected coverage geometry");
        const indices = geometry.indices.slice();
        [indices[1], indices[2]] = [indices[2], indices[1]];
        expect(() => assertCompiledWaterGeometry({ ...geometry, indices }))
            .toThrow(/positive world Y/);
    });
});
