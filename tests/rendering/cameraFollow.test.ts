import { expect, test, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { HexMap } from "../../src/HexMap";
import { getHexCenter } from "../../src/helpers/helpers";

test("continuous logical camera following preserves view offset across a floating origin and shares tile targeting", () => {
    const camera = new PerspectiveCamera();
    const target = new Vector3(20, 5, 30);
    camera.position.copy(target).add(new Vector3(-300, 640, 400));
    const controls = { target, enablePan: true, update: vi.fn() };
    const reset = vi.fn();
    const map = Object.assign(Object.create(HexMap.prototype), { camera, controls, options: { size: 48 },
        mapData: { infinite: true, data: {} }, worldSurface: { getWorldHeight: (x: number, z: number) => (x + z) / 100 },
        renderOrigin: { x: 3000, y: -2000 }, logicalTargetScratch: new Vector3(), interactions: { reset } }) as HexMap;
    const offset = camera.position.clone().sub(target);
    map.setCameraTarget(3456.25, -1890.75);
    expect(map.getCameraTarget().toArray()).toEqual([3456.25, 15.655, -1890.75]);
    expect(camera.position.clone().sub(target).distanceTo(offset)).toBeLessThan(1e-10);
    map.setCameraTargetTile(-3, 4);
    const center = getHexCenter(-3, 4, 48);
    expect(map.getCameraTarget().x).toBe(center.x);
    expect(map.getCameraTarget().z).toBeCloseTo(center.y);
    map.cameraPanEnabled = false;
    expect(controls.enablePan).toBe(false);
    expect(reset).toHaveBeenCalledOnce();
    expect(() => map.setCameraTarget(NaN, 0)).toThrow("finite");
    expect(() => { map.cameraPanEnabled = "no" as unknown as boolean; }).toThrow("boolean");
});
