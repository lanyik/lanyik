import { describe, expect, test } from "vitest";

import { MemoryWorldDeltaStore } from "../../src/world/WorldDeltaStore";
import { compileStaticWorldAuthority } from "../../src/world/semantic/compileStaticWorldAuthority";
import { createTransferableEffectiveWindow } from "../../src/world/semantic/EffectiveSurfaceWindow";
import { EffectiveWorldView } from "../../src/world/semantic/EffectiveWorldView";
import { compileSurfaceChunk } from "../../src/world/semantic/SurfaceCompiler";
import { SurfaceQueryService } from "../../src/world/semantic/SurfaceQueryService";
import { createFlatStaticAuthorityFields } from "../helpers/staticAuthority";

describe("SurfaceQueryService", () => {
    test("refuses a resident field with an obsolete exact dependency and synchronously uses current authority", async () => {
        const compiled = compileStaticWorldAuthority(createFlatStaticAuthorityFields());
        const view = new EffectiveWorldView(compiled.descriptor);
        const capture = () => view.capture({
            semanticChunks: compiled.semanticChunks,
            hydrologyRegions: compiled.hydrologyRegions
        });
        const initial = capture();
        const chunk = compileSurfaceChunk(createTransferableEffectiveWindow(initial, { chunkX: 0, chunkY: 0 }));
        const resident = {
            requestToken: { sessionEpoch: 1, renderChunkGeneration: 1 },
            effectiveRevision: 0,
            dependencyKey: chunk.dependencyKey,
            chunk,
            released: false,
            isCurrent: () => true,
            release: () => true
        };
        const queries = new SurfaceQueryService({ descriptor: compiled.descriptor, snapshots: { capture } });
        queries.bindLease(resident);
        expect(await queries.groundHeight(2, 2)).toBeCloseTo(0.5, 3);

        const store = new MemoryWorldDeltaStore();
        const result = await store.commit({
            descriptor: compiled.descriptor,
            expectedRevision: 0,
            semanticMutations: [{ x: 2, y: 2, macroHeight: 40_000 }]
        });
        view.publishDeltaSnapshot(result.snapshot, 0);
        expect(await queries.groundHeight(2, 2)).toBeGreaterThan(0.5);
        expect(queries.stats).toMatchObject({
            residentHits: 1,
            staleResidentRejects: 1,
            synchronousCompilations: 1,
            mountedLeases: 0
        });

        queries.dispose();
        store.dispose();
        compiled.source.dispose();
    });
});
