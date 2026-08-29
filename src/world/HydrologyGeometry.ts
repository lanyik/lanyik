export const HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES = 0.5;
export const HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES = 0.25;

export function hydrologyRiverHalfWidthTiles(widthClass: number): number {
    if (!Number.isInteger(widthClass) || widthClass <= 0 || widthClass > 0xff) {
        throw new RangeError("hydrology river width class must be a positive uint8 value");
    }
    return HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES
        + widthClass * HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES;
}
