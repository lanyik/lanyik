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

    it("preserves a one-cell generated waterway inside a coarse overview pixel", () => {
        const descriptor = createWorldDescriptor({ seed: "rough-water-field", chunkSize: 24 });
        const resolver = createWorldSurfaceResolver({
            seed: descriptor.seed,
            domain: { topology: "infinite" }
        });
        const riverTiles: Array<{ x: number; y: number }> = [];
        resolver.visitGeneratedWaterTiles(-128, -128, 256, 256, (x, y) => {
            riverTiles.push({ x, y });
        });
        expect(riverTiles.length).toBeGreaterThan(300);

        const coarse = riverTiles.map(point => ({
            point,
            originX: Math.floor(point.x / 8) * 8,
            originY: Math.floor(point.y / 8) * 8
        })).find(candidate => {
            const tile = resolver.resolveGeneratedTile(
            candidate.originX + 4,
            candidate.originY + 4
            );
            return tile.type !== "sea" && tile.type !== "coastal";
        });
        expect(coarse).toBeDefined();

        const raster = generateWorldOverviewWithResolver({
            descriptor,
            originX: coarse!.originX,
            originY: coarse!.originY,
            tileSpanX: 8,
            tileSpanY: 8,
            pixelWidth: 1,
            pixelHeight: 1
        }, resolver);

        // The center sample is dry, but area coverage retains the subpixel
        // river as the overview's dedicated cartographic river color.
        expect([...raster.pixels]).toEqual([28, 142, 174, 255]);
    });
});
