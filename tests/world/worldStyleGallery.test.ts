import { describe, expect, test } from "vitest";

import {
    analyzeWorldStyleGallerySample,
    WORLD_STYLE_GALLERY_SAMPLES
} from "../helpers/worldStyleGallery";

describe("world style gallery metrics", () => {
    test("freezes the required stage-5 corpus shape", () => {
        const group = (name: typeof WORLD_STYLE_GALLERY_SAMPLES[number]["group"]) =>
            WORLD_STYLE_GALLERY_SAMPLES.filter(sample => sample.group === name);
        expect(group("bounded")).toHaveLength(4);
        expect(group("toroidal-512")).toHaveLength(6);
        expect(new Set(group("infinite-window").map(sample => sample.seed)).size).toBe(4);
        expect(group("infinite-window").some(sample => sample.originX < 0 && sample.originY < 0)).toBe(true);
        expect(group("infinite-window").some(sample => sample.originX > 0 && sample.originY > 0)).toBe(true);
        expect(group("stress")).toHaveLength(2);
        expect(group("minimum")).toHaveLength(2);
    });

    test.each(WORLD_STYLE_GALLERY_SAMPLES.filter(sample => sample.group === "minimum"))(
        "analyzes $id with topology-aware six-neighbor metrics",
        sample => {
            const metrics = analyzeWorldStyleGallerySample(sample);
            expect(metrics.ratios.land + metrics.ratios.water).toBeCloseTo(1, 5);
            expect(Object.values(metrics.climateRatios).reduce((sum, value) => sum + value, 0))
                .toBeCloseTo(1, 5);
            expect(metrics.topologySeamErrors).toBe(0);
            expect(metrics.mountains.tiles).toBeLessThanOrEqual(sample.width * sample.height);
            expect(metrics.forests.adjacencyRatio).toBeGreaterThanOrEqual(0);
            expect(metrics.forests.adjacencyRatio).toBeLessThanOrEqual(1);
            expect(metrics.lakes.singleCellRatio).toBeGreaterThanOrEqual(0);
            expect(metrics.lakes.singleCellRatio).toBeLessThanOrEqual(1);
        }
    );
});
