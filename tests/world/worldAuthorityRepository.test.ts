import { describe, expect, test } from "vitest";

import { generateBaseSemanticChunk } from "../../src/world/semantic/generateBaseSemanticChunk";
import { HydrologyRegionGenerator } from "../../src/world/semantic/generateHydrologyRegion";
import { EffectiveWorldView } from "../../src/world/semantic/EffectiveWorldView";
import {
    WorldAuthorityRepository,
    WorldAuthoritySource
} from "../../src/world/semantic/WorldAuthorityRepository";
import { createWorldDescriptorV2 } from "../../src/world/semantic/WorldDescriptorV2";

describe("WorldAuthorityRepository", () => {
    test("loads the exact render dependency set, coalesces it and pins a byte-budgeted lease", async () => {
        const descriptor = createWorldDescriptorV2({ seed: "authority-repository" });
        const hydrology = new HydrologyRegionGenerator(descriptor);
        let semanticLoads = 0;
        let hydrologyLoads = 0;
        const source: WorldAuthoritySource = {
            descriptor,
            loadSemanticChunk: async key => {
                semanticLoads += 1;
                return generateBaseSemanticChunk({ descriptor, key });
            },
            loadHydrologyRegion: async key => {
                hydrologyLoads += 1;
                return hydrology.generate(key);
            },
            dispose: () => undefined
        };
        const repository = new WorldAuthorityRepository({
            source,
            view: new EffectiveWorldView(descriptor),
            semanticBudgetBytes: 256 * 1024,
            hydrologyBudgetBytes: 4 * 1024 * 1024
        });

        const [first, second] = await Promise.all([
            repository.retain({ chunkX: 0, chunkY: 0 }),
            repository.retain({ chunkX: 0, chunkY: 0 })
        ]);
        expect(first.snapshot.semanticChunks.length).toBeGreaterThan(0);
        expect(first.snapshot.hydrologyRegions.length).toBeGreaterThan(0);
        expect(second.snapshot.worldIdentity).toBe(first.snapshot.worldIdentity);
        expect(repository.stats.pinnedSemanticEntries).toBe(first.snapshot.semanticChunks.length);
        expect(repository.stats.pinnedHydrologyEntries).toBe(first.snapshot.hydrologyRegions.length);
        expect(semanticLoads).toBe(first.snapshot.semanticChunks.length);
        expect(hydrologyLoads).toBe(first.snapshot.hydrologyRegions.length);

        first.release();
        expect(repository.stats.pinnedSemanticEntries).toBeGreaterThan(0);
        second.release();
        expect(repository.stats.pinnedSemanticEntries).toBe(0);
    });
});
