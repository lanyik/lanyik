import { Vector3 } from "three";

export const SUN_COLOR = 0xfff3dc;
export const SUN_INTENSITY = 1.65;

/** One world-space sun for the sky, terrain and standard-material models. */
export function createSunDirection(): Vector3 {
    return new Vector3().setFromSphericalCoords(1, Math.PI / 2 - 24 * Math.PI / 180, 205 * Math.PI / 180);
}
