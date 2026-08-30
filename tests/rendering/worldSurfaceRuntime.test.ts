import { describe, expect, test } from "vitest";

import {
    MINIMUM_WORLD_SURFACE_RUNTIME_BUDGETS,
    WorldSurfaceRuntime
} from "../../src/rendering/WorldSurfaceRuntime";
import { compileStaticWorldAuthority } from "../../src/world/semantic/compileStaticWorldAuthority";
import { effectiveSurfaceWindowTransferables } from "../../src/world/semantic/EffectiveSurfaceWindow";
import { compileSurfaceChunk } from "../../src/world/semantic/SurfaceCompiler";
import { surfaceToWorld } from "../../src/world/semantic/SurfaceLattice";
import { createFlatStaticAuthorityFields } from "../helpers/staticAuthority";

describe("WorldSurfaceRuntime", () => {
    test("owns the only authority-to-edit-to-presentation session and refreshes exact dirty demand", async () => {
        const staticWorld = compileStaticWorldAuthority(createFlatStaticAuthorityFields());
        const worker = {
            compileSurfaceChunk: async (window: Parameters<typeof compileSurfaceChunk>[0]) => ({
                chunk: compileSurfaceChunk(window),
                reclaimedWindowBuffers: effectiveSurfaceWindowTransferables(window)
            })
        };
        const runtime = await WorldSurfaceRuntime.create({
            source: staticWorld.source,
            worker,
            budgets: {
                semanticAuthorityBytes: 64 * 1024,
                hydrologyAuthorityBytes: 64 * 1024,
                compiledCpuBytes: 2 * 1024 * 1024,
                retainedWindowBytes: 256 * 1024,
                compiledWorkingSetBytes: 2 * 1024 * 1024,
                ...MINIMUM_WORLD_SURFACE_RUNTIME_BUDGETS
            },
            hexSize: 1,
            heightScale: 1
        });

        await runtime.session.updateDemand([{ key: { chunkX: 0, chunkY: 0 }, lod: 0 }]);
        expect(runtime.session.stats).toMatchObject({ demandedChunks: 1, mountedChunks: 1 });
        const before = await runtime.queries.groundHeight(2, 2);
        await runtime.editor.edit(transaction => transaction.raiseTerrain(
            { kind: "rectangle", minX: 2, minY: 2, maxX: 2, maxY: 2 },
            { delta: 0.05, falloff: "none", waterPolicy: "reject" }
        ));
        expect(runtime.editor.view.captureDeltaSnapshot().semanticDeltas[0].macroHeight[0]).toBeGreaterThan(32_000);
        await runtime.session.getSettled();
        const after = await runtime.queries.groundHeight(2, 2);
        expect(after).toBeGreaterThan(before);
        const center = surfaceToWorld(2, 2);
        await expect(runtime.picking.pickWorldPoint(center.x, center.z)).resolves.toMatchObject({
            x: 2,
            y: 2,
            height: after,
            surface: "ground"
        });
        expect(runtime.session.stats).toMatchObject({ mountedChunks: 1, editRefreshes: 1 });

        runtime.dispose();
        expect(runtime.state).toBe("disposed");
        expect(runtime.surfaceTextures.stats.state).toBe("disposed");
        expect(runtime.fogTextures.stats.state).toBe("disposed");
    });
});
