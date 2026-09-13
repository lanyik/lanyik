import { Vector3 } from "three";

/** One world-space sun for the sky, terrain and standard-material models. */
export function createSunDirection(): Vector3 {
    return new Vector3().setFromSphericalCoords(1, Math.PI / 2 - 24 * Math.PI / 180, 205 * Math.PI / 180);
}
