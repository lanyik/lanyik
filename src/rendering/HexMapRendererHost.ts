import {
    ACESFilmicToneMapping,
    AmbientLight,
    Color,
    ColorRepresentation,
    DirectionalLight,
    Fog,
    Group,
    HemisphereLight,
    PerspectiveCamera,
    Scene,
    Texture,
    Vector3,
    WebGLRenderer
} from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import { WebGlGpuTimer, WebGlGpuTimerStats } from "./WebGlGpuTimer";

export interface HexMapRendererHostOptions {
    canvas: HTMLCanvasElement;
    antialias: boolean;
    skyVisible: boolean;
    horizonFogColor: ColorRepresentation;
    horizonFogStart: number;
    horizonFogEnd: number;
    contextLost?(): void;
    contextRestored?(): void;
}

export type WebGlContextState = "ready" | "lost" | "restoring" | "disposed";

const SUN_ELEVATION = 24 * Math.PI / 180;
const SUN_AZIMUTH = 205 * Math.PI / 180;

function createSunDirection(): Vector3 {
    return new Vector3().setFromSphericalCoords(1, Math.PI / 2 - SUN_ELEVATION, SUN_AZIMUTH);
}

export interface WebGlContextStats {
    readonly state: WebGlContextState;
    readonly generation: number;
    readonly losses: number;
    readonly restores: number;
}

// Stable owner for Three/WebGL objects and their context-bound lifetime.
// HexMap composes this host instead of also being the renderer factory.
export class HexMapRendererHost {
    public readonly renderer: WebGLRenderer;
    public readonly scene: Scene;
    public readonly worldRoot: Group;
    public readonly camera: PerspectiveCamera;
    private readonly sky: Sky;
    private readonly gpuTimer: WebGlGpuTimer;
    private contextState: WebGlContextState = "ready";
    private contextGeneration = 1;
    private contextLosses = 0;
    private contextRestores = 0;
    private disposed = false;

    constructor(private readonly options: HexMapRendererHostOptions) {
        this.scene = new Scene();
        const horizonColor = new Color(options.horizonFogColor);
        this.scene.background = horizonColor;
        this.scene.fog = new Fog(horizonColor, options.horizonFogStart, options.horizonFogEnd);
        this.worldRoot = new Group();
        this.worldRoot.name = "hex-map-world-root";
        this.scene.add(this.worldRoot);

        this.renderer = new WebGLRenderer({ canvas: options.canvas, antialias: options.antialias });
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.65;

        this.camera = new PerspectiveCamera(60, 1, 10, 100000);
        this.camera.position.set(900, 500, 1000);
        this.scene.add(this.camera);

        // Keep direct lighting aligned with the visible sky sun. A natural
        // hemisphere fill preserves normal-dependent shading on untextured
        // vegetation without the below-ground blue directional light that
        // previously left most tree faces nearly black.
        const primary = new DirectionalLight(0xfff3dc, 1.65);
        primary.position.copy(createSunDirection());
        this.scene.add(primary);
        this.scene.add(new HemisphereLight(0xc7e7ff, 0x435433, 1));
        this.scene.add(new AmbientLight(0xffffff, 0.18));

        this.sky = this.createSky(options.skyVisible);
        this.scene.add(this.sky);
        this.gpuTimer = new WebGlGpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
        options.canvas.addEventListener("webglcontextlost", this.onContextLost);
        options.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    }

    public resize(width: number, height: number, pixelRatio: number): void {
        if (this.disposed || this.contextState !== "ready" || width <= 0 || height <= 0) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height, false);
    }

    public pollGpuFrameMs(): number | undefined {
        return this.contextState === "ready" ? this.gpuTimer.poll() : undefined;
    }
    public get gpuTimingStats(): Readonly<WebGlGpuTimerStats> { return this.gpuTimer.stats; }
    public get contextStats(): Readonly<WebGlContextStats> {
        return {
            state: this.contextState,
            generation: this.contextGeneration,
            losses: this.contextLosses,
            restores: this.contextRestores
        };
    }

    public render(): void {
        if (this.disposed || this.contextState !== "ready") return;
        const measured = this.gpuTimer.begin();
        try {
            this.renderer.render(this.scene, this.camera);
        } finally {
            if (measured) this.gpuTimer.end();
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.contextState = "disposed";
        this.options.canvas.removeEventListener("webglcontextlost", this.onContextLost);
        this.options.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
        this.gpuTimer.dispose();
        this.sky.geometry.dispose();
        this.sky.material.dispose();
        this.renderer.renderLists.dispose();
        this.renderer.dispose();
    }

    private createSky(visible: boolean): Sky {
        const sky = new Sky();
        sky.visible = visible;
        sky.scale.setScalar(450000);
        sky.frustumCulled = false;
        const uniforms = sky.material.uniforms;
        uniforms.turbidity.value = 4;
        uniforms.rayleigh.value = 1.7;
        uniforms.mieCoefficient.value = 0.002;
        uniforms.mieDirectionalG.value = 0.76;
        uniforms.sunPosition.value.copy(createSunDirection());
        return sky;
    }

    private onContextLost = (event: Event): void => {
        event.preventDefault();
        if (this.disposed || this.contextState === "lost") return;
        this.contextState = "lost";
        this.contextLosses += 1;
        this.gpuTimer.handleContextLost();
        this.options.contextLost?.();
    };

    private onContextRestored = (): void => {
        if (this.disposed) return;
        this.contextState = "restoring";
        this.gpuTimer.handleContextRestored();
        this.renderer.resetState();
        this.invalidateManagedResources();
        this.contextGeneration += 1;
        this.contextRestores += 1;
        this.contextState = "ready";
        this.options.contextRestored?.();
    };

    private invalidateManagedResources(): void {
        this.scene.traverse(object => {
            const renderable = object as typeof object & {
                geometry?: { attributes?: Record<string, { needsUpdate: boolean }>; index?: { needsUpdate: boolean } | null };
                material?: unknown;
            };
            for (const attribute of Object.values(renderable.geometry?.attributes ?? {})) attribute.needsUpdate = true;
            if (renderable.geometry?.index) renderable.geometry.index.needsUpdate = true;
            const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
            for (const material of materials) {
                if (!material || typeof material !== "object") continue;
                (material as { needsUpdate: boolean }).needsUpdate = true;
                for (const value of Object.values(material)) {
                    if (value instanceof Texture) value.needsUpdate = true;
                }
            }
        });
    }
}
