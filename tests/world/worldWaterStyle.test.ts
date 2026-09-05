import { describe, expect, test } from "vitest";

import { createWorldDescriptor, serializeWorldDescriptor, worldDescriptorsEqual } from "../../src/world/WorldDescriptor";
import {
    assertWorldWaterGenerationStyle,
    createWorldStyleProfile,
    DEFAULT_WORLD_WATER_STYLE,
    normalizeWorldWaterGenerationStyle,
    serializeWorldWaterGenerationStyle,
    WORLD_STYLE_PROFILE,
    WORLD_WATER_STYLE_RANGES,
    WorldWaterGenerationStyle,
    worldWaterGenerationStylesEqual
} from "../../src/world/WorldStyleProfile";

describe("water authoring contract", () => {
    test("uses the reviewed defaults in both direct samplers and authored worlds", () => {
        expect(DEFAULT_WORLD_WATER_STYLE).toEqual({
            oceanScale: 1.4, oceanLevel: 0.46,
            riverSourceCellSize: 16, riverSourcesPerCell: 4, riverLength: 100,
            riverWarpScale: 0.08, riverWarpAmplitude: 3.75,
            riverBaseRadius: 1.75, riverHighFlowRadius: 4, riverHighFlowThreshold: 24
        });
        expect(createWorldStyleProfile()).toEqual(WORLD_STYLE_PROFILE);
        expect(normalizeWorldWaterGenerationStyle()).toEqual(DEFAULT_WORLD_WATER_STYLE);
        expect(Object.isFrozen(WORLD_WATER_STYLE_RANGES)).toBe(true);
    });

    for (const name of Object.keys(WORLD_WATER_STYLE_RANGES) as (keyof WorldWaterGenerationStyle)[]) {
        test(`${name} shares valid UI bounds, validation and world identity`, () => {
            const { min, max, step } = WORLD_WATER_STYLE_RANGES[name];
            expect(Object.isFrozen(WORLD_WATER_STYLE_RANGES[name])).toBe(true);
            expect(DEFAULT_WORLD_WATER_STYLE[name]).toBeGreaterThanOrEqual(min);
            expect(DEFAULT_WORLD_WATER_STYLE[name]).toBeLessThanOrEqual(max);
            const base = createWorldDescriptor({ seed: "water-authoring" });
            for (const value of [min, max]) {
                const style = { ...DEFAULT_WORLD_WATER_STYLE, [name]: value };
                expect(() => createWorldStyleProfile(style)).not.toThrow();
                const descriptor = createWorldDescriptor({ seed: "water-authoring", waterStyle: style });
                expect(normalizeWorldWaterGenerationStyle(style)[name]).toBe(value);
                const unchanged = value === DEFAULT_WORLD_WATER_STYLE[name];
                expect(serializeWorldWaterGenerationStyle(style) === serializeWorldWaterGenerationStyle(DEFAULT_WORLD_WATER_STYLE)).toBe(unchanged);
                expect(worldWaterGenerationStylesEqual(style, DEFAULT_WORLD_WATER_STYLE)).toBe(unchanged);
                expect(serializeWorldDescriptor(descriptor) === serializeWorldDescriptor(base)).toBe(unchanged);
                expect(worldDescriptorsEqual(descriptor, base)).toBe(unchanged);
            }
            for (const value of [min - step, max + step, NaN, Infinity, -Infinity, undefined, "1"]) {
                expect(() => assertWorldWaterGenerationStyle({ ...DEFAULT_WORLD_WATER_STYLE, [name]: value }))
                    .toThrow(new RegExp(name));
            }
            if (step >= 1) {
                expect(() => assertWorldWaterGenerationStyle({ ...DEFAULT_WORLD_WATER_STYLE, [name]: min + step / 2 }))
                    .toThrow(/integer/);
            }
        });
    }

    test("all slider combinations preserve the lattice, width and bounded trace constraints", () => {
        for (const endpoint of ["min", "max"] as const) {
            const style = Object.fromEntries(Object.entries(WORLD_WATER_STYLE_RANGES)
                .map(([name, range]) => [name, range[endpoint]])) as unknown as WorldWaterGenerationStyle;
            expect(() => createWorldStyleProfile(style)).not.toThrow();
        }
        expect(WORLD_WATER_STYLE_RANGES.riverBaseRadius.max).toBeLessThan(WORLD_WATER_STYLE_RANGES.riverHighFlowRadius.min);
        expect(WORLD_WATER_STYLE_RANGES.riverWarpAmplitude.max).toBeLessThan(WORLD_STYLE_PROFILE.rivers.courseStep / 2);
        const longest = createWorldStyleProfile({ ...DEFAULT_WORLD_WATER_STYLE, riverLength: 300 });
        expect(longest.rivers.courseLengthMultiplier).toBe(3);
        expect(longest.rivers.maximumCourseLength).toBe(WORLD_STYLE_PROFILE.rivers.maximumCourseLength);
    });
});
