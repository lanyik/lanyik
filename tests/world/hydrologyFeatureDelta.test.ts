import { describe, expect, test } from "vitest";

import {
    HYDROLOGY_POINT_QUANTIZATION
} from "../../src/world/HydrologyRegion";
import {
    assertAuthoredLakeFeature,
    assertAuthoredRiverFeature,
    authoredHydrologyPoint,
    createAuthoredLakeFeature,
    createAuthoredRiverFeature,
    createHydrologyFeatureDelta
} from "../../src/world/HydrologyFeatureDelta";

function river() {
    return createAuthoredRiverFeature({
        featureId: "river:authored:0",
        source: { kind: "spring", sourceId: "spring:0" },
        outlet: { kind: "ocean", bodyId: "ocean" },
        controlPoints: new Float64Array([
            0, 128,
            64, 64,
            128, 0
        ]),
        widthProfile: new Uint8Array([1, 2, 3]),
        levelProfile: new Uint16Array([300, 200, 100]),
        dischargeClass: 2,
        profileIndex: 4
    });
}

describe("HydrologyFeatureDelta", () => {
    test("publishes one complete directed river feature on the safe q64 lattice", () => {
        const feature = river();
        assertAuthoredRiverFeature(feature);
        expect(Object.isFrozen(feature)).toBe(true);
        expect(Object.isFrozen(feature.source)).toBe(true);
        expect(Object.isFrozen(feature.outlet)).toBe(true);
        expect(authoredHydrologyPoint(-0.5, 1.25)).toEqual(new Float64Array([-32, 80]));
        expect(() => authoredHydrologyPoint(0.1, 0)).toThrow(/q64/);
        expect(() => authoredHydrologyPoint(Number.MAX_SAFE_INTEGER, 0)).toThrow(/q64/);
    });

    test("canonicalizes a lake polygon to minimum-first counter-clockwise order", () => {
        const feature = createAuthoredLakeFeature({
            featureId: "lake:authored:0",
            polygon: new Float64Array([
                0, 0,
                0, 64,
                64, 64,
                64, 0
            ]),
            level: 20_000,
            profileIndex: 1
        });
        assertAuthoredLakeFeature(feature);
        expect(feature.polygon).toEqual(new Float64Array([
            0, 0,
            64, 0,
            64, 64,
            0, 64
        ]));
    });

    test("uses exact integer geometry checks near the safe-coordinate limit", () => {
        const origin = Number.MAX_SAFE_INTEGER - 1_000;
        const feature = createAuthoredLakeFeature({
            featureId: "lake:large",
            polygon: new Float64Array([
                origin, origin,
                origin + 512, origin,
                origin + 512, origin + 512,
                origin, origin + 512
            ]),
            level: 1,
            profileIndex: 0
        });
        expect(feature.polygon[0]).toBe(origin);
    });

    test("rejects malformed or self-intersecting full feature geometry", () => {
        expect(() => createAuthoredRiverFeature({
            ...river(),
            featureId: "ocean"
        })).toThrow(/reserved ocean/);
        expect(() => createAuthoredLakeFeature({
            featureId: "ocean",
            polygon: new Float64Array([0, 0, 64, 0, 0, 64]),
            level: 1,
            profileIndex: 0
        })).toThrow(/reserved ocean/);
        expect(() => createAuthoredRiverFeature({
            ...river(),
            widthProfile: new Uint8Array([2, 1, 3])
        })).toThrow(/narrow/);
        expect(() => createAuthoredRiverFeature({
            ...river(),
            controlPoints: new Float64Array([
                0, 0,
                64, 64,
                0, 64,
                64, 0
            ]),
            widthProfile: new Uint8Array([1, 1, 1, 1]),
            levelProfile: new Uint16Array([4, 3, 2, 1])
        })).toThrow(/self-intersecting/);
        expect(() => createAuthoredRiverFeature({
            ...river(),
            controlPoints: new Float64Array([
                0, 0,
                128, 0,
                64, 0
            ]),
            widthProfile: new Uint8Array([1, 2, 3]),
            levelProfile: new Uint16Array([3, 2, 1])
        })).toThrow(/overlapping adjacent spans/);
        expect(() => createAuthoredLakeFeature({
            featureId: "lake:crossed",
            polygon: new Float64Array([
                0, 0,
                64, 64,
                0, 96,
                96, 0
            ]),
            level: 1,
            profileIndex: 0
        })).toThrow(/self-intersecting|degenerate/);
        expect(() => createAuthoredLakeFeature({
            featureId: "lake:overlap",
            polygon: new Float64Array([
                0, 0,
                128, 0,
                64, 0,
                64, 64,
                0, 64
            ]),
            level: 1,
            profileIndex: 0
        })).toThrow(/overlapping adjacent edges/);
    });

    test("wraps complete upserts and typed tombstones with one feature identity", () => {
        const feature = river();
        const upsert = createHydrologyFeatureDelta({
            worldIdentity: "world:hydrology-delta",
            revision: 8,
            featureId: feature.featureId,
            featureKind: "river",
            operation: "upsert",
            feature
        });
        expect(upsert).toMatchObject({
            operation: "upsert",
            featureId: "river:authored:0",
            featureKind: "river",
            revision: 8
        });
        const tombstone = createHydrologyFeatureDelta({
            worldIdentity: "world:hydrology-delta",
            revision: 9,
            featureId: feature.featureId,
            featureKind: "river",
            operation: "delete"
        });
        expect(tombstone).not.toHaveProperty("feature");
        expect(() => createHydrologyFeatureDelta({
            worldIdentity: "world:hydrology-delta",
            revision: 10,
            featureId: "river:other",
            featureKind: "river",
            operation: "upsert",
            feature
        })).toThrow(/identity or kind/);
    });

    test("uses q64 rather than Int32 world coordinates", () => {
        const tile = 100_000_000;
        const point = authoredHydrologyPoint(tile, -tile);
        expect(point).toEqual(new Float64Array([
            tile * HYDROLOGY_POINT_QUANTIZATION,
            -tile * HYDROLOGY_POINT_QUANTIZATION
        ]));
        expect(point[0]).toBeGreaterThan(0x7fff_ffff);
    });
});
