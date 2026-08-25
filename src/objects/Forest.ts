import {
    InstancedMesh,
    InstancedBufferAttribute,
    Matrix4,
    Group,
    DynamicDrawUsage,
    Mesh,
    Vector3,
    Object3D
} from "three";
import pointInPolygon from "robust-point-in-polygon";

import { HEXPolygon, getHexCenter } from "../helpers/helpers";
import { forEachMapTile } from "../helpers/mapData";
import { loadModel } from "../helpers/models";
import { MapInfo, Point } from "../interfaces";
import { waterEdgeValue, isInTileWater, isLakeTile, lakeNeighborEdgeValue, riverLakeMouthEdgeValue, riverSeaMouthEdgeValue, WaterClearanceOptions } from "../helpers/rivers";
import { isInCoastalShore, isInLakeShore, CoastClearanceOptions } from "../helpers/coast";
import {
    getWorldChunkBounds,
    getWorldChunkOrigin,
    groupTilesByWorldChunk,
    localizeWorldChunkBounds,
    tagWorldChunk,
    WorldChunkLod,
    WorldChunkMetadata
} from "../helpers/chunks";

export interface ForestOptions {
    size: number;
    treesPerTile?: number;
    treeModel?: string; // model folder path (see helpers/models.ts), default "Assets/models/pinia"
    treeScale?: number; // extra multiplier on top of the model's own info.json scale, default 1
    fogDarkenFactor?: number; // instance-color multiplier for Explored fog tiles, default 0.45 - see FogOfWar.ts

    //River/lake water clearance on wood+river tiles (see helpers/rivers.ts's
    //isInTileWater and GrassOptions' matching fields): trees sit at y=0, so
    //anything inside the painted water (noise-bent bulges included) would
    //stand in the river/lake. Same fractions-of-tile-radius values as the
    //map's options - keep them in sync.
    riverWidth?: number;     // default 0.28
    riverBankWidth?: number; // default 0.14
    riverCurvature?: number; // default 0.5
    lakeShoreWidth?: number; // default 0.18

    //Curved coastline clearance: mirrors terrain.fragment.ts's land-side
    //painted beach/water band so trees do not spawn in the visual shore.
    beachWidth?: number;           // default 0.35
    waterCornerRounding?: number;  // default 0.4
    coastCurvature?: number;       // default 0.5
}

//Instances belonging to one tile's trees, all drawn by the same model group's
//InstancedMeshes (see createForest) - kept around so setFogState() can hide
//(Unseen), darken (Explored) or restore (Visible) them without a rebuild.
interface TileTreeRange {
    instancedMeshes: InstancedMesh[];
    start: number;
    count: number;
    originalMatrices: Matrix4[];
}

interface ForestChunkRecord {
    root: Group;
    instancedMeshes: InstancedMesh[];
    tiles: Point[];
    lod?: WorldChunkLod;
}

interface ForestBuildContext {
    map: MapInfo;
    size: number;
    treesPerTile: number;
    treeScale: number;
    treeFootprint: number;
    polygon: number[][];
    waterOptions: WaterClearanceOptions;
    coastOptions: CoastClearanceOptions;
}

//----------------------------------------------------------------------------------
//Thin Group subclass so the forest can expose setFogState() per tile (see
//FogOfWar.ts) alongside the InstancedMeshes createForest() fills it with.
//Hiding a tile's trees zero-scales their matrices (setFogState() keeps the
//original matrices around to restore, since InstancedMesh has no "get the
//matrix I set earlier" API once overwritten); darkening uses each
//InstancedMesh's own instanceColor attribute, a plain built-in three.js
//feature that any GLTFLoader-produced Standard/Physical/Lambert/Phong
//material already multiplies its color by, no shader changes needed here.
//----------------------------------------------------------------------------------
export class ForestField extends Group {
    private readonly hiddenMatrix = new Matrix4().makeScale(0, 0, 0);
    private readonly fogStates = new Map<string, number>();

    constructor(
        private tileRanges: Map<string, TileTreeRange>,
        private fogDarkenFactor: number,
        private chunks: Map<string, ForestChunkRecord>,
        private context: ForestBuildContext
    ) {
        super();
        for (const record of chunks.values()) this.add(record.root);
    }

    public setFogState(x: number, y: number, state: number): void {
        const key = `${x},${y}`;
        this.fogStates.set(key, state);
        const range = this.tileRanges.get(key);
        if (!range) return;

        const hidden = state < 0.5;
        const shade = state < 1.5 ? this.fogDarkenFactor : 1;

        for (const instancedMesh of range.instancedMeshes) {
            for (let i = 0; i < range.count; i++) {
                const idx = range.start + i;
                instancedMesh.setMatrixAt(idx, hidden ? this.hiddenMatrix : range.originalMatrices[i]);
                instancedMesh.instanceColor?.setXYZ(idx, shade, shade, shade);
            }
            instancedMesh.instanceMatrix.needsUpdate = true;
            if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        }
    }

    public activateChunk(metadata: WorldChunkMetadata, lod: WorldChunkLod, objects: Object3D[]): void {
        const record = this.chunks.get(metadata.id);
        if (!record) return;
        if (record.lod !== lod) this.populateChunk(record, lod);

        //World copies share matrices/colors, but InstancedMesh.count is a plain
        //number. Mirror it into every visible clone after a lazy build or LOD
        //change so all toroidal images draw the same number of trees.
        for (const object of objects) {
            const copies: InstancedMesh[] = [];
            object.traverse(child => {
                if ((child as InstancedMesh).isInstancedMesh) copies.push(child as InstancedMesh);
            });
            copies.forEach((copy, index) => {
                const source = record.instancedMeshes[index];
                if (source) copy.count = source.count;
            });
        }
    }

    public releaseChunk(metadata: WorldChunkMetadata): void {
        const record = this.chunks.get(metadata.id);
        if (!record || record.lod === undefined) return;
        for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
        for (const mesh of record.instancedMeshes) mesh.count = 0;
        record.lod = undefined;
    }

    public dispose(): void {
        const geometries = new Set<InstancedMesh["geometry"]>();
        for (const record of this.chunks.values()) {
            for (const mesh of record.instancedMeshes) geometries.add(mesh.geometry);
        }
        for (const geometry of geometries) geometry.dispose();
        this.tileRanges.clear();
        this.chunks.clear();
    }

    private populateChunk(record: ForestChunkRecord, lod: WorldChunkLod): void {
        const {
            map, size, treesPerTile, treeScale, treeFootprint, polygon, waterOptions, coastOptions
        } = this.context;
        const density = Math.max(1, Math.round(treesPerTile * ([1, 0.5, 0.2] as const)[lod]));
        for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);

        const matrix = new Matrix4();
        const scaleVector = new Vector3();
        let instance = 0;
        for (const tile of record.tiles) {
            const key = `${tile.x},${tile.y}`;
            const center = getHexCenter(tile.x, tile.y, size);
            const placed: Point[] = [];
            const tileStart = instance;
            const originalMatrices: Matrix4[] = [];
            let attempts = 0;
            const waterValue = waterEdgeValue(map, tile.x, tile.y);
            const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
            const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
            const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);

            while (placed.length < density && attempts < density * 20) {
                const salt = attempts++ * 17;
                const lx = (stableRandom(tile.x, tile.y, salt) * 2 - 1) * size;
                const ly = (stableRandom(tile.x, tile.y, salt + 1) * 2 - 1) * size;
                if (pointInPolygon(polygon, [lx, ly]) !== -1) continue;
                if (isInTileWater(lx, ly, waterValue, size, waterOptions, seaMouthValue, lakeMouthValue, lakeNeighborValue)) continue;
                if (isInCoastalShore(map, tile.x, tile.y, lx, ly, center.x + lx, center.y + ly, size, coastOptions)) continue;
                if (isInLakeShore(map, tile.x, tile.y, lx, ly, center.x + lx, center.y + ly, size, coastOptions)) continue;
                if (placed.some(p => Math.abs(p.x - lx) < treeFootprint && Math.abs(p.y - ly) < treeFootprint)) continue;

                placed.push({ x: lx, y: ly });
                const scale = treeScale * (0.8 + stableRandom(tile.x, tile.y, salt + 3) * 0.4);
                matrix.makeRotationY(stableRandom(tile.x, tile.y, salt + 5) * Math.PI * 2);
                matrix.scale(scaleVector.set(scale, scale, scale));
                matrix.setPosition(
                    center.x + lx - record.root.position.x,
                    0,
                    center.y + ly - record.root.position.z
                );
                originalMatrices.push(matrix.clone());
                const fogState = this.fogStates.get(key) ?? 2;
                const shade = fogState < 1.5 ? this.fogDarkenFactor : 1;
                for (const mesh of record.instancedMeshes) {
                    mesh.setMatrixAt(instance, fogState < 0.5 ? this.hiddenMatrix : matrix);
                    mesh.instanceColor?.setXYZ(instance, shade, shade, shade);
                }
                instance++;
            }
            this.tileRanges.set(key, {
                instancedMeshes: record.instancedMeshes,
                start: tileStart,
                count: instance - tileStart,
                originalMatrices
            });
        }

        for (const mesh of record.instancedMeshes) {
            mesh.count = instance;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        record.lod = lod;
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

//----------------------------------------------------------------------------------
//Replaces the old procedurally-generated cone trees with instances of real glTF
//models (see helpers/models.ts) - each wood tile can pick its own tree species
//via TileInfo.treeModel, falling back to options.treeModel, so a map can mix e.g.
//oak/pinia/palm freely. Tiles are grouped by their resolved model path and one
//set of InstancedMeshes is built per group (a tree model like pinia.glb typically
//has several parts - trunk, foliage - as separate meshes/materials, so this
//builds one InstancedMesh per part, not per model, all parts sharing the same
//per-tree transform - see the shared `matrix` written to every part below).
//Each part's own offset within the model (its node transform in the glTF) plus
//the model's info.json fine-tuning (fixup, see loadModel) is baked into its
//geometry once, since InstancedMesh only applies one transform per instance.
//
//Returns null if the map has no wood tiles.
//----------------------------------------------------------------------------------
export async function createForest(
    map: MapInfo,
    options: ForestOptions,
    onlyTiles?: readonly Point[]
): Promise<ForestField | null> {
    const { size } = options;
    const treesPerTile = options.treesPerTile ?? 20;
    const defaultModel = options.treeModel ?? "Assets/models/pinia";
    const treeScale = options.treeScale ?? 1;
    const fogDarkenFactor = options.fogDarkenFactor ?? 0.45;
    if (treesPerTile <= 0) return null;

    //Wood is a tile *modifier* (TileInfo.modifiers, like "river"/"lake"/
    //"hill"), not its own field. Lake tiles are skipped even if marked wood -
    //the dry shore rim is too thin to reliably place trees in (see Grass.ts's
    //matching skip).
    const tilesByModel = new Map<string, Point[]>();
    const considerTile = (x: number, y: number): void => {
        const tile = map.data[x]?.[y];
        if (!tile?.modifiers?.includes("wood") || isLakeTile(tile)) return;
        const modelPath = tile.treeModel ?? defaultModel;
        const tiles = tilesByModel.get(modelPath) ?? [];
        tiles.push({ x, y });
        tilesByModel.set(modelPath, tiles);
    };
    if (onlyTiles) {
        for (const point of onlyTiles) considerTile(point.x, point.y);
    } else {
        forEachMapTile(map, (_tile, x, y) => considerTile(x, y));
    }
    if (tilesByModel.size === 0) return null;

    // polygon slightly shrunk from the hex boundary, same as the old WOOD()
    const treeFootprint = Math.max(1, Math.round(size / 10));
    const polygon = HEXPolygon({ x: 0, y: 0 }, size - treeFootprint).map(p => [p.x, p.y]);
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

    const tileRanges = new Map<string, TileTreeRange>();
    const chunkRecords = new Map<string, ForestChunkRecord>();
    let modelIndex = 0;

    for (const [modelPath, tiles] of tilesByModel) {
        const { scene, fixup } = await loadModel(modelPath);

        const meshes: Mesh[] = [];
        scene.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
        if (meshes.length === 0) continue;

        //Prepare each model part once, then share its baked geometry across
        //small spatial chunks. Each chunk remains an InstancedMesh, but Three
        //can now reject off-screen chunks instead of drawing every tree in all
        //nine toroidal images.
        const preparedParts = meshes.map(mesh => {
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld); // bake this part's offset within the model
            geometry.applyMatrix4(fixup);             // bake the model's own info.json fine-tuning
            return { geometry, material: mesh.material };
        });

        const chunks = groupTilesByWorldChunk(tiles);

        for (const [chunkKey, chunkTiles] of chunks) {
            const totalInstances = chunkTiles.length * treesPerTile;
            const root = new Group();
            const origin = getWorldChunkOrigin(chunkKey, size);
            root.position.set(origin.x, 0, origin.y);
            root.name = `forest-chunk-${chunkKey}-${modelIndex}`;
            const instancedMeshes = preparedParts.map(({ geometry, material }, partIndex) => {
                const instancedMesh = new InstancedMesh(geometry, material, totalInstances);
                instancedMesh.name = `forest-${chunkKey}-${partIndex}`;
                instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
                instancedMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(totalInstances * 3).fill(1), 3);
                instancedMesh.count = 0;
                instancedMesh.frustumCulled = false;
                root.add(instancedMesh);
                return instancedMesh;
            });
            const id = `forest:${chunkKey}:${modelIndex}`;
            tagWorldChunk(
                root,
                chunkKey,
                "forest",
                localizeWorldChunkBounds(getWorldChunkBounds(chunkTiles, size, 0, size * 3), origin),
                id
            );
            chunkRecords.set(id, { root, instancedMeshes, tiles: chunkTiles });
        }
        modelIndex += 1;
    }

    return new ForestField(tileRanges, fogDarkenFactor, chunkRecords, {
        map,
        size,
        treesPerTile,
        treeScale,
        treeFootprint,
        polygon,
        waterOptions,
        coastOptions
    });
}
