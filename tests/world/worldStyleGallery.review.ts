import { describe, expect, test } from "vitest";

import {
    analyzeWorldStyleGallerySample,
    WORLD_STYLE_GALLERY_SAMPLES,
    WorldStyleGalleryMetrics
} from "../helpers/worldStyleGallery";

describe("world style v11 full gallery review", () => {
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
                mountain: metrics.ratios.mountain,
                forest: metrics.ratios.forest,
                forestAdjacency: metrics.forests.adjacencyRatio,
                isolatedForest: metrics.forests.isolatedRatio,
                largestForest: metrics.forests.maximumSize,
                water: metrics.ratios.water,
                waterConnected: metrics.water.connectedRatio,
                isolatedWater: metrics.water.isolatedRatio,
                largestWater: metrics.water.maximumSize
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
            if (metrics.water.tiles >= 16) {
                expect(metrics.water.connectedRatio, `${sample.id} connected sampled water`)
                    .toBeGreaterThan(0.97);
                // A sampled window can clip a valid chain at its boundary, so
                // adjacency is the hard per-tile invariant. Keep the sampled-
                // water component diagnostic deliberately broader.
                // A clipped single waterway or basin cell can be isolated inside the
                // water-only component graph.
                expect(metrics.water.isolatedRatio, `${sample.id} isolated sampled water`)
                    .toBeLessThan(0.16);
                expect(metrics.water.maximumSize, `${sample.id} sampled-water component size`)
                    .toBeGreaterThanOrEqual(7);
                if (sample.group === "toroidal-512") {
                    expect(metrics.water.maximumSize, `${sample.id} macro water network`)
                        .toBeGreaterThanOrEqual(50);
                } else if (sample.group === "infinite-window" && metrics.water.tiles >= 32) {
                    expect(metrics.water.maximumSize, `${sample.id} macro water network`)
                        .toBeGreaterThanOrEqual(12);
                } else if (sample.group === "bounded" && metrics.water.tiles >= 32) {
                    expect(metrics.water.maximumSize, `${sample.id} macro water network`)
                        .toBeGreaterThanOrEqual(14);
                }
            }
            const expected = sample.group === "bounded"
                ? { water: [0.04, 0.45], mountain: [0, 0.2], forest: [0.045, 0.13] }
                : sample.group === "toroidal-512"
                    ? { water: [0.07, 0.19], mountain: [0.06, 0.18], forest: [0.05, 0.095] }
                    : sample.group === "infinite-window"
                        ? { water: [0.01, 0.21], mountain: [0.05, 0.25], forest: [0.045, 0.21] }
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

        const waterStress = report.find(sample => sample.id === "stress-water")!;
        const highlandStress = report.find(sample => sample.id === "stress-highland")!;
        expect(waterStress.ratios.water).toBeGreaterThan(0.3);
        expect(highlandStress.ratios.mountain).toBeGreaterThan(0.26);

    });
});
