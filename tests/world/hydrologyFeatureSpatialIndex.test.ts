import { describe, expect, test } from "vitest";

import {
    HydrologyFeatureSpatialIndex,
    authoredHydrologyFeatureBoundsQ64
} from "../../src/world/HydrologyFeatureSpatialIndex";
import {
    createAuthoredLakeFeature,
    createAuthoredRiverFeature,
    createHydrologyFeatureDelta
} from "../../src/world/HydrologyFeatureDelta";
import {
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import { serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

function river(featureId: string, points: readonly number[]) {
    return createAuthoredRiverFeature({
        featureId,
        source: { kind: "spring", sourceId: `spring:${featureId}` },
        outlet: { kind: "ocean", bodyId: "ocean" },
        controlPoints: new Float64Array(points),
        widthProfile: new Uint8Array(points.length / 2).fill(1),
        levelProfile: new Uint16Array(points.length / 2).fill(30_000),
        dischargeClass: 1,
        profileIndex: 0
    });
}

function lake(featureId: string, minimumX: number, minimumY: number, maximumX: number, maximumY: number) {
    return createAuthoredLakeFeature({
        featureId,
        polygon: new Float64Array([
            minimumX, minimumY,
            maximumX, minimumY,
            maximumX, maximumY,
            minimumX, maximumY
        ]),
        level: 30_000,
        profileIndex: 1
    });
}

describe("HydrologyFeatureSpatialIndex", () => {
    test("builds a bounded packed hierarchy and returns canonical feature order", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("feature-index");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const features = [
            lake("lake:b", 20_000, 20_000, 21_000, 21_000),
            river("river:a", [0, 0, 128, 128]),
            lake("lake:c", 40_000, 40_000, 41_000, 41_000)
        ].sort((first, second) => first.featureId < second.featureId ? -1 : 1);
        const deltas = features.map(feature => createHydrologyFeatureDelta({
            worldIdentity,
            revision: 1,
            featureId: feature.featureId,
            featureKind: feature.kind,
            operation: "upsert",
            feature
        }));
        const index = new HydrologyFeatureSpatialIndex(descriptor, deltas);
        expect(index.featureCount).toBe(3);
        expect(index.itemCount).toBe(3);
        expect(index.query({ minX: -100, minY: -100, maxX: 22_000, maxY: 22_000 })
            .map(delta => delta.featureId)).toEqual(["lake:b", "river:a"]);
        expect(index.query({ minX: 30_000, minY: 30_000, maxX: 31_000, maxY: 31_000 })).toEqual([]);
        expect(authoredHydrologyFeatureBoundsQ64(
            features.find(feature => feature.kind === "river")!
        ).minX).toBe(-48);
    });

    test("projects seam-crossing toroidal bounds into both canonical edges", () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("feature-wrap", 256, 256);
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const period = 256 * 64;
        const feature = river("river:seam", [period - 64, 2_000, period + 64, 2_000]);
        const delta = createHydrologyFeatureDelta({
            worldIdentity,
            revision: 1,
            featureId: feature.featureId,
            featureKind: "river",
            operation: "upsert",
            feature
        });
        const index = new HydrologyFeatureSpatialIndex(descriptor, [delta]);
        expect(index.itemCount).toBe(2);
        expect(index.query({ minX: -32, minY: 1_900, maxX: 100, maxY: 2_100 })
            .map(value => value.featureId)).toEqual(["river:seam"]);
        expect(index.query({ minX: period - 100, minY: 1_900, maxX: period - 32, maxY: 2_100 })
            .map(value => value.featureId)).toEqual(["river:seam"]);
    });

    test("excludes tombstones and rejects non-canonical delta order", () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("feature-delete-index");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const deleted = createHydrologyFeatureDelta({
            worldIdentity,
            revision: 2,
            featureId: "lake:deleted",
            featureKind: "lake",
            operation: "delete"
        });
        const live = lake("lake:live", 0, 0, 64, 64);
        const upsert = createHydrologyFeatureDelta({
            worldIdentity,
            revision: 2,
            featureId: live.featureId,
            featureKind: "lake",
            operation: "upsert",
            feature: live
        });
        const index = new HydrologyFeatureSpatialIndex(descriptor, [deleted, upsert]);
        expect(index.featureCount).toBe(1);
        expect(index.query({ minX: 0, minY: 0, maxX: 64, maxY: 64 })
            .map(value => value.featureId)).toEqual(["lake:live"]);
        expect(() => new HydrologyFeatureSpatialIndex(descriptor, [upsert, deleted])).toThrow(/ascending/);
    });
});
