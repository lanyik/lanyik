import { Scene, WebGLRenderer } from "three";

import {
    LightingRendererBinding,
    LightingSceneBinding,
    LightingState,
    LightingStateController
} from "./LightingState";
import { SurfaceFogTexturePool } from "./SurfaceFogTexturePool";
import { SurfacePresentationLayer } from "./SurfacePresentationLayer";
import { SURFACE_FOG_PAGE_BYTES } from "./SurfaceFogTexturePool";
import { SurfaceTexturePool, SURFACE_GPU_PAGE_BYTES } from "./SurfaceTexturePool";
import {
    DependencyDrivenWorldRenderLayer
} from "./DependencyDrivenRenderGraph";
import {
    WorldRenderSession,
    WorldRenderSessionChunkContext
} from "./WorldRenderSession";
import {
    HydrologyRebaker,
    WorldEditAuthority,
    WorldEditor
} from "../world/WorldEditing";
import {
    MemoryWorldDeltaStore,
    WorldDeltaStore
} from "../world/WorldDeltaStore";
import {
    SurfaceCompilationService,
    SurfaceCompilationWorker
} from "../world/semantic/SurfaceCompilationService";
import { SURFACE_RENDER_CHUNK_SIZE } from "../world/semantic/SurfaceCompileProfile";
import { SurfaceQueryService } from "../world/semantic/SurfaceQueryService";
import { SurfacePickingService } from "../world/semantic/SurfacePickingService";
import {
    WorldAuthorityRepository,
    WorldAuthoritySource
} from "../world/semantic/WorldAuthorityRepository";
import { HydrologyFeatureId } from "../world/semantic/MacroDrainageGraph";
import { RenderChunkKey } from "../world/semantic/SurfaceDependency";

export interface WorldSurfaceRuntimeBudgets {
    readonly semanticAuthorityBytes: number;
    readonly hydrologyAuthorityBytes: number;
    readonly compiledCpuBytes: number;
    readonly retainedWindowBytes: number;
    readonly compiledWorkingSetBytes: number;
    readonly surfaceGpuBytes: number;
    readonly fogGpuBytes: number;
}

export const MINIMUM_WORLD_SURFACE_RUNTIME_BUDGETS = Object.freeze({
    surfaceGpuBytes: SURFACE_GPU_PAGE_BYTES,
    fogGpuBytes: SURFACE_FOG_PAGE_BYTES
});

export interface WorldSurfaceRuntimeOptions {
    readonly source: WorldAuthoritySource;
    readonly worker: SurfaceCompilationWorker;
    readonly budgets: WorldSurfaceRuntimeBudgets;
    readonly store?: WorldDeltaStore;
    readonly hydrologyRebaker?: HydrologyRebaker;
    readonly maximumTilesPerTransaction?: number;
    readonly sessionEpoch?: number;
    readonly hexSize?: number;
    readonly heightScale?: number;
    readonly lighting?: LightingState;
    readonly renderer?: WebGLRenderer;
    readonly scene?: Scene;
    readonly customLayers?: readonly DependencyDrivenWorldRenderLayer<WorldRenderSessionChunkContext>[];
    readonly error?: (error: Error) => void;
}

let nextWorldSurfaceSessionEpoch = 1;

function takeSessionEpoch(requested: number | undefined): number {
    if (requested !== undefined) {
        if (!Number.isSafeInteger(requested) || requested <= 0) {
            throw new RangeError("world surface sessionEpoch must be a positive safe integer");
        }
        return requested;
    }
    if (nextWorldSurfaceSessionEpoch > Number.MAX_SAFE_INTEGER) {
        throw new RangeError("world surface session epoch space is exhausted");
    }
    return nextWorldSurfaceSessionEpoch++;
}

function assertBudgets(value: WorldSurfaceRuntimeBudgets): void {
    if (!value || typeof value !== "object"
        || Object.getOwnPropertyNames(value).some(name => ![
            "semanticAuthorityBytes", "hydrologyAuthorityBytes", "compiledCpuBytes",
            "retainedWindowBytes", "compiledWorkingSetBytes", "surfaceGpuBytes", "fogGpuBytes"
        ].includes(name))) {
        throw new TypeError("world surface runtime budgets are invalid");
    }
    for (const [name, amount] of Object.entries(value)) {
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new RangeError(`${name} must be a positive safe integer`);
        }
    }
    if (value.surfaceGpuBytes < SURFACE_GPU_PAGE_BYTES) {
        throw new RangeError("surfaceGpuBytes cannot admit one physical texture page");
    }
    if (value.fogGpuBytes < SURFACE_FOG_PAGE_BYTES) {
        throw new RangeError("fogGpuBytes cannot admit one physical texture page");
    }
}

function renderKeyForTile(x: number, y: number): RenderChunkKey {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new RangeError("world edit authority coordinates must be safe integers");
    }
    return Object.freeze({
        chunkX: Math.floor(x / SURFACE_RENDER_CHUNK_SIZE),
        chunkY: Math.floor(y / SURFACE_RENDER_CHUNK_SIZE)
    });
}

function quantizeUnit16(value: number): number {
    return Math.floor(Math.max(0, Math.min(1, value)) * 65535 + 0.5);
}

function quantizeBiomeWeights(
    weights: readonly [number, number, number, number]
): readonly [number, number, number, number] {
    return Object.freeze([
        Math.round(weights[0] * 255),
        Math.round(weights[1] * 255),
        Math.round(weights[2] * 255),
        Math.round(weights[3] * 255)
    ]);
}

export class WorldSurfaceRuntime {
    public readonly source: WorldAuthoritySource;
    public readonly store: WorldDeltaStore;
    public readonly editor: WorldEditor;
    public readonly authority: WorldAuthorityRepository;
    public readonly compilation: SurfaceCompilationService;
    public readonly queries: SurfaceQueryService;
    public readonly picking: SurfacePickingService;
    public readonly surfaceTextures: SurfaceTexturePool;
    public readonly fogTextures: SurfaceFogTexturePool;
    public readonly lighting: LightingStateController;
    public readonly presentation: SurfacePresentationLayer;
    public readonly session: WorldRenderSession;
    private readonly ownsStore: boolean;
    private readonly rendererBinding: LightingRendererBinding | undefined;
    private readonly sceneBinding: LightingSceneBinding | undefined;
    private readonly scene: Scene | undefined;
    private disposed = false;

    private constructor(parts: {
        source: WorldAuthoritySource;
        store: WorldDeltaStore;
        ownsStore: boolean;
        editor: WorldEditor;
        authority: WorldAuthorityRepository;
        compilation: SurfaceCompilationService;
        queries: SurfaceQueryService;
        picking: SurfacePickingService;
        surfaceTextures: SurfaceTexturePool;
        fogTextures: SurfaceFogTexturePool;
        lighting: LightingStateController;
        presentation: SurfacePresentationLayer;
        session: WorldRenderSession;
        rendererBinding?: LightingRendererBinding;
        sceneBinding?: LightingSceneBinding;
        scene?: Scene;
    }) {
        Object.assign(this, parts);
        this.source = parts.source;
        this.store = parts.store;
        this.ownsStore = parts.ownsStore;
        this.editor = parts.editor;
        this.authority = parts.authority;
        this.compilation = parts.compilation;
        this.queries = parts.queries;
        this.picking = parts.picking;
        this.surfaceTextures = parts.surfaceTextures;
        this.fogTextures = parts.fogTextures;
        this.lighting = parts.lighting;
        this.presentation = parts.presentation;
        this.session = parts.session;
        this.rendererBinding = parts.rendererBinding;
        this.sceneBinding = parts.sceneBinding;
        this.scene = parts.scene;
    }

    public static async create(options: WorldSurfaceRuntimeOptions): Promise<WorldSurfaceRuntime> {
        if (!options || typeof options !== "object" || !options.source || !options.worker
            || typeof options.worker.compileSurfaceChunk !== "function"
            || (options.renderer === undefined) !== (options.scene === undefined)) {
            throw new TypeError("WorldSurfaceRuntime options are invalid");
        }
        assertBudgets(options.budgets);
        const ownsStore = options.store === undefined;
        const store = options.store ?? new MemoryWorldDeltaStore();
        let authority: WorldAuthorityRepository | undefined;
        let compilation: SurfaceCompilationService | undefined;
        let queries: SurfaceQueryService | undefined;
        let picking: SurfacePickingService | undefined;
        let editor: WorldEditor | undefined;
        let surfaceTextures: SurfaceTexturePool | undefined;
        let fogTextures: SurfaceFogTexturePool | undefined;
        let lighting: LightingStateController | undefined;
        let presentation: SurfacePresentationLayer | undefined;
        let session: WorldRenderSession | undefined;
        let rendererBinding: LightingRendererBinding | undefined;
        let sceneBinding: LightingSceneBinding | undefined;
        try {
            const editAuthority: WorldEditAuthority = {
                readSemanticTile: async (x, y) => {
                    const snapshot = await authority!.capture(renderKeyForTile(x, y));
                    const tile = snapshot.getTile(x, y);
                    return Object.freeze({
                        substrateClass: tile.substrateClass,
                        macroHeight: quantizeUnit16(tile.macroHeight),
                        biomeWeights: quantizeBiomeWeights(tile.biomeWeights),
                        vegetationDensity: Math.round(tile.vegetationDensity * 255),
                        vegetationProfile: tile.vegetationProfile
                    });
                },
                hydrologyConstraintsAt: async (x, y) => {
                    const sample = await queries!.sample(x, y);
                    const bodyId = sample.waterBody?.bodyId;
                    if (!bodyId || sample.waterBody?.kind === "ocean") return Object.freeze([]);
                    return Object.freeze([Object.freeze({
                        featureId: bodyId as HydrologyFeatureId,
                        maximumGroundHeight: quantizeUnit16(sample.waterLevel - 1 / 65535)
                    })]);
                }
            };
            editor = await WorldEditor.create({
                descriptor: options.source.descriptor,
                store,
                authority: editAuthority,
                hydrologyRebaker: options.hydrologyRebaker,
                maximumTilesPerTransaction: options.maximumTilesPerTransaction
            });
            authority = new WorldAuthorityRepository({
                source: options.source,
                view: editor.view,
                semanticBudgetBytes: options.budgets.semanticAuthorityBytes,
                hydrologyBudgetBytes: options.budgets.hydrologyAuthorityBytes
            });
            queries = new SurfaceQueryService({ descriptor: options.source.descriptor, snapshots: authority });
            compilation = new SurfaceCompilationService({
                descriptor: options.source.descriptor,
                sessionEpoch: takeSessionEpoch(options.sessionEpoch),
                worker: options.worker,
                cpuCacheBudgetBytes: options.budgets.compiledCpuBytes,
                retainedWindowBufferBudgetBytes: options.budgets.retainedWindowBytes
            });
            surfaceTextures = new SurfaceTexturePool({ gpuBudgetBytes: options.budgets.surfaceGpuBytes });
            fogTextures = new SurfaceFogTexturePool({
                surfacePool: surfaceTextures,
                gpuBudgetBytes: options.budgets.fogGpuBytes
            });
            lighting = new LightingStateController(options.lighting);
            rendererBinding = options.renderer ? lighting.bindRenderer(options.renderer) : undefined;
            sceneBinding = options.scene ? lighting.bindScene(options.scene) : undefined;
            presentation = new SurfacePresentationLayer({
                surfaceTexturePool: surfaceTextures,
                fogTexturePool: fogTextures,
                lighting,
                hexSize: options.hexSize,
                heightScale: options.heightScale
            });
            session = new WorldRenderSession({
                descriptor: options.source.descriptor,
                authority,
                compilation,
                presentation,
                queries,
                editor,
                compiledWorkingSetBudgetBytes: options.budgets.compiledWorkingSetBytes,
                customLayers: options.customLayers,
                error: options.error
            });
            await session.initialize();
            picking = new SurfacePickingService({
                descriptor: options.source.descriptor,
                queries,
                root: session.root,
                hexSize: options.hexSize
            });
            options.scene?.add(session.root);
            return new WorldSurfaceRuntime({
                source: options.source,
                store,
                ownsStore,
                editor,
                authority,
                compilation,
                queries,
                picking,
                surfaceTextures,
                fogTextures,
                lighting,
                presentation,
                session,
                rendererBinding,
                sceneBinding,
                scene: options.scene
            });
        } catch (reason) {
            session?.dispose();
            if (!session) {
                presentation?.dispose();
                compilation?.dispose();
                queries?.dispose();
                authority?.dispose();
                if (!authority) options.source.dispose();
            }
            editor?.dispose();
            picking?.dispose();
            rendererBinding?.release();
            sceneBinding?.release();
            fogTextures?.dispose();
            surfaceTextures?.dispose();
            lighting?.dispose();
            if (ownsStore) store.dispose();
            throw reason;
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.scene?.remove(this.session.root);
        this.session.dispose();
        this.picking.dispose();
        this.editor.dispose();
        this.rendererBinding?.release();
        this.sceneBinding?.release();
        this.fogTextures.dispose();
        this.surfaceTextures.dispose();
        this.lighting.dispose();
        if (this.ownsStore) this.store.dispose();
    }

    public get state(): "ready" | "disposed" { return this.disposed ? "disposed" : "ready"; }

    public setFloatingOrigin(worldX: number, worldZ: number): void {
        if (this.disposed) throw new Error("WorldSurfaceRuntime has been disposed");
        this.session.setFloatingOrigin(worldX, worldZ);
        this.picking.setFloatingOrigin(worldX, worldZ);
    }
}
