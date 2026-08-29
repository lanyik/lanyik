import { AuthoredHydrologyFeatureKind } from "./HydrologyFeatureDelta";
import { OCEAN_BODY_ID } from "./HydrologyIdentity";

export const COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION = 1;
export const MAX_COMPILED_WATER_BODIES = 255;

export type CompiledWaterBodyKind = "ocean" | AuthoredHydrologyFeatureKind;

export interface CompiledWaterBody {
    readonly bodyId: string;
    readonly kind: CompiledWaterBodyKind;
    readonly profileIndex: number;
}

export interface CompiledWaterBodyPalette {
    readonly formatVersion: typeof COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION;
    readonly entries: readonly CompiledWaterBody[];
}

function assertBodyId(value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > 256
        || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new TypeError("compiled water body ID is invalid");
    }
}

export function assertCompiledWaterBodyPalette(palette: Readonly<CompiledWaterBodyPalette>): void {
    if (!palette || typeof palette !== "object"
        || palette.formatVersion !== COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION
        || !Array.isArray(palette.entries) || palette.entries.length > MAX_COMPILED_WATER_BODIES) {
        throw new TypeError("compiled water body palette format or entry count is invalid");
    }
    let previousBodyId: string | undefined;
    for (const entry of palette.entries) {
        if (!entry || typeof entry !== "object") throw new TypeError("compiled water body entry is invalid");
        assertBodyId(entry.bodyId);
        if (entry.kind !== "ocean" && entry.kind !== "lake" && entry.kind !== "river") {
            throw new TypeError("compiled water body kind is invalid");
        }
        if (!Number.isInteger(entry.profileIndex) || entry.profileIndex < 0 || entry.profileIndex > 0xff) {
            throw new RangeError("compiled water body profile must be a uint8 value");
        }
        if (entry.kind === "ocean" && (entry.bodyId !== OCEAN_BODY_ID || entry.profileIndex !== 0)) {
            throw new Error("compiled ocean body must use its canonical identity and profile");
        }
        if (previousBodyId !== undefined && previousBodyId >= entry.bodyId) {
            throw new Error("compiled water bodies must use unique ascending identities");
        }
        previousBodyId = entry.bodyId;
    }
}

export function createCompiledWaterBodyPalette(
    entries: readonly CompiledWaterBody[]
): CompiledWaterBodyPalette {
    if (!Array.isArray(entries)) throw new TypeError("compiled water body entries must be an array");
    const palette: CompiledWaterBodyPalette = Object.freeze({
        formatVersion: COMPILED_WATER_BODY_PALETTE_FORMAT_VERSION,
        entries: Object.freeze(entries.map(entry => Object.freeze({ ...entry })))
    });
    assertCompiledWaterBodyPalette(palette);
    return palette;
}

export function compiledWaterBodyPaletteIndex(
    palette: Readonly<CompiledWaterBodyPalette>,
    bodyId: string
): number {
    assertCompiledWaterBodyPalette(palette);
    assertBodyId(bodyId);
    let minimum = 0;
    let maximum = palette.entries.length - 1;
    while (minimum <= maximum) {
        const middle = (minimum + maximum) >>> 1;
        const candidate = palette.entries[middle].bodyId;
        if (candidate === bodyId) return middle + 1;
        if (candidate < bodyId) minimum = middle + 1;
        else maximum = middle - 1;
    }
    return 0;
}
