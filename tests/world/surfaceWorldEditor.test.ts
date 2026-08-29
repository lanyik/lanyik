import { describe, expect, test } from "vitest";

import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    BaseSemanticChunk,
    createBaseSemanticChunk,
    semanticCatalogLimits
} from "../../src/world/BaseSemanticChunk";
import {
    createAuthoredLakeFeature,
    createAuthoredRiverFeature
} from "../../src/world/HydrologyFeatureDelta";
import { HydrologyRegion, createHydrologyRegion } from "../../src/world/HydrologyRegion";
import { HydrologyWorldSource, HydrologyWorldSourceStats } from "../../src/world/HydrologyWorldSource";
import { createCoreInfiniteWorldDescriptorV2 } from "../../src/world/SemanticCatalogsV2";
import { SemanticWorldSource, SemanticWorldSourceStats } from "../../src/world/SemanticWorldSource";
import { SEMANTIC_DELTA_FIELD_HEIGHT } from "../../src/world/SparseSemanticDelta";
import {
    BaseHydrologyFeatureIndex,
    MemorySurfaceDeltaStore
} from "../../src/world/SurfaceDeltaStore";
import {
    SurfaceEditConflictError,
    SurfaceWorldEditor,
    createSurfaceEditArea
} from "../../src/world/SurfaceWorldEditor";
import {
    BaseHydrologyChangeIndex,
    WORLD_CHANGE_DOMAIN_HEIGHT,
    WORLD_CHANGE_DOMAIN_HYDROLOGY,
    WORLD_CHANGE_DOMAIN_MATERIAL,
    WORLD_CHANGE_DOMAIN_VEGETATION
} from "../../src/world/WorldChangeSet";
import { WorldDescriptorV2, serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";

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

class FlatSemanticSource implements SemanticWorldSource {
    public readonly worldIdentity: string;
    public readonly bounds = undefined;
    public readonly stats = SEMANTIC_STATS;
    private readonly chunks = new Map<string, BaseSemanticChunk>();
    private readonly references = new Map<BaseSemanticChunk, number>();

    constructor(public readonly descriptor: WorldDescriptorV2, private readonly height: number) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveChunk(chunkX: number, chunkY: number) {
        return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY) ? { chunkX, chunkY } : undefined;
    }

    public chunkDistance(): number { return 0; }

    public loadChunk(chunkX: number, chunkY: number): Promise<BaseSemanticChunk> {
        const identity = `${chunkX}:${chunkY}`;
        let chunk = this.chunks.get(identity);
        if (!chunk) {
            const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
            for (let index = 0; index < BASE_SEMANTIC_CHUNK_TILE_COUNT; index += 1) {
                biomeWeights[index * 4] = 255;
            }
            chunk = createBaseSemanticChunk({
                key: { chunkX, chunkY },
                revision: 0,
                substrateClass: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
                macroHeight: new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT).fill(this.height),
                biomeWeights,
                climate: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2),
                vegetationDensity: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
                vegetationProfile: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT)
            }, semanticCatalogLimits(this.descriptor));
            this.chunks.set(identity, chunk);
        }
        this.references.set(chunk, (this.references.get(chunk) ?? 0) + 1);
        return Promise.resolve(chunk);
    }

    public releaseChunk(chunk: Readonly<BaseSemanticChunk>): void {
        const owned = chunk as BaseSemanticChunk;
        const count = this.references.get(owned) ?? 0;
        if (count <= 0) throw new Error("semantic test lease mismatch");
        this.references.set(owned, count - 1);
    }

    public hasChunk(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(`${chunkX}:${chunkY}`);
    }

    public dispose(): void {}
}

class EmptyHydrologySource implements HydrologyWorldSource {
    public readonly worldIdentity: string;
    public readonly stats = HYDROLOGY_STATS;
    private readonly regions = new Map<string, HydrologyRegion>();
    private readonly references = new Map<HydrologyRegion, number>();

    constructor(public readonly descriptor: WorldDescriptorV2) {
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
    }

    public resolveRegion(regionX: number, regionY: number) {
        return Number.isSafeInteger(regionX) && Number.isSafeInteger(regionY) ? { regionX, regionY } : undefined;
    }

    public regionDistance(): number { return 0; }

    public loadRegion(regionX: number, regionY: number): Promise<HydrologyRegion> {
        const identity = `${regionX}:${regionY}`;
        let region = this.regions.get(identity);
        if (!region) {
            region = createHydrologyRegion({
                worldIdentity: this.worldIdentity,
                topology: "infinite",
                key: { regionX, regionY },
                revision: 0,
                validBounds: { minX: 0, minY: 0, maxXExclusive: 128, maxYExclusive: 128 },
                boundaryPorts: [],
                rivers: [],
                lakes: [],
                mouths: [],
                bodies: []
            });
            this.regions.set(identity, region);
        }
        this.references.set(region, (this.references.get(region) ?? 0) + 1);
        return Promise.resolve(region);
    }

    public releaseRegion(region: Readonly<HydrologyRegion>): void {
        const owned = region as HydrologyRegion;
        const count = this.references.get(owned) ?? 0;
        if (count <= 0) throw new Error("hydrology test lease mismatch");
        this.references.set(owned, count - 1);
    }

    public hasRegion(regionX: number, regionY: number): boolean {
        return this.regions.has(`${regionX}:${regionY}`);
    }

    public dispose(): void {}
}

const BASE_INDEX: BaseHydrologyChangeIndex & BaseHydrologyFeatureIndex = {
    resolveFeature: () => undefined,
    referencesTo: () => [],
    resolveBoundsQ64: () => undefined
};

function river(level: number) {
    return createAuthoredRiverFeature({
        featureId: "river:edit",
        source: { kind: "spring", sourceId: "spring:edit" },
        outlet: { kind: "ocean", bodyId: "ocean" },
        controlPoints: new Float64Array([2 * 64, 5 * 64, 12 * 64, 5 * 64]),
        widthProfile: new Uint8Array([2, 2]),
        levelProfile: new Uint16Array([level, level]),
        dischargeClass: 2,
        profileIndex: 1
    });
}

function heightArea() {
    return createSurfaceEditArea([
        { tileX: 6, tileY: 4, strength: 255 },
        { tileX: 6, tileY: 5, strength: 255 },
        { tileX: 7, tileY: 4, strength: 255 },
        { tileX: 7, tileY: 5, strength: 255 }
    ]);
}

async function fixture(withRiver: boolean) {
    const descriptor = createCoreInfiniteWorldDescriptorV2(`surface-editor-${withRiver}`);
    const store = new MemorySurfaceDeltaStore(descriptor, BASE_INDEX);
    if (withRiver) {
        const feature = river(40_000);
        await store.commit({
            worldIdentity: store.worldIdentity,
            semanticMutations: [],
            hydrologyMutations: [{
                operation: "upsert",
                featureId: feature.featureId,
                featureKind: "river",
                expectedRevision: 0,
                feature
            }]
        });
    }
    const editor = new SurfaceWorldEditor({
        store,
        semanticSource: new FlatSemanticSource(descriptor, 10_000),
        hydrologySource: new EmptyHydrologySource(descriptor),
        baseHydrology: BASE_INDEX,
        metrics: { hexSize: 1, heightScale: 10 },
        minimumExplicitWaterDepth: 0.1,
        residency: () => ({
            hydrologyRegions: [{ regionX: 0, regionY: 0 }],
            renderChunks: [{ chunkX: 0, chunkY: 0 }]
        })
    });
    return { descriptor, store, editor };
}

describe("SurfaceWorldEditor", () => {
    test("atomically materializes quantized height, material and vegetation fields", async () => {
        const { store, editor } = await fixture(false);
        const area = createSurfaceEditArea([{ tileX: 2, tileY: 3, strength: 255 }]);
        const changeSet = await editor.edit(transaction => {
            transaction.raiseTerrain(area, {
                delta: 0.1,
                falloff: "linear",
                waterPolicy: "reject"
            });
            transaction.paintMaterial(area, {
                substrateClass: 1,
                biomeWeights: [0, 255, 0, 0]
            });
            transaction.paintVegetation(area, { density: 200, profile: 1 });
        });

        expect(changeSet.domains & WORLD_CHANGE_DOMAIN_HEIGHT).not.toBe(0);
        expect(changeSet.domains & WORLD_CHANGE_DOMAIN_MATERIAL).not.toBe(0);
        expect(changeSet.domains & WORLD_CHANGE_DOMAIN_VEGETATION).not.toBe(0);
        const delta = store.snapshot().getSemanticDelta(0, 0)!;
        expect(delta.fieldMask[0]).toBe(SEMANTIC_DELTA_FIELD_HEIGHT | 2 | 4 | 8);
        expect(delta.macroHeight[0]).toBe(10_000 + Math.round(0.1 * 0xffff));
        expect(delta.substrateClass[0]).toBe(1);
        expect(delta.vegetationDensity[0]).toBe(200);
    });

    test("removes a semantic override with canonical zero payload when an edit returns to base", async () => {
        const { store, editor } = await fixture(false);
        const area = createSurfaceEditArea([{ tileX: 2, tileY: 3, strength: 255 }]);
        await editor.edit(transaction => transaction.raiseTerrain(area, {
            delta: 0.1,
            falloff: "constant",
            waterPolicy: "reject"
        }));
        await editor.edit(transaction => transaction.raiseTerrain(area, {
            delta: -0.1,
            falloff: "constant",
            waterPolicy: "reject"
        }));
        expect(store.snapshot().effectiveRevision).toBe(2);
        expect(store.snapshot().getSemanticDelta(0, 0)).toBeUndefined();
        expect(store.snapshot().getSemanticRevision(0, 0)).toBe(2);
    });

    test("rejects partial-strength input for exact material and vegetation assignment", async () => {
        const { store, editor } = await fixture(false);
        const area = createSurfaceEditArea([{ tileX: 2, tileY: 3, strength: 128 }]);
        await expect(editor.edit(transaction => transaction.paintMaterial(area, {
            substrateClass: 1
        }))).rejects.toThrow(/strength 255/);
        expect(store.snapshot().effectiveRevision).toBe(0);
    });

    test("reject keeps the authoritative revision unchanged when terrain blocks a river", async () => {
        const { store, editor } = await fixture(true);
        await expect(editor.edit(transaction => transaction.raiseTerrain(heightArea(), {
            delta: 0.8,
            falloff: "constant",
            waterPolicy: "reject"
        }))).rejects.toBeInstanceOf(SurfaceEditConflictError);
        expect(store.snapshot().effectiveRevision).toBe(1);
        expect(store.snapshot().getSemanticDelta(0, 0)).toBeUndefined();
    });

    test("preserve-channel converts the request into final bounded height overrides", async () => {
        const { store, editor } = await fixture(true);
        const changeSet = await editor.edit(transaction => transaction.raiseTerrain(heightArea(), {
            delta: 0.8,
            falloff: "constant",
            waterPolicy: "preserve-channel"
        }));
        expect(changeSet.revision).toBe(2);
        const delta = store.snapshot().getSemanticDelta(0, 0)!;
        expect(Math.max(...delta.macroHeight)).toBeLessThan(40_000);
        expect(Math.max(...delta.macroHeight)).toBeGreaterThan(10_000);
    });

    test("coupled requires and atomically publishes a sufficient hydrology mutation", async () => {
        const { store, editor } = await fixture(true);
        await expect(editor.edit(transaction => transaction.raiseTerrain(heightArea(), {
            delta: 0.8,
            falloff: "constant",
            waterPolicy: "coupled"
        }))).rejects.toThrow(/require at least one hydrology mutation/);
        expect(store.snapshot().effectiveRevision).toBe(1);

        const raisedRiver = river(65_000);
        const changeSet = await editor.edit(transaction => {
            transaction.raiseTerrain(heightArea(), {
                delta: 0.8,
                falloff: "constant",
                waterPolicy: "coupled"
            });
            transaction.upsertHydrology(raisedRiver);
            raisedRiver.levelProfile.fill(1);
        });
        expect(changeSet.domains & WORLD_CHANGE_DOMAIN_HEIGHT).not.toBe(0);
        expect(changeSet.domains & WORLD_CHANGE_DOMAIN_HYDROLOGY).not.toBe(0);
        const stored = store.snapshot().getHydrologyDelta("river:edit")!;
        expect(stored.operation === "upsert" && stored.feature.kind === "river"
            ? stored.feature.levelProfile[0] : 0).toBe(65_000);
    });

    test("coupled rejects a lake split into disconnected compiled coverage", async () => {
        const { store, editor } = await fixture(false);
        const ridge: { tileX: number; tileY: number; strength: number }[] = [];
        for (let tileY = 1; tileY <= 13; tileY += 1) {
            ridge.push({ tileX: 6, tileY, strength: 255 });
            ridge.push({ tileX: 7, tileY, strength: 255 });
        }
        const lake = createAuthoredLakeFeature({
            featureId: "lake:split",
            polygon: new Float64Array([
                2 * 64, 2 * 64,
                12 * 64, 2 * 64,
                12 * 64, 12 * 64,
                2 * 64, 12 * 64
            ]),
            level: 40_000,
            profileIndex: 1
        });
        let failure: unknown;
        try {
            await editor.edit(transaction => {
                transaction.raiseTerrain(createSurfaceEditArea(ridge), {
                    delta: 0.8,
                    falloff: "constant",
                    waterPolicy: "coupled"
                });
                transaction.upsertHydrology(lake);
            });
        } catch (reason) {
            failure = reason;
        }
        expect(failure).toBeInstanceOf(SurfaceEditConflictError);
        expect((failure as SurfaceEditConflictError).details
            .some(detail => detail.kind === "lake-disconnected")).toBe(true);
        expect(store.snapshot().effectiveRevision).toBe(0);
    });
});
