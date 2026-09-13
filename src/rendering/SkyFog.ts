import { Material, Object3D, RawShaderMaterial, Vector2, type CubeTexture, type PerspectiveCamera, type Vector3 } from "three";

// The host uses ACES + sRGB. Both custom display-color shaders and Three's
// standard shaders blend after color output, against this same sky sample.
const HEADER = `
precision highp float;
uniform highp samplerCube skyFogMap;
uniform mat4 skyFogCamera;
uniform vec2 skyFogCenter;
uniform float skyFogExposure;
vec3 skyFogColor(vec3 direction) {
    #if __VERSION__ >= 300
        vec3 c = texture(skyFogMap, normalize(direction)).rgb;
    #else
        vec3 c = textureCube(skyFogMap, normalize(direction)).rgb;
    #endif
    c = mat3(.59719,.07600,.02840, .35458,.90834,.13383, .04823,.01566,.83777) * (c * skyFogExposure / .6);
    c = (c * (c + .0245786) - .000090537) / (c * (.983729 * c + .4329510) + .238081);
    c = clamp(mat3(1.60475,-.10208,-.00327, -.53108,1.10813,-.07276, -.07367,-.00605,1.07602) * c, 0., 1.);
    return mix(c * 12.92, 1.055 * pow(c, vec3(.41666)) - .055, step(vec3(.0031308), c));
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
    private readonly materials = new Map<Material, () => void>();
    constructor(sky: CubeTexture, camera: PerspectiveCamera) {
        this.uniforms = { skyFogMap: { value: sky }, skyFogCamera: { value: camera.matrixWorld },
            skyFogCenter: { value: new Vector2() }, skyFogExposure: { value: .65 } };
    }
    public prepare(root: Object3D, focus: Vector3, exposure: number): void {
        this.uniforms.skyFogCenter.value.set(focus.x, focus.z); this.uniforms.skyFogExposure.value = exposure;
        root.traverseVisible(this.visit);
    }
    private readonly visit = (object: Object3D): void => {
        const material = (object as Object3D & { material?: Material | Material[] }).material;
        if (Array.isArray(material)) { for (const item of material) this.install(item); }
        else if (material) this.install(material);
    };
    private install(material: Material): void {
        if (this.materials.has(material)) return;
        const raw = material instanceof RawShaderMaterial;
        if (raw ? !material.fragmentShader.includes("vec3 applyHorizonFog(") : !(material as Material & { fog?: boolean }).fog) return;
        const compile = material.onBeforeCompile, key = material.customProgramCacheKey, originalKey = key.call(material);
        material.onBeforeCompile = (shader, renderer) => {
            compile.call(material, shader, renderer);
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
        };
        material.customProgramCacheKey = () => `${originalKey}:radial-sky-fog-v1`;
        material.needsUpdate = true;
        const release = () => {
            material.removeEventListener("dispose", release); this.materials.delete(material);
            material.onBeforeCompile = compile; material.customProgramCacheKey = key; material.needsUpdate = true;
        };
        material.addEventListener("dispose", release); this.materials.set(material, release);
    }
    public dispose(): void { for (const release of this.materials.values()) release(); }
}
