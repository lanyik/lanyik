import { Group } from "three";

import type { WorldChunkLod } from "./WorldChunkLod";
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
import {
    createSurfacePresentationStyle,
    DEFAULT_SURFACE_PRESENTATION_STYLE,
    type SurfacePresentationStyle
} from "./SurfacePresentationStyle";

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

interface PartialSurfacePresentationMount {
    readonly key: RenderChunkKey;
    readonly lease: ResidentSurfaceLease;
    readonly ground: GroundChunkMount;
    water?: WaterChunkMount;
    vegetation?: VegetationChunkMount;
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
    private readonly mounts = new Map<string, PartialSurfacePresentationMount>();
    private styleValue: Readonly<SurfacePresentationStyle> = DEFAULT_SURFACE_PRESENTATION_STYLE;
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
            this.mounts.set(serialized, {
                key: Object.freeze({ ...key }),
                lease,
                ground,
                water,
                vegetation
            });
            return Object.freeze({ key: Object.freeze({ ...key }), ground, water, vegetation });
        } catch (reason) {
            if (ground) {
                this.vegetation.unmount(key);
                this.water.unmount(key);
                this.ground.unmount(key);
                this.mounts.delete(serialized);
            }
            throw reason;
        }
    }

    public mountGround(lease: ResidentSurfaceLease, lod: WorldChunkLod): GroundChunkMount {
        this.assertReady();
        const key = lease.chunk.key;
        const serialized = keyString(key);
        if (this.mounts.has(serialized)) throw new Error("surface presentation chunk is already mounted");
        const ground = this.ground.mount(lease, lod);
        this.mounts.set(serialized, { key: Object.freeze({ ...key }), lease, ground });
        return ground;
    }

    public mountWater(key: RenderChunkKey): WaterChunkMount {
        this.assertReady();
        const mount = this.mounts.get(keyString(key));
        if (!mount) throw new Error("water requires a mounted ground dependency");
        if (mount.water) throw new Error("surface water chunk is already mounted");
        mount.water = this.water.mount(mount.lease.chunk, mount.ground);
        return mount.water;
    }

    public mountVegetation(key: RenderChunkKey): VegetationChunkMount {
        this.assertReady();
        const mount = this.mounts.get(keyString(key));
        if (!mount) throw new Error("vegetation requires a mounted ground dependency");
        if (mount.vegetation) throw new Error("surface vegetation chunk is already mounted");
        mount.vegetation = this.vegetation.mount(mount.lease.chunk, mount.ground);
        return mount.vegetation;
    }

    public setLod(key: RenderChunkKey, lod: WorldChunkLod): boolean {
        this.assertReady();
        const serialized = keyString(key);
        if (!this.mounts.has(serialized)) return false;
        const groundChanged = this.ground.setLod(key, lod);
        const mount = this.mounts.get(serialized)!;
        const waterChanged = mount.water ? this.water.setLod(key, lod) : false;
        const vegetationChanged = mount.vegetation ? this.vegetation.setLod(key, lod) : false;
        return groundChanged || waterChanged || vegetationChanged;
    }

    public setTime(seconds: number): void {
        this.assertReady();
        this.water.setTime(seconds);
        this.vegetation.setTime(seconds);
    }

    public setStyle(values: Partial<SurfacePresentationStyle>): Readonly<SurfacePresentationStyle> {
        this.assertNotDisposed();
        if (!values || typeof values !== "object" || Array.isArray(values)) {
            throw new TypeError("surface presentation style update is invalid");
        }
        const style = createSurfacePresentationStyle({ ...this.styleValue, ...values });
        this.ground.setStyle(style);
        this.water.setStyle(style);
        this.vegetation.setStyle(style);
        this.styleValue = style;
        return style;
    }

    public get style(): Readonly<SurfacePresentationStyle> { return this.styleValue; }

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
        const mount = this.mounts.get(serialized);
        if (!mount) return false;
        if (mount.vegetation) this.vegetation.unmount(key);
        if (mount.water) this.water.unmount(key);
        this.mounts.delete(serialized);
        return this.ground.unmount(key);
    }

    public unmountVegetation(key: RenderChunkKey): boolean {
        this.assertNotDisposed();
        const mount = this.mounts.get(keyString(key));
        if (!mount?.vegetation) return false;
        mount.vegetation = undefined;
        return this.vegetation.unmount(key);
    }

    public unmountWater(key: RenderChunkKey): boolean {
        this.assertNotDisposed();
        const mount = this.mounts.get(keyString(key));
        if (!mount?.water) return false;
        if (mount.vegetation) throw new Error("water cannot unmount while vegetation dependency is mounted");
        mount.water = undefined;
        return this.water.unmount(key);
    }

    public unmountGround(key: RenderChunkKey): boolean {
        this.assertNotDisposed();
        const serialized = keyString(key);
        const mount = this.mounts.get(serialized);
        if (!mount) return false;
        if (mount.water || mount.vegetation) throw new Error("ground cannot unmount while dependent layers are mounted");
        this.mounts.delete(serialized);
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
        for (const mount of [...this.mounts.values()]) this.unmount(mount.key);
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
            mountedChunks: this.mounts.size,
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
