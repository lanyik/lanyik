import { CubeCamera, HalfFloatType, LinearMipmapLinearFilter, NoToneMapping, PMREMGenerator, Scene, WebGLCubeRenderTarget, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { createSunDirection } from "./SunLight";
import { collectGeometryAllocations, type ResourceBudgetAccount } from "../runtime/ResourceBudget";

const SKY_BYTES = 6 * (256 * 256 * 4 - 1) / 3 * 8;
const ENVIRONMENT_BYTES = 768 * 1024 * 8;

/** A linear HDR cube baked on creation/restoration, independent of terrain fog and world origin. */
export class Skybox {
    public readonly target = new WebGLCubeRenderTarget(256, { type: HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    private readonly scene = new Scene();
    private readonly sky = new Sky();
    private readonly camera = new CubeCamera(1, 2000, this.target);
    private filtered: WebGLRenderTarget | undefined;
    public get environment(): WebGLRenderTarget {
        if (!this.filtered) throw new Error("Sky environment has not been baked");
        return this.filtered;
    }
    constructor(private readonly resources: ResourceBudgetAccount) {
        resources.acquireRequired("sky-geometry", {}, true, collectGeometryAllocations([this.sky.geometry]));
        resources.acquireRequired("sky", { gpuBytes: SKY_BYTES + ENVIRONMENT_BYTES, textureBytes: SKY_BYTES + ENVIRONMENT_BYTES }, true);
        this.target.texture.name = "procedural-daylight-skybox";
        this.sky.scale.setScalar(1000); this.sky.frustumCulled = false;
        const uniforms = this.sky.material.uniforms;
        // Calibrate the procedural sky radiance once, before both background and PMREM.
        // Exposure remains a single final transform; no separate model/terrain boost.
        uniforms.radianceScale = { value: .25 };
        this.sky.material.fragmentShader = "uniform float radianceScale;\n" + this.sky.material.fragmentShader
            .replace("gl_FragColor = vec4( texColor, 1.0 );", "gl_FragColor = vec4( texColor * radianceScale, 1.0 );");
        uniforms.turbidity.value = 2.2; uniforms.rayleigh.value = 1.7;
        uniforms.mieCoefficient.value = .002; uniforms.mieDirectionalG.value = .76;
        uniforms.sunPosition.value.copy(createSunDirection());
        uniforms.cloudCoverage.value = .48; uniforms.cloudDensity.value = .65;
        uniforms.cloudElevation.value = .35;
        this.scene.add(this.sky);
    }
    public bake(renderer: WebGLRenderer): void {
        const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
        const toneMapping = renderer.toneMapping, xr = renderer.xr.enabled;
        let pmrem: PMREMGenerator | undefined;
        // Fixed 256-face sky: six RGBA16F mip chains; PMREM keeps one 768x1024 atlas
        // and uses one equally-sized scratch atlas only during baking.
        const temporaryBytes = ENVIRONMENT_BYTES * (this.filtered ? 2 : 1);
        this.resources.acquireRequired("sky-bake", { gpuBytes: temporaryBytes, textureBytes: temporaryBytes }, true);
        try {
            renderer.toneMapping = NoToneMapping;
            this.camera.update(renderer, this.scene);
            pmrem = new PMREMGenerator(renderer);
            const filtered = pmrem.fromCubemap(this.target.texture);
            this.filtered?.dispose();
            this.filtered = filtered;
            this.filtered.texture.name = "sky-prefiltered-environment";
        } finally {
            pmrem?.dispose(); this.resources.release("sky-bake");
            renderer.toneMapping = toneMapping; renderer.xr.enabled = xr; renderer.setRenderTarget(target, face, mip);
        }
    }
    public handleContextLost(): void {
        this.target.dispose(); this.filtered?.dispose(); this.filtered = undefined;
        this.sky.geometry.dispose(); this.sky.material.dispose();
    }
    public dispose(): void {
        this.target.dispose(); this.filtered?.dispose(); this.sky.geometry.dispose(); this.sky.material.dispose();
        this.resources.release("sky");
        this.resources.release("sky-geometry");
    }
}
