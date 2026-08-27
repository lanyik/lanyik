import {
    InstancedMesh,
    InstancedBufferAttribute,
    Matrix4,
    Group,
    DynamicDrawUsage,
    Mesh,
    Vector3,
    Object3D,
    BufferGeometry,
    Material
} from "three";
import pointInPolygon from "robust-point-in-polygon";

import { HEXPolygon, getHexCenter } from "../helpers/helpers";
import { forEachMapTile } from "../helpers/mapData";
import { loadModel } from "../helpers/models";
import { MapInfo, Point } from "../interfaces";
import { getMapTile } from "../helpers/topology";
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
import {
    BufferUpdateRange,
    commitBufferAttributeRanges,
    GpuTileStateChange
} from "../rendering/BufferUpdateBatch";
import {
    WorldVegetationForestChunkLayout,
    WorldVegetationForestLodLayout,
    WorldVegetationLayout
} from "../world/generateVegetation";

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
    originalMatrices: Float32Array;
}

interface ForestChunkRecord {
    chunkKey: string;
    modelPath: string;
    root: Group;
    instancedMeshes: InstancedMesh[];
    tiles: Point[];
    lod?: WorldChunkLod;
    lodCache: Map<WorldChunkLod, ForestLodCache>;
}

interface ForestLodCache {
    instanceCount: number;
    matrices: Float32Array;
    ranges: Map<string, { start: number, count: number, originalMatrices: Float32Array }>;
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
    preparedChunks: ReadonlyMap<string, WorldVegetationForestChunkLayout>;
}

interface PreparedForestPart {
    geometry: BufferGeometry;
    material: Material | Material[];
}

const HIDDEN_TREE_MATRIX = new Float32Array([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 1
]);

function writeHiddenMatrices(target: Float32Array, start: number, count: number): void {
    for (let index = start; index < start + count; index += 1) {
        target.set(HIDDEN_TREE_MATRIX, index * 16);
    }
}

//One cache per HexMap load session. Every resident source chunk using the same
//tree species shares the baked glTF geometry/material instead of cloning it
//again on every mount.
export class ForestSharedResources {
    private readonly models = new Map<string, Promise<PreparedForestPart[]>>();
    private readonly geometries = new Set<BufferGeometry>();
    private disposed = false;

    public prepare(modelPath: string): Promise<PreparedForestPart[]> {
        if (this.disposed) return Promise.reject(new Error("ForestSharedResources has been disposed"));
        let pending = this.models.get(modelPath);
        if (!pending) {
            pending = loadModel(modelPath).then(({ scene, fixup }) => {
                const meshes: Mesh[] = [];
                scene.traverse(object => { if ((object as Mesh).isMesh) meshes.push(object as Mesh); });
                const parts = meshes.map(mesh => {
                    const geometry = mesh.geometry.clone();
                    geometry.applyMatrix4(mesh.matrixWorld);
                    geometry.applyMatrix4(fixup);
                    this.geometries.add(geometry);
                    return { geometry, material: mesh.material };
                });
                if (this.disposed) {
                    for (const part of parts) part.geometry.dispose();
                    throw new Error("ForestSharedResources was disposed while loading a model");
                }
                return parts;
            }).catch(reason => {
                this.models.delete(modelPath);
                throw reason;
            });
            this.models.set(modelPath, pending);
        }
        return pending;
    }

    public get preparedModelCount(): number {
        return this.models.size;
    }

    public get preparedGeometryCount(): number {
        return this.geometries.size;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const geometry of this.geometries) geometry.dispose();
        this.geometries.clear();
        this.models.clear();
    }
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
    private readonly fogStates = new Map<string, number>();
    private readonly suppressedTiles = new Set<string>();
    private lodBuilds = 0;

    constructor(
        private tileRanges: Map<string, TileTreeRange>,
        private fogDarkenFactor: number,
        private chunks: Map<string, ForestChunkRecord>,
        private context: ForestBuildContext,
        private resources: ForestSharedResources,
        private ownsResources: boolean
    ) {
        super();
        for (const record of chunks.values()) this.add(record.root);
    }

    public setFogState(x: number, y: number, state: number): void {
        this.setFogStates([{ x, y, state }]);
    }

    public setFogStates(changes: readonly GpuTileStateChange[]): void {
        const matrixUpdates = new Map<InstancedBufferAttribute, BufferUpdateRange[]>();
        const colorUpdates = new Map<InstancedBufferAttribute, BufferUpdateRange[]>();
        for (const { x, y, state } of changes) {
            const key = `${x},${y}`;
            this.fogStates.set(key, state);
            const range = this.tileRanges.get(key);
            if (!range) continue;
            const hidden = this.suppressedTiles.has(key) || state < 0.5;
            const shade = state < 1.5 ? this.fogDarkenFactor : 1;
            for (const mesh of range.instancedMeshes) {
                const matrices = mesh.instanceMatrix.array as Float32Array;
                if (hidden) writeHiddenMatrices(matrices, range.start, range.count);
                else matrices.set(range.originalMatrices, range.start * 16);
                const pendingMatrices = matrixUpdates.get(mesh.instanceMatrix) ?? [];
                pendingMatrices.push({ start: range.start * 16, count: range.count * 16 });
                matrixUpdates.set(mesh.instanceMatrix, pendingMatrices);

                if (!mesh.instanceColor) continue;
                (mesh.instanceColor.array as Float32Array)
                    .fill(shade, range.start * 3, (range.start + range.count) * 3);
                const pendingColors = colorUpdates.get(mesh.instanceColor) ?? [];
                pendingColors.push({ start: range.start * 3, count: range.count * 3 });
                colorUpdates.set(mesh.instanceColor, pendingColors);
            }
        }
        for (const [attribute, ranges] of matrixUpdates) commitBufferAttributeRanges(attribute, ranges);
        for (const [attribute, ranges] of colorUpdates) commitBufferAttributeRanges(attribute, ranges);
    }

    /** Hides one tile's instances without rebuilding or reloading its model. */
    public setTileSuppressed(x: number, y: number, suppressed: boolean): void {
        const key = `${x},${y}`;
        if (suppressed) this.suppressedTiles.add(key);
        else this.suppressedTiles.delete(key);
        const range = this.tileRanges.get(key);
        if (!range) return;
        const state = this.fogStates.get(key) ?? 2;
        const hidden = suppressed || state < 0.5;
        const shade = state < 1.5 ? this.fogDarkenFactor : 1;
        for (const mesh of range.instancedMeshes) {
            const matrices = mesh.instanceMatrix.array as Float32Array;
            if (hidden) writeHiddenMatrices(matrices, range.start, range.count);
            else matrices.set(range.originalMatrices, range.start * 16);
            commitBufferAttributeRanges(mesh.instanceMatrix, [{
                start: range.start * 16,
                count: range.count * 16
            }]);
            if (!mesh.instanceColor) continue;
            (mesh.instanceColor.array as Float32Array)
                .fill(shade, range.start * 3, (range.start + range.count) * 3);
            commitBufferAttributeRanges(mesh.instanceColor, [{
                start: range.start * 3,
                count: range.count * 3
            }]);
        }
    }

    public activateChunk(metadata: WorldChunkMetadata, lod: WorldChunkLod, objects: Object3D[]): void {
        const record = this.chunks.get(metadata.id);
        if (!record) return;
        if (record.lod !== lod) {
            let cached = record.lodCache.get(lod);
            if (!cached) {
                cached = this.buildChunkLod(record, lod);
                record.lodCache.set(lod, cached);
                this.lodBuilds += 1;
            }
            this.applyChunkLod(record, cached);
            record.lod = lod;
        }

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
        record.lodCache.clear();
        record.lod = undefined;
    }

    public disposeChunkGpu(metadata: WorldChunkMetadata): void {
        const record = this.chunks.get(metadata.id);
        if (!record) return;
        for (const mesh of record.instancedMeshes) mesh.dispose();
    }

    public get lodBuildCount(): number {
        return this.lodBuilds;
    }

    public dispose(): void {
        for (const record of this.chunks.values()) {
            for (const mesh of record.instancedMeshes) mesh.dispose();
        }
        this.tileRanges.clear();
        this.chunks.clear();
        if (this.ownsResources) this.resources.dispose();
    }

    private buildChunkLod(record: ForestChunkRecord, lod: WorldChunkLod): ForestLodCache {
        const prepared = this.context.preparedChunks
            .get(`${record.modelPath}\u0000${record.chunkKey}`)?.lods.find(candidate => candidate.lod === lod);
        if (prepared) return this.buildPreparedChunkLod(prepared);
        const {
            map, size, treesPerTile, treeScale, treeFootprint, polygon, waterOptions, coastOptions
        } = this.context;
        const density = Math.max(1, Math.round(treesPerTile * ([1, 0.5, 0.2] as const)[lod]));

        const matrix = new Matrix4();
        const scaleVector = new Vector3();
        const matrices = new Float32Array(record.tiles.length * density * 16);
        const ranges = new Map<string, { start: number, count: number, originalMatrices: Float32Array }>();
        let instance = 0;
        for (const tile of record.tiles) {
            const key = `${tile.x},${tile.y}`;
            const center = getHexCenter(tile.x, tile.y, size);
            const placed: Point[] = [];
            const tileStart = instance;
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
                matrix.toArray(matrices, instance * 16);
                instance++;
            }
            const count = instance - tileStart;
            ranges.set(key, {
                start: tileStart,
                count,
                originalMatrices: matrices.subarray(tileStart * 16, (tileStart + count) * 16)
            });
        }

        return { instanceCount: instance, matrices: matrices.slice(0, instance * 16), ranges };
    }

    private buildPreparedChunkLod(prepared: WorldVegetationForestLodLayout): ForestLodCache {
        const ranges = new Map<string, { start: number, count: number, originalMatrices: Float32Array }>();
        prepared.tiles.forEach((tile, index) => {
            const start = prepared.ranges[index * 2];
            const count = prepared.ranges[index * 2 + 1];
            ranges.set(`${tile.x},${tile.y}`, {
                start,
                count,
                originalMatrices: prepared.matrices.subarray(start * 16, (start + count) * 16)
            });
        });
        return { instanceCount: prepared.instanceCount, matrices: prepared.matrices, ranges };
    }

    private applyChunkLod(record: ForestChunkRecord, cached: ForestLodCache): void {
        for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
        for (const mesh of record.instancedMeshes) {
            (mesh.instanceMatrix.array as Float32Array).set(cached.matrices);
            (mesh.instanceColor?.array as Float32Array | undefined)?.fill(1, 0, cached.instanceCount * 3);
        }
        for (const [key, range] of cached.ranges) {
            const fogState = this.fogStates.get(key) ?? 2;
            const shade = fogState < 1.5 ? this.fogDarkenFactor : 1;
            if (this.suppressedTiles.has(key) || fogState < 0.5) {
                for (const mesh of record.instancedMeshes) {
                    writeHiddenMatrices(mesh.instanceMatrix.array as Float32Array, range.start, range.count);
                }
            }
            if (shade !== 1) for (const mesh of record.instancedMeshes) {
                (mesh.instanceColor?.array as Float32Array | undefined)
                    ?.fill(shade, range.start * 3, (range.start + range.count) * 3);
            }
            this.tileRanges.set(key, { instancedMeshes: record.instancedMeshes, ...range });
        }

        for (const mesh of record.instancedMeshes) {
            mesh.count = cached.instanceCount;
            commitBufferAttributeRanges(mesh.instanceMatrix, [{ start: 0, count: cached.instanceCount * 16 }]);
            if (mesh.instanceColor) {
                commitBufferAttributeRanges(mesh.instanceColor, [{ start: 0, count: cached.instanceCount * 3 }]);
            }
        }
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
    onlyTiles?: readonly Point[],
    sharedResources?: ForestSharedResources,
    preparedLayout?: WorldVegetationLayout
): Promise<ForestField | null> {
    const { size } = options;
    const treesPerTile = options.treesPerTile ?? 20;
    const defaultModel = options.treeModel ?? "Assets/models/pinia";
    const treeScale = options.treeScale ?? 1;
    const fogDarkenFactor = options.fogDarkenFactor ?? 0.45;
    if (treesPerTile <= 0) return null;

    //Wood is a tile *modifier* (TileInfo.modifiers, like "river"/"lake"/
    //"hill"), not its own field. City and lake tiles are skipped: city models
    //need a clear footprint, while a lake's dry shore rim is too thin to place
    //trees reliably (see Grass.ts's matching skip).
    const tilesByModel = new Map<string, Point[]>();
    const considerTile = (x: number, y: number): void => {
        const tile = getMapTile(map, x, y);
        if (!tile?.modifiers?.includes("wood") || tile.city || isLakeTile(tile)) return;
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
    const resources = sharedResources ?? new ForestSharedResources();
    let modelIndex = 0;

    for (const [modelPath, tiles] of tilesByModel) {
        const preparedParts = await resources.prepare(modelPath);
        if (preparedParts.length === 0) continue;

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
            chunkRecords.set(id, {
                chunkKey,
                modelPath,
                root,
                instancedMeshes,
                tiles: chunkTiles,
                lodCache: new Map()
            });
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
        coastOptions,
        preparedChunks: new Map(preparedLayout?.forest.map(chunk => [
            `${chunk.modelPath}\u0000${chunk.chunkKey}`,
            chunk
        ]) ?? [])
    }, resources, !sharedResources);
}
