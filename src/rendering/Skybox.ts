import { CubeCamera, HalfFloatType, LinearMipmapLinearFilter, NoToneMapping, Scene, WebGLCubeRenderTarget, type WebGLRenderer } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { createSunDirection } from "./SunLight";

/** A linear HDR cube baked on creation/restoration, independent of terrain fog and world origin. */
export class Skybox {
    public readonly target = new WebGLCubeRenderTarget(256, { type: HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    private readonly scene = new Scene();
    private readonly sky = new Sky();
    private readonly camera = new CubeCamera(1, 2000, this.target);
    constructor() {
        this.target.texture.name = "procedural-daylight-skybox";
        this.sky.scale.setScalar(1000); this.sky.frustumCulled = false;
        const uniforms = this.sky.material.uniforms;
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
        try { renderer.toneMapping = NoToneMapping; this.camera.update(renderer, this.scene); }
        finally { renderer.toneMapping = toneMapping; renderer.xr.enabled = xr; renderer.setRenderTarget(target, face, mip); }
    }
    public dispose(): void { this.target.dispose(); this.sky.geometry.dispose(); this.sky.material.dispose(); }
}
