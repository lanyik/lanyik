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
    WebGLRenderer
} from "three";
import { Skybox } from "./Skybox";

import { WebGlGpuTimer, WebGlGpuTimerStats } from "./WebGlGpuTimer";
import type { GroundProjection } from "./GroundProjection";
import { createSunDirection } from "./SunLight";

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
    private readonly sky: Skybox | undefined;
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
        let sky: Skybox | undefined;
        let gpuTimer: WebGlGpuTimer | undefined;
        try {
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

            this.sky = sky = options.skyVisible ? new Skybox() : undefined;
            if (sky) { sky.bake(this.renderer); this.scene.background = sky.target.texture; }
            this.gpuTimer = gpuTimer = new WebGlGpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
            options.canvas.addEventListener("webglcontextlost", this.onContextLost);
            options.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
        } catch (reason) {
            options.canvas.removeEventListener("webglcontextlost", this.onContextLost);
            options.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
            gpuTimer?.dispose();
            sky?.dispose();
            this.renderer.dispose();
            throw reason;
        }
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

    public render(projection?: GroundProjection): void {
        if (this.disposed || this.contextState !== "ready") return;
        const measured = this.gpuTimer.begin();
        const autoReset = this.renderer.info.autoReset;
        try {
            this.renderer.info.autoReset = false;
            this.renderer.info.reset();
            projection?.render(this.renderer);
            this.renderer.render(this.scene, this.camera);
        } finally {
            this.renderer.info.autoReset = autoReset;
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
        this.sky?.dispose();
        this.renderer.renderLists.dispose();
        this.renderer.dispose();
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
        this.sky?.bake(this.renderer);
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
