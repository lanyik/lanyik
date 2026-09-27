import {
    ACESFilmicToneMapping,
    Color,
    ColorRepresentation,
    DirectionalLight,
    Fog,
    Group,
    PerspectiveCamera,
    Scene,
    Texture,
    SRGBColorSpace,
    Vector2,
    WebGLRenderer
} from "three";
import { Skybox } from "./Skybox";
import { SkyFog } from "./SkyFog";

import { WebGlGpuTimer, WebGlGpuTimerStats } from "./WebGlGpuTimer";
import type { GroundProjection } from "./GroundProjection";
import { createSunDirection, SUN_COLOR, SUN_INTENSITY } from "./SunLight";
import { SceneOutput } from "./SceneOutput";
import { WorldLighting } from "./WorldLighting";
import { NearShadows } from "./NearShadows";
import type { ResourceBudgetAccount } from "../runtime/ResourceBudget";

export interface HexMapRendererHostOptions {
    canvas: HTMLCanvasElement;
    antialias: boolean;
    skyVisible: boolean;
    shadowRadius?: number;
    horizonFogColor: ColorRepresentation;
    horizonFogStart: number;
    horizonFogEnd: number;
    /** The host owns and disposes this account; mandatory targets are pinned working set. */
    resources: ResourceBudgetAccount;
    contextLost?(): void;
    contextRestored?(): void;
    contextError?(error: Error): void;
}

export type WebGlContextState = "ready" | "lost" | "restoring" | "failed" | "disposed";

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
    private readonly sky: Skybox;
    private readonly lighting: WorldLighting;
    private readonly output: SceneOutput;
    private readonly shadows?: NearShadows;
    private readonly drawingSize = new Vector2();
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

        let renderer: WebGLRenderer | undefined;
        let sky: Skybox | undefined;
        let gpuTimer: WebGlGpuTimer | undefined;
        let output: SceneOutput | undefined;
        let shadows: NearShadows | undefined;
        try {
            if (options.shadowRadius !== undefined && (!Number.isFinite(options.shadowRadius) || options.shadowRadius < 0)) {
                throw new RangeError("shadowRadius must be non-negative and finite");
            }
            this.renderer = renderer = new WebGLRenderer({ canvas: options.canvas, antialias: false });
            if (!this.renderer.extensions.has("EXT_color_buffer_float")) throw new Error("Linear HDR rendering requires EXT_color_buffer_float");
            this.renderer.toneMapping = ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 0.65;
            this.renderer.outputColorSpace = SRGBColorSpace;
            this.output = output = new SceneOutput(options.antialias, options.resources);

            this.camera = new PerspectiveCamera(60, 1, 10, 100000);
            this.camera.position.set(900, 500, 1000);
            this.scene.add(this.camera);

            const primary = new DirectionalLight(SUN_COLOR, SUN_INTENSITY);
            primary.position.copy(createSunDirection());
            this.scene.add(primary);
            this.scene.add(primary.target);
            if (options.shadowRadius) this.shadows = shadows = new NearShadows(primary, options.shadowRadius, this.camera, this.renderer, options.resources);
            // skyVisible controls the background; surface illumination always uses this sky.
            this.sky = sky = new Skybox(options.resources);
            sky.bake(this.renderer);
            this.scene.environment = sky.environment.texture;
            if (options.skyVisible) this.scene.background = sky.target.texture;
            const skyFog = options.skyVisible ? new SkyFog(sky.target.texture, this.camera) : undefined;
            this.lighting = new WorldLighting(sky.environment, this.camera, skyFog, shadows);
            this.gpuTimer = gpuTimer = new WebGlGpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
            options.canvas.addEventListener("webglcontextlost", this.onContextLost);
            options.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
        } catch (reason) {
            options.canvas.removeEventListener("webglcontextlost", this.onContextLost);
            options.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
            gpuTimer?.dispose();
            output?.dispose();
            shadows?.dispose();
            sky?.dispose();
            options.resources.dispose();
            renderer?.dispose();
            throw reason;
        }
    }

    public resize(width: number, height: number, pixelRatio: number): void {
        if (this.disposed || this.contextState !== "ready" || width <= 0 || height <= 0) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height, false);
        this.renderer.getDrawingBufferSize(this.drawingSize);
        this.output.resize(this.drawingSize.x, this.drawingSize.y);
    }

    public pollGpuFrameMs(): number | undefined {
        return this.contextState === "ready" ? this.gpuTimer.poll() : undefined;
    }
    public prepareShadows(focus: import("three").Vector3, origin: Vector2): void { this.shadows?.prepare(focus, origin); }
    public get shadowFrustum(): import("three").Frustum | undefined { return this.shadows?.light.shadow.getFrustum(); }
    public get gpuTimingStats(): Readonly<WebGlGpuTimerStats> { return this.gpuTimer.stats; }
    public get contextStats(): Readonly<WebGlContextStats> {
        return {
            state: this.contextState,
            generation: this.contextGeneration,
            losses: this.contextLosses,
            restores: this.contextRestores
        };
    }

    public render(projection?: GroundProjection, focus = this.worldRoot.position): void {
        if (this.disposed || this.contextState !== "ready") return;
        const measured = this.gpuTimer.begin();
        const autoReset = this.renderer.info.autoReset;
        try {
            this.renderer.info.autoReset = false;
            this.renderer.info.reset();
            projection?.render(this.renderer);
            this.lighting.prepare(this.worldRoot, focus);
            this.output.render(this.renderer, this.scene, this.camera);
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
        this.lighting.dispose();
        this.output.dispose();
        this.shadows?.dispose();
        this.sky.dispose();
        this.scene.environment = null;
        this.options.resources.dispose();
        this.renderer.renderLists.dispose();
        this.renderer.dispose();
    }

    private onContextLost = (event: Event): void => {
        event.preventDefault();
        if (this.disposed || this.contextState === "lost") return;
        this.contextState = "lost";
        this.contextLosses += 1;
        this.gpuTimer.handleContextLost();
        this.output.handleContextLost();
        this.shadows?.handleContextLost();
        this.sky.handleContextLost();
        this.options.contextLost?.();
    };

    private onContextRestored = (): void => {
        if (this.disposed) return;
        this.contextState = "restoring";
        try {
            this.gpuTimer.handleContextRestored();
            this.renderer.resetState();
            this.invalidateManagedResources();
            this.sky.bake(this.renderer);
            this.scene.environment = this.sky.environment.texture;
            this.lighting.setEnvironment(this.sky.environment.texture);
            this.contextGeneration += 1;
            this.contextRestores += 1;
            this.contextState = "ready";
            this.options.contextRestored?.();
        } catch (reason) {
            this.contextState = "failed";
            const error = reason instanceof Error ? reason : new Error(String(reason));
            if (this.options.contextError) this.options.contextError(error);
            else throw error;
        }
    };

    private invalidateManagedResources(): void {
        this.scene.traverse(object => {
            const renderable = object as typeof object & {
                geometry?: { attributes?: Record<string, { needsUpdate: boolean }>; index?: { needsUpdate: boolean } | null };
                material?: unknown;
            };
            for (const attribute of Object.values(renderable.geometry?.attributes ?? {})) attribute.needsUpdate = true;
            if (renderable.geometry?.index) renderable.geometry.index.needsUpdate = true;
            const materials = Array.isArray(renderable.material) ? [...renderable.material] : [renderable.material];
            materials.push(object.customDepthMaterial);
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
