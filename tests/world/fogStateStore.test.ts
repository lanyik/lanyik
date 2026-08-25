import { describe, expect, test } from "vitest";

import { FogState } from "../../src/objects/FogOfWar";
import { FogStateStore } from "../../src/helpers/fogStateStore";
import { MapInfo } from "../../src/interfaces";
import { Land } from "../../src/enums";

const finiteMap = (w: number, h: number): MapInfo => ({ data: {}, w, h });

describe("renderer fog state storage", () => {
    test("lazily stores finite worlds in one byte per cell", () => {
        const store = new FogStateStore(finiteMap(512, 512));
        expect(store.storageBytes).toBe(0);
        store.set(4, 7, FogState.Explored);
        store.set(511, 511, FogState.Visible);
        store.set(4, 7, FogState.Unseen);

        expect(store.storageBytes).toBe(512 * 512);
        expect(store.size).toBe(2);
        expect(store.get(4, 7)).toBe(FogState.Unseen);
        expect(store.get(0, 0)).toBeUndefined();
        const values: string[] = [];
        store.forEach((state, x, y) => values.push(`${x},${y}:${state}`));
        expect(values).toEqual(["4,7:0", "511,511:2"]);
    });

    test("keeps unbounded coordinates sparse", () => {
        const map: MapInfo = {
            data: {}, w: 1, h: 1, infinite: true,
            tileAt: () => ({ type: Land.land })
        };
        const store = new FogStateStore(map);
        store.set(-2_000_000, 4_000_000, FogState.Visible);
        expect(store.storageBytes).toBe(0);
        expect(store.size).toBe(1);
        expect(store.get(-2_000_000, 4_000_000)).toBe(FogState.Visible);
    });
});
