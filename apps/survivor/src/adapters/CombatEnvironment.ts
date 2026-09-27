import { DEFAULT_WORLD_WATER_STYLE, type WorldWaterGenerationStyle } from "three-hex-map";
import { WORLD_VIEW } from "../core/WorldView";

export const COMBAT_WATER_STYLE: Readonly<WorldWaterGenerationStyle> = Object.freeze({
    ...DEFAULT_WORLD_WATER_STYLE, oceanLevel: 0.32, riverSourcesPerCell: 2, riverLength: 70
});
/** Appearance only; applied to every game world without changing water clearance. */
export const COMBAT_WATER_APPEARANCE = Object.freeze({
    waterColorDeep: 0x183638, waterColorShallow: 0x45554a, riverBankColor: 0x50473a,
    waterWaveAmplitude: .28, waterWaveFrequency: .65, waterWaveSpeed: .45,
    waterSparkleIntensity: .2, waterFresnelIntensity: .4,
    coastalWaveColor: 0x9da799, coastalWaveCount: 1.5, coastalWaveWidth: .06,
    coastalWaveRange: .35, coastalWaveOpacity: .08
});
/** Rendering and authority share every setting that changes ground or trunk positions. */
export const COMBAT_ENVIRONMENT = Object.freeze({
    size: WORLD_VIEW.unitScale, mountainHeight: 480, treesPerTile: .45, treeScale: 1,
    riverWidth: .28, riverBankWidth: .14, riverCurvature: .5, lakeShoreWidth: .18,
    beachWidth: .35, waterCornerRounding: .4, coastCurvature: .5
});
