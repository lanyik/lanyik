import { expect, test, vi } from "vitest";
import { BoxGeometry, Vector3 } from "three";
import { ChestGrounding } from "../src/presentation/ChestGrounding";

function chestGeometry() { return new BoxGeometry(.85, .765, .85).translate(0, .765 / 2, 0); }

test.each([[0, 0], [.4, -.3], [-.7, .8]])("the entire rigid chest base contacts a plane with slope %s, %s", (sx, sz) => {
    const geometry = chestGeometry(), height = (x: number, z: number) => 10 + sx * x + sz * z;
    const grounding = new ChestGrounding(geometry, height), matrix = grounding.at(-1.75, -2.1);
    const point = new Vector3();
    for (let row = 0; row <= 20; row++) for (let column = 0; column <= 20; column++) {
        point.set(-.425 + column * .85 / 20, 0, -.425 + row * .85 / 20).applyMatrix4(matrix);
        expect(point.y).toBeCloseTo(height(point.x, point.z), 6);
    }
    // Rotation must preserve the mesh, including on steep slopes.
    expect(matrix.determinant()).toBeCloseTo(1, 10);
    geometry.dispose();
});

test("a crest under the center supports the chest, and surface invalidation recomputes cached placements", () => {
    let elevation = 2;
    const geometry = chestGeometry(), height = vi.fn((x: number, z: number) => elevation - Math.abs(x) * .5 - Math.abs(z) * .3);
    const grounding = new ChestGrounding(geometry, height), first = grounding.at(0, 0);
    expect(first.elements[13]).toBeCloseTo(2);
    const calls = height.mock.calls.length;
    expect(grounding.at(0, 0)).toBe(first); expect(height).toHaveBeenCalledTimes(calls);
    elevation = 5; grounding.clear();
    expect(grounding.at(0, 0).elements[13]).toBeCloseTo(5);
    expect(height.mock.calls.length).toBeGreaterThan(calls);
    geometry.dispose();
});
