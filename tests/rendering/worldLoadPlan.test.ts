import { describe, expect, test, vi } from "vitest";

import { resolveHexMapOptions } from "../../src/HexMapOptions";
import { createWorldLoadPlan } from "../../src/rendering/WorldLoadPlan";
import { StaticWorldSource } from "../../src/world/WorldSource";
import type { MapInfo } from "../../src/interfaces";

function finiteMap(): MapInfo {
    return { w: 48, h: 36, data: {} };
}

describe("world load planning", () => {
    test("resolves one complete deterministic session plan before publication", () => {
        const source = new StaticWorldSource(finiteMap(), { chunkSize: 24 });
        const plan = createWorldLoadPlan({
            source,
            predictionMaxChunks: 8
        }, resolveHexMapOptions({ element: "#map" }));

        expect(plan).toMatchObject({
            source,
            chunkSize: 24,
            initialTile: { x: 23, y: 17 },
            loadRadius: 2,
            retentionRadius: 3,
            maxResidentChunks: 49,
            maxRetries: 2,
            retryBaseDelayMs: 100,
            frameBudgetMs: 3,
            maxMountsPerFrame: 2,
            predictionSeconds: 1.25,
            predictionMaxChunks: 1,
            floatingOriginThreshold: 8192
        });
        expect(plan.surface.map).toBe(source.map);
        source.dispose();
    });

    test("disposes a source when its plan cannot be published", () => {
        const source = new StaticWorldSource(finiteMap(), { chunkSize: 10 });
        const dispose = vi.spyOn(source, "dispose");

        expect(() => createWorldLoadPlan(
            { source },
            resolveHexMapOptions({ element: "#map" })
        )).toThrow(/positive multiple of 12/);
        expect(dispose).toHaveBeenCalledOnce();
    });

    test("rejects contradictory residency limits before creating a session", () => {
        const source = new StaticWorldSource(finiteMap(), { chunkSize: 24 });
        const dispose = vi.spyOn(source, "dispose");

        expect(() => createWorldLoadPlan({
            source,
            loadRadius: 2,
            retentionRadius: 1
        }, resolveHexMapOptions({ element: "#map" }))).toThrow(/retentionRadius/);
        expect(dispose).toHaveBeenCalledOnce();
    });
});
