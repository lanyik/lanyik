import { describe, expect, test } from "vitest";

import {
    INFINITE_DRAINAGE_BASIN_SPAN_TILES,
    InfiniteDrainageBasinResolver
} from "../../src/world/InfiniteDrainageBasins";

function key(site: { cellX: number; cellY: number }): string {
    return `${site.cellX},${site.cellY}`;
}

describe("infinite drainage basin partition", () => {
    test("produces aligned, bounded and deterministic jittered sites", () => {
        const first = new InfiniteDrainageBasinResolver("basin-contract");
        const second = new InfiniteDrainageBasinResolver("basin-contract");
        for (const [cellX, cellY] of [[-9, -4], [-1, -1], [0, 0], [1, 2], [13, -7]]) {
            const site = first.siteAt(cellX, cellY);
            expect(site).toEqual(second.siteAt(cellX, cellY));
            expect(site.tileX / 8).toBe(Math.floor(site.tileX / 8));
            expect(site.tileY / 8).toBe(Math.floor(site.tileY / 8));
            expect(site.tileX - cellX * INFINITE_DRAINAGE_BASIN_SPAN_TILES)
                .toBeGreaterThanOrEqual(192);
            expect(site.tileX - cellX * INFINITE_DRAINAGE_BASIN_SPAN_TILES)
                .toBeLessThanOrEqual(320);
            expect(site.tileY - cellY * INFINITE_DRAINAGE_BASIN_SPAN_TILES)
                .toBeGreaterThanOrEqual(192);
            expect(site.tileY - cellY * INFINITE_DRAINAGE_BASIN_SPAN_TILES)
                .toBeLessThanOrEqual(320);
        }
    });

    test("matches a wider candidate search across positive and negative boundaries", () => {
        const resolver = new InfiniteDrainageBasinResolver("finite-window-proof");
        const span = INFINITE_DRAINAGE_BASIN_SPAN_TILES;
        for (let tileX = -span * 3; tileX <= span * 3; tileX += 37) {
            for (let tileY = -span * 3; tileY <= span * 3; tileY += 41) {
                const resolved = resolver.resolve(tileX, tileY);
                const homeX = Math.floor(tileX / span);
                const homeY = Math.floor(tileY / span);
                const wider: Array<{ site: ReturnType<typeof resolver.siteAt>; distance: number }> = [];
                for (let cellX = homeX - 3; cellX <= homeX + 3; cellX += 1) {
                    for (let cellY = homeY - 3; cellY <= homeY + 3; cellY += 1) {
                        const site = resolver.siteAt(cellX, cellY);
                        const dx = 1.5 * (site.tileX - tileX);
                        const siteStagger = site.tileX - Math.floor(site.tileX / 2) * 2 === 0 ? 0.5 : 0;
                        const tileStagger = tileX - Math.floor(tileX / 2) * 2 === 0 ? 0.5 : 0;
                        const dz = Math.sqrt(3) * (site.tileY - tileY + siteStagger - tileStagger);
                        wider.push({ site, distance: dx * dx + dz * dz });
                    }
                }
                wider.sort((first, second) => first.distance - second.distance
                    || first.site.cellX - second.site.cellX
                    || first.site.cellY - second.site.cellY);
                expect(key(resolved)).toBe(key(wider[0].site));
            }
        }
    });

    test("returns a fixed five-cell-square dependency window for any region", () => {
        const resolver = new InfiniteDrainageBasinResolver("dependency-window");
        expect(resolver.dependencyBoundsForRegion(0, 0)).toEqual({
            minX: -1024,
            minY: -1024,
            maxXExclusive: 1536,
            maxYExclusive: 1536
        });
        expect(resolver.dependencyBoundsForRegion(-1, -1)).toEqual({
            minX: -1536,
            minY: -1536,
            maxXExclusive: 1024,
            maxYExclusive: 1024
        });
        const far = resolver.dependencyBoundsForRegion(134_217_728, -134_217_728);
        expect(far.maxXExclusive - far.minX).toBe(5 * INFINITE_DRAINAGE_BASIN_SPAN_TILES);
        expect(far.maxYExclusive - far.minY).toBe(5 * INFINITE_DRAINAGE_BASIN_SPAN_TILES);
    });
});
