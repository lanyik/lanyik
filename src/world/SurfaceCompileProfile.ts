export const WORLD_SEMANTIC_CHUNK_SIZE = 32;
export const HYDROLOGY_REGION_SIZE = 128;

export const SURFACE_COMPILE_PROFILE_VERSION = 1;

export interface SurfaceCompileProfile {
    readonly version: typeof SURFACE_COMPILE_PROFILE_VERSION;
    readonly renderChunkSize: number;
    readonly samplesPerTileInterval: number;
    readonly gutterTexels: number;
    readonly influenceRadiusTiles: number;
    readonly textureLayerSize: number;
    readonly pageLayers: number;
}

export const SURFACE_COMPILE_PROFILE: Readonly<SurfaceCompileProfile> = Object.freeze({
    version: SURFACE_COMPILE_PROFILE_VERSION,
    renderChunkSize: 16,
    samplesPerTileInterval: 4,
    gutterTexels: 1,
    influenceRadiusTiles: 2,
    textureLayerSize: 66,
    pageLayers: 128
});

export const SURFACE_CORE_TEXELS = SURFACE_COMPILE_PROFILE.renderChunkSize
    * SURFACE_COMPILE_PROFILE.samplesPerTileInterval;

// Logical CPU field layout from the v2 contract. SurfaceTexturePool freezes
// the profile-v1 physical GPU packing without changing field meaning or precision.
export const SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL = 18;
export const SURFACE_FIELD_CPU_BYTES = SURFACE_COMPILE_PROFILE.textureLayerSize
    * SURFACE_COMPILE_PROFILE.textureLayerSize
    * SURFACE_FIELD_LOGICAL_BYTES_PER_TEXEL;

export function assertSurfaceCompileProfile(profile: Readonly<SurfaceCompileProfile>): void {
    const integerFields = [
        profile.version,
        profile.renderChunkSize,
        profile.samplesPerTileInterval,
        profile.gutterTexels,
        profile.influenceRadiusTiles,
        profile.textureLayerSize,
        profile.pageLayers
    ];
    if (integerFields.some(value => !Number.isInteger(value) || value <= 0)) {
        throw new RangeError("surface compile profile fields must be positive integers");
    }
    if (profile.version !== SURFACE_COMPILE_PROFILE_VERSION) {
        throw new RangeError("surface compile profile version is unsupported");
    }
    if (WORLD_SEMANTIC_CHUNK_SIZE % profile.renderChunkSize !== 0
        || HYDROLOGY_REGION_SIZE % WORLD_SEMANTIC_CHUNK_SIZE !== 0) {
        throw new RangeError("surface compile profile must align with the world formats");
    }
    const coreTexels = profile.renderChunkSize * profile.samplesPerTileInterval;
    if (profile.textureLayerSize !== coreTexels + profile.gutterTexels * 2) {
        throw new RangeError("surface texture layer size does not match its core and gutter");
    }
    if (profile.influenceRadiusTiles < profile.gutterTexels) {
        throw new RangeError("surface influence radius cannot be smaller than its texture gutter");
    }
    // WebGL2 guarantees at least 256 array layers. Keeping a page at or below
    // half of that floor leaves room for bounded implementation variation and
    // is part of profile v1 rather than a caller-tunable option.
    if (profile.pageLayers > 128) {
        throw new RangeError("surface texture page exceeds the profile v1 layer budget");
    }
    if (profile.renderChunkSize !== 16
        || profile.samplesPerTileInterval !== 4
        || profile.gutterTexels !== 1
        || profile.influenceRadiusTiles !== 2
        || profile.textureLayerSize !== 66
        || profile.pageLayers !== 128) {
        throw new RangeError("surface compile profile does not match the frozen profile v1");
    }
}

export function surfaceInfluenceRadiusWorld(hexSize: number): number {
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("surface influence radius requires a positive finite hex size");
    }
    return SURFACE_COMPILE_PROFILE.influenceRadiusTiles * hexSize;
}

assertSurfaceCompileProfile(SURFACE_COMPILE_PROFILE);
