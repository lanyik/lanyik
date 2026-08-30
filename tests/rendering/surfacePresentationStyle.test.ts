import { describe, expect, it } from "vitest";

import {
    createSurfacePresentationStyle,
    DEFAULT_SURFACE_PRESENTATION_STYLE
} from "../../src/rendering/SurfacePresentationStyle";

describe("SurfacePresentationStyle", () => {
    it("publishes immutable complete defaults and deterministic partial updates", () => {
        const style = createSurfacePresentationStyle({
            gridVisible: false,
            distanceFogStrength: 0.4,
            waterWaveSpeed: 2.5,
            grassVisible: false
        });
        expect(style).toEqual({
            ...DEFAULT_SURFACE_PRESENTATION_STYLE,
            gridVisible: false,
            distanceFogStrength: 0.4,
            waterWaveSpeed: 2.5,
            grassVisible: false
        });
        expect(Object.isFrozen(style)).toBe(true);
    });

    it("rejects unknown, mistyped and out-of-domain values", () => {
        expect(() => createSurfacePresentationStyle({ unknown: true } as never)).toThrow(TypeError);
        expect(() => createSurfacePresentationStyle({ treesVisible: 1 } as never)).toThrow(TypeError);
        expect(() => createSurfacePresentationStyle({ waterWaveAmplitude: 4.01 })).toThrow(RangeError);
        expect(() => createSurfacePresentationStyle({ distanceFogStrength: 2.01 })).toThrow(RangeError);
        expect(() => createSurfacePresentationStyle({ coastalWaveOpacity: -0.01 })).toThrow(RangeError);
        expect(() => createSurfacePresentationStyle({ grassWindStrength: Number.NaN })).toThrow(RangeError);
    });
});
