import { describe, expect, test, vi } from "vitest";
import { HexMap } from "../../src/HexMap";
import { deferred } from "../helpers/deferred";

function fixture() {
    const rebuild = vi.fn(async () => true);
    const map = Object.assign(Object.create(HexMap.prototype), {
        options: { grassEnabled: true, grassDensity: 10, grassBladeWidth: 1, grassBladeHeight: 2, treesPerTile: 4, treeScale: 1 },
        disposed: false,
        loadRevision: 1,
        mapData: {},
        vegetationRefreshQueue: Promise.resolve(),
        worldController: { streamer: {}, lifecycle: { track: <T>(task: Promise<T>) => task } },
        rebuildSurfaceVegetation: rebuild,
        refreshWorldCopies: vi.fn(),
        emit: vi.fn()
    });
    return { map: map as Pick<HexMap, "grassDensity" | "grassBladeWidth" | "grassBladeHeight" | "treesPerTile" | "treeScale" | "grassVisible"> & {
        vegetationRefreshQueue: Promise<void>;
        loadRevision: number;
    }, rebuild };
}

describe("vegetation option refresh", () => {
    test("ignores unchanged settings and coalesces a burst into one shared layout rebuild", async () => {
        const { map, rebuild } = fixture();
        map.grassDensity = 10;
        map.grassBladeWidth = 1;
        map.grassBladeHeight = 2;
        map.treesPerTile = 4;
        map.treeScale = 1;
        map.grassVisible = true;
        await Promise.resolve();
        expect(rebuild).not.toHaveBeenCalled();
        map.grassDensity = 20;
        map.grassBladeWidth = 2;
        map.treesPerTile = 8;
        map.treeScale = 2;
        await map.vegetationRefreshQueue;
        expect(rebuild).toHaveBeenCalledOnce();
        expect(map.grassDensity).toBe(20);
        expect(map.treesPerTile).toBe(8);
    });

    test("serializes in-flight replacements and discards a queued obsolete world", async () => {
        const { map, rebuild } = fixture();
        const pending = deferred<boolean>();
        rebuild.mockReturnValueOnce(pending.promise);
        map.grassDensity = 20;
        await Promise.resolve();
        expect(rebuild).toHaveBeenCalledOnce();
        map.grassDensity = 30;
        map.grassDensity = 40;
        await Promise.resolve();
        expect(rebuild).toHaveBeenCalledOnce();
        pending.resolve(true);
        await map.vegetationRefreshQueue;
        expect(rebuild).toHaveBeenCalledTimes(2);
        map.treeScale = 3;
        map.loadRevision += 1;
        await map.vegetationRefreshQueue;
        expect(rebuild).toHaveBeenCalledTimes(2);
    });
});
