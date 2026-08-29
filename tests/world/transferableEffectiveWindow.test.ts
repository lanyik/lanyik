import { describe, expect, test } from "vitest";

import { BaseSemanticChunk } from "../../src/world/BaseSemanticChunk";
import { EffectiveWorldView } from "../../src/world/EffectiveWorldView";
import { createAuthoredRiverFeature } from "../../src/world/HydrologyFeatureDelta";
import { HydrologyRegion, createHydrologyRegion } from "../../src/world/HydrologyRegion";
import { HydrologyWorldSource, HydrologyWorldSourceStats } from "../../src/world/HydrologyWorldSource";
import {
    createCoreInfiniteWorldDescriptorV2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import { SemanticWorldSource, SemanticWorldSourceStats } from "../../src/world/SemanticWorldSource";
import { SEMANTIC_DELTA_FIELD_HEIGHT } from "../../src/world/SparseSemanticDelta";
import { BaseHydrologyFeatureIndex, MemorySurfaceDeltaStore } from "../../src/world/SurfaceDeltaStore";
import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    assertTransferableEffectiveWindow,
    buildTransferableEffectiveWindow,
    transferableEffectiveWindowTransferables
} from "../../src/world/TransferableEffectiveWindow";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { generateBaseSemanticChunk } from "../../src/world/generateBaseSemanticChunk";

const SEMANTIC_STATS: Readonly<SemanticWorldSourceStats> = Object.freeze({
    residentChunks: 0,
    residentBytes: 0,
    leasedChunks: 0,
    inFlightChunks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

const HYDROLOGY_STATS: Readonly<HydrologyWorldSourceStats> = Object.freeze({
    residentRegions: 0,
    residentBytes: 0,
    leasedRegions: 0,
    inFlightRegions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    workers: 0,
    busyWorkers: 0,
    queuedWorkerTasks: 0
});

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

class SemanticSourceStub implements SemanticWorldSource {
    public readonly worldIdentity: string;
    public readonly bounds = undefined;
    public readonly stats = SEMANTIC_STATS;
    public readonly chunks = new Map<string, BaseSemanticChunk>();
    private readonly references = new Map<BaseSemanticChunk, number>();

    constructor(public readonly descriptor: WorldDescriptorV2) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveChunk(chunkX: number, chunkY: number) {
        if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) return undefined;
        if (this.descriptor.sourceKind === "procedural-toroidal") {
            return {
                chunkX: positiveModulo(chunkX, this.descriptor.width / 32),
                chunkY: positiveModulo(chunkY, this.descriptor.height / 32)
            };
        }
        return { chunkX, chunkY };
    }

    public chunkDistance(): number { return 0; }

    public loadChunk(chunkX: number, chunkY: number): Promise<BaseSemanticChunk> {
        const key = `${chunkX}:${chunkY}`;
        let chunk = this.chunks.get(key);
        if (!chunk) {
            if (this.descriptor.sourceKind === "static") throw new Error("static stub is unsupported");
            chunk = generateBaseSemanticChunk({ descriptor: this.descriptor, chunkX, chunkY });
            this.chunks.set(key, chunk);
        }
        this.references.set(chunk, (this.references.get(chunk) ?? 0) + 1);
        return Promise.resolve(chunk);
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        const references = this.references.get(chunk as BaseSemanticChunk) ?? 0;
        if (references <= 0) throw new Error("semantic stub release mismatch");
        this.references.set(chunk as BaseSemanticChunk, references - 1);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean { return this.chunks.has(`${chunkX}:${chunkY}`); }
    public dispose(): void {}

    public get activeReferences(): number {
        return [...this.references.values()].reduce((sum, value) => sum + value, 0);
    }
}

class HydrologySourceStub implements HydrologyWorldSource {
    public readonly worldIdentity: string;
    public readonly stats = HYDROLOGY_STATS;
    private readonly regions = new Map<string, HydrologyRegion>();
    private readonly references = new Map<HydrologyRegion, number>();

    constructor(public readonly descriptor: WorldDescriptorV2, private readonly failKey?: string) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveRegion(regionX: number, regionY: number) {
        if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return undefined;
        if (this.descriptor.sourceKind === "procedural-toroidal") {
            return {
                regionX: positiveModulo(regionX, Math.ceil(this.descriptor.width / 128)),
                regionY: positiveModulo(regionY, Math.ceil(this.descriptor.height / 128))
            };
        }
        return { regionX, regionY };
    }

    public regionDistance(): number { return 0; }

    public loadRegion(regionX: number, regionY: number): Promise<HydrologyRegion> {
        const key = `${regionX}:${regionY}`;
        if (key === this.failKey) return Promise.reject(new Error("planned hydrology load failure"));
        let region = this.regions.get(key);
        if (!region) {
            const validWidth = this.descriptor.sourceKind === "procedural-toroidal"
                ? Math.min(128, this.descriptor.width - regionX * 128) : 128;
            const validHeight = this.descriptor.sourceKind === "procedural-toroidal"
                ? Math.min(128, this.descriptor.height - regionY * 128) : 128;
            region = createHydrologyRegion({
                worldIdentity: this.worldIdentity,
                topology: this.descriptor.topology,
                key: { regionX, regionY },
                revision: 0,
                validBounds: { minX: 0, minY: 0, maxXExclusive: validWidth, maxYExclusive: validHeight },
                boundaryPorts: [],
                rivers: [],
                lakes: [],
                mouths: [],
                bodies: []
            });
            this.regions.set(key, region);
        }
        this.references.set(region, (this.references.get(region) ?? 0) + 1);
        return Promise.resolve(region);
    }

    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        const references = this.references.get(region as HydrologyRegion) ?? 0;
        if (references <= 0) throw new Error("hydrology stub release mismatch");
        this.references.set(region as HydrologyRegion, references - 1);
    }

    public hasRegion(regionX: number, regionY: number): boolean { return this.regions.has(`${regionX}:${regionY}`); }
    public dispose(): void {}

    public get activeReferences(): number {
        return [...this.references.values()].reduce((sum, value) => sum + value, 0);
    }
}

const EMPTY_BASE_INDEX: BaseHydrologyFeatureIndex = {
    resolveFeature: () => undefined,
    referencesTo: () => []
};

describe("TransferableEffectiveWindow", () => {
    test("copies a 20x20 effective snapshot without detaching resident authority", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("transfer-window");
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        const store = new MemorySurfaceDeltaStore(descriptor, EMPTY_BASE_INDEX);
        const feature = createAuthoredRiverFeature({
            featureId: "river:window",
            source: { kind: "spring", sourceId: "spring:window" },
            outlet: { kind: "ocean", bodyId: "ocean" },
            controlPoints: new Float64Array([0, 0, 256, 256]),
            widthProfile: new Uint8Array([1, 2]),
            levelProfile: new Uint16Array([35_000, 30_000]),
            dischargeClass: 2,
            profileIndex: 0
        });
        store.commit({
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
                featureId: feature.featureId,
                featureKind: "river",
                expectedRevision: 0,
                feature
            }]
        });
        const semanticSource = new SemanticSourceStub(descriptor);
        const hydrologySource = new HydrologySourceStub(descriptor);
        const view = new EffectiveWorldView({
            semanticSource,
            hydrologySource,
            deltaSnapshot: store.snapshot()
        });
        const window = await buildTransferableEffectiveWindow({
            view,
            renderKey: { chunkX: 0, chunkY: 0 },
            metrics: { hexSize: 1, heightScale: 10 }
        });
        assertTransferableEffectiveWindow(window);
        expect(EFFECTIVE_WINDOW_TILE_SIZE).toBe(20);
        expect(window.originTileX).toBe(-2);
        expect(window.originTileY).toBe(-2);
        expect(window.valid.every(value => value === 1)).toBe(true);
        expect(window.macroHeight[2 * EFFECTIVE_WINDOW_TILE_SIZE + 2]).toBe(50_000);
        expect(window.dependencyKey.semantic).toHaveLength(4);
        expect(window.dependencyKey.hydrologyRegions).toHaveLength(4);
        expect(window.authoredHydrology.map(delta => delta.featureId)).toEqual(["river:window"]);
        expect(semanticSource.activeReferences).toBe(0);
        expect(hydrologySource.activeReferences).toBe(0);

        const authorityChunk = semanticSource.chunks.get("0:0")!;
        const authorityDelta = store.snapshot().getHydrologyDelta("river:window")!;
        const authorityFeatureBuffer = authorityDelta.operation === "upsert"
            && authorityDelta.feature.kind === "river" ? authorityDelta.feature.controlPoints.buffer : undefined;
        const transferables = transferableEffectiveWindowTransferables(window);
        const clone = structuredClone(window, { transfer: [...transferables] });
        expect(window.valid.byteLength).toBe(0);
        expect(clone.valid.byteLength).toBe(400);
        expect(authorityChunk.macroHeight.byteLength).toBeGreaterThan(0);
        expect(authorityFeatureBuffer?.byteLength).toBeGreaterThan(0);
        view.dispose();
    });

    test("deduplicates semantic and hydrology dependencies across a toroidal seam", async () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("transfer-wrap", 32, 32);
        const store = new MemorySurfaceDeltaStore(descriptor, EMPTY_BASE_INDEX);
        const semanticSource = new SemanticSourceStub(descriptor);
        const hydrologySource = new HydrologySourceStub(descriptor);
        const view = new EffectiveWorldView({
            semanticSource,
            hydrologySource,
            deltaSnapshot: store.snapshot()
        });
        const window = await buildTransferableEffectiveWindow({
            view,
            renderKey: { chunkX: 0, chunkY: 0 },
            metrics: { hexSize: 2, heightScale: 8 }
        });
        expect(window.dependencyKey.semantic.map(value => value.key)).toEqual([{ chunkX: 0, chunkY: 0 }]);
        expect(window.dependencyKey.hydrologyRegions.map(value => value.key))
            .toEqual([{ regionX: 0, regionY: 0 }]);
        expect(window.valid.every(value => value === 1)).toBe(true);
        expect(semanticSource.activeReferences).toBe(0);
        expect(hydrologySource.activeReferences).toBe(0);
        view.dispose();
    });

    test("releases every fulfilled source lease when one parallel load fails", async () => {
        const descriptor = createCoreInfiniteWorldDescriptorV2("transfer-failure");
        const store = new MemorySurfaceDeltaStore(descriptor, EMPTY_BASE_INDEX);
        const semanticSource = new SemanticSourceStub(descriptor);
        const hydrologySource = new HydrologySourceStub(descriptor, "0:0");
        const view = new EffectiveWorldView({
            semanticSource,
            hydrologySource,
            deltaSnapshot: store.snapshot()
        });
        await expect(buildTransferableEffectiveWindow({
            view,
            renderKey: { chunkX: 0, chunkY: 0 },
            metrics: { hexSize: 1, heightScale: 10 }
        })).rejects.toThrow(/planned hydrology/);
        expect(semanticSource.activeReferences).toBe(0);
        expect(hydrologySource.activeReferences).toBe(0);
        expect(view.stats.leasedSemanticChunks).toBe(0);
        expect(view.stats.leasedHydrologyRegions).toBe(0);
        view.dispose();
    });
});
