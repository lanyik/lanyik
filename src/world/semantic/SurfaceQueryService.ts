import {
    createTransferableEffectiveWindow
} from "./EffectiveSurfaceWindow";
import { EffectiveWorldSnapshot } from "./EffectiveWorldView";
import { SURFACE_RENDER_CHUNK_SIZE } from "./SurfaceCompileProfile";
import {
    compileSurfaceChunk,
    CompiledSurfaceSample,
    sampleCompiledSurfaceChunk
} from "./SurfaceCompiler";
import {
    canonicalizeRenderChunkKey,
    RenderChunkKey,
    surfaceDependencyKeysEqual
} from "./SurfaceDependency";
import { ResidentSurfaceLease } from "./SurfaceCompilationService";
import { WorldDescriptorV2 } from "./WorldDescriptorV2";

export interface SurfaceQuerySnapshotProvider {
    capture(renderKey: RenderChunkKey): EffectiveWorldSnapshot | Promise<EffectiveWorldSnapshot>;
}

export interface SurfaceQueryServiceOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly snapshots: SurfaceQuerySnapshotProvider;
}

export interface SurfaceQueryServiceStats {
    readonly residentHits: number;
    readonly synchronousCompilations: number;
    readonly staleResidentRejects: number;
    readonly mountedLeases: number;
}

function renderKeyString(key: RenderChunkKey): string { return `${key.chunkX},${key.chunkY}`; }

function queryRenderKey(tileX: number, tileY: number): RenderChunkKey {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)
        || tileX < Number.MIN_SAFE_INTEGER || tileX > Number.MAX_SAFE_INTEGER
        || tileY < Number.MIN_SAFE_INTEGER || tileY > Number.MAX_SAFE_INTEGER) {
        throw new RangeError("surface query coordinates must be finite values in the safe integer tile domain");
    }
    return {
        chunkX: Math.floor((tileX + 0.5) / SURFACE_RENDER_CHUNK_SIZE),
        chunkY: Math.floor((tileY + 0.5) / SURFACE_RENDER_CHUNK_SIZE)
    };
}

export class SurfaceQueryService {
    private readonly descriptor: WorldDescriptorV2;
    private readonly snapshots: SurfaceQuerySnapshotProvider;
    private readonly leases = new Map<string, ResidentSurfaceLease>();
    private residentHitCount = 0;
    private synchronousCompilationCount = 0;
    private staleResidentRejectCount = 0;
    private disposed = false;

    constructor(options: SurfaceQueryServiceOptions) {
        if (!options || typeof options !== "object" || !options.snapshots
            || typeof options.snapshots.capture !== "function") {
            throw new TypeError("SurfaceQueryService options are invalid");
        }
        this.descriptor = options.descriptor;
        this.snapshots = options.snapshots;
    }

    public bindLease(lease: ResidentSurfaceLease): void {
        this.assertReady();
        if (!lease || lease.released) throw new TypeError("surface query lease must be active");
        const key = canonicalizeRenderChunkKey(this.descriptor, lease.chunk.key);
        this.leases.set(renderKeyString(key), lease);
    }

    public unbindLease(key: RenderChunkKey, lease?: ResidentSurfaceLease): boolean {
        this.assertReady();
        const canonical = canonicalizeRenderChunkKey(this.descriptor, key);
        const serialized = renderKeyString(canonical);
        const current = this.leases.get(serialized);
        if (!current || lease && current !== lease) return false;
        return this.leases.delete(serialized);
    }

    public invalidate(keys: readonly RenderChunkKey[]): number {
        this.assertReady();
        let invalidated = 0;
        for (const key of keys) if (this.unbindLease(key)) invalidated += 1;
        return invalidated;
    }

    public async sample(tileX: number, tileY: number): Promise<Readonly<CompiledSurfaceSample>> {
        this.assertReady();
        const key = canonicalizeRenderChunkKey(this.descriptor, queryRenderKey(tileX, tileY));
        const snapshot = await this.snapshots.capture(key);
        const window = createTransferableEffectiveWindow(snapshot, key);
        const resident = this.leases.get(renderKeyString(key));
        let compiled;
        if (resident && !resident.released && resident.isCurrent()
            && resident.effectiveRevision <= snapshot.effectiveRevision
            && surfaceDependencyKeysEqual(resident.dependencyKey, window.dependencyKey)) {
            compiled = resident.chunk;
            this.residentHitCount += 1;
        } else {
            if (resident) {
                this.leases.delete(renderKeyString(key));
                this.staleResidentRejectCount += 1;
            }
            compiled = compileSurfaceChunk(window);
            this.synchronousCompilationCount += 1;
        }
        const originX = key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
        const originY = key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
        return sampleCompiledSurfaceChunk(compiled, tileX - originX, tileY - originY);
    }

    public async groundHeight(tileX: number, tileY: number): Promise<number> {
        return (await this.sample(tileX, tileY)).groundHeight;
    }

    public async placementHeight(tileX: number, tileY: number, onWater = false): Promise<number> {
        const sample = await this.sample(tileX, tileY);
        return onWater && sample.waterCoverage > 0 ? sample.waterLevel : sample.groundHeight;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.leases.clear();
    }

    public get stats(): Readonly<SurfaceQueryServiceStats> {
        return Object.freeze({
            residentHits: this.residentHitCount,
            synchronousCompilations: this.synchronousCompilationCount,
            staleResidentRejects: this.staleResidentRejectCount,
            mountedLeases: this.leases.size
        });
    }

    private assertReady(): void {
        if (this.disposed) throw new Error("SurfaceQueryService has been disposed");
    }
}
