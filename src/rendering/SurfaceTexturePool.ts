import {
    ByteType,
    ClampToEdgeWrapping,
    DataArrayTexture,
    HalfFloatType,
    NearestFilter,
    NoColorSpace,
    PixelFormatGPU,
    RedFormat,
    RGBAFormat,
    RGFormat,
    UnsignedByteType
} from "three";

import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    assertCompiledSurfaceField
} from "../world/CompiledSurfaceField";
import { SURFACE_COMPILE_PROFILE } from "../world/SurfaceCompileProfile";

export const SURFACE_STATIC_GPU_BYTES_PER_TEXEL = 18;
export const SURFACE_FOG_GPU_BYTES_PER_TEXEL = 1;
export const SURFACE_TEXTURE_PAGE_GPU_BYTES = COMPILED_SURFACE_TEXEL_COUNT
    * SURFACE_COMPILE_PROFILE.pageLayers
    * (SURFACE_STATIC_GPU_BYTES_PER_TEXEL + SURFACE_FOG_GPU_BYTES_PER_TEXEL);

export interface SurfaceTextureCapabilitySource {
    readonly MAX_TEXTURE_SIZE: number;
    readonly MAX_ARRAY_TEXTURE_LAYERS: number;
    getParameter(parameter: number): unknown;
    readonly texStorage3D: unknown;
}

export interface SurfaceArrayTextureCapabilities {
    readonly maxTextureSize: number;
    readonly maxArrayTextureLayers: number;
}

export interface SurfaceTexturePoolOptions {
    readonly maximumPages: number;
}

export interface SurfaceTextureSlotHandle {
    readonly pageIndex: number;
    readonly layerIndex: number;
    readonly generation: number;
}

export interface SurfaceTexturePageBindings {
    readonly pageIndex: number;
    readonly elevation: DataArrayTexture;
    readonly material: DataArrayTexture;
    readonly flow: DataArrayTexture;
    readonly water: DataArrayTexture;
    readonly fog: DataArrayTexture;
}

export interface SurfaceTexturePoolStats {
    readonly maximumPages: number;
    readonly pageRecords: number;
    readonly allocatedPages: number;
    readonly residentSlots: number;
    readonly maximumSlots: number;
    readonly allocatedGpuBytes: number;
    readonly stagingBytes: number;
}

interface SurfaceTexturePageResources extends SurfaceTexturePageBindings {
    readonly elevationData: Uint16Array;
    readonly materialData: Uint8Array;
    readonly flowData: Int8Array;
    readonly waterData: Uint8Array;
    readonly fogData: Uint8Array;
}

interface SurfaceTexturePageRecord {
    readonly pageIndex: number;
    readonly generation: number[];
    readonly allocated: Uint8Array;
    residentSlots: number;
    resources?: SurfaceTexturePageResources;
}

function positiveSafeInteger(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive safe integer`);
    }
}

function assertSlotHandle(handle: Readonly<SurfaceTextureSlotHandle>): void {
    if (!handle || typeof handle !== "object"
        || !Number.isSafeInteger(handle.pageIndex) || handle.pageIndex < 0
        || !Number.isInteger(handle.layerIndex) || handle.layerIndex < 0
        || handle.layerIndex >= SURFACE_COMPILE_PROFILE.pageLayers
        || !Number.isSafeInteger(handle.generation) || handle.generation <= 0) {
        throw new TypeError("surface texture slot handle is invalid");
    }
}

export function readSurfaceArrayTextureCapabilities(
    source: Readonly<SurfaceTextureCapabilitySource>
): SurfaceArrayTextureCapabilities {
    if (!source || typeof source !== "object" || typeof source.getParameter !== "function"
        || typeof source.texStorage3D !== "function") {
        throw new TypeError("surface texture pool requires a WebGL2 capability source");
    }
    const maxTextureSize = source.getParameter(source.MAX_TEXTURE_SIZE);
    const maxArrayTextureLayers = source.getParameter(source.MAX_ARRAY_TEXTURE_LAYERS);
    if (!Number.isInteger(maxTextureSize) || (maxTextureSize as number) < SURFACE_COMPILE_PROFILE.textureLayerSize
        || !Number.isInteger(maxArrayTextureLayers)
        || (maxArrayTextureLayers as number) < SURFACE_COMPILE_PROFILE.pageLayers) {
        throw new Error("WebGL2 does not satisfy the frozen surface array-texture profile");
    }
    return Object.freeze({
        maxTextureSize: maxTextureSize as number,
        maxArrayTextureLayers: maxArrayTextureLayers as number
    });
}

function configureTexture(
    texture: DataArrayTexture,
    name: string,
    internalFormat: PixelFormatGPU
): DataArrayTexture {
    texture.name = name;
    texture.internalFormat = internalFormat;
    texture.colorSpace = NoColorSpace;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    // DataArrayTexture's runtime contract is Wrapping; @types/three r185
    // incorrectly narrows wrapR to boolean.
    (texture as unknown as { wrapR: typeof ClampToEdgeWrapping }).wrapR = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    return texture;
}

function createPageResources(pageIndex: number): SurfaceTexturePageResources {
    const width = SURFACE_COMPILE_PROFILE.textureLayerSize;
    const layers = SURFACE_COMPILE_PROFILE.pageLayers;
    const texels = COMPILED_SURFACE_TEXEL_COUNT * layers;
    const elevationData = new Uint16Array(texels * 4);
    const materialData = new Uint8Array(texels * 4);
    const flowData = new Int8Array(texels * 2);
    const waterData = new Uint8Array(texels * 4);
    const fogData = new Uint8Array(texels);
    const elevation = configureTexture(
        new DataArrayTexture(elevationData, width, width, layers),
        `surface-elevation-page-${pageIndex}`,
        "RGBA16F"
    );
    elevation.format = RGBAFormat;
    elevation.type = HalfFloatType;
    const material = configureTexture(
        new DataArrayTexture(materialData, width, width, layers),
        `surface-material-page-${pageIndex}`,
        "RGBA8"
    );
    material.format = RGBAFormat;
    material.type = UnsignedByteType;
    const flow = configureTexture(
        new DataArrayTexture(flowData, width, width, layers),
        `surface-flow-page-${pageIndex}`,
        "RG8_SNORM"
    );
    flow.format = RGFormat;
    flow.type = ByteType;
    const water = configureTexture(
        new DataArrayTexture(waterData, width, width, layers),
        `surface-water-page-${pageIndex}`,
        "RGBA8"
    );
    water.format = RGBAFormat;
    water.type = UnsignedByteType;
    const fog = configureTexture(
        new DataArrayTexture(fogData, width, width, layers),
        `surface-fog-page-${pageIndex}`,
        "R8"
    );
    fog.format = RedFormat;
    fog.type = UnsignedByteType;
    return {
        pageIndex,
        elevation,
        material,
        flow,
        water,
        fog,
        elevationData,
        materialData,
        flowData,
        waterData,
        fogData
    };
}

function markLayer(texture: DataArrayTexture, layerIndex: number): void {
    texture.addLayerUpdate(layerIndex);
    texture.needsUpdate = true;
}

function markAllLayerResources(resources: Readonly<SurfaceTexturePageResources>, layerIndex: number): void {
    markLayer(resources.elevation, layerIndex);
    markLayer(resources.material, layerIndex);
    markLayer(resources.flow, layerIndex);
    markLayer(resources.water, layerIndex);
    markLayer(resources.fog, layerIndex);
}

function disposePageResources(resources: Readonly<SurfaceTexturePageResources>): void {
    resources.elevation.dispose();
    resources.material.dispose();
    resources.flow.dispose();
    resources.water.dispose();
    resources.fog.dispose();
}

export class SurfaceTexturePool {
    private readonly maximumPages: number;
    private readonly pages: SurfaceTexturePageRecord[] = [];
    private residentSlots = 0;
    private disposed = false;

    constructor(
        capabilitySource: Readonly<SurfaceTextureCapabilitySource>,
        options: Readonly<SurfaceTexturePoolOptions>
    ) {
        readSurfaceArrayTextureCapabilities(capabilitySource);
        if (!options || typeof options !== "object") {
            throw new TypeError("surface texture pool options are required");
        }
        positiveSafeInteger("surface texture maximum page count", options.maximumPages);
        this.maximumPages = options.maximumPages;
        if (!Number.isSafeInteger(this.maximumPages * SURFACE_COMPILE_PROFILE.pageLayers)
            || !Number.isSafeInteger(this.maximumPages * SURFACE_TEXTURE_PAGE_GPU_BYTES)) {
            throw new RangeError("surface texture pool capacity exceeds the safe integer range");
        }
    }

    public allocate(): SurfaceTextureSlotHandle {
        this.assertActive();
        let page = this.pages.find(candidate => candidate.residentSlots < SURFACE_COMPILE_PROFILE.pageLayers);
        if (!page) {
            if (this.pages.length >= this.maximumPages) {
                throw new Error("surface texture pool exhausted its fixed page budget");
            }
            page = {
                pageIndex: this.pages.length,
                generation: new Array<number>(SURFACE_COMPILE_PROFILE.pageLayers).fill(1),
                allocated: new Uint8Array(SURFACE_COMPILE_PROFILE.pageLayers),
                residentSlots: 0
            };
            this.pages.push(page);
        }
        const layerIndex = page.allocated.indexOf(0);
        if (layerIndex < 0) throw new Error("surface texture page free-slot accounting is inconsistent");
        page.allocated[layerIndex] = 1;
        page.residentSlots += 1;
        this.residentSlots += 1;
        const resources = this.resourcesFor(page);
        this.clearLayer(resources, layerIndex);
        markAllLayerResources(resources, layerIndex);
        return Object.freeze({
            pageIndex: page.pageIndex,
            layerIndex,
            generation: page.generation[layerIndex]
        });
    }

    public release(handle: Readonly<SurfaceTextureSlotHandle>): boolean {
        assertSlotHandle(handle);
        if (!this.isCurrent(handle)) return false;
        const page = this.pages[handle.pageIndex];
        if (page.generation[handle.layerIndex] >= Number.MAX_SAFE_INTEGER) {
            throw new RangeError("surface texture slot generation space is exhausted");
        }
        page.allocated[handle.layerIndex] = 0;
        page.generation[handle.layerIndex] += 1;
        page.residentSlots -= 1;
        this.residentSlots -= 1;
        if (page.residentSlots === 0 && page.resources) {
            disposePageResources(page.resources);
            page.resources = undefined;
        }
        return true;
    }

    public isCurrent(handle: Readonly<SurfaceTextureSlotHandle>): boolean {
        assertSlotHandle(handle);
        if (this.disposed) return false;
        const page = this.pages[handle.pageIndex];
        return page !== undefined
            && page.allocated[handle.layerIndex] === 1
            && page.generation[handle.layerIndex] === handle.generation;
    }

    public uploadSurface(
        handle: Readonly<SurfaceTextureSlotHandle>,
        field: Readonly<CompiledSurfaceField>
    ): boolean {
        assertSlotHandle(handle);
        if (!this.isCurrent(handle)) return false;
        assertCompiledSurfaceField(field);
        const resources = this.resourcesFor(this.pages[handle.pageIndex]);
        const texelOffset = handle.layerIndex * COMPILED_SURFACE_TEXEL_COUNT;
        const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
        for (let texelX = 0; texelX < size; texelX += 1) {
            for (let texelY = 0; texelY < size; texelY += 1) {
                const source = texelX * size + texelY;
                const destination = texelOffset + texelY * size + texelX;
                const elevation = destination * 4;
                const material = destination * 4;
                const sourceMaterial = source * 4;
                const packedFlow = destination * 2;
                const sourceFlow = source * 2;
                resources.elevationData[elevation] = field.groundHeight[source];
                resources.elevationData[elevation + 1] = field.waterLevel[source];
                resources.elevationData[elevation + 2] = field.waterDepth[source];
                resources.elevationData[elevation + 3] = field.shorelineDistance[source];
                resources.materialData[material] = field.materialWeights[sourceMaterial];
                resources.materialData[material + 1] = field.materialWeights[sourceMaterial + 1];
                resources.materialData[material + 2] = field.materialWeights[sourceMaterial + 2];
                resources.materialData[material + 3] = field.materialWeights[sourceMaterial + 3];
                resources.flowData[packedFlow] = field.flow[sourceFlow];
                resources.flowData[packedFlow + 1] = field.flow[sourceFlow + 1];
                resources.waterData[elevation] = field.waterCoverage[source];
                resources.waterData[elevation + 1] = field.waterKind[source];
                resources.waterData[elevation + 2] = field.waterProfile[source];
                resources.waterData[elevation + 3] = 0;
            }
        }
        markLayer(resources.elevation, handle.layerIndex);
        markLayer(resources.material, handle.layerIndex);
        markLayer(resources.flow, handle.layerIndex);
        markLayer(resources.water, handle.layerIndex);
        return true;
    }

    public uploadFog(handle: Readonly<SurfaceTextureSlotHandle>, fog: Uint8Array): boolean {
        assertSlotHandle(handle);
        if (!this.isCurrent(handle)) return false;
        if (!(fog instanceof Uint8Array) || fog.length !== COMPILED_SURFACE_TEXEL_COUNT) {
            throw new TypeError("surface fog layer does not match the fixed physical texture layout");
        }
        const resources = this.resourcesFor(this.pages[handle.pageIndex]);
        const texelOffset = handle.layerIndex * COMPILED_SURFACE_TEXEL_COUNT;
        const size = SURFACE_COMPILE_PROFILE.textureLayerSize;
        for (let texelX = 0; texelX < size; texelX += 1) {
            for (let texelY = 0; texelY < size; texelY += 1) {
                resources.fogData[texelOffset + texelY * size + texelX] = fog[texelX * size + texelY];
            }
        }
        markLayer(resources.fog, handle.layerIndex);
        return true;
    }

    public getPageBindings(pageIndex: number): SurfaceTexturePageBindings | undefined {
        this.assertActive();
        if (!Number.isInteger(pageIndex) || pageIndex < 0) {
            throw new RangeError("surface texture page index must be a non-negative integer");
        }
        const resources = this.pages[pageIndex]?.resources;
        if (!resources) return undefined;
        return Object.freeze({
            pageIndex,
            elevation: resources.elevation,
            material: resources.material,
            flow: resources.flow,
            water: resources.water,
            fog: resources.fog
        });
    }

    public restoreContext(): void {
        this.assertActive();
        for (const page of this.pages) {
            if (!page.resources) continue;
            const textures = [
                page.resources.elevation,
                page.resources.material,
                page.resources.flow,
                page.resources.water,
                page.resources.fog
            ];
            for (const texture of textures) texture.clearLayerUpdates();
            for (let layerIndex = 0; layerIndex < page.allocated.length; layerIndex += 1) {
                if (page.allocated[layerIndex] === 1) {
                    for (const texture of textures) texture.addLayerUpdate(layerIndex);
                }
            }
            for (const texture of textures) texture.needsUpdate = true;
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const page of this.pages) {
            if (page.resources) disposePageResources(page.resources);
            page.resources = undefined;
            page.allocated.fill(0);
            page.residentSlots = 0;
        }
        this.residentSlots = 0;
    }

    public get stats(): Readonly<SurfaceTexturePoolStats> {
        const allocatedPages = this.pages.reduce(
            (count, page) => count + (page.resources ? 1 : 0),
            0
        );
        return Object.freeze({
            maximumPages: this.maximumPages,
            pageRecords: this.pages.length,
            allocatedPages,
            residentSlots: this.residentSlots,
            maximumSlots: this.maximumPages * SURFACE_COMPILE_PROFILE.pageLayers,
            allocatedGpuBytes: allocatedPages * SURFACE_TEXTURE_PAGE_GPU_BYTES,
            stagingBytes: allocatedPages * SURFACE_TEXTURE_PAGE_GPU_BYTES
        });
    }

    private resourcesFor(page: SurfaceTexturePageRecord): SurfaceTexturePageResources {
        if (!page.resources) page.resources = createPageResources(page.pageIndex);
        return page.resources;
    }

    private clearLayer(resources: Readonly<SurfaceTexturePageResources>, layerIndex: number): void {
        const texelOffset = layerIndex * COMPILED_SURFACE_TEXEL_COUNT;
        resources.elevationData.fill(0, texelOffset * 4, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 4);
        resources.materialData.fill(0, texelOffset * 4, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 4);
        resources.flowData.fill(0, texelOffset * 2, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 2);
        resources.waterData.fill(0, texelOffset * 4, (texelOffset + COMPILED_SURFACE_TEXEL_COUNT) * 4);
        resources.fogData.fill(0, texelOffset, texelOffset + COMPILED_SURFACE_TEXEL_COUNT);
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("surface texture pool has been disposed");
    }
}
