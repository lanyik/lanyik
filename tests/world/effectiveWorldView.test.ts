import { describe, expect, test } from "vitest";

import {
    assertHydrologyFeatureDelta,
    assertSparseSemanticDelta,
    canonicalizeRenderChunkKey,
    createEffectiveDeltaSnapshot,
    createSparseSemanticDelta,
    createStableHydrologyId,
    createSurfaceDependencyBinding,
    createWorldDescriptorV2,
    EffectiveWorldView,
    generateBaseSemanticChunk,
    HydrologyFeatureDelta,
    hydrologyFeatureBounds,
    HydrologyRegionGenerator,
    OCEAN_BODY_ID,
    semanticChunkCoordinate,
    serializeSurfaceDependencyKey,
    sparseSemanticDeltaByteLength,
    SubstrateClass,
    SurfaceRequestTracker,
    surfaceDependencyKeysEqual
} from "../../src/index";

function semanticDelta(
    revision: number,
    chunkX: number,
    localX: number,
    macroHeight: number
) {
    return createSparseSemanticDelta({
        key: { chunkX, chunkY: 0 },
        revision,
        overrides: [{
            localX,
            localY: 2,
            substrateClass: SubstrateClass.Rock,
            macroHeight,
            biomeWeights: [255, 0, 0, 0],
            vegetationDensity: 200,
            vegetationProfile: 3
        }]
    });
}

describe("surface foundation v2 effective snapshots", () => {
    test("canonicalizes compact semantic overrides and rejects ambiguous encodings", () => {
        const delta = createSparseSemanticDelta({
            key: { chunkX: 0, chunkY: 0 },
            revision: 3,
            overrides: [
                { localX: 4, localY: 1, macroHeight: 12_000 },
                { localX: 1, localY: 2, vegetationDensity: 17 }
            ]
        });
        expect(() => assertSparseSemanticDelta(delta)).not.toThrow();
        expect([...delta.indices]).toEqual([1 * 32 + 2, 4 * 32 + 1]);
        expect(sparseSemanticDeltaByteLength(delta)).toBe(24);
        expect(() => createSparseSemanticDelta({
            key: { chunkX: 0, chunkY: 0 },
            revision: 1,
            overrides: [
                { localX: 1, localY: 2, macroHeight: 1 },
                { localX: 1, localY: 2, macroHeight: 2 }
            ]
        })).toThrow(/duplicate/);
        expect(() => createSparseSemanticDelta({
            key: { chunkX: 0, chunkY: 0 },
            revision: 1,
            overrides: [{ localX: 1, localY: 2, biomeWeights: [1, 2, 3, 4] }]
        })).toThrow(/sum to 255/);

        const nonCanonical = { ...delta, macroHeight: delta.macroHeight.slice() };
        nonCanonical.macroHeight[0] = 1;
        expect(() => assertSparseSemanticDelta(nonCanonical)).toThrow(/unused semantic height/);
    });

    test("publishes whole delta snapshots atomically while captured readers retain their revision", () => {
        const descriptor = createWorldDescriptorV2({ seed: "effective-atomic" });
        const base = generateBaseSemanticChunk({ descriptor, key: { chunkX: 0, chunkY: 0 } });
        const view = new EffectiveWorldView(descriptor);
        const before = view.capture({ semanticChunks: [base] });
        const original = before.getTile(1, 2);
        const delta = semanticDelta(1, 0, 1, 40_000);
        const published = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            semanticDeltas: [delta]
        });
        delta.macroHeight[0] = 1;
        view.publishDeltaSnapshot(published, 0);

        const after = view.capture({ semanticChunks: [base] });
        const changed = after.getTile(1, 2);
        expect(before.effectiveRevision).toBe(0);
        expect(after.effectiveRevision).toBe(1);
        expect(before.getTile(1, 2)).toEqual(original);
        expect(changed).toMatchObject({
            substrateClass: SubstrateClass.Rock,
            macroHeight: 40_000 / 65_535,
            biomeWeights: [1, 0, 0, 0],
            vegetationDensity: 200 / 255,
            vegetationProfile: 3
        });
        expect(changed.temperature).toBe(original.temperature);
        expect(after.semanticChunks[0].base).toBe(base);

        const skipped = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 3,
            semanticDeltas: [semanticDelta(1, 0, 1, 40_000)]
        });
        expect(() => view.publishDeltaSnapshot(skipped, 1)).toThrow(/advance exactly once/);
        expect(() => view.publishDeltaSnapshot(published, 0)).toThrow(/conflict/);
        expect(view.effectiveRevision).toBe(1);
    });

    test("rejects semantic overrides outside a partial safe-integer boundary chunk", () => {
        const descriptor = createWorldDescriptorV2({ seed: "effective-partial" });
        const key = { chunkX: semanticChunkCoordinate(Number.MIN_SAFE_INTEGER), chunkY: 0 };
        const base = generateBaseSemanticChunk({ descriptor, key });
        expect(base.validBounds.minX).toBe(1);
        const layer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            semanticDeltas: [createSparseSemanticDelta({
                key,
                revision: 1,
                overrides: [{ localX: 0, localY: 0, macroHeight: 1 }]
            })]
        });
        const view = new EffectiveWorldView(descriptor, layer);
        expect(() => view.capture({ semanticChunks: [base] })).toThrow(/outside base validBounds/);
    });

    test("keeps full hydrology edits feature-centric and region indices derived", () => {
        const descriptor = createWorldDescriptorV2({ seed: "effective-hydrology" });
        const base = new HydrologyRegionGenerator(descriptor).generate({ regionX: 0, regionY: 0 });
        const generatedRiverId = base.rivers[0].riverId;
        const lakeId = createStableHydrologyId("lake", ["effective-edit"]);
        const tombstone: HydrologyFeatureDelta = {
            kind: "tombstone",
            featureId: generatedRiverId,
            revision: 1,
            targetKind: "river"
        };
        const lake: HydrologyFeatureDelta = {
            kind: "lake",
            featureId: lakeId,
            revision: 1,
            boundaryPoints: new Float64Array([8, 8, 24, 8, 16, 24]),
            level: 42_000,
            profileIndex: 1
        };
        expect(() => assertHydrologyFeatureDelta(tombstone)).not.toThrow();
        expect(() => assertHydrologyFeatureDelta(lake)).not.toThrow();
        expect(hydrologyFeatureBounds(lake)).toEqual({ minX: 8, minY: 8, maxX: 24, maxY: 24 });
        expect(() => hydrologyFeatureBounds(tombstone as never)).toThrow(/do not have spatial bounds/);

        const layer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            hydrologyFeatures: [lake, tombstone],
            hydrologyRegionFeatures: [{
                key: base.key,
                featureIds: [generatedRiverId, lakeId]
            }]
        });
        lake.boundaryPoints[0] = 100;
        const baseSnapshot = new EffectiveWorldView(descriptor).capture({ hydrologyRegions: [base] });
        const effectiveSnapshot = new EffectiveWorldView(descriptor, layer).capture({ hydrologyRegions: [base] });
        const region = effectiveSnapshot.getHydrologyRegion(base.key);
        expect(region.featureDeltas.map(feature => feature.featureId))
            .toEqual([...region.featureDeltas.map(feature => feature.featureId)].sort());
        expect(region.suppressesBaseRiver(generatedRiverId)).toBe(true);
        expect(region.suppressesBaseLake(lakeId)).toBe(true);
        const effectiveLake = region.featureDeltas.find(feature => feature.kind === "lake")!;
        expect(effectiveLake.kind === "lake" && effectiveLake.boundaryPoints[0]).toBe(8);
        expect(surfaceDependencyKeysEqual(
            createSurfaceDependencyBinding(baseSnapshot, { chunkX: 0, chunkY: 0 }).dependencyKey,
            createSurfaceDependencyBinding(effectiveSnapshot, { chunkX: 0, chunkY: 0 }).dependencyKey
        )).toBe(false);

        expect(() => createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            hydrologyFeatures: [lake]
        })).toThrow(/indexed by at least one region/);
    });

    test("builds request-order-independent exact dependencies without global invalidation", () => {
        const descriptor = createWorldDescriptorV2({ seed: "effective-dependencies" });
        const chunks = [0, 1].map(chunkX =>
            generateBaseSemanticChunk({ descriptor, key: { chunkX, chunkY: 0 } }));
        const generator = new HydrologyRegionGenerator(descriptor);
        const regions = [
            generator.generate({ regionX: 0, regionY: 0 }),
            generator.generate({ regionX: 1, regionY: 0 })
        ];
        const view = new EffectiveWorldView(descriptor);
        const first = view.capture({
            semanticChunks: [...chunks].reverse(),
            hydrologyRegions: [...regions].reverse()
        });
        const ordered = view.capture({ semanticChunks: chunks, hydrologyRegions: regions });
        const firstBinding = createSurfaceDependencyBinding(first, { chunkX: 0, chunkY: 0 });
        const orderedBinding = createSurfaceDependencyBinding(ordered, { chunkX: 0, chunkY: 0 });
        expect(serializeSurfaceDependencyKey(firstBinding.dependencyKey))
            .toBe(serializeSurfaceDependencyKey(orderedBinding.dependencyKey));

        const unrelatedLayer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            semanticDeltas: [semanticDelta(1, 2, 1, 30_000)]
        });
        view.publishDeltaSnapshot(unrelatedLayer, 0);
        const afterUnrelated = createSurfaceDependencyBinding(
            view.capture({ semanticChunks: chunks, hydrologyRegions: regions }),
            { chunkX: 0, chunkY: 0 }
        );
        expect(afterUnrelated.effectiveRevision).toBe(1);
        expect(surfaceDependencyKeysEqual(firstBinding.dependencyKey, afterUnrelated.dependencyKey)).toBe(true);

        const relevantLayer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 2,
            semanticDeltas: [semanticDelta(2, 0, 1, 30_000)]
        });
        view.publishDeltaSnapshot(relevantLayer, 1);
        const afterRelevant = createSurfaceDependencyBinding(
            view.capture({ semanticChunks: chunks, hydrologyRegions: regions }),
            { chunkX: 0, chunkY: 0 }
        );
        expect(surfaceDependencyKeysEqual(firstBinding.dependencyKey, afterRelevant.dependencyKey)).toBe(false);
        expect(surfaceDependencyKeysEqual(
            afterRelevant.dependencyKey,
            createSurfaceDependencyBinding(
                view.capture({ semanticChunks: chunks, hydrologyRegions: regions }),
                { chunkX: 0, chunkY: 0 },
                { compilerRevision: 2 }
            ).dependencyKey
        )).toBe(false);
    });

    test("rejects stale request tokens, changed dependencies, released mounts, and old sessions", () => {
        const descriptor = createWorldDescriptorV2({ seed: "effective-token" });
        const base = generateBaseSemanticChunk({ descriptor, key: { chunkX: 0, chunkY: 0 } });
        const view = new EffectiveWorldView(descriptor);
        const snapshot = view.capture({ semanticChunks: [base] });
        const key = { chunkX: 0, chunkY: 0 };
        const tracker = new SurfaceRequestTracker(descriptor, 7);
        const first = tracker.issueRequest(snapshot, key);
        const firstBinding = createSurfaceDependencyBinding(snapshot, key);
        expect(tracker.canAccept(key, first, firstBinding)).toBe(true);

        const second = tracker.issueRequest(snapshot, key);
        expect(second.requestToken.renderChunkGeneration)
            .toBeGreaterThan(first.requestToken.renderChunkGeneration);
        expect(tracker.canAccept(key, first, firstBinding)).toBe(false);
        expect(tracker.canAccept(key, second, firstBinding)).toBe(true);

        const unrelatedRevision = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            semanticDeltas: [semanticDelta(1, 2, 1, 30_000)]
        });
        view.publishDeltaSnapshot(unrelatedRevision, 0);
        const reusableBinding = createSurfaceDependencyBinding(view.capture({ semanticChunks: [base] }), key);
        expect(reusableBinding.effectiveRevision).toBe(1);
        expect(tracker.canAccept(key, second, reusableBinding)).toBe(true);
        expect(tracker.canAccept(key, { ...second, effectiveRevision: 2 }, reusableBinding)).toBe(false);

        const changedRevision = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 2,
            semanticDeltas: [semanticDelta(2, 0, 1, 30_000)]
        });
        view.publishDeltaSnapshot(changedRevision, 1);
        const changedBinding = createSurfaceDependencyBinding(view.capture({ semanticChunks: [base] }), key);
        expect(tracker.canAccept(key, second, changedBinding)).toBe(false);
        expect(tracker.release(key, second.requestToken)).toBe(true);
        expect(tracker.canAccept(key, second, reusableBinding)).toBe(false);

        const remounted = tracker.issueRequest(snapshot, key);
        expect(remounted.requestToken.renderChunkGeneration)
            .toBeGreaterThan(second.requestToken.renderChunkGeneration);
        const nextSession = new SurfaceRequestTracker(descriptor, 8);
        expect(nextSession.canAccept(key, remounted, firstBinding)).toBe(false);
        tracker.dispose();
        expect(tracker.activeRequestCount).toBe(0);
    });

    test("canonicalizes toroidal render aliases before token tracking", () => {
        const descriptor = createWorldDescriptorV2({
            seed: "effective-torus",
            topology: { kind: "toroidal", width: 64, height: 64 }
        });
        expect(canonicalizeRenderChunkKey(descriptor, { chunkX: -1, chunkY: -1 }))
            .toEqual({ chunkX: 3, chunkY: 3 });
        const tracker = new SurfaceRequestTracker(descriptor, 1);
        const token = tracker.issue({ chunkX: -1, chunkY: -1 });
        expect(tracker.isCurrent({ chunkX: 3, chunkY: 3 }, token)).toBe(true);

        const infinite = createWorldDescriptorV2({ seed: "effective-safe-range" });
        expect(() => canonicalizeRenderChunkKey(infinite, {
            chunkX: Math.ceil(Number.MIN_SAFE_INTEGER / 16) - 1,
            chunkY: 0
        })).toThrow(/safe integer tile range/);
        expect(() => canonicalizeRenderChunkKey(infinite, {
            chunkX: Math.floor(Number.MAX_SAFE_INTEGER / 16) + 1,
            chunkY: 0
        })).toThrow(/safe integer tile range/);
    });

    test("rejects delta snapshots from a different world identity", () => {
        const first = createWorldDescriptorV2({ seed: "effective-world-a" });
        const second = createWorldDescriptorV2({ seed: "effective-world-b" });
        const foreign = createEffectiveDeltaSnapshot({ descriptor: first, effectiveRevision: 0 });
        expect(() => new EffectiveWorldView(second, foreign)).toThrow(/world identity/);
        expect(() => new EffectiveWorldView(second).publishDeltaSnapshot(foreign, 0)).toThrow(/world identity/);
    });

    test("rejects invalid full river records before they reach an effective snapshot", () => {
        const riverId = createStableHydrologyId("river", ["invalid-level"]);
        const invalid: HydrologyFeatureDelta = {
            kind: "river",
            featureId: riverId,
            revision: 1,
            source: { kind: "source" },
            outlet: { kind: "body", featureId: OCEAN_BODY_ID },
            controlPoints: new Float64Array([0, 0, 16, 16]),
            widthProfile: new Uint8Array([1, 2]),
            levelProfile: new Uint16Array([10, 11]),
            dischargeClass: 1
        };
        expect(() => assertHydrologyFeatureDelta(invalid)).toThrow(/must not rise/);
    });
});
