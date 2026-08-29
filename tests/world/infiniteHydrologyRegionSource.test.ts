import { describe, expect, test } from "vitest";

import {
    HYDROLOGY_BOUNDARY_MAX_X,
    HYDROLOGY_BOUNDARY_MIN_X,
    HydrologyPort,
    assertHydrologyRegion,
    hydrologyPortConnectionSignature
} from "../../src/world/HydrologyRegion";
import { InfiniteHydrologyRegionSource } from "../../src/world/InfiniteHydrologyRegionSource";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";

function boundaryPorts(ports: readonly HydrologyPort[], boundary: number): readonly HydrologyPort[] {
    return ports.filter(port => (port.boundaryMask & boundary) !== 0);
}

describe("InfiniteHydrologyRegionSource", () => {
    test("builds a deterministic region from nine bounded canonical basins", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("infinite-hydrology-region");
        const source = new InfiniteHydrologyRegionSource({ descriptor, maximumResidentBasins: 9 });
        const first = source.buildRegion(0, 0);
        assertHydrologyRegion(first);
        expect(first).toMatchObject({
            topology: "infinite",
            key: { regionX: 0, regionY: 0 },
            validBounds: { minX: 0, minY: 0, maxXExclusive: 128, maxYExclusive: 128 }
        });
        expect(source.stats).toMatchObject({ residentBasins: 9, basinBuilds: 9, basinCacheHits: 0 });

        const repeated = source.buildRegion(0, 0);
        expect(repeated).toEqual(first);
        expect(source.stats).toMatchObject({ residentBasins: 9, basinBuilds: 9, basinCacheHits: 9 });
        expect(source.stats.residentBytes).toBeGreaterThan(0);
        let featureCount = 0;
        for (let regionX = 0; regionX < 4; regionX += 1) {
            for (let regionY = 0; regionY < 4; regionY += 1) {
                const region = source.buildRegion(regionX, regionY);
                featureCount += region.rivers.length + region.lakes.length;
            }
        }
        expect(featureCount).toBeGreaterThan(0);
    }, 20_000);

    test("produces identical shared ports and results in either request order", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("infinite-hydrology-order");
        const forward = new InfiniteHydrologyRegionSource({ descriptor });
        let selected: { regionX: number; regionY: number } | undefined;
        let west = forward.buildRegion(0, 0);
        let east = forward.buildRegion(1, 0);
        for (let regionX = 0; regionX < 3 && !selected; regionX += 1) {
            for (let regionY = 0; regionY < 4 && !selected; regionY += 1) {
                const candidateWest = forward.buildRegion(regionX, regionY);
                const candidateEast = forward.buildRegion(regionX + 1, regionY);
                const westPorts = boundaryPorts(candidateWest.boundaryPorts, HYDROLOGY_BOUNDARY_MAX_X);
                const eastPorts = boundaryPorts(candidateEast.boundaryPorts, HYDROLOGY_BOUNDARY_MIN_X);
                expect(westPorts.map(hydrologyPortConnectionSignature).sort())
                    .toEqual(eastPorts.map(hydrologyPortConnectionSignature).sort());
                if (westPorts.length > 0) {
                    selected = { regionX, regionY };
                    west = candidateWest;
                    east = candidateEast;
                }
            }
        }
        expect(selected).toBeDefined();

        const reverse = new InfiniteHydrologyRegionSource({ descriptor });
        const reverseEast = reverse.buildRegion((selected?.regionX ?? 0) + 1, selected?.regionY ?? 0);
        const reverseWest = reverse.buildRegion(selected?.regionX ?? 0, selected?.regionY ?? 0);
        expect(reverseWest).toEqual(west);
        expect(reverseEast).toEqual(east);
    }, 30_000);

    test("supports negative region keys and keeps LRU basin residency bounded", () => {
        const source = new InfiniteHydrologyRegionSource({
            descriptor: createCoreInfiniteWorldDescriptorV2("infinite-hydrology-negative"),
            maximumResidentBasins: 9
        });
        const negative = source.buildRegion(-1, -1);
        expect(negative.key).toEqual({ regionX: -1, regionY: -1 });
        source.buildRegion(4, 0);
        expect(source.stats.residentBasins).toBe(9);
        source.clearCache();
        expect(source.stats).toMatchObject({ residentBasins: 0, residentBytes: 0 });
        expect(() => new InfiniteHydrologyRegionSource({
            descriptor: source.descriptor,
            maximumResidentBasins: 8
        })).toThrow(/between 9 and 64/);
    }, 30_000);
});
