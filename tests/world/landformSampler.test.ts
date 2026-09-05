import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import {
    createLandformSampler,
    sampleLandform
} from "../../src/world/LandformSampler";
import {
    decodeWorldChunkTile,
    generateWorldChunk
} from "../../src/world/generateWorldChunk";

describe("LandformSampler", () => {
    test("rejects invalid domains and keeps the sampling domain immutable", () => {
        expect(() => createLandformSampler({ seed: "bounds", domain: { topology: "invalid", width: 16, height: 16 } as never }))
            .toThrow("topology");
        expect(() => createLandformSampler({ seed: "bounds", domain: { topology: "bounded", width: 1e20, height: 16 } }))
            .toThrow("safe integer");
        const sampler = createLandformSampler({ seed: "bounds", domain: { topology: "toroidal", width: 16, height: 16 } });
        expect(Object.isFrozen(sampler.domain)).toBe(true);
        expect(() => Object.assign(sampler.domain, { width: 32 })).toThrow(TypeError);
    });
    test("is deterministic and seed-sensitive", () => {
        const first = sampleLandform("ranges", -37, 91);
        expect(sampleLandform("ranges", -37, 91)).toEqual(first);
        expect(sampleLandform("another-seed", -37, 91)).not.toEqual(first);
        expect(Object.values(first).every(Number.isFinite)).toBe(true);
    });

    test("samples toroidal fields continuously across both seams", () => {
        const width = 48;
        const height = 36;
        const sampler = createLandformSampler({
            seed: "wrapped-relief",
            domain: { topology: "toroidal", width, height }
        });

        for (const [x, y] of [[0, 7], [13, 0], [29, 23]] as const) {
            const original = sampler.sample(x, y);
            const wrappedX = sampler.sample(x + width, y);
            const wrappedY = sampler.sample(x, y + height);
            for (const key of Object.keys(original) as Array<keyof typeof original>) {
                expect(wrappedX[key]).toBeCloseTo(original[key], 10);
                expect(wrappedY[key]).toBeCloseTo(original[key], 10);
            }
        }
    });

    test("keeps bounded-world edges below the interior continent", () => {
        const width = 64;
        const height = 48;
        const sampler = createLandformSampler({
            seed: "island-falloff",
            domain: { topology: "bounded", width, height }
        });
        const edges: number[] = [];
        const interior: number[] = [];
        for (let x = 0; x < width; x += 1) {
            for (let y = 0; y < height; y += 1) {
                const elevation = sampler.sample(x, y).elevation;
                if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edges.push(elevation);
                if (x >= 20 && x < 44 && y >= 15 && y < 33) interior.push(elevation);
            }
        }
        const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
        expect(average(interior) - average(edges)).toBeGreaterThan(0.25);
    });

    test("ridge strength creates elevated chains rather than uncorrelated peaks", () => {
        const sampler = createLandformSampler({ seed: "ridge-correlation" });
        const strong: number[] = [];
        const weak: number[] = [];
        for (let x = -48; x < 48; x += 1) {
            for (let y = -48; y < 48; y += 1) {
                const sample = sampler.sample(x, y);
                if (sample.ridge > 0.55) strong.push(sample.elevation);
                if (sample.ridge < 0.08 && sample.continentalness > 0.45) weak.push(sample.elevation);
            }
        }
        const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
        expect(strong.length).toBeGreaterThan(20);
        expect(weak.length).toBeGreaterThan(20);
        expect(average(strong) - average(weak)).toBeGreaterThan(0.08);
    });

    test("chunk classification and render relief sample the identical source seed", () => {
        const seed = "new-world";
        const sampler = createLandformSampler({ seed, domain: { topology: "infinite" } });
        let mountains = 0;

        for (let chunkX = -5; chunkX <= -3; chunkX += 1) {
            for (let chunkY = -2; chunkY <= 0; chunkY += 1) {
                const chunk = generateWorldChunk({ seed, chunkX, chunkY, chunkSize: 24 });
                for (let localX = 0; localX < chunk.chunkSize; localX += 1) {
                    for (let localY = 0; localY < chunk.chunkSize; localY += 1) {
                        const x = chunkX * chunk.chunkSize + localX;
                        const y = chunkY * chunk.chunkSize + localY;
                        const sample = sampler.sample(x, y);
                        const expectedMountain = (sample.elevation > 0.7 && sample.ridge > 0.2)
                            || sample.elevation > 0.82;
                        const generatedMountain = decodeWorldChunkTile(chunk, localX, localY).type
                            === Land.mountain;
                        expect(generatedMountain).toBe(expectedMountain);
                        if (generatedMountain) mountains += 1;
                    }
                }
            }
        }

        expect(mountains).toBeGreaterThan(20);
    });
});
