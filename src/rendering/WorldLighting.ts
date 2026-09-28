import { Color, Material, Object3D, RawShaderMaterial, type PerspectiveCamera, type Texture, type WebGLRenderTarget } from "three";
import { createSunDirection, SUN_COLOR, SUN_INTENSITY } from "./SunLight";
import type { SkyFog } from "./SkyFog";
import type { NearShadows } from "./NearShadows";

/** Binds raw terrain/water/grass to the scene lighting, without per-object material clones. */
export class WorldLighting {
    private readonly uniforms;
    private readonly materials = new Map<Material, () => void>();
    private readonly defines: Record<string, string>;
    constructor(environment: WebGLRenderTarget, camera: PerspectiveCamera, private readonly fog?: SkyFog, private readonly shadows?: NearShadows) {
        this.uniforms = { worldEnvironment: { value: environment.texture }, worldLightingCamera: { value: camera.matrixWorld },
            worldSunColor: { value: new Color(SUN_COLOR).multiplyScalar(SUN_INTENSITY) }, worldSunDirection: { value: createSunDirection() } };
        this.defines = { CUBEUV_TEXEL_WIDTH: String(1 / environment.width), CUBEUV_TEXEL_HEIGHT: String(1 / environment.height),
            CUBEUV_MAX_MIP: `${Math.log2(environment.height) - 2}.0` };
    }
    public setEnvironment(texture: Texture): void { this.uniforms.worldEnvironment.value = texture; }
    public prepare(root: Object3D, focus = root.position): void {
        this.fog?.prepare(focus);
        root.traverseVisible(this.visit);
    }
    private readonly visit = (object: Object3D): void => {
        const material = (object as Object3D & { material?: Material | Material[] }).material;
        if (Array.isArray(material)) { for (const item of material) this.install(item); }
        else if (material) this.install(material);
    };
    private install(material: Material): void {
        if (this.materials.has(material)) return;
        const lit = material instanceof RawShaderMaterial && material.fragmentShader.includes("uniform sampler2D worldEnvironment;");
        const fog = this.fog?.accepts(material) ? this.fog : undefined;
        const shadows = lit || this.shadows?.accepts(material) ? this.shadows : undefined;
        if (!lit && !fog && !shadows) return;
        const compile = material.onBeforeCompile, key = material.customProgramCacheKey, originalKey = key.call(material);
        const originalDefines = material instanceof RawShaderMaterial ? material.defines : undefined;
        if (lit) material.defines = { ...originalDefines, ...this.defines };
        material.onBeforeCompile = (shader, renderer) => {
            compile.call(material, shader, renderer);
            if (lit) {
                Object.assign(shader.uniforms, this.uniforms);
                // WebGLRenderer supplies its shared DFG texture for this uniform, just as for Standard materials.
                if (shader.fragmentShader.includes("uniform sampler2D dfgLUT;")) shader.uniforms.dfgLUT = { value: null };
            }
            fog?.apply(shader, material);
            shadows?.apply(shader, material);
        };
        material.customProgramCacheKey = () => `${originalKey}:world-lighting-v2:${lit}:${!!fog}:${!!shadows}`;
        material.needsUpdate = true;
        const release = () => {
            material.removeEventListener("dispose", release); this.materials.delete(material);
            material.onBeforeCompile = compile; material.customProgramCacheKey = key;
            if (lit) material.defines = originalDefines!;
            material.needsUpdate = true;
        };
        material.addEventListener("dispose", release); this.materials.set(material, release);
    }
    public dispose(): void { for (const release of this.materials.values()) release(); }
}
