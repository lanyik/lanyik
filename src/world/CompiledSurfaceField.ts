import { finiteFloat16Bits, float16BitsToFloat32 } from "./HalfFloat";
import {
    SURFACE_COMPILE_PROFILE,
    SURFACE_FIELD_CPU_BYTES,
    SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL
} from "./SurfaceCompileProfile";

export const SURFACE_COMPILER_REVISION = 1;
export const COMPILED_SURFACE_FIELD_FORMAT_VERSION = 1;
export const COMPILED_SURFACE_TEXEL_COUNT = SURFACE_COMPILE_PROFILE.textureLayerSize
    * SURFACE_COMPILE_PROFILE.textureLayerSize;

export const SURFACE_WATER_KIND_NONE = 0;
export const SURFACE_WATER_KIND_OCEAN = 1;
export const SURFACE_WATER_KIND_LAKE = 2;
export const SURFACE_WATER_KIND_RIVER = 3;

export interface CompiledSurfaceField {
    readonly formatVersion: typeof COMPILED_SURFACE_FIELD_FORMAT_VERSION;
    readonly compilerRevision: typeof SURFACE_COMPILER_REVISION;
    readonly groundHeight: Uint16Array;
    readonly materialWeights: Uint8Array;
    readonly waterLevel: Uint16Array;
    readonly waterDepth: Uint16Array;
    readonly shorelineDistance: Uint16Array;
    readonly flow: Int8Array;
    readonly waterCoverage: Uint8Array;
    readonly waterKind: Uint8Array;
    readonly waterProfile: Uint8Array;
    readonly waterBodyIndex: Uint8Array;
}

export interface CompiledSurfaceFieldInput extends Omit<CompiledSurfaceField,
    "formatVersion" | "compilerRevision"> {}

function assertArrayLayout(field: Readonly<CompiledSurfaceField>): void {
    const length = COMPILED_SURFACE_TEXEL_COUNT;
    if (!(field.groundHeight instanceof Uint16Array) || field.groundHeight.length !== length
        || !(field.materialWeights instanceof Uint8Array) || field.materialWeights.length !== length * 4
        || !(field.waterLevel instanceof Uint16Array) || field.waterLevel.length !== length
        || !(field.waterDepth instanceof Uint16Array) || field.waterDepth.length !== length
        || !(field.shorelineDistance instanceof Uint16Array) || field.shorelineDistance.length !== length
        || !(field.flow instanceof Int8Array) || field.flow.length !== length * 2
        || !(field.waterCoverage instanceof Uint8Array) || field.waterCoverage.length !== length
        || !(field.waterKind instanceof Uint8Array) || field.waterKind.length !== length
        || !(field.waterProfile instanceof Uint8Array) || field.waterProfile.length !== length
        || !(field.waterBodyIndex instanceof Uint8Array) || field.waterBodyIndex.length !== length) {
        throw new TypeError("compiled surface field arrays do not match the frozen profile layout");
    }
}

export function surfaceFieldTexelIndex(texelX: number, texelY: number): number {
    const gutter = SURFACE_COMPILE_PROFILE.gutterTexels;
    const maximum = SURFACE_COMPILE_PROFILE.textureLayerSize - gutter - 1;
    if (!Number.isInteger(texelX) || texelX < -gutter || texelX > maximum
        || !Number.isInteger(texelY) || texelY < -gutter || texelY > maximum) {
        throw new RangeError("surface field texel coordinate is outside its physical layer");
    }
    return (texelX + gutter) * SURFACE_COMPILE_PROFILE.textureLayerSize + texelY + gutter;
}

export function assertCompiledSurfaceField(field: Readonly<CompiledSurfaceField>): void {
    if (!field || typeof field !== "object"
        || field.formatVersion !== COMPILED_SURFACE_FIELD_FORMAT_VERSION
        || field.compilerRevision !== SURFACE_COMPILER_REVISION) {
        throw new TypeError("compiled surface field format or compiler revision is unsupported");
    }
    assertArrayLayout(field);
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        const materialOffset = index * 4;
        const materialSum = field.materialWeights[materialOffset]
            + field.materialWeights[materialOffset + 1]
            + field.materialWeights[materialOffset + 2]
            + field.materialWeights[materialOffset + 3];
        if (materialSum !== 255) {
            throw new RangeError("compiled surface material weights must sum to 255");
        }
        const groundHeight = float16BitsToFloat32(field.groundHeight[index]);
        const waterLevel = float16BitsToFloat32(field.waterLevel[index]);
        const waterDepth = float16BitsToFloat32(field.waterDepth[index]);
        const shorelineDistance = float16BitsToFloat32(field.shorelineDistance[index]);
        if (!Number.isFinite(groundHeight) || !Number.isFinite(waterLevel)
            || !Number.isFinite(waterDepth) || !Number.isFinite(shorelineDistance)) {
            throw new RangeError("compiled surface binary16 fields must be finite");
        }
        const flowOffset = index * 2;
        if (field.flow[flowOffset] === -128 || field.flow[flowOffset + 1] === -128) {
            throw new RangeError("compiled surface SNORM flow cannot use the asymmetric -128 code");
        }
        if (field.waterCoverage[index] === 0) {
            if (field.waterKind[index] !== SURFACE_WATER_KIND_NONE
                || field.waterProfile[index] !== 0 || field.waterBodyIndex[index] !== 0
                || field.waterLevel[index] !== 0 || field.waterDepth[index] !== 0
                || field.flow[flowOffset] !== 0 || field.flow[flowOffset + 1] !== 0) {
                throw new Error("dry surface texels must use canonical zero water payload");
            }
            continue;
        }
        if (field.waterKind[index] < SURFACE_WATER_KIND_OCEAN
            || field.waterKind[index] > SURFACE_WATER_KIND_RIVER
            || field.waterBodyIndex[index] === 0) {
            throw new RangeError("wet surface texels require a valid water kind and body palette index");
        }
        if (waterDepth < 0 || waterLevel < groundHeight) {
            throw new Error("wet surface texels cannot contain negative depth or water below ground");
        }
        if (field.waterDepth[index] !== finiteFloat16Bits(
            "compiled surface water depth",
            Math.max(0, waterLevel - groundHeight)
        )) {
            throw new Error("compiled surface water depth must equal its quantized level minus ground");
        }
        if (field.waterKind[index] === SURFACE_WATER_KIND_RIVER
            && field.flow[flowOffset] === 0 && field.flow[flowOffset + 1] === 0) {
            throw new Error("river surface texels require a non-zero flow direction");
        }
    }
    if (compiledSurfaceFieldResidentBytes(field) !== SURFACE_FIELD_CPU_BYTES) {
        throw new Error("compiled surface field byte size drifted from its compile profile");
    }
}

export function createCompiledSurfaceField(
    input: Readonly<CompiledSurfaceFieldInput>
): CompiledSurfaceField {
    if (!input || typeof input !== "object") throw new TypeError("compiled surface field input is required");
    const field: CompiledSurfaceField = Object.freeze({
        formatVersion: COMPILED_SURFACE_FIELD_FORMAT_VERSION,
        compilerRevision: SURFACE_COMPILER_REVISION,
        groundHeight: input.groundHeight,
        materialWeights: input.materialWeights,
        waterLevel: input.waterLevel,
        waterDepth: input.waterDepth,
        shorelineDistance: input.shorelineDistance,
        flow: input.flow,
        waterCoverage: input.waterCoverage,
        waterKind: input.waterKind,
        waterProfile: input.waterProfile,
        waterBodyIndex: input.waterBodyIndex
    });
    assertCompiledSurfaceField(field);
    return field;
}

export function compiledSurfaceFieldResidentBytes(field: Readonly<CompiledSurfaceField>): number {
    return field.groundHeight.byteLength + field.materialWeights.byteLength
        + field.waterLevel.byteLength + field.waterDepth.byteLength
        + field.shorelineDistance.byteLength + field.flow.byteLength
        + field.waterCoverage.byteLength + field.waterKind.byteLength
        + field.waterProfile.byteLength + field.waterBodyIndex.byteLength;
}

export function compiledSurfaceFieldTransferables(
    field: Readonly<CompiledSurfaceField>
): readonly ArrayBuffer[] {
    assertCompiledSurfaceField(field);
    const buffers: ArrayBufferLike[] = [
        field.groundHeight.buffer,
        field.materialWeights.buffer,
        field.waterLevel.buffer,
        field.waterDepth.buffer,
        field.shorelineDistance.buffer,
        field.flow.buffer,
        field.waterCoverage.buffer,
        field.waterKind.buffer,
        field.waterProfile.buffer,
        field.waterBodyIndex.buffer
    ];
    if (buffers.some(buffer => !(buffer instanceof ArrayBuffer))) {
        throw new TypeError("compiled surface field transfer requires owned ArrayBuffer payloads");
    }
    if (new Set(buffers).size !== buffers.length) {
        throw new Error("compiled surface field arrays must own distinct transferable buffers");
    }
    return Object.freeze(buffers as ArrayBuffer[]);
}

if (SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL !== 18
    || SURFACE_FIELD_CPU_BYTES !== COMPILED_SURFACE_TEXEL_COUNT * 18) {
    throw new Error("compiled surface field constants do not match the frozen logical layout");
}
