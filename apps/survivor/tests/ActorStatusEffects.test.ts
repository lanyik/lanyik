import { expect, test, vi } from "vitest";
import { Matrix4 } from "three";
import { ActorStatusEffects } from "../src/presentation/ActorStatusEffects";
import { CombatWorld } from "../src/core/CombatWorld";
import { StatusKind } from "../src/core/StatusSystem";
import { MAX_ENEMIES } from "../src/core/GameConfig";

function inspect(fx: ActorStatusEffects) {
    return fx as unknown as { ice: ActorStatusEffects["ground"]; crystals: ActorStatusEffects["ground"] };
}

test("slow and freeze attach distinct visuals, pause deterministically and expire independently", () => {
    const e = new CombatWorld(0, 0), fx = new ActorStatusEffects(), id = e.world.ids[e.player];
    const { ice, crystals } = inspect(fx);
    e.status.apply(StatusKind.Slow, id, id, .3, 120, 0); e.status.apply(StatusKind.Frozen, id, id, 1, 60, 0);
    const frame = (tick: number, x = 2) => { fx.begin(tick, tick / 120); fx.actor(e.status, e.player, x, 3, 4, .3, .5); fx.upload(); };
    frame(30); expect(ice.count).toBe(1); expect(crystals.count).toBe(3); expect(fx.ground.count).toBe(1);
    const matrix = new Matrix4(); ice.getMatrixAt(0, matrix); expect(matrix.elements[12]).toBe(2); expect(matrix.elements[13]).toBeCloseTo(3.65);
    expect(ice.geometry.getAttribute("statusVisibility").getX(0)).toBe(.5);
    const paused = Array.from(crystals.instanceMatrix.array); frame(30); expect(Array.from(crystals.instanceMatrix.array)).toEqual(paused);
    frame(60, 5); expect(ice.count).toBe(0); expect(fx.ground.count).toBe(1);
    fx.ground.getMatrixAt(0, matrix); expect(matrix.elements[12]).toBe(5); expect(matrix.elements[13]).toBe(0);
    expect(crystals.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 48 }]);
    frame(120); expect(fx.ground.count).toBe(0); expect(crystals.count).toBe(0); fx.dispose();
});

test("status pools handle maximum population, removal and resource disposal without stale instances", () => {
    const fx = new ActorStatusEffects(), status = { slowUntil: new Float64Array(MAX_ENEMIES + 1).fill(60), frozenUntil: new Float64Array(MAX_ENEMIES + 1).fill(60), wardUntil: new Float64Array(MAX_ENEMIES + 1) };
    const { ice, crystals } = inspect(fx);
    fx.begin(0, 0);
    for (let slot = 0; slot <= MAX_ENEMIES; slot++) fx.actor(status, slot, slot, 0, 0, .3);
    expect(ice.count).toBe(MAX_ENEMIES + 1); expect(crystals.count).toBe((MAX_ENEMIES + 1) * 3);
    fx.begin(1, 1 / 120); fx.actor(status, 0, 0, 0, 0, .3, 0);
    expect(ice.count).toBe(0); expect(crystals.count).toBe(0); expect(fx.ground.count).toBe(0);
    const disposed = [fx.ground, ice, crystals].flatMap(mesh => [vi.spyOn(mesh, "dispose"), vi.spyOn(mesh.geometry, "dispose"), vi.spyOn(mesh.material, "dispose")]);
    fx.dispose(); for (const spy of disposed) expect(spy).toHaveBeenCalledOnce();
});
