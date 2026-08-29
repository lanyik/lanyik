import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    createCompiledSurfaceField,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import { finiteFloat16Bits } from "./HalfFloat";
import { SURFACE_COMPILE_PROFILE, surfaceInfluenceRadiusWorld } from "./SurfaceCompileProfile";
import { surfaceTexelCenterAxis } from "./SurfaceLattice";
import {
    EFFECTIVE_WINDOW_TILE_SIZE,
    TransferableEffectiveWindow,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";

interface SemanticSample {
    groundHeight: number;
    biome0: number;
    biome1: number;
    biome2: number;
    biome3: number;
}

interface MaterialScratch {
    readonly values: Float64Array;
    readonly quantized: Uint8Array;
    readonly fractions: Float64Array;
}

function windowIndex(window: Readonly<TransferableEffectiveWindow>, tileX: number, tileY: number): number {
    const localX = tileX - window.originTileX;
    const localY = tileY - window.originTileY;
    if (localX < 0 || localX >= EFFECTIVE_WINDOW_TILE_SIZE
        || localY < 0 || localY >= EFFECTIVE_WINDOW_TILE_SIZE) return -1;
    return localX * EFFECTIVE_WINDOW_TILE_SIZE + localY;
}

function sampleSemantic(
    window: Readonly<TransferableEffectiveWindow>,
    u: number,
    v: number,
    heightScale: number,
    output: SemanticSample
): boolean {
    const tileX = Math.floor(u);
    const tileY = Math.floor(v);
    const fractionX = u - tileX;
    const fractionY = v - tileY;
    let validWeight = 0;
    let macroHeight = 0;
    let biome0 = 0;
    let biome1 = 0;
    let biome2 = 0;
    let biome3 = 0;
    for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
        const weightX = offsetX === 0 ? 1 - fractionX : fractionX;
        for (let offsetY = 0; offsetY <= 1; offsetY += 1) {
            const index = windowIndex(window, tileX + offsetX, tileY + offsetY);
            if (index < 0 || window.valid[index] === 0) continue;
            const weight = weightX * (offsetY === 0 ? 1 - fractionY : fractionY);
            const biomeOffset = index * 4;
            validWeight += weight;
            macroHeight += window.macroHeight[index] * weight;
            biome0 += window.biomeWeights[biomeOffset] * weight;
            biome1 += window.biomeWeights[biomeOffset + 1] * weight;
            biome2 += window.biomeWeights[biomeOffset + 2] * weight;
            biome3 += window.biomeWeights[biomeOffset + 3] * weight;
        }
    }
    if (validWeight <= 0) return false;
    const inverseWeight = 1 / validWeight;
    output.groundHeight = macroHeight * inverseWeight / 0xffff * heightScale;
    output.biome0 = biome0 * inverseWeight;
    output.biome1 = biome1 * inverseWeight;
    output.biome2 = biome2 * inverseWeight;
    output.biome3 = biome3 * inverseWeight;
    return true;
}

function quantizeMaterialWeights(
    materialWeights: Uint8Array,
    offset: number,
    sample: Readonly<SemanticSample>,
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
    const sample: SemanticSample = { groundHeight: 0, biome0: 0, biome1: 0, biome2: 0, biome3: 0 };
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
            const sampleIsValid = sampleSemantic(
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
