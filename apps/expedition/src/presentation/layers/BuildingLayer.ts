import { BufferGeometry, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { collectObject3DResourceAllocations, getHexCenter, getWorldChunkBounds, groupTilesByWorldChunk, tagWorldChunk,
    type ResourceBudgetAccount, type WorldChunkLod, type WorldChunkMetadata, type WorldRenderChunkContext, type WorldRenderLayer, type WorldRenderLayerHost } from "three-hex-map";
import type { Building, Placement } from "../../core/construction/Industry";
import { createBuildingModels, BUILDING_MODULES, moduleFor, type BuildingModule } from "./buildingModels";
import { BuildingPreview } from "./BuildingPreview";

interface Module { x: number; y: number; rotation: number; role: BuildingModule }
interface Batch { mesh: InstancedMesh; modules: readonly Module[]; context: WorldRenderChunkContext; origin: { x: number; y: number } }

export class BuildingLayer implements WorldRenderLayer {
    public readonly id = "expedition-buildings";
    public readonly kinds = BUILDING_MODULES.map(role => `${this.id}-${role}`);
    private readonly models = createBuildingModels();
    private readonly empty = new BufferGeometry();
    private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2 });
    private readonly preview = new BuildingPreview(this.models);
    private readonly transform = new Object3D();
    private readonly contexts = new Map<string, WorldRenderChunkContext>();
    private readonly batches = new Map<string, Batch>();
    private modules = new Map<string, Module[]>();
    private buildings: readonly Building[] = [];
    private host: WorldRenderLayerHost | undefined;
    private placement: Placement | undefined;

    constructor(private readonly resources: ResourceBudgetAccount) {
        resources.acquireRequired("building-assets", {}, true, collectObject3DResourceAllocations([], [...this.models.values(), ...this.preview.geometries]));
    }
    public initialize(host: WorldRenderLayerHost): void {
        if (!host.surface) throw new Error("Building rendering requires a surface");
        this.host = host;
        this.indexModules();
        host.addObject(this.preview.root);
    }
    public setBuildings(buildings: readonly Building[]): void {
        const previous = new Map(this.buildings.map(building => [building.id, building]));
        const next = new Map(buildings.map(building => [building.id, building]));
        const affected = new Set<string>();
        const chunkSize = this.host?.source.chunkSize;
        if (chunkSize) for (const building of [...this.buildings, ...buildings]) {
            if (previous.has(building.id) && next.has(building.id)) continue;
            for (const key of groupTilesByWorldChunk(building.cells, chunkSize).keys()) affected.add(key);
        }
        this.buildings = buildings;
        this.indexModules();
        for (const key of affected) {
            const context = this.contexts.get(key);
            if (context) { this.removeBatches(context); this.createBatches(context); }
        }
    }
    public showPlacement(placement: Placement | undefined): void {
        this.placement = placement;
        this.preview.show(placement, this.host);
    }
    public mountChunk(context: WorldRenderChunkContext): void {
        const key = `${context.chunk.chunkX},${context.chunk.chunkY}`;
        this.contexts.set(key, context);
        this.createBatches(context);
    }
    public unmountChunk(context: WorldRenderChunkContext): void {
        this.removeBatches(context);
        this.contexts.delete(`${context.chunk.chunkX},${context.chunk.chunkY}`);
    }
    public activateLod(metadata: WorldChunkMetadata, _lod: WorldChunkLod, objects: Object3D[]) {
        const batch = this.batches.get(metadata.id);
        if (!batch) throw new Error("Building batch is missing");
        if (!batch.mesh.count) this.populate(batch);
        const bytes = batch.mesh.instanceMatrix.array.byteLength;
        return { geometries: [], resourceCost: { cpuBytes: bytes, gpuBytes: bytes, geometryBytes: bytes },
            disposeGpu: () => { for (const object of objects) (object as InstancedMesh).dispose(); } };
    }
    public releaseChunk(_metadata: WorldChunkMetadata, objects: Object3D[]): void {
        for (const object of objects) {
            const mesh = object as InstancedMesh;
            mesh.dispose();
            mesh.geometry = this.empty;
            mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(0), 16);
            mesh.count = 0;
            mesh.boundingBox = mesh.boundingSphere = null;
        }
    }
    public surfaceChanged(host: WorldRenderLayerHost): void {
        for (const context of this.contexts.values()) { this.removeBatches(context); this.createBatches(context); }
        this.preview.show(this.placement, host);
        host.invalidateVisibility();
    }
    public unloadWorld(host: WorldRenderLayerHost): void {
        host.removeObject(this.preview.root);
        this.preview.show(undefined, undefined);
        this.host = undefined;
        this.contexts.clear();
        this.modules.clear();
    }
    public dispose(): void {
        for (const batch of this.batches.values()) batch.mesh.dispose();
        this.batches.clear();
        this.preview.dispose();
        for (const geometry of this.models.values()) geometry.dispose();
        this.empty.dispose();
        this.material.dispose();
        this.resources.dispose();
    }
    private indexModules(): void {
        this.modules.clear();
        if (!this.host) return;
        const modules = this.buildings.flatMap(building => building.cells.map((cell, index) => ({
            ...cell, rotation: building.rotation, role: moduleFor(building.kind, index)
        })));
        this.modules = groupTilesByWorldChunk(modules, this.host.source.chunkSize);
    }
    private createBatches(context: WorldRenderChunkContext): void {
        const modules = this.modules.get(`${context.chunk.chunkX},${context.chunk.chunkY}`) ?? [];
        for (const [key, chunkModules] of groupTilesByWorldChunk(modules)) for (const role of BUILDING_MODULES) {
            const group = chunkModules.filter(module => module.role === role);
            if (!group.length) continue;
            const origin = getHexCenter(group[0].x, group[0].y, context.tileSize);
            const bounds = getWorldChunkBounds(group, context.tileSize, context.surface!.minimumHeight - context.tileSize,
                context.surface!.maximumHeight + context.tileSize * 2);
            const kind = `${this.id}-${role}`;
            const mesh = new InstancedMesh(this.empty, this.material, 0);
            mesh.name = `${kind}:${key}`;
            mesh.position.set(origin.x, 0, origin.y);
            tagWorldChunk(mesh, key, kind, { ...bounds, minX: bounds.minX - origin.x, maxX: bounds.maxX - origin.x,
                minZ: bounds.minZ - origin.y, maxZ: bounds.maxZ - origin.y });
            this.batches.set(mesh.name, { mesh, modules: group, context, origin });
            context.addObject(mesh);
        }
    }
    private removeBatches(context: WorldRenderChunkContext): void {
        for (const [id, batch] of this.batches) if (batch.context === context) {
            context.removeObject(batch.mesh);
            batch.mesh.dispose();
            this.batches.delete(id);
        }
    }
    private populate({ mesh, modules, context, origin }: Batch): void {
        const size = context.tileSize;
        mesh.geometry = this.models.get(modules[0].role)!;
        mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(modules.length * 16), 16);
        mesh.count = modules.length;
        modules.forEach((module, index) => {
            const center = getHexCenter(module.x, module.y, size);
            this.transform.position.set(center.x - origin.x, context.surface!.getTileCenterHeight(module.x, module.y) + size * 0.04, center.y - origin.y);
            this.transform.rotation.set(0, -module.rotation * Math.PI / 3, 0);
            this.transform.scale.setScalar(size);
            this.transform.updateMatrix();
            mesh.setMatrixAt(index, this.transform.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
    }
}
