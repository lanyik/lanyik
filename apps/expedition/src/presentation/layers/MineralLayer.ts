import { BufferGeometry, Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { collectObject3DResourceAllocations, getHexCenter, getMapTile, getWorldChunkBounds, getWorldChunkMetadata, groupTilesByWorldChunk, tagWorldChunk, WORLD_CHUNK_SIZE,
    type ResourceBudgetAccount, type WorldChunkLod, type WorldChunkMetadata, type WorldRenderChunkContext, type WorldRenderLayer, type WorldRenderLayerHost } from "three-hex-map";
import { MINERALS, type MineralNode } from "../../content/minerals";
import { MineralField } from "../../core/resources/MineralField";
import { toSurveyTerrain } from "../../adapters/surveyTerrain";

interface MineralBatch {
    readonly mesh: InstancedMesh;
    readonly nodes: readonly MineralNode[];
    readonly context: WorldRenderChunkContext;
    readonly origin: { x: number; y: number };
}
const ROCKS = [[0, 0, 0.21], [-0.27, 0.13, 0.14], [0.24, 0.17, 0.16], [0.09, -0.29, 0.12]] as const;

/** Render objects are disposable views; no mineral amounts are stored in their buffers. */
export class MineralLayer implements WorldRenderLayer {
    public readonly id = "expedition-minerals";
    private readonly geometry = new IcosahedronGeometry(1, 0);
    private readonly emptyGeometry = new BufferGeometry();
    private readonly material = new MeshStandardMaterial({ roughness: 0.9, metalness: 0.15, flatShading: true });
    private readonly batches = new Map<string, MineralBatch>();
    private readonly transform = new Object3D();
    private readonly color = new Color();
    private field: MineralField | undefined;

    constructor(private readonly resources: ResourceBudgetAccount) {
        resources.acquireRequired("shared-rock", {}, true, collectObject3DResourceAllocations([], [this.geometry]));
    }

    public initialize(host: WorldRenderLayerHost): void {
        if (!host.source.descriptor || host.source.descriptor.topology !== "infinite") {
            throw new Error("Mineral rendering requires the expedition's infinite procedural world");
        }
        if (!host.surface) throw new Error("Mineral rendering requires a world surface");
        this.field = new MineralField(host.source.descriptor.seed);
    }

    public mountChunk(context: WorldRenderChunkContext): void {
        if (!this.field) throw new Error("Mineral layer is not initialized");
        const nodes: MineralNode[] = [];
        for (const point of context.points) {
            const tile = getMapTile(context.map, point.x, point.y);
            if (!tile) throw new Error("Resident mineral terrain is missing");
            const node = this.field.nodeAt(point.x, point.y, toSurveyTerrain(tile));
            if (node) nodes.push(node);
        }
        for (const [key, group] of groupTilesByWorldChunk(nodes)) {
            const [chunkX, chunkY] = key.split(",").map(Number);
            const origin = getHexCenter(chunkX * WORLD_CHUNK_SIZE, chunkY * WORLD_CHUNK_SIZE, context.tileSize);
            const mesh = new InstancedMesh(this.emptyGeometry, this.material, 0);
            mesh.name = `mineral:${key}`;
            mesh.position.set(origin.x, 0, origin.y);
            const batch = { mesh, nodes: group, context, origin };
            this.tag(batch, key);
            this.batches.set(`${this.id}:${key}`, batch);
            context.addObject(mesh);
        }
    }

    public unmountChunk(context: WorldRenderChunkContext): void {
        for (const [id, batch] of this.batches) {
            if (batch.context.key !== context.key) continue;
            context.removeObject(batch.mesh);
            batch.mesh.dispose();
            this.batches.delete(id);
        }
    }

    public activateLod(metadata: WorldChunkMetadata, _lod: WorldChunkLod, objects: Object3D[]) {
        const batch = this.batches.get(metadata.id);
        if (!batch) throw new Error("Mineral render batch is missing");
        if (batch.mesh.count === 0) this.populate(batch);
        const bytes = batch.mesh.instanceMatrix.array.byteLength + batch.mesh.instanceColor!.array.byteLength;
        return {
            geometries: [],
            // The shared rock geometry has its own account; this batch owns only instance buffers.
            resourceCost: { cpuBytes: bytes, gpuBytes: bytes, geometryBytes: bytes },
            disposeGpu: () => { for (const object of objects) (object as InstancedMesh).dispose(); }
        };
    }

    public releaseChunk(_metadata: WorldChunkMetadata, objects: Object3D[]): void {
        for (const object of objects) {
            const mesh = object as InstancedMesh;
            mesh.dispose();
            mesh.geometry = this.emptyGeometry;
            mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(0), 16);
            mesh.instanceColor = null;
            mesh.count = 0;
            mesh.boundingBox = null;
            mesh.boundingSphere = null;
        }
    }

    public surfaceChanged(host: WorldRenderLayerHost): void {
        for (const [id, batch] of this.batches) {
            this.tag(batch, id.slice(this.id.length + 1));
            if (batch.mesh.count > 0) this.populate(batch);
        }
        host.invalidateVisibility();
    }

    public unloadWorld(): void { this.field = undefined; }

    public dispose(): void {
        for (const batch of this.batches.values()) batch.mesh.dispose();
        this.batches.clear();
        this.geometry.dispose();
        this.emptyGeometry.dispose();
        this.material.dispose();
        this.resources.dispose();
    }

    private tag(batch: MineralBatch, key: string): void {
        const { context, origin } = batch;
        const surface = context.surface!;
        const bounds = getWorldChunkBounds(batch.nodes, context.tileSize, surface.minimumHeight, surface.maximumHeight + context.tileSize);
        const localBounds = { ...bounds,
            minX: bounds.minX - origin.x, maxX: bounds.maxX - origin.x,
            minZ: bounds.minZ - origin.y, maxZ: bounds.maxZ - origin.y };
        const metadata = getWorldChunkMetadata(batch.mesh);
        if (metadata) Object.assign(metadata.bounds, localBounds);
        else tagWorldChunk(batch.mesh, key, this.id, localBounds);
    }

    private populate({ mesh, nodes, context, origin }: MineralBatch): void {
        const count = nodes.length * ROCKS.length;
        if (mesh.instanceMatrix.count !== count) {
            mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(count * 16), 16);
            mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
        }
        mesh.geometry = this.geometry;
        mesh.count = count;
        let instance = 0;
        for (const node of nodes) {
            const centre = getHexCenter(node.x, node.y, context.tileSize);
            this.color.set(MINERALS[node.mineral].color);
            for (const [dx, dz, radius] of ROCKS) {
                const worldX = centre.x + dx * context.tileSize;
                const worldZ = centre.y + dz * context.tileSize;
                const scale = radius * context.tileSize;
                this.transform.position.set(worldX - origin.x,
                    context.surface!.getWorldHeight(worldX, worldZ) + scale * 0.5, worldZ - origin.y);
                this.transform.rotation.set(0.17, (node.x * 0.7 + node.y * 1.3 + instance) % (Math.PI * 2), 0.23);
                this.transform.scale.set(scale * 1.25, scale * 0.85, scale);
                this.transform.updateMatrix();
                mesh.setMatrixAt(instance, this.transform.matrix);
                mesh.setColorAt(instance, this.color);
                instance += 1;
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
    }
}
