import { HalfFloatType, LinearSRGBColorSpace, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { ResourceBudgetAccount } from "../runtime/ResourceBudget";

/** Linear HDR scene composition followed by one display transform. No effect chain or history. */
export class SceneOutput {
    public readonly target: WebGLRenderTarget;
    private readonly output = new OutputPass();
    private width = 0;
    private height = 0;
    constructor(antialias: boolean, private readonly resources: ResourceBudgetAccount) {
        this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, colorSpace: LinearSRGBColorSpace,
            depthBuffer: true, stencilBuffer: false, samples: antialias ? 4 : 0 });
        this.target.texture.name = "linear-scene-color";
        this.output.renderToScreen = true;
        this.resize(1, 1);
    }
    public resize(width: number, height: number): void {
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new RangeError("Scene output requires positive integer dimensions");
        if (width === this.width && height === this.height) return;
        // RGBA16F color (8), depth renderbuffer (4), plus multisample color/depth.
        // This is an allocation estimate, not a claim about driver VRAM.
        const pixels = width * height, bytes = pixels * (12 + this.target.samples * 12);
        this.resources.release("scene-output");
        this.resources.acquireRequired("scene-output", { gpuBytes: bytes, textureBytes: pixels * 8 }, true);
        this.target.setSize(width, height);
        this.width = width; this.height = height;
    }
    public render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
        const previous = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
        try {
            renderer.setRenderTarget(this.target);
            renderer.render(scene, camera);
            this.output.render(renderer, this.target, this.target, 0, false);
        } finally { renderer.setRenderTarget(previous, face, mip); }
    }
    public handleContextLost(): void {
        // Delete old context handles while the context is lost, before Three resets its caches.
        this.target.dispose(); this.output.dispose(); this.output.material.needsUpdate = true;
    }
    public dispose(): void {
        this.target.dispose(); this.output.dispose(); this.resources.release("scene-output");
    }
}
