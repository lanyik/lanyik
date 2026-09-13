import type { Vector3 } from "three";

/** Lift an orbit along its sphere until the lens and sightline clear the heightfield. */
export function constrainTerrainCamera(position: Vector3, target: Vector3,
    height: (x: number, z: number) => number, clearance: number): void {
    const dx = position.x - target.x, dz = position.z - target.z;
    const horizontal = Math.hypot(dx, dz), distance = position.distanceTo(target);
    if (distance < 1e-6 || horizontal < 1e-6) return;
    const ux = dx / horizontal, uz = dz / horizontal;
    let angle = Math.atan2(horizontal, position.y - target.y);
    // Monotone angular correction keeps zoom distance fixed; a final overhead
    // position is part of the solver's bounded search, never below the target.
    const clear = (phi: number): boolean => {
        const h = Math.sin(phi) * distance, y = Math.cos(phi) * distance;
        const samples = Math.max(8, Math.min(64, Math.ceil(h / Math.max(1, clearance))));
        for (let i = 1; i <= samples; i++) {
            const t = i / samples, margin = Math.min(clearance, h * t * .18);
            if (target.y + y * t < height(target.x + ux * h * t, target.z + uz * h * t) + margin) return false;
        }
        return true;
    };
    if (clear(angle)) return;
    let low = 0, high = angle;
    for (let i = 0; i < 9; i++) {
        const mid = (low + high) / 2;
        if (clear(mid)) low = mid; else high = mid;
    }
    angle = low;
    position.set(target.x + ux * Math.sin(angle) * distance, target.y + Math.cos(angle) * distance,
        target.z + uz * Math.sin(angle) * distance);
}
