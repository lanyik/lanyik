import {
    BufferGeometry,
    Float32BufferAttribute,
    InstancedBufferGeometry,
    InstancedBufferAttribute,
    Mesh,
    RawShaderMaterial,
    Color,
    ColorRepresentation,
    DoubleSide,
    Vector2,
    Group,
    Object3D
} from "three";

import { CoastClearanceOptions } from "../helpers/coast";
import { forEachMapTile } from "../helpers/mapData";
import { MapInfo, Point } from "../interfaces";
import { Land } from "../enums";
import { getMapTile } from "../helpers/topology";
import { SharedBaseInstancedBufferGeometry } from "../rendering/SharedBaseInstancedBufferGeometry";
import {
    BufferUpdateRange,
    commitBufferAttributeRanges,
    GpuTileStateChange
} from "../rendering/BufferUpdateBatch";
import { isLakeTile, WaterClearanceOptions } from "../helpers/rivers";
import { GRASS_VERTEX_SHADER } from "../shaders/grass.vertex";
import { GRASS_FRAGMENT_SHADER } from "../shaders/grass.fragment";
import {
    getWorldChunkBounds,
    getWorldChunkOrigin,
    groupTilesByWorldChunk,
    localizeWorldChunkBounds,
    tagWorldChunk,
    WorldChunkLod,
    WorldChunkMetadata
} from "../helpers/chunks";
import {
    buildGrassLod,
    WorldVegetationGrassChunkLayout,
    WorldVegetationGrassLodLayout,
    WorldVegetationLayout
} from "../world/generateVegetation";
import { WorldSurfaceView } from "../world/WorldSurfaceView";
import { collectGeometryAllocations, ResourceBudgetAccount } from "../runtime/ResourceBudget";
import { grassLayoutAllocations, VegetationResources } from "../rendering/VegetationResources";

export interface GrassOptions {
    size: number;
    surface: WorldSurfaceView;
    resourceAccount?: ResourceBudgetAccount;
    density?: number;         // average candidates per hex area, default 60
    bladeWidth?: number;      // world units, default size * 0.03
    bladeHeight?: number;     // world units, default size * 0.18
    heightVariation?: number; // 0..1 random per-blade height jitter, default 0.4
    windStrength?: number;    // tip sway distance in world units, default bladeHeight * 0.35
    windSpeed?: number;       // default 1.2
    colorBase?: ColorRepresentation; // root color, default a darker green
    colorTip?: ColorRepresentation;  // tip color, default a lighter green
    fogDarkenFactor?: number; // color multiplier for Explored fog tiles, default 0.45 - see FogOfWar.ts

    //River/lake water clearance (see helpers/rivers.ts's isInTileWater):
    //Exclude painted water (including its noise-bent bulges). Same
    //fractions-of-tile-radius values as the map's options - keep them in sync.
    riverWidth?: number;     // default 0.28
    riverBankWidth?: number; // default 0.14
    riverCurvature?: number; // default 0.5
    lakeShoreWidth?: number; // default 0.18
    beachWidth?: number;
    waterCornerRounding?: number;
    coastCurvature?: number;
}

interface TileBladeRange { geometry: InstancedBufferGeometry, start: number, count: number }

interface GrassLodCache {
    geometry: InstancedBufferGeometry;
    ranges: { key: string, start: number, count: number }[];
}

interface GrassChunkRecord {
    chunkKey: string;
    mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
    tiles: { x: number, y: number }[];
    lod?: WorldChunkLod;
    lodCache: Map<WorldChunkLod, GrassLodCache>;
}

interface ResolvedGrassOptions {
    size: number;
    surface: WorldSurfaceView;
    density: number;
    bladeWidth: number;
    bladeHeight: number;
    heightVariation: number;
    waterOptions: WaterClearanceOptions;
    coastOptions: CoastClearanceOptions;
}

export class GrassSharedResources {
    public readonly blade = buildBladeGeometry();
    public readonly material: RawShaderMaterial;
    private clock = 0;
    private disposed = false;
    private readonly retained: VegetationResources;

    constructor(options: Omit<GrassOptions, "surface">) {
        this.retained = new VegetationResources(options.resourceAccount);
        this.retained.retain("blade", collectGeometryAllocations([this.blade]));
        const bladeHeight = options.bladeHeight ?? options.size * 0.18;
        this.material = new RawShaderMaterial({
            fog: true,
            uniforms: {
                worldOffset: { value: new Vector2(0, 0) },
                worldCenter: { value: new Vector2(0, 0) },
                worldPeriod: { value: new Vector2(0, 0) },
                chunkOrigin: { value: new Vector2(0, 0) },
                uTime: { value: 0 },
                windStrength: { value: options.windStrength ?? bladeHeight * 0.35 },
                windSpeed: { value: options.windSpeed ?? 1.2 },
                colorBase: { value: new Color(options.colorBase ?? 0x3c6e2e) },
                colorTip: { value: new Color(options.colorTip ?? 0x8fce5a) },
                fogDarkenFactor: { value: options.fogDarkenFactor ?? 0.45 },
                fogColor: { value: new Color() },
                fogNear: { value: 1 },
                fogFar: { value: 1000 }
            },
            vertexShader: GRASS_VERTEX_SHADER,
            fragmentShader: GRASS_FRAGMENT_SHADER,
            side: DoubleSide
        });
    }

    public update(dtS: number): void {
        this.clock += dtS;
        this.material.uniforms.uTime.value = this.clock;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.blade.dispose();
        this.material.dispose();
        this.retained.dispose();
    }
}

//----------------------------------------------------------------------------------
//A thin, wind-animated grass layer scattered on top of Land.land ("grass") tiles
//- purely decorative, added on top of TerrainMesh's own atlas-textured land
//layer (which keeps rendering underneath exactly as before). Skips tiles with a
//city (a model sits there instead); wood tiles keep their grass (forest floor).
//
//One InstancedBufferGeometry per visible 12x12 world chunk - matching
//TerrainMesh's streaming granularity - rather than one always-submitted map or
//a Mesh/Object3D per blade. Each blade is a single 5-vertex tapered shape (see
//buildBladeGeometry), vertex-colored root->tip instead of textured, since a
//solid gradient is enough at this scale and needs no extra texture fetch/alpha
//test. Wind sway is a per-instance phase-shifted sine (grass.vertex.ts) so a
//gust visibly travels across the field instead of every blade moving in
//lockstep.
//
//Purely procedural - no textures/models to load - so unlike Forest.ts/
//TerrainMesh.loadCities() this is synchronous and can be rebuilt instantly
//(e.g. a live GUI slider changing blade density) without an async round-trip.
//----------------------------------------------------------------------------------
export class GrassField extends Group {
    private readonly tileRanges = new Map<string, TileBladeRange>();
    private readonly fogStates = new Map<string, number>();
    private readonly suppressedTiles = new Set<string>();
    private lodBuilds = 0;
    private readonly retained: VegetationResources;
    private disposed = false;

    constructor(
        private map: MapInfo,
        private chunks: Map<string, GrassChunkRecord>,
        public readonly resources: GrassSharedResources,
        private options: ResolvedGrassOptions,
        private preparedChunks: Map<string, WorldVegetationGrassChunkLayout>,
        private ownsResources: boolean,
        resourceAccount?: ResourceBudgetAccount
    ) {
        super();
        this.retained = new VegetationResources(resourceAccount);
        this.retained.retain("prepared", grassLayoutAllocations(preparedChunks.values()));
        for (const record of chunks.values()) this.add(record.mesh);
    }

    //Updates every blade belonging to (x, y) to the given fog state (see
    //FogOfWar.ts) - a plain attribute-slice fill + needsUpdate, no rebuild.
    //No-op for tiles with no grass (city tiles, non-"land" terrain).
    public setFogState(x: number, y: number, state: number): void {
        this.setFogStates([{ x, y, state }]);
    }

    public setFogStates(changes: readonly GpuTileStateChange[]): void {
        const updates = new Map<InstancedBufferAttribute, BufferUpdateRange[]>();
        for (const { x, y, state } of changes) {
            const key = `${x},${y}`;
            this.fogStates.set(key, state);
            const range = this.tileRanges.get(key);
            if (!range) continue;
            const attribute = range.geometry.getAttribute("fogState") as InstancedBufferAttribute;
            const visibleState = this.suppressedTiles.has(key) ? 0 : state;
            (attribute.array as Float32Array).fill(visibleState, range.start, range.start + range.count);
            const ranges = updates.get(attribute) ?? [];
            ranges.push({ start: range.start, count: range.count });
            updates.set(attribute, ranges);
        }
        for (const [attribute, ranges] of updates) commitBufferAttributeRanges(attribute, ranges);
    }

    /** Hides one tile's blades without rebuilding its streamed render chunk. */
    public setTileSuppressed(x: number, y: number, suppressed: boolean): void {
        const key = `${x},${y}`;
        if (suppressed) this.suppressedTiles.add(key);
        else this.suppressedTiles.delete(key);
        const range = this.tileRanges.get(key);
        if (!range) return;
        const attribute = range.geometry.getAttribute("fogState") as InstancedBufferAttribute;
        (attribute.array as Float32Array).fill(
            suppressed ? 0 : (this.fogStates.get(key) ?? 2),
            range.start,
            range.start + range.count
        );
        commitBufferAttributeRanges(attribute, [{ start: range.start, count: range.count }]);
    }

    //Advances the wind animation. `dtS` is the elapsed time in seconds since
    //the previous frame - call this once per frame (see HexMap's render loop).
    public update(dtS: number): void {
        this.resources.update(dtS);
    }

    public setWorldCenter(x: number, y: number): void {
        this.resources.material.uniforms.worldCenter.value.set(x, y);
    }

    public get windStrength(): number {
        return this.resources.material.uniforms.windStrength.value;
    }
    public set windStrength(value: number) {
        this.resources.material.uniforms.windStrength.value = value;
    }

    public get windSpeed(): number {
        return this.resources.material.uniforms.windSpeed.value;
    }
    public set windSpeed(value: number) {
        this.resources.material.uniforms.windSpeed.value = value;
    }

    public activateChunk(metadata: WorldChunkMetadata, lod: WorldChunkLod): InstancedBufferGeometry | undefined {
        const record = this.chunks.get(metadata.id);
        if (!record) return undefined;
        if (record.lod === lod && record.mesh.geometry.getAttribute("position")) {
            this.trimLods(record, lod);
            return record.mesh.geometry;
        }

        this.removeTileRanges(record);
        let cached = record.lodCache.get(lod);
        if (!cached) {
            cached = this.buildChunkGeometry(
                record.chunkKey,
                record.tiles,
                lod,
                { x: record.mesh.position.x, y: record.mesh.position.z }
            );
            record.lodCache.set(lod, cached);
            this.retained.retain(`${record.chunkKey}:${lod}`, collectGeometryAllocations([cached.geometry]));
            this.lodBuilds += 1;
        }
        const previous = record.mesh.geometry;
        record.mesh.geometry = cached.geometry;
        if (record.lod === undefined && !previous.getAttribute("position")) previous.dispose();
        const fogAttribute = cached.geometry.getAttribute("fogState") as InstancedBufferAttribute;
        const updateRanges: BufferUpdateRange[] = [];
        for (const range of cached.ranges) {
            const state = this.suppressedTiles.has(range.key) ? 0 : (this.fogStates.get(range.key) ?? 2);
            (fogAttribute.array as Float32Array).fill(state, range.start, range.start + range.count);
            updateRanges.push({ start: range.start, count: range.count });
            this.tileRanges.set(range.key, { geometry: cached.geometry, start: range.start, count: range.count });
        }
        commitBufferAttributeRanges(fogAttribute, updateRanges);
        record.lod = lod;
        this.trimLods(record, lod);
        return record.mesh.geometry;
    }

    private trimLods(record: GrassChunkRecord, active: WorldChunkLod): void {
        this.retained.pin(`${record.chunkKey}:${active}`);
        for (const [lod, cached] of record.lodCache) {
            if (lod === active || this.retained.keepCached(`${record.chunkKey}:${lod}`)) continue;
            cached.geometry.dispose();
            record.lodCache.delete(lod);
        }
    }

    public releaseChunk(metadata: WorldChunkMetadata, objects: readonly Object3D[] = []): void {
        const record = this.chunks.get(metadata.id);
        if (!record || record.lod === undefined) return;
        this.removeTileRanges(record);
        for (const [lod, cached] of record.lodCache) {
            cached.geometry.dispose();
            this.retained.release(`${record.chunkKey}:${lod}`);
        }
        record.lodCache.clear();
        record.mesh.geometry = new InstancedBufferGeometry();
        for (const object of objects) if ((object as Mesh).isMesh) {
            (object as Mesh).geometry = record.mesh.geometry;
        }
        record.lod = undefined;
    }

    public get lodBuildCount(): number {
        return this.lodBuilds;
    }

    private removeTileRanges(record: GrassChunkRecord): void {
        for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
    }

    private buildChunkGeometry(
        chunkKey: string,
        chunkTiles: { x: number, y: number }[],
        lod: WorldChunkLod,
        origin: Point
    ): GrassLodCache {
        const prepared = this.preparedChunks.get(chunkKey)?.lods.find(candidate => candidate.lod === lod);
        if (prepared) return this.buildPreparedChunkGeometry(prepared, origin);
        const options = this.options;
        return this.buildPreparedChunkGeometry(buildGrassLod(this.map, chunkKey, chunkTiles, lod, {
            size: options.size,
            grassDensity: options.density,
            grassBladeWidth: options.bladeWidth,
            grassBladeHeight: options.bladeHeight,
            grassHeightVariation: options.heightVariation
        }, options.waterOptions, options.coastOptions), origin);
    }

    private buildPreparedChunkGeometry(prepared: WorldVegetationGrassLodLayout, origin: Point): GrassLodCache {
        const geometry = new SharedBaseInstancedBufferGeometry(this.resources.blade, ["position"]);
        const fogStates = new Float32Array(prepared.instanceCount);
        const groundHeights = new Float32Array(prepared.instanceCount);
        const surfaceWindow = this.options.surface.createWindow();
        for (let index = 0; index < prepared.instanceCount; index += 1) {
            groundHeights[index] = surfaceWindow.getWorldHeight(
                prepared.offsets[index * 2] + origin.x,
                prepared.offsets[index * 2 + 1] + origin.y
            );
        }
        const ranges = prepared.tiles.map((tile, index) => {
            const key = `${tile.x},${tile.y}`;
            const start = prepared.ranges[index * 2];
            const count = prepared.ranges[index * 2 + 1];
            fogStates.fill(this.fogStates.get(key) ?? 2, start, start + count);
            return { key, start, count };
        });
        geometry.instanceCount = prepared.instanceCount;
        geometry.setAttribute("offset", new InstancedBufferAttribute(prepared.offsets, 2));
        geometry.setAttribute("tileOffset", new InstancedBufferAttribute(prepared.tileOffsets, 2));
        geometry.setAttribute("angle", new InstancedBufferAttribute(prepared.angles, 1));
        geometry.setAttribute("scale", new InstancedBufferAttribute(prepared.scales, 2));
        geometry.setAttribute("phase", new InstancedBufferAttribute(prepared.phases, 1));
        geometry.setAttribute("shade", new InstancedBufferAttribute(prepared.shades, 1));
        geometry.setAttribute("fogState", new InstancedBufferAttribute(fogStates, 1));
        geometry.setAttribute("groundHeight", new InstancedBufferAttribute(groundHeights, 1));
        return { geometry, ranges };
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const record of this.chunks.values()) {
            const geometries = new Set<InstancedBufferGeometry>([
                record.mesh.geometry,
                ...[...record.lodCache.values()].map(cached => cached.geometry)
            ]);
            for (const geometry of geometries) geometry.dispose();
            record.lodCache.clear();
        }
        this.chunks.clear();
        this.preparedChunks.clear();
        this.tileRanges.clear();
        this.fogStates.clear();
        this.suppressedTiles.clear();
        this.clear();
        this.retained.dispose();
        if (this.ownsResources) this.resources.dispose();
    }
}

//A single tapered blade authored in [-0.5..0.5] width x [0..1] height (local,
//unscaled) - per-instance `scale` stretches it to the actual blade size, so
//the geometry itself is built once and reused for every instance. The mid-
//height vertices give the blade a bend joint instead of a single rigid
//triangle, so the wind shader has something to visibly curve.
function buildBladeGeometry(): BufferGeometry {
    const positions = new Float32Array([
        -0.5, 0.0, 0,
        0.5, 0.0, 0,
        -0.25, 0.5, 0,
        0.25, 0.5, 0,
        0.0, 1.0, 0
    ]);
    const index = [0, 1, 2, 1, 3, 2, 2, 3, 4];

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    return geometry;
}

//Builds the map-wide grass field. Returns null if the map has no grass tiles
//or density is 0.
export function createGrassField(
    map: MapInfo,
    options: GrassOptions,
    onlyTiles?: readonly Point[],
    sharedResources?: GrassSharedResources,
    preparedLayout?: WorldVegetationLayout
): GrassField | null {
    const { size, surface } = options;
    const density = options.density ?? 60;
    if (density <= 0) return null;

    const bladeWidth = options.bladeWidth ?? size * 0.03;
    const bladeHeight = options.bladeHeight ?? size * 0.18;
    const heightVariation = options.heightVariation ?? 0.4;

    //Lake shore rims are too narrow for grass; river banks remain eligible.
    const tiles: { x: number, y: number }[] = [];
    const considerTile = (x: number, y: number): void => {
        const tile = getMapTile(map, x, y);
        if (tile?.type === Land.land && !tile.city && !isLakeTile(tile)) tiles.push({ x, y });
    };
    if (onlyTiles) {
        for (const point of onlyTiles) considerTile(point.x, point.y);
    } else {
        forEachMapTile(map, (_tile, x, y) => considerTile(x, y));
    }
    if (tiles.length === 0) return null;

    const waterOptions: WaterClearanceOptions = {
        riverWidth: options.riverWidth ?? 0.28,
        riverBankWidth: options.riverBankWidth ?? 0.14,
        riverCurvature: options.riverCurvature ?? 0.5,
        lakeShoreWidth: options.lakeShoreWidth ?? 0.18
    };

    const coastOptions: CoastClearanceOptions = {
        beachWidth: options.beachWidth ?? 0.35,
        lakeShoreWidth: options.lakeShoreWidth ?? 0.18,
        waterCornerRounding: options.waterCornerRounding ?? 0.4,
        coastCurvature: options.coastCurvature ?? 0.5
    };
    const resources = sharedResources ?? new GrassSharedResources(options);

    const chunks = new Map<string, GrassChunkRecord>();
    for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
        const geometry = new InstancedBufferGeometry();
        const chunk = new Mesh(geometry, resources.material);
        const origin = getWorldChunkOrigin(chunkKey, size);
        chunk.position.set(origin.x, 0, origin.y);
        chunk.onBeforeRender = (_renderer, _scene, _camera, _geometry, currentMaterial) => {
            const shader = currentMaterial as RawShaderMaterial;
            shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
            shader.uniformsNeedUpdate = true;
        };
        chunk.name = `grass-chunk-${chunkKey}`;
        chunk.frustumCulled = false;
        tagWorldChunk(
            chunk,
            chunkKey,
            "grass",
            localizeWorldChunkBounds(
                getWorldChunkBounds(
                    chunkTiles,
                    size,
                    surface.minimumHeight,
                    surface.maximumHeight + bladeHeight * (1 + heightVariation)
                ),
                origin
            )
        );
        chunks.set(`grass:${chunkKey}`, { chunkKey, mesh: chunk, tiles: chunkTiles, lodCache: new Map() });
    }

    return new GrassField(map, chunks, resources, {
        size,
        surface,
        density,
        bladeWidth,
        bladeHeight,
        heightVariation,
        waterOptions,
        coastOptions
    }, new Map(preparedLayout?.grass.map(chunk => [chunk.chunkKey, chunk]) ?? []), !sharedResources, options.resourceAccount);
}
