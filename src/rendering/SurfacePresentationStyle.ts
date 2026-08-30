export interface SurfacePresentationStyle {
    readonly gridVisible: boolean;
    readonly terrainDetailStrength: number;
    readonly distanceFogStrength: number;
    readonly waterWaveAmplitude: number;
    readonly waterWaveSpeed: number;
    readonly coastalWaveOpacity: number;
    readonly treesVisible: boolean;
    readonly grassVisible: boolean;
    readonly grassWindStrength: number;
}

export const DEFAULT_SURFACE_PRESENTATION_STYLE: Readonly<SurfacePresentationStyle> = Object.freeze({
    gridVisible: true,
    terrainDetailStrength: 1,
    distanceFogStrength: 1,
    waterWaveAmplitude: 1,
    waterWaveSpeed: 1,
    coastalWaveOpacity: 1,
    treesVisible: true,
    grassVisible: true,
    grassWindStrength: 1
});

const STYLE_FIELDS = Object.freeze(Object.keys(DEFAULT_SURFACE_PRESENTATION_STYLE));

function assertUnitInterval(name: string, value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${name} must be finite and between 0 and 1`);
    }
}

function assertRange(name: string, value: number, maximum: number): void {
    if (!Number.isFinite(value) || value < 0 || value > maximum) {
        throw new RangeError(`${name} must be finite and between 0 and ${maximum}`);
    }
}

export function createSurfacePresentationStyle(
    values: Partial<SurfacePresentationStyle> = {}
): Readonly<SurfacePresentationStyle> {
    if (!values || typeof values !== "object" || Array.isArray(values)
        || Object.getOwnPropertyNames(values).some(name => !STYLE_FIELDS.includes(name))) {
        throw new TypeError("surface presentation style is invalid");
    }
    const style = { ...DEFAULT_SURFACE_PRESENTATION_STYLE, ...values };
    if (typeof style.gridVisible !== "boolean"
        || typeof style.treesVisible !== "boolean"
        || typeof style.grassVisible !== "boolean") {
        throw new TypeError("surface presentation visibility values must be booleans");
    }
    assertRange("terrainDetailStrength", style.terrainDetailStrength, 2);
    assertRange("distanceFogStrength", style.distanceFogStrength, 2);
    assertRange("waterWaveAmplitude", style.waterWaveAmplitude, 4);
    assertRange("waterWaveSpeed", style.waterWaveSpeed, 4);
    assertUnitInterval("coastalWaveOpacity", style.coastalWaveOpacity);
    assertRange("grassWindStrength", style.grassWindStrength, 6);
    return Object.freeze(style);
}
