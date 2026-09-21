import { expect, test, vi } from "vitest";
import { Matrix4 } from "three";
import { ActorStatusEffects } from "../src/presentation/ActorStatusEffects";
import { CombatWorld } from "../src/core/CombatWorld";
import { StatusKind } from "../src/core/StatusSystem";
import { MAX_ENEMIES } from "../src/core/GameConfig";

function inspect(fx: ActorStatusEffects) {
    return fx as unknown as Record<"ice" | "crystals" | "flames" | "smoke" | "embers" | "electricity" | "staticGuard", ActorStatusEffects["ground"]>;
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
    const fx = new ActorStatusEffects(), status = { burnUntil: new Float64Array(MAX_ENEMIES + 1).fill(60), burnStacks: new Uint8Array(MAX_ENEMIES + 1).fill(32), slowUntil: new Float64Array(MAX_ENEMIES + 1).fill(60), frozenUntil: new Float64Array(MAX_ENEMIES + 1).fill(60), wardUntil: new Float64Array(MAX_ENEMIES + 1), conductiveUntil: new Float64Array(MAX_ENEMIES + 1).fill(60), staticGuardUntil: new Float64Array(MAX_ENEMIES + 1).fill(60) };
    const { ice, crystals, flames, smoke, embers, electricity, staticGuard } = inspect(fx);
    fx.begin(0, 0);
    for (let slot = 0; slot <= MAX_ENEMIES; slot++) fx.actor(status, slot, slot, 0, 0, .3);
    expect(ice.count).toBe(MAX_ENEMIES + 1); expect(crystals.count).toBe((MAX_ENEMIES + 1) * 3);
    expect(flames.count).toBe((MAX_ENEMIES + 1) * 3); expect(smoke.count).toBe((MAX_ENEMIES + 1) * 2); expect(embers.count).toBe((MAX_ENEMIES + 1) * 3);
    expect(flames.instanceMatrix.array.every(Number.isFinite)).toBe(true);
    expect(electricity.count).toBe((MAX_ENEMIES + 1) * 3); expect(staticGuard.count).toBe((MAX_ENEMIES + 1) * 2);
    expect(electricity.instanceMatrix.array.every(Number.isFinite)).toBe(true); expect(staticGuard.instanceMatrix.array.every(Number.isFinite)).toBe(true);
    fx.begin(1, 1 / 120); fx.actor(status, 0, 0, 0, 0, .3, 0);
    expect(ice.count).toBe(0); expect(crystals.count).toBe(0); expect(fx.ground.count).toBe(0);
    expect(flames.count).toBe(0); expect(smoke.count).toBe(0); expect(embers.count).toBe(0);
    expect(electricity.count).toBe(0); expect(staticGuard.count).toBe(0);
    const disposed = [fx.ground, ice, crystals, flames, smoke, embers, electricity, staticGuard].flatMap(mesh => [vi.spyOn(mesh, "dispose"), vi.spyOn(mesh.geometry, "dispose"), vi.spyOn(mesh.material, "dispose")]);
    fx.dispose(); for (const spy of disposed) expect(spy).toHaveBeenCalledOnce();
});
