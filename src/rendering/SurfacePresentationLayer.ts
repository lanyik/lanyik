import { Group } from "three";

import type { WorldChunkLod } from "../helpers/chunks";
import type { ResidentSurfaceLease } from "../world/semantic/SurfaceCompilationService";
import type { RenderChunkKey } from "../world/semantic/SurfaceDependency";
import {
    GroundLayer,
    type GroundChunkMount,
    type GroundLayerStats
} from "./GroundLayer";
import { LightingStateController } from "./LightingState";
import { SurfaceFogTexturePool } from "./SurfaceFogTexturePool";
import {
    SurfaceGroundGeometryPool,
    type SurfaceGroundGeometryPoolStats
} from "./SurfaceGroundGeometry";
import { SurfaceTexturePool } from "./SurfaceTexturePool";
import {
    VegetationLayer,
    type VegetationChunkMount,
    type VegetationLayerStats
} from "./VegetationLayer";
import {
    WaterLayer,
    type WaterChunkMount,
    type WaterLayerStats
} from "./WaterLayer";

export interface SurfacePresentationLayerOptions {
    readonly surfaceTexturePool: SurfaceTexturePool;
    readonly fogTexturePool?: SurfaceFogTexturePool;
    readonly lighting: LightingStateController;
    readonly hexSize?: number;
    readonly heightScale?: number;
}

export interface SurfacePresentationChunkMount {
    readonly key: RenderChunkKey;
    readonly ground: GroundChunkMount;
    readonly water: WaterChunkMount;
    readonly vegetation: VegetationChunkMount;
}

export interface SurfacePresentationLayerStats {
    readonly state: "ready" | "lost" | "disposed";
    readonly mountedChunks: number;
    readonly ground: GroundLayerStats;
    readonly water: WaterLayerStats;
    readonly vegetation: VegetationLayerStats;
    readonly sharedGeometry: SurfaceGroundGeometryPoolStats;
}

function keyString(key: RenderChunkKey): string {
    if (!key || !Number.isSafeInteger(key.chunkX) || !Number.isSafeInteger(key.chunkY)) {
        throw new TypeError("SurfacePresentationLayer render chunk key is invalid");
    }
    return `${key.chunkX},${key.chunkY}`;
}

export class SurfacePresentationLayer {
    public readonly root = new Group();
    public readonly ground: GroundLayer;
    public readonly water: WaterLayer;
    public readonly vegetation: VegetationLayer;
    private readonly geometryPool: SurfaceGroundGeometryPool;
    private readonly mountedKeys = new Map<string, Readonly<RenderChunkKey>>();
    private stateValue: "ready" | "lost" | "disposed" = "ready";

    constructor(options: SurfacePresentationLayerOptions) {
        if (!options || typeof options !== "object"
            || Object.getOwnPropertyNames(options).some(name => ![
                "surfaceTexturePool", "fogTexturePool", "lighting", "hexSize", "heightScale"
            ].includes(name))
            || !(options.surfaceTexturePool instanceof SurfaceTexturePool)
            || options.fogTexturePool !== undefined
                && !(options.fogTexturePool instanceof SurfaceFogTexturePool)
            || !(options.lighting instanceof LightingStateController)) {
            throw new TypeError("SurfacePresentationLayer options are invalid");
        }
        const hexSize = options.hexSize ?? 1;
        const heightScale = options.heightScale ?? 1;
        this.geometryPool = new SurfaceGroundGeometryPool(hexSize, heightScale);
        this.ground = new GroundLayer({ ...options, geometryPool: this.geometryPool });
        this.water = new WaterLayer({
            surfaceTexturePool: options.surfaceTexturePool,
            lighting: options.lighting,
            geometryPool: this.geometryPool,
            hexSize,
            heightScale
        });
        this.vegetation = new VegetationLayer({
            surfaceTexturePool: options.surfaceTexturePool,
            lighting: options.lighting,
            hexSize,
            heightScale
        });
        this.root.name = "surface-presentation-layer-v2";
        this.root.add(this.ground.root, this.water.root, this.vegetation.root);
    }

    public mount(lease: ResidentSurfaceLease, lod: WorldChunkLod): SurfacePresentationChunkMount {
        this.assertReady();
        const key = lease.chunk.key;
        const serialized = keyString(key);
        let ground: GroundChunkMount | undefined;
        try {
            ground = this.ground.mount(lease, lod);
            const water = this.water.mount(lease.chunk, ground);
            const vegetation = this.vegetation.mount(lease.chunk, ground);
            this.mountedKeys.set(serialized, Object.freeze({ ...key }));
            return Object.freeze({ key: Object.freeze({ ...key }), ground, water, vegetation });
        } catch (reason) {
            if (ground) {
                this.vegetation.unmount(key);
                this.water.unmount(key);
                this.ground.unmount(key);
                this.mountedKeys.delete(serialized);
            }
            throw reason;
        }
    }

    public setLod(key: RenderChunkKey, lod: WorldChunkLod): boolean {
        this.assertReady();
        const serialized = keyString(key);
        if (!this.mountedKeys.has(serialized)) return false;
        const groundChanged = this.ground.setLod(key, lod);
        const waterChanged = this.water.setLod(key, lod);
        const vegetationChanged = this.vegetation.setLod(key, lod);
        return groundChanged || waterChanged || vegetationChanged;
    }

    public setTime(seconds: number): void {
        this.assertReady();
        this.water.setTime(seconds);
        this.vegetation.setTime(seconds);
    }

    public setFloatingOrigin(worldX: number, worldZ: number): void {
        this.assertNotDisposed();
        this.ground.setFloatingOrigin(worldX, worldZ);
        this.water.setFloatingOrigin(worldX, worldZ);
        this.vegetation.setFloatingOrigin(worldX, worldZ);
    }

    public uploadFog(key: RenderChunkKey, fog: Uint8Array): boolean {
        this.assertReady();
        return this.ground.uploadFog(key, fog);
    }

    public unmount(key: RenderChunkKey): boolean {
        this.assertNotDisposed();
        const serialized = keyString(key);
        if (!this.mountedKeys.delete(serialized)) return false;
        this.vegetation.unmount(key);
        this.water.unmount(key);
        return this.ground.unmount(key);
    }

    public handleContextLost(): void {
        this.assertNotDisposed();
        if (this.stateValue === "lost") return;
        this.water.handleContextLost();
        this.vegetation.handleContextLost();
        this.ground.handleContextLost();
        this.stateValue = "lost";
    }

    public handleContextRestored(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "lost") {
            throw new TypeError("SurfacePresentationLayer context can only restore from lost");
        }
        this.ground.handleContextRestored();
        this.water.handleContextRestored();
        this.vegetation.handleContextRestored();
        this.stateValue = "ready";
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        for (const key of [...this.mountedKeys.values()]) this.unmount(key);
        this.vegetation.dispose();
        this.water.dispose();
        this.ground.dispose();
        this.geometryPool.dispose();
        this.root.removeFromParent();
        this.stateValue = "disposed";
    }

    public get stats(): Readonly<SurfacePresentationLayerStats> {
        return Object.freeze({
            state: this.stateValue,
            mountedChunks: this.mountedKeys.size,
            ground: this.ground.stats,
            water: this.water.stats,
            vegetation: this.vegetation.stats,
            sharedGeometry: this.geometryPool.stats
        });
    }

    private assertReady(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "ready") {
            throw new TypeError("SurfacePresentationLayer cannot mutate while context is lost");
        }
    }

    private assertNotDisposed(): void {
        if (this.stateValue === "disposed") {
            throw new TypeError("SurfacePresentationLayer is disposed");
        }
    }
}
