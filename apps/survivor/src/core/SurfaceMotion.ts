export interface SurfaceContact { x: number; z: number; round: boolean }

/** Swept disc movement with a bounded contact solver; no axis preference or teleport. */
export class SurfaceMotion {
    private readonly result = { x: 0, z: 0 };
    constructor(private readonly contact: (x: number, z: number, radius: number) => SurfaceContact | undefined) {}

    public move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean) {
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .15));
        for (let step = 0; step < steps; step++) {
            let rx = dx / steps, rz = dz / steps;
            for (let iteration = 0; iteration < 4 && Math.hypot(rx, rz) > 1e-6; iteration++) {
                if (!this.contact(x + rx, z + rz, radius)) { x += rx; z += rz; break; }
                let low = 0, high = 1;
                for (let search = 0; search < 9; search++) {
                    const mid = (low + high) / 2;
                    if (this.contact(x + rx * mid, z + rz * mid, radius)) high = mid;
                    else low = mid;
                }
                const hit = this.contact(x + rx * high, z + rz * high, radius)!;
                const nx = hit.x, nz = hit.z, round = hit.round;
                x += rx * Math.max(0, low - .001); z += rz * Math.max(0, low - .001);
                if (!slide) { this.result.x = x; this.result.z = z; return this.result; }
                rx *= 1 - low; rz *= 1 - low;
                const length = Math.hypot(rx, rz), into = Math.min(0, rx * nx + rz * nz);
                rx -= nx * into; rz -= nz * into;
                // A narrow trunk directly ahead receives a small, stable shoulder steer.
                // Walls and corners retain physical tangent projection and may stop motion.
                if (round && iteration === 0 && Math.hypot(rx, rz) < length * .3) {
                    const side = rx * -nz + rz * nx < -1e-7 ? -1 : 1;
                    rx = -nz * length * .3 * side; rz = nx * length * .3 * side;
                }
            }
        }
        this.result.x = x; this.result.z = z; return this.result;
    }
}
