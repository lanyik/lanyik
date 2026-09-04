import {
    InstancedBufferGeometry,
    InstancedBufferAttribute,
    Mesh,
    BufferGeometry,
    RawShaderMaterial,
    TextureLoader,
    Vector4,
    Vector3,
    Vector2,
    Box3,
    Color,
    Group,
    Sprite,
    ColorRepresentation,
    RepeatWrapping,
    LinearFilter,
    Texture,
    Material
} from "three";

import { MapInfo, TileInfo, Point } from "../interfaces";
import { Land, LandPriority, LandColor } from "../enums";
import { getHexCenter } from "../helpers/helpers";
import { forEachMapTile } from "../helpers/mapData";
import { getNeighborCoords } from "../helpers/neighbors";
import { getMapTile } from "../helpers/topology";
import { SharedBaseInstancedBufferGeometry } from "../rendering/SharedBaseInstancedBufferGeometry";
import {
    BufferUpdateRange,
    commitBufferAttributeRanges,
    GpuTileStateChange
} from "../rendering/BufferUpdateBatch";
import {
    getWorldChunkBounds,
    getWorldChunkKey,
    getWorldChunkMetadata,
    getWorldChunkOrigin,
    groupTilesByWorldChunk,
    localizeWorldChunkBounds,
    tagWorldChunk,
    WorldChunkLod,
    WorldChunkMetadata
} from "../helpers/chunks";
import { lakeNeighborEdgeValue, riverLakeMouthEdgeValue, riverSeaMouthEdgeValue, waterEdgeValue } from "../helpers/rivers";
import { createHexagonGeometry, createHexagonLodGeometry } from "./hexagonGeometry";
import { makeTextSprite } from "./citysprite";
import { ModelAssetCache, ModelAssetLease } from "../helpers/models";
import {
    TERRAIN_SURFACE_DETAIL_MAX_MULTIPLIER,
    TERRAIN_VERTEX_SHADER
} from "../shaders/terrain.vertex";
import { TERRAIN_FRAGMENT_SHADER } from "../shaders/terrain.fragment";
import { TERRAIN_FAST_FRAGMENT_SHADER } from "../shaders/terrain.fast.fragment";
import { WATER_VERTEX_SHADER } from "../shaders/water.vertex";
import { WATER_FRAGMENT_SHADER } from "../shaders/water.fragment";
import { WATER_FAST_FRAGMENT_SHADER } from "../shaders/water.fast.fragment";
import { WorldSurfaceView } from "../world/WorldSurfaceView";

export interface TerrainAtlasCell { cellX: number, cellY: number }
export interface TerrainAtlas {
    image: string;
    width: number;
    height: number;
    cellSize: number;
    cellSpacing: number;
    textures: { [name: string]: TerrainAtlasCell };
}

export type LandformDebugMode = "off" | "elevation" | "ridge" | "valley" | "roughness";

const LANDFORM_DEBUG_VALUE: Readonly<Record<LandformDebugMode, number>> = {
    off: 0,
    elevation: 1,
    ridge: 2,
    valley: 3,
    roughness: 4
};

export interface TerrainMeshOptions {
    size: number;
    texturesBaseUrl: string;   // folder containing terrain.png / land-atlas.json
    atlas: TerrainAtlas;
    /** Authoritative effective terrain and height view for this world session. */
    surface: WorldSurfaceView;
    gridColor?: ColorRepresentation;
    gridWidth?: number;
    gridOpacity?: number;
    gridVisible?: boolean;
    shaderQuality?: "full" | "fast";
    /** Development heatmap; does not rebuild terrain or change generated tiles. */
    landformDebugMode?: LandformDebugMode;
    /** Number of hex rows/columns covered by one repeat of an atlas cell. */
    terrainTextureRegionSize?: number;

    //Sea/coastal tiles render on their own animated layer with solid colors
    //(waterColorShallow/Deep) - see shaders/water.*.ts.
    waterColorShallow?: ColorRepresentation;
    waterColorDeep?: ColorRepresentation;

    //Wave shape/animation fine-tuning.
    waterWaveAmplitude?: number;
    waterWaveFrequency?: number;
    waterWaveSpeed?: number;
    waterSparkleIntensity?: number;
    waterFresnelIntensity?: number;

    //Stylized coastal foam waves on land-adjacent water tiles (see the foam
    //section of shaders/water.fragment.ts): noise-distorted white bands
    //rolling towards the shore plus a solid lapping strip at the waterline.
    //All plain uniforms (live-tunable, no rebuild).
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
    //evenly between the land and water tiles that share a coastal edge - see
    //terrain.vertex.ts/water.vertex.ts).
    waterDepth?: number;
    beachWidth?: number;

    //Diffusion/blend band sizes (0..1 fraction of a tile's radius): how far a
    //land tile's own atlas texture blends towards a differently-typed land
    //neighbor (landBlendWidth), and how rounded a water tile's corner looks
    //where two coastal edges meet (waterCornerRounding, 0 = sharp, 1 = fully
    //rounded - only applies when both edges of that corner border land; a
    //single coastal edge never gets rounded).
    landBlendWidth?: number;
    landBlendEnabled?: boolean;
    waterCornerRounding?: number;

    //Curved coastline: 0..1, how strongly static world-space noise bends the
    //visual waterline off the straight hex edges. The bend is one-sided
    //(inland only): the land layer paints sea/sand/foam up to the bent line,
    //the water layer's foam and shore lightening recede to continue it - so
    //the whole visible waterline is drawn from a single tile's data and stays
    //seam-free. 0 restores straight hex-edge coasts. Live uniform on both
    //materials.
    coastCurvature?: number;

    //Organic land-type transitions: 0..1, how strongly the same noise bends
    //the landBlendWidth transition band between differently-typed land tiles
    //(plus patchy strength modulation). 0 restores straight bands.
    landBlendCurvature?: number;

    //Rivers/lakes: land tiles with the "river"/"lake" modifier render animated
    //water on the land layer - a channel through the hex (river) or a full
    //water body with a grass shore rim (lake) - see helpers/rivers.ts for the
    //connectivity rules and shaders/terrain.fragment.ts for the drawing. All
    //of these are live land-material uniforms - no rebuild needed. Widths are
    //fractions of the tile's radius; riverDepth is world units (how deep the
    //bed sinks, like waterDepth). Colors default to waterColorShallow/Deep so
    //rivers/lakes match the map's sea.
    riverWidth?: number;         // default 0.28
    riverBankWidth?: number;     // default 0.14
    riverCurvature?: number;     // 0..1 noise bend of the banks, default 0.5
    riverColorShallow?: ColorRepresentation;
    riverColorDeep?: ColorRepresentation;
    riverBankColor?: ColorRepresentation; // default 0xa8bf6a (light vegetation strip)
    riverFlowSpeed?: number;     // ripple animation speed multiplier, default 1.0
    riverDepth?: number;         // default waterDepth * 0.6
    lakeShoreWidth?: number;     // lake grass rim inset from shored edges, default 0.18

    //City tiles (TileInfo.city) get a 3D model + text label instead of plain
    //terrain (see loadCities()). cityModel is a model folder path (see
    //helpers/models.ts) used as the map-wide default; a tile's own city.model
    //(if present) overrides it. cityScale multiplies the model's own info.json
    //scale, as a map-wide "make all cities a bit bigger/smaller" knob.
    cityModel?: string;
    cityScale?: number;
    modelAssets?: ModelAssetCache;

    //war-fog.jpg (see FogOfWar.ts): file name resolved against texturesBaseUrl
    //(fogTexture) and the color multiplier applied to Explored (previously
    //seen, currently out-of-view-range) tiles/features (fogDarkenFactor, 0..1).
    //fogTextureSize is how many world units one repeat of the texture spans -
    //fog UVs are world-space, so the (seamlessly tileable) image flows
    //continuously across fogged tiles instead of restarting per hex. Default
    //size * 8, i.e. one repeat covers roughly an 8-tile-wide stretch of map.
    fogTexture?: string;
    fogDarkenFactor?: number;
    fogTextureSize?: number;
}

//Tile types rendered by the animated water layer (buildWaterLayer) instead of
//the flat land layer (buildLandLayer). Order matters: index+1 is the
//neighborsKind encoding used by the shaders (1 = sea, 2 = coastal).
const WATER_TYPES: Land[] = [Land.sea, Land.coastal];

interface InstanceAttributes {
    offset: Float32Array;
    style: Float32Array;
    neighborsA: Float32Array;
    neighborsB: Float32Array;
    neighborsPriorityA: Float32Array;
    neighborsPriorityB: Float32Array;
    neighborsKindA: Float32Array;
    neighborsKindB: Float32Array;
    waterEdges: Float32Array;
    fogState: Float32Array;
    landform: Float32Array;
    reliefNeighborsA: Float32Array;
    reliefNeighborsB: Float32Array;
}

//A city tile's model + label, tracked so setFogState() can hide it entirely
//(Unseen) or darken it in place (Explored) without a rebuild. Materials are
//cloned once at load time (see loadCities()) specifically so this darkening
//is independent per city - glTF clones otherwise share the same material
//instance, and mutating it would darken every city using that model at once.
interface CityFogEntry {
    wrapper: Group;
    sprite: Sprite;
    x: number;
    y: number;
    labelOffset: number;
    materials: { material: Material & { color?: Color }, baseColor?: Color }[];
    owner?: object;
    signature: string;
    asset: ModelAssetLease;
}

interface PendingCityBuild {
    owner?: object;
    readonly signature: string;
    readonly promise: Promise<void>;
}

export interface TerrainCityRefresh {
    point: Point;
    owner?: object;
}

export const CITY_FOG_TILE_KEY = "hexMapCityFogTile";

interface TerrainChunkRecord {
    mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
    tiles: Point[];
    layer: "land" | "water";
    lod?: WorldChunkLod;
    attributes?: InstanceAttributes;
    lodGeometries: Map<WorldChunkLod, InstancedBufferGeometry>;
}

//----------------------------------------------------------------------------------
//Renders the map as spatially streamed 12x12 instanced chunks
//(InstancedBufferGeometry + InstancedBufferAttribute) instead of either one
//always-submitted world mesh or a Mesh+ExtrudeGeometry+TextureLoader per tile
//like the old Hex.ts/HEX(). Grid lines are drawn inside the fragment shaders
//instead of a RingGeometry mesh per tile (old Grid.ts).
//
//Tiles are split into two layer sets: flat "land" chunks (grass/sand/
//tundra/snow) and an animated "water" layer (sea/coastal, see shaders/water.*.ts - sum-of-sines
//vertex displacement with analytically derived normals, no normal map, solid
//colors instead of a texture). Both share the same per-tile neighbor/priority/
//kind computation below. Mountain tiles (Land.mountain) stay on the land layer.
//The terrain vertex shader samples one world-space ridged height field across
//an entire connected mountain region, then uses neighbor data only to taper
//the region's outer boundary to ground. Hex centers have no peak semantics.
//
//The neighborsA/neighborsB attribute order (SE,S,SW / NW,N,NE) must match
//NEIGHBOR_DIRECTIONS' angle convention (see helpers/neighbors.ts) and the
//DIR_SE/DIR_S/... vectors in the shaders, which compute an analytic "closeness
//to this edge" blend factor per direction - no pre-baked mask texture involved,
//so there's nothing that can be misaligned by a differently oriented texture
//asset. Blending is one-directional: a tile only blends towards a *strictly
//higher priority* neighbor (see enums.ts LandPriority), otherwise every shared
//edge would blend both ways at once (a fuzzy halo on both sides of every
//border instead of a single transition).
//
//Coastal land tiles also sink their rim towards the
//water plane's height (waterLevel) and blend to sand near it (see vBeachT in
//terrain.vertex.ts/fragment.ts) - an actual 3D beach slope instead of a flat 2D
//color blend against the water tile's color. neighborsKindA/B (-1 no tile, 0
//non-water, 1 sea, 2 coastal) drives both that slope and the water layer's own
//"what to blend towards" decision.
//----------------------------------------------------------------------------------
export class TerrainMesh extends Group {
    private landChunks: Mesh[] = [];
    private landMaterial: RawShaderMaterial | undefined;
    private waterChunks: Mesh[] = [];
    private waterMaterial: RawShaderMaterial | undefined;
    private readonly baseLodGeometries = new Map<string, BufferGeometry>();
    private tileIndex = new Map<string, { mesh: Mesh, index: number }>();
    private waterTileIndex = new Map<string, { mesh: Mesh, index: number }>();
    private chunkRecords = new Map<string, TerrainChunkRecord>();
    private fogStates = new Map<string, number>();
    private cityFog = new Map<string, CityFogEntry>(); // "x,y" -> that tile's city model/label
    private readonly pendingCities = new Map<string, PendingCityBuild>();
    private readonly modelAssets: ModelAssetCache;
    private readonly ownsModelAssets: boolean;
    private fogTexture: Texture;
    private atlasTexture: Texture;
    private map: MapInfo;
    private atlasCellIndex: { [type: string]: number } = {};
    private clock = 0;
    private lodBuilds = 0;
    private disposed = false;
    private readonly surface: WorldSurfaceView;
    //Single Color instances shared by BOTH materials' uniforms (the water
    //layer's own colors AND the land layer's painted curved-coast water - see
    //seaColorShallow in terrain.fragment.ts): mutating them via the
    //waterColorShallow/Deep setters updates every use at once, so the painted
    //inland water can never drift out of sync with the water tiles' color.
    private waterShallow: Color;
    private waterDeep: Color;

    constructor(map: MapInfo, private options: TerrainMeshOptions, initialTiles?: readonly Point[]) {
        super();
        this.map = map;
        if (options.surface.map !== map || options.surface.tileSize !== options.size) {
            throw new TypeError("terrain surface must match the map and tile size");
        }
        this.surface = options.surface;
        this.ownsModelAssets = options.modelAssets === undefined;
        this.modelAssets = options.modelAssets ?? new ModelAssetCache();
        this.buildAtlasCellIndex();
        this.fogTexture = this.loadFogTexture();
        //One shared texture for both layers (via commonUniforms) - only the
        //land shader samples it today, but it's shared so a water-side use
        //never duplicates the load.
        this.atlasTexture = this.loadAtlasTexture();
        this.waterShallow = new Color(options.waterColorShallow ?? LandColor[Land.coastal]);
        this.waterDeep = new Color(options.waterColorDeep ?? LandColor[Land.sea]);

        const landTiles: Point[] = [];
        const waterTiles: Point[] = [];
        if (initialTiles) {
            for (const point of initialTiles) {
                const tile = getMapTile(this.map, point.x, point.y);
                if (tile) (WATER_TYPES.includes(tile.type) ? waterTiles : landTiles).push(point);
            }
        } else {
            forEachMapTile(this.map, (tile, x, y) => {
                (WATER_TYPES.includes(tile.type) ? waterTiles : landTiles).push({ x, y });
            });
        }
        this.buildLandLayer(landTiles);
        this.buildWaterLayer(waterTiles);
    }

    private buildAtlasCellIndex(): void {
        const atlas = this.options.atlas;
        const cols = atlas.width / atlas.cellSize;
        for (const name in atlas.textures) {
            const cell = atlas.textures[name];
            this.atlasCellIndex[name] = cell.cellY * cols + cell.cellX;
        }
    }

    //Atlas cell index for a tile's terrain type. Returns -1 if the tile doesn't
    //exist (used for out-of-map neighbors).
    private cellIndexFor(x: number, y: number): number {
        const tile: TileInfo | undefined = getMapTile(this.map, x, y);
        if (!tile) return -1;
        const cell = this.atlasCellIndex[tile.type];
        return cell === undefined ? -1 : cell;
    }

    //Edge-blend priority of a tile's terrain type (see enums.ts LandPriority).
    //Returns -Infinity for out-of-map neighbors so a border tile never blends
    //towards "nothing".
    private priorityFor(x: number, y: number): number {
        const tile: TileInfo | undefined = getMapTile(this.map, x, y);
        return tile ? LandPriority[tile.type] : -Infinity;
    }

    //-1 no tile, 0 non-water, 1 sea, 2 coastal - drives the land layer's beach
    //slope and the water layer's edge-color resolution (see shaders).
    private kindFor(x: number, y: number): number {
        const tile: TileInfo | undefined = getMapTile(this.map, x, y);
        if (!tile) return -1;
        const waterIndex = WATER_TYPES.indexOf(tile.type);
        return waterIndex === -1 ? 0 : waterIndex + 1;
    }

    //Builds the per-instance attribute arrays (offset/style/neighbors/neighbor
    //priorities/kinds) shared by every layer - land and water tiles are laid
    //out identically, only the geometry/shader differ.
    private buildInstanceAttributes(tiles: Point[], origin: Point): InstanceAttributes {
        const { size } = this.options;
        const surface = this.surface.createWindow();
        const reliefFor = (point: Point) => surface.isShoreline(point.x, point.y)
            ? -1
            : surface.getEffectiveRelief(point.x, point.y);
        const attrs: InstanceAttributes = {
            offset: new Float32Array(tiles.length * 2),
            style: new Float32Array(tiles.length * 4),
            neighborsA: new Float32Array(tiles.length * 3),
            neighborsB: new Float32Array(tiles.length * 3),
            neighborsPriorityA: new Float32Array(tiles.length * 3),
            neighborsPriorityB: new Float32Array(tiles.length * 3),
            neighborsKindA: new Float32Array(tiles.length * 3),
            neighborsKindB: new Float32Array(tiles.length * 3),
            waterEdges: new Float32Array(tiles.length * 4),
            // x = fog state; y/z/w = dry/cold/alpine. Temperate is inferred
            // in the terrain shader, so this remains one attribute location.
            fogState: new Float32Array(tiles.length * 4),
            landform: new Float32Array(tiles.length * 4),
            reliefNeighborsA: new Float32Array(tiles.length * 3),
            reliefNeighborsB: new Float32Array(tiles.length * 3)
        };

        tiles.forEach((tile, i) => {
            const info = getMapTile(this.map, tile.x, tile.y)!;
            const center = getHexCenter(tile.x, tile.y, size);

            attrs.offset[i * 2 + 0] = center.x - origin.x;
            attrs.offset[i * 2 + 1] = center.y - origin.y; // chunk-local Z

            attrs.style[i * 4 + 0] = this.atlasCellIndex[info.type] ?? 0;
            attrs.style[i * 4 + 1] = info.modifiers?.includes("hill") ? 1 : 0;
            attrs.style[i * 4 + 2] = LandPriority[info.type] ?? 0;
            attrs.style[i * 4 + 3] = surface.isShoreline(tile.x, tile.y)
                ? -1
                : surface.getEffectiveRelief(tile.x, tile.y);
            const sample = surface.sampleGenerated(tile.x, tile.y);
            attrs.fogState[i * 4 + 0] = this.fogStates.get(`${tile.x},${tile.y}`) ?? 2;
            attrs.fogState[i * 4 + 1] = sample?.biomeWeights.dry ?? 0;
            attrs.fogState[i * 4 + 2] = sample?.biomeWeights.cold ?? 0;
            attrs.fogState[i * 4 + 3] = sample?.biomeWeights.alpine ?? 0;
            const landform = sample?.landform;
            if (landform) {
                attrs.landform[i * 4 + 0] = landform.elevation;
                attrs.landform[i * 4 + 1] = landform.ridge;
                attrs.landform[i * 4 + 2] = landform.valley;
                attrs.landform[i * 4 + 3] = landform.roughness;
            }

            const se = getNeighborCoords(tile.x, tile.y, "SE");
            const s = getNeighborCoords(tile.x, tile.y, "S");
            const sw = getNeighborCoords(tile.x, tile.y, "SW");
            const nw = getNeighborCoords(tile.x, tile.y, "NW");
            const n = getNeighborCoords(tile.x, tile.y, "N");
            const ne = getNeighborCoords(tile.x, tile.y, "NE");

            attrs.neighborsA[i * 3 + 0] = this.cellIndexFor(se.x, se.y);
            attrs.neighborsA[i * 3 + 1] = this.cellIndexFor(s.x, s.y);
            attrs.neighborsA[i * 3 + 2] = this.cellIndexFor(sw.x, sw.y);

            attrs.neighborsB[i * 3 + 0] = this.cellIndexFor(nw.x, nw.y);
            attrs.neighborsB[i * 3 + 1] = this.cellIndexFor(n.x, n.y);
            attrs.neighborsB[i * 3 + 2] = this.cellIndexFor(ne.x, ne.y);

            attrs.neighborsPriorityA[i * 3 + 0] = this.priorityFor(se.x, se.y);
            attrs.neighborsPriorityA[i * 3 + 1] = this.priorityFor(s.x, s.y);
            attrs.neighborsPriorityA[i * 3 + 2] = this.priorityFor(sw.x, sw.y);

            attrs.neighborsPriorityB[i * 3 + 0] = this.priorityFor(nw.x, nw.y);
            attrs.neighborsPriorityB[i * 3 + 1] = this.priorityFor(n.x, n.y);
            attrs.neighborsPriorityB[i * 3 + 2] = this.priorityFor(ne.x, ne.y);

            attrs.neighborsKindA[i * 3 + 0] = this.kindFor(se.x, se.y);
            attrs.neighborsKindA[i * 3 + 1] = this.kindFor(s.x, s.y);
            attrs.neighborsKindA[i * 3 + 2] = this.kindFor(sw.x, sw.y);

            attrs.neighborsKindB[i * 3 + 0] = this.kindFor(nw.x, nw.y);
            attrs.neighborsKindB[i * 3 + 1] = this.kindFor(n.x, n.y);
            attrs.neighborsKindB[i * 3 + 2] = this.kindFor(ne.x, ne.y);

            attrs.reliefNeighborsA[i * 3 + 0] = reliefFor(se);
            attrs.reliefNeighborsA[i * 3 + 1] = reliefFor(s);
            attrs.reliefNeighborsA[i * 3 + 2] = reliefFor(sw);
            attrs.reliefNeighborsB[i * 3 + 0] = reliefFor(nw);
            attrs.reliefNeighborsB[i * 3 + 1] = reliefFor(n);
            attrs.reliefNeighborsB[i * 3 + 2] = reliefFor(ne);

            attrs.waterEdges[i * 4 + 0] = waterEdgeValue(this.map, tile.x, tile.y);
            attrs.waterEdges[i * 4 + 1] = riverSeaMouthEdgeValue(this.map, tile.x, tile.y);
            attrs.waterEdges[i * 4 + 2] = riverLakeMouthEdgeValue(this.map, tile.x, tile.y);
            attrs.waterEdges[i * 4 + 3] = lakeNeighborEdgeValue(this.map, tile.x, tile.y);
        });

        surface.clear();
        return attrs;
    }

    private buildInstancedGeometry(
        tiles: Point[],
        numSubdivisions: number,
        borderSubdivisions = numSubdivisions,
        origin: Point = { x: 0, y: 0 },
        attributes?: InstanceAttributes
    ): InstancedBufferGeometry {
        const baseKey = `${numSubdivisions}:${borderSubdivisions}`;
        let hexagon = this.baseLodGeometries.get(baseKey);
        if (!hexagon) {
            hexagon = numSubdivisions === borderSubdivisions
                ? createHexagonGeometry(this.options.size, numSubdivisions)
                : createHexagonLodGeometry(this.options.size, numSubdivisions, borderSubdivisions);
            this.baseLodGeometries.set(baseKey, hexagon);
        }
        const geometry = new SharedBaseInstancedBufferGeometry(hexagon, ["position", "uv"]);
        geometry.instanceCount = tiles.length;

        const attrs = attributes ?? this.buildInstanceAttributes(tiles, origin);
        geometry.setAttribute("offset", new InstancedBufferAttribute(attrs.offset, 2));
        geometry.setAttribute("style", new InstancedBufferAttribute(attrs.style, 4));
        geometry.setAttribute("neighborsA", new InstancedBufferAttribute(attrs.neighborsA, 3));
        geometry.setAttribute("neighborsB", new InstancedBufferAttribute(attrs.neighborsB, 3));
        geometry.setAttribute("neighborsPriorityA", new InstancedBufferAttribute(attrs.neighborsPriorityA, 3));
        geometry.setAttribute("neighborsPriorityB", new InstancedBufferAttribute(attrs.neighborsPriorityB, 3));
        geometry.setAttribute("neighborsKindA", new InstancedBufferAttribute(attrs.neighborsKindA, 3));
        geometry.setAttribute("neighborsKindB", new InstancedBufferAttribute(attrs.neighborsKindB, 3));
        geometry.setAttribute("waterEdges", new InstancedBufferAttribute(attrs.waterEdges, 4));
        geometry.setAttribute("fogState", new InstancedBufferAttribute(attrs.fogState, 4));
        geometry.setAttribute("landform", new InstancedBufferAttribute(attrs.landform, 4));
        geometry.setAttribute("reliefNeighborsA", new InstancedBufferAttribute(attrs.reliefNeighborsA, 3));
        geometry.setAttribute("reliefNeighborsB", new InstancedBufferAttribute(attrs.reliefNeighborsB, 3));

        return geometry;
    }

    private commonUniforms() {
        const atlas = this.options.atlas;
        const size = this.options.size;
        const textureRegionSize = this.options.terrainTextureRegionSize ?? 2;
        return {
            textureAtlasMeta: { value: new Vector4(atlas.width, atlas.height, atlas.cellSize, atlas.cellSpacing) },
            // One atlas cell spans a configurable world region (two hexes by
            // default) instead of restarting inside every tile. The unequal
            // axes match the flat-top hex lattice's column/row spacing.
            terrainTextureWorldSize: { value: new Vector2(
                size * 1.5 * textureRegionSize,
                size * Math.sqrt(3) * textureRegionSize
            ) },
            hexSize: { value: size },
            map: { value: this.atlasTexture },
            sandAtlasIndex: { value: this.atlasCellIndex[Land.sand] ?? 0 },
            waterLevel: { value: -(this.options.waterDepth ?? size * 0.25) },
            beachWidth: { value: this.options.beachWidth ?? 0.35 },
            waterCornerRounding: { value: this.options.waterCornerRounding ?? 0.4 },
            coastCurvature: { value: this.options.coastCurvature ?? 0.5 },
            fogMap: { value: this.fogTexture },
            fogDarkenFactor: { value: this.options.fogDarkenFactor ?? 0.45 },
            fogTextureSize: { value: this.options.fogTextureSize ?? size * 8 },
            // WebGLRenderer refreshes these from scene.fog for RawShaderMaterial
            // when material.fog is enabled, matching built-in model materials.
            fogColor: { value: new Color() },
            fogNear: { value: 1 },
            fogFar: { value: 1000 },
            //Physical chunk copies now handle toroidal placement. Leaving the
            //shader period at zero keeps every tile attached to its canonical
            //chunk, so chunks can be independently culled and streamed.
            worldCenter: { value: new Vector2(0, 0) },
            worldPeriod: { value: new Vector2(0, 0) },
            chunkOrigin: { value: new Vector2(0, 0) },
            lightDir: { value: { x: 0.4, y: 1.0, z: 0.3 } },
            showGrid: { value: this.options.gridVisible === true ? 1.0 : 0.0 },
            gridColor: { value: new Color(this.options.gridColor ?? 0x000000) },
            gridWidth: { value: this.options.gridWidth ?? 0.04 },
            gridOpacity: { value: this.options.gridOpacity ?? 0.35 },
            landformDebugMode: { value: LANDFORM_DEBUG_VALUE[this.options.landformDebugMode ?? "off"] }
        };
    }

    //Mipmapping a multi-cell texture atlas bleeds neighboring cells into each
    //other at lower mip levels. Regional world-space sampling stays inset by
    //atlas.cellSpacing, but lower mip texels would still cross a cell boundary,
    //so keep plain bilinear filtering and accept modest distant shimmer.
    private loadAtlasTexture() {
        const loader = new TextureLoader().setPath(this.options.texturesBaseUrl);
        const atlasTexture = loader.load(this.options.atlas.image);
        atlasTexture.wrapS = atlasTexture.wrapT = RepeatWrapping;
        atlasTexture.generateMipmaps = false;
        atlasTexture.minFilter = LinearFilter;
        return atlasTexture;
    }

    //war-fog.jpg (see FogOfWar.ts) - a single, non-atlased image sampled with
    //world-space UVs (see terrain/water vertex shaders' vFogUV), so one repeat
    //spans several tiles. RepeatWrapping is required for that (world UVs run
    //far past 0..1); mipmaps are fine here, unlike the atlas (a standalone
    //image has no neighboring cells to bleed into).
    private loadFogTexture(): Texture {
        const loader = new TextureLoader().setPath(this.options.texturesBaseUrl);
        const texture = loader.load(this.options.fogTexture ?? "war-fog.jpg");
        texture.wrapS = texture.wrapT = RepeatWrapping;
        return texture;
    }

    private chunkHeightBounds(layer: "land" | "water"): { minY: number; maxY: number } {
        const waterDepth = this.options.waterDepth ?? this.options.size * 0.25;
        if (layer === "water") {
            const waveAmplitude = Math.abs(this.options.waterWaveAmplitude ?? 1.6);
            return {
                minY: -waterDepth - waveAmplitude,
                maxY: Math.max(0, -waterDepth + waveAmplitude)
            };
        }
        const riverDepth = this.options.riverDepth ?? waterDepth * 0.6;
        // Shader micro detail is explicitly bounded around the authoritative
        // CPU macro surface. Keep culling bounds derived from that same limit.
        return {
            minY: -Math.max(waterDepth, riverDepth),
            maxY: this.surface.maximumHeight * TERRAIN_SURFACE_DETAIL_MAX_MULTIPLIER
        };
    }

    private refreshChunkHeightBounds(): void {
        for (const record of this.chunkRecords.values()) {
            const metadata = getWorldChunkMetadata(record.mesh);
            if (!metadata) continue;
            const bounds = this.chunkHeightBounds(record.layer);
            metadata.bounds.minY = bounds.minY;
            metadata.bounds.maxY = bounds.maxY;
        }
    }

    //Subdivided (not a single flat triangle per wedge) so the beach slope and
    //landBlendWidth/beachWidth's smoothstep-based falloffs actually have interior
    //vertices to sample - with only the 2 outer corners + center (0 subdivisions),
    //the corners always saturate to fully-blended (edge factor is exactly 1 at
    //any hex corner) and the center is always 0, so the GPU only ever linearly
    //interpolates between those 2 fixed extremes no matter the configured width.
    private buildLandLayer(tiles: Point[]): void {
        this.landMaterial ??= new RawShaderMaterial({
            fog: true,
            uniforms: {
                worldOffset: { value: new Vector2(0, 0) },
                landBlendWidth: { value: this.options.landBlendWidth ?? 0.5 },
                landBlendEnabled: { value: (this.options.landBlendEnabled ?? true) ? 1.0 : 0.0 },
                landBlendCurvature: { value: this.options.landBlendCurvature ?? 0.5 },
                mountainHeight: { value: this.surface.mountainHeight },
                seaColorShallow: { value: this.waterShallow },
                seaColorDeep: { value: this.waterDeep },
                uTime: { value: 0 },
                foamEnabled: { value: (this.options.coastalWavesEnabled ?? true) ? 1.0 : 0.0 },
                foamColor: { value: new Color(this.options.coastalWaveColor ?? 0xffffff) },
                foamCount: { value: this.options.coastalWaveCount ?? 3 },
                foamSpeed: { value: this.options.coastalWaveSpeed ?? 0.6 },
                foamWidth: { value: this.options.coastalWaveWidth ?? 0.3 },
                foamRange: { value: this.options.coastalWaveRange ?? 0.8 },
                foamDistortion: { value: this.options.coastalWaveDistortion ?? 0.5 },
                foamOpacity: { value: this.options.coastalWaveOpacity ?? 0.85 },
                riverWidth: { value: this.options.riverWidth ?? 0.28 },
                riverBankWidth: { value: this.options.riverBankWidth ?? 0.14 },
                riverCurvature: { value: this.options.riverCurvature ?? 0.5 },
                riverColorShallow: { value: new Color(this.options.riverColorShallow ?? this.options.waterColorShallow ?? LandColor[Land.coastal]) },
                riverColorDeep: { value: new Color(this.options.riverColorDeep ?? this.options.waterColorDeep ?? LandColor[Land.sea]) },
                riverBankColor: { value: new Color(this.options.riverBankColor ?? 0xa8bf6a) },
                riverFlowSpeed: { value: this.options.riverFlowSpeed ?? 1.0 },
                riverDepth: { value: this.options.riverDepth ?? (this.options.waterDepth ?? this.options.size * 0.25) * 0.6 },
                lakeShoreWidth: { value: this.options.lakeShoreWidth ?? 0.18 },
                ...this.commonUniforms()
            },
            vertexShader: TERRAIN_VERTEX_SHADER,
            fragmentShader: this.options.shaderQuality === "fast"
                ? TERRAIN_FAST_FRAGMENT_SHADER
                : TERRAIN_FRAGMENT_SHADER
        });
        if (tiles.length === 0) return;

        for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
            if (this.chunkRecords.has(`land:${chunkKey}`)) continue;
            //The shell and metadata are cheap enough to keep for the whole
            //world. Attribute arrays and subdivided hex vertices are created
            //only when the scheduler activates this chunk.
            const geometry = new InstancedBufferGeometry();
            const mesh = new Mesh(geometry, this.landMaterial);
            const origin = getWorldChunkOrigin(chunkKey, this.options.size);
            mesh.position.set(origin.x, 0, origin.y);
            mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
                const shader = material as RawShaderMaterial;
                shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
                shader.uniformsNeedUpdate = true;
            };
            mesh.name = `terrain-chunk-land-${chunkKey}`;
            mesh.frustumCulled = false;
            tagWorldChunk(
                mesh,
                chunkKey,
                "land",
                localizeWorldChunkBounds(
                    getWorldChunkBounds(
                        chunkTiles,
                        this.options.size,
                        this.chunkHeightBounds("land").minY,
                        this.chunkHeightBounds("land").maxY
                    ),
                    origin
                )
            );
            chunkTiles.forEach((tile, index) => this.tileIndex.set(`${tile.x},${tile.y}`, { mesh, index }));
            this.chunkRecords.set(`land:${chunkKey}`, {
                mesh,
                tiles: chunkTiles,
                layer: "land",
                lodGeometries: new Map()
            });
            this.landChunks.push(mesh);
            this.add(mesh);
        }
    }

    //Water tiles get a subdivided geometry (more vertices than the flat land
    //hex) so the sum-of-sines wave displacement in water.vertex.ts has enough
    //resolution to look like a smooth, rounded surface instead of a faceted tent.
    private buildWaterLayer(tiles: Point[]): void {
        this.waterMaterial ??= new RawShaderMaterial({
            fog: true,
            uniforms: {
                worldOffset: { value: new Vector2(0, 0) },
                cameraWorldOffset: { value: new Vector2(0, 0) },
                uTime: { value: 0 },
                waveAmplitude: { value: this.options.waterWaveAmplitude ?? 1.6 },
                waveFrequency: { value: 0.045 * (this.options.waterWaveFrequency ?? 1.0) },
                waveSpeed: { value: this.options.waterWaveSpeed ?? 1.0 },
                sparkleIntensity: { value: this.options.waterSparkleIntensity ?? 1.0 },
                fresnelIntensity: { value: this.options.waterFresnelIntensity ?? 1.0 },
                foamEnabled: { value: (this.options.coastalWavesEnabled ?? true) ? 1.0 : 0.0 },
                foamColor: { value: new Color(this.options.coastalWaveColor ?? 0xffffff) },
                foamCount: { value: this.options.coastalWaveCount ?? 3 },
                foamSpeed: { value: this.options.coastalWaveSpeed ?? 0.6 },
                foamWidth: { value: this.options.coastalWaveWidth ?? 0.3 },
                foamRange: { value: this.options.coastalWaveRange ?? 0.8 },
                foamDistortion: { value: this.options.coastalWaveDistortion ?? 0.5 },
                foamOpacity: { value: this.options.coastalWaveOpacity ?? 0.85 },
                waterColorDeep: { value: this.waterDeep },
                waterColorShallow: { value: this.waterShallow },
                ...this.commonUniforms()
            },
            vertexShader: WATER_VERTEX_SHADER,
            fragmentShader: this.options.shaderQuality === "fast"
                ? WATER_FAST_FRAGMENT_SHADER
                : WATER_FRAGMENT_SHADER
        });
        if (tiles.length === 0) return;

        for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
            if (this.chunkRecords.has(`water:${chunkKey}`)) continue;
            const geometry = new InstancedBufferGeometry();
            const mesh = new Mesh(geometry, this.waterMaterial);
            const origin = getWorldChunkOrigin(chunkKey, this.options.size);
            mesh.position.set(origin.x, 0, origin.y);
            mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
                const shader = material as RawShaderMaterial;
                shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
                shader.uniformsNeedUpdate = true;
            };
            mesh.name = `terrain-chunk-water-${chunkKey}`;
            mesh.frustumCulled = false;
            tagWorldChunk(
                mesh,
                chunkKey,
                "water",
                localizeWorldChunkBounds(
                    getWorldChunkBounds(
                        chunkTiles,
                        this.options.size,
                        this.chunkHeightBounds("water").minY,
                        this.chunkHeightBounds("water").maxY
                    ),
                    origin
                )
            );
            chunkTiles.forEach((tile, index) => this.waterTileIndex.set(`${tile.x},${tile.y}`, { mesh, index }));
            this.chunkRecords.set(`water:${chunkKey}`, {
                mesh,
                tiles: chunkTiles,
                layer: "water",
                lodGeometries: new Map()
            });
            this.waterChunks.push(mesh);
            this.add(mesh);
        }
    }

    //Places a 3D model + text label on every tile.city (TileInfo.city, see
    //interfaces.ts) - independent of terrain type, so a city can sit on any
    //land tile instead of being tied to a specific Land value. The model
    //comes from the tile's own data if present (city.model), falling back to
    //the map-wide cityModel option - a map can mix different models (e.g. a
    //capital vs. a village) purely through its own JSON, no code changes
    //required. Each model's own offset/rotation/scale fine-tuning lives in its
    //folder's info.json (see helpers/models.ts's fixup matrix), not here -
    //cityScale only applies an *additional* map-wide multiplier on top of that.
    //
    //Async because loading a glTF model is async (see helpers/models.ts) -
    //called by HexMap.loadWorld() after construction, not from the constructor,
    //so callers can await it if they need cities present before proceeding.
    public async loadCities(onlyTiles?: readonly Point[], owner?: object): Promise<void> {
        if (this.disposed) throw new Error("TerrainMesh has been disposed");
        const { size } = this.options;
        const defaultModel = this.options.cityModel ?? "Assets/models/monument";
        const cityScale = this.options.cityScale ?? 1;

        const cityTiles: Point[] = [];
        if (onlyTiles) {
            for (const point of onlyTiles) {
                if (getMapTile(this.map, point.x, point.y)?.city) cityTiles.push(point);
            }
        } else {
            forEachMapTile(this.map, (tile, x, y) => {
                if (tile.city) cityTiles.push({ x, y });
            });
        }

        for (const { x, y } of cityTiles) {
            const tile = getMapTile(this.map, x, y);
            const key = `${x},${y}`;
            if (!tile?.city) continue;
            const signature = this.citySignature(tile);
            const existing = this.cityFog.get(key);
            if (existing?.signature === signature) {
                existing.owner = owner;
                continue;
            }
            if (existing) this.removeCity(key);

            const pending = this.pendingCities.get(key);
            if (pending?.signature === signature) {
                pending.owner = owner;
                await pending.promise;
                continue;
            }
            if (pending) this.pendingCities.delete(key);

            let record: PendingCityBuild;
            const modelPath = tile.city.model ?? defaultModel;
            const promise = this.modelAssets.acquire(modelPath).then(asset => {
                let published = false;
                try {
                    if (!this.isCurrentCityBuild(key, record)) return;
                    const currentTile = getMapTile(this.map, x, y);
                    if (!currentTile?.city || this.citySignature(currentTile) !== signature) return;

                    const { scene, fixup } = asset.model;
                    const model = scene.clone(true);
                    model.applyMatrix4(fixup);
                    model.updateMatrixWorld(true);
                    const cityMaterials: CityFogEntry["materials"] = [];
                    let sprite: Sprite | undefined;
                    try {
                        // glTF hierarchy clones keep their source materials. Cities
                        // need private materials because fog darkening is per tile.
                        model.traverse(o => {
                            const mesh = o as Mesh;
                            if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
                            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                            const clonedMaterials = sourceMaterials.map(material => material.clone());
                            mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
                            for (const material of clonedMaterials) {
                                const colored = material as Material & { color?: Color };
                                cityMaterials.push({ material: colored, baseColor: colored.color?.clone() });
                            }
                        });

                        const center = getHexCenter(x, y, size);
                        const modelHeight = new Box3().setFromObject(model).getSize(new Vector3()).y;
                        const wrapper = new Group();
                        wrapper.add(model);
                        wrapper.scale.setScalar(cityScale);
                        const groundHeight = this.surface.getTileCenterHeight(x, y);
                        const labelOffset = modelHeight * cityScale + Math.round(size / 5);
                        wrapper.position.set(center.x, groundHeight, center.y);
                        wrapper.userData[CITY_FOG_TILE_KEY] = key;

                        sprite = makeTextSprite(` ${currentTile.city.name ?? "City"} `, {
                            fontsize: 32,
                            fontface: "Georgia",
                            borderColor: { r: 0, g: 0, b: 255, a: 0.8 }
                        });
                        sprite.position.set(center.x, groundHeight + labelOffset, center.y);
                        sprite.userData[CITY_FOG_TILE_KEY] = key;

                        if (!this.isCurrentCityBuild(key, record)) {
                            this.disposeCityResources(cityMaterials, sprite);
                            return;
                        }
                        this.add(wrapper);
                        this.add(sprite);
                        this.cityFog.set(key, {
                            wrapper,
                            sprite,
                            x,
                            y,
                            labelOffset,
                            materials: cityMaterials,
                            owner: record.owner,
                            signature,
                            asset
                        });
                        published = true;
                    } catch (reason) {
                        this.disposeCityResources(cityMaterials, sprite);
                        throw reason;
                    }
                } finally {
                    if (!published) asset.release();
                }
            }).finally(() => {
                if (this.pendingCities.get(key) === record) this.pendingCities.delete(key);
            });
            record = { owner, signature, promise };
            this.pendingCities.set(key, record);
            await promise;
        }
    }

    private isCurrentCityBuild(key: string, record: PendingCityBuild): boolean {
        return !this.disposed && this.pendingCities.get(key) === record;
    }

    public refreshCitySurfaceHeights(points?: readonly Point[]): void {
        const filter = points ? new Set(points.map(point => `${point.x},${point.y}`)) : undefined;
        const surfaceWindow = this.surface.createWindow();
        for (const [key, city] of this.cityFog) {
            if (filter && !filter.has(key)) continue;
            const height = surfaceWindow.getTileCenterHeight(city.x, city.y);
            city.wrapper.position.y = height;
            city.sprite.position.y = height + city.labelOffset;
        }
    }

    public async refreshCities(changes: readonly TerrainCityRefresh[]): Promise<void> {
        const latest = new Map<string, TerrainCityRefresh>();
        const surfaceWindow = this.surface.createWindow();
        for (const change of changes) latest.set(`${change.point.x},${change.point.y}`, change);
        const builds: Promise<void>[] = [];
        for (const [key, { point, owner }] of latest) {
            const tile = getMapTile(this.map, point.x, point.y);
            const signature = this.citySignature(tile);
            const existing = this.cityFog.get(key);
            if (existing?.signature === signature) {
                existing.owner = owner;
                const height = surfaceWindow.getTileCenterHeight(point.x, point.y);
                existing.wrapper.position.y = height;
                existing.sprite.position.y = height + existing.labelOffset;
                continue;
            }
            if (existing) this.removeCity(key);
            if (tile?.city) builds.push(this.loadCities([point], owner));
        }
        await Promise.all(builds);
    }

    private citySignature(tile: TileInfo | undefined): string {
        return tile?.city
            ? JSON.stringify([tile.city.name ?? null, tile.city.model ?? null])
            : "";
    }

    //Adds render shells for newly materialized sparse-world cells. Actual GPU
    //attributes remain lazy and are built by activateChunk() when visible.
    public addTiles(tiles: readonly Point[]): void {
        const landTiles: Point[] = [];
        const waterTiles: Point[] = [];
        for (const point of tiles) {
            const tile = getMapTile(this.map, point.x, point.y);
            if (!tile) continue;
            (WATER_TYPES.includes(tile.type) ? waterTiles : landTiles).push(point);
        }
        this.buildLandLayer(landTiles);
        this.buildWaterLayer(waterTiles);
    }

    //Updates terrain/rivers/neighborhood attributes in place when a tile stays
    //on its current land/water layer. A land<->water transition changes draw
    //membership, so only that 12x12 render chunk is rebuilt. Returned ids let
    //the scheduler drop stale GPU residency records for those rebuilt shells.
    public refreshTileAttributes(tiles: readonly Point[]): string[] {
        const structuralChunkKeys = new Set<string>();
        for (const point of tiles) {
            const key = `${point.x},${point.y}`;
            const tile = getMapTile(this.map, point.x, point.y);
            const landEntry = this.tileIndex.get(key);
            const waterEntry = this.waterTileIndex.get(key);
            const expectedWater = Boolean(tile && WATER_TYPES.includes(tile.type));
            if ((!tile && (landEntry || waterEntry))
                || (expectedWater && landEntry) || (!expectedWater && waterEntry)) {
                structuralChunkKeys.add(getWorldChunkKey(point.x, point.y));
            }
        }

        const rebuiltIds: string[] = [];
        for (const chunkKey of structuralChunkKeys) {
            const allTiles = new Map<string, Point>();
            for (const layer of ["land", "water"] as const) {
                for (const point of this.chunkRecords.get(`${layer}:${chunkKey}`)?.tiles ?? []) {
                    allTiles.set(`${point.x},${point.y}`, point);
                }
            }
            const points = [...allTiles.values()];
            rebuiltIds.push(...this.removeTiles(points, false, undefined, true));
            this.addTiles(points);
        }

        const attributeNames: readonly (keyof InstanceAttributes)[] = [
            "style",
            "neighborsA",
            "neighborsB",
            "neighborsPriorityA",
            "neighborsPriorityB",
            "neighborsKindA",
            "neighborsKindB",
            "waterEdges",
            "landform",
            "reliefNeighborsA",
            "reliefNeighborsB"
        ];
        const pendingUpdates = new Map<InstancedBufferAttribute, BufferUpdateRange[]>();
        for (const point of tiles) {
            if (structuralChunkKeys.has(getWorldChunkKey(point.x, point.y))) continue;
            const key = `${point.x},${point.y}`;
            const entry = this.tileIndex.get(key) ?? this.waterTileIndex.get(key);
            if (!entry) continue;
            const metadata = getWorldChunkMetadata(entry.mesh);
            const record = metadata ? this.chunkRecords.get(metadata.id) : undefined;
            if (!record?.attributes) continue;
            const fresh = this.buildInstanceAttributes(
                [point],
                { x: record.mesh.position.x, y: record.mesh.position.z }
            );
            const geometries = new Set<InstancedBufferGeometry>([
                record.mesh.geometry,
                ...record.lodGeometries.values()
            ]);
            for (const name of attributeNames) {
                const source = fresh[name];
                const target = record.attributes[name];
                const itemSize = source.length;
                const start = entry.index * itemSize;
                target.set(source, start);
                for (const geometry of geometries) {
                    const attribute = geometry.getAttribute(name) as InstancedBufferAttribute | undefined;
                    if (!attribute) continue;
                    const ranges = pendingUpdates.get(attribute) ?? [];
                    ranges.push({ start, count: itemSize });
                    pendingUpdates.set(attribute, ranges);
                }
            }
        }
        for (const [attribute, ranges] of pendingUpdates) commitBufferAttributeRanges(attribute, ranges);
        return rebuiltIds;
    }

    //Removes every render chunk touched by these cells. Streaming generation
    //chunks are aligned to WORLD_CHUNK_SIZE, so a render chunk is never shared
    //between two independently resident generation chunks.
    public removeTiles(
        tiles: readonly Point[],
        removeCities = true,
        cityOwner?: object,
        preserveFog = false
    ): string[] {
        const chunkKeys = new Set(groupTilesByWorldChunk(tiles).keys());
        const removedIds: string[] = [];
        for (const chunkKey of chunkKeys) {
            for (const layer of ["land", "water"] as const) {
                const id = `${layer}:${chunkKey}`;
                const record = this.chunkRecords.get(id);
                if (!record) continue;
                this.disposeChunkGeometries(record);
                this.remove(record.mesh);
                this.chunkRecords.delete(id);
                const collection = layer === "land" ? this.landChunks : this.waterChunks;
                const index = collection.indexOf(record.mesh);
                if (index >= 0) collection.splice(index, 1);
                const tileIndex = layer === "land" ? this.tileIndex : this.waterTileIndex;
                for (const point of record.tiles) tileIndex.delete(`${point.x},${point.y}`);
                removedIds.push(id);
            }
        }
        if (!preserveFog) for (const point of tiles) this.fogStates.delete(`${point.x},${point.y}`);
        if (removeCities) this.removeCities(tiles, cityOwner);
        return removedIds;
    }

    public removeCities(tiles: readonly Point[], owner?: object): void {
        for (const point of tiles) this.removeCity(`${point.x},${point.y}`, owner);
    }

    private removeCity(key: string, owner?: object): void {
        const pending = this.pendingCities.get(key);
        if (pending && (owner === undefined || pending.owner === owner)) this.pendingCities.delete(key);
        const entry = this.cityFog.get(key);
        if (!entry || (owner !== undefined && entry.owner !== owner)) return;
        this.remove(entry.wrapper);
        this.remove(entry.sprite);
        this.disposeCityResources(entry.materials, entry.sprite);
        entry.asset.release();
        this.cityFog.delete(key);
    }

    private disposeCityResources(materials: CityFogEntry["materials"], sprite?: Sprite): void {
        for (const { material } of materials) material.dispose();
        sprite?.material.map?.dispose();
        sprite?.material.dispose();
    }

    //Advances the water/river animation. `dtS` is the elapsed time in seconds
    //since the previous frame - call this once per frame (see HexMap's render
    //loop). The land material's clock drives river ripples (terrain.fragment.ts).
    public update(dtS: number): void {
        this.clock += dtS;
        if (this.waterMaterial) this.waterMaterial.uniforms.uTime.value = this.clock;
        if (this.landMaterial) this.landMaterial.uniforms.uTime.value = this.clock;
    }

    public setWorldCenter(x: number, y: number): void {
        this.landMaterial?.uniforms.worldCenter.value.set(x, y);
        this.waterMaterial?.uniforms.worldCenter.value.set(x, y);
    }

    public setCameraWorldOffset(x: number, y: number): void {
        this.waterMaterial?.uniforms.cameraWorldOffset.value.set(x, y);
    }

    //Near terrain keeps the original subdivision counts (land 3 / water 2).
    //Only interior vertices are reduced at middle/far distances; full-detail
    //rim tessellation remains identical, so adjacent chunks cannot open cracks.
    public activateChunk(metadata: WorldChunkMetadata, lod: WorldChunkLod): InstancedBufferGeometry | undefined {
        const record = this.chunkRecords.get(metadata.id);
        if (!record) return undefined;
        if (record.lod === lod && record.mesh.geometry.getAttribute("position")) return record.mesh.geometry;

        let geometry = record.lodGeometries.get(lod);
        if (!geometry) {
            record.attributes ??= this.buildInstanceAttributes(
                record.tiles,
                { x: record.mesh.position.x, y: record.mesh.position.z }
            );
            const fastTerrain = this.options.shaderQuality === "fast";
            const subdivisions = fastTerrain
                ? 0
                : record.layer === "land"
                    ? ([3, 2, 1] as const)[lod]
                    : ([2, 1, 0] as const)[lod];
            const borderSubdivisions = fastTerrain ? 0 : record.layer === "land" ? 3 : 2;
            geometry = this.buildInstancedGeometry(
                record.tiles,
                subdivisions,
                borderSubdivisions,
                { x: record.mesh.position.x, y: record.mesh.position.z },
                record.attributes
            );
            record.lodGeometries.set(lod, geometry);
            this.lodBuilds += 1;
        }
        const previous = record.mesh.geometry;
        record.mesh.geometry = geometry;
        if (record.lod === undefined && !previous.getAttribute("position")) previous.dispose();
        record.lod = lod;
        return geometry;
    }

    public releaseChunk(metadata: WorldChunkMetadata): void {
        const record = this.chunkRecords.get(metadata.id);
        if (!record || record.lod === undefined) return;
        this.disposeChunkGeometries(record);
        record.mesh.geometry = new InstancedBufferGeometry();
        record.attributes = undefined;
        record.lod = undefined;
    }

    public get lodBuildCount(): number {
        return this.lodBuilds;
    }

    private disposeChunkGeometries(record: TerrainChunkRecord): void {
        const geometries = new Set<InstancedBufferGeometry>([record.mesh.geometry, ...record.lodGeometries.values()]);
        for (const geometry of geometries) geometry.dispose();
        record.lodGeometries.clear();
    }

    public get gridVisible(): boolean {
        return (this.landMaterial ?? this.waterMaterial)?.uniforms.showGrid.value > 0;
    }

    public set gridVisible(value: boolean) {
        const v = value ? 1.0 : 0.0;
        if (this.landMaterial) this.landMaterial.uniforms.showGrid.value = v;
        if (this.waterMaterial) this.waterMaterial.uniforms.showGrid.value = v;
    }

    public get landformDebugMode(): LandformDebugMode {
        const value = this.landMaterial?.uniforms.landformDebugMode.value ?? 0;
        return (Object.entries(LANDFORM_DEBUG_VALUE)
            .find(([, candidate]) => candidate === value)?.[0] as LandformDebugMode | undefined) ?? "off";
    }

    public set landformDebugMode(value: LandformDebugMode) {
        if (!(value in LANDFORM_DEBUG_VALUE)) throw new RangeError(`unknown landform debug mode "${String(value)}"`);
        if (this.landMaterial) this.landMaterial.uniforms.landformDebugMode.value = LANDFORM_DEBUG_VALUE[value];
    }

    public get terrainTextureRegionSize(): number {
        const worldSize = this.landMaterial?.uniforms.terrainTextureWorldSize.value as Vector2 | undefined;
        return worldSize ? worldSize.x / (this.options.size * 1.5) : this.options.terrainTextureRegionSize ?? 2;
    }

    public set terrainTextureRegionSize(value: number) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new RangeError("terrainTextureRegionSize must be a positive finite number");
        }
        const worldSize = this.landMaterial?.uniforms.terrainTextureWorldSize.value as Vector2 | undefined;
        worldSize?.set(
            this.options.size * 1.5 * value,
            this.options.size * Math.sqrt(3) * value
        );
    }

    //-------------------------------------------------------------------------
    //Live shader-uniform tuning knobs, for a GUI to adjust without rebuilding
    //the map.
    //beachWidth/waterDepth exist as separate uniform objects on landMaterial
    //and waterMaterial each (commonUniforms() is called once per material, not
    //shared), so both setters below write to both.
    //-------------------------------------------------------------------------
    public get landBlendWidth(): number {
        return this.landMaterial?.uniforms.landBlendWidth.value ?? 0.5;
    }
    public set landBlendWidth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.landBlendWidth.value = value;
    }

    public get landBlendEnabled(): boolean {
        return (this.landMaterial?.uniforms.landBlendEnabled.value ?? 1.0) > 0.5;
    }
    public set landBlendEnabled(value: boolean) {
        if (this.landMaterial) this.landMaterial.uniforms.landBlendEnabled.value = value ? 1.0 : 0.0;
    }

    //River channel knobs - all live uniforms on the land material (rivers are
    //drawn by the land layer's shaders).
    public get riverWidth(): number {
        return this.landMaterial?.uniforms.riverWidth.value ?? 0.28;
    }
    public set riverWidth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.riverWidth.value = value;
    }

    public get riverBankWidth(): number {
        return this.landMaterial?.uniforms.riverBankWidth.value ?? 0.14;
    }
    public set riverBankWidth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.riverBankWidth.value = value;
    }

    public get riverCurvature(): number {
        return this.landMaterial?.uniforms.riverCurvature.value ?? 0.5;
    }
    public set riverCurvature(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.riverCurvature.value = value;
    }

    public get riverColorShallow(): number {
        return (this.landMaterial?.uniforms.riverColorShallow.value as Color)?.getHex() ?? 0;
    }
    public set riverColorShallow(value: ColorRepresentation) {
        (this.landMaterial?.uniforms.riverColorShallow.value as Color)?.set(value);
    }

    public get riverColorDeep(): number {
        return (this.landMaterial?.uniforms.riverColorDeep.value as Color)?.getHex() ?? 0;
    }
    public set riverColorDeep(value: ColorRepresentation) {
        (this.landMaterial?.uniforms.riverColorDeep.value as Color)?.set(value);
    }

    public get riverBankColor(): number {
        return (this.landMaterial?.uniforms.riverBankColor.value as Color)?.getHex() ?? 0xa8bf6a;
    }
    public set riverBankColor(value: ColorRepresentation) {
        (this.landMaterial?.uniforms.riverBankColor.value as Color)?.set(value);
    }

    public get riverFlowSpeed(): number {
        return this.landMaterial?.uniforms.riverFlowSpeed.value ?? 1.0;
    }
    public set riverFlowSpeed(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.riverFlowSpeed.value = value;
    }

    public get riverDepth(): number {
        return this.landMaterial?.uniforms.riverDepth.value ?? this.options.size * 0.15;
    }
    public set riverDepth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.riverDepth.value = value;
    }

    public get lakeShoreWidth(): number {
        return this.landMaterial?.uniforms.lakeShoreWidth.value ?? 0.18;
    }
    public set lakeShoreWidth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.lakeShoreWidth.value = value;
    }

    //Both materials carry this one now (commonUniforms) - the land layer's
    //curved-coast field uses the same corner rounding as the water layer's.
    public get waterCornerRounding(): number {
        return (this.waterMaterial ?? this.landMaterial)?.uniforms.waterCornerRounding.value ?? 0.4;
    }
    public set waterCornerRounding(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.waterCornerRounding.value = value;
        if (this.waterMaterial) this.waterMaterial.uniforms.waterCornerRounding.value = value;
    }

    //Curved-coastline strength - a commonUniforms member, so write both.
    public get coastCurvature(): number {
        return (this.landMaterial ?? this.waterMaterial)?.uniforms.coastCurvature.value ?? 0.5;
    }
    public set coastCurvature(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.coastCurvature.value = value;
        if (this.waterMaterial) this.waterMaterial.uniforms.coastCurvature.value = value;
    }

    public get landBlendCurvature(): number {
        return this.landMaterial?.uniforms.landBlendCurvature.value ?? 0.5;
    }
    public set landBlendCurvature(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.landBlendCurvature.value = value;
    }

    public get mountainHeight(): number {
        return this.surface.mountainHeight;
    }
    public set mountainHeight(value: number) {
        this.surface.setMountainHeight(value);
        if (this.landMaterial) this.landMaterial.uniforms.mountainHeight.value = value;
        this.refreshChunkHeightBounds();
        this.refreshCitySurfaceHeights();
    }

    public get beachWidth(): number {
        return this.landMaterial?.uniforms.beachWidth.value ?? this.waterMaterial?.uniforms.beachWidth.value ?? 0.35;
    }
    public set beachWidth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.beachWidth.value = value;
        if (this.waterMaterial) this.waterMaterial.uniforms.beachWidth.value = value;
    }

    //waterLevel uniform is negative (rest height below land); exposed here as
    //a positive "depth" to match the waterDepth constructor option's sign.
    public get waterDepth(): number {
        const level = this.landMaterial?.uniforms.waterLevel.value ?? this.waterMaterial?.uniforms.waterLevel.value;
        return level === undefined ? this.options.size * 0.25 : -level;
    }
    public set waterDepth(value: number) {
        const level = -value;
        if (this.landMaterial) this.landMaterial.uniforms.waterLevel.value = level;
        if (this.waterMaterial) this.waterMaterial.uniforms.waterLevel.value = level;
    }

    public get waterWaveAmplitude(): number {
        return this.waterMaterial?.uniforms.waveAmplitude.value ?? 1.6;
    }
    public set waterWaveAmplitude(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.waveAmplitude.value = value;
    }

    //The stored uniform is pre-scaled by 0.045 (see buildWaterLayer) so the
    //raw shader frequency stays in a sane range - getter/setter work in the
    //same "multiplier" units as the constructor option so callers don't need
    //to know about that factor.
    public get waterWaveFrequency(): number {
        return (this.waterMaterial?.uniforms.waveFrequency.value ?? 0.045) / 0.045;
    }
    public set waterWaveFrequency(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.waveFrequency.value = 0.045 * value;
    }

    public get waterWaveSpeed(): number {
        return this.waterMaterial?.uniforms.waveSpeed.value ?? 1.0;
    }
    public set waterWaveSpeed(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.waveSpeed.value = value;
    }

    public get waterSparkleIntensity(): number {
        return this.waterMaterial?.uniforms.sparkleIntensity.value ?? 1.0;
    }
    public set waterSparkleIntensity(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.sparkleIntensity.value = value;
    }

    public get waterFresnelIntensity(): number {
        return this.waterMaterial?.uniforms.fresnelIntensity.value ?? 1.0;
    }
    public set waterFresnelIntensity(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.fresnelIntensity.value = value;
    }

    //Mutates the shared Color instances (see their field comment), so the
    //water layer AND the land layer's painted curved-coast water update
    //together - no per-material bookkeeping.
    public get waterColorShallow(): number {
        return this.waterShallow.getHex();
    }
    public set waterColorShallow(value: ColorRepresentation) {
        this.waterShallow.set(value);
    }

    public get waterColorDeep(): number {
        return this.waterDeep.getHex();
    }
    public set waterColorDeep(value: ColorRepresentation) {
        this.waterDeep.set(value);
    }

    //Coastal foam waves - all plain uniforms on the water material, so
    //toggling/tuning is live. The land material mirrors these for the small
    //shader-painted water strips on curved coastal land tiles.
    public get coastalWavesEnabled(): boolean {
        return ((this.waterMaterial ?? this.landMaterial)?.uniforms.foamEnabled.value ?? 1.0) > 0.5;
    }
    public set coastalWavesEnabled(value: boolean) {
        const v = value ? 1.0 : 0.0;
        if (this.waterMaterial) this.waterMaterial.uniforms.foamEnabled.value = v;
        if (this.landMaterial) this.landMaterial.uniforms.foamEnabled.value = v;
    }

    public get coastalWaveColor(): number {
        return ((this.waterMaterial ?? this.landMaterial)?.uniforms.foamColor.value as Color)?.getHex() ?? 0xffffff;
    }
    public set coastalWaveColor(value: ColorRepresentation) {
        (this.waterMaterial?.uniforms.foamColor.value as Color)?.set(value);
        (this.landMaterial?.uniforms.foamColor.value as Color)?.set(value);
    }

    public get coastalWaveCount(): number {
        return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamCount.value ?? 3;
    }
    public set coastalWaveCount(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamCount.value = value;
        if (this.landMaterial) this.landMaterial.uniforms.foamCount.value = value;
    }

    public get coastalWaveSpeed(): number {
        return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamSpeed.value ?? 0.6;
    }
    public set coastalWaveSpeed(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamSpeed.value = value;
        if (this.landMaterial) this.landMaterial.uniforms.foamSpeed.value = value;
    }

    public get coastalWaveWidth(): number {
        return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamWidth.value ?? 0.3;
    }
    public set coastalWaveWidth(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamWidth.value = value;
        if (this.landMaterial) this.landMaterial.uniforms.foamWidth.value = value;
    }

    public get coastalWaveRange(): number {
        return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamRange.value ?? 0.8;
    }
    public set coastalWaveRange(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamRange.value = value;
        if (this.landMaterial) this.landMaterial.uniforms.foamRange.value = value;
    }

    public get coastalWaveDistortion(): number {
        return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamDistortion.value ?? 0.5;
    }
    public set coastalWaveDistortion(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamDistortion.value = value;
        if (this.landMaterial) this.landMaterial.uniforms.foamDistortion.value = value;
    }

    public get coastalWaveOpacity(): number {
        return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamOpacity.value ?? 0.85;
    }
    public set coastalWaveOpacity(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamOpacity.value = value;
        if (this.landMaterial) this.landMaterial.uniforms.foamOpacity.value = value;
    }

    //Index of a tile within the land layer's instanced attributes, for future
    //point updates (e.g. HexMap.setTile) without rebuilding the whole geometry.
    public getInstanceIndex(x: number, y: number): number | undefined {
        return this.tileIndex.get(`${x},${y}`)?.index;
    }

    //-------------------------------------------------------------------------
    //Fog of war (see FogOfWar.ts) - updates one tile's terrain (land or water,
    //whichever layer it's actually on) and its city model/label (if any) to
    //the given state. Plain per-instance attribute writes, no rebuild.
    //-------------------------------------------------------------------------
    public setFogState(x: number, y: number, state: number): void {
        this.setFogStates([{ x, y, state }]);
    }

    public setFogStates(changes: readonly GpuTileStateChange[]): void {
        const updates = new Map<InstancedBufferAttribute, BufferUpdateRange[]>();
        const write = (
            entry: { mesh: Mesh, index: number } | undefined,
            state: number
        ): void => {
            if (!entry) return;
            const attribute = entry.mesh.geometry.getAttribute("fogState") as InstancedBufferAttribute | undefined;
            if (!attribute) return;
            const componentOffset = entry.index * 4;
            (attribute.array as Float32Array)[componentOffset] = state;
            const metadata = getWorldChunkMetadata(entry.mesh);
            const record = metadata ? this.chunkRecords.get(metadata.id) : undefined;
            const geometries = record
                ? new Set<InstancedBufferGeometry>([
                    entry.mesh.geometry as InstancedBufferGeometry,
                    ...record.lodGeometries.values()
                ])
                : new Set<InstancedBufferGeometry>([entry.mesh.geometry as InstancedBufferGeometry]);
            for (const geometry of geometries) {
                const target = geometry.getAttribute("fogState") as InstancedBufferAttribute | undefined;
                if (!target) continue;
                const ranges = updates.get(target) ?? [];
                // Upload the packed instance vec4. Its biome components are
                // unchanged, but a contiguous vec4 range avoids fragmented
                // component updates across shared LOD attribute arrays.
                ranges.push({ start: componentOffset, count: 4 });
                updates.set(target, ranges);
            }
        };

        for (const { x, y, state } of changes) {
            const key = `${x},${y}`;
            this.fogStates.set(key, state);
            write(this.tileIndex.get(key), state);
            write(this.waterTileIndex.get(key), state);
            this.setCityFog(key, state);
        }
        for (const [attribute, ranges] of updates) commitBufferAttributeRanges(attribute, ranges);
    }

    private setCityFog(key: string, state: number): void {
        const entry = this.cityFog.get(key);
        if (!entry) return;

        const hidden = state < 0.5;
        entry.wrapper.visible = !hidden;
        entry.sprite.visible = !hidden;
        if (hidden) return;

        const shade = state < 1.5 ? (this.options.fogDarkenFactor ?? 0.45) : 1;
        for (const { material, baseColor } of entry.materials) {
            if (material.color && baseColor) material.color.copy(baseColor).multiplyScalar(shade);
        }
    }

    public get mesh(): Mesh | undefined {
        return this.landChunks[0];
    }

    //Releases the land/water geometries, materials and atlas texture. City
    //Model geometry remains shared with loadModel()'s cache. Per-city cloned
    //materials and canvas label textures are owned here and released below.
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.pendingCities.clear();
        for (const record of this.chunkRecords.values()) this.disposeChunkGeometries(record);
        for (const geometry of this.baseLodGeometries.values()) geometry.dispose();
        this.baseLodGeometries.clear();
        this.landMaterial?.dispose();
        this.waterMaterial?.dispose();
        this.atlasTexture.dispose(); // shared by both materials - dispose once
        this.fogTexture.dispose();
        for (const entry of this.cityFog.values()) {
            this.disposeCityResources(entry.materials, entry.sprite);
            entry.asset.release();
        }
        this.cityFog.clear();
        if (this.ownsModelAssets) this.modelAssets.dispose();
    }
}
