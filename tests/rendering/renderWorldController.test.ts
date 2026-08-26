import { describe, expect, test, vi } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo } from "../../src/interfaces";
import { RenderWorldController } from "../../src/rendering/RenderWorldController";
import { StaticWorldSource } from "../../src/world/WorldSource";

function world(): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < 24; x += 1) {
        data[x] = {};
        for (let y = 0; y < 12; y += 1) data[x][y] = { type: Land.land };
    }
    return { data, w: 24, h: 12 };
}

describe("RenderWorldController", () => {
    test("owns source, shared residency, and streamer teardown as one session", async () => {
        const source = new StaticWorldSource(world(), { chunkSize: 12 });
        const dispose = vi.spyOn(source, "dispose");
        const loaded = vi.fn();
        const unloading = vi.fn();
        const controller = new RenderWorldController(source);
        const streamer = controller.startStreaming({
            chunkLoaded: loaded,
            chunkUnloading: unloading
        }, { loadRadius: 0, retentionRadius: 0, maxResidentChunks: 1 });

        await controller.setCenterTile(0, 0);
        expect(controller.streamer).toBe(streamer);
        expect(controller.stats?.residentChunks).toBe(1);
        expect(controller.residency.stats.leasesByOwner).toEqual({ "render-world": 1 });

        controller.stop();
        expect(unloading).toHaveBeenCalledOnce();
        expect(dispose).toHaveBeenCalledOnce();
        expect(controller.streamer).toBeUndefined();
    });

    test("rejects two streamers in one render session", () => {
        const controller = new RenderWorldController(new StaticWorldSource(world(), { chunkSize: 12 }));
        const handlers = { chunkLoaded: vi.fn(), chunkUnloading: vi.fn() };
        controller.startStreaming(handlers);
        expect(() => controller.startStreaming(handlers)).toThrow(/already started/);
        controller.stop();
    });
});
