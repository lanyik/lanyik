import type { Material, Vector2 } from "three";
import { WORLD_VIEW } from "../core/WorldView";

// The outermost resident ring is invisible before its chunks enter or leave residency.
export const ACTOR_FADE_END = WORLD_VIEW.actorFadeEnd;
export const ACTOR_FADE_START = WORLD_VIEW.actorFadeStart;

export function actorVisibility(distance: number): number {
    const t = Math.max(0, Math.min(1, (distance - ACTOR_FADE_START) / (ACTOR_FADE_END - ACTOR_FADE_START)));
    return 1 - t * t * (3 - 2 * t);
}

/** Alpha hashing keeps instance depth writes and avoids transparent-instance sorting. */
export function installActorFade(material: Material, center: Vector2, homeAnchor = false): void {
    const compile = material.onBeforeCompile.bind(material), programKey = material.customProgramCacheKey();
    material.alphaHash = true;
    material.onBeforeCompile = (shader, renderer) => {
        compile(shader, renderer);
        shader.uniforms.actorViewCenter = { value: center };
        shader.vertexShader = `${homeAnchor ? "attribute vec2 actorHome;" : ""}\nuniform vec2 actorViewCenter; varying float actorDistance;\n${shader.vertexShader}`
            .replace("#include <project_vertex>", `#include <project_vertex>
                vec4 actorPosition = vec4(transformed, 1.0);
                #ifdef USE_INSTANCING
                    actorPosition = instanceMatrix * actorPosition;
                #endif
                actorDistance = length(actorPosition.xz - actorViewCenter);
                ${homeAnchor ? "actorDistance = max(actorDistance, length(actorHome - actorViewCenter));" : ""}`);
        shader.fragmentShader = `varying float actorDistance;\n${shader.fragmentShader}`
            .replace("#include <alphahash_fragment>", `diffuseColor.a *= 1.0 - smoothstep(${ACTOR_FADE_START.toFixed(1)}, ${ACTOR_FADE_END.toFixed(1)}, actorDistance);
                #include <alphahash_fragment>`);
    };
    material.customProgramCacheKey = () => `${programKey}:survivor-distance-fade-v1-${homeAnchor}`;
    material.needsUpdate = true;
}
