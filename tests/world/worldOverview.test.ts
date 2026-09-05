import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
    assertWorldOverviewRaster,
    generateWorldOverviewWithResolver
} from "../../src/world/generateWorldOverview";
import { createWorldDescriptor } from "../../src/world/WorldDescriptor";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";

function riverMask(pixels: Uint8ClampedArray): Uint8Array {
    return Uint8Array.from({ length: pixels.length / 4 }, (_, index) => Number(
        pixels[index * 4] === 28 && pixels[index * 4 + 1] === 142 && pixels[index * 4 + 2] === 174
    ));
}

describe("world overview raster", () => {
    it.each([
        [4096, "0b8f4e74889ff462d3eb07bcc3f2e38b209526bd9d1eb2c568dcc07ee4141ddc"],
        [8192, "68bfdaa4a5ecebcb43b514b6802e17258c35ebeebdca550861c2d339df388b31"]
    ] as const)("preserves the v19 raster across bounded water batches at span %i", (span, checksum) => {
        const descriptor = createWorldDescriptor({ seed: "new-world", chunkSize: 24 });
        const resolver = createWorldSurfaceResolver({ seed: descriptor.seed });
        const options = { descriptor, originX: 0, originY: 0, tileSpanX: span, tileSpanY: span,
            pixelWidth: 128, pixelHeight: 128 };
        const raster = generateWorldOverviewWithResolver(options, resolver);
        expect(createHash("sha256").update(raster.pixels).digest("hex")).toBe(checksum);
        expect(generateWorldOverviewWithResolver(options, resolver).pixels).toEqual(raster.pixels);
        expect(resolver.waterStats.maximumRasterizedTiles).toBeLessThanOrEqual(2048 * 2048);
    });

    it.each([[64, 64], [128, 128], [256, 256], [73, 109], [256, 16], [16, 256]])(
        "fills the projected river tile footprint at %i by %i pixels without resampling drainage per pixel",
        (pixelWidth, pixelHeight) => {
            const descriptor = createWorldDescriptor({ seed: "new-world" });
            const resolver = createWorldSurfaceResolver({ seed: descriptor.seed });
            // A nonempty river window, including negative coordinates. Test both
            // integer/fractional magnification and mixed minification on one axis.
            const extent = { originX: -224, originY: 96, tileSpanX: 32, tileSpanY: 32 };
            const tiles = new Set<string>();
            resolver.visitGeneratedRiverTiles(-224, 96, 32, 32, (x, y) => tiles.add(`${x + 224},${y - 96}`));
            expect(tiles.size).toBe(142);
            const visit = vi.spyOn(resolver, "visitGeneratedRiverTiles");
            const resolve = vi.spyOn(resolver, "resolveGeneratedTile");
            const overview = generateWorldOverviewWithResolver({ descriptor, ...extent, pixelWidth, pixelHeight }, resolver);
            const expected = new Uint8Array(pixelWidth * pixelHeight);
            // Independent inverse projection: a magnified pixel belongs to the
            // tile under its centre. A minified pixel retains any mapped river tile.
            for (let py = 0; py < pixelHeight; py += 1) {
                for (let px = 0; px < pixelWidth; px += 1) {
                    const xs = pixelWidth >= 32
                        ? [Math.floor((px + 0.5) * 32 / pixelWidth)]
                        : Array.from({ length: 32 }, (_, x) => x).filter(x => Math.floor(x * pixelWidth / 32) === px);
                    const ys = pixelHeight >= 32
                        ? [Math.floor((py + 0.5) * 32 / pixelHeight)]
                        : Array.from({ length: 32 }, (_, y) => y).filter(y => Math.floor(y * pixelHeight / 32) === py);
                    expected[py * pixelWidth + px] = Number(xs.some(x => ys.some(y => tiles.has(`${x},${y}`))));
                }
            }
            const actual = riverMask(overview.pixels);
            expect(actual.findIndex((value, index) => value !== expected[index]), "first mismatched river pixel").toBe(-1);
            expect(visit).toHaveBeenCalledTimes(1);
            expect(resolve).not.toHaveBeenCalled();
        }
    );

    it("is deterministic without materializing render chunks", () => {
        const descriptor = createWorldDescriptor({ seed: "overview", chunkSize: 24 });
        const resolver = createWorldSurfaceResolver({ seed: descriptor.seed, domain: { topology: "infinite" } });
        const options = {
            descriptor,
            originX: -128,
            originY: 64,
            tileSpanX: 256,
            tileSpanY: 256,
            pixelWidth: 64,
            pixelHeight: 64
        } as const;

        const first = generateWorldOverviewWithResolver(options, resolver);
        const second = generateWorldOverviewWithResolver(options, resolver);

        assertWorldOverviewRaster(first);
        expect(first.pixels).toEqual(second.pixels);
        expect(first.pixels.some((value, index) => index % 4 !== 3 && value !== first.pixels[index % 4])).toBe(true);
    });

    it("preserves every terrain and river pixel when magnifying a native tile raster", () => {
        const descriptor = createWorldDescriptor({ seed: "new-world" });
        const resolver = createWorldSurfaceResolver({ seed: descriptor.seed });
        const extent = { descriptor, originX: -224, originY: 96, tileSpanX: 32, tileSpanY: 32 };
        const native = generateWorldOverviewWithResolver({ ...extent, pixelWidth: 32, pixelHeight: 32 }, resolver);
        const enlarged = generateWorldOverviewWithResolver({ ...extent, pixelWidth: 73, pixelHeight: 109 }, resolver);
        for (let y = 0; y < 109; y += 1) {
            for (let x = 0; x < 73; x += 1) {
                const expected = (Math.floor((y + 0.5) * 32 / 109) * 32 + Math.floor((x + 0.5) * 32 / 73)) * 4;
                const actual = (y * 73 + x) * 4;
                expect(enlarged.pixels.subarray(actual, actual + 4)).toEqual(native.pixels.subarray(expected, expected + 4));
            }
        }
    });

    it("samples each magnified terrain tile once with only one retained pixel row", () => {
        const descriptor = createWorldDescriptor({ seed: "sampling" });
        const resolver = createWorldSurfaceResolver({ seed: descriptor.seed });
        // Isolate base-terrain sampling from the independent drainage pass.
        vi.spyOn(resolver, "visitGeneratedRiverTiles").mockImplementation(() => {});
        const sample = vi.spyOn(resolver, "sampleGenerated");
        generateWorldOverviewWithResolver({
            descriptor, originX: -32, originY: 16, tileSpanX: 32, tileSpanY: 32,
            pixelWidth: 128, pixelHeight: 128
        }, resolver);
        expect(sample).toHaveBeenCalledTimes(1024);
        expect(new Set(sample.mock.calls.map(([x, y]) => `${x},${y}`)).size).toBe(1024);
    });

    it("keeps enlarged river and land pixels identical across page boundaries", () => {
        const descriptor = createWorldDescriptor({ seed: "new-world" });
        const resolver = createWorldSurfaceResolver({ seed: descriptor.seed });
        const whole = generateWorldOverviewWithResolver({
            descriptor, originX: -224, originY: 96, tileSpanX: 32, tileSpanY: 32,
            pixelWidth: 128, pixelHeight: 128
        }, resolver);
        for (const dx of [0, 16]) {
            for (const dy of [0, 16]) {
                const part = generateWorldOverviewWithResolver({
                    descriptor, originX: -224 + dx, originY: 96 + dy,
                    tileSpanX: 16, tileSpanY: 16, pixelWidth: 64, pixelHeight: 64
                }, resolver);
                const mismatch = part.pixels.findIndex((value, index) => {
                    const pixel = Math.floor(index / 4);
                    const x = dx * 4 + pixel % 64;
                    const y = dy * 4 + Math.floor(pixel / 64);
                    return value !== whole.pixels[(y * 128 + x) * 4 + index % 4];
                });
                expect(mismatch, `page ${dx},${dy} first mismatched component`).toBe(-1);
            }
        }
    });

    it("preserves toroidal identity across a full-period shift", () => {
        const descriptor = createWorldDescriptor({
            seed: "overview-wrap",
            chunkSize: 24,
            world: { topology: "toroidal", width: 32, height: 24 }
        });
        const resolver = createWorldSurfaceResolver({
            seed: descriptor.seed,
            domain: { topology: "toroidal", width: 32, height: 24 }
        });
        const base = {
            descriptor,
            originX: 0,
            originY: 0,
            tileSpanX: 32,
            tileSpanY: 24,
            pixelWidth: 32,
            pixelHeight: 24
        } as const;

        const first = generateWorldOverviewWithResolver(base, resolver);
        const shifted = generateWorldOverviewWithResolver({ ...base, originX: 32, originY: 24 }, resolver);

        expect(shifted.pixels).toEqual(first.pixels);
    });

    it("rasterizes generated river courses without resolving every world tile", () => {
        const descriptor = createWorldDescriptor({ seed: "new-world", chunkSize: 24 });
        const resolver = createWorldSurfaceResolver({ seed: descriptor.seed });
        const overview = generateWorldOverviewWithResolver({
            descriptor,
            originX: -256,
            originY: -256,
            tileSpanX: 512,
            tileSpanY: 512,
            pixelWidth: 128,
            pixelHeight: 128
        }, resolver);
        let riverPixels = 0;
        for (let index = 0; index < overview.pixels.length; index += 4) {
            if (overview.pixels[index] === 28
                && overview.pixels[index + 1] === 142
                && overview.pixels[index + 2] === 174) riverPixels += 1;
        }
        // v15 intentionally lengthens/widens courses and adds sea approaches;
        // retain a narrow composition gate rather than freezing the old area.
        expect(riverPixels).toBeGreaterThan(120);
        expect(riverPixels).toBeLessThan(240);
    });
});
