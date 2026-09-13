import { expect, test, vi } from "vitest";
import { EnemyPresentation } from "../src/presentation/EnemyPresentation";
import { CombatEffects, EffectKind } from "../src/core/CombatEffects";
import { ActorAction } from "../src/core/CombatWorld";
import { GAME_CONFIG, MAX_ENEMIES, MAX_PROJECTILES } from "../src/core/GameConfig";

test("enemy signatures use different solid geometry and the blood pact has a body-height link", () => {
    const display = new EnemyPresentation(), effects = new CombatEffects(), height = () => 0;
    try {
        effects.add(EffectKind.EnemyFault, 0, 0, 0, .6, 1.05, 0, 1);
        display.begin(effects.buffer, .3, height, 0, 0);
        expect(display.rocks.count).toBeGreaterThan(0); expect(display.blades.count).toBe(0); expect(display.warnings.count).toBe(0);
        effects.buffer.count = 0; effects.add(EffectKind.EnemyJaws, 0, 0, 0, .35, 1.2, 0, 1);
        display.begin(effects.buffer, .3, height, 0, 0);
        expect(display.rocks.count).toBe(0); expect(display.blades.count).toBe(14); expect(display.warnings.count).toBe(0);
        effects.buffer.count = 0; display.begin(effects.buffer, 0, height, 0, 0);
        display.hand(ActorAction.Heal, .25, 0, 1.2, 0, 3, 1, 0, height);
        expect(display.threads.count).toBe(5); expect(display.warnings.count).toBe(0);
        for (let i = 0; i < display.threads.count; i++) expect(display.threads.instanceMatrix.array[i * 16 + 13]).toBeGreaterThan(.8);
    } finally { display.dispose(); }
});

test("maximum enemy facts, blessed casters and darts remain bounded, freeze and release all owned buffers", () => {
    const display = new EnemyPresentation(), effects = new CombatEffects(), height = () => 0;
    const disposed = vi.fn(); for (const mesh of [display.blades, display.rocks, display.threads, display.warnings]) mesh.geometry.addEventListener("dispose", disposed);
    try {
        for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) effects.add(EffectKind.EnemyJaws, 0, 0, 0, .35, 1.2, 0, 1);
        const render = () => {
            display.begin(effects.buffer, .4, height, 0, 0);
            for (let i = 0; i < MAX_ENEMIES; i++) {
                display.actor(ActorAction.Fault, .25, 0, 0, 0, 0, 0, 5, true);
                display.hand(ActorAction.Volley, .25, 0, 1, 0, 0, 5, 0, height);
            }
            for (let i = 0; i < MAX_PROJECTILES; i++) display.projectile(0, 1, 0, i, 1);
            display.upload();
        };
        render(); const matrices = display.blades.instanceMatrix.array.slice(); render();
        expect(display.blades.instanceMatrix.array).toEqual(matrices);
        for (const mesh of [display.blades, display.rocks, display.threads, display.warnings]) {
            expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count); expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true);
        }
        display.reset(); expect(display.blades.count + display.rocks.count + display.threads.count + display.warnings.count).toBe(0);
    } finally { display.dispose(); }
    expect(disposed).toHaveBeenCalledTimes(4);
});
