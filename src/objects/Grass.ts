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

import { getRandomInt, HEXPolygon, getHexCenter } from "../helpers/helpers";
import { MapInfo } from "../interfaces";
import { Land } from "../enums";
import { waterEdgeValue, isInTileWater, isLakeTile, lakeNeighborEdgeValue, riverLakeMouthEdgeValue, riverSeaMouthEdgeValue, WaterClearanceOptions } from "../helpers/rivers";
import { GRASS_VERTEX_SHADER } from "../shaders/grass.vertex";
import { GRASS_FRAGMENT_SHADER } from "../shaders/grass.fragment";
import { getWorldChunkBounds, groupTilesByWorldChunk, tagWorldChunk } from "../helpers/chunks";

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
    private grassMaterial: RawShaderMaterial;
    private clock = 0;

    constructor(
        private chunks: Mesh[],
        material: RawShaderMaterial,
        private tileRanges: Map<string, TileBladeRange>
    ) {
        super();
        this.grassMaterial = material;
        for (const chunk of chunks) this.add(chunk);
    }

    //Updates every blade belonging to (x, y) to the given fog state (see
    //FogOfWar.ts) - a plain attribute-slice fill + needsUpdate, no rebuild.
    //No-op for tiles with no grass (city tiles, non-"land" terrain).
    public setFogState(x: number, y: number, state: number): void {
        const range = this.tileRanges.get(`${x},${y}`);
        if (!range) return;

        const attribute = range.geometry.getAttribute("fogState") as InstancedBufferAttribute;
        for (let i = 0; i < range.count; i++) attribute.setX(range.start + i, state);
        attribute.needsUpdate = true;
    }

    //Advances the wind animation. `dtS` is the elapsed time in seconds since
    //the previous frame - call this once per frame (see HexMap's render loop).
    public update(dtS: number): void {
        this.clock += dtS;
        this.grassMaterial.uniforms.uTime.value = this.clock;
    }

    public setWorldCenter(x: number, y: number): void {
        this.grassMaterial.uniforms.worldCenter.value.set(x, y);
    }

    public get windStrength(): number {
        return this.grassMaterial.uniforms.windStrength.value;
    }
    public set windStrength(value: number) {
        this.grassMaterial.uniforms.windStrength.value = value;
    }

    public get windSpeed(): number {
        return this.grassMaterial.uniforms.windSpeed.value;
    }
    public set windSpeed(value: number) {
        this.grassMaterial.uniforms.windSpeed.value = value;
    }

    public dispose(): void {
        for (const chunk of this.chunks) chunk.geometry.dispose();
        this.grassMaterial.dispose();
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
export function createGrassField(map: MapInfo, options: GrassOptions): GrassField | null {
    const { size } = options;
    const density = options.density ?? 60;
    if (density <= 0) return null;

    const bladeWidth = options.bladeWidth ?? size * 0.03;
    const bladeHeight = options.bladeHeight ?? size * 0.18;
    const heightVariation = options.heightVariation ?? 0.4;
    const windStrength = options.windStrength ?? bladeHeight * 0.35;
    const windSpeed = options.windSpeed ?? 1.2;

    //Lake tiles are skipped outright: with the waterline's noise wobble the
    //remaining dry shore rim is too thin to reliably place blades in (and the
    //10-attempt rejection fallback below would end up dropping them in the
    //water). River tiles keep their grass - the banks are wide enough.
    const tiles: { x: number, y: number }[] = [];
    for (let x = 0; x < map.w; x++) {
        for (let y = 0; y < map.h; y++) {
            const tile = map.data[x]?.[y];
            if (tile?.type === Land.land && !tile.city && !isLakeTile(tile)) tiles.push({ x, y });
        }
    }
    if (tiles.length === 0) return null;

    // Shrunk somewhat from the true hex edge, since blades are placed at a flat
    // y=0 baseline while the land layer itself sinks its rim on coastal tiles
    // (see terrain.vertex.ts's beach slope) - keeping clear of the rim avoids
    // blades floating above/poking through that sunken edge.
    const polygon = HEXPolygon({ x: 0, y: 0 }, size * 0.8).map(p => [p.x, p.y]);
    // On river tiles, keep blades out of the water (its maximum noise-bent
    // reach included - see isInTileWater). Blades landing in the outer bank
    // strip are fine - it's a vegetation band.
    const waterOptions: WaterClearanceOptions = {
        riverWidth: options.riverWidth ?? 0.28,
        riverBankWidth: options.riverBankWidth ?? 0.14,
        riverCurvature: options.riverCurvature ?? 0.5,
        lakeShoreWidth: options.lakeShoreWidth ?? 0.18
    };

    const tileRanges = new Map<string, TileBladeRange>();
    const material = new RawShaderMaterial({
        uniforms: {
            worldOffset: { value: new Vector2(0, 0) },
            worldCenter: { value: new Vector2(0, 0) },
            //Toroidal placement is performed by physical chunk copies so the
            //shader keeps every blade attached to its canonical chunk.
            worldPeriod: { value: new Vector2(0, 0) },
            uTime: { value: 0 },
            windStrength: { value: windStrength },
            windSpeed: { value: windSpeed },
            colorBase: { value: new Color(options.colorBase ?? 0x3c6e2e) },
            colorTip: { value: new Color(options.colorTip ?? 0x8fce5a) },
            fogDarkenFactor: { value: options.fogDarkenFactor ?? 0.45 }
        },
        vertexShader: GRASS_VERTEX_SHADER,
        fragmentShader: GRASS_FRAGMENT_SHADER,
        side: DoubleSide
    });

    const chunks: Mesh[] = [];
    const blade = buildBladeGeometry();
    for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
        const totalBlades = chunkTiles.length * density;
        const offsets = new Float32Array(totalBlades * 2);
        const tileOffsets = new Float32Array(totalBlades * 2);
        const angles = new Float32Array(totalBlades);
        const scales = new Float32Array(totalBlades * 2);
        const phases = new Float32Array(totalBlades);
        const shades = new Float32Array(totalBlades);
        const fogStates = new Float32Array(totalBlades).fill(2);
        const pendingRanges: { key: string, start: number, count: number }[] = [];

        let instance = 0;
        for (const tile of chunkTiles) {
            const center = getHexCenter(tile.x, tile.y, size);
            const tileStart = instance;
            const waterValue = waterEdgeValue(map, tile.x, tile.y);
            const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
            const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
            const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);

            for (let i = 0; i < density; i++) {
                let lx = 0, ly = 0, attempts = 0, valid = false;
                while (!valid && attempts < 20) {
                    lx = getRandomInt(-size, size);
                    ly = getRandomInt(-size, size);
                    valid = pointInPolygon(polygon, [lx, ly]) === -1
                        && !isInTileWater(lx, ly, waterValue, size, waterOptions, seaMouthValue, lakeMouthValue, lakeNeighborValue);
                    attempts++;
                }
                if (!valid) continue;

                offsets[instance * 2 + 0] = center.x + lx;
                offsets[instance * 2 + 1] = center.y + ly;
                //Keep the owning center alongside the exact root so any future
                //shader-side wrapping still moves ground and decoration as one.
                tileOffsets[instance * 2 + 0] = center.x;
                tileOffsets[instance * 2 + 1] = center.y;
                angles[instance] = Math.random() * Math.PI * 2;

                const heightJitter = 1 - heightVariation * 0.5 + Math.random() * heightVariation;
                scales[instance * 2 + 0] = bladeWidth * (0.8 + Math.random() * 0.4);
                scales[instance * 2 + 1] = bladeHeight * heightJitter;
                phases[instance] = Math.random() * Math.PI * 2;
                shades[instance] = 0.75 + Math.random() * 0.35;
                instance++;
            }

            pendingRanges.push({ key: `${tile.x},${tile.y}`, start: tileStart, count: instance - tileStart });
        }

        const geometry = new InstancedBufferGeometry();
        //Keep the tiny base blade buffers private to this chunk: GPU-cache
        //eviction disposes chunk geometries independently, so sharing these
        //attributes would cause an inactive chunk to invalidate a visible
        //chunk's five-vertex base buffer as well.
        geometry.setAttribute("position", blade.getAttribute("position").clone());
        geometry.setIndex(blade.getIndex()?.clone() ?? null);
        geometry.instanceCount = instance;
        geometry.setAttribute("offset", new InstancedBufferAttribute(offsets, 2));
        geometry.setAttribute("tileOffset", new InstancedBufferAttribute(tileOffsets, 2));
        geometry.setAttribute("angle", new InstancedBufferAttribute(angles, 1));
        geometry.setAttribute("scale", new InstancedBufferAttribute(scales, 2));
        geometry.setAttribute("phase", new InstancedBufferAttribute(phases, 1));
        geometry.setAttribute("shade", new InstancedBufferAttribute(shades, 1));
        geometry.setAttribute("fogState", new InstancedBufferAttribute(fogStates, 1));

        for (const range of pendingRanges) tileRanges.set(range.key, { geometry, start: range.start, count: range.count });

        const chunk = new Mesh(geometry, material);
        chunk.name = `grass-chunk-${chunkKey}`;
        chunk.frustumCulled = false;
        tagWorldChunk(
            chunk,
            chunkKey,
            "grass",
            getWorldChunkBounds(chunkTiles, size, 0, bladeHeight * (1 + heightVariation))
        );
        chunks.push(chunk);
    }

    return new GrassField(chunks, material, tileRanges);
}
