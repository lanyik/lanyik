import { describe, expect, test } from "vitest";

import { compileStaticWorldAuthority, StaticWorldSemanticFields } from "../../src/world/semantic/compileStaticWorldAuthority";
import { HydrologyRegion } from "../../src/world/semantic/HydrologyRegion";
import { HYDROLOGY_SEA_LEVEL, OCEAN_BODY_ID } from "../../src/world/semantic/MacroDrainageGraph";
import { SubstrateClass } from "../../src/world/semantic/WorldSemanticCatalog";
import { HYDROLOGY_REGION_REVISION } from "../../src/world/semantic/WorldSemanticFormat";

function emptyRegion(width: number, height: number): HydrologyRegion {
    return Object.freeze({
        key: Object.freeze({ regionX: 0, regionY: 0 }),
        revision: HYDROLOGY_REGION_REVISION,
        validBounds: Object.freeze({ minX: 0, minY: 0, maxXExclusive: width, maxYExclusive: height }),
        boundaryPorts: Object.freeze([]),
        rivers: Object.freeze([]),
        lakes: Object.freeze([]),
        mouths: Object.freeze([]),
        bodies: Object.freeze([Object.freeze({ bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 })])
    });
}

function fields(width = 33, height = 2): StaticWorldSemanticFields {
    const count = width * height;
    const biomeWeights = new Uint8Array(count * 4);
    for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
    const substrateClass = new Uint8Array(count).fill(SubstrateClass.Soil);
    const macroHeight = new Uint16Array(count).fill(40_000);
    substrateClass[0] = SubstrateClass.Sediment;
    macroHeight[0] = HYDROLOGY_SEA_LEVEL - 1;
    const vegetationDensity = new Uint8Array(count);
    const vegetationProfile = new Uint8Array(count);
    vegetationDensity[height + 1] = 210;
    vegetationProfile[height + 1] = 3;
    return {
        width,
        height,
        topology: "bounded",
        sourceContentHash: "a".repeat(64),
        substrateClass,
        macroHeight,
        biomeWeights,
        climate: new Uint8Array(count * 2).fill(128),
        vegetationDensity,
        vegetationProfile,
        hydrologyRegions: [emptyRegion(width, height)]
    };
}

describe("compileStaticWorldAuthority", () => {
    test("compiles typed X-major SoA into the canonical chunk and hydrology formats", () => {
        const compiled = compileStaticWorldAuthority(fields());
        expect(compiled.descriptor).toMatchObject({
            sourceKind: "static",
            topology: "bounded",
            width: 33,
            height: 2,
            sourceContentHash: "a".repeat(64)
        });
        expect(compiled.semanticChunks).toHaveLength(2);
        expect(compiled.hydrologyRegions).toHaveLength(1);
        expect(compiled.semanticChunks[0].macroHeight[0]).toBeLessThan(HYDROLOGY_SEA_LEVEL);
        expect(compiled.semanticChunks[0].vegetationDensity[1 * 32 + 1]).toBe(210);
        compiled.source.dispose();
    });

    test("has no free-form modifier or implicit hydrology ingestion path", () => {
        expect(() => compileStaticWorldAuthority({
            ...fields(1, 1),
            modifiers: ["lake"]
        } as unknown as StaticWorldSemanticFields)).toThrow(/header/);
        expect(() => compileStaticWorldAuthority({
            ...fields(1, 1),
            hydrologyRegions: []
        })).toThrow(/exactly cover/);
    });

    test("accepts explicit typed lake authority", () => {
        const lakeId = `lake:${"a".repeat(32)}`;
        const region = emptyRegion(32, 32);
        const lakeRegion: HydrologyRegion = Object.freeze({
            ...region,
            lakes: Object.freeze([Object.freeze({
                lakeId,
                bodyId: lakeId,
                boundaryPoints: new Int16Array([64, 64, 128, 64, 96, 128]),
                level: 36_000,
                profileIndex: 1
            })]),
            bodies: Object.freeze([
                Object.freeze({ bodyId: OCEAN_BODY_ID, kind: "ocean" as const, profileIndex: 0 }),
                Object.freeze({ bodyId: lakeId, kind: "lake" as const, profileIndex: 1 })
            ])
        });
        const compiled = compileStaticWorldAuthority({
            ...fields(32, 32),
            sourceContentHash: "b".repeat(64),
            hydrologyRegions: [lakeRegion]
        });
        expect(compiled.hydrologyRegions[0].lakes[0]).toMatchObject({ lakeId, level: 36_000 });
        compiled.source.dispose();
    });
});
