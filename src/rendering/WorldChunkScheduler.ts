import {
    Box3,
    BufferGeometry,
    Camera,
    Frustum,
    Matrix4,
    Object3D,
    Quaternion,
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
import {
    collectObject3DResourceAllocations,
    sumResourceAllocations,
    normalizeResourceCost,
    ResourceBudgetAccount,
    ResourceBudgetLedger,
    ResourceBudgetView,
    ResourceCost,
    ResourceAllocation
} from "../runtime/ResourceBudget";

export interface WorldChunkActivation {
    geometries?: BufferGeometry[];
    disposeGpu?: () => void;
    // Custom layers should include texture/model allocations here. Geometry
    // bytes are measured automatically when this field is omitted.
    resourceCost?: Partial<ResourceCost>;
}

export interface WorldChunkSchedulerHooks {
    enabled(metadata: WorldChunkMetadata): boolean;
    activate(metadata: WorldChunkMetadata, lod: WorldChunkLod, objects: Object3D[]): WorldChunkActivation | void;
    release(metadata: WorldChunkMetadata, objects: Object3D[]): void;
}

export interface WorldChunkSchedulerOptions {
    renderDistance: number;
    lodEnabled: boolean;
    lodDistances: WorldChunkLodDistances;
    lodBias?: WorldChunkLod;
    vegetationLodBias?: WorldChunkLod;
    gpuCacheSize: number;
    cpuCacheSize: number;
    gpuCacheBytes?: number;
    cpuCacheBytes?: number;
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
    registeredObjects: number;
    sceneTraversals: number;
    cpuResidentBytes: number;
    gpuResidentBytes: number;
    geometryBytes: number;
    textureBytes: number;
    modelBytes: number;
    cpuBudgetBytes: number;
    gpuBudgetBytes: number;
    cpuBudgetExceededBytes: number;
    gpuBudgetExceededBytes: number;
    resourceEvictions: number;
    visibilityChecks: number;
    visibilitySkips: number;
}

interface ResidentChunk {
    id: string;
    metadata: WorldChunkMetadata;
    lod: WorldChunkLod;
    lastVisible: number;
    geometries: BufferGeometry[];
    disposeGpu?: () => void;
    gpuResident: boolean;
    resourceCost: ResourceCost;
    allocations: readonly ResourceAllocation[];
}

interface ChunkBinding {
    metadata: WorldChunkMetadata;
    objects: Object3D[];
    visibleObjects: Object3D[];
    lod: WorldChunkLod;
}

const EMPTY_STATS: WorldChunkStreamingStats = {
    visibleObjects: 0,
    visibleChunks: 0,
    residentChunks: 0,
    gpuResidentChunks: 0,
    lod0: 0,
    lod1: 0,
    lod2: 0,
    registeredObjects: 0,
    sceneTraversals: 0,
    cpuResidentBytes: 0,
    gpuResidentBytes: 0,
    geometryBytes: 0,
    textureBytes: 0,
    modelBytes: 0,
    cpuBudgetBytes: 0,
    gpuBudgetBytes: 0,
    cpuBudgetExceededBytes: 0,
    gpuBudgetExceededBytes: 0,
    resourceEvictions: 0,
    visibilityChecks: 0,
    visibilitySkips: 0
};

const VISIBILITY_ROTATION_THRESHOLD_RAD = Math.PI / 360;
const PROJECTION_EPSILON = 1e-7;

//Owns visibility, LOD selection and CPU/GPU residency. Render-layer classes
//remain responsible for constructing their own data; this scheduler only
//decides which logical chunk should exist at which quality.
export class WorldChunkScheduler {
    private readonly frustum = new Frustum();
    private readonly projection = new Matrix4();
    private readonly bounds = new Box3();
    private readonly residents = new Map<string, ResidentChunk>();
    private readonly bindings = new Map<string, ChunkBinding>();
    private readonly visibleIds = new Set<string>();
    private readonly inactive: ResidentChunk[] = [];
    private registeredRoot: Object3D | undefined;
    private registryDirty = true;
    private registeredObjects = 0;
    private sceneTraversals = 0;
    private frame = 0;
    private nextEvictionFrame = Infinity;
    private lastPressureCpuBytes = 0;
    private lastPressureGpuBytes = 0;
    private visibilityDirty = true;
    private visibilityChecks = 0;
    private visibilitySkips = 0;
    private hasVisibilityAnchor = false;
    private readonly lastCameraPosition = new Vector3();
    private readonly lastCameraQuaternion = new Quaternion();
    private readonly lastTarget = new Vector3();
    private readonly lastProjection = new Matrix4();
    private readonly cameraPosition = new Vector3();
    private readonly cameraQuaternion = new Quaternion();
    private snapshot: WorldChunkStreamingStats = { ...EMPTY_STATS };
    private readonly resources: ResourceBudgetLedger;
    private readonly resourceView: ResourceBudgetView;
    private resourceEvictions = 0;

    constructor(private options: WorldChunkSchedulerOptions) {
        this.validateOptions(options);
        this.resources = new ResourceBudgetLedger({
            cpuBytes: options.cpuCacheBytes ?? 384 * 1024 * 1024,
            gpuBytes: options.gpuCacheBytes ?? 256 * 1024 * 1024
        });
        const resources = this.resources;
        this.resourceView = Object.freeze({
            get stats() { return resources.stats; }
        });
        this.refreshResourceSnapshot();
    }

    public configure(options: Partial<WorldChunkSchedulerOptions>): void {
        const next = { ...this.options, ...options };
        this.validateOptions(next);
        this.options = next;
        this.resources.configure({
            cpuBytes: next.cpuCacheBytes ?? 384 * 1024 * 1024,
            gpuBytes: next.gpuCacheBytes ?? 256 * 1024 * 1024
        });
        this.visibilityDirty = true;
        this.refreshResourceSnapshot();
    }

    public clear(): void {
        for (const id of this.residents.keys()) this.resources.release(this.resourceKey(id));
        this.residents.clear();
        this.frame = 0;
        this.nextEvictionFrame = Infinity;
        this.lastPressureCpuBytes = this.lastPressureGpuBytes = 0;
        this.snapshot = { ...EMPTY_STATS };
        this.registryDirty = true;
        this.visibilityDirty = true;
        this.hasVisibilityAnchor = false;
        this.visibilityChecks = 0;
        this.visibilitySkips = 0;
        this.resourceEvictions = 0;
        this.refreshResourceSnapshot();
    }

    /** Final owner teardown; unlike clear(), this also drops external accounts. */
    public dispose(): void {
        this.clear();
        this.resources.dispose();
        this.refreshResourceSnapshot();
    }

    public invalidateScene(): void {
        this.registryDirty = true;
        this.visibilityDirty = true;
    }

    public invalidateVisibility(): void {
        this.visibilityDirty = true;
    }

    //Streaming worlds can physically remove render shells before the normal
    //grace-frame eviction pass. Forget them immediately so residency stats and
    //cache limits never retain metadata for unloaded logical chunks.
    public forget(ids: Iterable<string>): void {
        for (const id of ids) {
            this.resources.release(this.resourceKey(id));
            this.residents.delete(id);
            this.bindings.delete(id);
        }
        this.registryDirty = true;
        this.visibilityDirty = true;
    }

    public get stats(): Readonly<WorldChunkStreamingStats> {
        this.refreshResourceSnapshot();
        return this.snapshot;
    }

    // Shared admission surface for non-chunk render owners (units, buildings,
    // effects). Namespaced reservations participate in the same CPU/GPU hard
    // limits and remain intact when chunk residency is cleared.
    public get resourceBudget(): ResourceBudgetView {
        return this.resourceView;
    }

    public createResourceAccount(label: string): ResourceBudgetAccount {
        return this.resources.createAccount(label);
    }

    public update(root: Object3D, camera: Camera, target: Vector3, hooks: WorldChunkSchedulerHooks): boolean {
        this.frame += 1;
        camera.updateMatrixWorld();
        camera.getWorldPosition(this.cameraPosition);
        camera.getWorldQuaternion(this.cameraQuaternion);
        const resources = this.resources.stats;
        const pressureChanged = (resources.cpuExceededBytes > 0 || resources.gpuExceededBytes > 0)
            && (resources.cpuBytes !== this.lastPressureCpuBytes || resources.gpuBytes !== this.lastPressureGpuBytes);
        if (!pressureChanged && !this.shouldRefreshVisibility(root, camera, target)) {
            // Expiry belongs to residency, not camera motion. A stationary
            // camera must not hold expired CPU/GPU caches indefinitely.
            if (this.frame >= this.nextEvictionFrame) {
                this.evictInactive(this.visibleIds, hooks);
                this.snapshot = {
                    ...this.snapshot,
                    residentChunks: this.residents.size,
                    gpuResidentChunks: this.countGpuResidents(),
                    resourceEvictions: this.resourceEvictions
                };
            }
            this.visibilitySkips += 1;
            this.snapshot = { ...this.snapshot, visibilitySkips: this.visibilitySkips };
            return false;
        }
        this.visibilityDirty = false;
        this.captureVisibilityAnchor(camera, target);
        this.visibilityChecks += 1;
        if (root !== this.registeredRoot || this.registryDirty) this.rebuildRegistry(root);
        this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projection);

        this.visibleIds.clear();
        let visibleObjects = 0;

        for (const binding of this.bindings.values()) {
            const metadata = binding.metadata;
            binding.visibleObjects.length = 0;
            let requestedLod: WorldChunkLod | undefined;
            if (!hooks.enabled(metadata)) {
                for (const object of binding.objects) object.visible = false;
                continue;
            }
            for (const object of binding.objects) {
                object.updateWorldMatrix(true, false);
                const local = metadata.bounds;
                this.bounds.min.set(local.minX, local.minY, local.minZ);
                this.bounds.max.set(local.maxX, local.maxY, local.maxZ);
                //Metadata bounds are local to the tagged object. Transform all
                //eight corners into a world AABB so custom layers may rotate,
                //scale or nest their chunk objects without corrupting culling
                //and LOD distance decisions.
                this.bounds.applyMatrix4(object.matrixWorld);

                const dx = Math.max(0, this.bounds.min.x - target.x, target.x - this.bounds.max.x);
                const dz = Math.max(0, this.bounds.min.z - target.z, target.z - this.bounds.max.z);
                const distance = Math.hypot(dx, dz);
                const resident = this.residents.get(metadata.id);
                const resolvedLod = this.options.lodEnabled
                    ? resolveWorldChunkLod(distance, metadata.kind, resident?.lod, this.options.lodDistances)
                    : (distance <= (metadata.kind === "grass" || metadata.kind === "forest"
                        ? this.options.lodDistances.vegetation
                        : this.options.renderDistance) ? 0 : null);
                const vegetation = metadata.kind === "grass" || metadata.kind === "forest";
                const bias = (this.options.lodBias ?? 0) + (vegetation ? (this.options.vegetationLodBias ?? 0) : 0);
                const lod = resolvedLod === null
                    ? null
                    : Math.min(2, resolvedLod + bias) as WorldChunkLod;
                const inRenderDistance = distance <= this.options.renderDistance && lod !== null;
                if (inRenderDistance) this.bounds.expandByScalar(this.visibilityCullingPadding());
                const visible = inRenderDistance && this.frustum.intersectsBox(this.bounds);
                object.visible = visible;
                if (!visible || lod === null) continue;
                visibleObjects += 1;
                binding.visibleObjects.push(object);
                if (requestedLod === undefined || lod < requestedLod) requestedLod = lod;
            }
            if (requestedLod !== undefined) {
                binding.lod = requestedLod;
                this.visibleIds.add(metadata.id);
            }
        }

        const lodCounts = [0, 0, 0];
        for (const id of this.visibleIds) {
            const request = this.bindings.get(id)!;
            const activation = hooks.activate(request.metadata, request.lod, request.objects);
            const geometries = (activation && activation.geometries)
                ?? this.residents.get(id)?.geometries
                ?? [];
            const resident = this.residents.get(id);
            const accounting = activation
                ? this.activationCost(activation, geometries, request.visibleObjects)
                : resident?.gpuResident
                    ? resident
                    : this.activationCost({}, geometries, request.visibleObjects);
            const { resourceCost, allocations } = accounting;
            this.residents.set(id, {
                id,
                metadata: request.metadata,
                lod: request.lod,
                lastVisible: this.frame,
                geometries,
                disposeGpu: activation?.disposeGpu ?? resident?.disposeGpu,
                gpuResident: true,
                resourceCost,
                allocations
            });
            // Visible chunks form the pinned working set. Their unavoidable
            // overage is surfaced explicitly so adaptive quality can react;
            // all inactive retention remains subject to the hard byte limit.
            this.resources.forceReserve(this.resourceKey(id), resourceCost, true, allocations);
            //A changed LOD can replace attribute data without changing the
            //BufferGeometry identity. Disposing here guarantees stale GPU
            //buffers are gone before Three uploads the new attributes.
            if (resident && resident.lod !== request.lod) {
                for (const geometry of resident.geometries) geometry.dispose();
                resident.disposeGpu?.();
            }
            lodCounts[request.lod] += 1;
        }

        this.evictInactive(this.visibleIds, hooks);
        let gpuResidentChunks = 0;
        for (const entry of this.residents.values()) if (entry.gpuResident) gpuResidentChunks += 1;
        const resourceStats = this.resources.stats;
        this.lastPressureCpuBytes = resourceStats.cpuBytes;
        this.lastPressureGpuBytes = resourceStats.gpuBytes;
        this.snapshot = {
            visibleObjects,
            visibleChunks: this.visibleIds.size,
            residentChunks: this.residents.size,
            gpuResidentChunks,
            lod0: lodCounts[0],
            lod1: lodCounts[1],
            lod2: lodCounts[2],
            registeredObjects: this.registeredObjects,
            sceneTraversals: this.sceneTraversals,
            cpuResidentBytes: resourceStats.cpuBytes,
            gpuResidentBytes: resourceStats.gpuBytes,
            geometryBytes: resourceStats.geometryBytes,
            textureBytes: resourceStats.textureBytes,
            modelBytes: resourceStats.modelBytes,
            cpuBudgetBytes: resourceStats.cpuLimitBytes,
            gpuBudgetBytes: resourceStats.gpuLimitBytes,
            cpuBudgetExceededBytes: resourceStats.cpuExceededBytes,
            gpuBudgetExceededBytes: resourceStats.gpuExceededBytes,
            resourceEvictions: this.resourceEvictions,
            visibilityChecks: this.visibilityChecks,
            visibilitySkips: this.visibilitySkips
        };
        return true;
    }

    private evictInactive(visible: ReadonlySet<string>, hooks: WorldChunkSchedulerHooks): void {
        this.nextEvictionFrame = Infinity;
        this.inactive.length = 0;
        for (const entry of this.residents.values()) {
            const isVisible = visible.has(entry.id);
            this.resources.setPinned(this.resourceKey(entry.id), isVisible);
            if (!isVisible) this.inactive.push(entry);
        }
        this.inactive.sort((a, b) => a.lastVisible - b.lastVisible);

        let gpuExcess = Math.max(0,
            this.countGpuResidents() - this.options.gpuCacheSize
        );
        for (const entry of this.inactive) {
            if (!entry.gpuResident) continue;
            const stale = this.frame - entry.lastVisible >= this.options.gpuGraceFrames;
            const byteExcess = this.resources.stats.gpuExceededBytes;
            if (!stale && gpuExcess <= 0 && byteExcess <= 0) break;
            for (const geometry of entry.geometries) geometry.dispose();
            entry.disposeGpu?.();
            entry.gpuResident = false;
            entry.resourceCost = { ...entry.resourceCost, gpuBytes: 0 };
            entry.allocations = entry.allocations.filter(allocation => !allocation.cost.gpuBytes);
            this.resources.forceReserve(this.resourceKey(entry.id), entry.resourceCost, false, entry.allocations);
            this.resourceEvictions += 1;
            if (gpuExcess > 0) gpuExcess -= 1;
        }

        let cpuExcess = Math.max(0, this.residents.size - this.options.cpuCacheSize);
        for (const entry of this.inactive) {
            const stale = this.frame - entry.lastVisible >= this.options.cpuGraceFrames;
            const byteExcess = this.resources.stats.cpuExceededBytes;
            if (!stale && cpuExcess <= 0 && byteExcess <= 0) break;
            if (entry.gpuResident) {
                for (const geometry of entry.geometries) geometry.dispose();
                entry.disposeGpu?.();
            }
            hooks.release(entry.metadata, this.bindings.get(entry.id)?.objects ?? []);
            this.residents.delete(entry.id);
            this.resources.release(this.resourceKey(entry.id));
            this.resourceEvictions += 1;
            if (cpuExcess > 0) cpuExcess -= 1;
        }
        for (const entry of this.inactive) {
            if (!this.residents.has(entry.id)) continue;
            this.nextEvictionFrame = Math.min(this.nextEvictionFrame,
                entry.lastVisible + this.options.cpuGraceFrames,
                entry.gpuResident ? entry.lastVisible + this.options.gpuGraceFrames : Infinity
            );
        }
    }

    private countGpuResidents(): number {
        let count = 0;
        for (const entry of this.residents.values()) if (entry.gpuResident) count += 1;
        return count;
    }

    private activationCost(
        activation: WorldChunkActivation,
        geometries: readonly BufferGeometry[],
        objects: readonly Object3D[]
    ): { resourceCost: ResourceCost; allocations: readonly ResourceAllocation[] } {
        const allocations = collectObject3DResourceAllocations(objects, geometries);
        if (activation.resourceCost) {
            return {
                resourceCost: normalizeResourceCost({ ...sumResourceAllocations(allocations), ...activation.resourceCost }),
                allocations: []
            };
        }
        return { resourceCost: normalizeResourceCost(), allocations };
    }

    private resourceKey(id: string): string {
        return `world-chunk:${id}`;
    }

    private validateOptions(options: WorldChunkSchedulerOptions): void {
        for (const [name, value] of [
            ["gpuCacheSize", options.gpuCacheSize],
            ["cpuCacheSize", options.cpuCacheSize],
            ["gpuGraceFrames", options.gpuGraceFrames],
            ["cpuGraceFrames", options.cpuGraceFrames]
        ] as const) {
            if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
        }
        for (const [name, value] of [
            ["gpuCacheBytes", options.gpuCacheBytes ?? 256 * 1024 * 1024],
            ["cpuCacheBytes", options.cpuCacheBytes ?? 384 * 1024 * 1024]
        ] as const) {
            if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
        }
    }

    private refreshResourceSnapshot(): void {
        const resources = this.resources.stats;
        this.snapshot = {
            ...this.snapshot,
            cpuResidentBytes: resources.cpuBytes,
            gpuResidentBytes: resources.gpuBytes,
            geometryBytes: resources.geometryBytes,
            textureBytes: resources.textureBytes,
            modelBytes: resources.modelBytes,
            cpuBudgetBytes: resources.cpuLimitBytes,
            gpuBudgetBytes: resources.gpuLimitBytes,
            cpuBudgetExceededBytes: resources.cpuExceededBytes,
            gpuBudgetExceededBytes: resources.gpuExceededBytes,
            resourceEvictions: this.resourceEvictions,
            visibilityChecks: this.visibilityChecks,
            visibilitySkips: this.visibilitySkips
        };
    }

    private shouldRefreshVisibility(root: Object3D, camera: Camera, target: Vector3): boolean {
        if (this.visibilityDirty || this.registryDirty || root !== this.registeredRoot || !this.hasVisibilityAnchor) {
            return true;
        }
        const translationThreshold = this.visibilityTranslationThreshold();
        if (this.lastTarget.distanceToSquared(target) >= translationThreshold * translationThreshold
            || this.lastCameraPosition.distanceToSquared(this.cameraPosition) >= translationThreshold * translationThreshold) {
            return true;
        }
        const quaternionDot = Math.min(1, Math.abs(this.lastCameraQuaternion.dot(this.cameraQuaternion)));
        if (quaternionDot <= Math.cos(VISIBILITY_ROTATION_THRESHOLD_RAD / 2)) return true;
        const currentProjection = camera.projectionMatrix.elements;
        const previousProjection = this.lastProjection.elements;
        for (let index = 0; index < currentProjection.length; index += 1) {
            if (Math.abs(currentProjection[index] - previousProjection[index]) > PROJECTION_EPSILON) return true;
        }
        return false;
    }

    private captureVisibilityAnchor(camera: Camera, target: Vector3): void {
        this.lastCameraPosition.copy(this.cameraPosition);
        this.lastCameraQuaternion.copy(this.cameraQuaternion);
        this.lastTarget.copy(target);
        this.lastProjection.copy(camera.projectionMatrix);
        this.hasVisibilityAnchor = true;
    }

    private visibilityTranslationThreshold(): number {
        return Math.max(1, Math.min(
            this.options.lodDistances.hysteresis * 0.5,
            this.options.renderDistance * 0.02
        ));
    }

    private visibilityCullingPadding(): number {
        return this.visibilityTranslationThreshold()
            + this.options.renderDistance * Math.tan(VISIBILITY_ROTATION_THRESHOLD_RAD);
    }

    private rebuildRegistry(root: Object3D): void {
        this.bindings.clear();
        this.registeredRoot = root;
        this.registeredObjects = 0;
        root.traverse(object => {
            const metadata = getWorldChunkMetadata(object);
            if (!metadata) return;
            let binding = this.bindings.get(metadata.id);
            if (!binding) {
                binding = { metadata, objects: [], visibleObjects: [], lod: 0 };
                this.bindings.set(metadata.id, binding);
            }
            binding.objects.push(object);
            this.registeredObjects += 1;
        });
        this.registryDirty = false;
        this.sceneTraversals += 1;
    }
}

export function createDefaultWorldChunkSchedulerOptions(): WorldChunkSchedulerOptions {
    return {
        renderDistance: 2850,
        lodEnabled: true,
        lodDistances: { ...DEFAULT_WORLD_CHUNK_LOD_DISTANCES },
        lodBias: 0,
        vegetationLodBias: 0,
        gpuCacheSize: 128,
        cpuCacheSize: 192,
        gpuCacheBytes: 256 * 1024 * 1024,
        cpuCacheBytes: 384 * 1024 * 1024,
        gpuGraceFrames: 300,
        cpuGraceFrames: 1200
    };
}
