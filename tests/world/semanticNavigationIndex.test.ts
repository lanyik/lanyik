import { describe, expect, test } from "vitest";

import { SemanticNavigationIndex } from "../../src/world/semantic/SemanticNavigationIndex";
import { HydrologyWaterKind } from "../../src/world/semantic/DerivedHydrologyRaster";
import { compileStaticWorldAuthority } from "../../src/world/semantic/compileStaticWorldAuthority";
import { EffectiveWorldView } from "../../src/world/semantic/EffectiveWorldView";
import { WorldAuthorityRepository } from "../../src/world/semantic/WorldAuthorityRepository";
import { createWorldChangeSet, WorldChangeDomain } from "../../src/world/semantic/WorldChangeSet";
import { createFlatStaticAuthorityFields } from "../helpers/staticAuthority";

describe("SemanticNavigationIndex", () => {
    test("uses a structured exact dependency and invalidates only change-set navigation chunks", async () => {
        const compiled = compileStaticWorldAuthority(createFlatStaticAuthorityFields());
        const view = new EffectiveWorldView(compiled.descriptor);
        const repository = new WorldAuthorityRepository({
            source: compiled.source,
            view,
            semanticBudgetBytes: 64 * 1024,
            hydrologyBudgetBytes: 64 * 1024
        });
        const index = new SemanticNavigationIndex({
            cacheBudgetBytes: 64 * 1024,
            authority: {
                captureNavigationChunk: () => repository.capture({ chunkX: 0, chunkY: 0 }),
                sampleHydrology: () => ({ coverage: 0, kind: HydrologyWaterKind.None })
            }
        });

        const first = await index.getSummary({ chunkX: 0, chunkY: 0 });
        const second = await index.getSummary({ chunkX: 0, chunkY: 0 });
        expect(second.passable).toBe(first.passable);
        expect(first.dependencyKey).toMatchObject({
            worldIdentity: view.worldIdentity,
            semanticChunks: [{ chunkX: 0, chunkY: 0 }],
            hydrologyRegions: [{ regionX: 0, regionY: 0 }]
        });
        const changeSet = createWorldChangeSet({
            descriptor: compiled.descriptor,
            transactionId: 1n,
            revision: 1,
            semanticChanges: [{ x: 2, y: 2, domains: WorldChangeDomain.Height }]
        });
        expect(index.applyChangeSet(changeSet)).toBe(1);
        const third = await index.getSummary({ chunkX: 0, chunkY: 0 });
        expect(third.passable).not.toBe(first.passable);

        index.dispose();
        repository.dispose();
    });
});
