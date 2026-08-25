import {
    Box3,
    BufferGeometry,
    Camera,
    Frustum,
    Matrix4,
    Object3D,
    Vector3
} from "three";

import {
    DEFAULT_WORLD_CHUNK_LOD_DISTANCES,
    getWorldChunkMetadata,
    resolveWorldChunkLod,
    WorldChunkLod,
    WorldChunkLodDistances,
    WorldChunkMetadata
} from "../helpers/chunks";

export interface WorldChunkActivation {
    geometries?: BufferGeometry[];
}

export interface WorldChunkSchedulerHooks {
    enabled(metadata: WorldChunkMetadata): boolean;
    activate(metadata: WorldChunkMetadata, lod: WorldChunkLod, objects: Object3D[]): WorldChunkActivation | void;
    release(metadata: WorldChunkMetadata): void;
}

export interface WorldChunkSchedulerOptions {
    renderDistance: number;
    lodEnabled: boolean;
    lodDistances: WorldChunkLodDistances;
    gpuCacheSize: number;
    cpuCacheSize: number;
    gpuGraceFrames: number;
    cpuGraceFrames: number;
}

export interface WorldChunkStreamingStats {
    visibleObjects: number;
    visibleChunks: number;
    residentChunks: number;
    gpuResidentChunks: number;
    lod0: number;
    lod1: number;
    lod2: number;
}

interface VisibleRequest {
    metadata: WorldChunkMetadata;
    lod: WorldChunkLod;
    objects: Object3D[];
}

interface ResidentChunk {
    metadata: WorldChunkMetadata;
    lod: WorldChunkLod;
    lastVisible: number;
    geometries: BufferGeometry[];
    gpuResident: boolean;
}

const EMPTY_STATS: WorldChunkStreamingStats = {
    visibleObjects: 0,
    visibleChunks: 0,
    residentChunks: 0,
    gpuResidentChunks: 0,
    lod0: 0,
    lod1: 0,
    lod2: 0
};

//Owns visibility, LOD selection and CPU/GPU residency. Render-layer classes
//remain responsible for constructing their own data; this scheduler only
//decides which logical chunk should exist at which quality.
export class WorldChunkScheduler {
    private readonly frustum = new Frustum();
    private readonly projection = new Matrix4();
    private readonly bounds = new Box3();
    private readonly residents = new Map<string, ResidentChunk>();
    private frame = 0;
    private snapshot: WorldChunkStreamingStats = { ...EMPTY_STATS };

    constructor(private options: WorldChunkSchedulerOptions) {}

    public configure(options: Partial<WorldChunkSchedulerOptions>): void {
        this.options = { ...this.options, ...options };
    }

    public clear(): void {
        this.residents.clear();
        this.frame = 0;
        this.snapshot = { ...EMPTY_STATS };
    }

    //Streaming worlds can physically remove render shells before the normal
    //grace-frame eviction pass. Forget them immediately so residency stats and
    //cache limits never retain metadata for unloaded logical chunks.
    public forget(ids: Iterable<string>): void {
        for (const id of ids) this.residents.delete(id);
    }

    public get stats(): Readonly<WorldChunkStreamingStats> {
        return this.snapshot;
    }

    public update(root: Object3D, camera: Camera, target: Vector3, hooks: WorldChunkSchedulerHooks): void {
        this.frame += 1;
        camera.updateMatrixWorld();
        this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projection);

        const requests = new Map<string, VisibleRequest>();
        let visibleObjects = 0;

        root.traverse(object => {
            const metadata = getWorldChunkMetadata(object);
            if (!metadata) return;

            if (!hooks.enabled(metadata)) {
                object.visible = false;
                return;
            }

            object.updateWorldMatrix(true, false);
            const worldX = object.matrixWorld.elements[12];
            const worldY = object.matrixWorld.elements[13];
            const worldZ = object.matrixWorld.elements[14];
            const local = metadata.bounds;
            this.bounds.min.set(local.minX + worldX, local.minY + worldY, local.minZ + worldZ);
            this.bounds.max.set(local.maxX + worldX, local.maxY + worldY, local.maxZ + worldZ);

            const dx = Math.max(0, this.bounds.min.x - target.x, target.x - this.bounds.max.x);
            const dz = Math.max(0, this.bounds.min.z - target.z, target.z - this.bounds.max.z);
            const distance = Math.hypot(dx, dz);
            const resident = this.residents.get(metadata.id);
            const lod = this.options.lodEnabled
                ? resolveWorldChunkLod(distance, metadata.kind, resident?.lod, this.options.lodDistances)
                : (distance <= (metadata.kind === "grass" || metadata.kind === "forest"
                    ? this.options.lodDistances.vegetation
                    : this.options.renderDistance) ? 0 : null);
            const visible = distance <= this.options.renderDistance
                && lod !== null
                && this.frustum.intersectsBox(this.bounds);
            object.visible = visible;
            if (!visible || lod === null) return;

            visibleObjects += 1;
            const existing = requests.get(metadata.id);
            if (existing) {
                existing.objects.push(object);
                if (lod < existing.lod) existing.lod = lod;
            } else {
                requests.set(metadata.id, { metadata, lod, objects: [object] });
            }
        });

        const lodCounts = [0, 0, 0];
        for (const request of requests.values()) {
            const activation = hooks.activate(request.metadata, request.lod, request.objects);
            const geometries = (activation && activation.geometries)
                ?? this.residents.get(request.metadata.id)?.geometries
                ?? [];
            const resident = this.residents.get(request.metadata.id);
            this.residents.set(request.metadata.id, {
                metadata: request.metadata,
                lod: request.lod,
                lastVisible: this.frame,
                geometries,
                gpuResident: true
            });
            //A changed LOD can replace attribute data without changing the
            //BufferGeometry identity. Disposing here guarantees stale GPU
            //buffers are gone before Three uploads the new attributes.
            if (resident && resident.lod !== request.lod) {
                for (const geometry of resident.geometries) geometry.dispose();
            }
            lodCounts[request.lod] += 1;
        }

        this.evictInactive(requests, hooks);
        this.snapshot = {
            visibleObjects,
            visibleChunks: requests.size,
            residentChunks: this.residents.size,
            gpuResidentChunks: [...this.residents.values()].filter(entry => entry.gpuResident).length,
            lod0: lodCounts[0],
            lod1: lodCounts[1],
            lod2: lodCounts[2]
        };
    }

    private evictInactive(visible: Map<string, VisibleRequest>, hooks: WorldChunkSchedulerHooks): void {
        const inactive = [...this.residents.entries()]
            .filter(([id]) => !visible.has(id))
            .sort((a, b) => a[1].lastVisible - b[1].lastVisible);

        let gpuExcess = Math.max(0,
            [...this.residents.values()].filter(entry => entry.gpuResident).length - this.options.gpuCacheSize
        );
        for (const [, entry] of inactive) {
            if (!entry.gpuResident) continue;
            const stale = this.frame - entry.lastVisible >= this.options.gpuGraceFrames;
            if (!stale && gpuExcess <= 0) break;
            for (const geometry of entry.geometries) geometry.dispose();
            entry.gpuResident = false;
            if (gpuExcess > 0) gpuExcess -= 1;
        }

        let cpuExcess = Math.max(0, this.residents.size - this.options.cpuCacheSize);
        for (const [id, entry] of inactive) {
            const stale = this.frame - entry.lastVisible >= this.options.cpuGraceFrames;
            if (!stale && cpuExcess <= 0) break;
            for (const geometry of entry.geometries) geometry.dispose();
            hooks.release(entry.metadata);
            this.residents.delete(id);
            if (cpuExcess > 0) cpuExcess -= 1;
        }
    }
}

export function createDefaultWorldChunkSchedulerOptions(): WorldChunkSchedulerOptions {
    return {
        renderDistance: 2400,
        lodEnabled: true,
        lodDistances: { ...DEFAULT_WORLD_CHUNK_LOD_DISTANCES },
        gpuCacheSize: 128,
        cpuCacheSize: 192,
        gpuGraceFrames: 300,
        cpuGraceFrames: 1200
    };
}
