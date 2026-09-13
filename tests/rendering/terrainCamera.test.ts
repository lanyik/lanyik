import { expect, test } from "vitest";
import { Vector3 } from "three";
import { constrainTerrainCamera } from "../../src/rendering/TerrainCamera";

test("camera rotation clears an intervening ridge while retaining orbit distance", () => {
    const height = (x: number, z: number) => Math.exp(-(((Math.hypot(x, z) - 80) / 28) ** 2)) * 130;
    const target = new Vector3(0, height(0, 0), 0);
    for (const angle of [0, .4, 2, 4]) {
        const camera = new Vector3(Math.cos(angle) * 180, 35, Math.sin(angle) * 180), distance = camera.distanceTo(target);
        constrainTerrainCamera(camera, target, height, 12);
        expect(camera.distanceTo(target)).toBeCloseTo(distance, 8);
        for (let i = 1; i <= 100; i++) {
            const point = target.clone().lerp(camera, i / 100);
            expect(point.y).toBeGreaterThanOrEqual(height(point.x, point.z));
        }
    }
});

test("a clear camera is unchanged, including a rebased far world", () => {
    const camera = new Vector3(90, 120, -80), target = new Vector3(0, 0, 0), original = camera.clone();
    constrainTerrainCamera(camera, target, () => 0, 12);
    expect(camera).toEqual(original);
});
