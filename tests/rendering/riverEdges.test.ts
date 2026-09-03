import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import {
    riverLakeMouthEdgeValue,
    waterEdgeValue
} from "../../src/helpers/rivers";
import { MapInfo } from "../../src/interfaces";

function landMap(): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < 3; x += 1) {
        data[x] = {};
        for (let y = 0; y < 3; y += 1) data[x][y] = { type: Land.land };
    }
    return { data, w: 3, h: 3 };
}

describe("explicit river edges", () => {
    test("keeps authored rivers auto-connected while separating adjacent generated courses", () => {
        const map = landMap();
        map.data[1][1] = { type: Land.land, modifiers: ["river"] };
        map.data[1][0] = { type: Land.land, modifiers: ["river"] };
        expect(waterEdgeValue(map, 1, 1)).toBe(1 << 4);
        expect(waterEdgeValue(map, 1, 0)).toBe(1 << 1);

        // Center explicitly flows NE/SW. The adjacent river to its north is
        // no longer treated as an accidental branch.
        map.data[1][1].riverEdges = 1 << 5;
        map.data[2][0] = {
            type: Land.land,
            modifiers: ["river"],
            riverEdges: 1 << 2
        };
        expect(waterEdgeValue(map, 1, 1)).toBe(1 << 5);
        expect(waterEdgeValue(map, 2, 0)).toBe(1 << 2);
    });

    test("opens only the explicitly connected side of a generated lake mouth", () => {
        const map = landMap();
        map.data[1][1] = {
            type: Land.land,
            modifiers: ["river"],
            riverEdges: 1 << 5
        };
        map.data[2][0] = { type: Land.land, modifiers: ["lake"] };
        expect(waterEdgeValue(map, 1, 1)).toBe(1 << 5);
        expect(riverLakeMouthEdgeValue(map, 1, 1)).toBe(1 << 5);
        expect(waterEdgeValue(map, 2, 0)).toBe(4096 + (1 << 2));
    });

    test("rejects malformed explicit masks", () => {
        const map = landMap();
        map.data[1][1] = {
            type: Land.land,
            modifiers: ["river"],
            riverEdges: 64
        };
        expect(() => waterEdgeValue(map, 1, 1)).toThrow(/riverEdges/);
    });
});
