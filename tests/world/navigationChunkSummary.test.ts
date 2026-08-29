import { describe, expect, test } from "vitest";

import {
    BASE_SEMANTIC_CHUNK_TILE_COUNT,
    createBaseSemanticChunk,
    semanticCatalogLimits,
    semanticTileIndex
} from "../../src/world/BaseSemanticChunk";
import { createEffectiveSemanticChunk } from "../../src/world/EffectiveSemanticChunk";
import {
    NavigationMovementProfile,
    assertNavigationChunkSummary,
    compileNavigationChunkSummary,
    navigationChunkSummaryResidentBytes
} from "../../src/world/NavigationChunkSummary";
import { createNavigationOverrideSection } from "../../src/world/NavigationOverrideSection";
import {
    CORE_WORLD_SEMANTICS_V2,
    createCoreToroidalWorldDescriptorV2
} from "../../src/world/SemanticCatalogsV2";
import { WorldDescriptorV2, createWorldDescriptorV2, serializeWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { compileSurfaceChunk } from "../../src/world/compileSurfaceChunk";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

const LAND_PROFILE: Readonly<NavigationMovementProfile> = Object.freeze({
    id: "walker/default-v1",
    maximumGroundSlope: 0.75,
    dryCost: 1,
    slopeCostScale: 2,
    oceanCost: null,
    lakeCost: null,
    riverCost: null
});

function staticDescriptor(width = 32, height = 32): WorldDescriptorV2 {
    return createWorldDescriptorV2({
        ...CORE_WORLD_SEMANTICS_V2,
        sourceKind: "static",
        sourceContentHash: `sha256:${"1".repeat(64)}`,
        width,
        height
    });
}

function effectiveSemantic(descriptor: WorldDescriptorV2) {
    const biomeWeights = new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 4);
    const macroHeight = new Uint16Array(BASE_SEMANTIC_CHUNK_TILE_COUNT);
    const maxXExclusive = descriptor.sourceKind === "procedural-infinite"
        ? 32 : Math.min(32, descriptor.width);
    const maxYExclusive = descriptor.sourceKind === "procedural-infinite"
        ? 32 : Math.min(32, descriptor.height);
    for (let localX = 0; localX < maxXExclusive; localX += 1) {
        for (let localY = 0; localY < maxYExclusive; localY += 1) {
            const index = semanticTileIndex(localX, localY);
            biomeWeights[index * 4] = 255;
            macroHeight[index] = 40_000;
        }
    }
    const base = createBaseSemanticChunk({
        key: { chunkX: 0, chunkY: 0 },
        revision: 0,
        validBounds: { minX: 0, minY: 0, maxXExclusive, maxYExclusive },
        substrateClass: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
        macroHeight,
        biomeWeights,
        climate: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT * 2),
        vegetationDensity: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT),
        vegetationProfile: new Uint8Array(BASE_SEMANTIC_CHUNK_TILE_COUNT)
    }, semanticCatalogLimits(descriptor));
    return createEffectiveSemanticChunk({ descriptor, base, effectiveRevision: 0 });
}

function surfaces(descriptor: WorldDescriptorV2, macroHeight: number) {
    const worldIdentity = serializeWorldDescriptorV2(descriptor);
    const domain = descriptor.sourceKind === "procedural-infinite"
        ? { topology: "infinite" as const }
        : { topology: descriptor.topology, width: descriptor.width, height: descriptor.height } as const;
    const hydrologyRegions = descriptor.sourceKind === "procedural-infinite" ? undefined : [{
        key: { regionX: 0, regionY: 0 },
        topology: descriptor.topology,
        validBounds: {
            minX: 0 as const,
            minY: 0 as const,
            maxXExclusive: Math.min(128, descriptor.width),
            maxYExclusive: Math.min(128, descriptor.height)
        },
        baseRevision: 0,
        suppressedBaseFeatureIds: Object.freeze([]),
        boundaryPorts: Object.freeze([]),
        rivers: Object.freeze([]),
        lakes: Object.freeze([]),
        mouths: Object.freeze([]),
        bodies: Object.freeze([])
    }] as const;
    const keys = [
        { renderChunkX: 0, renderChunkY: 0 },
        { renderChunkX: 0, renderChunkY: 1 },
        { renderChunkX: 1, renderChunkY: 0 },
        { renderChunkX: 1, renderChunkY: 1 }
    ].filter(key => descriptor.sourceKind === "procedural-infinite"
        || key.renderChunkX * 16 < descriptor.width
        && key.renderChunkY * 16 < descriptor.height);
    return keys.map(key => compileSurfaceChunk(createSurfaceCompilerTestWindow({
        worldIdentity,
        ...key,
        seaLevel: descriptor.seaLevel,
        domain,
        ...(hydrologyRegions ? { hydrologyRegions } : {}),
        tileIsValid: (x, y) => descriptor.sourceKind === "procedural-infinite"
            || x >= 0 && x < descriptor.width && y >= 0 && y < descriptor.height,
        macroHeight: () => macroHeight,
        hexSize: 2,
        heightScale: 10
    })));
}

function barrierOverride(descriptor: WorldDescriptorV2) {
    const indices = new Uint16Array(32);
    for (let y = 0; y < 32; y += 1) indices[y] = semanticTileIndex(15, y);
    return createNavigationOverrideSection({
        worldIdentity: serializeWorldDescriptorV2(descriptor),
        key: { chunkX: 0, chunkY: 0 },
        revision: 1,
        tileIndex: indices,
        traversalCostQ8: new Uint16Array(32)
    });
}

describe("NavigationChunkSummary", () => {
    test("compiles one finite 32 by 32 land component without GPU or exterior portals", () => {
        const descriptor = staticDescriptor();
        const summary = compileNavigationChunkSummary({
            descriptor,
            semantic: effectiveSemantic(descriptor),
            surfaces: surfaces(descriptor, 40_000),
            profile: LAND_PROFILE
        });
        expect(summary.componentCount).toBe(1);
        expect(summary.valid.every(value => value === 1)).toBe(true);
        expect(summary.traversalCostQ8.every(value => value === 256)).toBe(true);
        expect(summary.component.every(value => value === 1)).toBe(true);
        expect(summary.portalTileIndex).toHaveLength(0);
        expect(summary.overrideRevision).toBe(0);
        expect(navigationChunkSummaryResidentBytes(summary)).toBeGreaterThan(5_000);
        expect(() => assertNavigationChunkSummary(summary)).not.toThrow();
    });

    test("loads only the exact surface quadrants required by a partial finite chunk", () => {
        const descriptor = staticDescriptor(13, 20);
        const summary = compileNavigationChunkSummary({
            descriptor,
            semantic: effectiveSemantic(descriptor),
            surfaces: surfaces(descriptor, 40_000),
            profile: LAND_PROFILE
        });
        expect(summary.surfaceDependencies).toHaveLength(2);
        expect(summary.valid.reduce((count, value) => count + value, 0)).toBe(260);
        expect(summary.componentCount).toBe(1);
        expect(summary.portalTileIndex).toHaveLength(0);
        expect(summary.traversalCostQ8[semanticTileIndex(12, 19)]).toBe(256);
        expect(summary.traversalCostQ8[semanticTileIndex(13, 19)]).toBe(0);
        expect(() => assertNavigationChunkSummary(summary)).not.toThrow();
    });

    test("applies a sparse absolute override and labels disconnected components deterministically", () => {
        const descriptor = staticDescriptor();
        const summary = compileNavigationChunkSummary({
            descriptor,
            semantic: effectiveSemantic(descriptor),
            surfaces: surfaces(descriptor, 40_000),
            profile: LAND_PROFILE,
            override: barrierOverride(descriptor)
        });
        expect(summary.componentCount).toBe(2);
        for (let y = 0; y < 32; y += 1) {
            const barrier = semanticTileIndex(15, y);
            expect(summary.traversalCostQ8[barrier]).toBe(0);
            expect(summary.component[barrier]).toBe(0);
        }
        expect(summary.component[semanticTileIndex(0, 0)]).toBe(1);
        expect(summary.component[semanticTileIndex(31, 31)]).toBe(2);
        expect(summary.overrideRevision).toBe(1);
    });

    test("treats a one-chunk toroidal seam as internal connectivity", () => {
        const descriptor = createCoreToroidalWorldDescriptorV2("navigation-wrap", 32, 32);
        const summary = compileNavigationChunkSummary({
            descriptor,
            semantic: effectiveSemantic(descriptor),
            surfaces: surfaces(descriptor, 40_000),
            profile: LAND_PROFILE,
            override: barrierOverride(descriptor)
        });
        expect(summary.componentCount).toBe(1);
        expect(summary.portalTileIndex).toHaveLength(0);
        expect(summary.component[semanticTileIndex(0, 0)]).toBe(1);
        expect(summary.component[semanticTileIndex(31, 31)]).toBe(1);
    });

    test("blocks derived ocean for land movement but permits an explicit bridge cost", () => {
        const descriptor = staticDescriptor();
        const bridgeIndex = semanticTileIndex(4, 7);
        const override = createNavigationOverrideSection({
            worldIdentity: serializeWorldDescriptorV2(descriptor),
            key: { chunkX: 0, chunkY: 0 },
            revision: 3,
            tileIndex: new Uint16Array([bridgeIndex]),
            traversalCostQ8: new Uint16Array([640])
        });
        const summary = compileNavigationChunkSummary({
            descriptor,
            semantic: effectiveSemantic(descriptor),
            surfaces: surfaces(descriptor, 10_000),
            profile: LAND_PROFILE,
            override
        });
        expect(summary.traversalCostQ8.filter(value => value !== 0)).toEqual(new Uint16Array([640]));
        expect(summary.componentCount).toBe(1);
        expect(summary.component[bridgeIndex]).toBe(1);
    });

    test("rejects aliased, unordered and mismatched override authority", () => {
        const descriptor = staticDescriptor();
        const shared = new ArrayBuffer(8);
        expect(() => createNavigationOverrideSection({
            worldIdentity: serializeWorldDescriptorV2(descriptor),
            key: { chunkX: 0, chunkY: 0 },
            revision: 1,
            tileIndex: new Uint16Array(shared, 0, 2),
            traversalCostQ8: new Uint16Array(shared, 4, 2)
        })).toThrow(/distinct buffers/);
        expect(() => createNavigationOverrideSection({
            worldIdentity: serializeWorldDescriptorV2(descriptor),
            key: { chunkX: 0, chunkY: 0 },
            revision: 1,
            tileIndex: new Uint16Array([2, 1]),
            traversalCostQ8: new Uint16Array(2)
        })).toThrow(/ascending/);

        const other = staticDescriptor();
        const override = createNavigationOverrideSection({
            worldIdentity: `${serializeWorldDescriptorV2(other)}:foreign`,
            key: { chunkX: 0, chunkY: 0 },
            revision: 1,
            tileIndex: new Uint16Array([0]),
            traversalCostQ8: new Uint16Array([256])
        });
        expect(() => compileNavigationChunkSummary({
            descriptor,
            semantic: effectiveSemantic(descriptor),
            surfaces: surfaces(descriptor, 40_000),
            profile: LAND_PROFILE,
            override
        })).toThrow(/does not match/);
    });
});
