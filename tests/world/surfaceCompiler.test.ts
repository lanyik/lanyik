import { describe, expect, test } from "vitest";

import {
    assertCompiledSurfaceChunk,
    BASE_SEMANTIC_CHUNK_REVISION,
    BaseSemanticChunk,
    canonicalizeRenderChunkKey,
    compileSurfaceChunk,
    createEffectiveDeltaSnapshot,
    createSparseSemanticDelta,
    createStableHydrologyId,
    createTransferableEffectiveWindow,
    createWorldDescriptorV2,
    decodeFloat16,
    effectiveSurfaceWindowTransferables,
    encodeFloat16,
    EffectiveDeltaSnapshot,
    EffectiveWorldView,
    FULL_HYDROLOGY_REGION_BOUNDS,
    generateBaseSemanticChunk,
    HydrologyFeatureDelta,
    HydrologyRegion,
    HydrologyRegionGenerator,
    HydrologyWaterKind,
    HYDROLOGY_REGION_REVISION,
    OCEAN_BODY_ID,
    RenderChunkKey,
    sampleCompiledSurfaceChunk,
    semanticChunkLocalIndex,
    SubstrateClass,
    SURFACE_COMPILE_PROFILE_V1,
    SURFACE_EFFECTIVE_WINDOW_SIZE,
    SURFACE_FIELD_CORE_SIZE,
    SURFACE_FIELD_GUTTER_TEXELS,
    SURFACE_FIELD_TEXEL_COUNT,
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_INFLUENCE_RADIUS_TILES,
    SURFACE_LATTICE_TEST_VECTORS,
    SURFACE_RENDER_CHUNK_SIZE,
    surfaceHydrologyRegionRequirements,
    surfaceLatticeIndex,
    surfaceLatticeTexelLocalCoordinate,
    surfacePointOwnerRenderChunk,
    surfaceSemanticChunkRequirements,
    surfaceToWorld,
    worldToSurface,
    WorldDescriptorV2,
    WORLD_SEMANTIC_CHUNK_SIZE,
    WORLD_SEMANTIC_CHUNK_TILE_COUNT
} from "../../src/index";

function validAxisBounds(
    descriptor: WorldDescriptorV2,
    origin: number,
    size: number,
    axis: "x" | "y"
): readonly [number, number] {
    if (descriptor.topology === "toroidal") {
        const dimension = axis === "x" ? descriptor.width : descriptor.height;
        return [0, Math.min(size, dimension - origin)];
    }
    const valid: number[] = [];
    for (let local = 0; local < size; local += 1) {
        const coordinate = origin + local;
        if (Number.isSafeInteger(coordinate)
            && (descriptor.topology !== "bounded"
                || coordinate >= 0 && coordinate < (axis === "x" ? descriptor.width : descriptor.height))) {
            valid.push(local);
        }
    }
    return [valid[0], valid[valid.length - 1] + 1];
}

function semanticChunk(
    descriptor: WorldDescriptorV2,
    key: Readonly<{ chunkX: number; chunkY: number }>,
    height: (x: number, y: number) => number
): BaseSemanticChunk {
    const originX = key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    const originY = key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
    const [minX, maxXExclusive] = validAxisBounds(
        descriptor,
        originX,
        WORLD_SEMANTIC_CHUNK_SIZE,
        "x"
    );
    const [minY, maxYExclusive] = validAxisBounds(
        descriptor,
        originY,
        WORLD_SEMANTIC_CHUNK_SIZE,
        "y"
    );
    const substrateClass = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const macroHeight = new Uint16Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const biomeWeights = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 4);
    const climate = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const vegetationProfile = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    for (let localX = minX; localX < maxXExclusive; localX += 1) {
        for (let localY = minY; localY < maxYExclusive; localY += 1) {
            const index = semanticChunkLocalIndex(localX, localY);
            substrateClass[index] = SubstrateClass.Soil;
            macroHeight[index] = height(originX + localX, originY + localY);
            biomeWeights[index * 4] = 255;
            climate[index * 2] = 128;
            climate[index * 2 + 1] = 160;
        }
    }
    return Object.freeze({
        key: Object.freeze({ ...key }),
        revision: BASE_SEMANTIC_CHUNK_REVISION,
        validBounds: Object.freeze({ minX, minY, maxXExclusive, maxYExclusive }),
        substrateClass,
        macroHeight,
        biomeWeights,
        climate,
        vegetationDensity,
        vegetationProfile
    });
}

function hydrologyRegion(
    descriptor: WorldDescriptorV2,
    key: Readonly<{ regionX: number; regionY: number }>
): HydrologyRegion {
    const originX = key.regionX * 128;
    const originY = key.regionY * 128;
    const [minX, maxXExclusive] = validAxisBounds(descriptor, originX, 128, "x");
    const [minY, maxYExclusive] = validAxisBounds(descriptor, originY, 128, "y");
    return Object.freeze({
        key: Object.freeze({ ...key }),
        revision: HYDROLOGY_REGION_REVISION,
        validBounds: descriptor.topology === "infinite"
            && minX === 0 && minY === 0 && maxXExclusive === 128 && maxYExclusive === 128
            ? FULL_HYDROLOGY_REGION_BOUNDS
            : Object.freeze({ minX, minY, maxXExclusive, maxYExclusive }),
        boundaryPorts: Object.freeze([]),
        rivers: Object.freeze([]),
        lakes: Object.freeze([]),
        mouths: Object.freeze([]),
        bodies: Object.freeze([Object.freeze({
            bodyId: OCEAN_BODY_ID,
            kind: "ocean" as const,
            profileIndex: 0
        })])
    });
}

function captureFor(
    descriptor: WorldDescriptorV2,
    key: RenderChunkKey,
    height: (x: number, y: number) => number,
    delta?: EffectiveDeltaSnapshot
) {
    const semantic = surfaceSemanticChunkRequirements(descriptor, key)
        .map(chunkKey => semanticChunk(descriptor, chunkKey, height));
    const hydrology = surfaceHydrologyRegionRequirements(descriptor, key)
        .map(regionKey => hydrologyRegion(descriptor, regionKey));
    const snapshot = new EffectiveWorldView(descriptor, delta).capture({
        semanticChunks: semantic,
        hydrologyRegions: hydrology
    });
    return { semantic, hydrology, snapshot };
}

function compileFlat(
    height: number,
    deltaFactory?: (descriptor: WorldDescriptorV2) => EffectiveDeltaSnapshot
) {
    const descriptor = createWorldDescriptorV2({ seed: `surface-flat-${height}` });
    const key = { chunkX: 4, chunkY: 4 };
    const capture = captureFor(descriptor, key, () => height, deltaFactory?.(descriptor));
    const window = createTransferableEffectiveWindow(capture.snapshot, key);
    return { descriptor, key, window, chunk: compileSurfaceChunk(window), ...capture };
}

function riverLayer(descriptor: WorldDescriptorV2, includeFarLake = false): EffectiveDeltaSnapshot {
    const riverId = createStableHydrologyId("river", ["surface-compiler"]);
    const river: HydrologyFeatureDelta = {
        kind: "river",
        featureId: riverId,
        revision: 1,
        source: { kind: "source" },
        outlet: { kind: "body", featureId: OCEAN_BODY_ID },
        controlPoints: new Float64Array([62, 72, 82, 72]),
        widthProfile: new Uint8Array([32, 32]),
        levelProfile: new Uint16Array([45_000, 44_000]),
        dischargeClass: 4
    };
    const features: HydrologyFeatureDelta[] = [river];
    if (includeFarLake) {
        features.push({
            kind: "lake",
            featureId: createStableHydrologyId("lake", ["surface-unrelated"]),
            revision: 1,
            boundaryPoints: new Float64Array([108, 108, 116, 108, 112, 116]),
            level: 40_000,
            profileIndex: 2
        });
    }
    return createEffectiveDeltaSnapshot({
        descriptor,
        effectiveRevision: 1,
        hydrologyFeatures: features,
        hydrologyRegionFeatures: [{
            key: { regionX: 0, regionY: 0 },
            featureIds: features.map(feature => feature.featureId)
        }]
    });
}

describe("CPU surface compiler v1", () => {
    test("freezes the complete compile profile and binary16 contract", () => {
        expect(SURFACE_COMPILE_PROFILE_V1).toEqual({
            renderChunkSize: 16,
            samplesPerTileInterval: 4,
            gutterTexels: 1,
            influenceRadiusTiles: 2,
            textureLayerSize: 66
        });
        expect(SURFACE_FIELD_CORE_SIZE).toBe(64);
        expect(SURFACE_FIELD_TEXTURE_SIZE).toBe(66);
        expect(SURFACE_FIELD_GUTTER_TEXELS).toBe(1);
        expect(SURFACE_EFFECTIVE_WINDOW_SIZE).toBe(20);
        expect(encodeFloat16(0)).toBe(0x0000);
        expect(encodeFloat16(-0)).toBe(0x8000);
        expect(encodeFloat16(1)).toBe(0x3c00);
        expect(encodeFloat16(-2)).toBe(0xc000);
        expect(encodeFloat16(65504)).toBe(0x7bff);
        expect(decodeFloat16(0x0001)).toBe(2 ** -24);
        expect(decodeFloat16(0x7c00)).toBe(Number.POSITIVE_INFINITY);
        expect(Number.isNaN(decodeFloat16(0x7e00))).toBe(true);
    });

    test("keeps positive, negative and adjacent-chunk lattice vectors globally phased", () => {
        for (const vector of SURFACE_LATTICE_TEST_VECTORS) {
            const world = surfaceToWorld(vector.u, vector.v);
            expect(world.x).toBeCloseTo(vector.x, 12);
            expect(world.z).toBeCloseTo(vector.z, 12);
            expect(worldToSurface(world.x, world.z)).toEqual({ u: vector.u, v: vector.v });
        }
        const lastCore = surfaceLatticeTexelLocalCoordinate(64, 8);
        const eastGutter = surfaceLatticeTexelLocalCoordinate(65, 8);
        const nextWestGutter = surfaceLatticeTexelLocalCoordinate(0, 8);
        const nextFirstCore = surfaceLatticeTexelLocalCoordinate(1, 8);
        expect(lastCore.u).toBe(nextWestGutter.u + SURFACE_RENDER_CHUNK_SIZE);
        expect(eastGutter.u).toBe(nextFirstCore.u + SURFACE_RENDER_CHUNK_SIZE);
        expect(surfacePointOwnerRenderChunk(-0.5, -0.5)).toEqual({ chunkX: 0, chunkY: 0 });
        expect(surfacePointOwnerRenderChunk(-0.500_001, -0.500_001))
            .toEqual({ chunkX: -1, chunkY: -1 });
    });

    test("builds an exact independently transferable effective window", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-window" });
        const key = { chunkX: 4, chunkY: 4 };
        const capture = captureFor(descriptor, key, () => 40_000);
        const window = createTransferableEffectiveWindow(capture.snapshot, key);
        expect(window.substrateClass).toHaveLength(20 * 20);
        expect(window.macroHeight).toHaveLength(20 * 20);
        expect(window.biomeWeights).toHaveLength(20 * 20 * 4);
        expect(window.macroHeight.buffer).not.toBe(capture.semantic[0].macroHeight.buffer);
        const authorityLength = capture.semantic[0].macroHeight.length;
        const transferables = effectiveSurfaceWindowTransferables(window);
        expect(new Set(transferables).size).toBe(transferables.length);
        const transferred = structuredClone(window, { transfer: [...transferables] });
        expect(transferred.macroHeight).toHaveLength(20 * 20);
        expect(window.macroHeight.byteLength).toBe(0);
        expect(capture.semantic[0].macroHeight).toHaveLength(authorityLength);
    });

    test("rejects incomplete or oversized snapshot dependency sets", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-window-dependencies" });
        const key = { chunkX: 4, chunkY: 4 };
        const capture = captureFor(descriptor, key, () => 40_000);
        const view = new EffectiveWorldView(descriptor);
        const incomplete = view.capture({
            semanticChunks: capture.semantic.slice(1),
            hydrologyRegions: capture.hydrology
        });
        expect(() => createTransferableEffectiveWindow(incomplete, key)).toThrow(/exact semantic/);
        const extra = semanticChunk(descriptor, { chunkX: 8, chunkY: 8 }, () => 40_000);
        const oversized = view.capture({
            semanticChunks: [...capture.semantic, extra],
            hydrologyRegions: capture.hydrology
        });
        expect(() => createTransferableEffectiveWindow(oversized, key)).toThrow(/exact semantic/);
    });

    test("compiles a dry field with canonical layout, material weights and query interpolation", () => {
        const { chunk } = compileFlat(60_000);
        expect(() => assertCompiledSurfaceChunk(chunk)).not.toThrow();
        expect(chunk.field.groundHeight).toHaveLength(SURFACE_FIELD_TEXEL_COUNT);
        expect(chunk.byteLength).toBe(SURFACE_FIELD_TEXEL_COUNT * 18);
        expect(new Set(chunk.field.waterCoverage)).toEqual(new Set([0]));
        expect(chunk.waterBodies).toEqual([]);
        expect(decodeFloat16(chunk.field.shorelineDistance[0])).toBeGreaterThan(0);
        for (let index = 0; index < SURFACE_FIELD_TEXEL_COUNT; index += 1) {
            const offset = index * 4;
            expect(chunk.field.materialWeights[offset] + chunk.field.materialWeights[offset + 1]
                + chunk.field.materialWeights[offset + 2] + chunk.field.materialWeights[offset + 3]).toBe(255);
        }
        const sample = sampleCompiledSurfaceChunk(chunk, 8, 8);
        expect(sample.groundHeight).toBeCloseTo(60_000 / 65535, 3);
        expect(sample.waterKind).toBe(HydrologyWaterKind.None);
        expect(sample.materialWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
    });

    test("compiles ocean level, depth, negative shore distance and reserved body identity", () => {
        const { chunk } = compileFlat(0);
        expect(new Set(chunk.field.waterCoverage)).toEqual(new Set([255]));
        expect(new Set(chunk.field.waterKind)).toEqual(new Set([HydrologyWaterKind.Ocean]));
        expect(chunk.waterBodies).toEqual([{
            bodyId: OCEAN_BODY_ID,
            kind: "ocean"
        }]);
        expect(decodeFloat16(chunk.field.shorelineDistance[0])).toBeLessThan(0);
        const sample = sampleCompiledSurfaceChunk(chunk, 8, 8);
        expect(sample.waterCoverage).toBe(1);
        expect(sample.waterDepth).toBeGreaterThan(0);
        expect(sample.waterBody?.bodyId).toBe(OCEAN_BODY_ID);
    });

    test("rasterizes an edited river and excludes unrelated same-region feature revisions", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-river" });
        const key = { chunkX: 4, chunkY: 4 };
        const capture = captureFor(descriptor, key, () => 32_000, riverLayer(descriptor, true));
        const window = createTransferableEffectiveWindow(capture.snapshot, key);
        const dependencyIds = window.dependencyKey.hydrologyRegions
            .flatMap(region => region.features.map(feature => feature.featureId));
        expect(dependencyIds).toEqual([createStableHydrologyId("river", ["surface-compiler"])]);
        const chunk = compileSurfaceChunk(window);
        const sample = sampleCompiledSurfaceChunk(chunk, 8, 8);
        expect(sample.waterKind).toBe(HydrologyWaterKind.River);
        expect(sample.waterCoverage).toBeGreaterThan(0.9);
        expect(sample.waterBody?.kind).toBe("river");
        expect(sample.flow[0]).toBeGreaterThan(0.99);
        expect(Math.abs(sample.flow[1])).toBeLessThan(0.01);
        expect(chunk.field.shorelineDistance.some(bits => decodeFloat16(bits) < 0)).toBe(true);
        expect(chunk.field.shorelineDistance.some(bits => decodeFloat16(bits) > 0)).toBe(true);
    });

    test("rasterizes an edited lake without deleting its continuous ground", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-lake" });
        const lakeId = createStableHydrologyId("lake", ["surface-compiler"]);
        const layer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            hydrologyFeatures: [{
                kind: "lake",
                featureId: lakeId,
                revision: 1,
                boundaryPoints: new Float64Array([68, 68, 76, 68, 76, 76, 68, 76]),
                level: 45_000,
                profileIndex: 3
            }],
            hydrologyRegionFeatures: [{ key: { regionX: 0, regionY: 0 }, featureIds: [lakeId] }]
        });
        const capture = captureFor(descriptor, { chunkX: 4, chunkY: 4 }, () => 32_000, layer);
        const chunk = compileSurfaceChunk(createTransferableEffectiveWindow(
            capture.snapshot,
            { chunkX: 4, chunkY: 4 }
        ));
        const wet = sampleCompiledSurfaceChunk(chunk, 8, 8);
        const dry = sampleCompiledSurfaceChunk(chunk, 15, 15);
        expect(wet.waterKind).toBe(HydrologyWaterKind.Lake);
        expect(wet.waterBody).toMatchObject({ bodyId: lakeId, kind: "lake" });
        expect(wet.waterProfile).toBe(3);
        expect(wet.groundHeight).toBeCloseTo(dry.groundHeight, 4);
        expect(wet.waterDepth).toBeGreaterThan(0);
        expect(dry.waterCoverage).toBe(0);
    });

    test("is byte deterministic and queries exact lattice texel centers", () => {
        const first = compileFlat(48_000).chunk;
        const second = compileFlat(48_000).chunk;
        expect(second.contentChecksum).toBe(first.contentChecksum);
        expect(second.field.groundHeight).toEqual(first.field.groundHeight);
        expect(second.field.materialWeights).toEqual(first.field.materialWeights);
        const physicalX = 20;
        const physicalY = 30;
        const local = surfaceLatticeTexelLocalCoordinate(physicalX, physicalY);
        const sample = sampleCompiledSurfaceChunk(first, local.u, local.v);
        const index = surfaceLatticeIndex(physicalX, physicalY);
        expect(sample.groundHeight).toBe(decodeFloat16(first.field.groundHeight[index]));
        expect(sample.shorelineDistance).toBe(decodeFloat16(first.field.shorelineDistance[index]));
    });

    test("produces byte-identical overlapping texels on adjacent render chunks", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-adjacent" });
        const height = (x: number) => 45_000 + x * 10;
        const westCapture = captureFor(descriptor, { chunkX: 4, chunkY: 4 }, height);
        const eastCapture = captureFor(descriptor, { chunkX: 5, chunkY: 4 }, height);
        const west = compileSurfaceChunk(createTransferableEffectiveWindow(
            westCapture.snapshot,
            { chunkX: 4, chunkY: 4 }
        ));
        const east = compileSurfaceChunk(createTransferableEffectiveWindow(
            eastCapture.snapshot,
            { chunkX: 5, chunkY: 4 }
        ));
        for (let y = 0; y < SURFACE_FIELD_TEXTURE_SIZE; y += 1) {
            for (const [westX, eastX] of [[64, 0], [65, 1]] as const) {
                const westIndex = surfaceLatticeIndex(westX, y);
                const eastIndex = surfaceLatticeIndex(eastX, y);
                expect(west.field.groundHeight[westIndex]).toBe(east.field.groundHeight[eastIndex]);
                expect(west.field.shorelineDistance[westIndex]).toBe(east.field.shorelineDistance[eastIndex]);
                expect(west.field.waterCoverage[westIndex]).toBe(east.field.waterCoverage[eastIndex]);
                expect(west.field.materialWeights.slice(westIndex * 4, westIndex * 4 + 4))
                    .toEqual(east.field.materialWeights.slice(eastIndex * 4, eastIndex * 4 + 4));
            }
        }
    });

    test("uses the two-tile working halo for an off-chunk shoreline", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-shore-halo" });
        const lakeId = createStableHydrologyId("lake", ["surface-shore-halo"]);
        const layer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            hydrologyFeatures: [{
                kind: "lake",
                featureId: lakeId,
                revision: 1,
                boundaryPoints: new Float64Array([80.5, 70, 84, 70, 84, 74, 80.5, 74]),
                level: 45_000,
                profileIndex: 1
            }],
            hydrologyRegionFeatures: [{ key: { regionX: 0, regionY: 0 }, featureIds: [lakeId] }]
        });
        const westCapture = captureFor(descriptor, { chunkX: 4, chunkY: 4 }, () => 32_000, layer);
        const eastCapture = captureFor(descriptor, { chunkX: 5, chunkY: 4 }, () => 32_000, layer);
        const westWindow = createTransferableEffectiveWindow(westCapture.snapshot, { chunkX: 4, chunkY: 4 });
        expect(westWindow.dependencyKey.hydrologyRegions[0].features.map(feature => feature.featureId))
            .toEqual([lakeId]);
        const west = compileSurfaceChunk(westWindow);
        const east = compileSurfaceChunk(createTransferableEffectiveWindow(
            eastCapture.snapshot,
            { chunkX: 5, chunkY: 4 }
        ));
        expect(new Set(west.field.waterCoverage)).toEqual(new Set([0]));
        const nearShore = decodeFloat16(west.field.shorelineDistance[surfaceLatticeIndex(65, 34)]);
        expect(nearShore).toBeGreaterThan(0);
        expect(nearShore).toBeLessThan(SURFACE_INFLUENCE_RADIUS_TILES);
        for (let y = 0; y < SURFACE_FIELD_TEXTURE_SIZE; y += 1) {
            expect(west.field.shorelineDistance[surfaceLatticeIndex(64, y)])
                .toBe(east.field.shorelineDistance[surfaceLatticeIndex(0, y)]);
            expect(west.field.shorelineDistance[surfaceLatticeIndex(65, y)])
                .toBe(east.field.shorelineDistance[surfaceLatticeIndex(1, y)]);
        }
    });

    test("applies sparse height authority before continuous interpolation and ocean derivation", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-height-delta" });
        const key = { chunkX: 4, chunkY: 4 };
        const base = captureFor(descriptor, key, () => 50_000);
        const editedLayer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            semanticDeltas: [createSparseSemanticDelta({
                key: { chunkX: 2, chunkY: 2 },
                revision: 1,
                overrides: [{ localX: 8, localY: 8, macroHeight: 10_000 }]
            })]
        });
        const edited = captureFor(descriptor, key, () => 50_000, editedLayer);
        const baseChunk = compileSurfaceChunk(createTransferableEffectiveWindow(base.snapshot, key));
        const editedChunk = compileSurfaceChunk(createTransferableEffectiveWindow(edited.snapshot, key));
        const baseSample = sampleCompiledSurfaceChunk(baseChunk, 8, 8);
        const editedSample = sampleCompiledSurfaceChunk(editedChunk, 8, 8);
        expect(editedSample.groundHeight).toBeLessThan(baseSample.groundHeight * 0.4);
        expect(editedSample.waterKind).toBe(HydrologyWaterKind.Ocean);
        expect(editedChunk.dependencyKey.semanticChunks.some(dependency => dependency.deltaRevision === 1))
            .toBe(true);
    });

    test("unwraps edited rivers continuously across a toroidal seam", () => {
        const descriptor = createWorldDescriptorV2({
            seed: "surface-torus-river",
            topology: { kind: "toroidal", width: 64, height: 64 }
        });
        const riverId = createStableHydrologyId("river", ["surface-torus-seam"]);
        const layer = createEffectiveDeltaSnapshot({
            descriptor,
            effectiveRevision: 1,
            hydrologyFeatures: [{
                kind: "river",
                featureId: riverId,
                revision: 1,
                source: { kind: "source" },
                outlet: { kind: "body", featureId: OCEAN_BODY_ID },
                controlPoints: new Float64Array([60, 56, 4, 56]),
                widthProfile: new Uint8Array([32, 32]),
                levelProfile: new Uint16Array([45_000, 44_000]),
                dischargeClass: 4
            }],
            hydrologyRegionFeatures: [{ key: { regionX: 0, regionY: 0 }, featureIds: [riverId] }]
        });
        const west = captureFor(descriptor, { chunkX: 3, chunkY: 3 }, () => 32_000, layer);
        const east = captureFor(descriptor, { chunkX: 0, chunkY: 3 }, () => 32_000, layer);
        const westChunk = compileSurfaceChunk(createTransferableEffectiveWindow(
            west.snapshot,
            { chunkX: 3, chunkY: 3 }
        ));
        const eastChunk = compileSurfaceChunk(createTransferableEffectiveWindow(
            east.snapshot,
            { chunkX: 0, chunkY: 3 }
        ));
        const westSample = sampleCompiledSurfaceChunk(westChunk, 15, 8);
        const eastSample = sampleCompiledSurfaceChunk(eastChunk, 0, 8);
        expect(westSample.waterBody?.bodyId).toBe(riverId);
        expect(eastSample.waterBody?.bodyId).toBe(riverId);
        expect(westSample.flow[0]).toBeGreaterThan(0.99);
        expect(eastSample.flow[0]).toBeGreaterThan(0.99);
    });

    test("rejects corrupted window semantics and compiled payloads deterministically", () => {
        const result = compileFlat(50_000);
        const invalidWindow = structuredClone(result.window);
        invalidWindow.biomeWeights[0] = 0;
        expect(() => compileSurfaceChunk(invalidWindow)).toThrow(/semantic values/);
        const invalidChunk = structuredClone(result.chunk);
        invalidChunk.field.materialWeights[0] = 0;
        expect(() => assertCompiledSurfaceChunk(invalidChunk)).toThrow(/sum to 255/);
    });

    test("compiles real procedural semantic and cross-region hydrology authority", () => {
        const descriptor = createWorldDescriptorV2({ seed: "surface-real-authority" });
        const key = { chunkX: 7, chunkY: 4 };
        const semantic = surfaceSemanticChunkRequirements(descriptor, key)
            .map(chunkKey => generateBaseSemanticChunk({ descriptor, key: chunkKey }));
        const generator = new HydrologyRegionGenerator(descriptor);
        const hydrology = surfaceHydrologyRegionRequirements(descriptor, key)
            .map(regionKey => generator.generate(regionKey));
        const snapshot = new EffectiveWorldView(descriptor).capture({ semanticChunks: semantic, hydrologyRegions: hydrology });
        const chunk = compileSurfaceChunk(createTransferableEffectiveWindow(snapshot, key));
        expect(() => assertCompiledSurfaceChunk(chunk)).not.toThrow();
        expect(chunk.bounds.minGroundHeight).toBeLessThanOrEqual(chunk.bounds.maxGroundHeight);
        expect(chunk.field.materialWeights).toHaveLength(SURFACE_FIELD_TEXEL_COUNT * 4);
    });

    test("wraps toroidal windows and keeps the safe-integer minimum render chunk partial", () => {
        const toroidal = createWorldDescriptorV2({
            seed: "surface-torus",
            topology: { kind: "toroidal", width: 64, height: 64 }
        });
        const alias = { chunkX: -1, chunkY: -1 };
        const canonical = canonicalizeRenderChunkKey(toroidal, alias);
        const wrapped = captureFor(toroidal, alias, () => 50_000);
        const window = createTransferableEffectiveWindow(wrapped.snapshot, alias);
        expect(window.key).toEqual(canonical);
        expect(window.validBounds).toEqual({ minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 });

        const infinite = createWorldDescriptorV2({ seed: "surface-safe-min" });
        const minimumKey = {
            chunkX: Math.floor(Number.MIN_SAFE_INTEGER / SURFACE_RENDER_CHUNK_SIZE),
            chunkY: 4
        };
        const partial = captureFor(infinite, minimumKey, () => 50_000);
        const partialChunk = compileSurfaceChunk(createTransferableEffectiveWindow(partial.snapshot, minimumKey));
        expect(partialChunk.bounds.validTiles.minX).toBe(1);
        expect(() => sampleCompiledSurfaceChunk(partialChunk, 0, 8)).toThrow(/valid domain/);
        expect(sampleCompiledSurfaceChunk(partialChunk, 1, 8).groundHeight).toBeGreaterThan(0);
    });
});
