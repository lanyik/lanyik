import { Color, Group, OrthographicCamera, Scene, Vector2, Vector4, WebGLRenderer, WebGLRenderTarget } from "three";

/** One bounded, top-down decal pass, sampled by the terrain at its actual surface fragments. */
export class GroundProjection {
    public readonly root = new Group();
    public readonly bounds = new Vector4();
    /** Absolute logical world center retained as JS doubles, never uploaded to a shader. */
    public readonly centerWorld = new Vector2();
    public readonly target: WebGLRenderTarget;
    private readonly scene = new Scene();
    private readonly camera = new OrthographicCamera();
    private readonly clearColor = new Color();

    constructor(public readonly span: number, resolution: number) {
        if (!Number.isFinite(span) || span <= 0 || !Number.isSafeInteger(resolution) || resolution < 1) {
            throw new RangeError("Ground projection requires a positive span and integer resolution");
        }
        this.target = new WebGLRenderTarget(resolution, resolution, { depthBuffer: false, stencilBuffer: false });
        this.target.texture.name = "ground-projection";
        this.scene.add(this.root);
        this.camera.up.set(0, 0, -1);
        this.camera.near = .1; this.camera.far = 2;
        this.camera.left = this.camera.bottom = -span / 2;
        this.camera.right = this.camera.top = span / 2;
        this.camera.rotation.x = -Math.PI / 2;
        this.camera.updateProjectionMatrix();
        this.setCenter(0, 0, 1);
    }

    /** Source objects use tile-size units relative to (x,z); absolute bounds are CPU metadata only. */
    public setCenter(x: number, z: number, tileSize: number): void {
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError("Invalid ground projection coordinates");
        const half = this.span / 2;
        this.bounds.set((x - half) * tileSize, (z - half) * tileSize, this.span * tileSize, this.span * tileSize);
        this.centerWorld.set(x * tileSize, z * tileSize);
        this.camera.position.set(0, 1, 0);
    }

    public render(renderer: WebGLRenderer): void {
        const target = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear;
        const face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel();
        renderer.getClearColor(this.clearColor);
        try {
            renderer.setRenderTarget(this.target);
            renderer.setClearColor(0, 0);
            renderer.autoClear = true;
            renderer.render(this.scene, this.camera);
        } finally {
            renderer.setRenderTarget(target, face, level);
            renderer.setClearColor(this.clearColor, alpha);
            renderer.autoClear = autoClear;
        }
    }

    public dispose(): void { this.target.dispose(); this.root.clear(); }
}
