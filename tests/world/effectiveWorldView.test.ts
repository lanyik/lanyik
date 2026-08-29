import { describe, expect, test } from "vitest";

import { BaseSemanticChunk } from "../../src/world/BaseSemanticChunk";
import {
    EffectiveWorldView,
    effectiveHydrologySuppressesBaseFeature
} from "../../src/world/EffectiveWorldView";
import { createAuthoredRiverFeature } from "../../src/world/HydrologyFeatureDelta";
import { HydrologyRegion } from "../../src/world/HydrologyRegion";
import {
    HydrologyRegionAssembler,
    canonicalHydrologyPoint
} from "../../src/world/HydrologyRegionAssembler";
import {
    HydrologyWorldSource,
    HydrologyWorldSourceStats
} from "../../src/world/HydrologyWorldSource";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import {
    SEMANTIC_DELTA_FIELD_HEIGHT
} from "../../src/world/SparseSemanticDelta";
import {
    BaseHydrologyFeatureIndex,
    EffectiveHydrologyGraphNode,
    MemorySurfaceDeltaStore
} from "../../src/world/SurfaceDeltaStore";
import {
    SemanticWorldSource,
    SemanticWorldSourceStats
} from "../../src/world/SemanticWorldSource";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";
import { serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

const EMPTY_SEMANTIC_STATS: Readonly<SemanticWorldSourceStats> = Object.freeze({
    residentChunks: 1,
    residentBytes: 0,
    leasedChunks: 0,
    inFlightChunks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

const EMPTY_HYDROLOGY_STATS: Readonly<HydrologyWorldSourceStats> = Object.freeze({
    residentRegions: 1,
    residentBytes: 0,
    leasedRegions: 0,
    inFlightRegions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

class SemanticSourceStub implements SemanticWorldSource {
    public readonly worldIdentity: string;
    public readonly bounds = undefined;
    public readonly stats = EMPTY_SEMANTIC_STATS;
    public references = 0;

    constructor(public readonly descriptor: ReturnType<typeof createCoreInfiniteWorldDescriptorV2>,
        private readonly chunk: BaseSemanticChunk) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveChunk(chunkX: number, chunkY: number) {
        return chunkX === this.chunk.key.chunkX && chunkY === this.chunk.key.chunkY
            ? { chunkX, chunkY } : undefined;
    }
    public chunkDistance(): number { return 0; }
    public loadChunk(): Promise<BaseSemanticChunk> { this.references += 1; return Promise.resolve(this.chunk); }
    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        if (chunk !== this.chunk || this.references <= 0) throw new Error("bad semantic release");
        this.references -= 1;
    }
    public hasChunk(): boolean { return true; }
    public dispose(): void {}
}

class HydrologySourceStub implements HydrologyWorldSource {
    public readonly worldIdentity: string;
    public readonly stats = EMPTY_HYDROLOGY_STATS;
    public references = 0;

    constructor(public readonly descriptor: ReturnType<typeof createCoreInfiniteWorldDescriptorV2>,
        private readonly region: HydrologyRegion) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveRegion(regionX: number, regionY: number) {
        return regionX === this.region.key.regionX && regionY === this.region.key.regionY
            ? { regionX, regionY } : undefined;
    }
    public regionDistance(): number { return 0; }
    public loadRegion(): Promise<HydrologyRegion> { this.references += 1; return Promise.resolve(this.region); }
    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        if (region !== this.region || this.references <= 0) throw new Error("bad hydrology release");
        this.references -= 1;
    }
    public hasRegion(): boolean { return true; }
    public dispose(): void {}
}

function baseRegion(worldIdentity: string): HydrologyRegion {
    const assembler = new HydrologyRegionAssembler({
        worldIdentity,
        topology: "infinite",
        key: { regionX: 0, regionY: 0 },
        validWidth: 128,
        validHeight: 128,
        canonicalizePort: canonicalHydrologyPoint
    });
    assembler.addDrainageEdge({
        sourceNodeId: "node:source",
        parentNodeId: "node:outlet",
        terminalNodeId: "base",
        sourceX: 1,
        sourceY: 1,
        parentX: 5,
        parentY: 5,
        sourceLevel: 40_000,
        parentLevel: 30_000,
        dischargeClass: 3,
        parentTerminal: { bodyId: "ocean", kind: "ocean" }
    });
    return assembler.finish();
}

function baseIndex(node: EffectiveHydrologyGraphNode): BaseHydrologyFeatureIndex {
    return {
        resolveFeature: featureId => featureId === node.featureId ? node : undefined,
        referencesTo: () => []
    };
}

describe("EffectiveWorldView", () => {
    test("leases one immutable semantic/hydrology snapshot and overlays feature authority", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("effective-view");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const semanticBase = generateBaseSemanticChunk({ descriptor, chunkX: 0, chunkY: 0 });
        const hydrologyBase = baseRegion(worldIdentity);
        const baseNode: EffectiveHydrologyGraphNode = {
            kind: "river",
            featureId: "river:base",
            source: { kind: "spring", sourceId: "spring:base" },
            outlet: { kind: "ocean", bodyId: "ocean" },
            sourceLevel: 40_000,
            outletLevel: 30_000
        };
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex(baseNode));
        const replacement = createAuthoredRiverFeature({
            featureId: "river:base",
            source: { kind: "spring", sourceId: "spring:replacement" },
            outlet: { kind: "ocean", bodyId: "ocean" },
            controlPoints: new Float64Array([64, 64, 640, 640]),
            widthProfile: new Uint8Array([2, 3]),
            levelProfile: new Uint16Array([39_000, 30_000]),
            dischargeClass: 3,
            profileIndex: 0
        });
        await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: {
                    tileIndex: new Uint16Array([0]),
                    fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
                    macroHeight: new Uint16Array([50_000]),
                    substrateClass: new Uint8Array(1),
                    biomeWeights: new Uint8Array(4),
                    vegetationDensity: new Uint8Array(1),
                    vegetationProfile: new Uint8Array(1)
                }
            }],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: replacement.featureId,
                featureKind: "river",
                expectedRevision: 0,
                feature: replacement
            }]
        });
        const semanticSource = new SemanticSourceStub(descriptor, semanticBase);
        const hydrologySource = new HydrologySourceStub(descriptor, hydrologyBase);
        const view = new EffectiveWorldView({
            semanticSource,
            hydrologySource,
            deltaSnapshot: store.snapshot()
        });

        const semantic = await view.loadSemanticChunk(0, 0);
        const hydrology = await view.loadHydrologyRegion(0, 0);
        expect(semantic.effectiveRevision).toBe(1);
        expect(semantic.delta?.macroHeight[0]).toBe(50_000);
        expect(hydrology.effectiveRevision).toBe(1);
        expect(effectiveHydrologySuppressesBaseFeature(hydrology, "river:base")).toBe(true);
        expect(hydrology.base.rivers).toHaveLength(1);
        expect(hydrology.effectiveBase.rivers).toHaveLength(0);
        expect(hydrology.effectiveBase.mouths).toHaveLength(0);
        expect(hydrology.effectiveBase.bodies.map(body => body.bodyId)).toEqual(["ocean"]);
        expect(hydrology.authoredFeatures.map(delta => delta.featureId)).toEqual(["river:base"]);
        expect(view.stats).toMatchObject({
            leasedSemanticChunks: 1,
            leasedHydrologyRegions: 1,
            authoredHydrologyFeatures: 1
        });

        view.releaseSemanticChunk(semantic);
        view.releaseHydrologyRegion(hydrology);
        expect(semanticSource.references).toBe(0);
        expect(hydrologySource.references).toBe(0);
        expect(() => view.releaseSemanticChunk(semantic)).toThrow(/active view lease/);
        view.dispose();
        expect(() => view.resolveSemanticChunk(0, 0)).toThrow(/disposed/);
    });

    test("keeps an old view pinned to its snapshot after a later commit", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("effective-view-revision");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const semanticBase = generateBaseSemanticChunk({ descriptor, chunkX: 0, chunkY: 0 });
        const hydrologyBase = baseRegion(worldIdentity);
        const baseNode: EffectiveHydrologyGraphNode = {
            kind: "river",
            featureId: "river:base",
            source: { kind: "spring", sourceId: "spring:base" },
            outlet: { kind: "ocean", bodyId: "ocean" },
            sourceLevel: 40_000,
            outletLevel: 30_000
        };
        const store = new MemorySurfaceDeltaStore(descriptor, baseIndex(baseNode));
        const semanticSource = new SemanticSourceStub(descriptor, semanticBase);
        const hydrologySource = new HydrologySourceStub(descriptor, hydrologyBase);
        const oldView = new EffectiveWorldView({
            semanticSource,
            hydrologySource,
            deltaSnapshot: store.snapshot()
        });
        await store.commit({
            worldIdentity,
            semanticMutations: [{
                operation: "upsert",
                key: { chunkX: 0, chunkY: 0 },
                expectedRevision: 0,
                payload: {
                    tileIndex: new Uint16Array([0]),
                    fieldMask: new Uint8Array([SEMANTIC_DELTA_FIELD_HEIGHT]),
                    macroHeight: new Uint16Array([51_000]),
                    substrateClass: new Uint8Array(1),
                    biomeWeights: new Uint8Array(4),
                    vegetationDensity: new Uint8Array(1),
                    vegetationProfile: new Uint8Array(1)
                }
            }],
            hydrologyMutations: []
        });
        const oldChunk = await oldView.loadSemanticChunk(0, 0);
        expect(oldChunk.effectiveRevision).toBe(0);
        expect(oldChunk.delta).toBeUndefined();
        oldView.releaseSemanticChunk(oldChunk);
        oldView.dispose();
    });
});
