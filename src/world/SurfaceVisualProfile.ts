import {
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_OCEAN,
    SURFACE_WATER_KIND_RIVER
} from "./CompiledSurfaceField";

export const SURFACE_VISUAL_PROFILE_VERSION = 1;

export interface SurfaceVisualProfile {
    readonly version: typeof SURFACE_VISUAL_PROFILE_VERSION;
    readonly groundMaximumDisplacementTiles: number;
    readonly oceanMaximumDisplacementTiles: number;
    readonly lakeMaximumDisplacementTiles: number;
    readonly riverMaximumDisplacementTiles: number;
}

export const SURFACE_VISUAL_PROFILE: Readonly<SurfaceVisualProfile> = Object.freeze({
    version: SURFACE_VISUAL_PROFILE_VERSION,
    groundMaximumDisplacementTiles: 0.025,
    oceanMaximumDisplacementTiles: 0.12,
    lakeMaximumDisplacementTiles: 0.06,
    riverMaximumDisplacementTiles: 0.03
});

export function assertSurfaceVisualProfile(profile: Readonly<SurfaceVisualProfile>): void {
    if (!profile || typeof profile !== "object"
        || profile.version !== SURFACE_VISUAL_PROFILE_VERSION
        || profile.groundMaximumDisplacementTiles !== 0.025
        || profile.oceanMaximumDisplacementTiles !== 0.12
        || profile.lakeMaximumDisplacementTiles !== 0.06
        || profile.riverMaximumDisplacementTiles !== 0.03) {
        throw new RangeError("surface visual profile does not match frozen profile v1");
    }
}

export function surfaceGroundMaximumDisplacement(hexSize: number): number {
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("surface visual displacement requires a positive finite hex size");
    }
    return SURFACE_VISUAL_PROFILE.groundMaximumDisplacementTiles * hexSize;
}

export function surfaceWaterMaximumDisplacement(waterKind: number, hexSize: number): number {
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("surface visual displacement requires a positive finite hex size");
    }
    const tiles = waterKind === SURFACE_WATER_KIND_OCEAN
        ? SURFACE_VISUAL_PROFILE.oceanMaximumDisplacementTiles
        : waterKind === SURFACE_WATER_KIND_LAKE
            ? SURFACE_VISUAL_PROFILE.lakeMaximumDisplacementTiles
            : waterKind === SURFACE_WATER_KIND_RIVER
                ? SURFACE_VISUAL_PROFILE.riverMaximumDisplacementTiles
                : undefined;
    if (tiles === undefined) throw new RangeError("surface water displacement requires a wet kind");
    return tiles * hexSize;
}

assertSurfaceVisualProfile(SURFACE_VISUAL_PROFILE);
