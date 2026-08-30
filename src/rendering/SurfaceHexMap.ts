import {
    Object3D,
    PerspectiveCamera,
    Scene,
    Vector3,
    WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { EventEmitter } from "../EventEmitter";
import { WorldPoint } from "../world/WorldPoint";
import { WorldDeltaStore } from "../world/WorldDeltaStore";
import { WorldEditTransaction } from "../world/WorldEditing";
import { SurfaceCompilationWorker } from "../world/semantic/SurfaceCompilationService";
import { surfaceToWorld, worldToSurface } from "../world/semantic/SurfaceLattice";
import { WorldAuthoritySource } from "../world/semantic/WorldAuthorityRepository";
import { planWorldRenderDemand } from "./WorldRenderDemandPlanner";
import type { WorldRenderSessionStats } from "./WorldRenderSession";
import {
    WorldSurfaceRuntime,
    WorldSurfaceRuntimeBudgets
} from "./WorldSurfaceRuntime";

export interface HexMapOptions {
    readonly element: string | HTMLCanvasElement;
    readonly hexSize?: number;
    readonly heightScale?: number;
    readonly antialias?: boolean;
    readonly maxPixelRatio?: number;
    readonly fieldOfView?: number;
    readonly nearPlane?: number;
    readonly farPlane?: number;
}

export interface WorldLoadOptions {
    readonly source: WorldAuthoritySource;
    readonly worker: SurfaceCompilationWorker;
    readonly budgets: WorldSurfaceRuntimeBudgets;
    readonly store?: WorldDeltaStore;
    readonly initialTile?: WorldPoint;
    readonly visibleRadiusTiles: number;
    readonly prefetchRadiusTiles: number;
    readonly lod1DistanceTiles: number;
    readonly lod2DistanceTiles: number;
}

export interface HexMapStats {
    readonly state: "ready" | "loading" | "disposed";
    readonly worldLoaded: boolean;
    readonly renderedFrames: number;
    readonly demandUpdates: number;
    readonly renderSession: Readonly<WorldRenderSessionStats> | undefined;
}

function resolveCanvas(value: HexMapOptions["element"]): HTMLCanvasElement {
    const element = typeof value === "string" ? document.querySelector(value) : value;
    if (!(element instanceof HTMLCanvasElement)) {
        throw new TypeError("HexMap element must resolve to an HTMLCanvasElement");
    }
    return element;
}

function assertPositive(name: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
}

function canonicalTile(source: WorldAuthoritySource, point: WorldPoint): WorldPoint {
    if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
        throw new RangeError("world load initialTile must use safe integers");
    }
    const descriptor = source.descriptor;
    if (descriptor.topology === "bounded") {
        if (point.x < 0 || point.y < 0 || point.x >= descriptor.width || point.y >= descriptor.height) {
            throw new RangeError("world load initialTile is outside bounded topology");
        }
        return Object.freeze({ ...point });
    }
    if (descriptor.topology === "toroidal") {
        const modulo = (value: number, size: number) => ((value % size) + size) % size;
        return Object.freeze({ x: modulo(point.x, descriptor.width), y: modulo(point.y, descriptor.height) });
    }
    return Object.freeze({ ...point });
}

export class HexMap extends EventEmitter {
    public readonly canvas: HTMLCanvasElement;
    public readonly renderer: WebGLRenderer;
    public readonly camera: PerspectiveCamera;
    public readonly controls: OrbitControls;
    public readonly hexSize: number;
    public readonly heightScale: number;
    private activeScene = new Scene();
    private runtimeValue: WorldSurfaceRuntime | undefined;
    private loadOptions: WorldLoadOptions | undefined;
    private resizeObserver: ResizeObserver | undefined;
    private animationFrame: number | undefined;
    private loadRevision = 0;
    private renderedFrames = 0;
    private demandUpdates = 0;
    private demandSignature = "";
    private stateValue: "ready" | "loading" | "disposed" = "ready";

    constructor(options: HexMapOptions) {
        super();
        if (!options || typeof options !== "object") throw new TypeError("HexMap options are required");
        this.canvas = resolveCanvas(options.element);
        this.hexSize = options.hexSize ?? 1;
        this.heightScale = options.heightScale ?? 80;
        const maxPixelRatio = options.maxPixelRatio ?? 2;
        assertPositive("hexSize", this.hexSize);
        assertPositive("heightScale", this.heightScale);
        assertPositive("maxPixelRatio", maxPixelRatio);
        this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: options.antialias ?? true });
        const context = this.renderer.getContext();
        if (typeof WebGL2RenderingContext !== "undefined" && !(context instanceof WebGL2RenderingContext)) {
            this.renderer.dispose();
            throw new Error("HexMap requires WebGL2 for array textures and GLSL 3");
        }
        this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio));
        this.camera = new PerspectiveCamera(
            options.fieldOfView ?? 45,
            1,
            options.nearPlane ?? 0.1,
            options.farPlane ?? 100_000
        );
        this.camera.position.set(18 * this.hexSize, 24 * this.hexSize, 18 * this.hexSize);
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0, 0);
        this.resize();
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.canvas);
        } else {
            window.addEventListener("resize", this.resize);
        }
        this.canvas.addEventListener("webglcontextlost", this.contextLost);
        this.canvas.addEventListener("webglcontextrestored", this.contextRestored);
        this.animate();
    }

    public async loadWorld(options: WorldLoadOptions): Promise<void> {
        this.assertReady();
        if (!options || !options.source || !options.worker || !options.budgets) {
            throw new TypeError("HexMap world load options are invalid");
        }
        const initial = canonicalTile(options.source, options.initialTile ?? { x: 0, y: 0 });
        const revision = ++this.loadRevision;
        this.stateValue = "loading";
        const scene = new Scene();
        let runtime: WorldSurfaceRuntime | undefined;
        try {
            runtime = await WorldSurfaceRuntime.create({
                source: options.source,
                worker: options.worker,
                budgets: options.budgets,
                store: options.store,
                renderer: this.renderer,
                scene,
                hexSize: this.hexSize,
                heightScale: this.heightScale,
                error: error => this.emit("error", error)
            });
            await runtime.session.updateDemand(planWorldRenderDemand({
                descriptor: options.source.descriptor,
                centerX: initial.x,
                centerY: initial.y,
                visibleRadiusTiles: options.visibleRadiusTiles,
                prefetchRadiusTiles: options.prefetchRadiusTiles,
                lod1DistanceTiles: options.lod1DistanceTiles,
                lod2DistanceTiles: options.lod2DistanceTiles
            }));
            if (revision !== this.loadRevision || this.isDisposed()) {
                runtime.dispose();
                return;
            }
            const oldRuntime = this.runtimeValue;
            this.runtimeValue = runtime;
            this.loadOptions = options;
            this.activeScene = scene;
            this.demandSignature = "";
            await this.setCameraTargetTile(initial.x, initial.y);
            oldRuntime?.dispose();
            this.stateValue = "ready";
            this.emit("load", undefined);
        } catch (reason) {
            runtime?.dispose();
            if (revision === this.loadRevision && !this.isDisposed()) this.stateValue = "ready";
            throw reason;
        }
    }

    public async edit(build: (transaction: WorldEditTransaction) => void): Promise<void> {
        const runtime = this.requireRuntime();
        await runtime.editor.edit(build);
    }

    public async setCameraTargetTile(x: number, y: number): Promise<void> {
        const runtime = this.requireRuntime();
        const tile = canonicalTile(runtime.source, { x, y });
        const center = surfaceToWorld(tile.x, tile.y, this.hexSize);
        const height = await runtime.queries.groundHeight(tile.x, tile.y) * this.heightScale;
        const offset = this.camera.position.clone().sub(this.controls.target);
        this.controls.target.set(center.x, height, center.z);
        this.camera.position.copy(this.controls.target).add(offset);
        this.controls.update();
        this.updateDemand();
    }

    public add(object: Object3D): void { this.activeScene.add(object); }
    public remove(object: Object3D): void { this.activeScene.remove(object); }
    public getScene(): Scene { return this.activeScene; }
    public getCamera(): PerspectiveCamera { return this.camera; }
    public get runtime(): WorldSurfaceRuntime | undefined { return this.runtimeValue; }
    public get state(): "ready" | "loading" | "disposed" { return this.stateValue; }

    public get stats(): Readonly<HexMapStats> {
        return Object.freeze({
            state: this.stateValue,
            worldLoaded: this.runtimeValue !== undefined,
            renderedFrames: this.renderedFrames,
            demandUpdates: this.demandUpdates,
            renderSession: this.runtimeValue?.session.stats
        });
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        this.stateValue = "disposed";
        this.loadRevision += 1;
        if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
        this.resizeObserver?.disconnect();
        window.removeEventListener("resize", this.resize);
        this.canvas.removeEventListener("webglcontextlost", this.contextLost);
        this.canvas.removeEventListener("webglcontextrestored", this.contextRestored);
        this.runtimeValue?.dispose();
        this.runtimeValue = undefined;
        this.controls.dispose();
        this.renderer.dispose();
        this.removeAllListeners();
    }

    private readonly resize = (): void => {
        const width = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
        const height = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    };

    private readonly contextLost = (event: Event): void => {
        event.preventDefault();
        if (this.runtimeValue?.session.stats.state === "ready") this.runtimeValue.session.handleContextLost();
    };

    private readonly contextRestored = (): void => {
        if (this.runtimeValue?.session.stats.state === "lost") this.runtimeValue.session.handleContextRestored();
    };

    private readonly animate = (): void => {
        if (this.stateValue === "disposed") return;
        this.animationFrame = requestAnimationFrame(this.animate);
        this.controls.update();
        this.updateDemand();
        if (this.runtimeValue?.session.stats.state === "ready") {
            this.runtimeValue.session.setTime(performance.now() / 1000);
        }
        this.renderer.render(this.activeScene, this.camera);
        this.renderedFrames += 1;
    };

    private updateDemand(): void {
        const runtime = this.runtimeValue;
        const options = this.loadOptions;
        if (!runtime || !options || runtime.session.stats.state !== "ready") return;
        const target = worldToSurface(this.controls.target.x, this.controls.target.z, this.hexSize);
        const centerX = Math.round(target.u);
        const centerY = Math.round(target.v);
        const signature = `${centerX},${centerY}`;
        if (signature === this.demandSignature) return;
        this.demandSignature = signature;
        this.demandUpdates += 1;
        void runtime.session.updateDemand(planWorldRenderDemand({
            descriptor: runtime.source.descriptor,
            centerX,
            centerY,
            visibleRadiusTiles: options.visibleRadiusTiles,
            prefetchRadiusTiles: options.prefetchRadiusTiles,
            lod1DistanceTiles: options.lod1DistanceTiles,
            lod2DistanceTiles: options.lod2DistanceTiles
        })).catch(error => this.emit("error", error instanceof Error ? error : new Error(String(error))));
    }

    private requireRuntime(): WorldSurfaceRuntime {
        this.assertReady();
        if (!this.runtimeValue) throw new Error("HexMap requires a loaded world");
        return this.runtimeValue;
    }

    private assertReady(): void {
        if (this.stateValue === "disposed") throw new Error("HexMap has been disposed");
    }

    private isDisposed(): boolean { return this.stateValue === "disposed"; }
}
