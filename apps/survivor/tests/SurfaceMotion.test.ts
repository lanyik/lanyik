import { expect, test } from "vitest";
import { SurfaceMotion } from "../src/core/SurfaceMotion";

test("arbitrary wall angles retain tangent travel without tunneling", () => {
    for (const angle of [0, .35, 1.1, 2.6]) {
        const nx = Math.cos(angle), nz = Math.sin(angle), radius = .3;
        const motion = new SurfaceMotion((x, z, r) => x * nx + z * nz < r ? { x: nx, z: nz, round: false } : undefined);
        const next = motion.move(nx, nz, -nx * 3 - nz * 2, -nz * 3 + nx * 2, radius, true);
        expect(next.x * nx + next.z * nz).toBeGreaterThanOrEqual(radius - 1e-5);
        expect(-next.x * nz + next.z * nx).toBeCloseTo(2, 2);
    }
});

test("a frontal trunk gives continuous shoulder movement; a dash stops before it", () => {
    const contact = (x: number, z: number, radius: number) => {
        const length = Math.hypot(x, z);
        return length < radius + .2 ? { x: x / length, z: z / length, round: true } : undefined;
    };
    const motion = new SurfaceMotion(contact);
    let x = -1, z = 0;
    for (let tick = 0; tick < 240; tick++) {
        const next = motion.move(x, z, .015, 0, .3, true);
        expect(contact(next.x, next.z, .3)).toBeUndefined();
        expect(Math.hypot(next.x - x, next.z - z)).toBeLessThanOrEqual(.01501);
        x = next.x; z = next.z;
    }
    expect(x).toBeGreaterThan(1); expect(Math.abs(z)).toBeGreaterThan(.3);
    const dash = motion.move(-1, 0, 6, 0, .3, false);
    expect(dash.x).toBeLessThanOrEqual(-.5); expect(dash.z).toBe(0);
});

test("a closed corner stops without alternating sideways or accumulating penetration", () => {
    const motion = new SurfaceMotion((x, z, r) => x < r ? { x: 1, z: 0, round: false }
        : z < r ? { x: 0, z: 1, round: false } : undefined);
    let x = 1, z = 1;
    for (let i = 0; i < 200; i++) { const next = motion.move(x, z, -.05, -.05, .3, true); x = next.x; z = next.z; }
    expect(x).toBeCloseTo(.3, 3); expect(z).toBeCloseTo(.3, 3);
});
