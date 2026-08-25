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
    Group
} from "three";
import pointInPolygon from "robust-point-in-polygon";

import { HEXPolygon, getHexCenter } from "../helpers/helpers";
import { forEachMapTile } from "../helpers/mapData";
import { MapInfo, Point } from "../interfaces";
import { Land } from "../enums";
import { getMapTile } from "../helpers/topology";
import { SharedBaseInstancedBufferGeometry } from "../rendering/SharedBaseInstancedBufferGeometry";
import { waterEdgeValue, isInTileWater, isLakeTile, lakeNeighborEdgeValue, riverLakeMouthEdgeValue, riverSeaMouthEdgeValue, WaterClearanceOptions } from "../helpers/rivers";
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

export interface GrassOptions {
    size: number;
    density?: number;         // blades per tile, default 60
    bladeWidth?: number;      // world units, default size * 0.03
    bladeHeight?: number;     // world units, default size * 0.18
    heightVariation?: number; // 0..1 random per-blade height jitter, default 0.4
    windStrength?: number;    // tip sway distance in world units, default bladeHeight * 0.35
    windSpeed?: number;       // default 1.2
    colorBase?: ColorRepresentation; // root color, default a darker green
    colorTip?: ColorRepresentation;  // tip color, default a lighter green
    fogDarkenFactor?: number; // color multiplier for Explored fog tiles, default 0.45 - see FogOfWar.ts

    //River/lake water clearance (see helpers/rivers.ts's isInTileWater):
    //blades sit at a flat y=0 baseline, so anything inside the painted water
    //(including its noise-bent bulges) would stand in the river/lake. Same
    //fractions-of-tile-radius values as the map's options - keep them in sync.
    riverWidth?: number;     // default 0.28
    riverBankWidth?: number; // default 0.14
    riverCurvature?: number; // default 0.5
    lakeShoreWidth?: number; // default 0.18
}

interface TileBladeRange { geometry: InstancedBufferGeometry, start: number, count: number }

interface GrassLodCache {
    geometry: InstancedBufferGeometry;
    ranges: { key: string, start: number, count: number }[];
}

interface GrassChunkRecord {
    mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
    tiles: { x: number, y: number }[];
    lod?: WorldChunkLod;
    lodCache: Map<WorldChunkLod, GrassLodCache>;
}

interface ResolvedGrassOptions {
    size: number;
    density: number;
    bladeWidth: number;
    bladeHeight: number;
    heightVariation: number;
    waterOptions: WaterClearanceOptions;
}

export class GrassSharedResources {
    public readonly blade = buildBladeGeometry();
    public readonly material: RawShaderMaterial;
    private clock = 0;
    private disposed = false;

    constructor(options: GrassOptions) {
        const bladeHeight = options.bladeHeight ?? options.size * 0.18;
        this.material = new RawShaderMaterial({
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
                fogDarkenFactor: { value: options.fogDarkenFactor ?? 0.45 }
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
    private lodBuilds = 0;

    constructor(
        private map: MapInfo,
        private chunks: Map<string, GrassChunkRecord>,
        public readonly resources: GrassSharedResources,
        private options: ResolvedGrassOptions,
        private ownsResources: boolean
    ) {
        super();
        for (const record of chunks.values()) this.add(record.mesh);
    }

    //Updates every blade belonging to (x, y) to the given fog state (see
    //FogOfWar.ts) - a plain attribute-slice fill + needsUpdate, no rebuild.
    //No-op for tiles with no grass (city tiles, non-"land" terrain).
    public setFogState(x: number, y: number, state: number): void {
        const key = `${x},${y}`;
        this.fogStates.set(key, state);
        const range = this.tileRanges.get(key);
        if (!range) return;

        const attribute = range.geometry.getAttribute("fogState") as InstancedBufferAttribute;
        for (let i = 0; i < range.count; i++) attribute.setX(range.start + i, state);
        attribute.addUpdateRange(range.start, range.count);
        attribute.needsUpdate = true;
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
        if (record.lod === lod && record.mesh.geometry.getAttribute("position")) return record.mesh.geometry;

        this.removeTileRanges(record);
        let cached = record.lodCache.get(lod);
        if (!cached) {
            cached = this.buildChunkGeometry(
                record.tiles,
                lod,
                { x: record.mesh.position.x, y: record.mesh.position.z }
            );
            record.lodCache.set(lod, cached);
            this.lodBuilds += 1;
        }
        const previous = record.mesh.geometry;
        record.mesh.geometry = cached.geometry;
        if (record.lod === undefined && !previous.getAttribute("position")) previous.dispose();
        const fogAttribute = cached.geometry.getAttribute("fogState") as InstancedBufferAttribute;
        for (const range of cached.ranges) {
            const state = this.fogStates.get(range.key) ?? 2;
            for (let index = 0; index < range.count; index += 1) {
                fogAttribute.setX(range.start + index, state);
            }
            this.tileRanges.set(range.key, { geometry: cached.geometry, start: range.start, count: range.count });
        }
        fogAttribute.needsUpdate = true;
        record.lod = lod;
        return record.mesh.geometry;
    }

    public releaseChunk(metadata: WorldChunkMetadata): void {
        const record = this.chunks.get(metadata.id);
        if (!record || record.lod === undefined) return;
        this.removeTileRanges(record);
        for (const cached of record.lodCache.values()) cached.geometry.dispose();
        record.lodCache.clear();
        record.mesh.geometry = new InstancedBufferGeometry();
        record.lod = undefined;
    }

    public get lodBuildCount(): number {
        return this.lodBuilds;
    }

    private removeTileRanges(record: GrassChunkRecord): void {
        for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
    }

    private buildChunkGeometry(
        chunkTiles: { x: number, y: number }[],
        lod: WorldChunkLod,
        origin: Point
    ): GrassLodCache {
        const { size, bladeWidth, bladeHeight, heightVariation, waterOptions } = this.options;
        const densityScale = ([1, 0.38, 0.14] as const)[lod];
        const density = Math.max(1, Math.round(this.options.density * densityScale));
        const totalBlades = chunkTiles.length * density;
        const offsets = new Float32Array(totalBlades * 2);
        const tileOffsets = new Float32Array(totalBlades * 2);
        const angles = new Float32Array(totalBlades);
        const scales = new Float32Array(totalBlades * 2);
        const phases = new Float32Array(totalBlades);
        const shades = new Float32Array(totalBlades);
        const fogStates = new Float32Array(totalBlades);
        const polygon = HEXPolygon({ x: 0, y: 0 }, size * 0.8).map(p => [p.x, p.y]);
        const pendingRanges: { key: string, start: number, count: number }[] = [];

        let instance = 0;
        for (const tile of chunkTiles) {
            const key = `${tile.x},${tile.y}`;
            const center = getHexCenter(tile.x, tile.y, size);
            const tileStart = instance;
            const waterValue = waterEdgeValue(this.map, tile.x, tile.y);
            const seaMouthValue = riverSeaMouthEdgeValue(this.map, tile.x, tile.y);
            const lakeMouthValue = riverLakeMouthEdgeValue(this.map, tile.x, tile.y);
            const lakeNeighborValue = lakeNeighborEdgeValue(this.map, tile.x, tile.y);

            for (let i = 0; i < density; i++) {
                let lx = 0, ly = 0, attempts = 0, valid = false;
                while (!valid && attempts < 20) {
                    lx = (stableRandom(tile.x, tile.y, i * 97 + attempts * 2) * 2 - 1) * size;
                    ly = (stableRandom(tile.x, tile.y, i * 97 + attempts * 2 + 1) * 2 - 1) * size;
                    valid = pointInPolygon(polygon, [lx, ly]) === -1
                        && !isInTileWater(lx, ly, waterValue, size, waterOptions, seaMouthValue, lakeMouthValue, lakeNeighborValue);
                    attempts++;
                }
                if (!valid) continue;

                offsets[instance * 2] = center.x + lx - origin.x;
                offsets[instance * 2 + 1] = center.y + ly - origin.y;
                tileOffsets[instance * 2] = center.x - origin.x;
                tileOffsets[instance * 2 + 1] = center.y - origin.y;
                angles[instance] = stableRandom(tile.x, tile.y, i * 97 + 41) * Math.PI * 2;
                const heightJitter = 1 - heightVariation * 0.5
                    + stableRandom(tile.x, tile.y, i * 97 + 43) * heightVariation;
                scales[instance * 2] = bladeWidth * (0.8 + stableRandom(tile.x, tile.y, i * 97 + 47) * 0.4);
                scales[instance * 2 + 1] = bladeHeight * heightJitter;
                phases[instance] = stableRandom(tile.x, tile.y, i * 97 + 53) * Math.PI * 2;
                shades[instance] = 0.75 + stableRandom(tile.x, tile.y, i * 97 + 59) * 0.35;
                fogStates[instance] = this.fogStates.get(key) ?? 2;
                instance++;
            }

            pendingRanges.push({ key, start: tileStart, count: instance - tileStart });
        }

        const geometry = new SharedBaseInstancedBufferGeometry(this.resources.blade, ["position"]);
        geometry.instanceCount = instance;
        geometry.setAttribute("offset", new InstancedBufferAttribute(offsets, 2));
        geometry.setAttribute("tileOffset", new InstancedBufferAttribute(tileOffsets, 2));
        geometry.setAttribute("angle", new InstancedBufferAttribute(angles, 1));
        geometry.setAttribute("scale", new InstancedBufferAttribute(scales, 2));
        geometry.setAttribute("phase", new InstancedBufferAttribute(phases, 1));
        geometry.setAttribute("shade", new InstancedBufferAttribute(shades, 1));
        geometry.setAttribute("fogState", new InstancedBufferAttribute(fogStates, 1));

        return { geometry, ranges: pendingRanges };
    }

    public dispose(): void {
        for (const record of this.chunks.values()) {
            const geometries = new Set<InstancedBufferGeometry>([
                record.mesh.geometry,
                ...[...record.lodCache.values()].map(cached => cached.geometry)
            ]);
            for (const geometry of geometries) geometry.dispose();
            record.lodCache.clear();
        }
        if (this.ownsResources) this.resources.dispose();
    }
}

function stableRandom(x: number, y: number, salt: number): number {
    let value = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b)
        ^ Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2f)
        ^ Math.imul(salt ^ 0x165667b1, 0x85ebca77);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x100000000;
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
    sharedResources?: GrassSharedResources
): GrassField | null {
    const { size } = options;
    const density = options.density ?? 60;
    if (density <= 0) return null;

    const bladeWidth = options.bladeWidth ?? size * 0.03;
    const bladeHeight = options.bladeHeight ?? size * 0.18;
    const heightVariation = options.heightVariation ?? 0.4;

    //Lake tiles are skipped outright: with the waterline's noise wobble the
    //remaining dry shore rim is too thin to reliably place blades in (and the
    //10-attempt rejection fallback below would end up dropping them in the
    //water). River tiles keep their grass - the banks are wide enough.
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
                getWorldChunkBounds(chunkTiles, size, 0, bladeHeight * (1 + heightVariation)),
                origin
            )
        );
        chunks.set(`grass:${chunkKey}`, { mesh: chunk, tiles: chunkTiles, lodCache: new Map() });
    }

    return new GrassField(map, chunks, resources, {
        size,
        density,
        bladeWidth,
        bladeHeight,
        heightVariation,
        waterOptions
    }, !sharedResources);
}
