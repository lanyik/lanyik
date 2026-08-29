import { describe, expect, test } from "vitest";

import {
    analyzeWorldStyleGallerySample,
    WORLD_STYLE_GALLERY_SAMPLES,
    WorldStyleGalleryMetrics
} from "../helpers/worldStyleGallery";

describe("world style v5 full gallery review", () => {
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
            if (metrics.lakes.tiles >= 16) {
                expect(metrics.lakes.singleCellRatio, `${sample.id} single-cell lakes`).toBeLessThan(0.15);
            }
            const expected = sample.group === "bounded"
                ? { water: [0.6, 0.92], mountain: [0, 0.08], forest: [0.002, 0.08] }
                : sample.group === "toroidal-512"
                    ? { water: [0.25, 0.5], mountain: [0.06, 0.18], forest: [0.025, 0.08] }
                    : sample.group === "infinite-window"
                        ? { water: [0.22, 0.55], mountain: [0.05, 0.25], forest: [0.025, 0.18] }
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
        expect(waterStress.ratios.water).toBeGreaterThan(0.85);
        expect(highlandStress.ratios.mountain).toBeGreaterThan(0.3);

    });
});
