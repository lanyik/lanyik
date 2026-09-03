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

describe("authored river edges", () => {
    test("connects neighboring authored river cells", () => {
        const map = landMap();
        map.data[1][1] = { type: Land.land, modifiers: ["river"] };
        map.data[1][0] = { type: Land.land, modifiers: ["river"] };
        expect(waterEdgeValue(map, 1, 1)).toBe(1 << 4);
        expect(waterEdgeValue(map, 1, 0)).toBe(1 << 1);
    });

    test("opens the connected side of an authored lake mouth", () => {
        const map = landMap();
        map.data[1][1] = { type: Land.land, modifiers: ["river"] };
        map.data[2][0] = { type: Land.land, modifiers: ["lake"] };
        expect(waterEdgeValue(map, 1, 1)).toBe(1 << 5);
        expect(riverLakeMouthEdgeValue(map, 1, 1)).toBe(1 << 5);
        expect(waterEdgeValue(map, 2, 0)).toBe(4096 + (1 << 2));
    });
});
