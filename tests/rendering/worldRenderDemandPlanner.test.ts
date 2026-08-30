import { describe, expect, test } from "vitest";

import { planWorldRenderDemand } from "../../src/rendering/WorldRenderDemandPlanner";
import { createWorldDescriptorV2 } from "../../src/world/semantic/WorldDescriptorV2";

describe("planWorldRenderDemand", () => {
    test("builds a circular exact demand instead of a square source-chunk ring", () => {
        const descriptor = createWorldDescriptorV2({ seed: "demand" });
        const demands = planWorldRenderDemand({
            descriptor,
            centerX: 0,
            centerY: 0,
            visibleRadiusTiles: 8,
            prefetchRadiusTiles: 17,
            lod1DistanceTiles: 6,
            lod2DistanceTiles: 12
        });
        expect(demands[0]).toMatchObject({ key: { chunkX: 0, chunkY: 0 }, lod: 0, lane: "visible" });
        expect(new Set(demands.map(value => `${value.key.chunkX},${value.key.chunkY}`)).size).toBe(demands.length);
        expect(demands.some(value => value.key.chunkX === 1 && value.key.chunkY === 1)).toBe(false);
        expect(demands.some(value => value.lane === "prefetch")).toBe(true);
    });

    test("canonicalizes toroidal aliases before de-duplicating the exact set", () => {
        const descriptor = createWorldDescriptorV2({
            seed: "wrapped-demand",
            topology: { kind: "toroidal", width: 32, height: 32 }
        });
        const demands = planWorldRenderDemand({
            descriptor,
            centerX: 31,
            centerY: 31,
            visibleRadiusTiles: 16,
            prefetchRadiusTiles: 32,
            lod1DistanceTiles: 8,
            lod2DistanceTiles: 20
        });
        expect(demands).toHaveLength(4);
        expect(new Set(demands.map(value => `${value.key.chunkX},${value.key.chunkY}`))).toEqual(
            new Set(["0,0", "0,1", "1,0", "1,1"])
        );
    });
});
