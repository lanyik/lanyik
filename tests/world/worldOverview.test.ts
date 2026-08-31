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
});
