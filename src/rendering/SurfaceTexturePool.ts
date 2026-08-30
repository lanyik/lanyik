import {
    ByteType,
    ClampToEdgeWrapping,
    DataArrayTexture,
    HalfFloatType,
    NearestFilter,
    NoColorSpace,
    RGBAFormat,
    RGFormat,
    RGBFormat,
    UnsignedByteType
} from "three";

import {
    SURFACE_FIELD_TEXEL_COUNT,
    SURFACE_FIELD_TEXTURE_SIZE,
    SURFACE_TEXTURE_PAGE_LAYERS
} from "../world/semantic/SurfaceCompileProfile";
import {
    assertCompiledSurfaceChunk,
    CompiledSurfaceChunk
} from "../world/semantic/SurfaceCompiler";
import type { RenderChunkKey } from "../world/semantic/SurfaceDependency";

export const SURFACE_VALUES_TEXTURE_CHANNELS = 4;
export const SURFACE_MATERIAL_TEXTURE_CHANNELS = 4;
export const SURFACE_FLOW_TEXTURE_CHANNELS = 2;
export const SURFACE_WATER_TEXTURE_CHANNELS = 3;
export const SURFACE_GPU_BYTES_PER_TEXEL = 17;
export const SURFACE_GPU_LAYER_BYTES =
    SURFACE_FIELD_TEXEL_COUNT * SURFACE_GPU_BYTES_PER_TEXEL;
export const SURFACE_GPU_PAGE_BYTES =
    SURFACE_GPU_LAYER_BYTES * SURFACE_TEXTURE_PAGE_LAYERS;

export const SURFACE_TEXTURE_FORMAT_V1 = Object.freeze({
    values: Object.freeze({
        channels: SURFACE_VALUES_TEXTURE_CHANNELS,
        internalFormat: "RGBA16F" as const,
        fields: Object.freeze(["groundHeight", "waterLevel", "waterDepth", "shorelineDistance"] as const)
    }),
    material: Object.freeze({
        channels: SURFACE_MATERIAL_TEXTURE_CHANNELS,
        internalFormat: "RGBA8" as const,
        fields: Object.freeze(["material0", "material1", "material2", "material3"] as const)
    }),
    flow: Object.freeze({
        channels: SURFACE_FLOW_TEXTURE_CHANNELS,
        internalFormat: "RG8_SNORM" as const,
        fields: Object.freeze(["flowX", "flowY"] as const)
    }),
    water: Object.freeze({
        channels: SURFACE_WATER_TEXTURE_CHANNELS,
        internalFormat: "RGB8" as const,
        fields: Object.freeze(["waterCoverage", "waterKind", "waterProfile"] as const)
    })
});

export type SurfaceTexturePoolState = "ready" | "lost" | "disposed";

export interface SurfaceTexturePoolOptions {
    readonly gpuBudgetBytes: number;
}

export interface SurfaceTextureSlotHandle {
    readonly poolId: number;
    readonly pageIndex: number;
    readonly layerIndex: number;
    readonly generation: number;
}

export interface SurfaceTextureBinding {
    readonly slot: SurfaceTextureSlotHandle;
    readonly valuesTexture: DataArrayTexture;
    readonly materialTexture: DataArrayTexture;
    readonly flowTexture: DataArrayTexture;
    readonly waterTexture: DataArrayTexture;
}

export interface SurfaceTexturePoolStats {
    readonly state: SurfaceTexturePoolState;
    readonly contextGeneration: number;
    readonly contextRestores: number;
    readonly pageCount: number;
    readonly textureCount: number;
    readonly capacitySlots: number;
    readonly reusableSlots: number;
    readonly allocatedSlots: number;
    readonly uploadedSlots: number;
    readonly cpuBytes: number;
    readonly gpuBytes: number;
    readonly gpuBudgetBytes: number;
    readonly gpuBudgetRemainingBytes: number;
    readonly pendingLayerUploads: number;
    readonly pendingUploadBytes: number;
    readonly logicalUploads: number;
    readonly logicalUploadBytes: number;
    readonly staleUploadRejects: number;
    readonly staleReleaseRejects: number;
}

interface SurfaceTextureSlotState {
    generation: number;
    retired: boolean;
    handle?: SurfaceTextureSlotHandle;
    key?: Readonly<RenderChunkKey>;
    uploaded: boolean;
}

interface SurfaceTexturePage {
    readonly pageIndex: number;
    readonly valuesData: Uint16Array;
    readonly materialData: Uint8Array;
    readonly flowData: Int8Array;
    readonly waterData: Uint8Array;
    readonly valuesTexture: DataArrayTexture;
    readonly materialTexture: DataArrayTexture;
    readonly flowTexture: DataArrayTexture;
    readonly waterTexture: DataArrayTexture;
    readonly slots: SurfaceTextureSlotState[];
}

let nextSurfaceTexturePoolId = 1;

function assertOptions(options: SurfaceTexturePoolOptions): void {
    if (!options || typeof options !== "object"
        || Object.getOwnPropertyNames(options).some(name => name !== "gpuBudgetBytes")) {
        throw new TypeError("surface texture pool options are invalid");
    }
    if (!Number.isSafeInteger(options.gpuBudgetBytes) || options.gpuBudgetBytes < 0) {
        throw new RangeError("surface texture pool gpuBudgetBytes must be a non-negative safe integer");
    }
}

function assertRenderKey(key: RenderChunkKey): void {
    if (!key || typeof key !== "object"
        || Object.getOwnPropertyNames(key).some(name => name !== "chunkX" && name !== "chunkY")
        || !Number.isSafeInteger(key.chunkX) || !Number.isSafeInteger(key.chunkY)) {
        throw new TypeError("surface texture allocation requires a canonical render chunk key");
    }
}

function renderKeyString(key: RenderChunkKey): string {
    return `${key.chunkX},${key.chunkY}`;
}

function assertSlotHandle(value: SurfaceTextureSlotHandle): void {
    if (!value || typeof value !== "object"
        || Object.getOwnPropertyNames(value).some(name => ![
            "poolId", "pageIndex", "layerIndex", "generation"
        ].includes(name))
        || !Number.isSafeInteger(value.poolId) || value.poolId <= 0
        || !Number.isInteger(value.pageIndex) || value.pageIndex < 0
        || !Number.isInteger(value.layerIndex) || value.layerIndex < 0
        || value.layerIndex >= SURFACE_TEXTURE_PAGE_LAYERS
        || !Number.isSafeInteger(value.generation) || value.generation <= 0) {
        throw new TypeError("surface texture slot handle is invalid");
    }
}

function configureTexture(
    texture: DataArrayTexture,
    name: string,
    internalFormat: "RGBA16F" | "RGBA8" | "RG8_SNORM" | "RGB8",
    format: typeof RGBAFormat | typeof RGFormat | typeof RGBFormat,
    type: typeof HalfFloatType | typeof UnsignedByteType | typeof ByteType
): DataArrayTexture {
    texture.name = name;
    texture.internalFormat = internalFormat;
    texture.format = format;
    texture.type = type;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    texture.colorSpace = NoColorSpace;
    return texture;
}

function createPage(pageIndex: number): SurfaceTexturePage {
    const valuesData = new Uint16Array(
        SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_VALUES_TEXTURE_CHANNELS
    );
    const materialData = new Uint8Array(
        SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_MATERIAL_TEXTURE_CHANNELS
    );
    const flowData = new Int8Array(
        SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_FLOW_TEXTURE_CHANNELS
    );
    const waterData = new Uint8Array(
        SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_WATER_TEXTURE_CHANNELS
    );
    return {
        pageIndex,
        valuesData,
        materialData,
        flowData,
        waterData,
        valuesTexture: configureTexture(new DataArrayTexture(
            valuesData,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_TEXTURE_PAGE_LAYERS
        ), `surface-values-page-${pageIndex}`, "RGBA16F", RGBAFormat, HalfFloatType),
        materialTexture: configureTexture(new DataArrayTexture(
            materialData,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_TEXTURE_PAGE_LAYERS
        ), `surface-material-page-${pageIndex}`, "RGBA8", RGBAFormat, UnsignedByteType),
        flowTexture: configureTexture(new DataArrayTexture(
            flowData,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_TEXTURE_PAGE_LAYERS
        ), `surface-flow-page-${pageIndex}`, "RG8_SNORM", RGFormat, ByteType),
        waterTexture: configureTexture(new DataArrayTexture(
            waterData,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_FIELD_TEXTURE_SIZE,
            SURFACE_TEXTURE_PAGE_LAYERS
        ), `surface-water-page-${pageIndex}`, "RGB8", RGBFormat, UnsignedByteType),
        slots: Array.from({ length: SURFACE_TEXTURE_PAGE_LAYERS }, () => ({
            generation: 1,
            retired: false,
            uploaded: false
        }))
    };
}

function pageTextures(page: SurfaceTexturePage): readonly DataArrayTexture[] {
    return [page.valuesTexture, page.materialTexture, page.flowTexture, page.waterTexture];
}

function textureTexelOffset(layerIndex: number, x: number, y: number, channels: number): number {
    return (layerIndex * SURFACE_FIELD_TEXEL_COUNT
        + y * SURFACE_FIELD_TEXTURE_SIZE + x) * channels;
}

function packCompiledLayer(page: SurfaceTexturePage, layerIndex: number, chunk: CompiledSurfaceChunk): void {
    for (let y = 0; y < SURFACE_FIELD_TEXTURE_SIZE; y += 1) {
        for (let x = 0; x < SURFACE_FIELD_TEXTURE_SIZE; x += 1) {
            const source = x * SURFACE_FIELD_TEXTURE_SIZE + y;
            const valuesOffset = textureTexelOffset(layerIndex, x, y, SURFACE_VALUES_TEXTURE_CHANNELS);
            page.valuesData[valuesOffset] = chunk.field.groundHeight[source];
            page.valuesData[valuesOffset + 1] = chunk.field.waterLevel[source];
            page.valuesData[valuesOffset + 2] = chunk.field.waterDepth[source];
            page.valuesData[valuesOffset + 3] = chunk.field.shorelineDistance[source];

            const materialOffset = textureTexelOffset(layerIndex, x, y, SURFACE_MATERIAL_TEXTURE_CHANNELS);
            const sourceMaterialOffset = source * SURFACE_MATERIAL_TEXTURE_CHANNELS;
            page.materialData[materialOffset] = chunk.field.materialWeights[sourceMaterialOffset];
            page.materialData[materialOffset + 1] = chunk.field.materialWeights[sourceMaterialOffset + 1];
            page.materialData[materialOffset + 2] = chunk.field.materialWeights[sourceMaterialOffset + 2];
            page.materialData[materialOffset + 3] = chunk.field.materialWeights[sourceMaterialOffset + 3];

            const flowOffset = textureTexelOffset(layerIndex, x, y, SURFACE_FLOW_TEXTURE_CHANNELS);
            page.flowData[flowOffset] = chunk.field.flow[source * SURFACE_FLOW_TEXTURE_CHANNELS];
            page.flowData[flowOffset + 1] = chunk.field.flow[source * SURFACE_FLOW_TEXTURE_CHANNELS + 1];

            const waterOffset = textureTexelOffset(layerIndex, x, y, SURFACE_WATER_TEXTURE_CHANNELS);
            page.waterData[waterOffset] = chunk.field.waterCoverage[source];
            page.waterData[waterOffset + 1] = chunk.field.waterKind[source];
            page.waterData[waterOffset + 2] = chunk.field.waterProfile[source];
        }
    }
}

function markLayerUpdate(page: SurfaceTexturePage, layerIndex: number): void {
    for (const texture of pageTextures(page)) {
        texture.addLayerUpdate(layerIndex);
        texture.needsUpdate = true;
    }
}

function forgetLayerUpdate(page: SurfaceTexturePage, layerIndex: number): void {
    for (const texture of pageTextures(page)) texture.layerUpdates.delete(layerIndex);
}

export class SurfaceTexturePool {
    public readonly poolId: number;
    private readonly pages: SurfaceTexturePage[] = [];
    private readonly activeByRenderKey = new Map<string, SurfaceTextureSlotHandle>();
    private readonly maxPages: number;
    private readonly gpuBudgetBytes: number;
    private stateValue: SurfaceTexturePoolState = "ready";
    private contextGenerationValue = 1;
    private contextRestoreCount = 0;
    private logicalUploadCount = 0;
    private logicalUploadByteCount = 0;
    private staleUploadRejectCount = 0;
    private staleReleaseRejectCount = 0;

    constructor(options: SurfaceTexturePoolOptions) {
        assertOptions(options);
        if (nextSurfaceTexturePoolId > Number.MAX_SAFE_INTEGER) {
            throw new RangeError("surface texture pool identity space is exhausted");
        }
        this.poolId = nextSurfaceTexturePoolId;
        nextSurfaceTexturePoolId += 1;
        this.gpuBudgetBytes = options.gpuBudgetBytes;
        this.maxPages = Math.floor(this.gpuBudgetBytes / SURFACE_GPU_PAGE_BYTES);
    }

    public get state(): SurfaceTexturePoolState { return this.stateValue; }

    public allocate(key: RenderChunkKey): SurfaceTextureSlotHandle {
        this.assertReady("allocate");
        assertRenderKey(key);
        const keyString = renderKeyString(key);
        if (this.activeByRenderKey.has(keyString)) {
            throw new TypeError("render chunk already owns a surface texture slot");
        }
        let page: SurfaceTexturePage | undefined;
        let layerIndex = -1;
        for (const candidate of this.pages) {
            const candidateLayer = candidate.slots.findIndex(slot => !slot.retired && !slot.handle);
            if (candidateLayer >= 0) {
                page = candidate;
                layerIndex = candidateLayer;
                break;
            }
        }
        if (!page) {
            if (this.pages.length >= this.maxPages) {
                throw new RangeError("surface texture pool GPU page budget is exhausted");
            }
            page = createPage(this.pages.length);
            this.pages.push(page);
            layerIndex = 0;
        }
        const slot = page.slots[layerIndex];
        const handle = Object.freeze({
            poolId: this.poolId,
            pageIndex: page.pageIndex,
            layerIndex,
            generation: slot.generation
        });
        slot.handle = handle;
        slot.key = Object.freeze({ ...key });
        slot.uploaded = false;
        this.activeByRenderKey.set(keyString, handle);
        return handle;
    }

    public upload(handle: SurfaceTextureSlotHandle, chunk: CompiledSurfaceChunk): boolean {
        assertSlotHandle(handle);
        const resolved = this.resolveCurrent(handle);
        if (!resolved) {
            this.staleUploadRejectCount += 1;
            return false;
        }
        this.assertReady("upload");
        assertCompiledSurfaceChunk(chunk);
        if (chunk.key.chunkX !== resolved.slot.key!.chunkX
            || chunk.key.chunkY !== resolved.slot.key!.chunkY) {
            throw new TypeError("compiled surface chunk does not match its reserved texture slot");
        }
        packCompiledLayer(resolved.page, handle.layerIndex, chunk);
        resolved.slot.uploaded = true;
        markLayerUpdate(resolved.page, handle.layerIndex);
        this.logicalUploadCount += 1;
        this.logicalUploadByteCount += SURFACE_GPU_LAYER_BYTES;
        return true;
    }

    public release(handle: SurfaceTextureSlotHandle): boolean {
        assertSlotHandle(handle);
        this.assertNotDisposed();
        const resolved = this.resolveCurrent(handle);
        if (!resolved) {
            this.staleReleaseRejectCount += 1;
            return false;
        }
        this.activeByRenderKey.delete(renderKeyString(resolved.slot.key!));
        forgetLayerUpdate(resolved.page, handle.layerIndex);
        resolved.slot.handle = undefined;
        resolved.slot.key = undefined;
        resolved.slot.uploaded = false;
        if (resolved.slot.generation === Number.MAX_SAFE_INTEGER) {
            resolved.slot.retired = true;
        } else {
            resolved.slot.generation += 1;
        }
        return true;
    }

    public isCurrent(handle: SurfaceTextureSlotHandle): boolean {
        assertSlotHandle(handle);
        if (this.stateValue === "disposed") return false;
        return Boolean(this.resolveCurrent(handle));
    }

    public getBinding(handle: SurfaceTextureSlotHandle): Readonly<SurfaceTextureBinding> {
        assertSlotHandle(handle);
        this.assertReady("bind");
        const resolved = this.resolveCurrent(handle);
        if (!resolved) throw new RangeError("surface texture slot handle is stale");
        if (!resolved.slot.uploaded) throw new TypeError("surface texture slot has not received a compiled field");
        return Object.freeze({
            slot: handle,
            valuesTexture: resolved.page.valuesTexture,
            materialTexture: resolved.page.materialTexture,
            flowTexture: resolved.page.flowTexture,
            waterTexture: resolved.page.waterTexture
        });
    }

    public handleContextLost(): void {
        this.assertNotDisposed();
        if (this.stateValue === "lost") return;
        this.stateValue = "lost";
        for (const page of this.pages) {
            for (const texture of pageTextures(page)) texture.clearLayerUpdates();
        }
    }

    public handleContextRestored(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "lost") {
            throw new TypeError("surface texture context can only restore from the lost state");
        }
        if (this.contextGenerationValue === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("surface texture context generation space is exhausted");
        }
        this.stateValue = "ready";
        this.contextGenerationValue += 1;
        this.contextRestoreCount += 1;
        for (const page of this.pages) {
            let hasUpdates = false;
            for (let layerIndex = 0; layerIndex < page.slots.length; layerIndex += 1) {
                if (!page.slots[layerIndex].uploaded) continue;
                for (const texture of pageTextures(page)) texture.addLayerUpdate(layerIndex);
                hasUpdates = true;
            }
            if (hasUpdates) for (const texture of pageTextures(page)) texture.needsUpdate = true;
        }
    }

    public clear(): void {
        this.assertNotDisposed();
        const handles = [...this.activeByRenderKey.values()];
        for (const handle of handles) this.release(handle);
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        this.clear();
        for (const page of this.pages) {
            for (const texture of pageTextures(page)) texture.dispose();
        }
        this.pages.length = 0;
        this.activeByRenderKey.clear();
        this.stateValue = "disposed";
    }

    public get stats(): Readonly<SurfaceTexturePoolStats> {
        let reusableSlots = 0;
        let uploadedSlots = 0;
        let pendingLayerUploads = 0;
        for (const page of this.pages) {
            for (const slot of page.slots) {
                if (!slot.retired && !slot.handle) reusableSlots += 1;
                if (slot.uploaded) uploadedSlots += 1;
            }
            const textures = pageTextures(page);
            for (let layerIndex = 0; layerIndex < SURFACE_TEXTURE_PAGE_LAYERS; layerIndex += 1) {
                if (textures.some(texture => texture.layerUpdates.has(layerIndex))) {
                    pendingLayerUploads += 1;
                }
            }
        }
        const residentBytes = this.pages.length * SURFACE_GPU_PAGE_BYTES;
        return Object.freeze({
            state: this.stateValue,
            contextGeneration: this.contextGenerationValue,
            contextRestores: this.contextRestoreCount,
            pageCount: this.pages.length,
            textureCount: this.pages.length * 4,
            capacitySlots: this.pages.length * SURFACE_TEXTURE_PAGE_LAYERS,
            reusableSlots,
            allocatedSlots: this.activeByRenderKey.size,
            uploadedSlots,
            cpuBytes: residentBytes,
            gpuBytes: residentBytes,
            gpuBudgetBytes: this.gpuBudgetBytes,
            gpuBudgetRemainingBytes: this.gpuBudgetBytes - residentBytes,
            pendingLayerUploads,
            pendingUploadBytes: pendingLayerUploads * SURFACE_GPU_LAYER_BYTES,
            logicalUploads: this.logicalUploadCount,
            logicalUploadBytes: this.logicalUploadByteCount,
            staleUploadRejects: this.staleUploadRejectCount,
            staleReleaseRejects: this.staleReleaseRejectCount
        });
    }

    private resolveCurrent(handle: SurfaceTextureSlotHandle): Readonly<{
        page: SurfaceTexturePage;
        slot: SurfaceTextureSlotState;
    }> | undefined {
        if (handle.poolId !== this.poolId) return undefined;
        const page = this.pages[handle.pageIndex];
        const slot = page?.slots[handle.layerIndex];
        if (!page || !slot || slot.generation !== handle.generation || !slot.handle) return undefined;
        return { page, slot };
    }

    private assertReady(operation: string): void {
        this.assertNotDisposed();
        if (this.stateValue !== "ready") {
            throw new TypeError(`surface texture pool cannot ${operation} while the WebGL context is lost`);
        }
    }

    private assertNotDisposed(): void {
        if (this.stateValue === "disposed") throw new TypeError("surface texture pool is disposed");
    }
}
