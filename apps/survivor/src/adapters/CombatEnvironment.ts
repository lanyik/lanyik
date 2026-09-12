import { DEFAULT_WORLD_WATER_STYLE, type WorldWaterGenerationStyle } from "three-hex-map";

export const COMBAT_WATER_STYLE: Readonly<WorldWaterGenerationStyle> = Object.freeze({
    ...DEFAULT_WORLD_WATER_STYLE, oceanLevel: 0.32, riverSourcesPerCell: 2, riverLength: 70
});
/** Rendering and authority share every setting that changes ground or trunk positions. */
export const COMBAT_ENVIRONMENT = Object.freeze({
    size: 34, mountainHeight: 220, treesPerTile: .45, treeScale: 1,
    riverWidth: .28, riverBankWidth: .14, riverCurvature: .5, lakeShoreWidth: .18,
    beachWidth: .35, waterCornerRounding: .4, coastCurvature: .5
});
