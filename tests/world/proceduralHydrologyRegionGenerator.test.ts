import { describe, expect, test } from "vitest";

import { assertHydrologyRegion } from "../../src/world/HydrologyRegion";
import { createProceduralHydrologyRegionGenerator } from "../../src/world/ProceduralHydrologyRegionGenerator";
import {
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import { createBaseSemanticChunkGenerator } from "../../src/world/generateBaseSemanticChunk";

describe("ProceduralHydrologyRegionGenerator", () => {
    test("reuses one infinite basin source for repeated region requests", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("hydrology-worker-generator");
        const generator = createProceduralHydrologyRegionGenerator({ descriptor });
        const first = await generator.generate(-1, 2);
        const repeated = await generator.generate(-1, 2);
        assertHydrologyRegion(first);
        expect(generator.identity).toBe(createBaseSemanticChunkGenerator(descriptor).identity);
        expect(first).toEqual(repeated);
        expect(first).toMatchObject({
            topology: "infinite",
            key: { regionX: -1, regionY: 2 },
            validBounds: { maxXExclusive: 128, maxYExclusive: 128 }
        });
    });

    test("builds one complete toroidal graph and serves partial canonical regions", async () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("hydrology-worker-torus", 160, 96);
        const generator = createProceduralHydrologyRegionGenerator({ descriptor });
        const first = await generator.generate(1, 0);
        const repeated = await generator.generate(1, 0);
        expect(first).toEqual(repeated);
        expect(first).toMatchObject({
            topology: "toroidal",
            key: { regionX: 1, regionY: 0 },
            validBounds: { maxXExclusive: 32, maxYExclusive: 96 }
        });
        await expect(generator.generate(-1, 0)).rejects.toThrow(/canonical/);
    });

});
