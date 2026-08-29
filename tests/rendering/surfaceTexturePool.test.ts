import { describe, expect, test } from "vitest";

import {
    COMPILED_SURFACE_TEXEL_COUNT,
    createCompiledSurfaceField
} from "../../src/world/CompiledSurfaceField";
import { finiteFloat16Bits } from "../../src/world/HalfFloat";
import { SURFACE_COMPILE_PROFILE } from "../../src/world/SurfaceCompileProfile";
import {
    SURFACE_TEXTURE_PAGE_GPU_BYTES,
    SurfaceTextureCapabilitySource,
    SurfaceTexturePool,
    readSurfaceArrayTextureCapabilities
} from "../../src/rendering/SurfaceTexturePool";

function capabilitySource(
    maxTextureSize = 4096,
    maxArrayTextureLayers = 256
): SurfaceTextureCapabilitySource {
    const MAX_TEXTURE_SIZE = 1;
    const MAX_ARRAY_TEXTURE_LAYERS = 2;
    return {
        MAX_TEXTURE_SIZE,
        MAX_ARRAY_TEXTURE_LAYERS,
        texStorage3D() { /* WebGL2 marker */ },
        getParameter(parameter: number): unknown {
            if (parameter === MAX_TEXTURE_SIZE) return maxTextureSize;
            if (parameter === MAX_ARRAY_TEXTURE_LAYERS) return maxArrayTextureLayers;
            throw new Error("unexpected test capability parameter");
        }
    };
}

function sampleField() {
    const groundHeight = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    groundHeight.fill(finiteFloat16Bits("test ground", 12));
    const materialWeights = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT * 4);
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    shorelineDistance.fill(finiteFloat16Bits("test shoreline", -2));
    const waterLevel = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    waterLevel.fill(finiteFloat16Bits("test water level", 20));
    const waterDepth = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    waterDepth.fill(finiteFloat16Bits("test water depth", 8));
    const waterCoverage = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    waterCoverage.fill(255);
    const waterKind = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    waterKind.fill(1);
    const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    waterBodyIndex.fill(1);
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        materialWeights[index * 4] = 255;
    }
    const markerX = 1;
    const markerY = 2;
    const marker = markerX * SURFACE_COMPILE_PROFILE.textureLayerSize + markerY;
    groundHeight[marker] = finiteFloat16Bits("test marked ground", 13);
    waterDepth[marker] = finiteFloat16Bits("test marked water depth", 7);
    shorelineDistance[marker] = finiteFloat16Bits("test marked shoreline", -1);
    materialWeights.set([0, 255, 0, 0], marker * 4);
    waterCoverage[marker] = 254;
    waterKind[marker] = 2;
    const waterProfile = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    waterProfile[marker] = 7;
    return createCompiledSurfaceField({
        groundHeight,
        materialWeights,
        waterLevel,
        waterDepth,
        shorelineDistance,
        flow: new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2),
        waterCoverage,
        waterKind,
        waterProfile,
        waterBodyIndex
    });
}

describe("SurfaceTexturePool", () => {
    test("requires the frozen WebGL2 layer and texture-size capabilities", () => {
        expect(readSurfaceArrayTextureCapabilities(capabilitySource())).toEqual({
            maxTextureSize: 4096,
            maxArrayTextureLayers: 256
        });
        expect(() => readSurfaceArrayTextureCapabilities(capabilitySource(65, 256)))
            .toThrow(/profile/);
        expect(() => readSurfaceArrayTextureCapabilities(capabilitySource(4096, 127)))
            .toThrow(/profile/);
        expect(() => readSurfaceArrayTextureCapabilities({
            ...capabilitySource(),
            texStorage3D: undefined
        })).toThrow(/WebGL2/);
    });

    test("packs one complete static layer and an independent fog layer", () => {
        const pool = new SurfaceTexturePool(capabilitySource(), { maximumPages: 1 });
        const handle = pool.allocate();
        const field = sampleField();
        expect(pool.uploadSurface(handle, field)).toBe(true);
        const fog = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
        const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
        const sourceMarker = 1 * size + 2;
        const webGlMarker = 2 * size + 1;
        fog[sourceMarker] = 173;
        expect(pool.uploadFog(handle, fog)).toBe(true);

        const bindings = pool.getPageBindings(handle.pageIndex);
        expect(bindings).toBeDefined();
        if (!bindings) throw new Error("test surface page bindings are missing");
        expect(bindings.elevation.internalFormat).toBe("RGBA16F");
        expect(bindings.material.internalFormat).toBe("RGBA8");
        expect(bindings.flow.internalFormat).toBe("RG8_SNORM");
        expect(bindings.water.internalFormat).toBe("RGBA8");
        expect(bindings.fog.internalFormat).toBe("R8");
        for (const texture of [
            bindings.elevation,
            bindings.material,
            bindings.flow,
            bindings.water,
            bindings.fog
        ]) {
            expect(texture.unpackAlignment).toBe(1);
            expect(texture.layerUpdates.has(handle.layerIndex)).toBe(true);
        }
        const elevation = bindings.elevation.image.data as Uint16Array;
        const material = bindings.material.image.data as Uint8Array;
        const water = bindings.water.image.data as Uint8Array;
        const packedFog = bindings.fog.image.data as Uint8Array;
        expect(elevation.slice(0, 4)).toEqual(new Uint16Array([
            field.groundHeight[0], field.waterLevel[0], field.waterDepth[0], field.shorelineDistance[0]
        ]));
        expect(material.slice(0, 4)).toEqual(new Uint8Array([255, 0, 0, 0]));
        expect(water.slice(0, 4)).toEqual(new Uint8Array([255, 1, 0, 0]));
        expect(elevation.slice(webGlMarker * 4, webGlMarker * 4 + 4)).toEqual(new Uint16Array([
            field.groundHeight[sourceMarker],
            field.waterLevel[sourceMarker],
            field.waterDepth[sourceMarker],
            field.shorelineDistance[sourceMarker]
        ]));
        expect(material.slice(webGlMarker * 4, webGlMarker * 4 + 4))
            .toEqual(new Uint8Array([0, 255, 0, 0]));
        expect(water.slice(webGlMarker * 4, webGlMarker * 4 + 4))
            .toEqual(new Uint8Array([254, 2, 7, 0]));
        expect(packedFog[webGlMarker]).toBe(173);
        expect(packedFog[sourceMarker]).toBe(0);
        expect(pool.stats).toMatchObject({
            allocatedPages: 1,
            residentSlots: 1,
            allocatedGpuBytes: SURFACE_TEXTURE_PAGE_GPU_BYTES,
            stagingBytes: SURFACE_TEXTURE_PAGE_GPU_BYTES
        });
        pool.dispose();
    });

    test("invalidates stale handles and disposes an empty page", () => {
        const pool = new SurfaceTexturePool(capabilitySource(), { maximumPages: 1 });
        const first = pool.allocate();
        expect(pool.release(first)).toBe(true);
        expect(pool.getPageBindings(first.pageIndex)).toBeUndefined();
        const second = pool.allocate();
        expect(second).toEqual({ pageIndex: 0, layerIndex: 0, generation: 2 });
        expect(pool.uploadSurface(first, sampleField())).toBe(false);
        expect(pool.release(first)).toBe(false);
        expect(pool.isCurrent(second)).toBe(true);
        pool.dispose();
        expect(pool.isCurrent(second)).toBe(false);
    });

    test("enforces its explicit page budget and restores only resident layers", () => {
        const pool = new SurfaceTexturePool(capabilitySource(), { maximumPages: 1 });
        const handles = Array.from(
            { length: SURFACE_COMPILE_PROFILE.pageLayers },
            () => pool.allocate()
        );
        expect(() => pool.allocate()).toThrow(/page budget/);
        const bindings = pool.getPageBindings(0);
        if (!bindings) throw new Error("test surface page bindings are missing");
        for (const texture of [
            bindings.elevation,
            bindings.material,
            bindings.flow,
            bindings.water,
            bindings.fog
        ]) texture.clearLayerUpdates();
        expect(pool.release(handles[3])).toBe(true);
        pool.restoreContext();
        expect(bindings.elevation.layerUpdates.size).toBe(SURFACE_COMPILE_PROFILE.pageLayers - 1);
        expect(bindings.elevation.layerUpdates.has(3)).toBe(false);
        expect(bindings.fog.layerUpdates.size).toBe(SURFACE_COMPILE_PROFILE.pageLayers - 1);
        pool.dispose();
    });
});
