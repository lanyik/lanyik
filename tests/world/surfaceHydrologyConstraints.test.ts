import { describe, expect, test } from "vitest";

import {
    createAuthoredRiverFeature,
    createHydrologyFeatureDelta
} from "../../src/world/HydrologyFeatureDelta";
import { HYDROLOGY_POINT_QUANTIZATION } from "../../src/world/HydrologyRegion";
import {
    collectSurfaceHydrologyDepthViolations
} from "../../src/world/compileSurfaceField";
import {
    SURFACE_COMPILER_TEST_WORLD_IDENTITY,
    createSurfaceCompilerTestWindow
} from "./surfaceCompilerFixture";

function river() {
    const feature = createAuthoredRiverFeature({
        featureId: "river:constraint",
        source: { kind: "spring", sourceId: "spring:constraint" },
        outlet: { kind: "ocean", bodyId: "ocean" },
        controlPoints: new Float64Array([
            2 * HYDROLOGY_POINT_QUANTIZATION, 5 * HYDROLOGY_POINT_QUANTIZATION,
            12 * HYDROLOGY_POINT_QUANTIZATION, 5 * HYDROLOGY_POINT_QUANTIZATION
        ]),
        widthProfile: new Uint8Array([2, 2]),
        levelProfile: new Uint16Array([40_000, 40_000]),
        dischargeClass: 2,
        profileIndex: 1
    });
    const delta = createHydrologyFeatureDelta({
        worldIdentity: SURFACE_COMPILER_TEST_WORLD_IDENTITY,
        revision: 1,
        featureId: feature.featureId,
        featureKind: "river",
        operation: "upsert",
        feature
    });
    if (delta.operation !== "upsert") throw new Error("constraint fixture requires an upsert");
    return delta;
}

describe("surface hydrology authoring constraints", () => {
    test("accepts a continuously deep channel using the compiler river kernel", () => {
        const window = createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: () => 20_000,
            authoredHydrology: [river()]
        });
        expect(collectSurfaceHydrologyDepthViolations(window, 1)).toEqual([]);
    });

    test("reports q4 grid and depth-contour violations when terrain blocks a channel", () => {
        const window = createSurfaceCompilerTestWindow({
            seaLevel: 10_000,
            macroHeight: tileX => tileX < 7 ? 20_000 : 45_000,
            authoredHydrology: [river()]
        });
        const violations = collectSurfaceHydrologyDepthViolations(window, 0.25);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations.every(value => value.featureId === "river:constraint")).toBe(true);
        expect(violations.some(value => value.sampleKind === "scalar-grid")).toBe(true);
        expect(violations.some(value => value.sampleKind === "depth-contour")).toBe(true);
        expect(violations.every(value => value.groundHeight
            > value.waterLevel - value.minimumDepth)).toBe(true);
    });

    test("rejects invalid minimum-depth contracts before doing authoring work", () => {
        const window = createSurfaceCompilerTestWindow({
            authoredHydrology: [river()]
        });
        expect(() => collectSurfaceHydrologyDepthViolations(window, -1)).toThrow(/minimum depth/);
        expect(() => collectSurfaceHydrologyDepthViolations(window, 11)).toThrow(/height scale/);
    });
});
