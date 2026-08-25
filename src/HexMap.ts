import {
    WebGLRenderer,
    Scene as ThreeScene,
    PerspectiveCamera,
    Color,
    AmbientLight,
    DirectionalLight,
    Mesh,
    RingGeometry,
    MeshBasicMaterial,
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
    Material,
    ACESFilmicToneMapping
} from "three";
// MapControls was removed from three.js's examples; OrbitControls configured
// with swapped mouse buttons (left=pan, right=rotate) reproduces it.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import { EventEmitter } from "./EventEmitter";
import { MapInfo, Point, TileInfo } from "./interfaces";
import { HexMapEventName, Land, LandColor } from "./enums";
import { getHexCenter } from "./helpers/helpers";
import { screenToGround, pickTile } from "./helpers/picking";
import { CITY_FOG_TILE_KEY, TerrainMesh, TerrainAtlas } from "./objects/TerrainMesh";
import { createForest, ForestField, ForestSharedResources } from "./objects/Forest";
import { GrassField, createGrassField, GrassSharedResources } from "./objects/Grass";
import { FogChange, FogState } from "./objects/FogOfWar";
import { FogStateStore } from "./helpers/fogStateStore";
import { getMapTile, normalizeMapCoordinates, positiveModulo } from "./helpers/topology";
import { getWorldChunkMetadata, WORLD_CHUNK_SIZE, WorldChunkMetadata } from "./helpers/chunks";
import {
    createDefaultWorldChunkSchedulerOptions,
    WorldChunkScheduler,
    WorldChunkStreamingStats
} from "./rendering/WorldChunkScheduler";
import { FrameTaskScheduler, FrameTaskSchedulerStats } from "./rendering/FrameTaskScheduler";
import {
    MAX_WORLD_GENERATION_CHUNK_SIZE
} from "./world/generateWorldChunk";
import {
    assertWorldSource,
    WorldChunk,
    WorldSource
} from "./world/WorldSource";
import { WorldStreamer, WorldStreamingStats } from "./world/WorldStreamer";

export interface HexMapOptions {
    element: string;                       // CSS selector for the <canvas>
    size?: number;                          // hex size in world units, default 40
    texturesBaseUrl?: string;                // folder with terrain.png/transitions.png/land-atlas.json
    gridVisible?: boolean;
    gridColor?: ColorRepresentation;
    gridWidth?: number;
    gridOpacity?: number;
    selectorColor?: ColorRepresentation;
    pointerColor?: ColorRepresentation;
    treesPerTile?: number;

    //Sea/coastal tiles always render as an animated, solid-colored water layer
    //(waves, sparkle, a 3D beach slope where they meet land - see
    //shaders/water.*.ts).
    waterColorShallow?: ColorRepresentation;
    waterColorDeep?: ColorRepresentation;

    //Wave shape/animation fine-tuning. Defaults produce a gentle, sparkling
    //sea; turn amplitude/speed up for choppier water, sparkleIntensity/
    //fresnelIntensity down for a flatter look.
    waterWaveAmplitude?: number;    // default 1.6 (world units)
    waterWaveFrequency?: number;    // default 1.0 (multiplier)
    waterWaveSpeed?: number;        // default 1.0 (multiplier)
    waterSparkleIntensity?: number; // default 1.0
    waterFresnelIntensity?: number; // default 1.0

    //Stylized coastal foam waves (after Harry Alisavakis' stylized water
    //shader): noise-distorted white bands rolling in towards every shoreline
    //plus a solid lapping foam strip right at the waterline. Every knob is a
    //live uniform (no rebuild), see shaders/water.fragment.ts.
    coastalWavesEnabled?: boolean;   // default true
    coastalWaveColor?: ColorRepresentation; // default 0xffffff
    coastalWaveCount?: number;       // bands per shore-to-center span, default 3
    coastalWaveSpeed?: number;       // travel speed towards shore, default 0.6
    coastalWaveWidth?: number;       // band thickness (0..1 of a wavelength), default 0.3
    coastalWaveRange?: number;       // reach out from the shore (0..1 of tile radius), default 0.8
    coastalWaveDistortion?: number;  // 0..1 noise bend/tear amount, default 0.5
    coastalWaveOpacity?: number;     // 0..1, default 0.85

    //How far below land (world units) the water plane rests, and how much of a
    //tile's radius the beach slope/color blend covers in total (0..1, split
    //evenly between the land and water tiles that share a coastal edge).
    //waterDepth defaults to size*0.25.
    waterDepth?: number;
    beachWidth?: number; // default 0.35

    //Diffusion/blend band sizes (0..1 fraction of a tile's radius): how far a
    //land tile's atlas texture blends towards a differently-typed land
    //neighbor (landBlendWidth), and how rounded a water tile's corner looks
    //where two coastal edges meet (waterCornerRounding, 0 = sharp corner, 1 =
    //fully rounded - only where both edges of that corner border land).
    landBlendWidth?: number;    // default 0.5
    waterCornerRounding?: number; // default 0.4

    //Curved coastline: how strongly static world-space noise bends the visual
    //waterline off the straight hex edges (one-sided, inland only - the land
    //layer draws the whole waterline, the water layer's foam recedes to
    //continue it). 0 restores straight hex-edge coasts. Organic land
    //transitions: the same idea applied to landBlendWidth's transition band
    //between differently-typed land tiles. Both live shader uniforms.
    coastCurvature?: number;      // 0..1, default 0.5
    landBlendCurvature?: number;  // 0..1, default 0.5

    //Mountains: Land.mountain tiles rise into noise-craggy peaks; adjacent
    //mountain tiles connect into continuous ridgelines. Peak height in world
    //units; default size * 0.6. Live shader uniform.
    mountainHeight?: number;

    //Rivers/lakes: land ("grass") tiles carrying the free-form "river"/"lake"
    //modifier (TileInfo.modifiers) render animated water on the land layer,
    //banks bent by world-space noise so the waterline curves naturally. A
    //river is a channel flowing through the hex; a lake fills the hex with
    //water except a grass shore rim inset from every edge whose neighbor
    //isn't water. Connectivity is auto-detected from neighbors (river/lake/
    //sea/coastal - see helpers/rivers.ts): rivers flow into lakes and the sea,
    //neighboring lake tiles merge into one body. All knobs below are live
    //shader uniforms (no rebuild); widths are fractions of a tile's radius,
    //riverDepth is world units (how deep the bed is carved, like waterDepth).
    //Colors default to the map's waterColorShallow/Deep to match the sea.
    riverWidth?: number;         // channel waterline half-width, default 0.28
    riverBankWidth?: number;     // vegetation strip beyond the waterline, default 0.14
    riverCurvature?: number;     // 0..1 noise bend of the banks, default 0.5
    riverColorShallow?: ColorRepresentation; // default waterColorShallow
    riverColorDeep?: ColorRepresentation;    // default waterColorDeep
    riverBankColor?: ColorRepresentation;    // default 0xa8bf6a (light green)
    riverFlowSpeed?: number;     // ripple animation speed, default 1.0
    riverDepth?: number;         // default waterDepth * 0.6
    lakeShoreWidth?: number;     // lake grass rim inset, default 0.18

    //Map-wide default tree/city models - each is a *folder* path containing
    //model.glb + info.json (see helpers/models.ts), not a bare filename; the
    //folder's info.json holds that model's own offset/rotation/scale fine-
    //tuning. A tile's own TileInfo.city.model/treeModel (see interfaces.ts)
    //overrides these per-tile. treeScale/cityScale are extra map-wide
    //multipliers on top of each model's own info.json scale.
    treeModel?: string;     // default "Assets/models/pinia"
    treeScale?: number;     // default 1
    cityModel?: string;     // default "Assets/models/monument"
    cityScale?: number;     // default 1

    //A wind-animated grass-blade layer scattered on top of Land.land ("grass")
    //tiles, on top of the terrain layer's own atlas texture (see objects/
    //Grass.ts) - purely decorative, disabling it just leaves the plain grass
    //texture visible underneath, exactly like before this option existed.
    grassEnabled?: boolean;      // default true
    grassDensity?: number;       // blades per tile, default 60
    grassBladeWidth?: number;    // world units, default size * 0.03
    grassBladeHeight?: number;   // world units, default size * 0.18
    grassWindStrength?: number;  // tip sway distance, world units, default bladeHeight * 0.35
    grassWindSpeed?: number;     // default 1.2

    //Spatial streaming and LOD. LOD 0 keeps the original full-detail meshes;
    //middle/far levels only reduce detail that is smaller than its projected
    //screen size. CPU and GPU caches are independent so very large worlds do
    //not allocate every chunk up front.
    renderDistance?: number;             // world units, default 2400
    lodEnabled?: boolean;                // default true
    lodNearDistance?: number;            // LOD 0 -> 1 threshold, default 900
    lodFarDistance?: number;             // LOD 1 -> 2 threshold, default 1650
    vegetationRenderDistance?: number;   // grass/forest cutoff, default 1450
    chunkLodHysteresis?: number;         // threshold dead band, default 120
    gpuChunkCacheSize?: number;           // default 128 logical chunks
    cpuChunkCacheSize?: number;           // default 192 logical chunks

    //Fog of war (see objects/FogOfWar.ts): fogTexture is a file name resolved
    //against texturesBaseUrl (default "war-fog.jpg", the same folder as the
    //terrain atlas), drawn over every tile HexMap.setTileFog() marks Unseen -
    //fogDarkenFactor is the color multiplier applied instead to Explored tiles
    //(previously seen, currently outside every unit's view range), across
    //every layer (terrain, grass, trees, cities). fogTextureSize is how many
    //world units one repeat of the (seamlessly tileable) fog texture spans -
    //fog UVs are world-space, so the image flows continuously across fogged
    //tiles instead of restarting per hex; defaults to size * 8. Every tile
    //defaults to fully visible until something calls setTileFog(), so this is
    //a no-op unless a consumer (e.g. GameEngine) actively drives it.
    fogTexture?: string;
    fogDarkenFactor?: number;
    fogTextureSize?: number;
}

//waterDepth/fogTextureSize/riverColorShallow/riverColorDeep/riverDepth/
//mountainHeight have *derived* defaults (computed from size/waterColor*/
//waterDepth in the constructor), so they're omitted here rather than given
//fixed values.
const DEFAULT_OPTIONS: Required<Omit<HexMapOptions, "element" | "waterDepth" | "fogTextureSize" | "riverColorShallow" | "riverColorDeep" | "riverDepth" | "mountainHeight">> = {
    size: 40,
    texturesBaseUrl: "textures/",
    gridVisible: true,
    gridColor: 0x42322b,
    gridWidth: 0.04,
    gridOpacity: 0.35,
    selectorColor: 0xffff00,
    pointerColor: 0xeeeeee,
    treesPerTile: 20,
    waterColorShallow: LandColor[Land.coastal],
    waterColorDeep: LandColor[Land.sea],
    waterWaveAmplitude: 1.6,
    waterWaveFrequency: 1.0,
    waterWaveSpeed: 1.0,
    waterSparkleIntensity: 1.0,
    waterFresnelIntensity: 1.0,
    coastalWavesEnabled: true,
    coastalWaveColor: 0xffffff,
    coastalWaveCount: 3,
    coastalWaveSpeed: 0.6,
    coastalWaveWidth: 0.3,
    coastalWaveRange: 0.8,
    coastalWaveDistortion: 0.5,
    coastalWaveOpacity: 0.85,
    beachWidth: 0.35,
    landBlendWidth: 0.5,
    waterCornerRounding: 0.4,
    coastCurvature: 0.5,
    landBlendCurvature: 0.5,
    riverWidth: 0.28,
    riverBankWidth: 0.14,
    riverCurvature: 0.5,
    riverBankColor: 0xa8bf6a,
    riverFlowSpeed: 1.0,
    lakeShoreWidth: 0.18,
    treeModel: "Assets/models/pinia",
    treeScale: 1,
    cityModel: "Assets/models/monument",
    cityScale: 1,
    grassEnabled: true,
    grassDensity: 60,
    grassBladeWidth: 1.2,
    grassBladeHeight: 7.2,
    grassWindStrength: 2.5,
    grassWindSpeed: 1.2,
    fogTexture: "war-fog.jpg",
    fogDarkenFactor: 0.45,
    renderDistance: 2400,
    lodEnabled: true,
    lodNearDistance: 900,
    lodFarDistance: 1650,
    vegetationRenderDistance: 1450,
    chunkLodHysteresis: 120,
    gpuChunkCacheSize: 128,
    cpuChunkCacheSize: 192
};

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
export class HexMap extends EventEmitter {
    private options: Required<Omit<HexMapOptions, "element" | "waterDepth" | "fogTextureSize" | "riverColorShallow" | "riverColorDeep" | "riverDepth" | "mountainHeight">>
        & { element: string, waterDepth: number, fogTextureSize: number, riverColorShallow: ColorRepresentation, riverColorDeep: ColorRepresentation, riverDepth: number, mountainHeight: number };

    private canvas: HTMLCanvasElement;
    private renderer!: WebGLRenderer;
    private scene!: ThreeScene;
    private worldRoot!: Group;
    private camera!: PerspectiveCamera;
    private controls!: OrbitControls;
    private sky!: Sky;

    private mapData!: MapInfo;
    private atlas!: TerrainAtlas;
    private terrain!: TerrainMesh;
    private forest: ForestField | undefined;
    private grass: GrassField | undefined;
    private selector!: Mesh;
    private pointer!: Mesh;
    private routeLine: Line | undefined;
    private worldCopies: Group[] = [];
    private worldCopyMaterials: RawShaderMaterial[] = [];
    private worldCopyMaterialCache = new Map<string, RawShaderMaterial>();
    private worldPatternOffset = new Vector2();
    private pressedMovementKeys = new Set<string>();
    private chunkScheduler: WorldChunkScheduler;
    private readonly frameTasks = new FrameTaskScheduler({ error: error => this.emit("error", error) });
    private resizeObserver: ResizeObserver | undefined;
    private animationFrameId: number | undefined;
    private disposed = false;
    private loadRevision = 0;
    private forestRevision = 0;
    private worldSource: WorldSource | undefined;
    private worldStreamer: WorldStreamer | undefined;
    private worldChunkLayers = new Map<string, WorldChunkLayers>();
    private streamedGrassByChunkId = new Map<string, GrassField>();
    private streamedForestByChunkId = new Map<string, ForestField>();
    private streamedGrassResources: GrassSharedResources | undefined;
    private streamedForestResources: ForestSharedResources | undefined;
    private worldLayerRevision = 0;
    private worldChunkSize = 24;
    private worldDemandChunkKey: string | undefined;
    private renderOrigin = new Vector2();
    private logicalTargetScratch = new Vector3();
    private floatingOriginThreshold = 8192;

    private mouseDownAt: Point | null = null; // screen coords, used to distinguish click vs. drag
    private lastHover: Point | null = null;
    private lastSelected: Point | null = null;

    //Authoritative renderer-side fog copy. Finite maps use a lazy byte array;
    //infinite maps use sparse coordinate keys. Layer attributes can therefore
    //be rebuilt or evicted without retaining an object/string per finite cell.
    private fogStates: FogStateStore | undefined;
    private warFogShown = true;

    constructor(options: HexMapOptions) {
        super();
        if (!options || typeof options !== "object") throw new TypeError("HexMap options are required");
        const size = options.size ?? DEFAULT_OPTIONS.size;
        const grassBladeHeight = options.grassBladeHeight ?? size * 0.18;
        const waterDepth = options.waterDepth ?? size * 0.25;
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            waterDepth,
            fogTextureSize: options.fogTextureSize ?? size * 8,
            riverColorShallow: options.riverColorShallow ?? options.waterColorShallow ?? DEFAULT_OPTIONS.waterColorShallow,
            riverColorDeep: options.riverColorDeep ?? options.waterColorDeep ?? DEFAULT_OPTIONS.waterColorDeep,
            riverDepth: options.riverDepth ?? waterDepth * 0.6,
            mountainHeight: options.mountainHeight ?? size * 0.6,
            grassBladeWidth: options.grassBladeWidth ?? size * 0.03,
            grassBladeHeight,
            grassWindStrength: options.grassWindStrength ?? grassBladeHeight * 0.35
        };
        this.validateOptions();
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
            cpuCacheSize: this.options.cpuChunkCacheSize
        });

        const el = document.querySelector(this.options.element);
        if (!(el instanceof HTMLCanvasElement)) {
            throw new Error(`HexMap: element "${this.options.element}" is not a <canvas>`);
        }
        this.canvas = el;

        this.setupScene();
        this.setupCamera();
        this.setupLights();
        this.setupSky();
        this.setupControls();
        this.setupMarkers();
        this.setupEvents();
        this.handleResize();

        this.animationFrameId = window.requestAnimationFrame(this.animate);
    }

    private validateOptions(): void {
        const positive = (name: string, value: number) => {
            if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
        };
        const nonNegativeInteger = (name: string, value: number) => {
            if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
        };
        positive("size", this.options.size);
        positive("renderDistance", this.options.renderDistance);
        if (this.options.lodNearDistance < 0 || this.options.lodFarDistance < this.options.lodNearDistance) {
            throw new RangeError("LOD distances must be non-negative and lodFarDistance must be >= lodNearDistance");
        }
        if (this.options.vegetationRenderDistance < 0 || this.options.chunkLodHysteresis < 0) {
            throw new RangeError("vegetationRenderDistance and chunkLodHysteresis must be non-negative");
        }
        nonNegativeInteger("gpuChunkCacheSize", this.options.gpuChunkCacheSize);
        nonNegativeInteger("cpuChunkCacheSize", this.options.cpuChunkCacheSize);
        nonNegativeInteger("treesPerTile", this.options.treesPerTile);
        nonNegativeInteger("grassDensity", this.options.grassDensity);
        positive("grassBladeWidth", this.options.grassBladeWidth);
        positive("grassBladeHeight", this.options.grassBladeHeight);
        if (!Number.isFinite(this.options.treeScale) || this.options.treeScale < 0) {
            throw new RangeError("treeScale must be a non-negative finite number");
        }
        for (const [name, value] of [
            ["waterCornerRounding", this.options.waterCornerRounding],
            ["coastCurvature", this.options.coastCurvature],
            ["landBlendCurvature", this.options.landBlendCurvature],
            ["coastalWaveWidth", this.options.coastalWaveWidth],
            ["coastalWaveRange", this.options.coastalWaveRange],
            ["coastalWaveDistortion", this.options.coastalWaveDistortion],
            ["coastalWaveOpacity", this.options.coastalWaveOpacity],
            ["riverCurvature", this.options.riverCurvature],
            ["lakeShoreWidth", this.options.lakeShoreWidth]
        ] as const) {
            if (!Number.isFinite(value) || value < 0 || value > 1) {
                throw new RangeError(`${name} must be a finite number between 0 and 1`);
            }
        }
    }

    //-------------------------------------------------------------------------
    //Scene / renderer / camera / controls
    //-------------------------------------------------------------------------
    private setupScene(): void {
        this.scene = new ThreeScene();
        this.scene.background = new Color(0x9fc9e2);
        this.worldRoot = new Group();
        this.worldRoot.name = "hex-map-world-root";
        this.scene.add(this.worldRoot);
        this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.65;
    }

    private setupCamera(): void {
        this.camera = new PerspectiveCamera(60, 1, 10, 100000);
        this.camera.position.set(900, 500, 1000);
        this.scene.add(this.camera);
    }

    private setupLights(): void {
        const dirLight1 = new DirectionalLight(0xffffff);
        dirLight1.position.set(1, 1, 1);
        this.scene.add(dirLight1);

        const dirLight2 = new DirectionalLight(0x002288);
        dirLight2.position.set(-1, -1, -1);
        this.scene.add(dirLight2);

        this.scene.add(new AmbientLight(0x222222));
    }

    private setupSky(): void {
        this.sky = new Sky();
        this.sky.scale.setScalar(450000);
        this.sky.frustumCulled = false;

        const uniforms = this.sky.material.uniforms;
        uniforms.turbidity.value = 4.0;
        uniforms.rayleigh.value = 1.7;
        uniforms.mieCoefficient.value = 0.002;
        uniforms.mieDirectionalG.value = 0.76;

        const elevation = 24 * Math.PI / 180;
        const azimuth = 205 * Math.PI / 180;
        const sun = new Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
        uniforms.sunPosition.value.copy(sun);
        this.scene.add(this.sky);
    }

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
        this.controls.minDistance = 100;
        this.controls.maxDistance = 800;
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

        this.controls.target.set(centerX, 0, centerZ);
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

    private positionMarker(marker: Mesh, tile: Point, reference = this.getCameraTarget()): void {
        const center = this.nearestRepeatedCenter(tile.x, tile.y, reference);
        marker.position.setX(center.x);
        marker.position.setZ(center.y);
    }

    private updateMarkerPositions(): void {
        if (this.lastHover && this.pointer.visible) this.positionMarker(this.pointer, this.lastHover);
        if (this.lastSelected && this.selector.visible) this.positionMarker(this.selector, this.lastSelected);
    }

    private clearWorldCopies(): void {
        this.chunkScheduler.invalidateScene();
        for (const copy of this.worldCopies) this.worldRoot.remove(copy);
        for (const material of this.worldCopyMaterials) material.dispose();
        this.worldCopies = [];
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
            //Fog updates mutate these attributes at runtime. Sharing them keeps
            //all repeated views synchronized without updating every copy.
            instancedCopy.instanceMatrix = source.instanceMatrix;
            instancedCopy.instanceColor = source.instanceColor;
            instancedCopy.count = source.count;
            copy = instancedCopy;
        } else {
            copy = source.clone(true);
            const sourceInstances: InstancedMesh[] = [];
            const copyInstances: InstancedMesh[] = [];
            source.traverse(object => {
                if ((object as InstancedMesh).isInstancedMesh) sourceInstances.push(object as InstancedMesh);
            });
            copy.traverse(object => {
                if ((object as InstancedMesh).isInstancedMesh) copyInstances.push(object as InstancedMesh);
            });
            copyInstances.forEach((instance, index) => {
                const original = sourceInstances[index];
                if (!original) return;
                instance.instanceMatrix = original.instanceMatrix;
                instance.instanceColor = original.instanceColor;
                instance.count = original.count;
            });
        }

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

    private refreshWorldCopies(): void {
        this.clearWorldCopies();
        if (!this.mapData || (!this.mapData.wrapX && !this.mapData.wrapY)) return;

        const xOffsets = this.copyOffsets(this.mapData.wrapX, this.worldPeriodX);
        const yOffsets = this.copyOffsets(this.mapData.wrapY, this.worldPeriodY);

        for (const copyX of xOffsets) {
            for (const copyY of yOffsets) {
                if (copyX === 0 && copyY === 0) continue;
                const offsetX = copyX * this.worldPeriodX;
                const offsetY = copyY * this.worldPeriodY;
                const group = new Group();
                group.position.set(offsetX, 0, offsetY);

                for (const child of this.terrain?.children ?? []) {
                    if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
                    group.add(this.cloneWorldObject(child, offsetX, offsetY));
                }
                for (const child of this.forest?.children ?? []) {
                    if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
                    group.add(this.cloneWorldObject(child, offsetX, offsetY));
                }
                if (this.grass?.visible) {
                    for (const child of this.grass.children) {
                        if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
                        group.add(this.cloneWorldObject(child, offsetX, offsetY));
                    }
                }
                for (const record of this.worldChunkLayers.values()) {
                    for (const child of record.forest?.children ?? []) {
                        if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
                        group.add(this.cloneWorldObject(child, offsetX, offsetY));
                    }
                    if (!record.grass?.visible) continue;
                    for (const child of record.grass.children) {
                        if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
                        group.add(this.cloneWorldObject(child, offsetX, offsetY));
                    }
                }

                if (group.children.length === 0) continue;

                this.worldCopies.push(group);
                this.worldRoot.add(group);
            }
        }
    }

    private setupMarkers(): void {
        const size = this.options.size;

        const selectorGeom = new RingGeometry(0.97 * size, size, 6, 2);
        this.selector = new Mesh(selectorGeom, new MeshBasicMaterial({ color: this.options.selectorColor }));
        this.selector.rotateX(-Math.PI / 2);
        this.selector.position.setY(size / 10 + 1.1);
        this.selector.visible = false;
        this.worldRoot.add(this.selector);

        const pointerGeom = new RingGeometry(0.97 * size, size, 6, 2);
        this.pointer = new Mesh(pointerGeom, new MeshBasicMaterial({ color: this.options.pointerColor }));
        this.pointer.rotateX(-Math.PI / 2);
        this.pointer.position.setY(size / 10 + 1.1);
        this.pointer.visible = false;
        this.worldRoot.add(this.pointer);
    }

    private setupEvents(): void {
        window.addEventListener("resize", this.handleResize, { passive: true });
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
        window.addEventListener("blur", this.clearMovementKeys);
        this.canvas.addEventListener("mousedown", this.onMouseDown);
        this.canvas.addEventListener("contextmenu", this.onContextMenu);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("mouseup", this.onMouseUp);
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(this.handleResize);
            this.resizeObserver.observe(this.canvas);
        }
    }

    private onContextMenu = (event: Event): void => event.preventDefault();

    private handleResize = (): void => {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        if (width <= 0 || height <= 0) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height, false);
    };

    private lastFrameTime: number | undefined;

    private animate = (t: number): void => {
        if (this.disposed) return;
        const dtS = this.lastFrameTime === undefined ? 0 : (t - this.lastFrameTime) / 1000;
        this.lastFrameTime = t;

        this.updateKeyboardMovement(Math.min(dtS, 0.05));
        this.controls.update(dtS);
        this.wrapCameraToWorld();
        this.rebaseWorld();
        this.updateWorldDemand();
        this.frameTasks.runFrame();
        this.updateWorldChunkVisibility();
        this.terrain?.update(dtS);
        const grassResources = new Set<GrassSharedResources>();
        if (this.grass) grassResources.add(this.grass.resources);
        for (const record of this.worldChunkLayers.values()) {
            if (record.grass) grassResources.add(record.grass.resources);
        }
        for (const resources of grassResources) resources.update(dtS);
        this.emit("frame", { t, dtS });
        this.renderer.render(this.scene, this.camera);
        this.animationFrameId = window.requestAnimationFrame(this.animate);
    };

    private onKeyDown = (event: KeyboardEvent): void => {
        if (!this.isMovementKey(event.code) || this.isTextInput(event.target)) return;
        this.pressedMovementKeys.add(event.code);
        event.preventDefault();
    };

    private onKeyUp = (event: KeyboardEvent): void => {
        if (!this.isMovementKey(event.code)) return;
        this.pressedMovementKeys.delete(event.code);
        event.preventDefault();
    };

    private clearMovementKeys = (): void => {
        this.pressedMovementKeys.clear();
    };

    private isMovementKey(code: string): boolean {
        return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
    }

    private isTextInput(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        return target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement
            || target.isContentEditable;
    }

    private updateKeyboardMovement(dtS: number): void {
        if (dtS <= 0 || this.pressedMovementKeys.size === 0) return;

        const forwardAmount = Number(this.pressedMovementKeys.has("KeyW")) - Number(this.pressedMovementKeys.has("KeyS"));
        const rightAmount = Number(this.pressedMovementKeys.has("KeyD")) - Number(this.pressedMovementKeys.has("KeyA"));
        if (forwardAmount === 0 && rightAmount === 0) return;

        const forward = this.controls.target.clone().sub(this.camera.position);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        else forward.normalize();
        const right = new Vector3(-forward.z, 0, forward.x);
        const movement = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
        if (movement.lengthSq() > 1) movement.normalize();

        const viewDistance = this.camera.position.distanceTo(this.controls.target);
        const speed = Math.min(900, Math.max(140, viewDistance * 0.9));
        movement.multiplyScalar(speed * dtS);
        this.camera.position.add(movement);
        this.controls.target.add(movement);
    }

    private updateWorldChunkVisibility(): void {
        if (!this.mapData) return;
        this.chunkScheduler.update(this.scene, this.camera, this.controls.target, {
            enabled: metadata => metadata.kind !== "grass" || this.options.grassEnabled,
            activate: (metadata, lod, objects) => this.activateWorldChunk(metadata, lod, objects),
            release: metadata => this.releaseWorldChunk(metadata)
        });
    }

    private activateWorldChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2, objects: Object3D[]) {
        if (metadata.kind === "land" || metadata.kind === "water") {
            const geometry = this.terrain?.activateChunk(metadata, lod);
            return geometry ? { geometries: [geometry] } : undefined;
        }
        if (metadata.kind === "grass") {
            const field = this.streamedGrassByChunkId.get(metadata.id) ?? this.grass;
            const geometry = field?.activateChunk(metadata, lod);
            return geometry ? { geometries: [geometry] } : undefined;
        }
        const forest = this.streamedForestByChunkId.get(metadata.id) ?? this.forest;
        forest?.activateChunk(metadata, lod, objects);
        return forest ? { disposeGpu: () => forest.disposeChunkGpu(metadata) } : undefined;
    }

    private releaseWorldChunk(metadata: WorldChunkMetadata): void {
        if (metadata.kind === "land" || metadata.kind === "water") this.terrain?.releaseChunk(metadata);
        else if (metadata.kind === "grass") (this.streamedGrassByChunkId.get(metadata.id) ?? this.grass)?.releaseChunk(metadata);
        else (this.streamedForestByChunkId.get(metadata.id) ?? this.forest)?.releaseChunk(metadata);
    }

    //-------------------------------------------------------------------------
    //Picking (analytic, ground-plane based - see helpers/picking.ts)
    //-------------------------------------------------------------------------
    private onMouseDown = (event: MouseEvent): void => {
        if (event.button !== 0) {
            this.mouseDownAt = null;
            return;
        }
        this.mouseDownAt = { x: event.clientX, y: event.clientY };
    };

    private onPointerMove = (event: MouseEvent): void => {
        const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
        if (!ground) {
            this.pointer.visible = false;
            this.lastHover = null;
            return;
        }
        this.logicalGround(ground);

        const tileCoords = pickTile(
            ground,
            this.options.size,
            this.mapData?.infinite ? undefined : this.mapData?.w,
            this.mapData?.infinite ? undefined : this.mapData?.h,
            this.mapData?.wrapX,
            this.mapData?.wrapY
        );
        if (!tileCoords) {
            this.pointer.visible = false;
            this.lastHover = null;
            return;
        }

        if (this.lastHover && this.lastHover.x === tileCoords.x && this.lastHover.y === tileCoords.y) return;
        this.lastHover = tileCoords;

        const tile = this.getTile(tileCoords.x, tileCoords.y);
        if (!tile) {
            this.pointer.visible = false;
            this.lastHover = null;
            return;
        }

        this.pointer.visible = true;
        this.pointer.position.setX(tileCoords.worldX);
        this.pointer.position.setZ(tileCoords.worldY);

        this.emit("hover" satisfies HexMapEventName, { x: tileCoords.x, y: tileCoords.y, tile });
    };

    private onMouseUp = (event: MouseEvent): void => {
        if (event.button !== 0) return;
        const downAt = this.mouseDownAt;
        this.mouseDownAt = null;
        if (!downAt) return;

        // if the pointer moved noticeably, treat this as a camera drag, not a click
        const dragDistance = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
        if (dragDistance > 4) return;

        const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
        if (!ground) return;
        this.logicalGround(ground);

        const tileCoords = pickTile(
            ground,
            this.options.size,
            this.mapData?.infinite ? undefined : this.mapData?.w,
            this.mapData?.infinite ? undefined : this.mapData?.h,
            this.mapData?.wrapX,
            this.mapData?.wrapY
        );
        if (!tileCoords) return;

        const tile = this.getTile(tileCoords.x, tileCoords.y);
        if (!tile) return;

        this.selectTile(tileCoords.x, tileCoords.y);
        this.selector.position.setX(tileCoords.worldX);
        this.selector.position.setZ(tileCoords.worldY);
        this.emit("click" satisfies HexMapEventName, { x: tileCoords.x, y: tileCoords.y, tile });
    };

    //-------------------------------------------------------------------------
    //Public API
    //-------------------------------------------------------------------------

    public async loadWorld(options: WorldLoadOptions): Promise<void> {
        if (this.disposed) {
            options?.source?.dispose();
            throw new Error("HexMap has been disposed");
        }
        if (!options || typeof options !== "object" || !options.source) {
            throw new TypeError("world load options with a source are required");
        }
        const source = options.source;
        try {
            assertWorldSource(source);
        } catch (reason) {
            if (typeof source.dispose === "function") source.dispose();
            throw reason;
        }
        const chunkSize = source.chunkSize;
        if (!Number.isInteger(chunkSize) || chunkSize <= 0
            || chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE || chunkSize % WORLD_CHUNK_SIZE !== 0) {
            source.dispose();
            throw new RangeError(
                `source.chunkSize must be a positive multiple of ${WORLD_CHUNK_SIZE} up to ${MAX_WORLD_GENERATION_CHUNK_SIZE}`
            );
        }
        const defaultTile = source.bounds
            ? { x: Math.floor((source.bounds.width - 1) / 2), y: Math.floor((source.bounds.height - 1) / 2) }
            : { x: 0, y: 0 };
        const requestedTile = options.initialTile ?? defaultTile;
        const initialTile = normalizeMapCoordinates(source.map, requestedTile.x, requestedTile.y);
        if (!initialTile || !Number.isSafeInteger(initialTile.x) || !Number.isSafeInteger(initialTile.y)) {
            source.dispose();
            throw new RangeError("initialTile must identify a safe integer tile inside the world");
        }
        const chunkSpan = chunkSize * this.options.size * 1.5;
        const loadRadius = options.loadRadius ?? Math.max(1, Math.ceil(this.options.renderDistance / chunkSpan));
        const retentionRadius = options.retentionRadius ?? loadRadius + 1;
        const maxResidentChunks = options.maxResidentChunks ?? (retentionRadius * 2 + 1) ** 2;
        const maxRetries = options.maxRetries ?? 2;
        const retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
        const frameBudgetMs = options.frameBudgetMs ?? 3;
        const maxMountsPerFrame = options.maxMountsPerFrame ?? 2;
        const integerAtLeast = (name: string, value: number, minimum: number) => {
            if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${name} must be an integer >= ${minimum}`);
        };
        try {
            integerAtLeast("loadRadius", loadRadius, 0);
            integerAtLeast("retentionRadius", retentionRadius, loadRadius);
            integerAtLeast("maxResidentChunks", maxResidentChunks, 1);
            integerAtLeast("maxRetries", maxRetries, 0);
            integerAtLeast("retryBaseDelayMs", retryBaseDelayMs, 0);
            integerAtLeast("maxMountsPerFrame", maxMountsPerFrame, 1);
            if (!Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0) {
                throw new RangeError("frameBudgetMs must be a positive finite number");
            }
        } catch (reason) {
            source.dispose();
            throw reason;
        }
        const threshold = options.floatingOriginThreshold ?? 8192;
        if (!Number.isFinite(threshold) || threshold <= this.options.size * chunkSize) {
            source.dispose();
            throw new RangeError("floatingOriginThreshold must exceed one source chunk span");
        }

        this.stopWorldStreaming();
        this.frameTasks.configure({ budgetMs: frameBudgetMs, maxTasksPerFrame: maxMountsPerFrame });
        const revision = ++this.loadRevision;
        this.worldSource = source;
        this.worldChunkSize = chunkSize;
        this.mapData = source.map;
        this.fogStates = new FogStateStore(source.map);
        this.floatingOriginThreshold = threshold;
        this.worldPatternOffset.set(0, 0);
        this.cleanRoutePath();
        this.lastHover = null;
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

            this.atlas = await this.fetchTerrainAtlas();
            if (this.disposed || revision !== this.loadRevision || this.worldSource !== source) return;
            if (!(await this.rebuildTerrain(revision, true))) return;

            const streamer = new WorldStreamer(source, {
                chunkLoaded: chunk => this.scheduleWorldChunkMount(chunk),
                chunkUnloading: chunk => this.unmountWorldChunk(chunk),
                error: error => this.emit("error", error)
            }, {
                loadRadius,
                retentionRadius,
                maxResidentChunks,
                maxRetries,
                retryBaseDelayMs
            });
            this.worldStreamer = streamer;
            const centerChunk = source.resolveChunk(
                Math.floor(initialTile.x / chunkSize),
                Math.floor(initialTile.y / chunkSize)
            );
            if (!centerChunk) throw new RangeError("initialTile does not resolve to a source chunk");
            this.worldDemandChunkKey = WorldStreamer.key(centerChunk.x, centerChunk.y);
            this.rebaseWorld();

            const loadedCenter = await streamer.setCenterTile(initialTile.x, initialTile.y);
            const centerKey = WorldStreamer.key(loadedCenter.chunkX, loadedCenter.chunkY);
            const centerLayers = this.worldChunkLayers.get(centerKey);
            await Promise.all([centerLayers?.forestPromise, centerLayers?.cityPromise]);
            if (this.disposed || revision !== this.loadRevision || this.worldStreamer !== streamer) return;
            this.updateWorldChunkVisibility();
            this.emit("load" satisfies HexMapEventName, undefined);
        } catch (reason) {
            if (revision === this.loadRevision && this.worldSource === source) this.stopWorldStreaming();
            throw reason;
        }
    }

    private async fetchTerrainAtlas(): Promise<TerrainAtlas> {
        const atlasUrl = new URL("land-atlas.json", new URL(this.options.texturesBaseUrl, window.location.href)).href;
        const response = await fetch(atlasUrl);
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

    private positionCameraAtTile(tile: Point): void {
        const center = getHexCenter(tile.x, tile.y, this.options.size);
        const viewDistance = (this.controls.minDistance + this.controls.maxDistance) / 2;
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        this.controls.target.set(center.x, 0, center.y);
        this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
        this.controls.update();
    }

    private scheduleWorldChunkMount(chunk: WorldChunk): void {
        const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
        if (key === this.worldDemandChunkKey) {
            this.mountWorldChunk(chunk);
            return;
        }
        const center = this.worldStreamer?.stats;
        const priority = center && this.worldSource
            ? this.worldSource.chunkDistance(chunk.chunkX, chunk.chunkY, center.centerChunkX, center.centerChunkY)
            : 0;
        this.frameTasks.enqueue(key, priority, () => {
            if (this.worldStreamer?.hasResident(chunk.chunkX, chunk.chunkY)) this.mountWorldChunk(chunk);
        });
    }

    private mountWorldChunk(chunk: WorldChunk): void {
        if (!this.worldStreamer || !this.terrain) return;
        const points = chunk.coreTiles;
        const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
        const revision = ++this.worldLayerRevision;
        const record: WorldChunkLayers = { points, revision };
        this.worldChunkLayers.set(key, record);
        this.terrain.addTiles(points);

        if (this.options.grassEnabled) {
            this.streamedGrassResources ??= new GrassSharedResources({
                size: this.options.size,
                bladeHeight: this.options.grassBladeHeight,
                windStrength: this.options.grassWindStrength,
                windSpeed: this.options.grassWindSpeed,
                fogDarkenFactor: this.options.fogDarkenFactor
            });
            const grass = createGrassField(this.mapData, {
                size: this.options.size,
                density: this.options.grassDensity,
                bladeWidth: this.options.grassBladeWidth,
                bladeHeight: this.options.grassBladeHeight,
                windStrength: this.options.grassWindStrength,
                windSpeed: this.options.grassWindSpeed,
                fogDarkenFactor: this.options.fogDarkenFactor,
                riverWidth: this.options.riverWidth,
                riverBankWidth: this.options.riverBankWidth,
                riverCurvature: this.options.riverCurvature,
                lakeShoreWidth: this.options.lakeShoreWidth
            }, points, this.streamedGrassResources) ?? undefined;
            if (grass) {
                record.grass = grass;
                this.applyWorldPatternToObject(grass);
                this.indexChunkLayer(grass, this.streamedGrassByChunkId);
                this.worldRoot.add(grass);
            }
        }

        record.cityPromise = this.terrain.loadCities(points, record).then(() => {
            if (this.worldChunkLayers.get(key) !== record) {
                this.terrain?.removeCities(points, record);
                return;
            }
            for (const point of points) {
                const state = this.warFogShown
                    ? (this.fogStates?.get(point.x, point.y) ?? FogState.Visible)
                    : FogState.Visible;
                this.terrain?.setFogState(point.x, point.y, state);
            }
            this.refreshWorldCopies();
        }).catch(error => {
            if (this.worldChunkLayers.get(key) === record) this.emit("error", error);
        });

        this.streamedForestResources ??= new ForestSharedResources();
        record.forestPromise = createForest(this.mapData, {
            size: this.options.size,
            treesPerTile: this.options.treesPerTile,
            treeModel: this.options.treeModel,
            treeScale: this.options.treeScale,
            fogDarkenFactor: this.options.fogDarkenFactor,
            riverWidth: this.options.riverWidth,
            riverBankWidth: this.options.riverBankWidth,
            riverCurvature: this.options.riverCurvature,
            lakeShoreWidth: this.options.lakeShoreWidth,
            beachWidth: this.options.beachWidth,
            waterCornerRounding: this.options.waterCornerRounding,
            coastCurvature: this.options.coastCurvature
        }, points, this.streamedForestResources).then(forest => {
            const current = this.worldChunkLayers.get(key);
            if (!forest) return;
            if (this.disposed || !current || current.revision !== revision) {
                forest.dispose();
                return;
            }
            current.forest = forest;
            this.indexChunkLayer(forest, this.streamedForestByChunkId);
            this.worldRoot.add(forest);
            this.reapplyFogToObject(forest, points);
            this.refreshWorldCopies();
        }).catch(error => {
            if (this.worldChunkLayers.get(key)?.revision === revision) this.emit("error", error);
        });
        this.reapplyFogToPoints(points, record);
        this.refreshWorldCopies();
    }

    private unmountWorldChunk(chunk: WorldChunk): void {
        const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
        this.frameTasks.cancel(key);
        const record = this.worldChunkLayers.get(key);
        if (!record) return;
        this.worldChunkLayers.delete(key);
        const forgotten = this.terrain?.removeTiles(record.points, true, record) ?? [];
        if (record.grass) {
            this.collectChunkIds(record.grass, forgotten);
            this.unindexChunkLayer(record.grass, this.streamedGrassByChunkId);
            this.worldRoot.remove(record.grass);
            record.grass.dispose();
        }
        if (record.forest) {
            this.collectChunkIds(record.forest, forgotten);
            this.unindexChunkLayer(record.forest, this.streamedForestByChunkId);
            this.worldRoot.remove(record.forest);
            record.forest.dispose();
        }
        this.chunkScheduler.forget(forgotten);
        this.refreshWorldCopies();
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

    private stopWorldStreaming(): void {
        const streamer = this.worldStreamer;
        const source = this.worldSource;
        this.worldDemandChunkKey = undefined;
        this.frameTasks.clear();
        streamer?.dispose();
        if (!streamer) source?.dispose();
        this.worldStreamer = undefined;
        this.worldSource = undefined;
        this.worldLayerRevision += 1;
        for (const record of this.worldChunkLayers.values()) {
            if (record.grass) {
                this.worldRoot.remove(record.grass);
                record.grass.dispose();
            }
            if (record.forest) {
                this.worldRoot.remove(record.forest);
                record.forest.dispose();
            }
        }
        this.worldChunkLayers.clear();
        this.streamedGrassByChunkId.clear();
        this.streamedForestByChunkId.clear();
        this.streamedGrassResources?.dispose();
        this.streamedGrassResources = undefined;
        this.streamedForestResources?.dispose();
        this.streamedForestResources = undefined;
    }

    private reapplyFogToPoints(points: readonly Point[], record: WorldChunkLayers): void {
        for (const point of points) {
            const state = this.warFogShown
                ? (this.fogStates?.get(point.x, point.y) ?? FogState.Visible)
                : FogState.Visible;
            this.terrain?.setFogState(point.x, point.y, state);
            record.grass?.setFogState(point.x, point.y, state);
            record.forest?.setFogState(point.x, point.y, state);
        }
    }

    private reapplyFogToObject(object: ForestField | GrassField, points?: readonly Point[]): void {
        if (points) {
            for (const point of points) {
                const state = this.warFogShown
                    ? (this.fogStates?.get(point.x, point.y) ?? FogState.Visible)
                    : FogState.Visible;
                object.setFogState(point.x, point.y, state);
            }
            return;
        }
        this.fogStates?.forEach((stored, x, y) => {
            object.setFogState(x, y, this.warFogShown ? stored : FogState.Visible);
        });
    }

    //Tears down and recreates the terrain (land/water layers + city models) from
    //the current options against the already-fetched atlas/map data. Only needed
    //when the map itself changes (see load()) - everything water/blend-related
    //is a live uniform, see TerrainMesh's own getters/setters, forwarded below
    //(waterWaveAmplitude, beachWidth, etc.)
    private async rebuildTerrain(expectedRevision = this.loadRevision, deferTiles = Boolean(this.worldStreamer)): Promise<boolean> {
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
            gridVisible: this.options.gridVisible,
            gridColor: this.options.gridColor,
            gridWidth: this.options.gridWidth,
            gridOpacity: this.options.gridOpacity,
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
            waterCornerRounding: this.options.waterCornerRounding,
            coastCurvature: this.options.coastCurvature,
            landBlendCurvature: this.options.landBlendCurvature,
            mountainHeight: this.options.mountainHeight,
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
        if (this.worldStreamer) {
            return this.rebuildStreamedForests(expectedRevision, forestRevision);
        }
        this.clearWorldCopies();
        this.chunkScheduler.clear();
        if (this.forest) {
            this.worldRoot.remove(this.forest);
            this.forest.dispose();
            this.forest = undefined;
        }
        if (!this.mapData) return false;

        const forest = (await createForest(this.mapData, {
            size: this.options.size,
            treesPerTile: this.options.treesPerTile,
            treeModel: this.options.treeModel,
            treeScale: this.options.treeScale,
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
    private rebuildGrass(): void {
        if (this.worldStreamer) {
            this.rebuildStreamedGrass();
            return;
        }
        this.clearWorldCopies();
        this.chunkScheduler.clear();
        if (this.grass) {
            this.worldRoot.remove(this.grass);
            this.grass.dispose();
            this.grass = undefined;
        }
        if (!this.mapData) return;

        this.grass = createGrassField(this.mapData, {
            size: this.options.size,
            density: this.options.grassDensity,
            bladeWidth: this.options.grassBladeWidth,
            bladeHeight: this.options.grassBladeHeight,
            windStrength: this.options.grassWindStrength,
            windSpeed: this.options.grassWindSpeed,
            fogDarkenFactor: this.options.fogDarkenFactor,
            riverWidth: this.options.riverWidth,
            riverBankWidth: this.options.riverBankWidth,
            riverCurvature: this.options.riverCurvature,
            lakeShoreWidth: this.options.lakeShoreWidth
        }) ?? undefined;
        this.applyWorldPatternToObject(this.grass);

        if (this.grass) {
            this.grass.visible = this.options.grassEnabled;
            this.worldRoot.add(this.grass);
            this.reapplyFog(); // the fresh layer defaults to all-Visible
        }
        this.refreshWorldCopies();
    }

    private rebuildStreamedGrass(): void {
        this.chunkScheduler.clear();
        this.streamedGrassByChunkId.clear();
        for (const record of this.worldChunkLayers.values()) {
            if (record.grass) {
                this.worldRoot.remove(record.grass);
                record.grass.dispose();
                record.grass = undefined;
            }
        }
        this.streamedGrassResources?.dispose();
        this.streamedGrassResources = undefined;
        if (this.options.grassEnabled) {
            this.streamedGrassResources = new GrassSharedResources({
                size: this.options.size,
                bladeHeight: this.options.grassBladeHeight,
                windStrength: this.options.grassWindStrength,
                windSpeed: this.options.grassWindSpeed,
                fogDarkenFactor: this.options.fogDarkenFactor
            });
        }
        for (const record of this.worldChunkLayers.values()) {
            if (!this.streamedGrassResources) continue;
            const grass = createGrassField(this.mapData, {
                size: this.options.size,
                density: this.options.grassDensity,
                bladeWidth: this.options.grassBladeWidth,
                bladeHeight: this.options.grassBladeHeight,
                windStrength: this.options.grassWindStrength,
                windSpeed: this.options.grassWindSpeed,
                fogDarkenFactor: this.options.fogDarkenFactor,
                riverWidth: this.options.riverWidth,
                riverBankWidth: this.options.riverBankWidth,
                riverCurvature: this.options.riverCurvature,
                lakeShoreWidth: this.options.lakeShoreWidth
            }, record.points, this.streamedGrassResources) ?? undefined;
            if (!grass) continue;
            record.grass = grass;
            this.applyWorldPatternToObject(grass);
            this.indexChunkLayer(grass, this.streamedGrassByChunkId);
            this.worldRoot.add(grass);
            this.reapplyFogToObject(grass, record.points);
        }
        this.refreshWorldCopies();
    }

    private async rebuildStreamedForests(expectedRevision: number, forestRevision: number): Promise<boolean> {
        this.chunkScheduler.clear();
        this.streamedForestByChunkId.clear();
        const builds: Promise<void>[] = [];
        for (const [key, record] of this.worldChunkLayers) {
            if (record.forest) {
                this.worldRoot.remove(record.forest);
                record.forest.dispose();
                record.forest = undefined;
            }
        }
        this.streamedForestResources?.dispose();
        const resources = new ForestSharedResources();
        this.streamedForestResources = resources;
        for (const [key, record] of this.worldChunkLayers) {
            const revision = ++this.worldLayerRevision;
            record.revision = revision;
            const build = createForest(this.mapData, {
                size: this.options.size,
                treesPerTile: this.options.treesPerTile,
                treeModel: this.options.treeModel,
                treeScale: this.options.treeScale,
                fogDarkenFactor: this.options.fogDarkenFactor,
                riverWidth: this.options.riverWidth,
                riverBankWidth: this.options.riverBankWidth,
                riverCurvature: this.options.riverCurvature,
                lakeShoreWidth: this.options.lakeShoreWidth,
                beachWidth: this.options.beachWidth,
                waterCornerRounding: this.options.waterCornerRounding,
                coastCurvature: this.options.coastCurvature
            }, record.points, resources).then(forest => {
                if (!forest) return;
                const current = this.worldChunkLayers.get(key);
                if (this.disposed || expectedRevision !== this.loadRevision
                    || forestRevision !== this.forestRevision || current !== record || record.revision !== revision) {
                    forest.dispose();
                    return;
                }
                record.forest = forest;
                this.indexChunkLayer(forest, this.streamedForestByChunkId);
                this.worldRoot.add(forest);
                this.reapplyFogToObject(forest, record.points);
                this.refreshWorldCopies();
            });
            record.forestPromise = build;
            builds.push(build);
        }
        await Promise.all(builds);
        this.refreshWorldCopies();
        return !this.disposed && expectedRevision === this.loadRevision && forestRevision === this.forestRevision;
    }

    public getTile(x: number, y: number): TileInfo | undefined {
        if (this.worldSource && !this.worldSource.hasTile(x, y)) return undefined;
        return this.mapData ? getMapTile(this.mapData, x, y) : undefined;
    }

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

    private updateWorldDemand(): void {
        if (!this.worldStreamer || !this.worldSource) return;
        this.logicalTargetScratch.copy(this.controls.target);
        if (this.mapData.infinite) {
            this.logicalTargetScratch.x += this.renderOrigin.x;
            this.logicalTargetScratch.z += this.renderOrigin.y;
        }
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
        if (key === this.worldDemandChunkKey) return;
        this.worldDemandChunkKey = key;
        void this.worldStreamer.setCenterTile(tile.x, tile.y).catch(error => {
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
        for (const { x, y, state } of changes) {
            if (this.worldSource) {
                const resolved = this.worldSource.resolveChunk(
                    Math.floor(x / this.worldChunkSize),
                    Math.floor(y / this.worldChunkSize)
                );
                const record = resolved
                    ? this.worldChunkLayers.get(WorldStreamer.key(resolved.x, resolved.y))
                    : undefined;
                if (!record) continue;
                this.terrain?.setFogState(x, y, state);
                record.grass?.setFogState(x, y, state);
                record.forest?.setFogState(x, y, state);
            } else {
                this.terrain?.setFogState(x, y, state);
                this.grass?.setFogState(x, y, state);
                this.forest?.setFogState(x, y, state);
            }
            renderedStates.set(`${x},${y}`, state);
        }
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
        this.options.mountainHeight = value;
        if (this.terrain) this.terrain.mountainHeight = value;
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
    //Tree density/size - baked into the instanced geometry at build time (like
    //grass), so both rebuild the forest rather than touching a uniform.
    //-------------------------------------------------------------------------
    public get treesPerTile(): number {
        return this.options.treesPerTile;
    }
    public set treesPerTile(value: number) {
        if (!Number.isInteger(value) || value < 0) throw new RangeError("treesPerTile must be a non-negative integer");
        this.options.treesPerTile = value;
        void this.rebuildForest();
    }

    public get treeScale(): number {
        return this.options.treeScale;
    }
    public set treeScale(value: number) {
        if (!Number.isFinite(value) || value < 0) throw new RangeError("treeScale must be a non-negative finite number");
        this.options.treeScale = value;
        void this.rebuildForest();
    }

    //Toggling visibility just flips the mesh's own `visible` flag (grass is
    //still generated even when disabled) - the terrain's own grass texture
    //keeps rendering underneath either way, so disabling this is purely
    //"remove the blade overlay", not "regenerate as flat grass".
    public get grassVisible(): boolean {
        return this.options.grassEnabled;
    }

    public set grassVisible(value: boolean) {
        this.options.grassEnabled = value;
        if (this.grass) this.grass.visible = value;
        if (this.worldStreamer) this.rebuildStreamedGrass();
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
        this.options.grassDensity = value;
        this.rebuildGrass();
    }

    public get grassBladeWidth(): number {
        return this.options.grassBladeWidth;
    }

    public set grassBladeWidth(value: number) {
        if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeWidth must be a positive finite number");
        this.options.grassBladeWidth = value;
        this.rebuildGrass();
    }

    public get grassBladeHeight(): number {
        return this.options.grassBladeHeight;
    }

    public set grassBladeHeight(value: number) {
        if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeHeight must be a positive finite number");
        this.options.grassBladeHeight = value;
        this.rebuildGrass();
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

    public get streamingStats(): Readonly<WorldChunkStreamingStats> {
        return this.chunkScheduler.stats;
    }

    public get worldStreamingStats(): Readonly<WorldStreamingStats> | undefined {
        return this.worldStreamer?.stats;
    }

    public get frameTaskStats(): Readonly<FrameTaskSchedulerStats> {
        return this.frameTasks.stats;
    }

    public drawRoutePath(path: Point[]): void {
        this.cleanRoutePath();

        let reference = this.getCameraTarget();
        const points = path.map(p => {
            const center = this.nearestRepeatedCenter(p.x, p.y, reference);
            const point = new Vector3(center.x, 10, center.y);
            reference = point;
            return point;
        });
        if (points.length === 0) return;

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

    public getCameraTarget(target = new Vector3()): Vector3 {
        return target.copy(this.controls.target).add(this.logicalTargetScratch.set(this.renderOrigin.x, 0, this.renderOrigin.y));
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
        if (this.animationFrameId !== undefined) window.cancelAnimationFrame(this.animationFrameId);

        window.removeEventListener("resize", this.handleResize);
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        window.removeEventListener("blur", this.clearMovementKeys);
        this.canvas.removeEventListener("mousedown", this.onMouseDown);
        this.canvas.removeEventListener("contextmenu", this.onContextMenu);
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("mouseup", this.onMouseUp);
        this.resizeObserver?.disconnect();

        this.cleanRoutePath();
        this.clearWorldCopies();
        this.chunkScheduler.clear();
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
        this.selector.geometry.dispose();
        (this.selector.material as Material).dispose();
        this.pointer.geometry.dispose();
        (this.pointer.material as Material).dispose();
        this.sky.geometry.dispose();
        this.sky.material.dispose();
        this.controls.dispose();
        this.renderer.renderLists.dispose();
        this.renderer.dispose();
        this.removeAllListeners();
    }
}

export interface WorldLoadOptions {
    source: WorldSource;
    initialTile?: Point;
    loadRadius?: number;
    retentionRadius?: number;
    maxResidentChunks?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    frameBudgetMs?: number;
    maxMountsPerFrame?: number;
    floatingOriginThreshold?: number;
}

interface WorldChunkLayers {
    points: readonly Point[];
    revision: number;
    grass?: GrassField;
    forest?: ForestField;
    cityPromise?: Promise<void>;
    forestPromise?: Promise<void>;
}
