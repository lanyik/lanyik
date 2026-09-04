import { AnimationClip, Group, Matrix4, Vector3, Quaternion, Euler, MathUtils } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    disposeObject3DResources,
    estimateObject3DResourceCost,
    ResourceBudgetAccount,
    ResourceCost,
    ResourceReservationHandle
} from "../runtime/ResourceBudget";

//----------------------------------------------------------------------------------
//Per-model fine-tuning, stored as info.json next to model.glb in the model's own
//folder (see loadModel() below) - a model's authored offset/rotation/scale is
//arbitrary and different assets need different fixes, but that fix is a property
//of the *asset*, not of any particular map's use of it. Keeping it in the asset's
//own folder means swapping which model a tile points to (map.json's city.model/
//TileInfo.treeModel) is a one-line path change that just works, with no per-tile
//retuning. rotation is in degrees (friendlier to hand-edit than radians).
//----------------------------------------------------------------------------------
export interface ModelInfo {
    offset: { x: number, y: number, z: number };
    rotation: { x: number, y: number, z: number };
    scale: number;
}

export type ModelMetadata = ModelInfo & Record<string, unknown>;

export interface LoadedModel {
    scene: Group;
    animations: AnimationClip[];
    info: ModelMetadata;
    fixup: Matrix4; // offset/rotation/scale above, composed once as a matrix
}

const DEFAULT_INFO: ModelMetadata = {
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1
};

function loadGLTF(url: string): Promise<{ scene: Group; animations: AnimationClip[] }> {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(url, gltf => resolve({ scene: gltf.scene, animations: gltf.animations }), undefined, reject);
    });
}

function finiteNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeInfo(value: unknown): ModelMetadata {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const offset = raw.offset && typeof raw.offset === "object" ? raw.offset as Record<string, unknown> : {};
    const rotation = raw.rotation && typeof raw.rotation === "object" ? raw.rotation as Record<string, unknown> : {};
    return {
        ...raw,
        offset: {
            x: finiteNumber(offset.x, DEFAULT_INFO.offset.x),
            y: finiteNumber(offset.y, DEFAULT_INFO.offset.y),
            z: finiteNumber(offset.z, DEFAULT_INFO.offset.z)
        },
        rotation: {
            x: finiteNumber(rotation.x, DEFAULT_INFO.rotation.x),
            y: finiteNumber(rotation.y, DEFAULT_INFO.rotation.y),
            z: finiteNumber(rotation.z, DEFAULT_INFO.rotation.z)
        },
        scale: finiteNumber(raw.scale, DEFAULT_INFO.scale)
    };
}

async function loadInfo(url: string): Promise<ModelMetadata> {
    try {
        const response = await fetch(url);
        if (!response.ok) return DEFAULT_INFO;
        return normalizeInfo(await response.json());
    } catch {
        return DEFAULT_INFO;
    }
}

function fixupMatrix(info: ModelInfo): Matrix4 {
    const rotation = new Euler(
        MathUtils.degToRad(info.rotation.x),
        MathUtils.degToRad(info.rotation.y),
        MathUtils.degToRad(info.rotation.z)
    );
    return new Matrix4().compose(
        new Vector3(info.offset.x, info.offset.y, info.offset.z),
        new Quaternion().setFromEuler(rotation),
        new Vector3(info.scale, info.scale, info.scale)
    );
}

export const DEFAULT_MODEL_ASSET_CACHE_BYTES = 64 * 1024 * 1024;

export interface ModelAssetLease {
    readonly path: string;
    readonly model: LoadedModel;
    readonly released: boolean;
    release(): boolean;
}

export interface ModelAssetCacheStats extends ResourceCost {
    readonly disposed: boolean;
    readonly entries: number;
    readonly loadedEntries: number;
    readonly pendingEntries: number;
    readonly activeReferences: number;
    readonly maximumBytes: number;
    readonly retainedBytes: number;
    readonly exceededBytes: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly evictions: number;
}

export interface ModelAssetCacheOptions {
    maximumBytes?: number;
    resources?: ResourceBudgetAccount;
    load?: (path: string) => Promise<LoadedModel>;
}

interface ModelAssetEntry {
    readonly path: string;
    readonly promise: Promise<LoadedModel>;
    references: number;
    lastUsed: number;
    model?: LoadedModel;
    cost?: ResourceCost;
    retainedBytes: number;
    reservation?: ResourceReservationHandle;
}

async function loadModel(path: string): Promise<LoadedModel> {
    const [{ scene, animations }, info] = await Promise.all([
        loadGLTF(`${path}/model.glb`),
        loadInfo(`${path}/info.json`)
    ]);
    scene.updateMatrixWorld(true);
    return { scene, animations, info, fixup: fixupMatrix(info) };
}

// Immutable decoded glTF assets are shared through explicit leases. Entries
// with borrowers are pinned; released entries form a byte-bounded LRU. The
// optional ResourceBudget account makes the same decoded CPU and estimated GPU
// bytes visible beside streamed terrain resources.
export class ModelAssetCache {
    private readonly entries = new Map<string, ModelAssetEntry>();
    private readonly maximumBytes: number;
    private readonly resources: ResourceBudgetAccount | undefined;
    private readonly loader: (path: string) => Promise<LoadedModel>;
    private clock = 0;
    private retainedBytes = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private evictions = 0;
    private disposed = false;

    constructor(options: ModelAssetCacheOptions = {}) {
        this.maximumBytes = options.maximumBytes ?? DEFAULT_MODEL_ASSET_CACHE_BYTES;
        if (!Number.isSafeInteger(this.maximumBytes) || this.maximumBytes < 0) {
            throw new RangeError("model asset cache maximumBytes must be a non-negative safe integer");
        }
        this.resources = options.resources;
        this.loader = options.load ?? loadModel;
    }

    public async acquire(path: string): Promise<ModelAssetLease> {
        this.assertActive();
        if (typeof path !== "string" || path.trim().length === 0) {
            throw new TypeError("model asset path must be a non-empty string");
        }
        let entry = this.entries.get(path);
        if (entry) {
            this.cacheHits += 1;
        } else {
            this.cacheMisses += 1;
            let created: ModelAssetEntry;
            const promise = this.loader(path).then(model => {
                try {
                    return this.acceptLoaded(created, model);
                } catch (reason) {
                    disposeObject3DResources([model.scene]);
                    throw reason;
                }
            }).catch(reason => {
                if (this.entries.get(path) === created) this.entries.delete(path);
                throw reason;
            });
            created = {
                path,
                promise,
                references: 0,
                lastUsed: ++this.clock,
                retainedBytes: 0
            };
            entry = created;
            this.entries.set(path, entry);
        }
        entry.references += 1;
        entry.lastUsed = ++this.clock;
        entry.reservation?.setPinned(true);
        let model: LoadedModel;
        try {
            model = await entry.promise;
        } catch (reason) {
            entry.references = Math.max(0, entry.references - 1);
            throw reason;
        }
        if (this.disposed || this.entries.get(path) !== entry || entry.model !== model) {
            entry.references = Math.max(0, entry.references - 1);
            throw new Error("ModelAssetCache was disposed while loading an asset");
        }
        let released = false;
        return {
            path,
            model,
            get released() { return released; },
            release: () => {
                if (released) return false;
                released = true;
                this.release(entry!);
                return true;
            }
        };
    }

    public async preload(paths: Iterable<string>): Promise<void> {
        this.assertActive();
        await Promise.all([...new Set(paths)].map(path => this.acquire(path).then(lease => {
            lease.release();
        })));
    }

    public clear(): void {
        if (this.disposed) return;
        for (const entry of [...this.entries.values()]) {
            if (entry.references === 0 && entry.model) this.evict(entry);
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const entry of this.entries.values()) {
            entry.reservation?.release();
            if (entry.model) disposeObject3DResources([entry.model.scene]);
        }
        this.entries.clear();
        this.retainedBytes = 0;
        this.resources?.dispose();
    }

    public get stats(): Readonly<ModelAssetCacheStats> {
        let loadedEntries = 0;
        let activeReferences = 0;
        let cost: ResourceCost = { cpuBytes: 0, gpuBytes: 0, geometryBytes: 0, textureBytes: 0, modelBytes: 0 };
        for (const entry of this.entries.values()) {
            activeReferences += entry.references;
            if (!entry.cost) continue;
            loadedEntries += 1;
            cost = {
                cpuBytes: cost.cpuBytes + entry.cost.cpuBytes,
                gpuBytes: cost.gpuBytes + entry.cost.gpuBytes,
                geometryBytes: cost.geometryBytes + entry.cost.geometryBytes,
                textureBytes: cost.textureBytes + entry.cost.textureBytes,
                modelBytes: cost.modelBytes + entry.cost.modelBytes
            };
        }
        return {
            ...cost,
            disposed: this.disposed,
            entries: this.entries.size,
            loadedEntries,
            pendingEntries: this.entries.size - loadedEntries,
            activeReferences,
            maximumBytes: this.maximumBytes,
            retainedBytes: this.retainedBytes,
            exceededBytes: Math.max(0, this.retainedBytes - this.maximumBytes),
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            evictions: this.evictions
        };
    }

    private acceptLoaded(entry: ModelAssetEntry, model: LoadedModel): LoadedModel {
        if (this.disposed || this.entries.get(entry.path) !== entry) {
            throw new Error("ModelAssetCache was disposed while loading an asset");
        }
        const cost = estimateObject3DResourceCost([model.scene]);
        const retainedBytes = cost.cpuBytes + cost.gpuBytes;
        if (!Number.isSafeInteger(retainedBytes)) throw new RangeError("model asset byte estimate exceeds safe integer range");
        this.evictToFit(retainedBytes);
        entry.model = model;
        entry.cost = cost;
        entry.retainedBytes = retainedBytes;
        entry.reservation = this.resources?.acquire(entry.path, cost, true)
            ?? this.resources?.acquireRequired(entry.path, cost, true);
        this.retainedBytes += retainedBytes;
        return model;
    }

    private release(entry: ModelAssetEntry): void {
        if (entry.references === 0) return;
        entry.references -= 1;
        entry.lastUsed = ++this.clock;
        if (entry.references === 0) entry.reservation?.setPinned(false);
        this.evictToFit(0);
    }

    private evictToFit(incomingBytes: number): void {
        while (this.retainedBytes + incomingBytes > this.maximumBytes) {
            let oldest: ModelAssetEntry | undefined;
            for (const candidate of this.entries.values()) {
                if (!candidate.model || candidate.references > 0) continue;
                if (!oldest || candidate.lastUsed < oldest.lastUsed) oldest = candidate;
            }
            if (!oldest) return;
            this.evict(oldest);
        }
    }

    private evict(entry: ModelAssetEntry): void {
        if (!entry.model || entry.references > 0 || this.entries.get(entry.path) !== entry) return;
        this.entries.delete(entry.path);
        entry.reservation?.release();
        disposeObject3DResources([entry.model.scene]);
        this.retainedBytes = Math.max(0, this.retainedBytes - entry.retainedBytes);
        this.evictions += 1;
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("ModelAssetCache has been disposed");
    }
}
