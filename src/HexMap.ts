import {
    WebGLRenderer,
    Scene as ThreeScene,
    PerspectiveCamera,
    Mesh,
    Line,
    LineBasicMaterial,
    BufferGeometry,
    Vector3,
    Object3D,
    ColorRepresentation,
    MOUSE,
    TOUCH,
    Group,
    InstancedMesh,
    RawShaderMaterial,
    Vector2,
    Material
} from "three";
// MapControls was removed from three.js's examples; OrbitControls configured
// with swapped mouse buttons (left=pan, right=rotate) reproduces it.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { EventEmitter } from "./EventEmitter";
import { MapInfo, Point, TileInfo } from "./interfaces";
import type { HexMapEventMap, HexMapTileEvent } from "./EventMaps";
import { getHexCenter } from "./helpers/helpers";
import { SurfaceHexMarker, SurfaceMarkerProjectionCache } from "./rendering/SurfaceHexMarker";
import { ModelAssetCache, ModelAssetCacheStats } from "./helpers/models";
import { forEachMapTile } from "./helpers/mapData";
import { pickTile } from "./helpers/picking";
import {
    CITY_FOG_TILE_KEY,
    LandformDebugMode,
    TerrainMesh,
    TerrainAtlas
} from "./objects/TerrainMesh";
import { createForest, ForestField, ForestSharedResources } from "./objects/Forest";
import { GrassField, createGrassField, GrassSharedResources } from "./objects/Grass";
import { vegetationLayoutAllocations, VegetationResources } from "./rendering/VegetationResources";
import { FogChange, FogState } from "./objects/FogOfWar";
import { FogStateStore } from "./helpers/fogStateStore";
import { getMapNeighbors, getMapTile, normalizeMapCoordinates, positiveModulo } from "./helpers/topology";
import { getWorldChunkMetadata, WORLD_CHUNK_SIZE, WorldChunkMetadata } from "./helpers/chunks";
import {
    createDefaultWorldChunkSchedulerOptions,
    WorldChunkScheduler,
    WorldChunkSchedulerHooks,
    WorldChunkStreamingStats
} from "./rendering/WorldChunkScheduler";
import { FrameTaskScheduler, FrameTaskSchedulerStats } from "./rendering/FrameTaskScheduler";
import {
    AdaptiveStreamingController,
    AdaptiveStreamingProfile,
    AdaptiveStreamingSample,
    AdaptiveStreamingStats
} from "./rendering/AdaptiveStreamingController";
import {
    WorldRenderChunkContext,
    WorldRenderLayer,
    WorldRenderLayerHost,
    WorldRenderLayerLifecycleError,
    WorldRenderLayerRegistry,
    WorldRenderTileRefreshContext
} from "./rendering/WorldRenderLayer";
import {
    WorldTileOverride,
    WorldTileOverrideChange
} from "./world/generateWorldChunk";
import {
    isWorldOverviewSource,
    isWorldVegetationSource,
    StaticWorldSource,
    WorldBounds,
    WorldChunk,
    WorldSource
} from "./world/WorldSource";
import { WorldVegetationLayout } from "./world/generateVegetation";
import { WorldOverviewPreparationOptions, WorldOverviewRaster } from "./world/generateWorldOverview";
import { ChunkRequestOptions } from "./world/WorldGeneratorPool";
import { WorldDescriptor } from "./world/WorldDescriptor";
import { WorldStreamer, WorldStreamingStats } from "./world/WorldStreamer";
import {
    ChunkResidencyCoordinator,
} from "./world/ChunkResidencyCoordinator";
import { RenderWorldController } from "./rendering/RenderWorldController";
import { HexMapRendererHost, WebGlContextStats } from "./rendering/HexMapRendererHost";
import {
    HexMapInteractionController,
    HexMapInteractionStats
} from "./rendering/HexMapInteractionController";
import { WorldChunkLayers } from "./rendering/WorldChunkLayers";
import { WorldChunkMountQueue } from "./rendering/WorldChunkMountQueue";
import { WebGlGpuTimerStats } from "./rendering/WebGlGpuTimer";
import {
    WorldEditingFacade,
    WorldEditingStats,
    WorldRenderRefreshKind,
    worldTileVisualSignature
} from "./world/WorldEditingFacade";
import {
    RuntimeWorkCoordinator,
    RuntimeWorkCoordinatorStats
} from "./runtime/RuntimeWorkCoordinator";
import { ResourceBudgetAccount, ResourceBudgetView } from "./runtime/ResourceBudget";
import {
    HexMapOptions,
    ResolvedHexMapOptions,
    WorldLoadOptions,
    resolveHexMapOptions
} from "./HexMapOptions";
import { WorldSurfaceAnchor, WorldSurfaceView } from "./world/WorldSurfaceView";
import { createWorldLoadPlan } from "./rendering/WorldLoadPlan";

export type { HexMapOptions, WorldLoadOptions } from "./HexMapOptions";

function renderLayerError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

const WORLD_COPY_REFRESH_TASK = "@world-copy-refresh";
const INERT_WORLD_SIGNAL = new AbortController().signal;

//----------------------------------------------------------------------------------
//Public entry point of the library. Owns the renderer/camera/scene/controls (what
//used to be Scene.ts) and the tile/grid/selector/trees content (what used to be
//map.ts/HexMap in map.ts) - the two were split only because of the callback
//plumbing between them, which the shared EventEmitter now makes unnecessary.
//
//Usage (mirrors maplibre-gl's event-driven API):
//   const map = new HexMap({ element: "canvas" });
//   await map.loadWorld({ source });
//   map.on("click", ({x, y, tile}) => ...);
//   map.on("hover", ({x, y, tile}) => ...);
//----------------------------------------------------------------------------------
export class HexMap extends EventEmitter<HexMapEventMap> {
    private options: ResolvedHexMapOptions;

    private canvas: HTMLCanvasElement;
    private rendererHost!: HexMapRendererHost;
    private renderer!: WebGLRenderer;
    private scene!: ThreeScene;
    private worldRoot!: Group;
    private camera!: PerspectiveCamera;
    private controls!: OrbitControls;
    private interactions!: HexMapInteractionController;

    private mapData!: MapInfo;
    private atlas!: TerrainAtlas;
    private terrain!: TerrainMesh;
    private forest: ForestField | undefined;
    private grass: GrassField | undefined;
    private readonly markerProjections = new SurfaceMarkerProjectionCache();
    private selector!: SurfaceHexMarker;
    private pointer!: SurfaceHexMarker;
    private routeLine: Line | undefined;
    private routePath: Point[] | undefined;
    private worldCopies: Group[] = [];
    private worldCopyGroups = new Map<string, Group>();
    private worldCopyObjects = new Map<string, Object3D>();
    private worldCopyMaterials: RawShaderMaterial[] = [];
    private worldCopyMaterialCache = new Map<string, RawShaderMaterial>();
    private worldPatternOffset = new Vector2();
    private chunkScheduler: WorldChunkScheduler;
    private readonly modelAssets: ModelAssetCache;
    private readonly vegetationResourceAccount: ResourceBudgetAccount;
    private readonly chunkSchedulerHooks: WorldChunkSchedulerHooks = {
        enabled: metadata => {
            const layer = this.worldRenderLayers?.forKind(metadata.kind);
            try {
                return layer?.enabled?.(metadata) ?? (metadata.kind !== "grass" || this.options.grassEnabled);
            } catch (reason) {
                this.reportWorldRenderLayerErrors(
                    `world render layer "${layer?.id}" failed to evaluate visibility`,
                    [renderLayerError(reason)]
                );
                return false;
            }
        },
        activate: (metadata, lod, objects) => this.activateWorldChunk(metadata, lod, objects),
        release: (metadata, objects) => this.releaseWorldChunk(metadata, objects)
    };
    private readonly runtimeWork = new RuntimeWorkCoordinator({
        defaultMaxPendingTasks: 512,
        defaultMaxPendingWeight: 2048,
        starvationMs: 1_500
    });
    private readonly frameTasks = new FrameTaskScheduler({
        error: error => this.emit("error", error),
        maxPendingTasks: 512,
        maxPendingWeight: 2048,
        starvationMs: 1_500,
        coordinator: this.runtimeWork,
        domain: "frame"
    });
    private resizeObserver: ResizeObserver | undefined;
    private animationFrameId: number | undefined;
    private disposed = false;
    private loadRevision = 0;
    private forestRevision = 0;
    private vegetationRefreshQueue: Promise<void> = Promise.resolve();
    private pendingVegetationRefresh: { revision: number; grass: boolean; forest: boolean } | undefined;
    private worldSurface: WorldSurfaceView | undefined;
    private worldController: RenderWorldController | undefined;
    private worldEditing: WorldEditingFacade | undefined;
    private readonly drainingWorldSessions = new Set<Promise<void>>();
    private worldChunkLayers = new Map<string, WorldChunkLayers>();
    private readonly worldChunkMountQueue: WorldChunkMountQueue;
    private streamedGrassByChunkId = new Map<string, GrassField>();
    private streamedForestByChunkId = new Map<string, ForestField>();
    private streamedGrassResources: GrassSharedResources | undefined;
    private streamedForestResources: ForestSharedResources | undefined;
    private worldLayerRevision = 0;
    private readonly worldRenderLayers = new WorldRenderLayerRegistry();
    private readonly builtinWorldRenderLayerIds = new Set(["@terrain", "@grass", "@forest"]);
    private readonly initializedWorldRenderLayers = new Set<string>();
    private readonly worldRenderLayerInitRevisions = new Map<string, number>();
    private readonly worldRenderLayerObjects = new Map<string, Map<string, Set<Object3D>>>();
    private readonly surfaceHiddenObjects = new Map<Object3D, { count: number, visible: boolean }>();
    private worldTileUpdateQueue: Promise<void> = Promise.resolve();
    private worldChunkSize = 24;
    private worldDemandChunkKey: string | undefined;
    private worldDemandSignature: string | undefined;
    private renderOrigin = new Vector2();
    private logicalTargetScratch = new Vector3();
    private predictedTargetScratch = new Vector3();
    private lastStreamingTarget: Vector2 | undefined;
    private worldDemandElapsedS = 0;
    private streamingVelocity = new Vector2();
    private streamingMotionScratch = new Vector2();
    private streamingAheadScratch = new Vector2();
    private streamingPredictionSeconds = 1.25;
    private streamingPredictionMaxChunks = 1;
    private floatingOriginThreshold = 8192;
    private adaptiveStreamingController: AdaptiveStreamingController | undefined;
    private adaptiveResolutionScale = 1;
    private appliedVegetationDensityScale = 1;
    private adaptiveVegetationRevision = 0;

    private get worldSource(): WorldSource | undefined { return this.worldController?.source; }
    private get worldStreamer(): WorldStreamer | undefined { return this.worldController?.streamer; }
    private get worldResidency(): ChunkResidencyCoordinator | undefined { return this.worldController?.residency; }

    private lastSelected: Point | null = null;

    //Authoritative renderer-side fog copy. Finite maps use a lazy byte array;
    //infinite maps use sparse coordinate keys. Layer attributes can therefore
    //be rebuilt or evicted without retaining an object/string per finite cell.
    private fogStates: FogStateStore | undefined;
    private warFogShown = true;

    constructor(options: HexMapOptions) {
        super();
        this.options = resolveHexMapOptions(options);
        this.worldChunkMountQueue = new WorldChunkMountQueue({
            frameTasks: this.frameTasks,
            streamer: () => this.worldStreamer,
            demandKey: () => this.worldDemandChunkKey,
            signal: () => this.worldController?.lifecycle.signal,
            mounted: key => this.worldChunkLayers.has(key),
            priority: chunk => {
                const center = this.worldStreamer?.stats;
                return center && this.worldSource
                    ? this.worldSource.chunkDistance(chunk.chunkX, chunk.chunkY, center.centerChunkX, center.centerChunkY)
                    : 0;
            },
            mount: chunk => this.mountWorldChunk(chunk)
        });
        const schedulerOptions = createDefaultWorldChunkSchedulerOptions();
        this.chunkScheduler = new WorldChunkScheduler({
            ...schedulerOptions,
            renderDistance: this.options.renderDistance,
            lodEnabled: this.options.lodEnabled,
            lodDistances: {
                near: this.options.lodNearDistance,
                far: this.options.lodFarDistance,
                vegetation: this.options.vegetationRenderDistance,
                hysteresis: this.options.chunkLodHysteresis
            },
            gpuCacheSize: this.options.gpuChunkCacheSize,
            cpuCacheSize: this.options.cpuChunkCacheSize,
            gpuCacheBytes: this.options.gpuChunkCacheBytes,
            cpuCacheBytes: this.options.cpuChunkCacheBytes
        });
        this.modelAssets = new ModelAssetCache({
            maximumBytes: this.options.modelAssetCacheBytes,
            resources: this.chunkScheduler.createResourceAccount("model-assets")
        });
        this.vegetationResourceAccount = this.chunkScheduler.createResourceAccount("vegetation-cpu");
        this.installBuiltinWorldRenderLayers();

        const el = document.querySelector(this.options.element);
        if (!(el instanceof HTMLCanvasElement)) {
            throw new Error(`HexMap: element "${this.options.element}" is not a <canvas>`);
        }
        this.canvas = el;

        this.rendererHost = new HexMapRendererHost({
            canvas: this.canvas,
            antialias: this.options.antialias,
            skyVisible: this.options.skyVisible,
            horizonFogColor: this.options.horizonFogColor,
            horizonFogStart: this.options.horizonFogStart,
            horizonFogEnd: this.options.horizonFogEnd,
            contextLost: () => {
                this.lastFrameTime = undefined;
                this.emit("contextlost", this.rendererHost.contextStats);
            },
            contextRestored: () => {
                this.lastFrameTime = undefined;
                this.chunkScheduler.invalidateScene();
                this.handleResize();
                this.emit("contextrestored", this.rendererHost.contextStats);
            }
        });
        this.renderer = this.rendererHost.renderer;
        this.scene = this.rendererHost.scene;
        this.worldRoot = this.rendererHost.worldRoot;
        this.camera = this.rendererHost.camera;
        this.setupControls();
        this.setupMarkers();
        this.interactions = new HexMapInteractionController({
            canvas: this.canvas,
            camera: this.camera,
            controls: this.controls,
            pointer: this.pointer,
            size: this.options.size,
            map: () => this.mapData,
            surface: () => this.worldSurface,
            logicalGround: point => { this.logicalGround(point); },
            tile: (x, y) => this.getTile(x, y),
            select: (x, y) => this.selectTile(x, y),
            hover: (x, y, tile) => {
                this.positionMarker(this.pointer, { x, y });
                this.emit("hover", { x, y, tile });
            },
            click: (x, y, tile) => this.emit("click", { x, y, tile })
        });
        this.setupEvents();
        this.handleResize();

        this.animationFrameId = window.requestAnimationFrame(this.animate);
    }

    private installBuiltinWorldRenderLayers(): void {
        this.worldRenderLayers.register({
            id: "@terrain",
            kinds: ["land", "water"],
            mountChunk: context => this.mountTerrainWorldRenderLayer(context),
            unmountChunk: context => this.unmountTerrainWorldRenderLayer(context),
            refreshTiles: context => this.refreshTerrainWorldRenderLayer(context),
            activateLod: (metadata, lod, objects) => this.activateTerrainWorldChunk(metadata, lod, objects),
            releaseChunk: metadata => this.terrain?.releaseChunk(metadata),
            dispose: () => undefined
        });
        this.worldRenderLayers.register({
            id: "@grass",
            kinds: ["grass"],
            enabled: () => this.options.grassEnabled,
            mountChunk: context => this.mountGrassWorldRenderLayer(context),
            unmountChunk: context => this.unmountGrassWorldRenderLayer(context),
            refreshTiles: context => this.refreshGrassWorldRenderLayer(context),
            activateLod: (metadata, lod, objects) => this.activateGrassWorldChunk(metadata, lod, objects),
            releaseChunk: (metadata, objects) => (this.streamedGrassByChunkId.get(metadata.id) ?? this.grass)?.releaseChunk(metadata, objects),
            dispose: () => undefined
        });
        this.worldRenderLayers.register({
            id: "@forest",
            kinds: ["forest"],
            mountChunk: context => this.mountForestWorldRenderLayer(context),
            unmountChunk: context => this.unmountForestWorldRenderLayer(context),
            refreshTiles: context => this.refreshForestWorldRenderLayer(context),
            activateLod: (metadata, lod, objects) => this.activateForestWorldChunk(metadata, lod, objects),
            releaseChunk: (metadata, objects) => (this.streamedForestByChunkId.get(metadata.id) ?? this.forest)?.releaseChunk(metadata, objects),
            dispose: () => undefined
        });
    }

    //-------------------------------------------------------------------------
    //Scene / renderer / camera / controls
    //-------------------------------------------------------------------------
    private setupControls(): void {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        //Left click belongs exclusively to tile selection. World movement is
        //handled continuously by WASD; right drag orbits freely and the wheel
        //keeps the usual dolly/zoom behavior.
        this.controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
        this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = this.options.cameraMinDistance;
        this.controls.maxDistance = this.options.cameraMaxDistance;
        this.controls.minAzimuthAngle = -Infinity;
        this.controls.maxAzimuthAngle = Infinity;
        this.controls.minPolarAngle = 15 * (Math.PI / 180);
        this.controls.maxPolarAngle = 85 * (Math.PI / 180);
    }

    //The initial camera position/target (set in setupCamera(), before map data
    //is known) looks at world origin, which is only the map's (0,0) corner, not
    //its middle - most maps would load with the camera pointed off to one side
    //of the actual content. Re-centers the existing look-at *angle* (the
    //direction from target to camera, already tuned via min/maxAzimuth/PolarAngle)
    //on the map's real center instead, at a fixed, in-range viewing distance.
    private frameMap(mapData: MapInfo): void {
        this.resetRenderOrigin();
        const size = this.options.size;
        const corner00 = getHexCenter(0, 0, size);
        const cornerWH = getHexCenter(mapData.w - 1, mapData.h - 1, size);
        const centerX = (corner00.x + cornerWH.x) / 2;
        const centerZ = (corner00.y + cornerWH.y) / 2;

        const viewDistance = (this.controls.minDistance + this.controls.maxDistance) / 2;
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();

        this.controls.target.set(
            centerX,
            this.worldSurface?.getWorldHeight(centerX, centerZ) ?? 0,
            centerZ
        );
        this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
        this.controls.update();
    }

    private get worldPeriodX(): number {
        return this.mapData ? this.mapData.w * this.options.size * 1.5 : 0;
    }

    private get worldPeriodY(): number {
        return this.mapData ? this.mapData.h * this.options.size * Math.sqrt(3) : 0;
    }

    private wrapCameraToWorld(): void {
        if (!this.mapData) return;
        let shifted = false;
        let patternShiftX = 0;
        let patternShiftY = 0;

        if (this.mapData.wrapX && this.worldPeriodX > 0) {
            const wrapped = positiveModulo(this.controls.target.x, this.worldPeriodX);
            const delta = wrapped - this.controls.target.x;
            if (Math.abs(delta) > 0.0001) {
                this.controls.target.x += delta;
                this.camera.position.x += delta;
                patternShiftX -= delta;
                shifted = true;
            }
        }
        if (this.mapData.wrapY && this.worldPeriodY > 0) {
            const wrapped = positiveModulo(this.controls.target.z, this.worldPeriodY);
            const delta = wrapped - this.controls.target.z;
            if (Math.abs(delta) > 0.0001) {
                this.controls.target.z += delta;
                this.camera.position.z += delta;
                patternShiftY -= delta;
                shifted = true;
            }
        }

        if (shifted) {
            this.shiftWorldPattern(patternShiftX, patternShiftY);
            this.updateMarkerPositions();
        }
    }

    private nearestRepeatedCenter(x: number, y: number, reference = this.getCameraTarget()): Point {
        const center = getHexCenter(x, y, this.options.size);
        if (this.mapData?.wrapX && this.worldPeriodX > 0) {
            center.x += Math.round((reference.x - center.x) / this.worldPeriodX) * this.worldPeriodX;
        }
        if (this.mapData?.wrapY && this.worldPeriodY > 0) {
            center.y += Math.round((reference.z - center.y) / this.worldPeriodY) * this.worldPeriodY;
        }
        return center;
    }

    private positionMarker(marker: SurfaceHexMarker, tile: Point, reference = this.getCameraTarget()): void {
        if (!this.worldSurface) return;
        const center = this.nearestRepeatedCenter(tile.x, tile.y, reference);
        marker.project(this.worldSurface, tile);
        marker.position.set(center.x, 0, center.y);
    }

    private updateMarkerPositions(): void {
        const hovered = this.interactions.hoveredTile;
        if (hovered && this.pointer.visible) this.positionMarker(this.pointer, hovered);
        if (this.lastSelected && this.selector.visible) this.positionMarker(this.selector, this.lastSelected);
    }

    private refreshCameraSurfaceTarget(): void {
        const surface = this.worldSurface;
        if (!surface) return;
        const logicalTarget = this.getCameraTarget(this.logicalTargetScratch);
        const nextY = surface.getWorldHeight(logicalTarget.x, logicalTarget.z);
        const deltaY = nextY - this.controls.target.y;
        this.controls.target.y = nextY;
        this.camera.position.y += deltaY;
        this.controls.update();
    }

    private refreshRouteSurface(): void {
        if (!this.routePath) return;
        const path = this.routePath.map(point => ({ ...point }));
        this.drawRoutePath(path);
    }

    private hideSurfaceObject(object: Object3D): void {
        const state = this.surfaceHiddenObjects.get(object);
        if (state) {
            state.count += 1;
            return;
        }
        this.surfaceHiddenObjects.set(object, { count: 1, visible: object.visible });
        object.visible = false;
    }

    private releaseSurfaceObject(object: Object3D): void {
        const state = this.surfaceHiddenObjects.get(object);
        if (!state) return;
        state.count -= 1;
        if (state.count > 0) return;
        object.visible = state.visible;
        this.surfaceHiddenObjects.delete(object);
    }

    private async refreshCustomSurfaceLayers(): Promise<void> {
        const layers = this.worldRenderLayers.values().filter(layer =>
            !this.builtinWorldRenderLayerIds.has(layer.id)
            && this.initializedWorldRenderLayers.has(layer.id)
            && layer.surfaceChanged
        );
        await Promise.all(layers.map(async layer => {
            const objects = new Set<Object3D>();
            for (const group of this.worldRenderLayerObjects.get(layer.id)?.values() ?? []) {
                for (const object of group) objects.add(object);
            }
            for (const object of objects) this.hideSurfaceObject(object);
            try {
                await layer.surfaceChanged?.(this.createWorldRenderLayerHost(layer.id, "@world"));
            } finally {
                for (const object of objects) this.releaseSurfaceObject(object);
            }
        }));
    }

    private async refreshSurfaceConsumers(
        surfaceRevision: number,
        rebuildVegetation: boolean,
        points?: readonly Point[]
    ): Promise<void> {
        const surface = this.worldSurface;
        const loadRevision = this.loadRevision;
        if (!surface || surface.revision !== surfaceRevision || this.disposed) return;
        this.terrain?.refreshCitySurfaceHeights(points);
        this.refreshCameraSurfaceTarget();
        this.updateMarkerPositions();
        this.refreshRouteSurface();

        const builds: Promise<unknown>[] = [this.refreshCustomSurfaceLayers()];
        if (rebuildVegetation) {
            builds.push(this.rebuildSurfaceVegetation(loadRevision));
        }
        await Promise.all(builds);
        if (this.disposed || this.loadRevision !== loadRevision
            || this.worldSurface !== surface || surface.revision !== surfaceRevision) return;
        this.updateWorldChunkVisibility();
        this.refreshWorldCopies();
        this.emit("surfacechange", { revision: surfaceRevision, surface });
    }

    private clearWorldCopies(): void {
        this.frameTasks.cancel(WORLD_COPY_REFRESH_TASK);
        this.chunkScheduler.invalidateScene();
        for (const copy of this.worldCopies) this.worldRoot.remove(copy);
        for (const material of this.worldCopyMaterials) material.dispose();
        this.worldCopies = [];
        this.worldCopyGroups.clear();
        this.worldCopyObjects.clear();
        this.worldCopyMaterials = [];
        this.worldCopyMaterialCache.clear();
    }

    private materialForWorldCopy(material: Material, offsetX: number, offsetY: number): Material {
        if (!(material instanceof RawShaderMaterial) || !material.uniforms.worldOffset) return material;
        const cacheKey = `${material.uuid}:${offsetX}:${offsetY}`;
        const cached = this.worldCopyMaterialCache.get(cacheKey);
        if (cached) return cached;
        const copy = material.clone();
        //Share every live uniform object with the primary material except the
        //per-copy translation used by the water shader's camera calculations.
        copy.uniforms = {
            ...material.uniforms,
            worldOffset: { value: new Vector2(
                this.worldPatternOffset.x + offsetX,
                this.worldPatternOffset.y + offsetY
            ) }
        };
        this.worldCopyMaterials.push(copy);
        this.worldCopyMaterialCache.set(cacheKey, copy);
        return copy;
    }

    private applyWorldPatternToObject(object: Object3D | undefined): void {
        object?.traverse(child => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
                if (material instanceof RawShaderMaterial && material.uniforms.worldOffset) {
                    material.uniforms.worldOffset.value.copy(this.worldPatternOffset);
                }
            }
        });
    }

    private shiftWorldPattern(offsetX: number, offsetY: number): void {
        if (offsetX === 0 && offsetY === 0) return;
        this.worldPatternOffset.x += offsetX;
        this.worldPatternOffset.y += offsetY;
        this.applyWorldPatternToObject(this.terrain);
        this.applyWorldPatternToObject(this.grass);
        for (const record of this.worldChunkLayers.values()) this.applyWorldPatternToObject(record.grass);
        for (const material of this.worldCopyMaterials) {
            material.uniforms.worldOffset.value.x += offsetX;
            material.uniforms.worldOffset.value.y += offsetY;
        }
    }

    private cloneWorldObject(source: Object3D, offsetX: number, offsetY: number): Object3D {
        let copy: Object3D;
        if (source instanceof InstancedMesh) {
            const instancedCopy = new InstancedMesh(source.geometry, source.material, source.count);
            instancedCopy.copy(source, false);
            copy = instancedCopy;
        } else {
            copy = source.clone(true);
        }

        // Object3D.clone() deliberately resets render callbacks. Terrain and
        // grass use onBeforeRender to select the current chunk origin, so a
        // toroidal image must retain the callback as well as the scene graph.
        // Instancing attributes are shared because fog mutates them at runtime;
        // sharing keeps every repeated image bit-for-bit synchronized.
        const sourceObjects: Object3D[] = [];
        const copyObjects: Object3D[] = [];
        source.traverse(object => sourceObjects.push(object));
        copy.traverse(object => copyObjects.push(object));
        copyObjects.forEach((object, index) => {
            const original = sourceObjects[index];
            if (!original) return;
            object.onBeforeRender = original.onBeforeRender;
            object.onAfterRender = original.onAfterRender;
            if ((original as InstancedMesh).isInstancedMesh && (object as InstancedMesh).isInstancedMesh) {
                const sourceInstance = original as InstancedMesh;
                const copyInstance = object as InstancedMesh;
                copyInstance.instanceMatrix = sourceInstance.instanceMatrix;
                copyInstance.instanceColor = sourceInstance.instanceColor;
                copyInstance.count = sourceInstance.count;
            }
        });

        copy.traverse(object => {
            const mesh = object as Mesh;
            if (!mesh.isMesh) return;
            if (Array.isArray(mesh.material)) {
                mesh.material = mesh.material.map(material => this.materialForWorldCopy(material, offsetX, offsetY));
            } else {
                mesh.material = this.materialForWorldCopy(mesh.material, offsetX, offsetY);
            }
        });
        return copy;
    }

    private copyOffsets(wrapped: boolean | undefined, period: number): number[] {
        if (!wrapped || period <= 0) return [0];
        const radius = Math.max(1, Math.ceil(this.options.renderDistance / period));
        return Array.from({ length: radius * 2 + 1 }, (_, index) => index - radius);
    }

    private worldCopyCanBecomeVisible(source: Object3D, offsetX: number, offsetY: number): boolean {
        const metadata = getWorldChunkMetadata(source);
        if (!metadata) return true;
        const padding = this.options.renderDistance;
        const bounds = metadata.bounds;
        return bounds.maxX + source.position.x + offsetX >= -padding
            && bounds.minX + source.position.x + offsetX <= this.worldPeriodX + padding
            && bounds.maxZ + source.position.z + offsetY >= -padding
            && bounds.minZ + source.position.z + offsetY <= this.worldPeriodY + padding;
    }

    //Multiple source chunks and their async city/forest models can finish in
    //the same browser turn. Coalesce those notifications into one scheduled
    //synchronization so toroidal copy work participates in frame backpressure.
    private refreshWorldCopies(): void {
        if (this.disposed) return;
        this.frameTasks.enqueue(WORLD_COPY_REFRESH_TASK, -1, () => this.synchronizeWorldCopies());
    }

    //Diffs physical toroidal images by source UUID and offset. Existing clones,
    //shared geometry and copy-specific shader materials survive unrelated chunk
    //mounts; only newly visible/removed source objects are added or released.
    private synchronizeWorldCopies(): void {
        if (!this.mapData || (!this.mapData.wrapX && !this.mapData.wrapY)) {
            this.clearWorldCopies();
            return;
        }

        const xOffsets = this.copyOffsets(this.mapData.wrapX, this.worldPeriodX);
        const yOffsets = this.copyOffsets(this.mapData.wrapY, this.worldPeriodY);
        const sources: Object3D[] = [
            ...(this.terrain?.children ?? []),
            ...(this.forest?.children ?? []),
            ...(this.grass?.visible ? this.grass.children : [])
        ];
        for (const record of this.worldChunkLayers.values()) {
            sources.push(...(record.forest?.children ?? []));
            if (record.grass?.visible) sources.push(...record.grass.children);
        }
        for (const byChunk of this.worldRenderLayerObjects.values()) {
            for (const objects of byChunk.values()) {
                for (const object of objects) if (object.visible) sources.push(object);
            }
        }

        const desired = new Set<string>();
        let sceneChanged = false;

        for (const copyX of xOffsets) {
            for (const copyY of yOffsets) {
                if (copyX === 0 && copyY === 0) continue;
                const offsetX = copyX * this.worldPeriodX;
                const offsetY = copyY * this.worldPeriodY;
                const groupKey = `${offsetX},${offsetY}`;
                for (const source of sources) {
                    if (!this.worldCopyCanBecomeVisible(source, offsetX, offsetY)) continue;
                    const objectKey = `${source.uuid}@${groupKey}`;
                    desired.add(objectKey);
                    if (this.worldCopyObjects.has(objectKey)) continue;
                    let group = this.worldCopyGroups.get(groupKey);
                    if (!group) {
                        group = new Group();
                        group.position.set(offsetX, 0, offsetY);
                        this.worldCopyGroups.set(groupKey, group);
                        this.worldRoot.add(group);
                    }
                    const copy = this.cloneWorldObject(source, offsetX, offsetY);
                    group.add(copy);
                    this.worldCopyObjects.set(objectKey, copy);
                    sceneChanged = true;
                }
            }
        }

        for (const [key, copy] of this.worldCopyObjects) {
            if (desired.has(key)) continue;
            copy.removeFromParent();
            this.worldCopyObjects.delete(key);
            sceneChanged = true;
        }
        for (const [key, group] of this.worldCopyGroups) {
            if (group.children.length > 0) continue;
            group.removeFromParent();
            this.worldCopyGroups.delete(key);
        }

        const usedMaterials = new Set<Material>();
        for (const copy of this.worldCopyObjects.values()) {
            copy.traverse(object => {
                const mesh = object as Mesh;
                if (!mesh.isMesh) return;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const material of materials) usedMaterials.add(material);
            });
        }
        for (const [key, material] of this.worldCopyMaterialCache) {
            if (usedMaterials.has(material)) continue;
            material.dispose();
            this.worldCopyMaterialCache.delete(key);
        }
        this.worldCopies = [...this.worldCopyGroups.values()];
        this.worldCopyMaterials = [...this.worldCopyMaterialCache.values()];
        if (sceneChanged) this.chunkScheduler.invalidateScene();
    }

    private setupMarkers(): void {
        this.selector = new SurfaceHexMarker(this.options.selectorColor, this.markerProjections);
        this.selector.renderOrder = 2;
        this.pointer = new SurfaceHexMarker(this.options.pointerColor, this.markerProjections);
        this.worldRoot.add(this.selector, this.pointer);
    }

    private setupEvents(): void {
        window.addEventListener("resize", this.handleResize, { passive: true });
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(this.handleResize);
            this.resizeObserver.observe(this.canvas);
        }
    }

    private handleResize = (): void => {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        if (width <= 0 || height <= 0) return;
        this.rendererHost.resize(
            width,
            height,
            Math.min(window.devicePixelRatio, this.options.maxPixelRatio) * this.adaptiveResolutionScale
        );
    };

    private lastFrameTime: number | undefined;
    private lastCpuFrameMs: number | undefined;

    private animate = (t: number): void => {
        if (this.disposed) return;
        const cpuFrameStart = performance.now();
        if (this.rendererHost.contextStats.state !== "ready") {
            this.lastFrameTime = undefined;
            this.lastCpuFrameMs = undefined;
            this.animationFrameId = window.requestAnimationFrame(this.animate);
            return;
        }
        const gpuFrameMs = this.rendererHost.pollGpuFrameMs();
        const gpuTiming = this.rendererHost.gpuTimingStats;
        const dtS = this.lastFrameTime === undefined ? 0 : (t - this.lastFrameTime) / 1000;
        this.lastFrameTime = t;
        if (dtS > 0 && !document.hidden) {
            const frameTaskStats = this.frameTasks.stats;
            const streamingStats = this.worldStreamer?.stats;
            const resourceStats = this.chunkScheduler.stats;
            const profile = this.adaptiveStreamingController?.sample({
                frameMs: dtS * 1000,
                gpuFrameMs,
                gpuTimingSupported: gpuTiming.supported,
                gpuTimingSaturated: gpuTiming.saturated,
                gpuSampleAgeMs: gpuTiming.lastSampleAgeMs,
                frameTaskMs: frameTaskStats.lastFrameDurationMs,
                frameTaskBacklog: frameTaskStats.pendingTasks,
                oldestFrameTaskMs: frameTaskStats.oldestTaskAgeMs,
                workerQueueDepth: streamingStats?.queuedChunks,
                workerBusyRatio: streamingStats && streamingStats.configuredWorkers > 0
                    ? streamingStats.busyWorkers / streamingStats.configuredWorkers
                    : 0,
                chunkLoadLatencyMs: streamingStats?.averageChunkLoadMs,
                cpuBudgetExceededBytes: resourceStats.cpuBudgetExceededBytes,
                gpuBudgetExceededBytes: resourceStats.gpuBudgetExceededBytes
            });
            if (profile) this.applyAdaptiveStreamingProfile(profile);
        }

        this.interactions.update(Math.min(dtS, 0.05));
        this.controls.update(dtS);
        this.wrapCameraToWorld();
        this.rebaseWorld();
        this.updateWorldDemand(Math.min(dtS, 0.1));
        this.frameTasks.runFrame();
        this.worldChunkMountQueue.retryOne();
        this.updateWorldChunkVisibility();
        this.terrain?.update(dtS);
        const primaryGrassResources = this.grass?.resources;
        primaryGrassResources?.update(dtS);
        if (this.streamedGrassResources !== primaryGrassResources) this.streamedGrassResources?.update(dtS);
        this.emit("frame", {
            t,
            dtS,
            cpuFrameMs: this.lastCpuFrameMs,
            gpuFrameMs
        });
        this.rendererHost.render();
        this.lastCpuFrameMs = performance.now() - cpuFrameStart;
        this.animationFrameId = window.requestAnimationFrame(this.animate);
    };

    private updateWorldChunkVisibility(): void {
        if (!this.mapData) return;
        this.chunkScheduler.update(this.scene, this.camera, this.controls.target, this.chunkSchedulerHooks);
    }

    private activateWorldChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2, objects: Object3D[]) {
        const registered = this.worldRenderLayers?.forKind(metadata.kind);
        if (registered) {
            try {
                return registered.activateLod?.(metadata, lod, objects);
            } catch (reason) {
                this.reportWorldRenderLayerErrors(`world render layer "${registered.id}" failed to activate LOD`, [renderLayerError(reason)]);
                return undefined;
            }
        }
        if (metadata.kind === "land" || metadata.kind === "water") return this.activateTerrainWorldChunk(metadata, lod, objects);
        if (metadata.kind === "grass") return this.activateGrassWorldChunk(metadata, lod, objects);
        if (metadata.kind === "forest") return this.activateForestWorldChunk(metadata, lod, objects);
        return undefined;
    }

    private activateTerrainWorldChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2, objects: Object3D[]) {
        const geometry = this.terrain?.activateChunk(metadata, lod);
        // Toroidal images are physical Mesh clones grouped under the same
        // logical chunk id. Mirror live LOD geometry into every visible image.
        if (geometry) for (const object of objects) if ((object as Mesh).isMesh) (object as Mesh).geometry = geometry;
        return geometry ? { geometries: [geometry] } : undefined;
    }

    private activateGrassWorldChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2, objects: Object3D[]) {
        const field = this.streamedGrassByChunkId.get(metadata.id) ?? this.grass;
        const geometry = field?.activateChunk(metadata, lod);
        if (geometry) for (const object of objects) if ((object as Mesh).isMesh) (object as Mesh).geometry = geometry;
        return geometry ? { geometries: [geometry] } : undefined;
    }

    private activateForestWorldChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2, objects: Object3D[]) {
        const forest = this.streamedForestByChunkId.get(metadata.id) ?? this.forest;
        forest?.activateChunk(metadata, lod, objects);
        return forest ? { disposeGpu: () => forest.disposeChunkGpu(metadata) } : undefined;
    }

    private releaseWorldChunk(metadata: WorldChunkMetadata, objects: Object3D[]): void {
        const registered = this.worldRenderLayers?.forKind(metadata.kind);
        if (registered) {
            try {
                registered.releaseChunk?.(metadata, objects);
            } catch (reason) {
                this.reportWorldRenderLayerErrors(`world render layer "${registered.id}" failed to release a chunk`, [renderLayerError(reason)]);
            }
            return;
        }
        if (metadata.kind === "land" || metadata.kind === "water") this.terrain?.releaseChunk(metadata);
        else if (metadata.kind === "grass") (this.streamedGrassByChunkId.get(metadata.id) ?? this.grass)?.releaseChunk(metadata, objects);
        else if (metadata.kind === "forest") (this.streamedForestByChunkId.get(metadata.id) ?? this.forest)?.releaseChunk(metadata, objects);
    }

    //Public API
    //-------------------------------------------------------------------------

    //Backwards-compatible finite-map convenience entry point. loadWorld() is
    //the extensible source API; existing 0.5 consumers can keep passing MapInfo
    //directly without a breaking migration.
    public load(mapData: MapInfo): Promise<void> {
        return this.loadWorld({ source: new StaticWorldSource(mapData) });
    }

    public async loadWorld(options: WorldLoadOptions): Promise<void> {
        if (this.disposed) {
            options?.source?.dispose();
            throw new Error("HexMap has been disposed");
        }
        const plan = createWorldLoadPlan(options, this.options);
        const {
            source,
            chunkSize,
            initialTile,
            loadRadius,
            retentionRadius,
            maxResidentChunks,
            maxRetries,
            retryBaseDelayMs,
            predictionSeconds,
            predictionMaxChunks,
            floatingOriginThreshold,
            adaptiveController,
            surface: worldSurface
        } = plan;

        // Consumers with work scoped to the active source must invalidate it
        // before stopWorldStreaming() disposes that source and its Worker pool.
        // "load" remains the publication point for the replacement session.
        this.emit("loadstart");
        this.stopWorldStreaming();
        const revision = ++this.loadRevision;
        const worldController = new RenderWorldController(source, this.runtimeWork, {
            drainTimeoutMs: this.options.worldSessionDrainTimeoutMs,
            error: error => this.emit("error", error)
        });
        this.worldController = worldController;
        this.adaptiveStreamingController = adaptiveController;
        this.applyAdaptiveStreamingProfile(adaptiveController.currentProfile);
        this.worldChunkSize = chunkSize;
        this.streamingPredictionSeconds = predictionSeconds;
        this.streamingPredictionMaxChunks = predictionMaxChunks;
        this.lastStreamingTarget = undefined;
        this.worldDemandElapsedS = 0;
        this.streamingVelocity.set(0, 0);
        this.mapData = source.map;
        this.worldSurface = worldSurface;
        this.worldEditing = new WorldEditingFacade(source, source.map, { visualSignature: worldTileVisualSignature });
        this.fogStates = new FogStateStore(source.map);
        this.floatingOriginThreshold = floatingOriginThreshold;
        this.worldPatternOffset.set(0, 0);
        this.cleanRoutePath();
        this.interactions.reset();
        this.lastSelected = null;
        this.pointer.visible = false;
        this.selector.visible = false;
        this.resetRenderOrigin();

        if (this.forest) {
            this.worldRoot.remove(this.forest);
            this.forest.dispose();
            this.forest = undefined;
        }
        if (this.grass) {
            this.worldRoot.remove(this.grass);
            this.grass.dispose();
            this.grass = undefined;
        }

        try {
            if (source.bounds && !options.initialTile) this.frameMap(source.map);
            else this.positionCameraAtTile(initialTile);

            const [atlas] = await worldController.lifecycle.run(signal => Promise.all([
                this.fetchTerrainAtlas(signal),
                this.modelAssets.preload(this.authoredModelPaths(source.map))
            ]));
            if (!this.isWorldSessionCurrent(source, revision) || !worldController.lifecycle.active) return;
            this.atlas = atlas;
            if (!(await worldController.lifecycle.run(() => this.rebuildTerrain(revision, true)))) return;
            if (!(await worldController.lifecycle.run(() => this.initializeWorldRenderLayers(source, revision)))) return;
            if (!this.isWorldSessionCurrent(source, revision)) return;

            const streamer = worldController.startStreaming({
                chunkLoaded: chunk => this.worldChunkMountQueue.schedule(chunk),
                chunkUnloading: chunk => this.unmountWorldChunk(chunk),
                error: error => this.emit("error", error)
            }, {
                loadRadius,
                retentionRadius,
                maxResidentChunks,
                maxRetries,
                retryBaseDelayMs
            });
            const centerChunk = source.resolveChunk(
                Math.floor(initialTile.x / chunkSize),
                Math.floor(initialTile.y / chunkSize)
            );
            if (!centerChunk) throw new RangeError("initialTile does not resolve to a source chunk");
            this.worldDemandChunkKey = WorldStreamer.key(centerChunk.x, centerChunk.y);
            this.worldDemandSignature = this.worldDemandChunkKey;
            this.rebaseWorld();

            const loadedCenter = await worldController.setCenterTile(initialTile.x, initialTile.y);
            const centerKey = WorldStreamer.key(loadedCenter.chunkX, loadedCenter.chunkY);
            const centerLayers = this.worldChunkLayers.get(centerKey);
            await worldController.lifecycle.track(Promise.all([
                centerLayers?.forestPromise,
                centerLayers?.cityPromise,
                ...(centerLayers?.renderLayerPromises?.values() ?? [])
            ]));
            if (this.disposed || revision !== this.loadRevision || this.worldStreamer !== streamer) return;
            this.updateWorldChunkVisibility();
            this.emit("load");
        } catch (reason) {
            if (revision === this.loadRevision && this.worldSource === source) this.stopWorldStreaming();
            throw reason;
        }
    }

    private async fetchTerrainAtlas(signal?: AbortSignal): Promise<TerrainAtlas> {
        const atlasUrl = new URL("land-atlas.json", new URL(this.options.texturesBaseUrl, window.location.href)).href;
        const response = await fetch(atlasUrl, { signal });
        if (!response.ok) throw new Error(`Failed to load terrain atlas (${response.status} ${response.statusText})`);
        const atlas = await response.json() as TerrainAtlas;
        if (!atlas || typeof atlas.image !== "string" || atlas.image.length === 0
            || !Number.isFinite(atlas.width) || atlas.width <= 0
            || !Number.isFinite(atlas.height) || atlas.height <= 0
            || !Number.isFinite(atlas.cellSize) || atlas.cellSize <= 0
            || !Number.isFinite(atlas.cellSpacing) || atlas.cellSpacing < 0
            || !atlas.textures || typeof atlas.textures !== "object") {
            throw new TypeError("Terrain atlas descriptor is invalid");
        }
        return atlas;
    }

    private authoredModelPaths(map: MapInfo): string[] {
        const paths = new Set<string>();
        forEachMapTile(map, tile => {
            if (tile.city) paths.add(tile.city.model ?? this.options.cityModel);
            if (this.options.treesPerTile > 0 && !tile.city && tile.modifiers?.includes("wood")) {
                paths.add(tile.treeModel ?? this.options.treeModel);
            }
        });
        return [...paths];
    }

    private positionCameraAtTile(tile: Point): void {
        const center = getHexCenter(tile.x, tile.y, this.options.size);
        const viewDistance = (this.controls.minDistance + this.controls.maxDistance) / 2;
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        this.controls.target.set(
            center.x,
            this.worldSurface?.getTileCenterHeight(tile.x, tile.y) ?? 0,
            center.y
        );
        this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
        this.controls.update();
    }

    private runRenderWorldTask<T>(
        source: WorldSource | undefined,
        operation: () => PromiseLike<T> | T
    ): Promise<T> {
        const controller = this.worldController;
        if (controller && controller.source === source) return controller.lifecycle.run(operation);
        try {
            return Promise.resolve(operation());
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    private mountWorldChunk(chunk: WorldChunk): void {
        if (!this.worldStreamer || !this.terrain) return;
        const points = chunk.coreTiles;
        const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
        const revision = ++this.worldLayerRevision;
        const record: WorldChunkLayers = { chunk, points, revision };
        this.worldChunkLayers.set(key, record);
        record.renderLayerPromises = new Map();
        record.renderLayerStates = new Map();
        for (const layer of this.worldRenderLayers.values()) {
            const mounted = this.runRenderWorldTask(
                this.worldSource,
                () => this.mountRegisteredWorldRenderLayer(layer, key, record)
            );
            record.renderLayerPromises.set(layer.id, mounted);
            void mounted.catch(error => {
                if (this.worldChunkLayers.get(key) === record) this.emit("error", error);
            });
        }
        this.reapplyFogToPoints(points, record);
        this.refreshWorldCopies();
    }

    private unmountWorldChunk(chunk: WorldChunk): void {
        const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
        this.worldChunkMountQueue.forget(key);
        this.frameTasks.cancel(`vegetation-quality:${key}`);
        const record = this.worldChunkLayers.get(key);
        if (!record) return;
        this.clearWorldVegetationPreparation(record);
        //Invalidate existing async mount contexts before teardown, while
        //keeping the record addressable to built-in unmount hooks until they
        //have released their terrain/grass/forest resources.
        record.revision = ++this.worldLayerRevision;
        const errors: Error[] = [];
        for (const layer of [...this.worldRenderLayers.values()].reverse()) {
            errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
        }
        this.worldChunkLayers.delete(key);
        this.refreshWorldCopies();
        this.reportWorldRenderLayerErrors(`failed to unmount world chunk ${key}`, errors);
    }

    private mountTerrainWorldRenderLayer(context: WorldRenderChunkContext): Promise<void> {
        const record = this.worldChunkLayers.get(context.key);
        if (!record || !this.terrain) return Promise.resolve();
        const terrain = this.terrain;
        terrain.addTiles(context.points);
        const build = terrain.loadCities(context.points, record).then(() => {
            if (!context.isCurrent() || this.terrain !== terrain) {
                terrain.removeCities(context.points, record);
                return;
            }
            terrain.setFogStates(this.fogChangesForPoints(context.points));
            this.refreshWorldCopies();
        }).catch(error => {
            if (context.isCurrent()) this.emit("error", error);
        });
        record.cityPromise = build;
        return build;
    }

    private unmountTerrainWorldRenderLayer(context: WorldRenderChunkContext): void {
        const record = this.worldChunkLayers.get(context.key);
        const forgotten = this.terrain?.removeTiles(context.points, true, record) ?? [];
        this.chunkScheduler.forget(forgotten);
    }

    private async refreshTerrainWorldRenderLayer(context: WorldRenderTileRefreshContext): Promise<void> {
        if (!this.terrain) return;
        const forgotten = this.terrain.refreshTileAttributes(context.tiles);
        this.chunkScheduler.forget(forgotten);
        const cityChanges = context.tiles.flatMap(point => {
            const owner = context.source.resolveChunk(
                Math.floor(point.x / context.source.chunkSize),
                Math.floor(point.y / context.source.chunkSize)
            );
            const record = owner
                ? this.worldChunkLayers.get(WorldStreamer.key(owner.x, owner.y))
                : undefined;
            return record ? [{ point, owner: record }] : [];
        });
        await this.terrain.refreshCities(cityChanges);
        this.terrain.setFogStates(this.fogChangesForPoints(context.tiles));
        context.invalidateVisibility();
        context.requestWorldCopyRefresh();
    }

    private async mountGrassWorldRenderLayer(context: WorldRenderChunkContext): Promise<void> {
        const record = this.worldChunkLayers.get(context.key);
        if (!record || !this.options.grassEnabled) return;
        const grassBuildRevision = record.grassBuildRevision ??= 0;
        const preparation = this.prepareWorldVegetation(context, record);
        const vegetationSignature = record.vegetationSignature!;
        const density = this.worldVegetationDensity(record.requestedVegetationScale ?? 1);
        const prepared = await preparation;
        if (!context.isCurrent() || record.grassBuildRevision !== grassBuildRevision
            || record.requestedVegetationSignature !== vegetationSignature) return;
        this.streamedGrassResources ??= new GrassSharedResources({
            resourceAccount: this.vegetationResourceAccount,
            size: this.options.size,
            bladeHeight: this.options.grassBladeHeight,
            windStrength: this.options.grassWindStrength,
            windSpeed: this.options.grassWindSpeed,
            fogDarkenFactor: this.options.fogDarkenFactor
        });
        const grass = createGrassField(this.mapData, {
            resourceAccount: this.vegetationResourceAccount,
            size: this.options.size,
            surface: this.worldSurface!,
            density: density.grassDensity,
            bladeWidth: this.options.grassBladeWidth,
            bladeHeight: this.options.grassBladeHeight,
            windStrength: this.options.grassWindStrength,
            windSpeed: this.options.grassWindSpeed,
            fogDarkenFactor: this.options.fogDarkenFactor,
            riverWidth: this.options.riverWidth,
            riverBankWidth: this.options.riverBankWidth,
            riverCurvature: this.options.riverCurvature,
            lakeShoreWidth: this.options.lakeShoreWidth,
            beachWidth: this.options.beachWidth,
            waterCornerRounding: this.options.waterCornerRounding,
            coastCurvature: this.options.coastCurvature
        }, context.points, this.streamedGrassResources, prepared) ?? undefined;
        if (!context.isCurrent() || record.grassBuildRevision !== grassBuildRevision
            || record.requestedVegetationSignature !== vegetationSignature) {
            grass?.dispose();
            return;
        }
        this.replaceGrassWorldRenderLayer(context, record, grass, vegetationSignature);
    }

    private replaceGrassWorldRenderLayer(
        context: WorldRenderChunkContext,
        record: WorldChunkLayers,
        grass: GrassField | undefined,
        vegetationSignature: string
    ): void {
        const previous = record.grass;
        if (grass) {
            this.applyWorldPatternToObject(grass);
            this.indexChunkLayer(grass, this.streamedGrassByChunkId);
            this.worldRoot.add(grass);
            this.reapplyFogToObject(grass, context.points);
        }
        record.grass = grass;
        record.grassVegetationSignature = vegetationSignature;
        if (!previous || previous === grass) return;
        const forgotten: string[] = [];
        this.collectChunkIds(previous, forgotten);
        this.unindexChunkLayer(previous, this.streamedGrassByChunkId);
        this.worldRoot.remove(previous);
        previous.dispose();
        this.chunkScheduler.forget(forgotten);
    }

    private unmountGrassWorldRenderLayer(context: WorldRenderChunkContext): void {
        const record = this.worldChunkLayers.get(context.key);
        if (!record?.grass) return;
        const forgotten: string[] = [];
        this.collectChunkIds(record.grass, forgotten);
        this.unindexChunkLayer(record.grass, this.streamedGrassByChunkId);
        this.worldRoot.remove(record.grass);
        record.grass.dispose();
        record.grass = undefined;
        record.grassVegetationSignature = undefined;
        this.chunkScheduler.forget(forgotten);
    }

    private refreshGrassWorldRenderLayer(context: WorldRenderTileRefreshContext): boolean {
        return this.refreshVegetationWorldRenderLayer(context, this.streamedGrassByChunkId.values());
    }

    private mountForestWorldRenderLayer(context: WorldRenderChunkContext): Promise<void> {
        const record = this.worldChunkLayers.get(context.key);
        if (!record || this.options.treesPerTile <= 0) return Promise.resolve();
        const forestBuildRevision = record.forestBuildRevision ??= 0;
        this.streamedForestResources ??= new ForestSharedResources(this.modelAssets, this.vegetationResourceAccount);
        const preparation = this.prepareWorldVegetation(context, record);
        const vegetationSignature = record.vegetationSignature!;
        const density = this.worldVegetationDensity(record.requestedVegetationScale ?? 1);
        const build = preparation.then(prepared => {
            if (!context.isCurrent() || record.forestBuildRevision !== forestBuildRevision
                || record.requestedVegetationSignature !== vegetationSignature) return null;
            return createForest(this.mapData, {
                resourceAccount: this.vegetationResourceAccount,
                size: this.options.size,
                surface: this.worldSurface!,
                treesPerTile: density.treesPerTile,
                treeModel: this.options.treeModel,
                treeScale: this.options.treeScale,
                modelAssets: this.modelAssets,
                fogDarkenFactor: this.options.fogDarkenFactor,
                riverWidth: this.options.riverWidth,
                riverBankWidth: this.options.riverBankWidth,
                riverCurvature: this.options.riverCurvature,
                lakeShoreWidth: this.options.lakeShoreWidth,
                beachWidth: this.options.beachWidth,
                waterCornerRounding: this.options.waterCornerRounding,
                coastCurvature: this.options.coastCurvature
            }, context.points, this.streamedForestResources, prepared);
        }).then(forest => {
            if (!context.isCurrent() || record.forestBuildRevision !== forestBuildRevision) {
                forest?.dispose();
                return;
            }
            if (record.requestedVegetationSignature !== vegetationSignature) {
                forest?.dispose();
                return;
            }
            this.replaceForestWorldRenderLayer(context, record, forest ?? undefined, vegetationSignature);
            this.refreshWorldCopies();
        }).catch(error => {
            if (context.isCurrent()) this.emit("error", error);
        });
        record.forestPromise = build;
        return build;
    }

    private replaceForestWorldRenderLayer(
        context: WorldRenderChunkContext,
        record: WorldChunkLayers,
        forest: ForestField | undefined,
        vegetationSignature: string
    ): void {
        const previous = record.forest;
        if (forest) {
            this.indexChunkLayer(forest, this.streamedForestByChunkId);
            this.worldRoot.add(forest);
            this.reapplyFogToObject(forest, context.points);
        }
        record.forest = forest;
        record.forestVegetationSignature = vegetationSignature;
        if (!previous || previous === forest) return;
        const forgotten: string[] = [];
        this.collectChunkIds(previous, forgotten);
        this.unindexChunkLayer(previous, this.streamedForestByChunkId);
        this.worldRoot.remove(previous);
        previous.dispose();
        this.chunkScheduler.forget(forgotten);
    }

    private clearWorldVegetationPreparation(record: WorldChunkLayers): void {
        record.vegetationAbort?.abort();
        record.vegetationResources?.dispose();
        record.vegetationAbort = undefined;
        record.vegetationResources = undefined;
        record.vegetationPromise = undefined;
        record.vegetationSignature = undefined;
    }

    private prepareWorldVegetation(
        context: WorldRenderChunkContext,
        record: WorldChunkLayers
    ): Promise<WorldVegetationLayout | undefined> {
        const scale = record.requestedVegetationScale
            ?? this.adaptiveStreamingController?.currentProfile.vegetationDensityScale
            ?? 1;
        const density = this.worldVegetationDensity(scale);
        record.requestedVegetationScale = scale;
        record.requestedVegetationSignature = density.signature;
        if (record.vegetationPromise && record.vegetationSignature === density.signature) {
            return record.vegetationPromise;
        }
        this.clearWorldVegetationPreparation(record);
        if (!isWorldVegetationSource(context.source)) {
            record.vegetationSignature = density.signature;
            const preparation = Promise.resolve(undefined);
            record.vegetationPromise = preparation;
            return preparation;
        }
        const center = this.worldStreamer?.stats;
        const priority = center
            ? context.source.chunkDistance(
                context.chunk.chunkX,
                context.chunk.chunkY,
                center.centerChunkX,
                center.centerChunkY
            )
            : 0;
        const abort = new AbortController();
        record.vegetationAbort = abort;
        const retained = new VegetationResources(this.vegetationResourceAccount);
        record.vegetationResources = retained;
        record.vegetationSignature = density.signature;
        const preparation = context.source.prepareVegetation({
            points: context.points,
            size: this.options.size,
            grassDensity: density.grassDensity,
            grassBladeWidth: this.options.grassBladeWidth,
            grassBladeHeight: this.options.grassBladeHeight,
            grassHeightVariation: 0.4,
            treesPerTile: density.treesPerTile,
            treeScale: this.options.treeScale,
            treeModel: this.options.treeModel,
            riverWidth: this.options.riverWidth,
            riverBankWidth: this.options.riverBankWidth,
            riverCurvature: this.options.riverCurvature,
            lakeShoreWidth: this.options.lakeShoreWidth,
            beachWidth: this.options.beachWidth,
            waterCornerRounding: this.options.waterCornerRounding,
            coastCurvature: this.options.coastCurvature
        }, { priority, signal: abort.signal, lane: "prefetch", weight: Math.max(1, Math.ceil(context.points.length / 128)) }).then(layout => {
            if (abort.signal.aborted || this.worldChunkLayers.get(context.key) !== record) return undefined;
            retained.retain("layout", vegetationLayoutAllocations(layout));
            return layout;
        });
        record.vegetationPromise = this.worldController?.source === context.source
            ? this.worldController.lifecycle.track(preparation)
            : preparation;
        return record.vegetationPromise;
    }

    private worldVegetationDensity(scale: number): {
        grassDensity: number;
        treesPerTile: number;
        signature: string;
    } {
        const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
        const grassDensity = this.options.grassEnabled && this.options.grassDensity > 0
            ? Math.max(1, Math.round(this.options.grassDensity * normalizedScale))
            : 0;
        const treesPerTile = this.options.treesPerTile > 0
            ? Math.max(1, Math.round(this.options.treesPerTile * normalizedScale))
            : 0;
        return { grassDensity, treesPerTile, signature: `${grassDensity}:${treesPerTile}` };
    }

    private unmountForestWorldRenderLayer(context: WorldRenderChunkContext): void {
        const record = this.worldChunkLayers.get(context.key);
        if (!record?.forest) return;
        const forgotten: string[] = [];
        this.collectChunkIds(record.forest, forgotten);
        this.unindexChunkLayer(record.forest, this.streamedForestByChunkId);
        this.worldRoot.remove(record.forest);
        record.forest.dispose();
        record.forest = undefined;
        record.forestVegetationSignature = undefined;
        this.chunkScheduler.forget(forgotten);
    }

    private refreshForestWorldRenderLayer(context: WorldRenderTileRefreshContext): boolean {
        return this.refreshVegetationWorldRenderLayer(context, this.streamedForestByChunkId.values());
    }

    private refreshVegetationWorldRenderLayer(
        context: WorldRenderTileRefreshContext,
        fields: Iterable<{ setTileSuppressed(x: number, y: number, suppressed: boolean): void }>
    ): boolean {
        if (context.refreshKind !== "city") return false;
        const uniqueFields = new Set(fields);
        for (const point of context.tiles) {
            const suppressed = Boolean(getMapTile(this.mapData, point.x, point.y)?.city);
            for (const field of uniqueFields) field.setTileSuppressed(point.x, point.y, suppressed);
        }
        context.invalidateVisibility();
        return true;
    }

    private collectChunkIds(object: Object3D, target: string[]): void {
        object.traverse(child => {
            const metadata = getWorldChunkMetadata(child);
            if (metadata) target.push(metadata.id);
        });
    }

    private indexChunkLayer<T extends ForestField | GrassField>(object: T, index: Map<string, T>): void {
        object.traverse(child => {
            const metadata = getWorldChunkMetadata(child);
            if (metadata) index.set(metadata.id, object);
        });
    }

    private unindexChunkLayer<T extends ForestField | GrassField>(object: T, index: Map<string, T>): void {
        object.traverse(child => {
            const metadata = getWorldChunkMetadata(child);
            if (metadata && index.get(metadata.id) === object) index.delete(metadata.id);
        });
    }

    private applyAdaptiveStreamingProfile(profile: Readonly<AdaptiveStreamingProfile>): void {
        const resolutionChanged = profile.resolutionScale !== this.adaptiveResolutionScale;
        this.adaptiveResolutionScale = profile.resolutionScale;
        const densityChanged = profile.vegetationDensityScale !== this.appliedVegetationDensityScale;
        this.appliedVegetationDensityScale = profile.vegetationDensityScale;
        this.frameTasks.configure({
            budgetMs: profile.frameBudgetMs,
            maxTasksPerFrame: profile.maxTasksPerFrame
        });
        this.chunkScheduler.configure({
            lodDistances: profile.lodDistances,
            lodBias: profile.lodBias,
            vegetationLodBias: profile.vegetationLodBias
        });
        try {
            this.worldSource?.configureWorkerCount?.(profile.workerCount);
        } catch (reason) {
            this.emit("error", reason instanceof Error ? reason : new Error(String(reason)));
        }
        if (resolutionChanged) this.handleResize();
        if (densityChanged) this.scheduleAdaptiveVegetationRebuild(profile.vegetationDensityScale);
    }

    private scheduleAdaptiveVegetationRebuild(scale: number): void {
        const source = this.worldSource;
        const streamer = this.worldStreamer;
        if (!source || !streamer || this.worldChunkLayers.size === 0) return;
        const target = this.worldVegetationDensity(scale);
        const revision = ++this.adaptiveVegetationRevision;
        const center = streamer.stats;
        for (const [key, record] of this.worldChunkLayers) {
            record.requestedVegetationScale = scale;
            record.requestedVegetationSignature = target.signature;
            const grassCurrent = !this.options.grassEnabled || this.options.grassDensity <= 0
                || record.grassVegetationSignature === target.signature;
            const forestCurrent = this.options.treesPerTile <= 0
                || record.forestVegetationSignature === target.signature;
            if (grassCurrent && forestCurrent) continue;
            const priority = source.chunkDistance(
                record.chunk.chunkX,
                record.chunk.chunkY,
                center.centerChunkX,
                center.centerChunkY
            );
            this.frameTasks.enqueue(`vegetation-quality:${key}`, priority, () => {
                if (this.disposed || revision !== this.adaptiveVegetationRevision
                    || this.worldSource !== source || this.worldChunkLayers.get(key) !== record
                    || record.requestedVegetationSignature !== target.signature) return;
                void this.runRenderWorldTask(
                    source,
                    () => this.rebuildAdaptiveWorldVegetation(key, record, target.signature)
                ).catch(reason => {
                    if (this.worldChunkLayers.get(key) === record) this.emit("error", renderLayerError(reason));
                });
            });
        }
    }

    private async rebuildAdaptiveWorldVegetation(
        key: string,
        record: WorldChunkLayers,
        targetSignature: string
    ): Promise<void> {
        if (this.worldChunkLayers.get(key) !== record
            || record.requestedVegetationSignature !== targetSignature) return;
        record.grassBuildRevision = (record.grassBuildRevision ?? 0) + 1;
        record.forestBuildRevision = (record.forestBuildRevision ?? 0) + 1;
        this.clearWorldVegetationPreparation(record);

        const builds: Promise<void>[] = [];
        if (this.options.grassEnabled && this.worldRenderLayers.get("@grass")) {
            const build = this.mountGrassWorldRenderLayer(
                this.createWorldRenderChunkContext("@grass", key, record)
            );
            record.renderLayerPromises?.set("@grass", build);
            builds.push(build);
        }
        if (this.options.treesPerTile > 0 && this.worldRenderLayers.get("@forest")) {
            const build = this.mountForestWorldRenderLayer(
                this.createWorldRenderChunkContext("@forest", key, record)
            );
            record.renderLayerPromises?.set("@forest", build);
            builds.push(build);
        }
        await Promise.all(builds);
        if (this.worldChunkLayers.get(key) !== record
            || record.requestedVegetationSignature !== targetSignature) return;
        this.chunkScheduler.invalidateScene();
        this.refreshWorldCopies();
    }

    private createWorldRenderLayerHost(layerId: string, objectKey: string): WorldRenderLayerHost {
        const source = this.worldSource;
        if (!source || !this.mapData) throw new Error("No world is loaded");
        const signal = this.worldController?.source === source
            ? this.worldController.lifecycle.signal
            : INERT_WORLD_SIGNAL;
        const isCurrent = (): boolean => !this.disposed && !signal.aborted && this.worldSource === source;
        return {
            map: this.mapData,
            source,
            tileSize: this.options.size,
            surface: this.worldSurface,
            signal,
            addObject: object => {
                if (!isCurrent()) return;
                let byChunk = this.worldRenderLayerObjects.get(layerId);
                if (!byChunk) {
                    byChunk = new Map();
                    this.worldRenderLayerObjects.set(layerId, byChunk);
                }
                let objects = byChunk.get(objectKey);
                if (!objects) {
                    objects = new Set();
                    byChunk.set(objectKey, objects);
                }
                if (objects.has(object)) return;
                objects.add(object);
                this.applyWorldPatternToObject(object);
                this.worldRoot.add(object);
                this.chunkScheduler.invalidateScene();
            },
            removeObject: object => {
                this.worldRenderLayerObjects.get(layerId)?.get(objectKey)?.delete(object);
                this.worldRoot.remove(object);
                this.chunkScheduler.invalidateScene();
            },
            invalidateVisibility: () => {
                if (isCurrent()) this.chunkScheduler.invalidateVisibility();
            },
            requestWorldCopyRefresh: () => {
                if (isCurrent()) this.refreshWorldCopies();
            }
        };
    }

    private createWorldRenderChunkContext(
        layerId: string,
        key: string,
        record: WorldChunkLayers,
        allowClosing = false
    ): WorldRenderChunkContext {
        const revision = record.revision;
        const host = this.createWorldRenderLayerHost(layerId, key);
        return {
            ...host,
            chunk: record.chunk,
            key,
            points: record.points,
            revision,
            isCurrent: () => (allowClosing || (!this.disposed && !host.signal.aborted))
                && this.worldChunkLayers.get(key) === record
                && record.revision === revision
        };
    }

    private async mountRegisteredWorldRenderLayer(
        layer: WorldRenderLayer,
        key: string,
        record: WorldChunkLayers
    ): Promise<void> {
        if (!this.initializedWorldRenderLayers.has(layer.id)) return;
        record.renderLayerStates ??= new Map();
        record.renderLayerStates.set(layer.id, "mounting");
        record.renderLayerMountRevisions ??= new Map();
        const mountRevision = (record.renderLayerMountRevisions.get(layer.id) ?? 0) + 1;
        record.renderLayerMountRevisions.set(layer.id, mountRevision);
        const baseContext = this.createWorldRenderChunkContext(layer.id, key, record);
        const context = {
            ...baseContext,
            isCurrent: () => baseContext.isCurrent() && record.renderLayerMountRevisions?.get(layer.id) === mountRevision
        };
        try {
            await layer.mountChunk(context);
        } catch (reason) {
            if (!context.isCurrent()) return;
            const errors = [renderLayerError(reason)];
            if (record.renderLayerStates.get(layer.id) !== "unmounted") {
                errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
            } else {
                this.removeWorldRenderLayerObjects(layer.id, key);
            }
            throw new WorldRenderLayerLifecycleError(`world render layer "${layer.id}" failed to mount chunk ${key}`, errors);
        }
        const current = context.isCurrent()
            && this.worldRenderLayers.get(layer.id) === layer
            && this.initializedWorldRenderLayers.has(layer.id);
        if (!current || record.renderLayerStates.get(layer.id) === "unmounted") {
            if (record.renderLayerMountRevisions.get(layer.id) === mountRevision) this.removeWorldRenderLayerObjects(layer.id, key);
            return;
        }
        record.renderLayerStates.set(layer.id, "mounted");
        this.chunkScheduler.invalidateScene();
        this.refreshWorldCopies();
    }

    private unmountRegisteredWorldRenderLayer(
        layer: WorldRenderLayer,
        key: string,
        record: WorldChunkLayers
    ): Error[] {
        const errors: Error[] = [];
        record.renderLayerStates ??= new Map();
        const state = record.renderLayerStates.get(layer.id);
        if (state !== "unmounted") {
            //Mark first so re-entrant teardown and late async mount completion
            //cannot execute the layer hook twice.
            record.renderLayerStates.set(layer.id, "unmounted");
            try {
                layer.unmountChunk(this.createWorldRenderChunkContext(layer.id, key, record, true));
            } catch (reason) {
                errors.push(renderLayerError(reason));
            }
        }
        record.renderLayerPromises?.delete(layer.id);
        try {
            this.removeWorldRenderLayerObjects(layer.id, key);
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        return errors;
    }

    private removeWorldRenderLayerObjects(layerId: string, objectKey?: string): void {
        const byChunk = this.worldRenderLayerObjects.get(layerId);
        if (!byChunk) return;
        const keys = objectKey === undefined ? [...byChunk.keys()] : [objectKey];
        for (const key of keys) {
            for (const object of byChunk.get(key) ?? []) this.worldRoot.remove(object);
            byChunk.delete(key);
        }
        if (byChunk.size === 0) this.worldRenderLayerObjects.delete(layerId);
        this.chunkScheduler.invalidateScene();
    }

    private async initializeWorldRenderLayers(source: WorldSource, loadRevision: number): Promise<boolean> {
        for (const layer of this.worldRenderLayers.values()) {
            if (!this.isWorldSessionCurrent(source, loadRevision)) return false;
            if (!this.initializedWorldRenderLayers.has(layer.id)) {
                await this.initializeRegisteredWorldRenderLayer(layer);
            }
            if (!this.isWorldSessionCurrent(source, loadRevision)) return false;
        }
        return true;
    }

    private async initializeRegisteredWorldRenderLayer(layer: WorldRenderLayer): Promise<boolean> {
        const source = this.worldSource;
        if (!source) return false;
        const revision = (this.worldRenderLayerInitRevisions.get(layer.id) ?? 0) + 1;
        this.worldRenderLayerInitRevisions.set(layer.id, revision);
        const host = this.createWorldRenderLayerHost(layer.id, "@world");
        try {
            await layer.initialize?.(host);
        } catch (reason) {
            const errors = [renderLayerError(reason)];
            try {
                layer.unloadWorld?.(host);
            } catch (cleanupReason) {
                errors.push(renderLayerError(cleanupReason));
            }
            this.removeWorldRenderLayerObjects(layer.id, "@world");
            throw new WorldRenderLayerLifecycleError(`world render layer "${layer.id}" failed to initialize`, errors);
        }
        if (this.disposed || this.worldSource !== source || this.worldRenderLayers.get(layer.id) !== layer
            || this.worldRenderLayerInitRevisions.get(layer.id) !== revision) {
            const errors: Error[] = [];
            try {
                layer.unloadWorld?.(host);
            } catch (reason) {
                errors.push(renderLayerError(reason));
            }
            this.removeWorldRenderLayerObjects(layer.id, "@world");
            this.reportWorldRenderLayerErrors(`world render layer "${layer.id}" failed to clean up stale initialization`, errors);
            return false;
        }
        this.initializedWorldRenderLayers.add(layer.id);
        return true;
    }

    private unloadWorldRenderLayers(): void {
        if (!this.worldSource || !this.mapData) return;
        const errors: Error[] = [];
        for (const layer of [...this.worldRenderLayers.values()].reverse()) {
            this.worldRenderLayerInitRevisions.set(layer.id, (this.worldRenderLayerInitRevisions.get(layer.id) ?? 0) + 1);
            if (this.initializedWorldRenderLayers.delete(layer.id)) {
                try {
                    layer.unloadWorld?.(this.createWorldRenderLayerHost(layer.id, "@world"));
                } catch (reason) {
                    errors.push(renderLayerError(reason));
                }
            }
            try {
                this.removeWorldRenderLayerObjects(layer.id);
            } catch (reason) {
                errors.push(renderLayerError(reason));
            }
        }
        this.reportWorldRenderLayerErrors("one or more world render layers failed to unload", errors);
    }

    private reportWorldRenderLayerErrors(message: string, errors: readonly Error[]): void {
        if (errors.length === 0) return;
        const error = new WorldRenderLayerLifecycleError(message, errors);
        if (this.listenerCount("error") === 0) {
            // Cleanup must finish even without an observer, but the aggregated
            // failure must remain visible instead of becoming a swallowed event.
            console.error(error);
            return;
        }
        try {
            this.emit("error", error);
        } catch (observerError) {
            //Error observers are external code too. Cleanup paths must remain
            //best-effort even when an observer throws while reporting a layer.
            console.error(observerError);
        }
    }

    private stopWorldStreaming(): void {
        const source = this.worldSource;
        const controller = this.worldController;
        const editing = this.worldEditing;
        const errors: Error[] = [];
        this.worldDemandChunkKey = undefined;
        this.worldDemandSignature = undefined;
        this.lastStreamingTarget = undefined;
        this.worldDemandElapsedS = 0;
        this.streamingVelocity.set(0, 0);
        this.adaptiveStreamingController = undefined;
        this.appliedVegetationDensityScale = 1;
        this.adaptiveVegetationRevision += 1;
        this.chunkScheduler.configure({
            lodDistances: {
                near: this.options.lodNearDistance,
                far: this.options.lodFarDistance,
                vegetation: this.options.vegetationRenderDistance,
                hysteresis: this.options.chunkLodHysteresis
            },
            lodBias: 0,
            vegetationLodBias: 0
        });
        this.frameTasks.clear();
        this.worldChunkMountQueue.clear();
        this.worldEditing = undefined;
        editing?.dispose();
        try {
            if (controller) {
                controller.stop(false);
                let draining: Promise<void>;
                draining = controller.settled.finally(() => this.drainingWorldSessions.delete(draining));
                this.drainingWorldSessions.add(draining);
            }
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        //A custom source/controller failure must not strand layer records that
        //the normal Streamer callbacks did not reach.
        for (const [key, record] of [...this.worldChunkLayers]) {
            this.clearWorldVegetationPreparation(record);
            record.revision = ++this.worldLayerRevision;
            for (const layer of [...this.worldRenderLayers.values()].reverse()) {
                errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
            }
        }
        try {
            this.unloadWorldRenderLayers();
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        try {
            source?.dispose();
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        this.markerProjections.clear();
        this.worldSurface = undefined;
        this.worldController = undefined;
        this.worldTileUpdateQueue = Promise.resolve();
        this.worldLayerRevision += 1;
        for (const record of this.worldChunkLayers.values()) {
            if (record.grass) {
                const grass = record.grass;
                const forgotten: string[] = [];
                try { this.collectChunkIds(grass, forgotten); } catch (reason) { errors.push(renderLayerError(reason)); }
                try { this.unindexChunkLayer(grass, this.streamedGrassByChunkId); } catch (reason) { errors.push(renderLayerError(reason)); }
                this.worldRoot.remove(grass);
                try {
                    grass.dispose();
                } catch (reason) {
                    errors.push(renderLayerError(reason));
                }
                record.grass = undefined;
                this.chunkScheduler.forget(forgotten);
            }
            if (record.forest) {
                const forest = record.forest;
                const forgotten: string[] = [];
                try { this.collectChunkIds(forest, forgotten); } catch (reason) { errors.push(renderLayerError(reason)); }
                try { this.unindexChunkLayer(forest, this.streamedForestByChunkId); } catch (reason) { errors.push(renderLayerError(reason)); }
                this.worldRoot.remove(forest);
                try {
                    forest.dispose();
                } catch (reason) {
                    errors.push(renderLayerError(reason));
                }
                record.forest = undefined;
                this.chunkScheduler.forget(forgotten);
            }
        }
        this.worldChunkLayers.clear();
        this.streamedGrassByChunkId.clear();
        this.streamedForestByChunkId.clear();
        try {
            this.streamedGrassResources?.dispose();
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        this.streamedGrassResources = undefined;
        try {
            this.streamedForestResources?.dispose();
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        this.streamedForestResources = undefined;
        try {
            this.clearWorldCopies();
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        this.chunkScheduler.clear();
        this.reportWorldRenderLayerErrors("world streaming cleanup encountered errors", errors);
    }

    private reapplyFogToPoints(points: readonly Point[], record: WorldChunkLayers): void {
        const changes = this.fogChangesForPoints(points);
        this.terrain?.setFogStates(changes);
        record.grass?.setFogStates(changes);
        record.forest?.setFogStates(changes);
    }

    private reapplyFogToObject(object: ForestField | GrassField, points?: readonly Point[]): void {
        if (points) {
            object.setFogStates(this.fogChangesForPoints(points));
            return;
        }
        const changes: FogChange[] = [];
        this.fogStates?.forEach((stored, x, y) => {
            changes.push({ x, y, state: this.warFogShown ? stored : FogState.Visible });
        });
        object.setFogStates(changes);
    }

    private fogChangesForPoints(points: readonly Point[]): FogChange[] {
        return points.map(point => ({
            x: point.x,
            y: point.y,
            state: this.warFogShown
                ? (this.fogStates?.get(point.x, point.y) ?? FogState.Visible)
                : FogState.Visible
        }));
    }

    //Tears down and recreates the terrain (land/water layers + city models) from
    //the current options against the already-fetched atlas/map data. Only needed
    //when the map itself changes (see load()) - everything water/blend-related
    //is a live uniform, see TerrainMesh's own getters/setters, forwarded below
    //(waterWaveAmplitude, beachWidth, etc.)
    private async rebuildTerrain(expectedRevision = this.loadRevision, deferTiles = Boolean(this.worldStreamer)): Promise<boolean> {
        if (!this.worldSurface) throw new Error("No world surface is loaded");
        this.clearWorldCopies();
        this.chunkScheduler.clear();
        if (this.terrain) {
            this.worldRoot.remove(this.terrain);
            this.terrain.dispose();
        }

        const terrain = new TerrainMesh(this.mapData, {
            size: this.options.size,
            texturesBaseUrl: this.options.texturesBaseUrl,
            atlas: this.atlas,
            surface: this.worldSurface,
            gridVisible: this.options.gridVisible,
            gridColor: this.options.gridColor,
            gridWidth: this.options.gridWidth,
            gridOpacity: this.options.gridOpacity,
            shaderQuality: this.options.terrainShaderQuality,
            landformDebugMode: this.options.landformDebugMode,
            terrainTextureRegionSize: this.options.terrainTextureRegionSize,
            waterColorShallow: this.options.waterColorShallow,
            waterColorDeep: this.options.waterColorDeep,
            waterWaveAmplitude: this.options.waterWaveAmplitude,
            waterWaveFrequency: this.options.waterWaveFrequency,
            waterWaveSpeed: this.options.waterWaveSpeed,
            waterSparkleIntensity: this.options.waterSparkleIntensity,
            waterFresnelIntensity: this.options.waterFresnelIntensity,
            coastalWavesEnabled: this.options.coastalWavesEnabled,
            coastalWaveColor: this.options.coastalWaveColor,
            coastalWaveCount: this.options.coastalWaveCount,
            coastalWaveSpeed: this.options.coastalWaveSpeed,
            coastalWaveWidth: this.options.coastalWaveWidth,
            coastalWaveRange: this.options.coastalWaveRange,
            coastalWaveDistortion: this.options.coastalWaveDistortion,
            coastalWaveOpacity: this.options.coastalWaveOpacity,
            waterDepth: this.options.waterDepth,
            beachWidth: this.options.beachWidth,
            landBlendWidth: this.options.landBlendWidth,
            landBlendEnabled: this.options.landBlendEnabled,
            waterCornerRounding: this.options.waterCornerRounding,
            coastCurvature: this.options.coastCurvature,
            landBlendCurvature: this.options.landBlendCurvature,
            riverWidth: this.options.riverWidth,
            riverBankWidth: this.options.riverBankWidth,
            riverCurvature: this.options.riverCurvature,
            riverColorShallow: this.options.riverColorShallow,
            riverColorDeep: this.options.riverColorDeep,
            riverBankColor: this.options.riverBankColor,
            riverFlowSpeed: this.options.riverFlowSpeed,
            riverDepth: this.options.riverDepth,
            lakeShoreWidth: this.options.lakeShoreWidth,
            cityModel: this.options.cityModel,
            cityScale: this.options.cityScale,
            modelAssets: this.modelAssets,
            fogTexture: this.options.fogTexture,
            fogDarkenFactor: this.options.fogDarkenFactor,
            fogTextureSize: this.options.fogTextureSize
        }, deferTiles ? [] : undefined);
        this.terrain = terrain;
        terrain.setCameraWorldOffset(this.renderOrigin.x, this.renderOrigin.y);
        this.applyWorldPatternToObject(terrain);
        this.worldRoot.add(terrain);
        if (deferTiles) {
            for (const record of this.worldChunkLayers.values()) terrain.addTiles(record.points);
        }
        if (!deferTiles) await terrain.loadCities();
        else if (this.worldStreamer) {
            await Promise.all([...this.worldChunkLayers.values()].map(record => terrain.loadCities(record.points, record)));
        }
        if (this.disposed || expectedRevision !== this.loadRevision || this.terrain !== terrain) {
            this.worldRoot.remove(terrain);
            terrain.dispose();
            return false;
        }
        this.reapplyFog(); // the fresh layer defaults to all-Visible
        this.refreshWorldCopies();
        return true;
    }

    //Tears down and recreates the tree instances from the current tree*
    //options. treesPerTile/treeScale are baked into the instanced geometry's
    //instance count/matrices at build time, so - like grass - there's no live
    //uniform for them, only a rebuild. Model files are cached (see
    //helpers/models.ts), so repeated rebuilds don't re-fetch the glTF.
    private async rebuildForest(expectedRevision = this.loadRevision): Promise<boolean> {
        const forestRevision = ++this.forestRevision;
        this.clearWorldCopies();
        this.chunkScheduler.clear();
        if (this.forest) {
            this.worldRoot.remove(this.forest);
            this.forest.dispose();
            this.forest = undefined;
        }
        if (!this.mapData) return false;

        const forest = (await createForest(this.mapData, {
            resourceAccount: this.vegetationResourceAccount,
            size: this.options.size,
            surface: this.worldSurface!,
            treesPerTile: this.options.treesPerTile,
            treeModel: this.options.treeModel,
            treeScale: this.options.treeScale,
            modelAssets: this.modelAssets,
            fogDarkenFactor: this.options.fogDarkenFactor,
            riverWidth: this.options.riverWidth,
            riverBankWidth: this.options.riverBankWidth,
            riverCurvature: this.options.riverCurvature,
            lakeShoreWidth: this.options.lakeShoreWidth,
            beachWidth: this.options.beachWidth,
            waterCornerRounding: this.options.waterCornerRounding,
            coastCurvature: this.options.coastCurvature
        })) ?? undefined;

        if (this.disposed || expectedRevision !== this.loadRevision || forestRevision !== this.forestRevision) {
            forest?.dispose();
            return false;
        }
        this.forest = forest;

        if (this.forest) {
            this.worldRoot.add(this.forest);
            this.reapplyFog(); // the fresh layer defaults to all-Visible
        }
        this.refreshWorldCopies();
        return true;
    }

    //Tears down and recreates the grass field from the current grass* options
    //against the already-loaded map data. Grass is purely procedural (no
    //textures/models to load), so this is synchronous and cheap enough to call
    //directly from a live GUI slider (see grassDensity/grassBladeWidth/
    //grassBladeHeight setters below) - a rebuild replaces the whole instanced
    //geometry, there's no partial/incremental update.
    private async rebuildGrass(): Promise<boolean> {
        this.clearWorldCopies();
        this.chunkScheduler.clear();
        if (this.grass) {
            this.worldRoot.remove(this.grass);
            this.grass.dispose();
            this.grass = undefined;
        }
        if (!this.mapData) return false;

        this.grass = createGrassField(this.mapData, {
            resourceAccount: this.vegetationResourceAccount,
            size: this.options.size,
            surface: this.worldSurface!,
            density: this.options.grassDensity,
            bladeWidth: this.options.grassBladeWidth,
            bladeHeight: this.options.grassBladeHeight,
            windStrength: this.options.grassWindStrength,
            windSpeed: this.options.grassWindSpeed,
            fogDarkenFactor: this.options.fogDarkenFactor,
            riverWidth: this.options.riverWidth,
            riverBankWidth: this.options.riverBankWidth,
            riverCurvature: this.options.riverCurvature,
            lakeShoreWidth: this.options.lakeShoreWidth,
            beachWidth: this.options.beachWidth,
            waterCornerRounding: this.options.waterCornerRounding,
            coastCurvature: this.options.coastCurvature
        }) ?? undefined;
        this.applyWorldPatternToObject(this.grass);

        if (this.grass) {
            this.grass.visible = this.options.grassEnabled;
            this.worldRoot.add(this.grass);
            this.reapplyFog(); // the fresh layer defaults to all-Visible
        }
        this.refreshWorldCopies();
        return true;
    }

    private async rebuildSurfaceVegetation(expectedRevision: number): Promise<boolean> {
        if (!this.worldStreamer) {
            await Promise.all([this.rebuildGrass(), this.rebuildForest(expectedRevision)]);
            return !this.disposed && expectedRevision === this.loadRevision;
        }

        const forestRevision = ++this.forestRevision;
        this.streamedGrassByChunkId.clear();
        this.streamedForestByChunkId.clear();
        for (const [key, record] of this.worldChunkLayers) {
            const context = this.createWorldRenderChunkContext("@grass", key, record);
            this.unmountGrassWorldRenderLayer(context);
            this.unmountForestWorldRenderLayer(this.createWorldRenderChunkContext("@forest", key, record));
            record.grassBuildRevision = (record.grassBuildRevision ?? 0) + 1;
            record.forestBuildRevision = (record.forestBuildRevision ?? 0) + 1;
            this.clearWorldVegetationPreparation(record);
        }

        const grassLayer = this.worldRenderLayers.get("@grass");
        const forestLayer = this.worldRenderLayers.get("@forest");
        const builds: Promise<void>[] = [];
        for (const [key, record] of this.worldChunkLayers) {
            record.renderLayerPromises ??= new Map();
            if (grassLayer) {
                const build = this.mountRegisteredWorldRenderLayer(grassLayer, key, record);
                record.renderLayerPromises.set(grassLayer.id, build);
                builds.push(build);
            }
            if (forestLayer) {
                const build = this.mountRegisteredWorldRenderLayer(forestLayer, key, record);
                record.forestPromise = build;
                record.renderLayerPromises.set(forestLayer.id, build);
                builds.push(build);
            }
        }
        await Promise.all(builds);
        this.refreshWorldCopies();
        return !this.disposed && expectedRevision === this.loadRevision
            && forestRevision === this.forestRevision;
    }

    public getTile(x: number, y: number): TileInfo | undefined {
        if (this.worldSource && !this.worldSource.hasTile(x, y)) return undefined;
        return this.mapData ? getMapTile(this.mapData, x, y) : undefined;
    }

    /** Read-only surface picking for application tools; does not change hover or selection. */
    public pickTileAtScreen(clientX: number, clientY: number): HexMapTileEvent | undefined {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) throw new RangeError("Screen coordinates must be finite");
        const position = this.interactions.pick(clientX, clientY);
        const tile = position && this.getTile(position.x, position.y);
        return position && tile ? { ...position, tile } : undefined;
    }

    public async registerWorldRenderLayer(layer: WorldRenderLayer): Promise<void> {
        if (this.disposed) throw new Error("HexMap has been disposed");
        this.worldRenderLayers.register(layer);
        const registrationSource = this.worldSource;
        const registrationController = this.worldController?.source === registrationSource
            ? this.worldController
            : undefined;
        try {
            if (!registrationSource || !this.mapData) return;
            if (!(await this.runRenderWorldTask(
                registrationSource,
                () => this.initializeRegisteredWorldRenderLayer(layer)
            ))) return;
            const mounts: Promise<void>[] = [];
            for (const [key, record] of this.worldChunkLayers) {
                const mounted = this.runRenderWorldTask(
                    registrationSource,
                    () => this.mountRegisteredWorldRenderLayer(layer, key, record)
                );
                record.renderLayerPromises ??= new Map();
                record.renderLayerPromises.set(layer.id, mounted);
                mounts.push(mounted);
            }
            await Promise.all(mounts);
            this.refreshWorldCopies();
            this.updateWorldChunkVisibility();
        } catch (reason) {
            // A render-world replacement cancels this generation but the
            // registered layer itself belongs to HexMap and remains available
            // for initialization in the next world.
            if (!this.disposed && registrationController && !registrationController.lifecycle.active
                && this.worldRenderLayers.get(layer.id) === layer) return;
            const errors = [renderLayerError(reason)];
            try {
                this.unregisterWorldRenderLayer(layer.id);
            } catch (cleanupReason) {
                const cleanup = cleanupReason instanceof WorldRenderLayerLifecycleError
                    ? cleanupReason.errors
                    : [renderLayerError(cleanupReason)];
                errors.push(...cleanup);
            }
            throw new WorldRenderLayerLifecycleError(`world render layer "${layer.id}" failed to register`, errors);
        }
    }

    public unregisterWorldRenderLayer(id: string): boolean {
        if (this.builtinWorldRenderLayerIds.has(id)) return false;
        const layer = this.worldRenderLayers.get(id);
        if (!layer) return false;
        const errors: Error[] = [];
        this.worldRenderLayerInitRevisions.set(id, (this.worldRenderLayerInitRevisions.get(id) ?? 0) + 1);
        //Detach ownership first so pending async initialize/mount operations
        //become stale before teardown starts.
        this.worldRenderLayers.unregister(id);
        for (const [key, record] of [...this.worldChunkLayers].reverse()) {
            errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
        }
        if (this.initializedWorldRenderLayers.delete(id) && this.worldSource && this.mapData) {
            try {
                layer.unloadWorld?.(this.createWorldRenderLayerHost(id, "@world"));
            } catch (reason) {
                errors.push(renderLayerError(reason));
            }
        }
        try {
            this.removeWorldRenderLayerObjects(id);
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        try {
            layer.dispose();
        } catch (reason) {
            errors.push(renderLayerError(reason));
        }
        this.refreshWorldCopies();
        this.chunkScheduler.invalidateScene();
        if (errors.length > 0) {
            throw new WorldRenderLayerLifecycleError(`world render layer "${id}" failed to unregister cleanly`, errors);
        }
        return true;
    }

    //Persists a sparse source override and refreshes only resident generation
    //chunks whose own or neighboring render attributes can depend on that tile.
    //Pure gameplay state such as `unit` needs no GPU work; terrain, rivers,
    //vegetation and cities are rebuilt locally and the returned promise settles
    //after their asynchronous models have finished (or been superseded).
    private currentWorldEditingFacade(): WorldEditingFacade | undefined {
        if (this.worldEditing?.source === this.worldSource) return this.worldEditing;
        if (!this.worldSource || !this.mapData) return undefined;
        this.worldEditing?.dispose();
        this.worldEditing = new WorldEditingFacade(this.worldSource, this.mapData, {
            visualSignature: worldTileVisualSignature
        });
        return this.worldEditing;
    }

    public setTileOverride(x: number, y: number, changes: WorldTileOverride): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
        try {
            const result = this.currentWorldEditingFacade()?.setTileOverride(x, y, changes);
            if (!result) throw new Error("The current world source does not support tile overrides");
            return result.dirtyTiles.length === 0
                ? Promise.resolve()
                : this.enqueueTileRenderRefresh(result.dirtyTiles[0], result.source, result.refreshKind);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    //Validates an editor-sized change set before dispatching it, then
    //coalesces all visual invalidation into one render refresh. Sources with a
    //native setTileOverrides() implementation can additionally make storage
    //mutation atomic; the per-tile fallback preserves source compatibility.
    public setTileOverrides(changes: readonly WorldTileOverrideChange[]): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
        try {
            const result = this.currentWorldEditingFacade()?.setTileOverrides(changes);
            if (!result) throw new Error("The current world source does not support tile overrides");
            return result.dirtyTiles.length === 0
                ? Promise.resolve()
                : this.enqueueTileRenderRefreshes(result.dirtyTiles, result.source, result.refreshKind);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public clearTileOverride(x: number, y: number): Promise<boolean> {
        if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
        try {
            const result = this.currentWorldEditingFacade()?.clearTileOverride(x, y);
            if (!result) throw new Error("The current world source does not support tile overrides");
            if (!result.changed || result.dirtyTiles.length === 0) return Promise.resolve(result.changed);
            return this.enqueueTileRenderRefresh(result.dirtyTiles[0], result.source, result.refreshKind).then(() => true);
        } catch (reason) {
            return Promise.reject(reason);
        }
    }

    public refreshWorldTiles(points: readonly Point[]): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
        if (!Array.isArray(points) || points.some(point => !point
            || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y))) {
            return Promise.reject(new TypeError("world refresh points must use safe integer coordinates"));
        }
        const source = this.worldSource;
        if (!source || points.length === 0) return Promise.resolve();
        const unique = new Map(points.map(point => [`${point.x},${point.y}`, { x: point.x, y: point.y }]));
        return this.enqueueTileRenderRefreshes([...unique.values()], source);
    }

    private enqueueTileRenderRefresh(
        point: Point,
        source: WorldSource,
        refreshKind: WorldRenderRefreshKind = "terrain"
    ): Promise<void> {
        return this.enqueueTileRenderRefreshes([point], source, refreshKind);
    }

    private enqueueTileRenderRefreshes(
        points: readonly Point[],
        source: WorldSource,
        refreshKind: WorldRenderRefreshKind = "terrain"
    ): Promise<void> {
        const loadRevision = this.loadRevision;
        const controller = this.worldController;
        const surfaceRevision = refreshKind === "terrain" ? this.worldSurface?.invalidate() : undefined;
        const queued = this.worldTileUpdateQueue.then(async () => {
            if (!this.isWorldSessionCurrent(source, loadRevision)) return;
            await this.refreshTileOverridesRendering(points, source, loadRevision, refreshKind);
            if (surfaceRevision !== undefined) {
                const affected = new Map<string, Point>();
                for (const point of points) {
                    for (const candidate of [point, ...getMapNeighbors(this.mapData, point.x, point.y)]) {
                        affected.set(`${candidate.x},${candidate.y}`, candidate);
                    }
                }
                await this.refreshSurfaceConsumers(surfaceRevision, false, [...affected.values()]);
            }
        });
        const refresh = controller?.source === source
            ? controller.lifecycle.track(queued)
            : queued;
        this.worldTileUpdateQueue = refresh.catch(() => undefined);
        return refresh;
    }

    private async refreshTileOverridesRendering(
        points: readonly Point[],
        source: WorldSource,
        loadRevision: number,
        refreshKind: WorldRenderRefreshKind = "terrain"
    ): Promise<void> {
        const streamer = this.worldStreamer;
        if (!streamer || !this.isWorldSessionCurrent(source, loadRevision)) return;
        const residents = new Map(streamer.residentChunks.map(chunk => [
            WorldStreamer.key(chunk.chunkX, chunk.chunkY),
            chunk
        ]));
        const affectedChunks = new Map<string, WorldChunk>();
        const affectedTiles = new Map<string, Point>();
        for (const point of points) {
            for (const affected of [point, ...getMapNeighbors(this.mapData, point.x, point.y)]) {
                affectedTiles.set(`${affected.x},${affected.y}`, affected);
            }
        }
        for (const affected of affectedTiles.values()) {
            const owner = source.resolveChunk(
                Math.floor(affected.x / source.chunkSize),
                Math.floor(affected.y / source.chunkSize)
            );
            if (!owner) continue;
            const key = WorldStreamer.key(owner.x, owner.y);
            const chunk = residents.get(key);
            if (chunk && this.worldChunkLayers.has(key)) affectedChunks.set(key, chunk);
        }
        if (affectedChunks.size === 0) return;

        const keys = [...affectedChunks.keys()].sort();
        const layers = this.worldRenderLayers.values();
        const refreshable = layers.filter(layer => layer.refreshTiles && this.initializedWorldRenderLayers.has(layer.id));
        await Promise.all(refreshable.flatMap(layer => keys.map(key =>
            this.worldChunkLayers.get(key)?.renderLayerPromises?.get(layer.id)
        )));
        if (!this.isWorldSessionCurrent(source, loadRevision)) return;
        const remounted = layers.filter(layer => !layer.refreshTiles && this.initializedWorldRenderLayers.has(layer.id));
        for (const layer of refreshable) {
            const handled = await layer.refreshTiles?.({
                ...this.createWorldRenderLayerHost(layer.id, "@world"),
                tiles: [...affectedTiles.values()],
                refreshKind
            });
            if (!this.isWorldSessionCurrent(source, loadRevision)) return;
            if (handled === false) remounted.push(layer);
        }
        for (const key of keys) {
            const record = this.worldChunkLayers.get(key);
            if (!record) continue;
            const unmountErrors: Error[] = [];
            for (const layer of [...remounted].reverse()) {
                unmountErrors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
            }
            this.reportWorldRenderLayerErrors(`failed to refresh render layers for chunk ${key}`, unmountErrors);
            record.revision = ++this.worldLayerRevision;
            this.clearWorldVegetationPreparation(record);
            for (const layer of remounted) {
                const mounted = this.mountRegisteredWorldRenderLayer(layer, key, record);
                record.renderLayerPromises ??= new Map();
                record.renderLayerPromises.set(layer.id, mounted);
            }
        }

        const builds: Array<Promise<void> | undefined> = [];
        for (const key of keys) {
            const record = this.worldChunkLayers.get(key);
            builds.push(record?.cityPromise, record?.forestPromise, ...(record?.renderLayerPromises?.values() ?? []));
        }
        await Promise.all(builds);
        if (!this.isWorldSessionCurrent(source, loadRevision)) return;
        this.updateWorldChunkVisibility();
    }

    private isWorldSessionCurrent(source: WorldSource, loadRevision: number): boolean { return !this.disposed && this.worldSource === source && this.loadRevision === loadRevision; }

    //-------------------------------------------------------------------------
    //Fog of war (see objects/FogOfWar.ts) - updates one tile's terrain, grass
    //and trees/city to the given state (0 = Unseen, 1 = Explored, 2 = Visible).
    //Every tile defaults to Visible, so calling this is entirely optional; a
    //consumer that wants fog of war (e.g. GameEngine, when its own fogOfWar
    //option is on) drives it from unit positions/view ranges.
    //
    //The state is always recorded in fogStates, even while warFogVisible is
    //false (the layers then just aren't repainted) - so consumers keep feeding
    //fog updates as usual and re-showing the fog repaints everything current.
    //-------------------------------------------------------------------------
    public setTileFog(x: number, y: number, state: FogState): void {
        this.setTilesFog([{ x, y, state }]);
    }

    public setTilesFog(changes: readonly FogChange[]): void {
        if (!this.mapData || !this.fogStates || changes.length === 0) return;
        const normalizedChanges: FogChange[] = [];
        for (const change of changes) {
            if (change.state !== FogState.Unseen && change.state !== FogState.Explored && change.state !== FogState.Visible) continue;
            const normalized = normalizeMapCoordinates(this.mapData, change.x, change.y);
            if (!normalized || !getMapTile(this.mapData, normalized.x, normalized.y)) continue;
            this.fogStates.set(normalized.x, normalized.y, change.state);
            normalizedChanges.push(normalized.x === change.x && normalized.y === change.y
                ? change
                : { ...normalized, state: change.state });
        }
        if (this.warFogShown) this.applyFogChanges(normalizedChanges);
    }

    private resetRenderOrigin(): void {
        this.renderOrigin.set(0, 0);
        this.worldRoot.position.set(0, 0, 0);
        this.terrain?.setCameraWorldOffset(0, 0);
    }

    private rebaseWorld(): void {
        if (!this.mapData?.infinite) return;
        const x = this.controls.target.x;
        const z = this.controls.target.z;
        if (Math.max(Math.abs(x), Math.abs(z)) < this.floatingOriginThreshold) return;
        this.renderOrigin.x += x;
        this.renderOrigin.y += z;
        this.terrain?.setCameraWorldOffset(this.renderOrigin.x, this.renderOrigin.y);
        this.worldRoot.position.x -= x;
        this.worldRoot.position.z -= z;
        this.controls.target.x -= x;
        this.controls.target.z -= z;
        this.camera.position.x -= x;
        this.camera.position.z -= z;
    }

    private updateWorldDemand(dtS: number): void {
        if (!this.worldStreamer || !this.worldSource) return;
        this.worldDemandElapsedS += Math.max(0, dtS);
        this.logicalTargetScratch.copy(this.controls.target);
        if (this.mapData.infinite) {
            this.logicalTargetScratch.x += this.renderOrigin.x;
            this.logicalTargetScratch.z += this.renderOrigin.y;
        }
        const currentX = this.logicalTargetScratch.x;
        const currentY = this.logicalTargetScratch.z;
        let dx = this.lastStreamingTarget ? currentX - this.lastStreamingTarget.x : 0;
        let dy = this.lastStreamingTarget ? currentY - this.lastStreamingTarget.y : 0;
        if (this.lastStreamingTarget) {
            if (this.mapData.wrapX && this.worldPeriodX > 0) {
                if (dx > this.worldPeriodX / 2) dx -= this.worldPeriodX;
                else if (dx < -this.worldPeriodX / 2) dx += this.worldPeriodX;
            }
            if (this.mapData.wrapY && this.worldPeriodY > 0) {
                if (dy > this.worldPeriodY / 2) dy -= this.worldPeriodY;
                else if (dy < -this.worldPeriodY / 2) dy += this.worldPeriodY;
            }
            const displacementSq = dx * dx + dy * dy;
            const threshold = WORLD_CHUNK_SIZE * this.options.size * 1.5 * 0.25;
            const movedEnough = displacementSq >= threshold * threshold;
            const delayedMovement = displacementSq > 0.0001 && this.worldDemandElapsedS >= 0.25;
            const velocityDecayDue = this.streamingVelocity.lengthSq() > 1 && this.worldDemandElapsedS >= 0.25;
            if (!movedEnough && !delayedMovement && !velocityDecayDue) return;
            const elapsedS = Math.max(this.worldDemandElapsedS, 1 / 240);
            const alpha = 1 - Math.exp(-elapsedS / 0.25);
            this.streamingMotionScratch.set(dx / elapsedS, dy / elapsedS);
            this.streamingVelocity.lerp(this.streamingMotionScratch, alpha);
        }
        this.lastStreamingTarget ??= new Vector2();
        this.lastStreamingTarget.set(currentX, currentY);
        this.worldDemandElapsedS = 0;
        const tile = pickTile(
            this.logicalTargetScratch,
            this.options.size,
            this.mapData.infinite ? undefined : this.mapData.w,
            this.mapData.infinite ? undefined : this.mapData.h,
            this.mapData.wrapX,
            this.mapData.wrapY
        );
        if (!tile) return;
        const resolved = this.worldSource.resolveChunk(
            Math.floor(tile.x / this.worldChunkSize),
            Math.floor(tile.y / this.worldChunkSize)
        );
        if (!resolved) return;
        const key = WorldStreamer.key(resolved.x, resolved.y);
        let predictedTile: Point | undefined;
        if (this.streamingPredictionSeconds > 0 && this.streamingPredictionMaxChunks > 0
            && this.streamingVelocity.lengthSq() > 1) {
            const maxAhead = this.streamingPredictionMaxChunks * this.worldChunkSize * this.options.size * 1.5;
            const ahead = this.streamingAheadScratch.copy(this.streamingVelocity)
                .multiplyScalar(this.streamingPredictionSeconds);
            if (ahead.length() > maxAhead) ahead.setLength(maxAhead);
            this.predictedTargetScratch.copy(this.logicalTargetScratch);
            this.predictedTargetScratch.x += ahead.x;
            this.predictedTargetScratch.z += ahead.y;
            predictedTile = pickTile(
                this.predictedTargetScratch,
                this.options.size,
                this.mapData.infinite ? undefined : this.mapData.w,
                this.mapData.infinite ? undefined : this.mapData.h,
                this.mapData.wrapX,
                this.mapData.wrapY
            ) ?? undefined;
        }
        const predictedChunk = predictedTile
            ? this.worldSource.resolveChunk(
                Math.floor(predictedTile.x / this.worldChunkSize),
                Math.floor(predictedTile.y / this.worldChunkSize)
            )
            : undefined;
        const signature = `${key}>${predictedChunk ? WorldStreamer.key(predictedChunk.x, predictedChunk.y) : key}`;
        if (signature === this.worldDemandSignature) return;
        this.worldDemandChunkKey = key;
        this.worldDemandSignature = signature;
        const demand = this.worldController?.setCenterTile(tile.x, tile.y, predictedTile);
        if (!demand) return;
        void demand.catch(error => {
            if (error instanceof Error && error.name !== "AbortError") this.emit("error", error);
        });
    }

    private logicalGround(point: Vector3): Vector3 {
        if (!this.mapData?.infinite) return point;
        point.x += this.renderOrigin.x;
        point.z += this.renderOrigin.y;
        return point;
    }

    private applyFogChanges(changes: readonly FogChange[]): void {
        const renderedStates = new Map<string, FogState>();
        const terrainChanges: FogChange[] = [];
        const grassChanges = new Map<GrassField, FogChange[]>();
        const forestChanges = new Map<ForestField, FogChange[]>();
        const enqueue = <T extends GrassField | ForestField>(
            batches: Map<T, FogChange[]>,
            field: T | undefined,
            change: FogChange
        ): void => {
            if (!field) return;
            const batch = batches.get(field) ?? [];
            batch.push(change);
            batches.set(field, batch);
        };
        for (const { x, y, state } of changes) {
            const change = { x, y, state };
            if (this.worldSource) {
                const resolved = this.worldSource.resolveChunk(
                    Math.floor(x / this.worldChunkSize),
                    Math.floor(y / this.worldChunkSize)
                );
                const record = resolved
                    ? this.worldChunkLayers.get(WorldStreamer.key(resolved.x, resolved.y))
                    : undefined;
                if (!record) continue;
                terrainChanges.push(change);
                enqueue(grassChanges, record.grass, change);
                enqueue(forestChanges, record.forest, change);
            } else {
                terrainChanges.push(change);
                enqueue(grassChanges, this.grass, change);
                enqueue(forestChanges, this.forest, change);
            }
            renderedStates.set(`${x},${y}`, state);
        }
        this.terrain?.setFogStates(terrainChanges);
        for (const [field, batch] of grassChanges) field.setFogStates(batch);
        for (const [field, batch] of forestChanges) field.setFogStates(batch);
        if (renderedStates.size === 0) return;
        for (const copy of this.worldCopies) {
            copy.traverse(object => {
                const key = object.userData[CITY_FOG_TILE_KEY] as string | undefined;
                const state = key ? renderedStates.get(key) : undefined;
                if (state !== undefined) object.visible = state !== FogState.Unseen;
            });
        }
    }

    //Repaints every recorded tile: its real state when the fog is shown, or
    //Visible when it's hidden. Also called after any layer rebuild (see
    //rebuildTerrain/rebuildForest/rebuildGrass) - a fresh layer's instanced
    //attributes default to all-Visible, which silently dropped previously
    //painted fog until the next consumer update.
    private reapplyFog(): void {
        if (this.worldSource) {
            for (const record of this.worldChunkLayers.values()) this.reapplyFogToPoints(record.points, record);
            return;
        }
        const changes: FogChange[] = [];
        this.fogStates?.forEach((state, x, y) => {
            changes.push({ x, y, state: this.warFogShown ? state : FogState.Visible });
        });
        this.applyFogChanges(changes);
    }

    //Purely visual show/hide of the war fog: hiding repaints every tile as
    //Visible but keeps the recorded states (and keeps recording new ones from
    //setTileFog), so re-showing restores the current fog exactly. A debug/
    //"reveal map" convenience - it does not touch GameEngine's FogOfWar
    //tracking, unit visibility or pathfinding.
    public get warFogVisible(): boolean {
        return this.warFogShown;
    }
    public set warFogVisible(value: boolean) {
        if (this.warFogShown === value) return;
        this.warFogShown = value;
        this.reapplyFog();
    }

    public get gridVisible(): boolean {
        return this.terrain?.gridVisible ?? this.options.gridVisible;
    }

    public set gridVisible(value: boolean) {
        this.options.gridVisible = value;
        if (this.terrain) this.terrain.gridVisible = value;
    }

    //-------------------------------------------------------------------------
    //Water - live shader uniforms forwarded straight through to TerrainMesh,
    //no rebuild needed.
    //-------------------------------------------------------------------------
    public get waterWaveAmplitude(): number {
        return this.terrain?.waterWaveAmplitude ?? this.options.waterWaveAmplitude;
    }
    public set waterWaveAmplitude(value: number) {
        this.options.waterWaveAmplitude = value;
        if (this.terrain) this.terrain.waterWaveAmplitude = value;
    }

    public get waterWaveFrequency(): number {
        return this.terrain?.waterWaveFrequency ?? this.options.waterWaveFrequency;
    }
    public set waterWaveFrequency(value: number) {
        this.options.waterWaveFrequency = value;
        if (this.terrain) this.terrain.waterWaveFrequency = value;
    }

    public get waterWaveSpeed(): number {
        return this.terrain?.waterWaveSpeed ?? this.options.waterWaveSpeed;
    }
    public set waterWaveSpeed(value: number) {
        this.options.waterWaveSpeed = value;
        if (this.terrain) this.terrain.waterWaveSpeed = value;
    }

    public get waterSparkleIntensity(): number {
        return this.terrain?.waterSparkleIntensity ?? this.options.waterSparkleIntensity;
    }
    public set waterSparkleIntensity(value: number) {
        this.options.waterSparkleIntensity = value;
        if (this.terrain) this.terrain.waterSparkleIntensity = value;
    }

    public get waterFresnelIntensity(): number {
        return this.terrain?.waterFresnelIntensity ?? this.options.waterFresnelIntensity;
    }
    public set waterFresnelIntensity(value: number) {
        this.options.waterFresnelIntensity = value;
        if (this.terrain) this.terrain.waterFresnelIntensity = value;
    }

    public get waterColorShallow(): ColorRepresentation {
        return this.terrain?.waterColorShallow ?? this.options.waterColorShallow;
    }
    public set waterColorShallow(value: ColorRepresentation) {
        this.options.waterColorShallow = value;
        if (this.terrain) this.terrain.waterColorShallow = value;
    }

    public get waterColorDeep(): ColorRepresentation {
        return this.terrain?.waterColorDeep ?? this.options.waterColorDeep;
    }
    public set waterColorDeep(value: ColorRepresentation) {
        this.options.waterColorDeep = value;
        if (this.terrain) this.terrain.waterColorDeep = value;
    }

    //-------------------------------------------------------------------------
    //Coastal foam waves - all live shader uniforms forwarded to TerrainMesh,
    //no rebuild (the enable flag included: it's a uniform gate in the water
    //fragment shader).
    //-------------------------------------------------------------------------
    public get coastalWavesEnabled(): boolean {
        return this.terrain?.coastalWavesEnabled ?? this.options.coastalWavesEnabled;
    }
    public set coastalWavesEnabled(value: boolean) {
        this.options.coastalWavesEnabled = value;
        if (this.terrain) this.terrain.coastalWavesEnabled = value;
    }

    public get coastalWaveColor(): ColorRepresentation {
        return this.terrain?.coastalWaveColor ?? this.options.coastalWaveColor;
    }
    public set coastalWaveColor(value: ColorRepresentation) {
        this.options.coastalWaveColor = value;
        if (this.terrain) this.terrain.coastalWaveColor = value;
    }

    public get coastalWaveCount(): number {
        return this.terrain?.coastalWaveCount ?? this.options.coastalWaveCount;
    }
    public set coastalWaveCount(value: number) {
        this.options.coastalWaveCount = value;
        if (this.terrain) this.terrain.coastalWaveCount = value;
    }

    public get coastalWaveSpeed(): number {
        return this.terrain?.coastalWaveSpeed ?? this.options.coastalWaveSpeed;
    }
    public set coastalWaveSpeed(value: number) {
        this.options.coastalWaveSpeed = value;
        if (this.terrain) this.terrain.coastalWaveSpeed = value;
    }

    public get coastalWaveWidth(): number {
        return this.terrain?.coastalWaveWidth ?? this.options.coastalWaveWidth;
    }
    public set coastalWaveWidth(value: number) {
        this.options.coastalWaveWidth = value;
        if (this.terrain) this.terrain.coastalWaveWidth = value;
    }

    public get coastalWaveRange(): number {
        return this.terrain?.coastalWaveRange ?? this.options.coastalWaveRange;
    }
    public set coastalWaveRange(value: number) {
        this.options.coastalWaveRange = value;
        if (this.terrain) this.terrain.coastalWaveRange = value;
    }

    public get coastalWaveDistortion(): number {
        return this.terrain?.coastalWaveDistortion ?? this.options.coastalWaveDistortion;
    }
    public set coastalWaveDistortion(value: number) {
        this.options.coastalWaveDistortion = value;
        if (this.terrain) this.terrain.coastalWaveDistortion = value;
    }

    public get coastalWaveOpacity(): number {
        return this.terrain?.coastalWaveOpacity ?? this.options.coastalWaveOpacity;
    }
    public set coastalWaveOpacity(value: number) {
        this.options.coastalWaveOpacity = value;
        if (this.terrain) this.terrain.coastalWaveOpacity = value;
    }

    //-------------------------------------------------------------------------
    //Land/coastal blending + beach height - all live shader uniforms, no rebuild.
    //-------------------------------------------------------------------------
    public get landBlendWidth(): number {
        return this.terrain?.landBlendWidth ?? this.options.landBlendWidth;
    }
    public set landBlendWidth(value: number) {
        this.options.landBlendWidth = value;
        if (this.terrain) this.terrain.landBlendWidth = value;
    }

    public get landBlendEnabled(): boolean {
        return this.terrain?.landBlendEnabled ?? this.options.landBlendEnabled;
    }
    public set landBlendEnabled(value: boolean) {
        this.options.landBlendEnabled = value;
        if (this.terrain) this.terrain.landBlendEnabled = value;
    }

    public get waterCornerRounding(): number {
        return this.terrain?.waterCornerRounding ?? this.options.waterCornerRounding;
    }
    public set waterCornerRounding(value: number) {
        this.options.waterCornerRounding = value;
        if (this.terrain) this.terrain.waterCornerRounding = value;
    }

    public get coastCurvature(): number {
        return this.terrain?.coastCurvature ?? this.options.coastCurvature;
    }
    public set coastCurvature(value: number) {
        this.options.coastCurvature = value;
        if (this.terrain) this.terrain.coastCurvature = value;
    }

    public get landBlendCurvature(): number {
        return this.terrain?.landBlendCurvature ?? this.options.landBlendCurvature;
    }
    public set landBlendCurvature(value: number) {
        this.options.landBlendCurvature = value;
        if (this.terrain) this.terrain.landBlendCurvature = value;
    }

    public get mountainHeight(): number {
        return this.terrain?.mountainHeight ?? this.options.mountainHeight;
    }
    public set mountainHeight(value: number) {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError("mountainHeight must be a non-negative finite number");
        }
        if (value === this.mountainHeight) return;
        this.options.mountainHeight = value;
        if (this.terrain) this.terrain.mountainHeight = value;
        else this.worldSurface?.setMountainHeight(value);
        const revision = this.worldSurface?.revision;
        if (revision !== undefined) {
            void this.refreshSurfaceConsumers(revision, true).catch(error => {
                if (this.worldSurface?.revision === revision) this.emit("error", error);
            });
        }
    }

    public get landformDebugMode(): LandformDebugMode {
        return this.terrain?.landformDebugMode ?? this.options.landformDebugMode;
    }
    public set landformDebugMode(value: LandformDebugMode) {
        this.options.landformDebugMode = value;
        if (this.terrain) this.terrain.landformDebugMode = value;
    }

    public get terrainTextureRegionSize(): number {
        return this.terrain?.terrainTextureRegionSize ?? this.options.terrainTextureRegionSize;
    }
    public set terrainTextureRegionSize(value: number) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new RangeError("terrainTextureRegionSize must be a positive finite number");
        }
        this.options.terrainTextureRegionSize = value;
        if (this.terrain) this.terrain.terrainTextureRegionSize = value;
    }

    public get beachWidth(): number {
        return this.terrain?.beachWidth ?? this.options.beachWidth;
    }
    public set beachWidth(value: number) {
        this.options.beachWidth = value;
        if (this.terrain) this.terrain.beachWidth = value;
    }

    public get waterDepth(): number {
        return this.terrain?.waterDepth ?? this.options.waterDepth;
    }
    public set waterDepth(value: number) {
        this.options.waterDepth = value;
        if (this.terrain) this.terrain.waterDepth = value;
    }

    //-------------------------------------------------------------------------
    //Rivers - all live shader uniforms on the land material, forwarded to
    //TerrainMesh, no rebuild needed. Which tiles/edges carry a river is map
    //data (the "river" modifier), not an option - see helpers/rivers.ts.
    //-------------------------------------------------------------------------
    public get riverWidth(): number {
        return this.terrain?.riverWidth ?? this.options.riverWidth;
    }
    public set riverWidth(value: number) {
        this.options.riverWidth = value;
        if (this.terrain) this.terrain.riverWidth = value;
    }

    public get riverBankWidth(): number {
        return this.terrain?.riverBankWidth ?? this.options.riverBankWidth;
    }
    public set riverBankWidth(value: number) {
        this.options.riverBankWidth = value;
        if (this.terrain) this.terrain.riverBankWidth = value;
    }

    public get riverCurvature(): number {
        return this.terrain?.riverCurvature ?? this.options.riverCurvature;
    }
    public set riverCurvature(value: number) {
        this.options.riverCurvature = value;
        if (this.terrain) this.terrain.riverCurvature = value;
    }

    public get riverColorShallow(): ColorRepresentation {
        return this.terrain?.riverColorShallow ?? this.options.riverColorShallow;
    }
    public set riverColorShallow(value: ColorRepresentation) {
        this.options.riverColorShallow = value;
        if (this.terrain) this.terrain.riverColorShallow = value;
    }

    public get riverColorDeep(): ColorRepresentation {
        return this.terrain?.riverColorDeep ?? this.options.riverColorDeep;
    }
    public set riverColorDeep(value: ColorRepresentation) {
        this.options.riverColorDeep = value;
        if (this.terrain) this.terrain.riverColorDeep = value;
    }

    public get riverBankColor(): ColorRepresentation {
        return this.terrain?.riverBankColor ?? this.options.riverBankColor;
    }
    public set riverBankColor(value: ColorRepresentation) {
        this.options.riverBankColor = value;
        if (this.terrain) this.terrain.riverBankColor = value;
    }

    public get riverFlowSpeed(): number {
        return this.terrain?.riverFlowSpeed ?? this.options.riverFlowSpeed;
    }
    public set riverFlowSpeed(value: number) {
        this.options.riverFlowSpeed = value;
        if (this.terrain) this.terrain.riverFlowSpeed = value;
    }

    public get riverDepth(): number {
        return this.terrain?.riverDepth ?? this.options.riverDepth;
    }
    public set riverDepth(value: number) {
        this.options.riverDepth = value;
        if (this.terrain) this.terrain.riverDepth = value;
    }

    public get lakeShoreWidth(): number {
        return this.terrain?.lakeShoreWidth ?? this.options.lakeShoreWidth;
    }
    public set lakeShoreWidth(value: number) {
        this.options.lakeShoreWidth = value;
        if (this.terrain) this.terrain.lakeShoreWidth = value;
    }

    //-------------------------------------------------------------------------
    //Instance layout settings coalesce within a turn and serialize replacement
    //work. Streamed grass/forest consume one shared Worker layout generation.
    //-------------------------------------------------------------------------
    private scheduleVegetationRefresh(kind: "grass" | "forest"): void {
        if (this.disposed || !this.mapData) return;
        const revision = this.loadRevision;
        if (this.pendingVegetationRefresh?.revision === revision) {
            this.pendingVegetationRefresh[kind] = true;
            return;
        }
        const request = { revision, grass: kind === "grass", forest: kind === "forest" };
        this.pendingVegetationRefresh = request;
        const queued = this.vegetationRefreshQueue.then(async () => {
            if (this.pendingVegetationRefresh === request) this.pendingVegetationRefresh = undefined;
            if (this.disposed || this.loadRevision !== revision) return;
            if (this.worldStreamer || (request.grass && request.forest)) {
                await this.rebuildSurfaceVegetation(revision);
            } else if (request.grass) await this.rebuildGrass();
            else await this.rebuildForest(revision);
        });
        const refresh = this.worldController?.lifecycle.track(queued) ?? queued;
        this.vegetationRefreshQueue = refresh.then(() => undefined, () => undefined);
        void refresh.catch(error => {
            if (!this.disposed && this.loadRevision === revision) this.emit("error", error);
        });
    }

    public get treesPerTile(): number {
        return this.options.treesPerTile;
    }
    public set treesPerTile(value: number) {
        if (!Number.isInteger(value) || value < 0) throw new RangeError("treesPerTile must be a non-negative integer");
        if (value === this.options.treesPerTile) return;
        this.options.treesPerTile = value;
        this.scheduleVegetationRefresh("forest");
    }

    public get treeScale(): number {
        return this.options.treeScale;
    }
    public set treeScale(value: number) {
        if (!Number.isFinite(value) || value < 0) throw new RangeError("treeScale must be a non-negative finite number");
        if (value === this.options.treeScale) return;
        this.options.treeScale = value;
        this.scheduleVegetationRefresh("forest");
    }

    //Streamed visibility changes replace the shared vegetation layout so
    //disabled blades release their field resources and stop generating.
    public get grassVisible(): boolean {
        return this.options.grassEnabled;
    }

    public set grassVisible(value: boolean) {
        if (typeof value !== "boolean") throw new TypeError("grassVisible must be a boolean");
        if (value === this.options.grassEnabled) return;
        this.options.grassEnabled = value;
        if (this.grass) this.grass.visible = value;
        if (this.worldStreamer) this.scheduleVegetationRefresh("grass");
        this.refreshWorldCopies();
    }

    //Wind uniforms are cheap to update live - no rebuild needed.
    public get grassWindStrength(): number {
        return this.grass?.windStrength ?? this.options.grassWindStrength;
    }

    public set grassWindStrength(value: number) {
        this.options.grassWindStrength = value;
        if (this.grass) this.grass.windStrength = value;
        for (const grass of new Set(this.streamedGrassByChunkId.values())) grass.windStrength = value;
    }

    public get grassWindSpeed(): number {
        return this.grass?.windSpeed ?? this.options.grassWindSpeed;
    }

    public set grassWindSpeed(value: number) {
        this.options.grassWindSpeed = value;
        if (this.grass) this.grass.windSpeed = value;
        for (const grass of new Set(this.streamedGrassByChunkId.values())) grass.windSpeed = value;
    }

    //Blade count/size is baked into the instanced geometry at build time, so
    //changing any of these rebuilds the whole grass field (see rebuildGrass()).
    public get grassDensity(): number {
        return this.options.grassDensity;
    }

    public set grassDensity(value: number) {
        if (!Number.isInteger(value) || value < 0) throw new RangeError("grassDensity must be a non-negative integer");
        if (value === this.options.grassDensity) return;
        this.options.grassDensity = value;
        this.scheduleVegetationRefresh("grass");
    }

    public get grassBladeWidth(): number {
        return this.options.grassBladeWidth;
    }

    public set grassBladeWidth(value: number) {
        if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeWidth must be a positive finite number");
        if (value === this.options.grassBladeWidth) return;
        this.options.grassBladeWidth = value;
        this.scheduleVegetationRefresh("grass");
    }

    public get grassBladeHeight(): number {
        return this.options.grassBladeHeight;
    }

    public set grassBladeHeight(value: number) {
        if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeHeight must be a positive finite number");
        if (value === this.options.grassBladeHeight) return;
        this.options.grassBladeHeight = value;
        this.scheduleVegetationRefresh("grass");
    }

    public selectTile(x: number, y: number): void {
        const normalized = this.mapData ? normalizeMapCoordinates(this.mapData, x, y) : { x, y };
        if (!normalized || (this.mapData && !this.getTile(normalized.x, normalized.y))) return;
        this.selector.visible = true;
        this.positionMarker(this.selector, normalized);
        this.lastSelected = normalized;
    }

    public get selectedTile(): Point | null {
        return this.lastSelected;
    }

    public get size(): number {
        return this.options.size;
    }

    public get worldViewDistance(): number {
        return this.options.renderDistance;
    }

    public get worldDescriptor(): Readonly<WorldDescriptor> | undefined {
        return this.worldSource?.descriptor;
    }

    public get worldBounds(): Readonly<WorldBounds> | undefined {
        return this.worldSource?.bounds;
    }

    public requestWorldOverview(
        options: WorldOverviewPreparationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldOverviewRaster> {
        if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
        const source = this.worldSource;
        if (!source) return Promise.reject(new Error("A world must be loaded before requesting an overview"));
        if (!isWorldOverviewSource(source)) {
            return Promise.reject(new Error("The active world source does not support overview generation"));
        }
        return source.prepareOverview(options, request);
    }

    /** Current logical-world height authority; available after a world is loaded. */
    public get surface(): WorldSurfaceAnchor | undefined {
        return this.worldSurface;
    }

    public get streamingStats(): Readonly<WorldChunkStreamingStats> {
        return this.chunkScheduler.stats;
    }

    public get resourceBudget(): ResourceBudgetView { return this.chunkScheduler.resourceBudget; }

    public get modelAssetStats(): Readonly<ModelAssetCacheStats> { return this.modelAssets.stats; }

    public get modelAssetCache(): ModelAssetCache { return this.modelAssets; }

    public preloadModelAssets(paths: Iterable<string>): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
        return this.modelAssets.preload(paths);
    }

    public createResourceAccount(label: string): ResourceBudgetAccount {
        if (this.disposed) throw new Error("HexMap has been disposed");
        return this.chunkScheduler.createResourceAccount(label);
    }

    public get worldStreamingStats(): Readonly<WorldStreamingStats> | undefined {
        return this.worldStreamer?.stats;
    }

    public get worldChunkResidency(): ChunkResidencyCoordinator | undefined {
        return this.worldResidency;
    }

    public get renderWorldController(): RenderWorldController | undefined {
        return this.worldController;
    }

    public get frameTaskStats(): Readonly<FrameTaskSchedulerStats> {
        return this.frameTasks.stats;
    }

    public get adaptiveStreamingStats(): Readonly<AdaptiveStreamingStats> | undefined {
        return this.adaptiveStreamingController?.stats;
    }

    public get gpuTimingStats(): Readonly<WebGlGpuTimerStats> {
        return this.rendererHost.gpuTimingStats;
    }

    public get webGlContextStats(): Readonly<WebGlContextStats> {
        return this.rendererHost.contextStats;
    }

    public get worldEditingStats(): Readonly<WorldEditingStats> | undefined {
        return this.worldEditing?.stats;
    }

    public get workCoordinator(): RuntimeWorkCoordinator {
        return this.runtimeWork;
    }

    public get workStats(): Readonly<RuntimeWorkCoordinatorStats> {
        return this.runtimeWork.stats;
    }

    public get settled(): Promise<void> {
        return Promise.all([...this.drainingWorldSessions]).then(() => undefined);
    }

    public sampleAdaptiveStreaming(sample: AdaptiveStreamingSample): Readonly<AdaptiveStreamingProfile> | undefined {
        const profile = this.adaptiveStreamingController?.sample(sample);
        if (profile) this.applyAdaptiveStreamingProfile(profile);
        return profile;
    }

    public drawRoutePath(path: Point[]): void {
        this.cleanRoutePath();
        if (path.length === 0) return;
        this.routePath = path.map(point => ({ ...point }));

        let reference = this.getCameraTarget();
        const points = path.map(p => {
            const center = this.nearestRepeatedCenter(p.x, p.y, reference);
            const point = new Vector3(
                center.x,
                (this.worldSurface?.getWorldHeight(center.x, center.y) ?? 0) + 1.1,
                center.y
            );
            reference = point;
            return point;
        });
        const origin = points[0].clone();
        const geometry = new BufferGeometry().setFromPoints(points.map(point => point.clone().sub(origin)));
        const material = new LineBasicMaterial({ color: 0xff0000, linewidth: 5 });
        this.routeLine = new Line(geometry, material);
        this.routeLine.position.copy(origin);
        this.worldRoot.add(this.routeLine);
    }

    public cleanRoutePath(): void {
        if (this.routeLine) {
            this.worldRoot.remove(this.routeLine);
            this.routeLine.geometry.dispose();
            const materials = Array.isArray(this.routeLine.material) ? this.routeLine.material : [this.routeLine.material];
            for (const material of materials) material.dispose();
            this.routeLine = undefined;
        }
        this.routePath = undefined;
    }

    //Escape hatch for consumers that want to add their own Object3D (units,
    //effects, custom markers) to the map's scene.
    public add(object: Object3D): void {
        this.worldRoot.add(object);
    }

    public remove(object: Object3D): void {
        this.worldRoot.remove(object);
    }

    public getCamera(): PerspectiveCamera {
        return this.camera;
    }

    public get interactionStats(): Readonly<HexMapInteractionStats> { return this.interactions.stats; }

    public getCameraTarget(target = new Vector3()): Vector3 {
        target.copy(this.controls.target);
        target.x += this.renderOrigin.x;
        target.z += this.renderOrigin.y;
        return target;
    }

    public getCameraTargetTile(): Point | undefined {
        if (!this.mapData) return undefined;
        const target = this.getCameraTarget(this.logicalTargetScratch);
        const tile = pickTile(
            target,
            this.options.size,
            this.mapData.infinite ? undefined : this.mapData.w,
            this.mapData.infinite ? undefined : this.mapData.h,
            this.mapData.wrapX ?? false,
            this.mapData.wrapY ?? false
        );
        return tile ? { x: tile.x, y: tile.y } : undefined;
    }

    public setCameraTargetTile(x: number, y: number): void {
        if (!this.mapData) throw new Error("A world must be loaded before moving the camera target");
        const point = normalizeMapCoordinates(this.mapData, x, y);
        if (!point) throw new RangeError("camera target tile is outside the world bounds");
        const center = getHexCenter(point.x, point.y, this.options.size);
        const current = this.getCameraTarget(this.logicalTargetScratch);
        const dx = center.x - current.x;
        const targetY = this.worldSurface?.getTileCenterHeight(point.x, point.y) ?? 0;
        const dy = targetY - current.y;
        const dz = center.y - current.z;
        this.camera.position.x += dx;
        this.camera.position.y += dy;
        this.camera.position.z += dz;
        this.controls.target.x += dx;
        this.controls.target.y += dy;
        this.controls.target.z += dz;
        this.controls.update();
    }

    public getScene(): ThreeScene {
        return this.scene;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.loadRevision += 1;
        this.forestRevision += 1;
        this.stopWorldStreaming();
        try {
            this.worldRenderLayers.dispose();
        } catch (reason) {
            const errors = reason instanceof WorldRenderLayerLifecycleError
                ? reason.errors
                : [renderLayerError(reason)];
            this.reportWorldRenderLayerErrors("world render layer registry failed to dispose", errors);
        }
        if (this.animationFrameId !== undefined) window.cancelAnimationFrame(this.animationFrameId);

        window.removeEventListener("resize", this.handleResize);
        this.resizeObserver?.disconnect();
        this.interactions.dispose();

        this.cleanRoutePath();
        this.clearWorldCopies();
        if (this.terrain) {
            this.worldRoot.remove(this.terrain);
            this.terrain.dispose();
        }
        if (this.forest) {
            this.worldRoot.remove(this.forest);
            this.forest.dispose();
            this.forest = undefined;
        }
        if (this.grass) {
            this.worldRoot.remove(this.grass);
            this.grass.dispose();
            this.grass = undefined;
        }
        this.modelAssets.dispose();
        this.chunkScheduler.dispose();
        this.selector.geometry.dispose();
        (this.selector.material as Material).dispose();
        this.pointer.geometry.dispose();
        (this.pointer.material as Material).dispose();
        this.controls.dispose();
        this.rendererHost.dispose();
        this.frameTasks.dispose();
        this.runtimeWork.dispose();
        this.removeAllListeners();
    }

    public async disposeAsync(): Promise<void> {
        this.dispose();
        await this.settled;
    }
}
