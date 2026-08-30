import { describe, expect, test } from "vitest";

import {
    createLandformSampler,
    sampleLandform
} from "../../src/world/LandformSampler";
import {
    BaseSemanticChunkView,
    createWorldDescriptorV2,
    generateBaseSemanticChunk,
    quantizeMacroHeight
} from "../../src/index";

describe("LandformSampler", () => {
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

    test("semantic authority quantizes the identical landform source", () => {
        const seed = "new-world";
        const sampler = createLandformSampler({ seed, domain: { topology: "infinite" } });
        const chunk = generateBaseSemanticChunk({
            descriptor: createWorldDescriptorV2({ seed }),
            key: { chunkX: -4, chunkY: -1 }
        });
        const view = new BaseSemanticChunkView(chunk);
        for (let localX = 0; localX < 32; localX += 1) {
            for (let localY = 0; localY < 32; localY += 1) {
                const tile = view.getTile(localX, localY);
                expect(Math.round(tile.macroHeight * 65535)).toBe(
                    quantizeMacroHeight(sampler.sample(tile.x, tile.y).elevation)
                );
            }
        }
    });
});
