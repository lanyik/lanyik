import { describe, expect, test } from "vitest";

import {
    MAX_SURFACE_SCALAR_CONTOUR_SAMPLES,
    surfaceScalarContours
} from "../../src/world/SurfaceContours";

describe("SurfaceContours", () => {
    test("extracts a globally phased signed scalar boundary in world space", () => {
        const contours = surfaceScalarContours(
            { minU: 0, minV: 0, maxU: 2, maxV: 2 },
            2,
            u => u - 1
        );
        expect(contours).toHaveLength(8);
        expect(contours.every(segment => segment.start.x === 3 && segment.end.x === 3)).toBe(true);
    });

    test("rejects scalar grids outside the fixed scratch budget", () => {
        expect(MAX_SURFACE_SCALAR_CONTOUR_SAMPLES).toBe(16_384);
        expect(() => surfaceScalarContours(
            { minU: 0, minV: 0, maxU: 100, maxV: 100 },
            1,
            () => 1
        )).toThrow(/sample budget/);
    });
});
