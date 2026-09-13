import type { MeshStandardMaterial, Vector4 } from "three";

/** Screen-stable coverage dither retains depth and instancing, including foliage alpha masks. */
export function installForestOcclusion(material: MeshStandardMaterial, focus: { value: Vector4 }): void {
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.uniforms.forestFocus = focus;
        shader.fragmentShader = "uniform vec4 forestFocus;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `
            #include <alphatest_fragment>
            if (forestFocus.w > 0.0 && forestFocus.z < -0.01) {
                vec3 fragment = -vViewPosition;
                float ratio = fragment.z / forestFocus.z;
                float radius = forestFocus.w * max(.01, ratio);
                float radial = length(fragment.xy - forestFocus.xy * ratio) / radius;
                float foreground = smoothstep(forestFocus.z, forestFocus.z + forestFocus.w * .5, fragment.z);
                float opacity = 1.0 - (1.0 - smoothstep(.3, 1.0, radial)) * foreground * .84;
                float coverage = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056, .00583715))));
                if (coverage > opacity) discard;
            }
        `);
    };
    material.customProgramCacheKey = () => `${key}:foreground-dither-v1`;
}
