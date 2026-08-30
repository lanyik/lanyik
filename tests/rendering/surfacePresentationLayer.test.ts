import { describe, expect, test } from "vitest";

import { SurfacePresentationLayer } from "../../src/rendering/SurfacePresentationLayer";
import { LightingStateController } from "../../src/rendering/LightingState";
import {
    SURFACE_FOG_PAGE_BYTES,
    SurfaceFogTexturePool
} from "../../src/rendering/SurfaceFogTexturePool";
import {
    SURFACE_GPU_PAGE_BYTES,
    SurfaceTexturePool
} from "../../src/rendering/SurfaceTexturePool";
import type { ResidentSurfaceLease } from "../../src/world/semantic/SurfaceCompilationService";
import type {
    SurfaceWindowRiver,
    TransferableEffectiveWindow
} from "../../src/world/semantic/EffectiveSurfaceWindow";
import {
    SURFACE_COMPILER_REVISION,
    SURFACE_EFFECTIVE_WINDOW_SIZE
} from "../../src/world/semantic/SurfaceCompileProfile";
import {
    compileSurfaceChunk,
    type CompiledSurfaceChunk
} from "../../src/world/semantic/SurfaceCompiler";
import { createStableHydrologyId } from "../../src/world/semantic/MacroDrainageGraph";
import type {
    RenderChunkKey,
    SurfaceRequestToken
} from "../../src/world/semantic/SurfaceDependency";

function compiledChunk(
    key: RenderChunkKey,
    options: Readonly<{
        height: number;
        vegetation?: boolean;
        riverWidth?: number;
        effectiveRevision?: number;
    }>
): CompiledSurfaceChunk {
    const count = SURFACE_EFFECTIVE_WINDOW_SIZE ** 2;
    const biomeWeights = new Uint8Array(count * 4);
    for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
    const riverId = createStableHydrologyId("river", [`presentation-${key.chunkX}-${key.chunkY}`]);
    const rivers: readonly SurfaceWindowRiver[] = options.riverWidth === undefined
        ? Object.freeze([])
        : Object.freeze([Object.freeze({
            kind: "river" as const,
            featureKey: riverId,
            bodyId: riverId,
            revision: 1,
            profileIndex: 4,
            controlPoints: new Float64Array([-2, 8, 18, 8]),
            widthProfile: new Uint8Array([options.riverWidth, options.riverWidth]),
            levelProfile: new Uint16Array([45_000, 44_000])
        })]);
    const effectiveRevision = options.effectiveRevision ?? 0;
    const window: TransferableEffectiveWindow = {
        worldIdentity: "surface-presentation-layer-test",
        effectiveRevision,
        key: Object.freeze({ ...key }),
        dependencyKey: Object.freeze({
            worldIdentity: "surface-presentation-layer-test",
            renderKey: Object.freeze({ ...key }),
            compilerRevision: SURFACE_COMPILER_REVISION,
            compileProfileVersion: 1,
            semanticChunks: Object.freeze([]),
            hydrologyRegions: options.riverWidth === undefined ? Object.freeze([]) : Object.freeze([
                Object.freeze({
                    key: Object.freeze({ regionX: 0, regionY: 0 }),
                    baseRevision: 0,
                    features: Object.freeze([Object.freeze({ featureId: riverId, revision: 1 })])
                })
            ])
        }),
        validBounds: Object.freeze({ minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 }),
        substrateClass: new Uint8Array(count).fill(1),
        macroHeight: new Uint16Array(count).fill(options.height),
        biomeWeights,
        climate: new Uint8Array(count * 2).fill(127),
        vegetationDensity: new Uint8Array(count).fill(options.vegetation ? 255 : 0),
        vegetationProfile: new Uint8Array(count).fill(options.vegetation ? 3 : 0),
        rivers,
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
    return Object.freeze({
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
    });
}

describe("v2 surface presentation layer", () => {
    test("mounts full, coverage and sweep water with stable compiled vegetation", () => {
        const surface = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const fog = new SurfaceFogTexturePool({
            surfacePool: surface,
            gpuBudgetBytes: SURFACE_FOG_PAGE_BYTES
        });
        const lighting = new LightingStateController();
        const layer = new SurfacePresentationLayer({
            surfaceTexturePool: surface,
            fogTexturePool: fog,
            lighting,
            hexSize: 2,
            heightScale: 10
        });
        const dryLease = createLease(compiledChunk(
            { chunkX: 0, chunkY: 0 },
            { height: 60_000, vegetation: true }
        ));
        const oceanLease = createLease(compiledChunk(
            { chunkX: 1, chunkY: 0 },
            { height: 0 }
        ));
        const coverageLease = createLease(compiledChunk(
            { chunkX: 2, chunkY: 0 },
            { height: 32_000, riverWidth: 32 }
        ));
        const sweepLease = createLease(compiledChunk(
            { chunkX: 3, chunkY: 0 },
            { height: 32_000, riverWidth: 16 }
        ));

        const dry = layer.mount(dryLease, 0);
        const ocean = layer.mount(oceanLease, 1);
        const coverage = layer.mount(coverageLease, 0);
        const sweep = layer.mount(sweepLease, 0);
        expect(dry.water.kind).toBe("none");
        expect(dry.vegetation.candidateCount).toBeGreaterThan(0);
        expect(ocean.water.kind).toBe("full");
        expect(ocean.water.mesh?.geometry).toBe(ocean.ground.mesh.geometry);
        expect(coverage.water.kind).toBe("coverage");
        expect(sweep.water.kind).toBe("sweep");
        expect(layer.stats.water).toMatchObject({
            fullPatches: 1,
            coverageMeshes: 1,
            sweepMeshes: 1,
            visibleMeshes: 3
        });
        expect(layer.stats.vegetation.visibleInstanceCount).toBe(dry.vegetation.visibleInstanceCount);

        const lod0Vegetation = layer.stats.vegetation.visibleInstanceCount;
        expect(layer.setLod(dry.key, 1)).toBe(true);
        const lod1Vegetation = layer.stats.vegetation.visibleInstanceCount;
        expect(lod1Vegetation).toBeLessThan(lod0Vegetation);
        expect(layer.setLod(dry.key, 2)).toBe(true);
        expect(layer.stats.vegetation.visibleInstanceCount).toBeLessThanOrEqual(lod1Vegetation);
        expect(layer.setLod(ocean.key, 2)).toBe(true);
        expect(ocean.water.mesh?.geometry).toBe(ocean.ground.mesh.geometry);

        layer.setTime(4.25);
        layer.setFloatingOrigin(12, -4);
        expect(ocean.ground.mesh.position.x).toBe(ocean.water.mesh?.position.x);
        expect(ocean.ground.mesh.position.z).toBe(ocean.water.mesh?.position.z);
        expect(dry.vegetation.group.position.x).toBe(dry.ground.mesh.position.x);

        layer.handleContextLost();
        expect(layer.stats.state).toBe("lost");
        expect(() => layer.setTime(5)).toThrow(/context is lost/);
        layer.handleContextRestored();
        expect(layer.stats.state).toBe("ready");

        expect(layer.unmount(coverage.key)).toBe(true);
        expect(coverageLease.released).toBe(true);
        layer.dispose();
        expect(dryLease.released).toBe(true);
        expect(oceanLease.released).toBe(true);
        expect(sweepLease.released).toBe(true);
        expect(surface.stats.allocatedSlots).toBe(0);
        fog.dispose();
        surface.dispose();
        lighting.dispose();
    });

    test("replaces all three companions under one ground-owned lease", () => {
        const surface = new SurfaceTexturePool({ gpuBudgetBytes: SURFACE_GPU_PAGE_BYTES });
        const lighting = new LightingStateController();
        const layer = new SurfacePresentationLayer({ surfaceTexturePool: surface, lighting });
        const key = { chunkX: 0, chunkY: 0 };
        const firstLease = createLease(compiledChunk(key, { height: 60_000, vegetation: true }));
        const secondLease = createLease(compiledChunk(key, {
            height: 0,
            effectiveRevision: 1
        }));
        const first = layer.mount(firstLease, 0);
        const second = layer.mount(secondLease, 1);
        expect(first.ground.slot).toBe(second.ground.slot);
        expect(firstLease.released).toBe(true);
        expect(secondLease.released).toBe(false);
        expect(layer.stats).toMatchObject({
            mountedChunks: 1,
            water: { fullPatches: 1 },
            vegetation: { candidateCount: 0 }
        });
        layer.dispose();
        expect(secondLease.released).toBe(true);
        surface.dispose();
        lighting.dispose();
    });
});
