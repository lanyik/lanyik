import {
    ClampToEdgeWrapping,
    DataArrayTexture,
    NearestFilter,
    NoColorSpace,
    RedFormat,
    UnsignedByteType
} from "three";

import { SURFACE_TEXTURE_PAGE_LAYERS } from "../world/semantic/SurfaceCompileProfile";
import {
    SurfaceTexturePool,
    type SurfaceTextureSlotHandle
} from "./SurfaceTexturePool";

export const SURFACE_FOG_TEXTURE_SIZE = 16;
export const SURFACE_FOG_LAYER_BYTES = SURFACE_FOG_TEXTURE_SIZE * SURFACE_FOG_TEXTURE_SIZE;
export const SURFACE_FOG_PAGE_BYTES = SURFACE_FOG_LAYER_BYTES * SURFACE_TEXTURE_PAGE_LAYERS;

export interface SurfaceFogTexturePoolOptions {
    readonly surfacePool: SurfaceTexturePool;
    readonly gpuBudgetBytes: number;
}

export interface SurfaceFogTextureBinding {
    readonly slot: SurfaceTextureSlotHandle;
    readonly texture: DataArrayTexture;
}

export interface SurfaceFogTexturePoolStats {
    readonly state: "ready" | "lost" | "disposed";
    readonly contextGeneration: number;
    readonly contextRestores: number;
    readonly pageCount: number;
    readonly activeLayers: number;
    readonly uploadedLayers: number;
    readonly cpuBytes: number;
    readonly gpuBytes: number;
    readonly gpuBudgetBytes: number;
    readonly pendingLayerUploads: number;
    readonly logicalUploads: number;
    readonly logicalUploadBytes: number;
    readonly staleUploadRejects: number;
    readonly staleReleaseRejects: number;
}

interface FogLayerState {
    handle?: SurfaceTextureSlotHandle;
    uploaded: boolean;
}

interface FogPage {
    readonly pageIndex: number;
    readonly data: Uint8Array;
    readonly texture: DataArrayTexture;
    readonly layers: FogLayerState[];
}

function assertOptions(options: SurfaceFogTexturePoolOptions): void {
    if (!options || typeof options !== "object"
        || Object.getOwnPropertyNames(options).some(name => name !== "surfacePool" && name !== "gpuBudgetBytes")
        || !(options.surfacePool instanceof SurfaceTexturePool)) {
        throw new TypeError("surface fog texture pool options are invalid");
    }
    if (!Number.isSafeInteger(options.gpuBudgetBytes) || options.gpuBudgetBytes < 0) {
        throw new RangeError("surface fog texture pool gpuBudgetBytes must be a non-negative safe integer");
    }
}

function assertHandle(handle: SurfaceTextureSlotHandle): void {
    if (!handle || typeof handle !== "object"
        || Object.getOwnPropertyNames(handle).some(name => ![
            "poolId", "pageIndex", "layerIndex", "generation"
        ].includes(name))
        || !Number.isSafeInteger(handle.poolId) || handle.poolId <= 0
        || !Number.isInteger(handle.pageIndex) || handle.pageIndex < 0
        || !Number.isInteger(handle.layerIndex) || handle.layerIndex < 0
        || handle.layerIndex >= SURFACE_TEXTURE_PAGE_LAYERS
        || !Number.isSafeInteger(handle.generation) || handle.generation <= 0) {
        throw new TypeError("surface fog texture slot handle is invalid");
    }
}

function handlesEqual(first: SurfaceTextureSlotHandle, second: SurfaceTextureSlotHandle): boolean {
    return first.poolId === second.poolId
        && first.pageIndex === second.pageIndex
        && first.layerIndex === second.layerIndex
        && first.generation === second.generation;
}

function createPage(pageIndex: number): FogPage {
    const data = new Uint8Array(SURFACE_FOG_PAGE_BYTES);
    const texture = new DataArrayTexture(
        data,
        SURFACE_FOG_TEXTURE_SIZE,
        SURFACE_FOG_TEXTURE_SIZE,
        SURFACE_TEXTURE_PAGE_LAYERS
    );
    texture.name = `surface-fog-page-${pageIndex}`;
    texture.internalFormat = "R8";
    texture.format = RedFormat;
    texture.type = UnsignedByteType;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    texture.colorSpace = NoColorSpace;
    return {
        pageIndex,
        data,
        texture,
        layers: Array.from({ length: SURFACE_TEXTURE_PAGE_LAYERS }, () => ({ uploaded: false }))
    };
}

function handleKey(handle: SurfaceTextureSlotHandle): string {
    return `${handle.poolId}/${handle.pageIndex}/${handle.layerIndex}/${handle.generation}`;
}

export class SurfaceFogTexturePool {
    private readonly surfacePool: SurfaceTexturePool;
    private readonly gpuBudgetBytes: number;
    private readonly maxPages: number;
    private readonly pages: Array<FogPage | undefined> = [];
    private readonly activeHandles = new Map<string, SurfaceTextureSlotHandle>();
    private stateValue: "ready" | "lost" | "disposed" = "ready";
    private contextGenerationValue = 1;
    private contextRestoreCount = 0;
    private logicalUploadCount = 0;
    private staleUploadRejectCount = 0;
    private staleReleaseRejectCount = 0;

    constructor(options: SurfaceFogTexturePoolOptions) {
        assertOptions(options);
        this.surfacePool = options.surfacePool;
        this.gpuBudgetBytes = options.gpuBudgetBytes;
        this.maxPages = Math.floor(this.gpuBudgetBytes / SURFACE_FOG_PAGE_BYTES);
    }

    public get state(): "ready" | "lost" | "disposed" { return this.stateValue; }

    public isCompanionOf(surfacePool: SurfaceTexturePool): boolean {
        return this.surfacePool === surfacePool;
    }

    public upload(handle: SurfaceTextureSlotHandle, fog: Uint8Array): boolean {
        assertHandle(handle);
        if (!(fog instanceof Uint8Array) || fog.length !== SURFACE_FOG_LAYER_BYTES) {
            throw new TypeError("surface fog upload must contain one 16x16 R8 layer");
        }
        if (!this.surfacePool.isCurrent(handle)) {
            this.staleUploadRejectCount += 1;
            return false;
        }
        if (this.surfacePool.state !== "ready") {
            throw new TypeError("surface fog upload requires its surface texture pool to be ready");
        }
        this.assertReady("upload");
        const page = this.ensurePage(handle.pageIndex);
        const layer = page.layers[handle.layerIndex];
        if (layer.handle && !handlesEqual(layer.handle, handle)) {
            if (this.surfacePool.isCurrent(layer.handle)) {
                throw new TypeError("surface fog layer is already owned by another current slot generation");
            }
            this.activeHandles.delete(handleKey(layer.handle));
        }
        const offset = handle.layerIndex * SURFACE_FOG_LAYER_BYTES;
        page.data.set(fog, offset);
        layer.handle = Object.freeze({ ...handle });
        layer.uploaded = true;
        this.activeHandles.set(handleKey(handle), layer.handle);
        page.texture.addLayerUpdate(handle.layerIndex);
        page.texture.needsUpdate = true;
        this.logicalUploadCount += 1;
        return true;
    }

    public getBinding(handle: SurfaceTextureSlotHandle): Readonly<SurfaceFogTextureBinding> {
        assertHandle(handle);
        this.assertReady("bind");
        if (this.surfacePool.state !== "ready") {
            throw new TypeError("surface fog binding requires its surface texture pool to be ready");
        }
        const page = this.pages[handle.pageIndex];
        const layer = page?.layers[handle.layerIndex];
        if (!page || !layer?.handle || !handlesEqual(layer.handle, handle)
            || !layer.uploaded || !this.surfacePool.isCurrent(handle)) {
            throw new RangeError("surface fog texture slot handle is stale or has no uploaded layer");
        }
        return Object.freeze({ slot: handle, texture: page.texture });
    }

    public release(handle: SurfaceTextureSlotHandle): boolean {
        assertHandle(handle);
        this.assertNotDisposed();
        const page = this.pages[handle.pageIndex];
        const layer = page?.layers[handle.layerIndex];
        if (!page || !layer?.handle || !handlesEqual(layer.handle, handle)) {
            this.staleReleaseRejectCount += 1;
            return false;
        }
        page.texture.layerUpdates.delete(handle.layerIndex);
        this.activeHandles.delete(handleKey(handle));
        layer.handle = undefined;
        layer.uploaded = false;
        return true;
    }

    public handleContextLost(): void {
        this.assertNotDisposed();
        if (this.stateValue === "lost") return;
        this.stateValue = "lost";
        for (const page of this.pages) page?.texture.clearLayerUpdates();
    }

    public handleContextRestored(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "lost") {
            throw new TypeError("surface fog texture context can only restore from the lost state");
        }
        if (this.surfacePool.state !== "ready") {
            throw new TypeError("surface fog texture context restores after its surface texture pool");
        }
        if (this.contextGenerationValue === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("surface fog context generation space is exhausted");
        }
        this.stateValue = "ready";
        this.contextGenerationValue += 1;
        this.contextRestoreCount += 1;
        this.pruneReleasedSurfaceSlots();
        for (const page of this.pages) {
            if (!page) continue;
            let changed = false;
            for (let index = 0; index < page.layers.length; index += 1) {
                if (!page.layers[index].uploaded) continue;
                page.texture.addLayerUpdate(index);
                changed = true;
            }
            if (changed) page.texture.needsUpdate = true;
        }
    }

    public pruneReleasedSurfaceSlots(): number {
        this.assertNotDisposed();
        let released = 0;
        for (const handle of [...this.activeHandles.values()]) {
            if (this.surfacePool.isCurrent(handle)) continue;
            if (this.release(handle)) released += 1;
        }
        return released;
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        for (const page of this.pages) page?.texture.dispose();
        this.pages.length = 0;
        this.activeHandles.clear();
        this.stateValue = "disposed";
    }

    public get stats(): Readonly<SurfaceFogTexturePoolStats> {
        let pageCount = 0;
        let uploadedLayers = 0;
        let pendingLayerUploads = 0;
        for (const page of this.pages) {
            if (!page) continue;
            pageCount += 1;
            for (let index = 0; index < page.layers.length; index += 1) {
                if (page.layers[index].uploaded) uploadedLayers += 1;
                if (page.texture.layerUpdates.has(index)) pendingLayerUploads += 1;
            }
        }
        const residentBytes = pageCount * SURFACE_FOG_PAGE_BYTES;
        return Object.freeze({
            state: this.stateValue,
            contextGeneration: this.contextGenerationValue,
            contextRestores: this.contextRestoreCount,
            pageCount,
            activeLayers: this.activeHandles.size,
            uploadedLayers,
            cpuBytes: residentBytes,
            gpuBytes: residentBytes,
            gpuBudgetBytes: this.gpuBudgetBytes,
            pendingLayerUploads,
            logicalUploads: this.logicalUploadCount,
            logicalUploadBytes: this.logicalUploadCount * SURFACE_FOG_LAYER_BYTES,
            staleUploadRejects: this.staleUploadRejectCount,
            staleReleaseRejects: this.staleReleaseRejectCount
        });
    }

    private ensurePage(pageIndex: number): FogPage {
        let page = this.pages[pageIndex];
        if (page) return page;
        const pageCount = this.pages.reduce((count, candidate) => count + (candidate ? 1 : 0), 0);
        if (pageCount >= this.maxPages) {
            throw new RangeError("surface fog texture pool GPU page budget is exhausted");
        }
        page = createPage(pageIndex);
        this.pages[pageIndex] = page;
        return page;
    }

    private assertReady(operation: string): void {
        this.assertNotDisposed();
        if (this.stateValue !== "ready") {
            throw new TypeError(`surface fog texture pool cannot ${operation} while the WebGL context is lost`);
        }
    }

    private assertNotDisposed(): void {
        if (this.stateValue === "disposed") throw new TypeError("surface fog texture pool is disposed");
    }
}
