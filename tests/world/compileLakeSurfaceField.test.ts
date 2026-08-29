import { describe, expect, test } from "vitest";

import {
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_NONE,
    surfaceFieldTexelIndex
} from "../../src/world/CompiledSurfaceField";
import {
    HydrologyFeatureUpsertDelta,
    createAuthoredLakeFeature,
    createHydrologyFeatureDelta
} from "../../src/world/HydrologyFeatureDelta";
import { HYDROLOGY_POINT_QUANTIZATION } from "../../src/world/HydrologyRegion";
import { float16BitsToFloat32 } from "../../src/world/HalfFloat";
import { TransferableHydrologyRegionSlice } from "../../src/world/TransferableEffectiveWindow";
import { compileLakeSurfaceField } from "../../src/world/compileLakeSurfaceField";
import {
    SURFACE_COMPILER_TEST_WORLD_IDENTITY,
    createSurfaceCompilerTestWindow
} from "./surfaceCompilerFixture";

function authoredLake(
    featureId: string,
    coordinates: readonly number[],
    profileIndex = 7
): HydrologyFeatureUpsertDelta {
    const feature = createAuthoredLakeFeature({
        featureId,
        polygon: new Float64Array(coordinates.map(value => value * HYDROLOGY_POINT_QUANTIZATION)),
        level: 40_000,
        profileIndex
    });
    const delta = createHydrologyFeatureDelta({
        worldIdentity: SURFACE_COMPILER_TEST_WORLD_IDENTITY,
        revision: 1,
        featureId,
        featureKind: "lake",
        operation: "upsert",
        feature
    });
    if (delta.operation !== "upsert") throw new Error("test lake delta must be an upsert");
    return delta;
}

function lakeRegion(
    topology: "infinite" | "toroidal",
    suppressedBaseFeatureIds: readonly string[] = []
): TransferableHydrologyRegionSlice {
    return Object.freeze({
        key: Object.freeze({ regionX: 0, regionY: 0 }),
        topology,
        validBounds: Object.freeze({
            minX: 0 as const,
            minY: 0 as const,
            maxXExclusive: topology === "toroidal" ? 32 : 128,
            maxYExclusive: topology === "toroidal" ? 32 : 128
        }),
        baseRevision: 0,
        suppressedBaseFeatureIds: Object.freeze([...suppressedBaseFeatureIds]),
        boundaryPorts: Object.freeze([]),
        rivers: Object.freeze([]),
        lakes: Object.freeze(topology === "infinite" ? [{
            featureId: "lake-slice:base:0",
            bodyId: "lake:base",
            center: new Int16Array([5 * HYDROLOGY_POINT_QUANTIZATION, 5 * HYDROLOGY_POINT_QUANTIZATION]),
            radius: 2 * HYDROLOGY_POINT_QUANTIZATION,
            level: 40_000,
            profileIndex: 2
        }] : []),
        mouths: Object.freeze([]),
        bodies: Object.freeze(topology === "infinite"
            ? [{ bodyId: "lake:base", kind: "lake" as const, profileIndex: 2 }]
            : [])
    });
}

describe("compileLakeSurfaceField", () => {
    test("compiles an unsuppressed base lake circle and canonical body reference", () => {
        const compiled = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            hydrologyRegions: [lakeRegion("infinite")]
        }));
        const center = surfaceFieldTexelIndex(22, 22);
        expect(compiled.field.waterCoverage[center]).toBe(255);
        expect(compiled.field.waterKind[center]).toBe(SURFACE_WATER_KIND_LAKE);
        expect(compiled.waterBodies.entries).toEqual([
            { bodyId: "lake:base", kind: "lake", profileIndex: 2 }
        ]);
    });

    test("compiles authored polygon coverage, level, depth and a stable local body palette", () => {
        const lake = authoredLake("lake:authored", [
            206 / 64, 206 / 64,
            526 / 64, 206 / 64,
            526 / 64, 526 / 64,
            206 / 64, 526 / 64
        ]);
        const compiled = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [lake]
        }));
        const center = surfaceFieldTexelIndex(26, 26);
        const dryEdge = surfaceFieldTexelIndex(14, 26);
        const outside = surfaceFieldTexelIndex(5, 26);

        expect(compiled.waterBodies.entries).toEqual([
            { bodyId: "lake:authored", kind: "lake", profileIndex: 7 }
        ]);
        expect(compiled.field.waterCoverage[center]).toBe(255);
        expect(compiled.field.waterKind[center]).toBe(SURFACE_WATER_KIND_LAKE);
        expect(compiled.field.waterProfile[center]).toBe(7);
        expect(compiled.field.waterBodyIndex[center]).toBe(1);
        expect(compiled.field.waterDepth[center]).toBeGreaterThan(0);
        expect(compiled.field.waterCoverage[dryEdge]).toBeGreaterThan(0);
        expect(compiled.field.waterCoverage[dryEdge]).toBeLessThan(128);
        expect(compiled.field.waterDepth[dryEdge]).toBeGreaterThan(0);
        expect(compiled.field.waterCoverage[outside]).toBe(0);
        expect(compiled.field.waterKind[outside]).toBe(SURFACE_WATER_KIND_NONE);
    });

    test("suppresses a base circle before applying its complete authored replacement", () => {
        const replacement = authoredLake("lake:base", [
            9, 9,
            12, 9,
            12, 12,
            9, 12
        ], 6);
        const compiled = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            hydrologyRegions: [lakeRegion("infinite", ["lake:base"])],
            authoredHydrology: [replacement]
        }));
        const oldCenter = surfaceFieldTexelIndex(22, 22);
        const newCenter = surfaceFieldTexelIndex(42, 42);

        expect(compiled.field.waterCoverage[oldCenter]).toBe(0);
        expect(compiled.field.waterCoverage[newCenter]).toBe(255);
        expect(compiled.waterBodies.entries).toEqual([
            { bodyId: "lake:base", kind: "lake", profileIndex: 6 }
        ]);
    });

    test("projects canonical authored geometry across a toroidal seam", () => {
        const seamLake = authoredLake("lake:seam", [
            30, 2,
            31.5, 2,
            31.5, 5,
            30, 5
        ]);
        const compiled = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            domain: Object.freeze({ topology: "toroidal" as const, width: 32, height: 32 }),
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            hydrologyRegions: [lakeRegion("toroidal")],
            authoredHydrology: [seamLake]
        }));
        const wrapped = surfaceFieldTexelIndex(-1, 14);
        expect(compiled.field.waterCoverage[wrapped]).toBeGreaterThanOrEqual(128);
        expect(compiled.field.waterKind[wrapped]).toBe(SURFACE_WATER_KIND_LAKE);
    });

    test("intersects a lake shape with its continuous water-level terrain contour", () => {
        const lake = authoredLake("lake:terrain-cut", [
            2, 2,
            12, 2,
            12, 12,
            2, 12
        ]);
        const compiled = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: tileX => 20_000 + tileX * 2_000,
            authoredHydrology: [lake]
        }));
        const submerged = surfaceFieldTexelIndex(14, 26);
        const raised = surfaceFieldTexelIndex(46, 26);
        expect(compiled.field.waterCoverage[submerged]).toBe(255);
        expect(float16BitsToFloat32(compiled.field.shorelineDistance[submerged])).toBeLessThan(0);
        expect(compiled.field.waterCoverage[raised]).toBe(0);
        expect(float16BitsToFloat32(compiled.field.shorelineDistance[raised])).toBeGreaterThan(0);
    });

    test("lets lakes override ocean identity while remapping a sorted mixed palette", () => {
        const lake = authoredLake("lake:over-ocean", [
            3, 3,
            8, 3,
            8, 8,
            3, 8
        ]);
        const compiled = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 30_000,
            macroHeight: () => 20_000,
            authoredHydrology: [lake]
        }));
        const lakeCenter = surfaceFieldTexelIndex(22, 22);
        const oceanOnly = surfaceFieldTexelIndex(50, 50);
        expect(compiled.waterBodies.entries).toEqual([
            { bodyId: "lake:over-ocean", kind: "lake", profileIndex: 7 },
            { bodyId: "ocean", kind: "ocean", profileIndex: 0 }
        ]);
        expect(compiled.field.waterBodyIndex[lakeCenter]).toBe(1);
        expect(compiled.field.waterKind[lakeCenter]).toBe(SURFACE_WATER_KIND_LAKE);
        expect(compiled.field.waterBodyIndex[oceanOnly]).toBe(2);
    });

    test("keeps every shared field texel bit-identical across a lake chunk seam", () => {
        const lake = authoredLake("lake:cross-chunk", [
            14, 2,
            18, 2,
            18, 10,
            14, 10
        ]);
        const left = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [lake]
        })).field;
        const right = compileLakeSurfaceField(createSurfaceCompilerTestWindow({
            renderChunkX: 1,
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [lake]
        })).field;
        const scalarFields = [
            "groundHeight",
            "waterLevel",
            "waterDepth",
            "shorelineDistance",
            "waterCoverage",
            "waterKind",
            "waterProfile"
        ] as const;
        for (let texelY = -1; texelY <= 64; texelY += 1) {
            for (const [leftX, rightX] of [[63, -1], [64, 0]] as const) {
                const leftIndex = surfaceFieldTexelIndex(leftX, texelY);
                const rightIndex = surfaceFieldTexelIndex(rightX, texelY);
                for (const field of scalarFields) {
                    expect(left[field][leftIndex]).toBe(right[field][rightIndex]);
                }
            }
        }
    });
});
