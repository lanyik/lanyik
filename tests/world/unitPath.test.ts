import { afterEach, describe, expect, test, vi } from "vitest";
import { AnimationClip, Group, Matrix4, Vector3 } from "three";
import { UnitActions } from "../../src/enums";
import { createContinuousHexPath, Unit } from "../../src/objects/Unit";

vi.mock("../../src/helpers/models", () => ({
    loadModel: vi.fn(async () => ({
        scene: new Group(),
        animations: [
            new AnimationClip(UnitActions.idle, 1, []),
            new AnimationClip(UnitActions.walk, 1, [])
        ],
        info: {
            offset: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: 1,
            actions: [UnitActions.idle, UnitActions.walk]
        },
        fixup: new Matrix4()
    }))
}));

afterEach(() => vi.useRealTimers());

describe("unit movement path", () => {
    test("uses the short visual route across a horizontal world seam", () => {
        const size = 40;
        const points = createContinuousHexPath(
            [{ x: 0, y: 3 }, { x: 7, y: 3 }],
            size,
            { mapWidth: 8, mapHeight: 8, wrapX: true, wrapY: true },
            new Vector3(0, 0, 3 * size * Math.sqrt(3) + size * Math.sqrt(3) / 2)
        );
        expect(points[1].distanceTo(points[0])).toBeCloseTo(size * Math.sqrt(3), 8);
        expect(points[1].x).toBeLessThan(0);
    });

    test("animates glTF actions and lands exactly on the final waypoint", async () => {
        vi.useFakeTimers();
        const unit = new Unit({
            id: "test",
            type: "test-model",
            x: 0,
            y: 0,
            size: 40,
            animateSpeed: 0.2,
            animateFrameRate: 10
        });
        await unit.setUnit();
        const ended = vi.fn();
        unit.on("end_move", ended);

        expect(unit.activate(UnitActions.idle)).toBe(true);
        expect(unit.moveTo([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(true);
        expect(unit.moveTo([{ x: 1, y: 0 }, { x: 2, y: 0 }])).toBe(false);
        await vi.runAllTimersAsync();

        expect(unit.moving).toBe(false);
        expect(unit.unit.position.x).toBeCloseTo(60, 8);
        expect(unit.unit.position.z).toBeCloseTo(0, 8);
        expect(ended).toHaveBeenCalledOnce();
        unit.dispose();
    });

    test("does not rewrite a stationary unit transform until its nearest wrapped copy changes", async () => {
        const unit = new Unit({
            id: "wrapped",
            type: "test-model",
            x: 0,
            y: 0,
            size: 40,
            mapWidth: 8,
            mapHeight: 8,
            wrapX: true,
            wrapY: true
        });
        await unit.setUnit();
        const setPosition = vi.spyOn(unit.unit.position, "set");

        unit.alignToWorldReference(0, 0);
        unit.alignToWorldReference(10, 10);
        expect(setPosition).toHaveBeenCalledTimes(1);

        unit.alignToWorldReference(8 * 40 * 1.5, 0);
        expect(setPosition).toHaveBeenCalledTimes(2);
        unit.dispose();
    });
});
