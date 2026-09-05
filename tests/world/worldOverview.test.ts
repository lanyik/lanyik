import { describe, expect, it } from "vitest";
import {
    assertWorldOverviewRaster,
    generateWorldOverviewWithResolver
} from "../../src/world/generateWorldOverview";
import { createWorldDescriptor } from "../../src/world/WorldDescriptor";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";

describe("world overview raster", () => {
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
