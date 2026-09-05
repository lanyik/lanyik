import {
    Box3,
    InstancedMesh,
    InstancedBufferAttribute,
    Group,
    DynamicDrawUsage,
    Mesh,
    Object3D,
    BufferGeometry,
    Material,
    MeshLambertMaterial,
    Color,
    Texture
} from "three";

import { forEachMapTile } from "../helpers/mapData";
import { ModelAssetCache, ModelAssetLease } from "../helpers/models";
import { MapInfo, Point } from "../interfaces";
import { getMapTile } from "../helpers/topology";
import { isLakeTile, WaterClearanceOptions } from "../helpers/rivers";
import { CoastClearanceOptions } from "../helpers/coast";
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
    buildForestLod,
    WorldVegetationForestChunkLayout,
    WorldVegetationForestLodLayout,
    WorldVegetationLayout
} from "../world/generateVegetation";
import { WorldSurfaceView } from "../world/WorldSurfaceView";
import { collectCpuBufferAllocations, collectGeometryAllocations, ResourceBudgetAccount } from "../runtime/ResourceBudget";
import { forestLayoutAllocations, VegetationResources } from "../rendering/VegetationResources";

export interface ForestOptions {
    size: number;
    surface: WorldSurfaceView;
    resourceAccount?: ResourceBudgetAccount;
    treesPerTile?: number;
    treeModel?: string; // model folder path (see helpers/models.ts), default "Assets/models/pinia"
    treeScale?: number; // extra multiplier on top of the model's own info.json scale, default 1.6
    modelAssets?: ModelAssetCache;
    fogDarkenFactor?: number; // instance-color multiplier for Explored fog tiles, default 0.45 - see FogOfWar.ts

    //River/lake water clearance on wood+river tiles (see helpers/rivers.ts's
    //isInTileWater and GrassOptions' matching fields): exclude painted water
    //(noise-bent bulges included). Same fractions-of-tile-radius values as the
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
    mesh: InstancedMesh;
    start: number;
    count: number;
    originalMatrices: Float32Array;
}

interface ForestChunkRecord {
    chunkKey: string;
    modelPath: string;
    root: Group;
    instancedMeshes: InstancedMesh[];
    lodParts: readonly (readonly PreparedForestPart[])[];
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
    surface: WorldSurfaceView;
    size: number;
    treesPerTile: number;
    treeScale: number;
    waterOptions: WaterClearanceOptions;
    coastOptions: CoastClearanceOptions;
    preparedChunks: Map<string, WorldVegetationForestChunkLayout>;
}

interface PreparedForestPart {
    geometry: BufferGeometry;
    material: Material | Material[];
}

interface PreparedForestModel {
    readonly lods: readonly (readonly PreparedForestPart[])[];
}

interface ForestLodMetadata {
    middle: string;
    far: string;
}

type ForestMaterialSource = Material & {
    color?: Color;
    map?: Texture | null;
    lightMap?: Texture | null;
    lightMapIntensity?: number;
    aoMap?: Texture | null;
    aoMapIntensity?: number;
    emissive?: Color;
    emissiveIntensity?: number;
    emissiveMap?: Texture | null;
    alphaMap?: Texture | null;
    wireframe?: boolean;
    flatShading?: boolean;
    fog?: boolean;
    vertexColors?: boolean;
};

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

function readForestLodMetadata(modelPath: string, value: unknown): ForestLodMetadata {
    if (!value || typeof value !== "object") {
        throw new TypeError(`${modelPath}/info.json must define forestLods.middle and forestLods.far`);
    }
    const metadata = value as Record<string, unknown>;
    for (const level of ["middle", "far"] as const) {
        if (typeof metadata[level] !== "string" || metadata[level].trim().length === 0) {
            throw new TypeError(`${modelPath}/info.json forestLods.${level} must be a non-empty model path`);
        }
    }
    if (metadata.middle === modelPath || metadata.far === modelPath || metadata.middle === metadata.far) {
        throw new TypeError(`${modelPath}/info.json forestLods must reference two distinct LOD assets`);
    }
    return { middle: metadata.middle as string, far: metadata.far as string };
}

function readForestAlbedoScale(modelPath: string, value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 4) {
        throw new TypeError(`${modelPath}/info.json forestAlbedoScale must be in (0, 4]`);
    }
    return value;
}

function createForestMaterial(source: Material, albedoScale: number): MeshLambertMaterial {
    const input = source as ForestMaterialSource;
    if (!(input.color instanceof Color)) {
        throw new TypeError(`Forest material ${source.name || source.type} must expose a base color`);
    }
    const material = new MeshLambertMaterial({
        color: input.color.clone().multiplyScalar(albedoScale),
        map: input.map ?? null,
        lightMap: input.lightMap ?? null,
        lightMapIntensity: input.lightMapIntensity ?? 1,
        aoMap: input.aoMap ?? null,
        aoMapIntensity: input.aoMapIntensity ?? 1,
        emissive: input.emissive ?? 0x000000,
        emissiveIntensity: input.emissiveIntensity ?? 1,
        emissiveMap: input.emissiveMap ?? null,
        alphaMap: input.alphaMap ?? null,
        alphaTest: source.alphaTest,
        transparent: source.transparent,
        opacity: source.opacity,
        side: source.side,
        depthTest: source.depthTest,
        depthWrite: source.depthWrite,
        colorWrite: source.colorWrite,
        wireframe: input.wireframe ?? false,
        flatShading: input.flatShading ?? false,
        fog: input.fog ?? true,
        vertexColors: input.vertexColors ?? false
    });
    material.name = source.name ? `${source.name}:forest-lit` : "forest-lit";
    material.alphaHash = source.alphaHash;
    material.alphaToCoverage = source.alphaToCoverage;
    material.premultipliedAlpha = source.premultipliedAlpha;
    material.dithering = source.dithering;
    material.toneMapped = source.toneMapped;
    material.visible = source.visible;
    return material;
}

function prepareForestMaterials(
    source: Material | Material[],
    albedoScale: number,
    cache: Map<Material, Material>,
    created: Set<Material>
): Material | Material[] {
    const prepare = (material: Material): Material => {
        const cached = cache.get(material);
        if (cached) return cached;
        const lit = createForestMaterial(material, albedoScale);
        cache.set(material, lit);
        created.add(lit);
        return lit;
    };
    return Array.isArray(source) ? source.map(prepare) : prepare(source);
}

//One cache per HexMap load session. Every resident source chunk using the same
//tree species shares the baked glTF geometry/material instead of cloning it
//again on every mount.
export class ForestSharedResources {
    private readonly models = new Map<string, Promise<PreparedForestModel>>();
    private readonly geometries = new Set<BufferGeometry>();
    private readonly materials = new Set<Material>();
    private readonly assets = new Set<ModelAssetLease>();
    private readonly modelAssets: ModelAssetCache;
    private readonly ownsModelAssets: boolean;
    private disposed = false;
    private readonly retained: VegetationResources;

    constructor(modelAssets?: ModelAssetCache, resourceAccount?: ResourceBudgetAccount) {
        this.retained = new VegetationResources(resourceAccount);
        this.ownsModelAssets = modelAssets === undefined;
        this.modelAssets = modelAssets ?? new ModelAssetCache();
    }

    public prepare(modelPath: string): Promise<readonly (readonly PreparedForestPart[])[]> {
        if (this.disposed) return Promise.reject(new Error("ForestSharedResources has been disposed"));
        let pending = this.models.get(modelPath);
        if (!pending) {
            pending = this.modelAssets.acquire(modelPath).then(async baseAsset => {
                const acquired = [baseAsset];
                const createdGeometries = new Set<BufferGeometry>();
                const createdMaterials = new Set<Material>();
                try {
                    const metadata = readForestLodMetadata(modelPath, baseAsset.model.info.forestLods);
                    const albedoScale = readForestAlbedoScale(modelPath, baseAsset.model.info.forestAlbedoScale);
                    if (this.disposed) throw new Error("ForestSharedResources was disposed while loading a model");
                    const settled = await Promise.allSettled([
                        this.modelAssets.acquire(metadata.middle),
                        this.modelAssets.acquire(metadata.far)
                    ]);
                    for (const result of settled) if (result.status === "fulfilled") acquired.push(result.value);
                    const failure = settled.find(result => result.status === "rejected") as PromiseRejectedResult | undefined;
                    if (failure) throw failure.reason;

                    const meshesByLod = acquired.map(asset => {
                        const meshes: Mesh[] = [];
                        asset.model.scene.traverse(object => {
                            if ((object as Mesh).isMesh) meshes.push(object as Mesh);
                        });
                        return meshes;
                    });
                    const partCount = meshesByLod[0].length;
                    if (partCount === 0 || meshesByLod.some(meshes => meshes.length !== partCount)) {
                        throw new TypeError(`${modelPath} forest LOD assets must contain the same non-zero mesh count`);
                    }
                    const partNames = meshesByLod[0].map(mesh => mesh.name);
                    for (const meshes of meshesByLod) meshes.forEach((mesh, part) => {
                        if (mesh.name !== partNames[part]) {
                            throw new TypeError(`${modelPath} forest LOD assets must retain mesh order and names`);
                        }
                        if (!mesh.geometry.getAttribute("normal")) {
                            throw new TypeError(`${modelPath} forest LOD mesh ${mesh.name || part} must contain normals`);
                        }
                    });
                    const materialCache = new Map<Material, Material>();
                    const baseMaterials = meshesByLod[0].map(mesh =>
                        prepareForestMaterials(mesh.material, albedoScale, materialCache, createdMaterials)
                    );
                    const lods = meshesByLod.map((meshes, lod) => meshes.map((mesh, part) => {
                        const geometry = mesh.geometry.clone();
                        geometry.applyMatrix4(mesh.matrixWorld);
                        geometry.applyMatrix4(acquired[lod].model.fixup);
                        createdGeometries.add(geometry);
                        return { geometry, material: baseMaterials[part] };
                    }));
                    if (this.disposed) {
                        throw new Error("ForestSharedResources was disposed while loading a model");
                    }
                    this.retained.retain(modelPath, collectGeometryAllocations([...createdGeometries]));
                    for (const geometry of createdGeometries) this.geometries.add(geometry);
                    for (const material of createdMaterials) this.materials.add(material);
                    for (const asset of acquired) this.assets.add(asset);
                    return { lods };
                } catch (reason) {
                    for (const geometry of createdGeometries) geometry.dispose();
                    for (const material of createdMaterials) material.dispose();
                    for (const asset of acquired) asset.release();
                    throw reason;
                }
            }).catch(reason => {
                this.models.delete(modelPath);
                throw reason;
            });
            this.models.set(modelPath, pending);
        }
        return pending.then(model => model.lods);
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
        for (const material of this.materials) material.dispose();
        this.materials.clear();
        this.models.clear();
        for (const asset of this.assets) asset.release();
        this.assets.clear();
        this.retained.dispose();
        if (this.ownsModelAssets) this.modelAssets.dispose();
    }
}

//----------------------------------------------------------------------------------
//Thin Group subclass so the forest can expose setFogState() per tile (see
//FogOfWar.ts) alongside the InstancedMeshes createForest() fills it with.
//Hiding a tile's trees zero-scales their matrices (setFogState() keeps the
//original matrices around to restore, since InstancedMesh has no "get the
//matrix I set earlier" API once overwritten); darkening uses each
//InstancedMesh's own instanceColor attribute, which the shared light-reactive
//Lambert forest materials multiply without per-chunk shader variants.
//----------------------------------------------------------------------------------
export class ForestField extends Group {
    private readonly fogStates = new Map<string, number>();
    private readonly suppressedTiles = new Set<string>();
    private lodBuilds = 0;
    private readonly retained: VegetationResources;
    private disposed = false;

    constructor(
        private tileRanges: Map<string, TileTreeRange>,
        private fogDarkenFactor: number,
        private chunks: Map<string, ForestChunkRecord>,
        private context: ForestBuildContext,
        private resources: ForestSharedResources,
        private ownsResources: boolean,
        resourceAccount?: ResourceBudgetAccount
    ) {
        super();
        this.retained = new VegetationResources(resourceAccount);
        this.retained.retain("prepared", forestLayoutAllocations(context.preparedChunks.values()));
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
            const mesh = range.mesh;
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
        const mesh = range.mesh;
        const matrices = mesh.instanceMatrix.array as Float32Array;
        if (hidden) writeHiddenMatrices(matrices, range.start, range.count);
        else matrices.set(range.originalMatrices, range.start * 16);
        commitBufferAttributeRanges(mesh.instanceMatrix, [{
            start: range.start * 16,
            count: range.count * 16
        }]);
        if (!mesh.instanceColor) return;
        (mesh.instanceColor.array as Float32Array)
            .fill(shade, range.start * 3, (range.start + range.count) * 3);
        commitBufferAttributeRanges(mesh.instanceColor, [{
            start: range.start * 3,
            count: range.count * 3
        }]);
    }

    public activateChunk(metadata: WorldChunkMetadata, lod: WorldChunkLod, objects: Object3D[]): void {
        const record = this.chunks.get(metadata.id);
        if (!record) return;
        if (record.lod !== lod) {
            const parts = record.lodParts[lod];
            record.instancedMeshes.forEach((mesh, index) => {
                const part = parts[index];
                mesh.geometry = part.geometry;
                mesh.material = part.material;
            });
            let cached = record.lodCache.get(lod);
            if (!cached) {
                cached = this.buildChunkLod(record, lod);
                record.lodCache.set(lod, cached);
                this.retained.retain(`${metadata.id}:${lod}`, collectCpuBufferAllocations([cached.matrices]));
                this.lodBuilds += 1;
            }
            const first = record.instancedMeshes[0];
            if (first.instanceMatrix.count < cached.instanceCount) {
                this.replaceInstanceBuffers(record, cached.instanceCount, objects);
                this.retained.retain(`${metadata.id}:instances`, collectCpuBufferAllocations([
                    first.instanceMatrix.array, first.instanceColor!.array
                ]));
            }
            this.applyChunkLod(record, cached);
            record.lod = lod;
        }
        this.retained.pin(`${metadata.id}:${lod}`);
        for (const cachedLod of record.lodCache.keys()) {
            if (cachedLod !== lod && !this.retained.keepCached(`${metadata.id}:${cachedLod}`)) {
                record.lodCache.delete(cachedLod);
            }
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
                if (!source) return;
                copy.geometry = source.geometry;
                copy.material = source.material;
                copy.count = source.count;
                copy.instanceMatrix = source.instanceMatrix;
                copy.instanceColor = source.instanceColor;
            });
        }
    }

    public releaseChunk(metadata: WorldChunkMetadata, objects: readonly Object3D[] = []): void {
        const record = this.chunks.get(metadata.id);
        if (!record || record.lod === undefined) return;
        for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
        this.replaceInstanceBuffers(record, 0, objects);
        this.retained.release(`${metadata.id}:instances`);
        for (const lod of record.lodCache.keys()) this.retained.release(`${metadata.id}:${lod}`);
        record.lodCache.clear();
        record.lod = undefined;
    }

    private replaceInstanceBuffers(record: ForestChunkRecord, capacity: number, objects: readonly Object3D[]): void {
        const matrix = new InstancedBufferAttribute(new Float32Array(capacity * 16), 16).setUsage(DynamicDrawUsage);
        const color = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        const meshes = new Set(record.instancedMeshes);
        for (const object of objects) object.traverse(child => {
            if ((child as InstancedMesh).isInstancedMesh) meshes.add(child as InstancedMesh);
        });
        for (const mesh of meshes) {
            mesh.dispose();
            mesh.instanceMatrix = matrix;
            mesh.instanceColor = color;
            mesh.count = 0;
        }
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
        if (this.disposed) return;
        this.disposed = true;
        for (const record of this.chunks.values()) {
            for (const mesh of record.instancedMeshes) mesh.dispose();
        }
        this.tileRanges.clear();
        this.chunks.clear();
        this.context.preparedChunks.clear();
        this.fogStates.clear();
        this.suppressedTiles.clear();
        this.clear();
        this.retained.dispose();
        if (this.ownsResources) this.resources.dispose();
    }

    private buildChunkLod(record: ForestChunkRecord, lod: WorldChunkLod): ForestLodCache {
        const prepared = this.context.preparedChunks
            .get(`${record.modelPath}\u0000${record.chunkKey}`)?.lods.find(candidate => candidate.lod === lod);
        if (prepared) return this.buildPreparedChunkLod(record, prepared);
        const context = this.context;
        return this.buildPreparedChunkLod(record, buildForestLod(
            context.map, record.chunkKey, record.tiles, lod, context, context.waterOptions, context.coastOptions
        ));
    }

    private buildPreparedChunkLod(
        record: ForestChunkRecord,
        prepared: WorldVegetationForestLodLayout
    ): ForestLodCache {
        const ranges = new Map<string, { start: number, count: number, originalMatrices: Float32Array }>();
        const surfaceWindow = this.context.surface.createWindow();
        const counts = prepared.tiles.map((tile, index) => {
            const count = prepared.ranges[index * 2 + 1];
            return count === 0 ? 0 : Math.max(1, Math.round(
                count * surfaceWindow.getEffectiveVegetationDensity(tile.x, tile.y)
            ));
        });
        const matrices = new Float32Array(counts.reduce((sum, count) => sum + count, 0) * 16);
        let instanceCount = 0;
        prepared.tiles.forEach((tile, index) => {
            const preparedStart = prepared.ranges[index * 2];
            const count = counts[index];
            const start = instanceCount;
            const source = prepared.matrices.subarray(preparedStart * 16, (preparedStart + count) * 16);
            matrices.set(source, start * 16);
            for (let instance = start; instance < start + count; instance += 1) {
                const offset = instance * 16;
                matrices[offset + 13] = surfaceWindow.getWorldHeight(
                    matrices[offset + 12] + record.root.position.x,
                    matrices[offset + 14] + record.root.position.z
                );
            }
            instanceCount += count;
            ranges.set(`${tile.x},${tile.y}`, {
                start,
                count,
                originalMatrices: matrices.subarray(start * 16, (start + count) * 16)
            });
        });
        return { instanceCount, matrices, ranges };
    }

    private applyChunkLod(record: ForestChunkRecord, cached: ForestLodCache): void {
        for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
        const mesh = record.instancedMeshes[0];
        (mesh.instanceMatrix.array as Float32Array).set(cached.matrices);
        (mesh.instanceColor?.array as Float32Array | undefined)?.fill(1, 0, cached.instanceCount * 3);
        for (const [key, range] of cached.ranges) {
            const fogState = this.fogStates.get(key) ?? 2;
            const shade = fogState < 1.5 ? this.fogDarkenFactor : 1;
            if (this.suppressedTiles.has(key) || fogState < 0.5) {
                writeHiddenMatrices(mesh.instanceMatrix.array as Float32Array, range.start, range.count);
            }
            if (shade !== 1) {
                (mesh.instanceColor?.array as Float32Array | undefined)
                    ?.fill(shade, range.start * 3, (range.start + range.count) * 3);
            }
            this.tileRanges.set(key, { mesh, ...range });
        }

        for (const part of record.instancedMeshes) part.count = cached.instanceCount;
        commitBufferAttributeRanges(mesh.instanceMatrix, [{ start: 0, count: cached.instanceCount * 16 }]);
        if (mesh.instanceColor) {
            commitBufferAttributeRanges(mesh.instanceColor, [{ start: 0, count: cached.instanceCount * 3 }]);
        }
    }
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
//Each model supplies three topology-compatible geometry levels; LOD changes
//swap their shared geometry while retaining the same instance buffers.
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
    const { size, surface } = options;
    const treesPerTile = options.treesPerTile ?? 12;
    const defaultModel = options.treeModel ?? "Assets/models/pinia";
    const treeScale = options.treeScale ?? 1.6;
    const fogDarkenFactor = options.fogDarkenFactor ?? 0.45;
    if (treesPerTile <= 0 || treeScale === 0) return null;

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
    const resources = sharedResources ?? new ForestSharedResources(options.modelAssets, options.resourceAccount);
    let modelIndex = 0;

    try {
        for (const [modelPath, tiles] of tilesByModel) {
            const preparedLods = await resources.prepare(modelPath);
            const preparedParts = preparedLods[0];
            if (preparedParts.length === 0) continue;
            const modelBounds = new Box3();
            for (const parts of preparedLods) for (const { geometry } of parts) {
                if (!geometry.boundingBox) geometry.computeBoundingBox();
                modelBounds.union(geometry.boundingBox!);
            }
            const maximumScale = treeScale * 1.2;
            const canopyRadius = Math.hypot(
                Math.max(Math.abs(modelBounds.min.x), Math.abs(modelBounds.max.x)),
                Math.max(Math.abs(modelBounds.min.z), Math.abs(modelBounds.max.z))
            ) * maximumScale;

            const chunks = groupTilesByWorldChunk(tiles);

            for (const [chunkKey, chunkTiles] of chunks) {
                const root = new Group();
                const origin = getWorldChunkOrigin(chunkKey, size);
                root.position.set(origin.x, 0, origin.y);
                root.name = `forest-chunk-${chunkKey}-${modelIndex}`;
                const instancedMeshes = preparedParts.map(({ geometry, material }, partIndex) => {
                    const instancedMesh = new InstancedMesh(geometry, material, 0);
                    instancedMesh.name = `forest-${chunkKey}-${partIndex}`;
                    instancedMesh.count = 0;
                    instancedMesh.frustumCulled = false;
                    root.add(instancedMesh);
                    return instancedMesh;
                });
                const id = `forest:${chunkKey}:${modelIndex}`;
                const bounds = getWorldChunkBounds(chunkTiles, size,
                    surface.minimumHeight + Math.min(0, modelBounds.min.y * maximumScale),
                    surface.maximumHeight + Math.max(0, modelBounds.max.y * maximumScale));
                bounds.minX -= canopyRadius;
                bounds.maxX += canopyRadius;
                bounds.minZ -= canopyRadius;
                bounds.maxZ += canopyRadius;
                tagWorldChunk(
                    root,
                    chunkKey,
                    "forest",
                    localizeWorldChunkBounds(bounds, origin),
                    id
                );
                chunkRecords.set(id, {
                    chunkKey,
                    modelPath,
                    root,
                    instancedMeshes,
                    lodParts: preparedLods,
                    tiles: chunkTiles,
                    lodCache: new Map()
                });
            }
            modelIndex += 1;
        }

        return new ForestField(tileRanges, fogDarkenFactor, chunkRecords, {
            map,
            surface,
            size,
            treesPerTile,
            treeScale,
            waterOptions,
            coastOptions,
            preparedChunks: new Map(preparedLayout?.forest.map(chunk => [
                `${chunk.modelPath}\u0000${chunk.chunkKey}`,
                chunk
            ]) ?? [])
        }, resources, !sharedResources, options.resourceAccount);
    } catch (reason) {
        for (const record of chunkRecords.values()) {
            for (const mesh of record.instancedMeshes) mesh.dispose();
        }
        if (!sharedResources) resources.dispose();
        throw reason;
    }
}
