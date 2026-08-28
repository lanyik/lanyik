import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { getHexCenter } from "../../src/helpers/helpers";
import { MapInfo } from "../../src/interfaces";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";
import { createWorldSurfaceView } from "../../src/world/WorldSurfaceView";

function staticMap(type: Land = Land.mountain): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < 8; x += 1) {
        data[x] = {};
        for (let y = 0; y < 8; y += 1) data[x][y] = { type };
    }
    return { data, w: 8, h: 8 };
}

describe("WorldSurfaceView", () => {
    test("uses neutral static mountains and the shared six-corner center", () => {
        const map = staticMap();
        const surface = createWorldSurfaceView({ map, tileSize: 10, mountainHeight: 6 });
        expect(surface.getEffectiveRelief(4, 4)).toBe(1);
        expect(surface.getTileCenterHeight(4, 4)).toBe(6);
        const center = getHexCenter(4, 4, 10);
        expect(surface.getWorldHeight(center.x, center.y)).toBeCloseTo(6, 10);
    });

    test("holds a shared corner at shoreline when any contributor is water or missing", () => {
        const map = staticMap();
        map.data[5][4] = { type: Land.sea };
        const surface = createWorldSurfaceView({ map, tileSize: 10, mountainHeight: 6 });
        const window = surface.createWindow();
        const corners = window.getCornerReliefs(4, 4);
        expect(corners[0]).toBe(0);
        expect(corners[5]).toBe(0);
        expect(corners[3]).toBe(1);
        expect(window.getCornerReliefs(0, 0)).toContain(0);
    });

    test("reads effective edits without allowing generated height to override them", () => {
        const map = staticMap(Land.land);
        const resolver = createWorldSurfaceResolver({
            seed: "edited-height",
            domain: { topology: "bounded", width: map.w, height: map.h }
        });
        const surface = createWorldSurfaceView({ map, resolver, tileSize: 10, mountainHeight: 6 });
        map.data[4][4] = { type: Land.mountain };
        expect(surface.getEffectiveRelief(4, 4)).toBeGreaterThan(0);
        map.data[4][4] = { type: Land.coastal };
        expect(surface.getEffectiveRelief(4, 4)).toBe(0);
        map.data[4][4] = { type: Land.land, modifiers: ["lake"] };
        expect(surface.getEffectiveRelief(4, 4)).toBe(0);
        map.data[4][4] = { type: Land.land, modifiers: ["hill"] };
        expect(surface.getEffectiveRelief(4, 4)).toBe(0);
    });

    test("versions display-height changes without changing normalized relief", () => {
        const map = staticMap();
        const surface = createWorldSurfaceView({ map, tileSize: 10, mountainHeight: 6 });
        const relief = surface.getEffectiveRelief(4, 4);
        expect(surface.revision).toBe(0);
        expect(surface.setMountainHeight(9)).toBe(true);
        expect(surface.revision).toBe(1);
        expect(surface.getEffectiveRelief(4, 4)).toBe(relief);
        expect(surface.getTileCenterHeight(4, 4)).toBe(9);
        expect(surface.setMountainHeight(9)).toBe(false);
        expect(surface.revision).toBe(1);
    });

    test("rejects resolver topology mismatches", () => {
        const map = staticMap();
        const resolver = createWorldSurfaceResolver({
            seed: "wrong-domain",
            domain: { topology: "toroidal", width: 8, height: 8 }
        });
        expect(() => createWorldSurfaceView({ map, resolver, tileSize: 10, mountainHeight: 6 }))
            .toThrow(/wrapping/);
    });

    test("rejects unsafe tile coordinates", () => {
        const surface = createWorldSurfaceView({ map: staticMap(), tileSize: 10, mountainHeight: 6 });
        expect(() => surface.getEffectiveRelief(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(/safe integers/);
    });
});
