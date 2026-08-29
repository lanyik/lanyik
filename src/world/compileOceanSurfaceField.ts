import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    SURFACE_WATER_KIND_OCEAN,
    createCompiledSurfaceField,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import {
    CompiledWaterBodyPalette,
    createCompiledWaterBodyPalette
} from "./CompiledWaterBodyPalette";
import { finiteFloat16Bits, float16BitsToFloat32 } from "./HalfFloat";
import { OCEAN_BODY_ID } from "./HydrologyIdentity";
import { SURFACE_COMPILE_PROFILE } from "./SurfaceCompileProfile";
import {
    quantizeSurfaceCoverage,
    surfaceContourDistances,
    surfaceHeightContours
} from "./SurfaceContours";
import {
    TransferableEffectiveWindow,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import { compileSemanticSurfaceField } from "./compileSemanticSurfaceField";

export interface OceanSurfaceCompilation {
    readonly field: CompiledSurfaceField;
    readonly waterBodies: CompiledWaterBodyPalette;
}


export function compileOceanSurfaceField(
    window: Readonly<TransferableEffectiveWindow>
): OceanSurfaceCompilation {
    assertTransferableEffectiveWindow(window);
    const semantic = compileSemanticSurfaceField(window);
    const groundHeight = semantic.groundHeight.slice();
    const materialWeights = semantic.materialWeights.slice();
    const waterLevel = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterDepth = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const flow = new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2);
    const waterCoverage = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterKind = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterProfile = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const hexSize = window.dependencyKey.metrics.hexSize;
    const heightScale = window.dependencyKey.metrics.heightScale;
    const seaWorldLevel = window.seaLevel / 0xffff * heightScale;
    const seaLevelBits = finiteFloat16Bits("compiled ocean level", seaWorldLevel);
    const quantizedSeaWorldLevel = float16BitsToFloat32(seaLevelBits);
    const saturation = SURFACE_COMPILE_PROFILE.influenceRadiusTiles * Math.sqrt(3) * hexSize;
    const antialiasRadius = 0.5 * Math.min(1.5 * hexSize, Math.sqrt(3) * hexSize)
        / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const contours = surfaceHeightContours(window, window.seaLevel, hexSize);
    const contourDistances = surfaceContourDistances(window, contours, hexSize, saturation);
    let hasOceanCoverage = false;
    for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX += 1) {
        for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY += 1) {
            const index = surfaceFieldTexelIndex(texelX, texelY);
            const ground = float16BitsToFloat32(groundHeight[index]);
            const wet = ground < quantizedSeaWorldLevel;
            const distance = contourDistances[index];
            const signedDistance = wet ? -distance : distance;
            shorelineDistance[index] = finiteFloat16Bits(
                "compiled ocean shoreline distance",
                Math.max(-saturation, Math.min(saturation, signedDistance))
            );
            const rawCoverage = quantizeSurfaceCoverage(signedDistance, antialiasRadius);
            const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
            if (coverage === 0) continue;
            hasOceanCoverage = true;
            waterCoverage[index] = coverage;
            waterKind[index] = SURFACE_WATER_KIND_OCEAN;
            waterBodyIndex[index] = 1;
            waterLevel[index] = seaLevelBits;
            waterDepth[index] = finiteFloat16Bits(
                "compiled ocean depth",
                Math.max(0, quantizedSeaWorldLevel - ground)
            );
        }
    }
    const field = createCompiledSurfaceField({
        groundHeight,
        materialWeights,
        waterLevel,
        waterDepth,
        shorelineDistance,
        flow,
        waterCoverage,
        waterKind,
        waterProfile,
        waterBodyIndex
    });
    return Object.freeze({
        field,
        waterBodies: createCompiledWaterBodyPalette(hasOceanCoverage
            ? [{ bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 }] : [])
    });
}
