import { describe, expect, test } from "vitest";
import { FogOfWar, FogState, Land, MapInfo } from "../../src/index";
import { tilesWithinRange } from "../../src/helpers/fog";

function world(width = 8, height = 8, wrapped = false): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x++) {
        data[x] = {};
        for (let y = 0; y < height; y++) data[x][y] = { type: Land.land };
    }
    return { data, w: width, h: height, wrapX: wrapped, wrapY: wrapped };
}

describe("fog of war input handling", () => {
    test("does not reveal through missing tiles in a sparse map", () => {
        const tile = { type: Land.land };
        const map: MapInfo = {
            data: {}, w: 1, h: 1, infinite: true,
            tileAt: (x, y) => y === 0 && (x === 0 || x === 2) ? tile : undefined,
            forEachTile(visit) {
                visit(tile, 0, 0);
                visit(tile, 2, 0);
            }
        };

        expect(tilesWithinRange(map, 0, 0, 2)).toEqual([{ x: 0, y: 0 }]);
        const fog = new FogOfWar(map);
        expect(fog.recompute([{ x: 0, y: 0, viewRange: 2 }])).toEqual([
            { x: 0, y: 0, state: FogState.Visible }
        ]);
        expect(fog.getState(2, 0)).toBe(FogState.Unseen);
    });

    test("stores infinite and negative coordinates without dense-array aliasing", () => {
        const tile = { type: Land.land };
        const coordinates = new Set(["-2,0", "50,0"]);
        const map: MapInfo = {
            data: {}, w: 1, h: 1, infinite: true,
            tileAt: (x, y) => coordinates.has(`${x},${y}`) ? tile : undefined,
            forEachTile(visit) {
                visit(tile, -2, 0);
                visit(tile, 50, 0);
            }
        };
        const fog = new FogOfWar(map);

        fog.recompute([
            { x: -2, y: 0, viewRange: 0 },
            { x: 50, y: 0, viewRange: 0 }
        ]);

        expect(fog.getState(-2, 0)).toBe(FogState.Visible);
        expect(fog.getState(50, 0)).toBe(FogState.Visible);
        expect(fog.allTiles()).toEqual([
            { x: -2, y: 0, state: FogState.Visible },
            { x: 50, y: 0, state: FogState.Visible }
        ]);
    });

    test("retains explored state after a sparse tile leaves residency", () => {
        const tile = { type: Land.land };
        const coordinates = new Set(["0,0"]);
        const map: MapInfo = {
            data: {}, w: 1, h: 1, infinite: true,
            tileAt: (x, y) => coordinates.has(`${x},${y}`) ? tile : undefined,
            forEachTile(visit) {
                if (coordinates.has("0,0")) visit(tile, 0, 0);
            }
        };
        const fog = new FogOfWar(map);
        fog.recompute([{ x: 0, y: 0, viewRange: 0 }]);
        fog.recompute([]);
        coordinates.clear();

        expect(fog.getState(0, 0)).toBe(FogState.Explored);
    });

    test("floors fractional ranges and rejects non-finite ranges", () => {
        const map = world();
        expect(tilesWithinRange(map, 3, 3, 1.9)).toHaveLength(7);
        expect(tilesWithinRange(map, 3, 3, Number.NaN)).toEqual([]);
        expect(tilesWithinRange(map, 3, 3, Infinity)).toEqual([]);
    });

    test("normalizes wrapped lookups and treats invalid bounded lookups as unseen", () => {
        const wrapped = new FogOfWar(world(8, 8, true));
        wrapped.recompute([{ x: 7, y: 0, viewRange: 0 }]);
        expect(wrapped.getState(-1, 0)).toBe(FogState.Visible);

        const bounded = new FogOfWar(world());
        expect(bounded.getState(-1, 0)).toBe(FogState.Unseen);
    });

    test("recomputes only the previous and current visible frontier", () => {
        const fog = new FogOfWar(world(512, 512));
        const first = fog.recompute([{ x: 256, y: 256, viewRange: 3 }]);
        expect(first.length).toBeGreaterThan(0);
        expect(fog.lastRecomputeCandidateCount).toBeLessThan(200);

        const second = fog.recompute([{ x: 257, y: 256, viewRange: 3 }]);
        expect(second.length).toBeGreaterThan(0);
        expect(fog.lastRecomputeCandidateCount).toBeLessThan(200);
        expect(fog.getState(253, 256)).toBe(FogState.Explored);
        expect(fog.getState(257, 256)).toBe(FogState.Visible);
        expect(fog.getState(0, 0)).toBe(FogState.Unseen);
    });
});
