import { describe, expect, test } from "vitest";
import {
    ByteType,
    HalfFloatType,
    NearestFilter,
    RGBAFormat,
    RGFormat,
    RGBFormat,
    UnsignedByteType
} from "three";

import {
    SURFACE_FIELD_TEXEL_COUNT,
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_TEXTURE_PAGE_LAYERS
} from "../../src/world/semantic/SurfaceCompileProfile";
import {
    compileSurfaceChunk,
    CompiledSurfaceChunk
} from "../../src/world/semantic/SurfaceCompiler";
import type { TransferableEffectiveWindow } from "../../src/world/semantic/EffectiveSurfaceWindow";
import type { RenderChunkKey } from "../../src/world/semantic/SurfaceDependency";
import {
    SURFACE_FLOW_TEXTURE_CHANNELS,
    SURFACE_GPU_LAYER_BYTES,
    SURFACE_GPU_PAGE_BYTES,
    SURFACE_MATERIAL_TEXTURE_CHANNELS,
    SURFACE_VALUES_TEXTURE_CHANNELS,
    SURFACE_WATER_TEXTURE_CHANNELS,
    SurfaceTexturePool
} from "../../src/rendering/SurfaceTexturePool";
import type { SurfaceTexturePoolOptions } from "../../src/rendering/SurfaceTexturePool";

function compiledFlatChunk(key: RenderChunkKey, height = 50_000): CompiledSurfaceChunk {
    const size = 20;
    const count = size * size;
    const biomeWeights = new Uint8Array(count * 4);
    for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
    const window: TransferableEffectiveWindow = {
        worldIdentity: "surface-texture-pool-test",
        effectiveRevision: 0,
        key: Object.freeze({ ...key }),
        dependencyKey: Object.freeze({
            worldIdentity: "surface-texture-pool-test",
            renderKey: Object.freeze({ ...key }),
            compilerRevision: 1,
            compileProfileVersion: 1,
            semanticChunks: Object.freeze([]),
            hydrologyRegions: Object.freeze([])
        }),
        validBounds: Object.freeze({ minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 }),
        substrateClass: new Uint8Array(count).fill(1),
        macroHeight: new Uint16Array(count).fill(height),
        biomeWeights,
        climate: new Uint8Array(count * 2).fill(127),
        vegetationDensity: new Uint8Array(count),
        vegetationProfile: new Uint8Array(count),
        rivers: Object.freeze([]),
        lakes: Object.freeze([])
    };
    return compileSurfaceChunk(window);
}

function textureOffset(layer: number, x: number, y: number, channels: number): number {
    return (layer * SURFACE_FIELD_TEXEL_COUNT + y * SURFACE_FIELD_TEXTURE_SIZE + x) * channels;
}

describe("v2 GPU surface texture pool", () => {
    test("packs the X-major compiled field into four fixed row-major array textures", () => {
        const pool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const chunk = compiledFlatChunk({ chunkX: -3, chunkY: 5 });
        const slot = pool.allocate(chunk.key);
        expect(pool.upload(slot, chunk)).toBe(true);
        const binding = pool.getBinding(slot);
        const textures = [
            binding.valuesTexture,
            binding.materialTexture,
            binding.flowTexture,
            binding.waterTexture
        ];
        expect(textures.map(texture => [
            texture.image.width,
            texture.image.height,
            texture.image.depth,
            texture.minFilter,
            texture.magFilter,
            texture.generateMipmaps,
            texture.flipY,
            texture.unpackAlignment
        ])).toEqual(Array.from({ length: 4 }, () => [
            66, 66, 128, NearestFilter, NearestFilter, false, false, 1
        ]));
        expect(textures.map(texture => [texture.internalFormat, texture.format, texture.type])).toEqual([
            ["RGBA16F", RGBAFormat, HalfFloatType],
            ["RGBA8", RGBAFormat, UnsignedByteType],
            ["RG8_SNORM", RGFormat, ByteType],
            ["RGB8", RGBFormat, UnsignedByteType]
        ]);

        const x = 7;
        const y = 19;
        const source = x * SURFACE_FIELD_TEXTURE_SIZE + y;
        const values = binding.valuesTexture.image.data as Uint16Array;
        const material = binding.materialTexture.image.data as Uint8Array;
        const flow = binding.flowTexture.image.data as Int8Array;
        const water = binding.waterTexture.image.data as Uint8Array;
        const valuesOffset = textureOffset(slot.layerIndex, x, y, SURFACE_VALUES_TEXTURE_CHANNELS);
        expect([...values.subarray(valuesOffset, valuesOffset + 4)]).toEqual([
            chunk.field.groundHeight[source],
            chunk.field.waterLevel[source],
            chunk.field.waterDepth[source],
            chunk.field.shorelineDistance[source]
        ]);
        const materialOffset = textureOffset(slot.layerIndex, x, y, SURFACE_MATERIAL_TEXTURE_CHANNELS);
        expect([...material.subarray(materialOffset, materialOffset + 4)])
            .toEqual([...chunk.field.materialWeights.subarray(source * 4, source * 4 + 4)]);
        const flowOffset = textureOffset(slot.layerIndex, x, y, SURFACE_FLOW_TEXTURE_CHANNELS);
        expect([...flow.subarray(flowOffset, flowOffset + 2)])
            .toEqual([...chunk.field.flow.subarray(source * 2, source * 2 + 2)]);
        const waterOffset = textureOffset(slot.layerIndex, x, y, SURFACE_WATER_TEXTURE_CHANNELS);
        expect([...water.subarray(waterOffset, waterOffset + 3)]).toEqual([
            chunk.field.waterCoverage[source],
            chunk.field.waterKind[source],
            chunk.field.waterProfile[source]
        ]);
        expect(textures.every(texture => texture.layerUpdates.has(slot.layerIndex))).toBe(true);
        expect(pool.stats).toMatchObject({
            pageCount: 1,
            textureCount: 4,
            allocatedSlots: 1,
            uploadedSlots: 1,
            cpuBytes: SURFACE_GPU_PAGE_BYTES,
            gpuBytes: SURFACE_GPU_PAGE_BYTES,
            pendingLayerUploads: 1,
            pendingUploadBytes: SURFACE_GPU_LAYER_BYTES,
            logicalUploadBytes: SURFACE_GPU_LAYER_BYTES
        });
        expect(values.byteLength + material.byteLength + flow.byteLength + water.byteLength)
            .toBe(SURFACE_GPU_PAGE_BYTES);
        pool.dispose();
    });

    test("invalidates released handles and rejects late uploads after slot reuse", () => {
        const pool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const firstChunk = compiledFlatChunk({ chunkX: 1, chunkY: 2 });
        const first = pool.allocate(firstChunk.key);
        expect(() => pool.allocate(firstChunk.key)).toThrow(/already owns/);
        expect(pool.upload(first, firstChunk)).toBe(true);
        expect(pool.release(first)).toBe(true);
        expect(pool.isCurrent(first)).toBe(false);
        expect(pool.upload(first, firstChunk)).toBe(false);
        expect(pool.release(first)).toBe(false);

        const secondChunk = compiledFlatChunk({ chunkX: 2, chunkY: 2 });
        const second = pool.allocate(secondChunk.key);
        expect(second).toMatchObject({
            poolId: first.poolId,
            pageIndex: first.pageIndex,
            layerIndex: first.layerIndex,
            generation: first.generation + 1
        });
        expect(() => pool.getBinding(second)).toThrow(/has not received/);
        expect(pool.upload(second, secondChunk)).toBe(true);
        expect(() => pool.getBinding(first)).toThrow(/stale/);

        const foreignPool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        expect(foreignPool.isCurrent(second)).toBe(false);
        expect(foreignPool.release(second)).toBe(false);
        expect(pool.stats).toMatchObject({ staleUploadRejects: 1, staleReleaseRejects: 1 });
        foreignPool.dispose();
        pool.dispose();
    });

    test("enforces the whole-page GPU byte budget without allocating fallback storage", () => {
        const mutableOptions = { gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES };
        const copiedBudget = new SurfaceTexturePool(mutableOptions);
        mutableOptions.gpuBudgetBytes = 0;
        expect(copiedBudget.allocate({ chunkX: -1, chunkY: 0 })).toMatchObject({ pageIndex: 0 });
        copiedBudget.dispose();
        expect(() => new SurfaceTexturePool({ gpuBudgetBytes: -1 })).toThrow(/non-negative safe integer/);
        expect(() => new SurfaceTexturePool({ gpuBudgetBytes: 1.5 })).toThrow(/non-negative safe integer/);
        expect(() => new SurfaceTexturePool({
            gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES,
            extra: true
        } as SurfaceTexturePoolOptions)).toThrow(/options are invalid/);

        const empty = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES - 1 });
        expect(() => empty.allocate({ chunkX: 0, chunkY: 0 })).toThrow(/budget is exhausted/);
        expect(empty.stats).toMatchObject({ pageCount: 0, capacitySlots: 0, gpuBytes: 0 });
        empty.dispose();

        const pool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const handles = Array.from({ length: SURFACE_TEXTURE_PAGE_LAYERS }, (_, index) =>
            pool.allocate({ chunkX: index, chunkY: 0 }));
        expect(new Set(handles.map(handle => handle.layerIndex)).size).toBe(SURFACE_TEXTURE_PAGE_LAYERS);
        expect(() => pool.allocate({ chunkX: SURFACE_TEXTURE_PAGE_LAYERS, chunkY: 0 }))
            .toThrow(/budget is exhausted/);
        expect(pool.stats).toMatchObject({
            pageCount: 1,
            capacitySlots: SURFACE_TEXTURE_PAGE_LAYERS,
            reusableSlots: 0,
            allocatedSlots: SURFACE_TEXTURE_PAGE_LAYERS,
            gpuBudgetRemainingBytes: 0
        });
        pool.clear();
        expect(pool.stats).toMatchObject({ allocatedSlots: 0, reusableSlots: SURFACE_TEXTURE_PAGE_LAYERS });
        pool.dispose();
    });

    test("reuploads only active initialized layers after context restoration", () => {
        const pool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const firstChunk = compiledFlatChunk({ chunkX: 4, chunkY: 6 });
        const secondChunk = compiledFlatChunk({ chunkX: 5, chunkY: 6 });
        const first = pool.allocate(firstChunk.key);
        const second = pool.allocate(secondChunk.key);
        pool.upload(first, firstChunk);
        pool.upload(second, secondChunk);
        const firstBinding = pool.getBinding(first);
        const textures = [
            firstBinding.valuesTexture,
            firstBinding.materialTexture,
            firstBinding.flowTexture,
            firstBinding.waterTexture
        ];
        for (const texture of textures) texture.clearLayerUpdates();

        pool.handleContextLost();
        expect(pool.state).toBe("lost");
        expect(() => pool.allocate({ chunkX: 6, chunkY: 6 })).toThrow(/context is lost/);
        expect(() => pool.upload(first, firstChunk)).toThrow(/context is lost/);
        expect(() => pool.getBinding(first)).toThrow(/context is lost/);
        expect(pool.release(second)).toBe(true);
        pool.handleContextRestored();
        expect(pool.stats).toMatchObject({
            state: "ready",
            contextGeneration: 2,
            contextRestores: 1,
            allocatedSlots: 1,
            uploadedSlots: 1,
            pendingLayerUploads: 1
        });
        for (const texture of textures) {
            expect([...texture.layerUpdates]).toEqual([first.layerIndex]);
        }
        expect(() => pool.handleContextRestored()).toThrow(/only restore from the lost state/);
        pool.dispose();
        expect(pool.state).toBe("disposed");
        expect(pool.isCurrent(first)).toBe(false);
        expect(() => pool.allocate({ chunkX: 7, chunkY: 6 })).toThrow(/disposed/);
    });

    test("rejects a valid compiled chunk reserved for another render key", () => {
        const pool = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const slot = pool.allocate({ chunkX: 8, chunkY: 9 });
        expect(() => pool.upload(slot, compiledFlatChunk({ chunkX: 9, chunkY: 9 })))
            .toThrow(/does not match/);
        expect(pool.stats).toMatchObject({ allocatedSlots: 1, uploadedSlots: 0, logicalUploads: 0 });
        pool.dispose();
    });
});
