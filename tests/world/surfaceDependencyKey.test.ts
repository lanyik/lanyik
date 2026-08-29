import { describe, expect, test } from "vitest";

import {
    createSurfaceDependencyKey,
    createSurfaceRequestToken,
    serializeSurfaceDependencyKey,
    surfaceDependencyKeysEqual,
    surfaceRequestTokensEqual
} from "../../src/world/SurfaceDependencyKey";

function key() {
    return createSurfaceDependencyKey({
        worldIdentity: "world:dependency",
        renderKey: { chunkX: -2, chunkY: 3 },
        metrics: { hexSize: 1.5, heightScale: 12 },
        semantic: [
            { key: { chunkX: -1, chunkY: 1 }, baseRevision: 0, deltaRevision: 4 },
            { key: { chunkX: 0, chunkY: 1 }, baseRevision: 0, deltaRevision: 0 }
        ],
        hydrologyRegions: [
            { key: { regionX: -1, regionY: 0 }, baseRevision: 0 },
            { key: { regionX: 0, regionY: 0 }, baseRevision: 0 }
        ],
        hydrologyFeatures: [
            { featureId: "lake:a", featureKind: "lake", revision: 4 },
            { featureId: "river:b", featureKind: "river", revision: 7 }
        ]
    });
}

describe("SurfaceDependencyKey", () => {
    test("freezes and deterministically serializes the complete content identity", () => {
        const first = key();
        const second = key();
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.semantic)).toBe(true);
        expect(serializeSurfaceDependencyKey(first)).toBe(serializeSurfaceDependencyKey(second));
        expect(surfaceDependencyKeysEqual(first, second)).toBe(true);
        const changedScale = createSurfaceDependencyKey({
            ...first,
            metrics: { ...first.metrics, hexSize: 2 }
        });
        expect(surfaceDependencyKeysEqual(first, changedScale)).toBe(false);
    });

    test("rejects unordered, duplicate, empty and zero-revision dependencies", () => {
        const input = key();
        expect(() => createSurfaceDependencyKey({
            ...input,
            semantic: [...input.semantic].reverse()
        })).toThrow(/ascending/);
        expect(() => createSurfaceDependencyKey({
            ...input,
            hydrologyRegions: []
        })).toThrow(/count/);
        expect(() => createSurfaceDependencyKey({
            ...input,
            hydrologyFeatures: [{ featureId: "river:zero", featureKind: "river", revision: 0 }]
        })).toThrow(/delta revision/);
    });

    test("keeps request tokens outside the reusable content identity", () => {
        const first = createSurfaceRequestToken(3, 8);
        const same = createSurfaceRequestToken(3, 8);
        const newer = createSurfaceRequestToken(3, 9);
        expect(surfaceRequestTokensEqual(first, same)).toBe(true);
        expect(surfaceRequestTokensEqual(first, newer)).toBe(false);
        expect(serializeSurfaceDependencyKey(key())).not.toContain("renderChunkGeneration");
    });
});
