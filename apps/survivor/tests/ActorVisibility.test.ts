import { expect, test } from "vitest";
import { MeshStandardMaterial, Vector2, ShaderLib } from "three";
import { actorVisibility, installActorFade, ACTOR_FADE_END, ACTOR_FADE_START } from "../src/presentation/ActorVisibility";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { RegionalWorld } from "../src/core/RegionalWorld";

test("resident enemies remain visible when crossing the active simulation boundary", () => {
    const combat = new CombatSimulation("visible-before-active");
    const world = new RegionalWorld("visible-before-active", { x: 0, z: 0 });
    world.synchronize(0, 0);
    const state = combat.getRenderState();
    let visibleOutsideActive = 0;
    for (let cursor = 0; cursor < state.entities.enemies.count; cursor++) {
        const i = state.entities.enemies.slots[cursor];
        const distance = Math.hypot(state.entities.position.x[i], state.entities.position.z[i]);
        if (world.lodAt(state.entities.position.x[i], state.entities.position.z[i]) !== "active" && actorVisibility(distance) === 1) visibleOutsideActive++;
    }
    expect(visibleOutsideActive).toBeGreaterThan(0);
    expect(actorVisibility(ACTOR_FADE_START)).toBe(1);
    expect(actorVisibility((ACTOR_FADE_START + ACTOR_FADE_END) / 2)).toBeCloseTo(.5);
    expect(actorVisibility(ACTOR_FADE_END)).toBe(0);
    for (let distance = ACTOR_FADE_START; distance < ACTOR_FADE_END; distance += .05) {
        expect(actorVisibility(distance) - actorVisibility(distance + .05)).toBeLessThan(.013);
    }
});

test("fading retains opaque depth writes and shares an interpolated view-center uniform", () => {
    const material = new MeshStandardMaterial();
    const center = new Vector2(100, -200);
    installActorFade(material, center, true);
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as Parameters<typeof material.onBeforeCompile>[1]);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.alphaHash).toBe(true);
    const uniform = (shader.uniforms as Record<string, { value: Vector2 }>).actorViewCenter;
    expect(uniform.value).toBe(center);
    center.set(-400, 800);
    expect(uniform.value.toArray()).toEqual([-400, 800]);
    material.dispose();
});
