import { describe, expect, test } from "vitest";
import { Texture } from "three";

import type { ResidentSurfaceLease } from "../../src/world/semantic/SurfaceCompilationService";
import type { TransferableEffectiveWindow } from "../../src/world/semantic/EffectiveSurfaceWindow";
import {
    compileSurfaceChunk,
    type CompiledSurfaceChunk
} from "../../src/world/semantic/SurfaceCompiler";
import type {
    RenderChunkKey,
    SurfaceRequestToken
} from "../../src/world/semantic/SurfaceDependency";
import { GroundLayer } from "../../src/rendering/GroundLayer";
import {
    createLightingState,
    DEFAULT_LIGHTING_STATE,
    LightingStateController
} from "../../src/rendering/LightingState";
import {
    SURFACE_FOG_LAYER_BYTES,
    SURFACE_FOG_PAGE_BYTES,
    SurfaceFogTexturePool
} from "../../src/rendering/SurfaceFogTexturePool";
import {
    createSurfaceGroundGeometry,
    getSurfaceGroundGeometryInfo,
    SURFACE_GROUND_BOUNDARY_INTERVALS,
    SurfaceGroundGeometryPool
} from "../../src/rendering/SurfaceGroundGeometry";
import {
    SURFACE_GPU_PAGE_BYTES,
    SurfaceTexturePool
} from "../../src/rendering/SurfaceTexturePool";

function compiledFlatChunk(
    key: RenderChunkKey,
    effectiveRevision = 0,
    height = 50_000
): CompiledSurfaceChunk {
    const size = 20;
    const count = size * size;
    const biomeWeights = new Uint8Array(count * 4);
    for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
    const window: TransferableEffectiveWindow = {
        worldIdentity: "surface-ground-layer-test",
        effectiveRevision,
        key: Object.freeze({ ...key }),
        dependencyKey: Object.freeze({
            worldIdentity: "surface-ground-layer-test",
            renderKey: Object.freeze({ ...key }),
            compilerRevision: 1,
            compileProfileVersion: 1,
            semanticChunks: Object.freeze([]),
            hydrologyRegions: Object.freeze([])
        }),
        validBounds: Object.freeze({ minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 }),
        substrateClass: new Uint8Array(count).fill(1),
        macroHeight: new Uint16Array(count).fill(height),
        biomeWeights,
        climate: new Uint8Array(count * 2).fill(127),
        vegetationDensity: new Uint8Array(count),
        vegetationProfile: new Uint8Array(count),
        rivers: Object.freeze([]),
        lakes: Object.freeze([])
    };
    return compileSurfaceChunk(window);
}

function createLease(chunk: CompiledSurfaceChunk): ResidentSurfaceLease {
    let released = false;
    let current = true;
    const requestToken = Object.freeze({
        sessionEpoch: 1,
        renderChunkGeneration: chunk.effectiveRevision + 1
    }) as SurfaceRequestToken;
    const lease = {
        requestToken,
        effectiveRevision: chunk.effectiveRevision,
        dependencyKey: chunk.dependencyKey,
        chunk,
        get released() { return released; },
        isCurrent: () => current && !released,
        release: () => {
            if (released) return false;
            released = true;
            current = false;
            return true;
        }
    };
    return Object.freeze(lease);
}

function surfaceCoordinates(geometry: ReturnType<typeof createSurfaceGroundGeometry>): Float32Array {
    return geometry.getAttribute("surfaceUv").array as Float32Array;
}

function boundaryCoordinates(geometry: ReturnType<typeof createSurfaceGroundGeometry>): readonly string[] {
    const coordinates = surfaceCoordinates(geometry);
    const result = new Set<string>();
    for (let index = 0; index < coordinates.length; index += 2) {
        const u = coordinates[index];
        const v = coordinates[index + 1];
        if (u === -0.5 || u === 15.5 || v === -0.5 || v === 15.5) result.add(`${u},${v}`);
    }
    return [...result].sort();
}

function topologyMetrics(geometry: ReturnType<typeof createSurfaceGroundGeometry>): Readonly<{
    area: number;
    boundaryEdges: number;
    maximumEdgeUse: number;
}> {
    const coordinates = surfaceCoordinates(geometry);
    const indices = geometry.getIndex()!.array;
    const edges = new Map<string, number>();
    let area = 0;
    for (let offset = 0; offset < indices.length; offset += 3) {
        const a = Number(indices[offset]);
        const b = Number(indices[offset + 1]);
        const c = Number(indices[offset + 2]);
        const ax = coordinates[a * 2];
        const ay = coordinates[a * 2 + 1];
        const bx = coordinates[b * 2];
        const by = coordinates[b * 2 + 1];
        const cx = coordinates[c * 2];
        const cy = coordinates[c * 2 + 1];
        const twiceArea = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
        expect(twiceArea).toBeGreaterThan(0);
        area += twiceArea / 2;
        for (const [first, second] of [[a, b], [b, c], [c, a]]) {
            const edge = first < second ? `${first},${second}` : `${second},${first}`;
            edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
    }
    return {
        area,
        boundaryEdges: [...edges.values()].filter(count => count === 1).length,
        maximumEdgeUse: Math.max(...edges.values())
    };
}

describe("v2 shared ground geometry", () => {
    test("keeps every canonical boundary vertex identical across all three LODs", () => {
        const geometries = [0, 1, 2].map(lod => createSurfaceGroundGeometry(lod as 0 | 1 | 2));
        const boundaries = geometries.map(boundaryCoordinates);
        expect(boundaries[0]).toEqual(boundaries[1]);
        expect(boundaries[1]).toEqual(boundaries[2]);
        expect(boundaries[0]).toHaveLength(SURFACE_GROUND_BOUNDARY_INTERVALS * 4);
        for (const geometry of geometries) geometry.dispose();
    });

    test("uses a welded manifold transition strip without holes or overlapping triangles", () => {
        const geometries = [0, 1, 2].map(lod => createSurfaceGroundGeometry(lod as 0 | 1 | 2));
        const infos = geometries.map(getSurfaceGroundGeometryInfo);
        expect(infos[0].vertexCount).toBeGreaterThan(infos[1].vertexCount);
        expect(infos[1].vertexCount).toBeGreaterThan(infos[2].vertexCount);
        expect(infos[0].triangleCount).toBeGreaterThan(infos[1].triangleCount);
        expect(infos[1].triangleCount).toBeGreaterThan(infos[2].triangleCount);
        for (const geometry of geometries) {
            const metrics = topologyMetrics(geometry);
            expect(metrics.area).toBeCloseTo(16 * 16, 10);
            expect(metrics.boundaryEdges).toBe(SURFACE_GROUND_BOUNDARY_INTERVALS * 4);
            expect(metrics.maximumEdgeUse).toBe(2);
            geometry.dispose();
        }
    });

    test("creates each immutable LOD once and accounts its exact buffer bytes", () => {
        const pool = new SurfaceGroundGeometryPool(2, 8);
        expect(pool.get(1)).toBe(pool.get(1));
        pool.get(0);
        pool.get(2);
        const expectedBytes = [0, 1, 2].reduce(
            (total, lod) => total + getSurfaceGroundGeometryInfo(pool.get(lod as 0 | 1 | 2)).byteLength,
            0
        );
        expect(pool.stats).toMatchObject({ geometryCount: 3, byteLength: expectedBytes });
        pool.dispose();
        expect(pool.stats).toMatchObject({ state: "disposed", geometryCount: 0, byteLength: 0 });
        expect(() => pool.get(0)).toThrow(/disposed/);
    });
});

describe("v2 lighting state", () => {
    test("publishes normalized immutable state through CAS and updates all bound uniforms", () => {
        const controller = new LightingStateController();
        const first = controller.bindUniforms();
        const second = controller.bindUniforms();
        const environment = new Texture();
        const next = createLightingState({
            ...DEFAULT_LIGHTING_STATE,
            uniformRevision: 1,
            sunDirection: { x: 0, y: 3, z: 4 },
            sunRadiance: { r: 2, g: 1.5, b: 1 },
            specularEnvironment: { identity: "test-environment", texture: environment },
            environmentRevision: 1,
            exposure: 0.8
        });
        controller.publish(next, 0);
        expect(first.sunDirection.value.x).toBe(0);
        expect(first.sunDirection.value.y).toBeCloseTo(0.6, 12);
        expect(first.sunDirection.value.z).toBeCloseTo(0.8, 12);
        expect(second.sunRadiance.value.toArray()).toEqual([2, 1.5, 1]);
        expect(() => controller.publish({ ...next, uniformRevision: 2 }, 0)).toThrow(/conflict/);
        expect(() => controller.publish({
            ...next,
            uniformRevision: 2,
            specularEnvironment: { identity: "changed-without-revision", texture: environment }
        }, 1)).toThrow(/environment changes/);
        expect(first.release()).toBe(true);
        expect(first.release()).toBe(false);
        controller.dispose();
        expect(second.released).toBe(true);
    });
});

describe("v2 dynamic fog and GroundLayer", () => {
    test("stores fog in an independent R8 page tied to the surface slot generation", () => {
        const surface = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const fog = new SurfaceFogTexturePool({
            surfacePool: surface,
            gpuBudgetBytes: SURFACE_FOG_PAGE_BYTES
        });
        const chunk = compiledFlatChunk({ chunkX: 2, chunkY: -1 });
        const slot = surface.allocate(chunk.key);
        surface.upload(slot, chunk);
        const values = new Uint8Array(SURFACE_FOG_LAYER_BYTES);
        values[7 * 16 + 3] = 219;
        expect(fog.upload(slot, values)).toBe(true);
        const binding = fog.getBinding(slot);
        const data = binding.texture.image.data as Uint8Array;
        expect(data[slot.layerIndex * SURFACE_FOG_LAYER_BYTES + 7 * 16 + 3]).toBe(219);
        expect(binding.texture.internalFormat).toBe("R8");
        expect(fog.stats).toMatchObject({
            pageCount: 1,
            activeLayers: 1,
            cpuBytes: SURFACE_FOG_PAGE_BYTES,
            gpuBytes: SURFACE_FOG_PAGE_BYTES,
            logicalUploadBytes: SURFACE_FOG_LAYER_BYTES
        });

        fog.handleContextLost();
        surface.handleContextLost();
        expect(() => fog.upload(slot, values)).toThrow(/surface texture pool to be ready/);
        expect(() => fog.handleContextRestored()).toThrow(/restores after/);
        surface.handleContextRestored();
        fog.handleContextRestored();
        expect(binding.texture.layerUpdates.has(slot.layerIndex)).toBe(true);
        expect(fog.release(slot)).toBe(true);
        expect(surface.release(slot)).toBe(true);
        expect(fog.upload(slot, values)).toBe(false);
        fog.dispose();
        surface.dispose();
    });

    test("atomically mounts leases, shares page material/LOD geometry and releases companions", () => {
        const surface = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const fog = new SurfaceFogTexturePool({
            surfacePool: surface,
            gpuBudgetBytes: SURFACE_FOG_PAGE_BYTES
        });
        const lighting = new LightingStateController();
        const foreignSurface = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const foreignFog = new SurfaceFogTexturePool({
            surfacePool: foreignSurface,
            gpuBudgetBytes: SURFACE_FOG_PAGE_BYTES
        });
        expect(() => new GroundLayer({
            surfaceTexturePool: surface,
            fogTexturePool: foreignFog,
            lighting
        })).toThrow(/must accompany/);
        foreignFog.dispose();
        foreignSurface.dispose();
        const layer = new GroundLayer({
            surfaceTexturePool: surface,
            fogTexturePool: fog,
            lighting,
            hexSize: 2,
            heightScale: 10
        });
        const firstLease = createLease(compiledFlatChunk({ chunkX: 0, chunkY: 0 }));
        const secondLease = createLease(compiledFlatChunk({ chunkX: 1, chunkY: 0 }));
        const first = layer.mount(firstLease, 0);
        const second = layer.mount(secondLease, 2);
        expect(first.mesh.material).toBe(second.mesh.material);
        expect(first.mesh.geometry).not.toBe(second.mesh.geometry);
        expect(layer.stats).toMatchObject({
            mountedChunks: 2,
            lod0Chunks: 1,
            lod2Chunks: 1,
            materialPages: 1
        });

        expect(layer.setLod(first.key, 1)).toBe(true);
        expect(getSurfaceGroundGeometryInfo(first.mesh.geometry).lod).toBe(1);
        const fogValues = new Uint8Array(SURFACE_FOG_LAYER_BYTES).fill(255);
        expect(layer.uploadFog(first.key, fogValues)).toBe(true);
        expect(layer.stats.foggedChunks).toBe(1);
        layer.setFloatingOrigin(12, -4);
        expect(first.mesh.position.x).toBe(-12);
        expect(first.mesh.position.z).toBe(4);

        const replacementLease = createLease(compiledFlatChunk({ chunkX: 0, chunkY: 0 }, 1, 42_000));
        const replacement = layer.mount(replacementLease, 1);
        expect(replacement.slot).toBe(first.slot);
        expect(firstLease.released).toBe(true);
        expect(replacementLease.released).toBe(false);

        expect(layer.unmount(first.key)).toBe(true);
        expect(replacementLease.released).toBe(true);
        expect(fog.stats.activeLayers).toBe(0);
        expect(surface.stats.allocatedSlots).toBe(1);
        layer.dispose();
        expect(secondLease.released).toBe(true);
        expect(surface.stats.allocatedSlots).toBe(0);
        expect(layer.stats).toMatchObject({ state: "disposed", mountedChunks: 0 });
        fog.dispose();
        surface.dispose();
        lighting.dispose();
    });
});
