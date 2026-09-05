import { describe, expect, test } from "vitest";

import {
    analyzeWorldStyleGallerySample,
    WORLD_STYLE_GALLERY_SAMPLES,
    WorldStyleGalleryMetrics
} from "../helpers/worldStyleGallery";

describe("world style hydrology review", () => {
    test("records the fixed corpus and rejects topology or regional-noise regressions", () => {
        const report: WorldStyleGalleryMetrics[] = WORLD_STYLE_GALLERY_SAMPLES
            .map(sample => analyzeWorldStyleGallerySample(sample));
        const environment = globalThis as typeof globalThis & {
            process?: { env?: Record<string, string | undefined> };
        };
        if (environment.process?.env?.WORLD_STYLE_PRINT === "1") {
            console.log(`WORLD_STYLE_REPORT=${JSON.stringify(report)}`);
        }
        if (environment.process?.env?.WORLD_STYLE_SUMMARY === "1") {
            console.log(`WORLD_STYLE_SUMMARY=${JSON.stringify(report.map(metrics => ({
                id: metrics.id,
                water: metrics.ratios.water,
                mountain: metrics.ratios.mountain,
                waterComponents: metrics.waters.components,
                dominantWater: metrics.waters.dominantRatio,
                isolatedWater: metrics.waters.isolatedRatio,
                coastline: metrics.coastlineEdgesPerThousandTiles,
                forest: metrics.ratios.forest,
                forestAdjacency: metrics.forests.adjacencyRatio,
                isolatedForest: metrics.forests.isolatedRatio,
                largestForest: metrics.forests.maximumSize
            })))}`);
        }

        for (const metrics of report) {
            const sample = WORLD_STYLE_GALLERY_SAMPLES.find(candidate => candidate.id === metrics.id)!;
            expect(metrics.topologySeamErrors, `${sample.id} topology seams`).toBe(0);
            if (metrics.forests.tiles >= 32) {
                expect(metrics.forests.adjacencyRatio, `${sample.id} forest adjacency`).toBeGreaterThan(0.85);
                expect(metrics.forests.isolatedRatio, `${sample.id} isolated forests`).toBeLessThan(0.15);
                expect(metrics.forests.maximumSize, `${sample.id} forest patch size`).toBeGreaterThanOrEqual(8);
            }
            if (metrics.mountains.tiles >= 32) {
                expect(metrics.mountains.isolatedRatio, `${sample.id} isolated mountains`).toBeLessThan(0.2);
            }
            if (metrics.waters.tiles >= 32) {
                expect(metrics.waters.isolatedRatio, `${sample.id} isolated water`).toBeLessThan(0.02);
                expect(metrics.waters.dominantRatio, `${sample.id} dominant water body`).toBeGreaterThan(0.3);
            }
            const expected = sample.group === "bounded"
                // v17's reviewed ocean field exposes more of bounded-a's
                // forest region; forest placement rules themselves are unchanged.
                ? { water: [0.45, 0.88], mountain: [0, 0.05], forest: [0.002, 0.09] }
                : sample.group === "toroidal-512"
                    ? { water: [0.15, 0.58], mountain: [0.04, 0.11], forest: [0.035, 0.07] }
                    : undefined;
            if (expected) {
                for (const [name, value, range] of [
                    ["water", metrics.ratios.water, expected.water],
                    ["mountain", metrics.ratios.mountain, expected.mountain],
                    ["forest", metrics.ratios.forest, expected.forest]
                ] as const) {
                    expect(value, `${sample.id} ${name} lower baseline`).toBeGreaterThanOrEqual(range[0]);
                    expect(value, `${sample.id} ${name} upper baseline`).toBeLessThanOrEqual(range[1]);
                }
            }
        }

        const dryExtreme = report.find(sample => sample.id === "extreme-dry")!;
        const waterExtreme = report.find(sample => sample.id === "extreme-water")!;
        expect(dryExtreme.ratios.water).toBeLessThan(0.05);
        expect(waterExtreme.ratios.water).toBeGreaterThan(0.9);

    });
});
