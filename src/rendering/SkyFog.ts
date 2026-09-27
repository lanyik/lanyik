import { Material, RawShaderMaterial, Vector2, type CubeTexture, type PerspectiveCamera, type Vector3 } from "three";

// All scene materials blend atmospheric radiance in linear HDR, before SceneOutput.
const HEADER = `
precision highp float;
uniform highp samplerCube skyFogMap;
uniform mat4 skyFogCamera;
uniform vec2 skyFogCenter;
vec3 skyFogColor(vec3 direction) {
    #if __VERSION__ >= 300
        return texture(skyFogMap, normalize(direction)).rgb;
    #else
        return textureCube(skyFogMap, normalize(direction)).rgb;
    #endif
}
vec3 skyFogBlend(vec3 color, vec3 viewPoint, float nearDistance, float farDistance) {
    vec3 worldPoint = (skyFogCamera * vec4(viewPoint, 1.)).xyz;
    float amount = smoothstep(nearDistance, farDistance, length(worldPoint.xz - skyFogCenter));
    if (amount <= 0.) return color;
    return mix(color, skyFogColor(mat3(skyFogCamera) * viewPoint), amount);
}
`;

/** Radial atmosphere erases distant silhouettes into the actual sky, at any camera angle or terrain height. */
export class SkyFog {
    private readonly uniforms;
    constructor(sky: CubeTexture, camera: PerspectiveCamera) {
        this.uniforms = { skyFogMap: { value: sky }, skyFogCamera: { value: camera.matrixWorld },
            skyFogCenter: { value: new Vector2() } };
    }
    public prepare(focus: Vector3): void {
        this.uniforms.skyFogCenter.value.set(focus.x, focus.z);
    }
    public accepts(material: Material): boolean {
        return material instanceof RawShaderMaterial ? material.fragmentShader.includes("vec3 applyHorizonFog(")
            : !!(material as Material & { fog?: boolean }).fog;
    }
    public apply(shader: Parameters<Material["onBeforeCompile"]>[0], material: Material): void {
        const raw = material instanceof RawShaderMaterial;
        Object.assign(shader.uniforms, this.uniforms);
        const glsl3 = raw && material.glslVersion === "300 es";
        shader.vertexShader = `${glsl3 ? "out" : "varying"} highp vec3 vSkyFogPoint;\n` + shader.vertexShader;
        shader.fragmentShader = `${glsl3 ? "in" : "varying"} highp vec3 vSkyFogPoint;\n${HEADER}\n` + shader.fragmentShader;
        if (raw) {
            shader.vertexShader = shader.vertexShader.replace("vHorizonFogDepth = -mvPosition.z;", "vHorizonFogDepth = -mvPosition.z; vSkyFogPoint = mvPosition.xyz;");
            shader.fragmentShader = shader.fragmentShader.replace("return mix(color, fogColor, fogFactor);", "return skyFogBlend(color, vSkyFogPoint, fogNear, fogFar);");
        } else {
            shader.vertexShader = shader.vertexShader.replace("#include <fog_vertex>", "#include <fog_vertex>\nvSkyFogPoint = mvPosition.xyz;");
            shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", "#ifdef USE_FOG\ngl_FragColor.rgb = skyFogBlend(gl_FragColor.rgb, vSkyFogPoint, fogNear, fogFar);\n#endif");
        }
    }
}
