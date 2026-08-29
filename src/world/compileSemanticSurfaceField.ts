import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    createCompiledSurfaceField,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import { finiteFloat16Bits } from "./HalfFloat";
import {
    EffectiveWindowSemanticSample,
    sampleEffectiveWindowSemantic
} from "./EffectiveWindowSampler";
import { SURFACE_COMPILE_PROFILE, surfaceInfluenceRadiusWorld } from "./SurfaceCompileProfile";
import { surfaceTexelCenterAxis } from "./SurfaceLattice";
import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";

interface MaterialScratch {
    readonly values: Float64Array;
    readonly quantized: Uint8Array;
    readonly fractions: Float64Array;
}

function quantizeMaterialWeights(
    materialWeights: Uint8Array,
    offset: number,
    sample: Readonly<EffectiveWindowSemanticSample>,
    valid: boolean,
    scratch: MaterialScratch
): void {
    if (!valid) {
        materialWeights[offset] = 255;
        return;
    }
    const values = scratch.values;
    values[0] = sample.biome0;
    values[1] = sample.biome1;
    values[2] = sample.biome2;
    values[3] = sample.biome3;
    const sum = values[0] + values[1] + values[2] + values[3];
    if (!Number.isFinite(sum) || sum <= 0) {
        throw new Error("effective semantic biome sample is not normalizable");
    }
    const quantized = scratch.quantized;
    const fractions = scratch.fractions;
    let assigned = 0;
    for (let index = 0; index < 4; index += 1) {
        const scaled = Math.max(0, values[index]) / sum * 255;
        quantized[index] = Math.floor(scaled);
        fractions[index] = scaled - quantized[index];
        assigned += quantized[index];
    }
    for (let unit = assigned; unit < 255; unit += 1) {
        let candidate = 0;
        for (let index = 1; index < 4; index += 1) {
            if (fractions[index] > fractions[candidate]) candidate = index;
        }
        quantized[candidate] += 1;
        fractions[candidate] = -1;
    }
    materialWeights[offset] = quantized[0];
    materialWeights[offset + 1] = quantized[1];
    materialWeights[offset + 2] = quantized[2];
    materialWeights[offset + 3] = quantized[3];
}

export function compileSemanticSurfaceField(
    window: Readonly<TransferableEffectiveWindow>
): CompiledSurfaceField {
    assertTransferableEffectiveWindow(window);
    const groundHeight = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const materialWeights = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT * 4);
    const shorelineDistance = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const sample: EffectiveWindowSemanticSample = {
        groundHeight: 0, biome0: 0, biome1: 0, biome2: 0, biome3: 0
    };
    const materialScratch: MaterialScratch = {
        values: new Float64Array(4),
        quantized: new Uint8Array(4),
        fractions: new Float64Array(4)
    };
    const saturatedShoreDistance = finiteFloat16Bits(
        "dry surface shoreline saturation",
        surfaceInfluenceRadiusWorld(window.dependencyKey.metrics.hexSize)
    );
    for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX += 1) {
        const u = surfaceTexelCenterAxis(window.renderKey.chunkX, texelX);
        for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY += 1) {
            const v = surfaceTexelCenterAxis(window.renderKey.chunkY, texelY);
            const index = surfaceFieldTexelIndex(texelX, texelY);
            const sampleIsValid = sampleEffectiveWindowSemantic(
                window,
                u,
                v,
                window.dependencyKey.metrics.heightScale,
                sample
            );
            groundHeight[index] = finiteFloat16Bits(
                "compiled semantic ground height",
                sampleIsValid ? sample.groundHeight : 0
            );
            quantizeMaterialWeights(materialWeights, index * 4, sample, sampleIsValid, materialScratch);
            shorelineDistance[index] = saturatedShoreDistance;
        }
    }
    return createCompiledSurfaceField({
        groundHeight,
        materialWeights,
        waterLevel: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterDepth: new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT),
        shorelineDistance,
        flow: new Int8Array(COMPILED_SURFACE_TEXEL_COUNT * 2),
        waterCoverage: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterKind: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterProfile: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT),
        waterBodyIndex: new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT)
    });
}
