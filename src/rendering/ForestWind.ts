import type { MeshDepthMaterial, MeshStandardMaterial } from "three";

/** Install once before compilation on both colour and depth materials; returns local-space bounds padding. */
export function installForestWind(material: MeshStandardMaterial | MeshDepthMaterial, time: { value: number }, height: number): number {
    if (!Number.isFinite(height) || height <= 0) throw new RangeError("Forest wind requires a positive model height");
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.uniforms.forestWindTime = time;
        shader.uniforms.forestWindHeight = { value: height };
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `
            #include <common>
            uniform float forestWindTime;
            uniform float forestWindHeight;
            // Translation-free phase: stable across floating origins, wrapped copies and all LODs.
            // All instances bend along the same parent-space direction despite their authored yaw.
            vec4 forestBend(float y) {
                vec2 direction = normalize(vec2(1.0, .4));
                float phase = 0.0;
                #ifdef USE_INSTANCING
                    float scale = max(length(instanceMatrix[0].xz), .0001);
                    vec2 yaw = instanceMatrix[0].xz / scale;
                    direction = vec2(dot(instanceMatrix[0].xz, direction), dot(instanceMatrix[2].xz, direction)) / scale;
                    phase = dot(yaw, vec2(3.1, 5.7)) + scale * 2.3;
                #endif
                float h = clamp(y / forestWindHeight, 0.0, 1.0);
                float gust = .7 * sin(forestWindTime * .8 + phase) + .3 * sin(forestWindTime * 1.3 + phase * 1.7);
                float flutterPhase = forestWindTime * 4.7 + phase + h * 11.0;
                vec2 across = vec2(-direction.y, direction.x);
                vec2 bend = direction * (.045 * gust) + across * (.004 * sin(flutterPhase));
                vec2 slope = 2.0 * h * bend + across * (.044 * h * h * cos(flutterPhase));
                if (y <= 0.0 || y >= forestWindHeight) slope = vec2(0.0);
                return vec4(forestWindHeight * h * h * bend, slope);
            }
        `).replace("#include <beginnormal_vertex>", `
            #include <beginnormal_vertex>
            objectNormal.y -= dot(objectNormal.xz, forestBend(position.y).zw);
            #ifdef USE_TANGENT
                objectTangent.xz += objectTangent.y * forestBend(position.y).zw;
            #endif
        `).replace("#include <begin_vertex>", `
            #include <begin_vertex>
            transformed.xz += forestBend(transformed.y).xy;
        `);
    };
    material.customProgramCacheKey = () => `${key}:forest-wind-v1`;
    return height * .05;
}
